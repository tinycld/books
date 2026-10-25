package books

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const (
	statusDraft  = "draft"
	statusPosted = "posted"
	statusVoid   = "void"

	originManual         = "manual"
	originReversal       = "reversal"
	originAutoReversal   = "auto_reversal"
	originVoidReversal   = "void_reversal"
	originOpeningBalance = "opening_balance"
)

// draftEditable are the entry fields a person edits on a draft. Everything
// else is set by Books (number, total, who and when) or fixed when the entry
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
		// Serialized so two sessions cannot both pass the one-opening-entry guard.
		return serialized(e, func(tx core.App) error {
			if err := checkNewEntry(e.Record); err != nil {
				return err
			}
			if err := checkOpeningEntry(tx, e.Record); err != nil {
				return err
			}
			if err := checkLinkedEntries(tx, e.Record); err != nil {
				return err
			}
			return stampCurrency(tx, e.Record)
		})
	})
	// Every entry update runs in one transaction. Posting writes the lines,
	// the balance rows and the number counter; a void also writes and posts
	// a reversal. Any refusal rolls all of it back, and PocketBase's own
	// write of the entry joins the transaction.
	app.OnRecordUpdate("books_journal_entries").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			// The stored row, not Original(): a caller that saved a record and
			// changed it again without reloading carries a stale Original().
			stored, err := tx.FindRecordById("books_journal_entries", e.Record.Id)
			if err != nil {
				return err
			}
			return transitionEntry(tx, stored, e.Record, time.Now())
		})
	})
}

// postingFields are the fields Books fills when it posts or voids an entry.
// total is also Books-owned on a draft: Books restates it on every draft line
// write (see restateDraftTotal) and stamps it again at post.
// The create rule refuses them over REST; checkNewEntry refuses them for a Go
// caller too, so a draft never starts with a number, a poster or an override.
// created_by and currency are not here: Books stamps them on create.
var postingFields = []string{
	"number", "sequence", "total", "posted_at", "posted_by", "voided_at", "voided_by", "close_override",
}

func checkNewEntry(r *core.Record) error {
	if r.GetString("status") != statusDraft {
		return refuse("A journal entry starts as a draft. Post it after adding its lines.")
	}
	var set []string
	for _, name := range postingFields {
		// A number field reads "0" and an unset date "" when empty.
		if v := r.GetString(name); v != "" && v != "0" {
			set = append(set, name)
		}
	}
	if err := refuseServerFields(set); err != nil {
		return err
	}
	reverses := r.GetString("reverses") != ""
	switch r.GetString("origin") {
	case originManual:
		if reverses {
			return refuse("A manual entry cannot reverse another entry.")
		}
	case originOpeningBalance:
		if reverses {
			return refuse("An opening balance entry cannot reverse another entry.")
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

// checkLinkedEntries refuses a reversal or a correction of a draft. The entry
// it names must be one that cannot be deleted (posted or void): deleting a
// named draft would make PocketBase clear the link on this entry, a change to
// a field fixed at create, which the update hook refuses, so the draft could
// never be deleted. Whether the named entry may be reversed or edited is
// checked at posting, when it counts.
func checkLinkedEntries(app core.App, r *core.Record) error {
	for _, field := range []string{"reverses", "replaces"} {
		id := r.GetString(field)
		if id == "" {
			continue
		}
		target, err := app.FindRecordById("books_journal_entries", id)
		switch {
		case errors.Is(err, sql.ErrNoRows):
			// PocketBase's relation validation refuses the entry next.
		case err != nil:
			return err
		case target.GetString("status") == statusDraft:
			return refuse("The entry this one %s is a draft. Post it first, or edit the draft itself.", field)
		}
	}
	return nil
}

// transitionEntry is the whole lifecycle: a draft is edited or posted, a
// posted entry is voided, and nothing else changes except PocketBase
// unlinking a deleted user.
func transitionEntry(tx core.App, stored, next *core.Record, now time.Time) error {
	from, to := stored.GetString("status"), next.GetString("status")
	switch {
	case from == statusDraft && to == statusDraft:
		changed, err := changesBeyondUnlinks(tx, stored, next, draftEditable, entryUserLinks)
		if err != nil {
			return err
		}
		changed, err = withoutRestatedTotal(tx, stored, next, changed)
		if err != nil {
			return err
		}
		return refuseServerFields(changed)
	case from == statusDraft && to == statusPosted:
		if err := checkDraftEdit(stored, next); err != nil {
			return err
		}
		return postEntry(tx, next, now)
	case from == statusPosted && to == statusVoid:
		// The update rule lets {"status":"void"} carry any field a draft may
		// edit, so the void itself refuses every change but its own.
		if changed := changedFields(stored, next, voidEditable); len(changed) > 0 {
			return refuse("%s cannot change (%s) when it is voided. A void changes only the status.",
				entryName(stored), strings.Join(changed, ", "))
		}
		return voidEntry(tx, next, now)
	case from == to:
		changed, err := changesBeyondUnlinks(tx, stored, next, nil, entryUserLinks)
		if err != nil || len(changed) == 0 {
			return err
		}
		return refuseImmutable(stored, changed)
	}
	return refuse("%s cannot go from %s to %s.", entryName(stored), from, to)
}

// checkDraftEdit refuses a change to a field Books sets, with no unlink
// allowance: posting is never PocketBase unlinking a deleted user. total is
// not checked: a record loaded before the last line write carries a stale
// one, and posting overwrites it with the validated sum.
func checkDraftEdit(stored, next *core.Record) error {
	var changed []string
	for _, name := range changedFields(stored, next, draftEditable) {
		if name != "total" {
			changed = append(changed, name)
		}
	}
	return refuseServerFields(changed)
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
