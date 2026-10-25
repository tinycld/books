package books

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// checkOpeningEntry refuses a second live opening entry. The entry being
// replaced is the one allowed exception: it is posted, and posting the
// replacement voids it in the same transaction.
func checkOpeningEntry(app core.App, entry *core.Record) error {
	if entry.GetString("origin") != originOpeningBalance {
		return nil
	}
	others, err := app.FindRecordsByFilter("books_journal_entries",
		"origin = 'opening_balance' && status != 'void' && id != {:self} && id != {:replaces}",
		"", 1, 0, dbx.Params{"self": entry.Id, "replaces": entry.GetString("replaces")})
	if err != nil {
		return fmt.Errorf("books: read opening entries: %w", err)
	}
	if len(others) == 0 {
		return nil
	}
	return refuse("Opening balances are already entered (%s). Edit that entry.", openingEntryLabel(others[0]))
}

// A draft has no number yet, so entryName would read "This journal entry".
func openingEntryLabel(r *core.Record) string {
	if r.GetString("number") == "" {
		return "a saved draft"
	}
	return entryName(r)
}
