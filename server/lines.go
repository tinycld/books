package books

import (
	"database/sql"
	"errors"
	"fmt"

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
// not checked for inactive (an inactive party must not block a void); a line
// that names both is refused first, on any entry. A party id that is no
// record is left to PocketBase's relation validation.
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
	if entry.GetString("reverses") != "" {
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

// serializedLine is serialized for a line write: after the write succeeds, in
// the same transaction, the entry's draft total is restated so the list can
// show it without reading the lines.
func serializedLine(e *core.RecordEvent, check func(tx core.App) error) error {
	original := e.App
	defer func() { e.App = original }()
	return original.RunInTransaction(func(tx core.App) error {
		e.App = tx
		if err := check(tx); err != nil {
			return err
		}
		if err := e.Next(); err != nil {
			return err
		}
		return restateDraftTotal(tx, e.Record)
	})
}

// draftDebitSum is the sum of the debits of an entry's lines, held at
// maxStoredAmount. An unbalanced draft shows its debits. A sum past the
// largest storable amount is stored as that amount, because a draft may be
// over the limit while it is edited; posting refuses it with the real figure.
func draftDebitSum(app core.App, entryID string) (int, error) {
	lines, err := app.FindAllRecords("books_journal_lines", dbx.HashExp{"entry": entryID})
	if err != nil {
		return 0, fmt.Errorf("books: read lines of %s: %w", entryID, err)
	}
	sum := 0
	for _, l := range lines {
		sum += l.GetInt("debit")
		if sum > maxStoredAmount {
			return maxStoredAmount, nil
		}
	}
	return sum, nil
}

// restateDraftTotal writes entries.total after a line write. It does nothing
// when the entry is gone (cascade delete), is not a draft, or is a reversal,
// and when the line is being stamped by a post: Books owns those totals and
// stamps them itself at post.
func restateDraftTotal(tx core.App, line *core.Record) error {
	if line.GetBool("posted") {
		return nil
	}
	entry, err := tx.FindRecordById("books_journal_entries", line.GetString("entry"))
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
	if entry.GetInt("total") == sum {
		return nil
	}
	entry.Set("total", sum)
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
