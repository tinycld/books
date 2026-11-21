package books

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// docTypeDeposit is the doc type of a bank deposit's sequence and of the entry
// it posts; entry_type_labels.json holds how a reader sees it.
const docTypeDeposit = "deposit"

const (
	depositsCollection     = "books_deposits"
	depositItemsCollection = "books_deposit_items"
	depositLinesCollection = "books_deposit_lines"
)

// maxDepositItems and maxDepositLines are the most items and other funds
// lines one deposit holds.
const (
	maxDepositItems = 500
	maxDepositLines = 100
)

// Refusal texts of the deposit guards (bank deposit spec §3.7). The texts that
// start with a transaction's or an account's name keep it as written
// (refuseNamed, refuseNamedField). PocketBase adds a final period to a text
// without one; these have theirs.
const (
	msgDepositTooManyItems    = "A deposit holds at most 500 items."
	msgDepositTooManyLines    = "A deposit holds at most 100 other funds lines."
	msgDepositAmountNotZero   = "Enter an amount other than 0."
	msgDepositTotalAboveZero  = "The deposit total must be above $0.00."
	msgDepositItemVoid        = "%s is void."
	msgDepositItemInDeposit   = "%s is already in Deposit %s."
	msgDepositItemAfterDate   = "%s is dated after the deposit date."
	msgDepositItemHeld        = "%s is in Deposit %s. Remove it from the deposit first."
	msgDepositItemNotWaiting  = "%s is not waiting in Undeposited funds."
	msgDepositItemTwice       = "%s is already on this deposit."
	msgDepositItemLineMissing = "Choose a transaction that waits in Undeposited funds."
	msgDepositToRequired      = "Choose a bank account to deposit to."
	msgDepositToInactive      = "%s is inactive. Choose an active account."
	msgDepositLineAccount     = "Choose an account."
	msgDepositLineControl     = "Choose an account other than Accounts receivable or Accounts payable."
	msgDepositLineDepositTo   = "Choose an account other than the Deposit to account."
	msgDepositLineInactive    = "%s is inactive. Choose an active account."
	msgDepositLineNoCustomer  = "Choose a customer that exists."
	msgDepositLineNoVendor    = "Choose a vendor that exists."
	msgDepositEditMissing     = "The deposit being edited does not exist."
	msgDepositOnlyPostedEdits = "Only a posted deposit can be edited."
	msgDepositPostedFixed     = "A posted or void deposit cannot be changed."
	msgDepositRowsFixed       = "The items and lines of a posted or void deposit cannot change."
	// The deposits whose Deposit to is an account being deleted, and the
	// other funds lines on it.
	msgAccountDepositOfOneDeposit = "This account is the deposit account of 1 deposit and cannot be deleted. Make it inactive instead."
	msgAccountDepositOfDeposits   = "This account is the deposit account of %d deposits and cannot be deleted. Make it inactive instead."
	msgAccountOnOneDepositLine    = "This account is on 1 deposit line and cannot be deleted. Make it inactive instead."
	msgAccountOnDepositLines      = "This account is on %d deposit lines and cannot be deleted. Make it inactive instead."
	msgPartyOnDeposits            = "%s is on deposits. Make it inactive instead."
)

// Go-only refusal texts of the deposit: the rules refuse these writes for a
// person first.
const (
	msgDepositPostedFromForm = "A draft deposit is posted from the deposit form."
	msgDepositDeleteNotDraft = "Only a draft deposit can be deleted."
	msgDepositRowStays       = "A deposit's row stays on its deposit."
	msgDepositItemFixed      = "Books writes a deposit item. Remove the item and add it again."
)

// The deposit fields only Books writes. depositNewBooksFields must be empty on
// a new deposit; depositKeptBooksFields cannot change while a person edits a
// draft. posted_by is not kept: a Go caller names the poster with the post, as
// for a received payment. The rules pin them for a person; these checks hold
// for Go and a superuser too.
var (
	depositNewBooksFields = []string{
		"number", "sequence", "total", "items_total", "lines_total", "entry", "replaced_by",
		"posted_at", "posted_by", "voided_at", "voided_by",
	}
	depositKeptBooksFields = []string{
		"number", "sequence", "total", "items_total", "lines_total", "currency", "entry", "replaces",
		"replaced_by", "posted_at", "voided_at", "voided_by",
	}
)

