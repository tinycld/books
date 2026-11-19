package books

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// docTypeWriteOff is the doc type of a write-off's sequence and of the entry
// it posts; entry_type_labels.json holds how a reader sees it.
const docTypeWriteOff = "write_off"

const writeOffsCollection = "books_write_offs"

// maxWriteOffMemo is the most characters a write-off's reason holds, as the
// migration's memo field and writeOffSchema (lib/write-off-schema.ts) bound it.
const maxWriteOffMemo = 4000

// Refusal texts of the write-off guards (write-off spec §4.3). PocketBase adds
// the final period to a text without one.
const (
	msgWriteOffStatus = "A write-off is posted when it is made."
	// %s is the invoice's number (invoiceRef).
	msgWriteOffNoBalance = "Invoice %s has no open balance."
	// %s is the invoice's number, then its stored balance (formatMoney).
	msgWriteOffAmount = "The open balance of invoice %s is now %s. Check it and write it off again."
	// %s is the invoice's date (formatDay).
	msgWriteOffDate        = "Date the write-off on or after the invoice date, %s."
	msgWriteOffAccount     = "Choose an active expense account"
	msgWriteOffMemoTooLong = "A reason can have at most 4000 characters"
	msgWriteOffChange      = "A write-off is not changed. Void it and write the invoice off again."
	msgWriteOffDelete      = "A write-off is voided, not deleted."
	// The invoice's void and its correction's post while a posted write-off
	// names it (refuseWrittenOff).
	msgInvoiceWrittenOff = "This invoice is written off. Void the write-off first."
	// The write-offs whose account is an account being deleted, posted or void.
	msgAccountWriteOffOfOne = "This account is the write-off account of 1 write-off and cannot be deleted. Make it inactive instead."
	msgAccountWriteOffOf    = "This account is the write-off account of %d write-offs and cannot be deleted. Make it inactive instead."
)

// writeOffServerFields are the write-off fields only Books writes: a new
// write-off carries none of them. posted_by is not among them: the request
// hook stamps it with the request's user, and a Go caller names the poster.
// The create rule pins them for a person; this check holds for Go and a
// superuser too.
var writeOffServerFields = []string{
	"customer", "number", "sequence", "currency", "entry", "close_override", "posted_at", "voided_by", "voided_at", "sort_key",
}

// voidWriteOffEditable are the only fields a void changes.
var voidWriteOffEditable = map[string]bool{"status": true, "voided_by": true, "voided_at": true}

// writeOffAccountTypes are the account types a write-off may name (Q3).
var writeOffAccountTypes = map[string]bool{"expense": true, "other_expense": true}

// writeOffName is how a refusal and the audit log name a write-off: "Write-off
// 1001". A write-off is numbered when it is made, so it has no draft name.
func writeOffName(r *core.Record) string {
	noun, _, _ := entryNouns(docTypeWriteOff)
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return noun
}

// registerWriteOffGuards binds the write-off guards inside serialized, so no
// other write can commit between a check and the write it allows. A write-off
// is created posted (createWriteOff), moved from posted to void
// (voidWriteOff), and never changed otherwise nor deleted. Its own cash-basis
// rows are written after its create, in the create's transaction: they relate
// to the stored write-off.
func registerWriteOffGuards(app core.App) {
	bindSerializedGuardThen(app, writeOffsCollection, func(tx core.App, stored, r *core.Record) error {
		if stored == nil {
			return createWriteOff(tx, r)
		}
		return updateWriteOff(tx, stored, r)
	}, func(tx core.App, r *core.Record) error {
		return rebuildCashBasisOf(tx, writeOffsCollection, r.Id)
	})
	app.OnRecordDelete(writeOffsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(core.App) error {
			return refuse(msgWriteOffDelete)
		})
	})
	// The poster and the voider are stamped with the request's user; the rules
	// refuse these fields in a person's body. PocketBase drops a hidden field
	// (sort_key) from a person's body, and from RequestInfo's, before the rule
	// and the guard see it, so a body that names a server field is refused
	// here from the request body read again (BindBody rereads it).
	app.OnRecordCreateRequest(writeOffsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		body := map[string]any{}
		if err := e.BindBody(&body); err != nil {
			return e.BadRequestError("Failed to read the submitted data.", err)
		}
		var set []string
		for _, name := range writeOffServerFields {
			if _, ok := body[name]; ok {
				set = append(set, name)
			}
		}
		if err := refuseServerFields(set); err != nil {
			return err
		}
		stampActor(e.Record, "posted_by", e.Auth)
		return e.Next()
	})
	app.OnRecordUpdateRequest(writeOffsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		from, to := e.Record.Original().GetString("status"), e.Record.GetString("status")
		if from != to && to == statusVoid {
			stampActor(e.Record, "voided_by", e.Auth)
		}
		return e.Next()
	})
}

