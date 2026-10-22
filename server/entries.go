package books

import (
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const (
	statusDraft  = "draft"
	statusPosted = "posted"
	statusVoid   = "void"

	originManual       = "manual"
	originReversal     = "reversal"
	originAutoReversal = "auto_reversal"
	originVoidReversal = "void_reversal"
)

// draftEditable are the entry fields a person edits on a draft. Everything
// else is set by Books (number, totals, who and when) or fixed when the entry
// is created (type, origin, the entry it reverses or replaces).
var draftEditable = map[string]bool{
	"date": true, "memo": true, "auto_reverse_on": true, "status": true, "posted_by": true,
}

func registerEntryHooks(app core.App) {
	app.OnRecordCreateRequest("books_journal_entries").BindFunc(func(e *core.RecordRequestEvent) error {
		stampActor(e.Record, "created_by", e.Auth)
		return e.Next()
	})
	app.OnRecordUpdateRequest("books_journal_entries").BindFunc(func(e *core.RecordRequestEvent) error {
		// Stamp only on a transition. A save that keeps an entry posted is not
		// a post, and rewriting its poster would be a change to a posted entry.
		if e.Record.Original().GetString("status") == e.Record.GetString("status") {
			return e.Next()
		}
		switch e.Record.GetString("status") {
		case statusPosted:
			stampActor(e.Record, "posted_by", e.Auth)
		case statusVoid:
			stampActor(e.Record, "voided_by", e.Auth)
		}
		return e.Next()
	})
	app.OnRecordCreate("books_journal_entries").BindFunc(func(e *core.RecordEvent) error {
		if err := checkNewEntry(e.Record); err != nil {
			return err
		}
		if err := stampCurrency(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	})
	// Every entry update runs in one transaction. Posting writes the lines,
	// the balance rows and the number counter; a void also writes and posts
	// a reversal. Any refusal rolls all of it back. e.App is swapped for the
	// transaction so PocketBase's own write of the entry joins it.
	app.OnRecordUpdate("books_journal_entries").BindFunc(func(e *core.RecordEvent) error {
		return e.App.RunInTransaction(func(tx core.App) error {
			e.App = tx
			// The stored row, not Original(): a caller that saved a record and
			// changed it again without reloading carries a stale Original().
			stored, err := tx.FindRecordById("books_journal_entries", e.Record.Id)
			if err != nil {
				return err
			}
			if err := transitionEntry(tx, stored, e.Record, time.Now()); err != nil {
				return err
			}
			return e.Next()
		})
	})
}

func checkNewEntry(r *core.Record) error {
	if r.GetString("status") != statusDraft {
		return refuse("A journal entry starts as a draft. Post it after adding its lines.")
	}
	reverses := r.GetString("reverses") != ""
	switch r.GetString("origin") {
	case originManual:
		if reverses {
			return refuse("A manual entry cannot reverse another entry.")
		}
	case originReversal, originAutoReversal, originVoidReversal:
		if !reverses {
			return refuse("A reversal must name the entry it reverses.")
		}
	}
	if reverses && r.GetString("replaces") != "" {
		return refuse("An entry cannot both reverse and replace another entry.")
	}
	return nil
}

// transitionEntry is the whole lifecycle: a draft is edited or posted; a
// posted or void entry changes only when PocketBase unlinks a deleted user.
func transitionEntry(tx core.App, stored, next *core.Record, now time.Time) error {
	from, to := stored.GetString("status"), next.GetString("status")
	switch {
	case from == statusDraft && to == statusDraft:
		changed, err := changesBeyondUnlinks(tx, stored, next, draftEditable)
		if err != nil {
			return err
		}
		return refuseServerFields(changed)
	case from == statusDraft && to == statusPosted:
		if err := checkDraftEdit(stored, next); err != nil {
			return err
		}
		return postEntry(tx, next, now)
	case from == to:
		changed, err := changesBeyondUnlinks(tx, stored, next, nil)
		if err != nil || len(changed) == 0 {
			return err
		}
		return refuseImmutable(stored, changed)
	}
	return refuse("%s cannot go from %s to %s.", entryName(stored), from, to)
}

// checkDraftEdit refuses a change to a field Books sets, with no unlink
// allowance: posting is never PocketBase unlinking a deleted user.
func checkDraftEdit(stored, next *core.Record) error {
	return refuseServerFields(changedFields(stored, next, draftEditable))
}

func refuseServerFields(changed []string) error {
	if len(changed) > 0 {
		return refuse("Books sets these fields itself: %s.", strings.Join(changed, ", "))
	}
	return nil
}

func entryName(r *core.Record) string {
	if n := r.GetString("number"); n != "" {
		return "Journal entry " + n
	}
	return "This journal entry"
}
