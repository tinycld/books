package books

import (
	"database/sql"
	"errors"
	"fmt"
	"sync"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Refusal texts of a line's customer or vendor (its Name). %s is the party's
// display name. tinycld/books/lib/entry-messages.ts copies them;
// tests/entry-messages.test.ts fails when this wording drifts.
const (
	msgLineBothParties   = "A line can name a customer or a vendor, not both."
	msgLinePartyInactive = "%s is inactive. Choose an active customer or vendor."
	msgPartyOnLines      = "%s is on journal lines. Make it inactive instead."
)

// checkLineParty checks the customer or vendor a line names. stored is the
// line before an update, nil on a create. A line names at most one party, and
// a party the write sets or changes must be active: a line keeps a party that
// became inactive after it was saved. A replacement draft (Edit of a posted
// entry) writes new lines, so a new line there may keep an inactive party that
// a line of the replaced entry names; the user did not choose it again. Books
// writes the lines of a reversal, copied from posted lines, so their party is
// not checked for inactive (an inactive party must not block a void), and nor
// are a bill payment's (only its post writes them, and an inactive vendor's
// posted bills still get paid, pay-bills spec §4.2), nor a write-off's (only
// its post writes them, and an inactive customer does not block a write-off,
// write-off spec §4.3); a line that names both is
// refused first, on any entry. A party id that is no record is left to
// PocketBase's relation validation.
func checkLineParty(tx core.App, stored, line *core.Record) error {
	customer, vendor := line.GetString("customer"), line.GetString("vendor")
	if customer == "" && vendor == "" {
		return nil
	}
	if customer != "" && vendor != "" {
		return refuse(msgLineBothParties)
	}
	entry, err := tx.FindRecordById("books_journal_entries", line.GetString("entry"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if entry.GetString("reverses") != "" || entry.GetString("doc_type") == docTypeBillPayment ||
		entry.GetString("doc_type") == docTypeWriteOff {
		return nil
	}
	field, collection, id := "customer", "books_customers", customer
	if vendor != "" {
		field, collection, id = "vendor", "books_vendors", vendor
	}
	if stored != nil && stored.GetString(field) == id {
		return nil
	}
	party, err := tx.FindRecordById(collection, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the line's %s: %w", field, err)
	}
	if !party.GetBool("inactive") {
		return nil
	}
	if replaced := entry.GetString("replaces"); replaced != "" {
		kept, err := tx.CountRecords("books_journal_lines", dbx.HashExp{"entry": replaced, field: id})
		if err != nil {
			return err
		}
		if kept > 0 {
			return nil
		}
	}
	// The message starts with a name people typed: refuseNamed keeps its case.
	return refuseNamed(msgLinePartyInactive, party.GetString("display_name"))
}

// partyOnLines reports whether any journal line, draft or posted, names the
// record id in field ("customer" or "vendor").
func partyOnLines(tx core.App, field, id string) (bool, error) {
	n, err := tx.CountRecords("books_journal_lines", dbx.HashExp{field: id})
	if err != nil {
		return false, fmt.Errorf("books: count the journal lines of %s %s: %w", field, id, err)
	}
	return n > 0, nil
}

// refusePartyOnLines refuses to delete a customer or vendor that a journal
// line names. PocketBase would otherwise blank the line's optional relation on
// delete, and the line would lose its name silently.
func refusePartyOnLines(tx core.App, field string, party *core.Record) error {
	named, err := partyOnLines(tx, field, party.Id)
	if err != nil {
		return err
	}
	if named {
		return refuseNamed(msgPartyOnLines, party.GetString("display_name"))
	}
	return nil
}

func registerLineHooks(app core.App) {
	app.OnRecordCreate("books_journal_lines").BindFunc(func(e *core.RecordEvent) error {
		if err := stampCurrency(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	})
}

// Refusals of a write to a field of a line that only Books writes.
const (
	msgLineStampByBooks  = "Books sets a line's posted flag and date when it posts the entry."
	msgLineCurrencyFixed = "A line's currency cannot change."
	msgLineCopyByBooks   = "Books copies a line's card payment mark and document type from its journal entry."
)

// entryCopyFields are the fields of its entry that a journal line and a
// cash-basis row hold a copy of, so a report reads them from the row with no
// read of the entry (1099 report spec §11 Q21). Each is the same field on the
// entry.
var entryCopyFields = []string{"card_payment", "doc_type"}

// stampEntryCopies gives a new line its entry's card mark and doc type, over
// whatever the caller set: a blank or false copy cannot be told from one that
// was not set, so a create is corrected, never refused. entry is the line's
// entry as the guard read it, nil when it is gone (PocketBase's relation
// validation refuses the line next).
func stampEntryCopies(line, entry *core.Record) {
	if entry == nil {
		return
	}
	for _, name := range entryCopyFields {
		line.Set(name, entry.Get(name))
	}
}

// checkLineCopies refuses an update that changes a line's copy to a value
// other than its entry's. Books moves the copies only to follow its entry
// (copyEntryToRows, after the entry's own write), so the stored entry already
// holds the new value then. The update rule pins these fields for a person;
// this holds for Go and a superuser too. entry is the stored entry, nil when
// it is gone.
func checkLineCopies(stored, line, entry *core.Record) error {
	if entry == nil {
		return nil
	}
	for _, name := range entryCopyFields {
		if line.GetString(name) != stored.GetString(name) && line.GetString(name) != entry.GetString(name) {
			return refuse(msgLineCopyByBooks)
		}
	}
	return nil
}

// entryCopiesChanged reports whether an entry update changes a field its rows
// hold a copy of.
func entryCopiesChanged(stored, next *core.Record) bool {
	for _, name := range entryCopyFields {
		if stored.GetString(name) != next.GetString(name) {
			return true
		}
	}
	return false
}

// copyEntryToRows writes the entry's card mark and doc type to each of its
// journal lines and each cash-basis row whose entry it is, in the entry
// update's transaction, after the entry's own write (so the line guard reads
// the new values on the stored entry). A row that holds them already is not
// written. Cash-basis rows exist only for a posted entry, and transitionEntry
// (entries.go) refuses every change to a posted entry, so today the cash loop
// finds no row to write; it keeps the cash rows right if a later own write
// changes a posted entry's card mark or doc type.
func copyEntryToRows(tx core.App, entry *core.Record) error {
	for _, collection := range []string{"books_journal_lines", cashLinesCollection} {
		rows, err := tx.FindAllRecords(collection, dbx.HashExp{"entry": entry.Id})
		if err != nil {
			return fmt.Errorf("books: read the %s rows of %s: %w", collection, entry.Id, err)
		}
		for _, r := range rows {
			if !entryCopiesChanged(r, entry) {
				continue
			}
			for _, name := range entryCopyFields {
				r.Set(name, entry.Get(name))
			}
			if err := tx.Save(r); err != nil {
				return fmt.Errorf("books: copy the entry's card mark and doc type to %s %s: %w", collection, r.Id, err)
			}
		}
	}
	return nil
}

// checkLineStamp keeps a line's posting stamp and currency Books' own. The
// posted flag and the date say that the line is in the ledger and on which
// day; every report and register selects lines by them, and the month rows
// are written from the entry, so a stamp that disagrees with the entry shows
// in one and not the other. Only stampPosted writes them, under its mark. The
// update rule pins these fields for a person; this holds for Go and a
// superuser too. stored is the line before an update, nil on a create (a new
// line starts unstamped; its currency is stampCurrency's).
func checkLineStamp(tx core.App, stored, line *core.Record) error {
	if stored != nil && stored.GetString("currency") != line.GetString("currency") {
		return refuse(msgLineCurrencyFixed)
	}
	wasPosted, wasDate := false, ""
	if stored != nil {
		wasPosted, wasDate = stored.GetBool("posted"), stored.GetString("date")
	}
	if line.GetBool("posted") == wasPosted && line.GetString("date") == wasDate {
		return nil
	}
	if isPosting(tx, line.GetString("entry")) {
		return nil
	}
	return refuse(msgLineStampByBooks)
}

// serializedLine is serialized for a line write: after the write succeeds,
// the entry's draft total and revision follow it before the transaction
// commits (touchDraft).
// check returns the line's entry as requireDraftEntry read it, nil when the
// entry is gone.
func serializedLine(e *core.RecordEvent, check func(tx core.App) (entry *core.Record, err error)) error {
	original := e.App
	defer func() { e.App = original }()
	return original.RunInTransaction(func(tx core.App) error {
		e.App = tx
		entry, err := check(tx)
		if err != nil {
			return err
		}
		if err := e.Next(); err != nil {
			return err
		}
		touchDraft(tx, e.Record, entry)
		return nil
	})
}

// draftDebitSum is the sum of the debits of an entry's lines, held at
// maxStoredAmount. An unbalanced draft shows its debits. A sum past the
// largest storable amount is stored as that amount, because a draft may be
// over the limit while it is edited; posting refuses it with the real figure.
//
// SQLite sums the column: a transaction of one line write on a large draft
// then reads no line into Go. TOTAL is a float sum, which cannot overflow as
// SUM can; it is exact up to maxStoredAmount, and past it the cap is stored.
func draftDebitSum(app core.App, entryID string) (int, error) {
	var row struct {
		Sum int `db:"sum"`
	}
	err := app.DB().NewQuery(`
		SELECT CAST(MIN(TOTAL(debit), {:cap}) AS INTEGER) AS sum
		FROM books_journal_lines
		WHERE entry = {:entry}`).
		Bind(dbx.Params{"entry": entryID, "cap": maxStoredAmount}).One(&row)
	if err != nil {
		return 0, fmt.Errorf("books: sum the debits of %s: %w", entryID, err)
	}
	return row.Sum, nil
}

// pendingRestates holds the entries a transaction must restate before it
// commits: touchKey → true.
var pendingRestates sync.Map

// touchDraft records a line write on its entry: the transaction restates the
// entry one time before it commits (restateDraft), however many of its lines
// it wrote. A save of N lines would otherwise save the entry N times. entry
// is the line's draft entry as the guard read it before the write, nil when
// it is gone (cascade delete). touchDraft does nothing then, for a reversal,
// and when the line is being stamped by a post: Books owns those totals and
// stamps them itself at post.
func touchDraft(tx core.App, line, entry *core.Record) {
	if entry == nil || line.GetBool("posted") || entry.GetString("reverses") != "" {
		return
	}
	info := tx.TxInfo()
	// The base is the revision before the transaction's first write to the
	// entry, so it is recorded now, not at the restate.
	draftBase(tx, "books_journal_entries", entry.Id, entry.GetInt("revision"))
	key := touchKey{info, "books_journal_entries", entry.Id}
	if _, pending := pendingRestates.LoadOrStore(key, true); pending {
		return
	}
	info.OnComplete(func(error) error {
		pendingRestates.Delete(key)
		return nil
	})
	info.OnBeforeCommit(func(tx core.App) error {
		return restateDraft(tx, key.id)
	})
}

// restateDraft brings a draft entry up to date with the line writes of tx:
// the entry's draft total is restated so the list can show it without reading
// the lines, and the entry's revision takes the transaction's one increase.
// It does nothing when the entry is gone or is no longer a draft (the
// transaction also posted it, and the post stamped its total), and when an
// entry save in the transaction left both values right already.
func restateDraft(tx core.App, entryID string) error {
	entry, err := tx.FindRecordById("books_journal_entries", entryID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if entry.GetString("status") != statusDraft || entry.GetString("reverses") != "" {
		return nil
	}
	sum, err := draftDebitSum(tx, entry.Id)
	if err != nil {
		return err
	}
	base, _ := draftBase(tx, "books_journal_entries", entry.Id, entry.GetInt("revision"))
	if entry.GetInt("revision") == base+1 && entry.GetInt("total") == sum {
		return nil
	}
	entry.Set("total", sum)
	entry.Set("revision", base+1)
	defer ownWrite(tx, "books_journal_entries", entry.Id)()
	return tx.Save(entry)
}

// withoutRestatedTotal removes total from a draft's changed fields and sets it
// to the current debit sum, which Books owns. A caller's own change to a value
// other than the sum is still refused. A caller that loaded the entry before
// the last line write carries a stale total it never touched; that is not a
// change, and the sum replaces it instead of the stale value overwriting it.
func withoutRestatedTotal(tx core.App, stored, next *core.Record, changed []string) ([]string, error) {
	sum, err := draftDebitSum(tx, stored.Id)
	if err != nil {
		return nil, err
	}
	touched := next.GetInt("total") != next.Original().GetInt("total")
	if touched && next.GetInt("total") != sum {
		return changed, nil
	}
	next.Set("total", sum)
	kept := make([]string, 0, len(changed))
	for _, name := range changed {
		if name != "total" {
			kept = append(kept, name)
		}
	}
	return kept, nil
}
