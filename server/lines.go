package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

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
