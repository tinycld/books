package books

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// Posted entries are immutable (spec, Ledger rules). Books refuses a change;
// it never restores the old value behind the caller's back (contrast
// mail/server/thread_owned_fields.go), because a silently ignored write to
// the ledger is worse than a visible refusal. Model hooks, so this holds for
// every writer: REST, a batch, another package's Go.

// userLinkFields are the user relations PocketBase clears on its own when the
// referenced user is hard-deleted. Clearing one is the only change a posted
// entry accepts, so a user delete is never blocked over attribution.
var userLinkFields = map[string]bool{"posted_by": true, "voided_by": true, "created_by": true}

func onlyUserLinksCleared(next *core.Record, changed []string) bool {
	for _, name := range changed {
		if !userLinkFields[name] || next.GetString(name) != "" {
			return false
		}
	}
	return true
}

func refuseImmutable(stored *core.Record, changed []string) error {
	if stored.GetString("status") == statusVoid {
		return refuse("%s is void and cannot change.", entryName(stored))
	}
	return refuse("%s is posted and cannot change (%s). Void it, or edit it to post a correction.",
		entryName(stored), strings.Join(changed, ", "))
}

func registerImmutabilityGuards(app core.App) {
	app.OnRecordDelete("books_journal_entries").BindFunc(func(e *core.RecordEvent) error {
		stored, err := e.App.FindRecordById("books_journal_entries", e.Record.Id)
		if err != nil {
			return err
		}
		if stored.GetString("status") != statusDraft {
			return refuse("%s is %s and cannot be deleted. Void it instead.", entryName(stored), stored.GetString("status"))
		}
		return e.Next()
	})
	// A request hook, not a model hook: Books itself writes a reversal's
	// lines, through the model path, and must not be refused.
	app.OnRecordCreateRequest("books_journal_lines").BindFunc(func(e *core.RecordRequestEvent) error {
		entry, err := e.App.FindRecordById("books_journal_entries", e.Record.GetString("entry"))
		switch {
		case errors.Is(err, sql.ErrNoRows):
			// PocketBase's relation validation refuses the line next.
		case err != nil:
			return err
		case entry.GetString("reverses") != "":
			return refuse("Books writes the lines of a reversal. They cannot be added by hand.")
		}
		return e.Next()
	})
	app.OnRecordCreate("books_journal_lines").BindFunc(lineGuard)
	app.OnRecordUpdate("books_journal_lines").BindFunc(func(e *core.RecordEvent) error {
		stored, err := e.App.FindRecordById("books_journal_lines", e.Record.Id)
		if err != nil {
			return err
		}
		if stored.GetString("entry") != e.Record.GetString("entry") {
			return refuse("A line cannot move to another journal entry.")
		}
		return lineGuard(e)
	})
	app.OnRecordDelete("books_journal_lines").BindFunc(lineGuard)
}

func lineGuard(e *core.RecordEvent) error {
	if err := requireDraftEntry(e.App, e.Record); err != nil {
		return err
	}
	return e.Next()
}

// requireDraftEntry allows a line write only while its entry is a draft. The
// posting hook stamps lines before it writes the entry, so the stored entry
// is still a draft then.
func requireDraftEntry(app core.App, line *core.Record) error {
	entry, err := app.FindRecordById("books_journal_entries", line.GetString("entry"))
	if errors.Is(err, sql.ErrNoRows) {
		// The entry is gone: its cascade delete (only drafts delete), or a
		// create that PocketBase's relation validation refuses next.
		return nil
	}
	if err != nil {
		return err
	}
	if entry.GetString("status") != statusDraft {
		return refuse("%s is %s, so its lines cannot change. Void the entry or edit it instead.",
			entryName(entry), entry.GetString("status"))
	}
	return nil
}
