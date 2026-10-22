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
// referenced user is hard-deleted. That unlink is the only change a posted or
// void entry accepts, and the only server-field change a draft accepts, so a
// user delete is never blocked over attribution.
var userLinkFields = map[string]bool{"posted_by": true, "voided_by": true, "created_by": true}

// changesBeyondUnlinks returns the changed fields, skipping allowed, unless
// every one of them is PocketBase unlinking a deleted user; then it returns
// none. A link cleared while its user still exists is a change like any other.
// PocketBase deletes the user row before it unlinks the references, inside
// the same transaction, so tx no longer finds that user.
func changesBeyondUnlinks(tx core.App, stored, next *core.Record, allowed map[string]bool) ([]string, error) {
	changed := changedFields(stored, next, allowed)
	for _, name := range changed {
		if !userLinkFields[name] || next.GetString(name) != "" {
			return changed, nil
		}
		_, err := tx.FindRecordById("users", stored.GetString(name))
		if err == nil {
			return changed, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
	}
	return nil, nil
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
		switch stored.GetString("status") {
		case statusVoid:
			return refuse("%s is void and cannot be deleted.", entryName(stored))
		case statusPosted:
			return refuse("%s is posted and cannot be deleted. Void it instead.", entryName(stored))
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
	switch entry.GetString("status") {
	case statusVoid:
		return refuse("%s is void, so its lines cannot change.", entryName(entry))
	case statusPosted:
		return refuse("%s is posted, so its lines cannot change. Void the entry or edit it instead.", entryName(entry))
	}
	return nil
}