// Tx marks (txmarks.go): depositReplacingMark is set while a correction's post
// sets its original void with replaced_by; depositItemsMark while Books writes
// a deposit's items (the post, a release).
const (
	depositReplacingMark = "deposit.replacing"
	depositItemsMark     = "deposit.items"
)

// depositName is how a refusal, search and the audit log name a deposit:
// "Deposit 1004", or "Draft deposit" while it has no number.
func depositName(r *core.Record) string {
	noun, _, draft := entryNouns(docTypeDeposit)
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return draft
}

// depositSources are the collections an item's payment method and reference
// no. are read from, by the doc type of the item's entry.
var depositSources = map[string]string{
	docTypePayment:       paymentsCollection,
	docTypeSalesReceipt:  "books_sales_receipts",
	docTypeVendorRefund:  vendorRefundsCollection,
	docTypeRefundReceipt: "books_refund_receipts",
}

// registerDepositGuards binds the deposit, item and line guards inside
// serialized, so no other write can commit between a check and the write it
// allows. A deposit's lifecycle is a received payment's: a draft is edited and
// posted (postDeposit), a posted deposit is voided (voidDeposit) or replaced
// by its correction's post, and a draft alone is deleted. Its items and lines
// change only while it is a draft.
func registerDepositGuards(app core.App) {
	bindSerializedGuard(app, depositsCollection, func(tx core.App, stored, r *core.Record) error {
		if stored == nil {
			return createDeposit(tx, r)
		}
		return transitionDeposit(tx, stored, r, time.Now())
	})
	app.OnRecordDelete(depositsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			stored, err := tx.FindRecordById(depositsCollection, e.Record.Id)
			if err != nil {
				return err
			}
			if stored.GetString("status") != statusDraft {
				return refuse(msgDepositDeleteNotDraft)
			}
			return nil
		})
	})
	// A person's post or void is stamped with who did it, on the transition
	// only; the update rule refuses these fields in a person's body.
	app.OnRecordUpdateRequest(depositsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		from, to := e.Record.Original().GetString("status"), e.Record.GetString("status")
		if from != to {
			switch to {
			case statusPosted:
				stampActor(e.Record, "posted_by", e.Auth)
			case statusVoid:
				stampActor(e.Record, "voided_by", e.Auth)
			}
		}
		return e.Next()
	})

	bindSerializedGuard(app, depositItemsCollection, validateDepositItem)
	bindSerializedGuard(app, depositLinesCollection, validateDepositLine)
	for _, collection := range []string{depositItemsCollection, depositLinesCollection} {
		app.OnRecordDelete(collection).BindFunc(func(e *core.RecordEvent) error {
			return serialized(e, func(tx core.App) error {
				// A draft deposit's delete cascades its rows after the deposit row
				// is gone: nothing is left to hold them.
				deposit, err := tx.FindRecordById(depositsCollection, e.Record.GetString("deposit"))
				if errors.Is(err, sql.ErrNoRows) {
					return nil
				}
				if err != nil {
					return fmt.Errorf("books: read the row's deposit: %w", err)
				}
				if deposit.GetString("status") != statusDraft {
					return refuse(msgDepositRowsFixed)
				}
				return nil
			})
		})
	}
}