// createWriteOff guards a new write-off and posts it, in the order of spec
// §4.3: it is posted with none of the fields Books writes and takes the books
// currency; its invoice, read again now, is posted with an open balance, and
// the amount is that balance; the date is a real day on or after the invoice's
// date and after the close date unless the poster holds an unexpired
// override; the account is an active expense or other expense account; the
// memo is at most maxWriteOffMemo characters. An inactive customer does not
// block it. An invoice that does not exist is the schema's refusal.
func createWriteOff(tx core.App, r *core.Record) error {
	ensureRecordID(r)
	if r.GetString("status") != statusPosted {
		return refuse(msgWriteOffStatus)
	}
	var set []string
	for _, name := range writeOffServerFields {
		// An empty number field reads "0".
		if v := r.GetString(name); v != "" && v != "0" {
			set = append(set, name)
		}
	}
	if err := refuseServerFields(set); err != nil {
		return err
	}
	if err := stampCurrency(tx, r); err != nil {
		return err
	}
	invoice, err := tx.FindRecordById(invoiceKind.Collection, r.GetString("invoice"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the invoice to write off: %w", err)
	}
	balance := int64(invoice.GetInt("balance"))
	if invoice.GetString("status") != statusPosted || balance <= 0 {
		return refuseField("invoice", msgWriteOffNoBalance, invoiceRef(invoice))
	}
	if int64(r.GetInt("amount")) != balance {
		return refuseField("amount", msgWriteOffAmount, invoiceRef(invoice), formatMoney(balance, invoice.GetString("currency")))
	}
	if err := checkWriteOffDate(tx, invoice, r); err != nil {
		return err
	}
	if err := checkWriteOffAccount(tx, r.GetString("account")); err != nil {
		return err
	}
	if utf8.RuneCountInString(r.GetString("memo")) > maxWriteOffMemo {
		return refuseField("memo", msgWriteOffMemoTooLong)
	}
	return postWriteOff(tx, r, invoice, time.Now())
}

// checkWriteOffDate refuses a date that is no day, a day before the invoice's
// date, and a day on or before the close date when the poster holds no
// unexpired override, each under date. As the ledger's checkClosePeriod does
// for the entry, it records the admitting override in close_override; the
// entry's own post runs the same rule again.
func checkWriteOffDate(tx core.App, invoice, r *core.Record) error {
	day := r.GetString("date")
	if _, err := parseDay(day); err != nil {
		return refuseDocumentDay("date", err)
	}
	if day < invoice.GetString("date") {
		return refuseField("date", msgWriteOffDate, formatDay(invoice.GetString("date")))
	}
	s, err := loadSettings(tx)
	if err != nil {
		return err
	}
	overrideID, closed, err := closeOverrideFor(tx, s, r.GetString("posted_by"), day, time.Now())
	if err != nil {
		return err
	}
	if closed {
		return refuseField("date", msgClosedThrough, s.CloseDate, day)
	}
	r.Set("close_override", overrideID)
	return nil
}

// checkWriteOffAccount refuses an empty account, one that does not exist, an
// inactive one and one of a type other than expense or other expense.
func checkWriteOffAccount(tx core.App, id string) error {
	if id == "" {
		return refuseField("account", msgWriteOffAccount)
	}
	account, err := tx.FindRecordById("books_accounts", id)
	if errors.Is(err, sql.ErrNoRows) {
		return refuseField("account", msgWriteOffAccount)
	}
	if err != nil {
		return fmt.Errorf("books: read the write-off's account: %w", err)
	}
	if account.GetBool("inactive") || !writeOffAccountTypes[account.GetString("type")] {
		return refuseField("account", msgWriteOffAccount)
	}
	return nil
}

// updateWriteOff admits a posted write-off's void, which changes only status,
// voided_by and voided_at (voidWriteOff), and PocketBase clearing posted_by or
// voided_by when that user is deleted (a save that changes nothing passes, as
// a payment's does). Every other change is refused.
func updateWriteOff(tx core.App, stored, r *core.Record) error {
	if stored.GetString("status") == statusPosted && r.GetString("status") == statusVoid {
		if len(changedFields(stored, r, voidWriteOffEditable)) > 0 {
			return refuse(msgWriteOffChange)
		}
		return voidWriteOff(tx, r, time.Now())
	}
	unlinks, err := onlySalesDocUnlinks(tx, stored, r)
	if err != nil {
		return err
	}
	if unlinks {
		return nil
	}
	return refuse(msgWriteOffChange)
}

// refuseWrittenOff refuses a change of an invoice that a posted write-off
// names: its void (invoiceKind.CheckVoid) and its correction's post
// (invoiceKind.Replace). A void write-off does not hold it.
func refuseWrittenOff(tx core.App, invoice *core.Record) error {
	n, err := tx.CountRecords(writeOffsCollection, dbx.HashExp{"invoice": invoice.Id, "status": statusPosted})
	if err != nil {
		return fmt.Errorf("books: count the write-offs of the invoice: %w", err)
	}
	if n > 0 {
		return refuse(msgInvoiceWrittenOff)
	}
	return nil
}

// refuseAccountOfWriteOffs refuses the delete of an account that a write-off
// names, posted or void: the write-off's account is a required relation, so
// PocketBase would refuse with a generic message.
func refuseAccountOfWriteOffs(app core.App, account *core.Record) error {
	n, err := app.CountRecords(writeOffsCollection, dbx.HashExp{"account": account.Id})
	if err != nil {
		return err
	}
	if n == 1 {
		return refuse(msgAccountWriteOffOfOne)
	}
	if n > 1 {
		return refuse(msgAccountWriteOffOf, n)
	}
	return nil
}