// createDeposit guards a new deposit: it starts as a draft with none of the
// fields Books writes, takes the books currency, and passes the header guards.
func createDeposit(tx core.App, r *core.Record) error {
	ensureRecordID(r)
	if r.GetString("status") != statusDraft {
		return refuse(msgDepositPostedFromForm)
	}
	var set []string
	for _, name := range depositNewBooksFields {
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
	return checkDepositHeader(tx, nil, r)
}

// voidDepositEditable are the only fields a void changes on a posted deposit;
// replaceDepositEditable the only fields a correction's post changes on the
// deposit it replaces.
var (
	voidDepositEditable    = map[string]bool{"status": true, "voided_by": true, "voided_at": true}
	replaceDepositEditable = map[string]bool{"status": true, "voided_by": true, "voided_at": true, "replaced_by": true}
)

// transitionDeposit is the deposit's lifecycle. stored is the row before the
// update. A posted deposit changes only to void, and a void one never, except
// for a link PocketBase clears because its row is gone.
func transitionDeposit(tx core.App, stored, r *core.Record, now time.Time) error {
	from, to := stored.GetString("status"), r.GetString("status")
	switch {
	case from == statusDraft && to == statusDraft:
		if err := checkDepositBooksFieldsKept(stored, r); err != nil {
			return err
		}
		return checkDepositHeader(tx, stored, r)
	case from == statusDraft && to == statusPosted:
		if err := checkDepositBooksFieldsKept(stored, r); err != nil {
			return err
		}
		if err := checkDepositHeader(tx, stored, r); err != nil {
			return err
		}
		return postDeposit(tx, r, now)
	case from == statusPosted && to == statusVoid && hasTxMark(tx, depositReplacingMark, r.Id):
		if len(changedFields(stored, r, replaceDepositEditable)) > 0 {
			return refuse(msgDepositPostedFixed)
		}
		return nil
	case from == statusPosted && to == statusVoid:
		if len(changedFields(stored, r, voidDepositEditable)) > 0 {
			return refuse(msgDepositPostedFixed)
		}
		return voidDeposit(tx, r, now)
	case from == to:
		unlinks, err := onlySalesDocUnlinks(tx, stored, r)
		if err != nil || unlinks {
			return err
		}
		return refuse(msgDepositPostedFixed)
	case from != statusDraft:
		return refuse(msgDepositPostedFixed)
	}
	return refuse(msgSalesDocCannotGo, depositName(stored), from, to)
}

func checkDepositBooksFieldsKept(stored, r *core.Record) error {
	var changed []string
	for _, name := range depositKeptBooksFields {
		if stored.GetString(name) != r.GetString(name) {
			changed = append(changed, name)
		}
	}
	return refuseServerFields(changed)
}

// checkDepositHeader runs the header guards of a draft write and sets the sort
// key: a correction names a posted deposit; the date is a real day when the
// write sets it; a Deposit to the write sets is an active bank account. Post
// checks Deposit to again (postDeposit). stored is the row before an update,
// nil on a create.
func checkDepositHeader(tx core.App, stored, r *core.Record) error {
	if _, err := correctedDeposit(tx, r); err != nil {
		return err
	}
	if day := r.GetString("date"); stored == nil || stored.GetString("date") != day {
		if _, err := parseDay(day); err != nil {
			return refuseDocumentDay("date", err)
		}
	}
	if account := r.GetString("deposit_to"); stored == nil || stored.GetString("deposit_to") != account {
		if _, err := checkDepositTo(tx, r); err != nil {
			return err
		}
	}
	r.Set("sort_key", salesDocSortKey(r))
	return nil
}

// checkDepositTo reads r's Deposit to account and refuses, under deposit_to,
// one that is missing, is not of type bank, or is inactive ("1000 Business
// Checking is inactive. Choose an active account."). The schema would refuse a
// missing account too, but with no text that names the field's rule.
func checkDepositTo(tx core.App, r *core.Record) (*core.Record, error) {
	id := r.GetString("deposit_to")
	if id == "" {
		return nil, refuseField("deposit_to", msgDepositToRequired)
	}
	account, err := tx.FindRecordById("books_accounts", id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, refuseField("deposit_to", msgDepositToRequired)
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the deposit's Deposit to account: %w", err)
	}
	if account.GetString("type") != "bank" {
		return nil, refuseField("deposit_to", msgDepositToRequired)
	}
	if account.GetBool("inactive") {
		return nil, refuseNamedField("deposit_to", msgDepositToInactive, accountDisplayName(account))
	}
	return account, nil
}

// depositOfRow reads the deposit a row names and refuses a row of a deposit
// that is not a draft. A deposit that does not exist gives nil with no
// refusal: the schema refuses the row (deposit is a required relation).
func depositOfRow(tx core.App, stored, r *core.Record) (*core.Record, error) {
	id := r.GetString("deposit")
	if stored != nil && stored.GetString("deposit") != id {
		return nil, refuseField("deposit", msgDepositRowStays)
	}
	deposit, err := tx.FindRecordById(depositsCollection, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the row's deposit: %w", err)
	}
	if deposit.GetString("status") != statusDraft {
		return nil, refuse(msgDepositRowsFixed)
	}
	return deposit, nil
}

// depositRowRank is r's 0-based rank among its deposit's rows of collection in
// position order (id breaks a tie), r included: the n of a refusal key
// items.<n> or lines.<n>.<field>, which the client's arrays share.
//
// The rank is counted from the rows stored when r is written, so it agrees
// with the client's row index only because the client writes the removes
// first, then the updates by position, then the inserts by position, one at a
// time (tableWriteSteps and tablesWriteSteps, tinycld/books/lib/table-writes.ts).
// A client that wrote in another order would get a key for a different row.
func depositRowRank(tx core.App, collection string, r *core.Record) (int, error) {
	var n int
	err := tx.DB().NewQuery("SELECT COUNT(*) FROM " + collection +
		" WHERE deposit = {:deposit} AND id != {:id} AND (position < {:position} OR (position = {:position} AND id < {:id}))").
		Bind(dbx.Params{"deposit": r.GetString("deposit"), "id": r.Id, "position": r.GetInt("position")}).Row(&n)
	if err != nil {
		return 0, fmt.Errorf("books: rank the deposit's row: %w", err)
	}
	return n, nil
}

// validateDepositItem guards one item write. A person creates an item and
// never updates one (the update rule is null); Books updates the items it
// posts or releases (depositItemsMark). On a create: the deposit is a draft
// that holds fewer than maxDepositItems, and the item's line is an
// undeposited item (checkDepositItemLine) that the deposit does not hold yet;
// then Books copies the line onto the item. Whether a posted deposit holds the
// line, and its date, are checked when the deposit posts. stored is the row
// before an update, nil on a create.
func validateDepositItem(tx core.App, stored, r *core.Record) error {
	if stored != nil && hasTxMark(tx, depositItemsMark, r.GetString("deposit")) {
		return nil
	}
	deposit, err := depositOfRow(tx, stored, r)
	if err != nil || deposit == nil {
		return err
	}
	if stored != nil {
		return refuse(msgDepositItemFixed)
	}
	ensureRecordID(r)
	n, err := tx.CountRecords(depositItemsCollection, dbx.HashExp{"deposit": deposit.Id})
	if err != nil {
		return fmt.Errorf("books: count the deposit's items: %w", err)
	}
	if n >= maxDepositItems {
		return refuse(msgDepositTooManyItems)
	}
	rank, err := depositRowRank(tx, depositItemsCollection, r)
	if err != nil {
		return err
	}
	field := fmt.Sprintf("items.%d", rank)
	line, entry, err := checkDepositItemLine(tx, field, r.GetString("line"))
	if err != nil {
		return err
	}
	twice, err := tx.CountRecords(depositItemsCollection,
		dbx.HashExp{"deposit": deposit.Id, "line": line.Id}, dbx.Not(dbx.HashExp{"id": r.Id}))
	if err != nil {
		return fmt.Errorf("books: count the deposit's items: %w", err)
	}
	if twice > 0 {
		return refuseNamedField(field, msgDepositItemTwice, entryName(entry))
	}
	r.Set("posted", false)
	return copyDepositItem(tx, r, line, entry)
}

// checkDepositItemLine reads an item's line and its entry and refuses, under
// field, a line that is not an undeposited item: a line that is not posted, is
// not on an Undeposited funds account, or belongs to a deposit's own entry
// ("Deposit 1001 is not waiting in Undeposited funds."), and a line whose
// entry is not posted or is a void reversal ("Journal entry 3 is void."). The
// undeposited items view leaves the same lines out.
func checkDepositItemLine(tx core.App, field, lineID string) (line, entry *core.Record, err error) {
	if lineID == "" {
		return nil, nil, refuseField(field, msgDepositItemLineMissing)
	}
	line, err = tx.FindRecordById("books_journal_lines", lineID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, refuseField(field, msgDepositItemLineMissing)
	}
	if err != nil {
		return nil, nil, fmt.Errorf("books: read the item's line: %w", err)
	}
	entry, err = tx.FindRecordById("books_journal_entries", line.GetString("entry"))
	if err != nil {
		return nil, nil, fmt.Errorf("books: read the item's journal entry: %w", err)
	}
	if entry.GetString("status") != statusPosted || entry.GetString("origin") == originVoidReversal {
		return nil, nil, refuseNamedField(field, msgDepositItemVoid, entryName(entry))
	}
	account, err := tx.FindRecordById("books_accounts", line.GetString("account"))
	if err != nil {
		return nil, nil, fmt.Errorf("books: read the item's account: %w", err)
	}
	if !line.GetBool("posted") || account.GetString("detail_type") != "undeposited_funds" ||
		entry.GetString("doc_type") == docTypeDeposit {
		return nil, nil, refuseNamedField(field, msgDepositItemNotWaiting, entryName(entry))
	}
	return line, entry, nil
}

// copyDepositItem writes the item's copy of its line (account, party, amount
// as debit - credit), of the line's entry (the entry, its date, doc type,
// number and document) and of the entry's source document (payment method and
// reference no.; none for a journal entry or a transfer).
func copyDepositItem(tx core.App, item, line, entry *core.Record) error {
	item.Set("entry", entry.Id)
	item.Set("account", line.GetString("account"))
	item.Set("customer", line.GetString("customer"))
	item.Set("vendor", line.GetString("vendor"))
	item.Set("amount", int64(line.GetInt("debit"))-int64(line.GetInt("credit")))
	item.Set("date", entry.GetString("date"))
	item.Set("doc_type", entry.GetString("doc_type"))
	item.Set("number", entry.GetString("number"))
	item.Set("document", entry.GetString("document"))
	method, reference := "", ""
	if collection, ok := depositSources[entry.GetString("doc_type")]; ok && entry.GetString("document") != "" {
		source, err := tx.FindRecordById(collection, entry.GetString("document"))
		switch {
		case err == nil:
			method, reference = source.GetString("payment_method"), source.GetString("reference_no")
		case !errors.Is(err, sql.ErrNoRows):
			return fmt.Errorf("books: read the item's source document: %w", err)
		}
	}
	item.Set("payment_method", method)
	item.Set("reference_no", reference)
	return nil
}

// validateDepositLine guards one other funds line write: it stays on its
// deposit, which is a draft that holds at most maxDepositLines; then
// checkDepositLineFields. stored is the row before an update, nil on a create.
func validateDepositLine(tx core.App, stored, r *core.Record) error {
	deposit, err := depositOfRow(tx, stored, r)
	if err != nil || deposit == nil {
		return err
	}
	if stored == nil {
		ensureRecordID(r)
		n, err := tx.CountRecords(depositLinesCollection, dbx.HashExp{"deposit": deposit.Id})
		if err != nil {
			return fmt.Errorf("books: count the deposit's lines: %w", err)
		}
		if n >= maxDepositLines {
			return refuse(msgDepositTooManyLines)
		}
	}
	rank, err := depositRowRank(tx, depositLinesCollection, r)
	if err != nil {
		return err
	}
	return checkDepositLineFields(tx, deposit, r, rank)
}

// checkDepositLineFields refuses, keyed lines.<rank>.<field>, an other funds
// line whose account is missing, inactive, Accounts receivable, Accounts
// payable or the deposit's Deposit to; whose amount is 0 or beyond the stored
// limit; or whose customer or vendor is missing, or that names both. The
// posting checks every line again with it, since Deposit to may have changed
// since the line was saved.
func checkDepositLineFields(tx core.App, deposit, l *core.Record, rank int) error {
	key := func(field string) string { return fmt.Sprintf("lines.%d.%s", rank, field) }
	account, err := depositLineAccount(tx, l.GetString("account"))
	if err != nil {
		return err
	}
	switch {
	case account == nil:
		return refuseField(key("account"), msgDepositLineAccount)
	case account.GetString("type") == "accounts_receivable" || account.GetString("type") == "accounts_payable":
		return refuseField(key("account"), msgDepositLineControl)
	case account.Id == deposit.GetString("deposit_to"):
		return refuseField(key("account"), msgDepositLineDepositTo)
	case account.GetBool("inactive"):
		return refuseNamedField(key("account"), msgDepositLineInactive, accountDisplayName(account))
	}
	amount := l.GetFloat("amount")
	if amount == 0 {
		return refuseField(key("amount"), msgDepositAmountNotZero)
	}
	if amount > maxStoredAmount || amount < -maxStoredAmount {
		return refuseField(key("amount"), msgPaymentAmountTooLarge)
	}
	customer, vendor := l.GetString("customer"), l.GetString("vendor")
	if customer != "" && vendor != "" {
		return refuseField(key("customer"), msgLineBothParties)
	}
	for _, p := range []struct{ field, collection, id, msg string }{
		{"customer", "books_customers", customer, msgDepositLineNoCustomer},
		{"vendor", "books_vendors", vendor, msgDepositLineNoVendor},
	} {
		if p.id == "" {
			continue
		}
		_, err := tx.FindRecordById(p.collection, p.id)
		if errors.Is(err, sql.ErrNoRows) {
			return refuseField(key(p.field), "%s", p.msg)
		}
		if err != nil {
			return fmt.Errorf("books: read the line's %s: %w", p.field, err)
		}
	}
	return nil
}

// depositLineAccount reads an other funds line's account; nil when it is empty
// or missing.
func depositLineAccount(tx core.App, id string) (*core.Record, error) {
	if id == "" {
		return nil, nil
	}
	account, err := tx.FindRecordById("books_accounts", id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the line's account: %w", err)
	}
	return account, nil
}

// refuseAccountOnDeposits refuses the delete of an account that is the
// Deposit to of a deposit, or the account of an other funds line, drafts
// included. Both are required relations, so PocketBase would refuse the
// delete with a generic message; these say what to do instead.
func refuseAccountOnDeposits(app core.App, account *core.Record) error {
	deposits, err := app.CountRecords(depositsCollection, dbx.HashExp{"deposit_to": account.Id})
	if err != nil {
		return err
	}
	if deposits == 1 {
		return refuse(msgAccountDepositOfOneDeposit)
	}
	if deposits > 1 {
		return refuse(msgAccountDepositOfDeposits, deposits)
	}
	lines, err := app.CountRecords(depositLinesCollection, dbx.HashExp{"account": account.Id})
	if err != nil {
		return err
	}
	if lines == 1 {
		return refuse(msgAccountOnOneDepositLine)
	}
	if lines > 1 {
		return refuse(msgAccountOnDepositLines, lines)
	}
	return nil
}

// refusePartyOnDeposits refuses the delete of a customer or vendor (field) that
// an other funds line names, drafts included.
func refusePartyOnDeposits(tx core.App, field string, party *core.Record) error {
	n, err := tx.CountRecords(depositLinesCollection, dbx.HashExp{field: party.Id})
	if err != nil {
		return fmt.Errorf("books: count the deposit lines of %s %s: %w", field, party.Id, err)
	}
	if n > 0 {
		return refuseNamed(msgPartyOnDeposits, party.GetString("display_name"))
	}
	return nil
}
