package books

import (
	"database/sql"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Corrections are reversing entries (spec, Ledger rules). A void
// reverses an entry in its own period under its own number. A one-click
// reverse posts a mirror entry on a later date under a new number. An edit
// voids the original and posts the correction under the original's number.

// voidEditable are the only fields a void changes.
var voidEditable = map[string]bool{"status": true, "voided_by": true, "voided_at": true}

// voiding holds the ids of the entries whose void is running. A void_reversal
// takes the voided entry's number and cancels its lines, so it may post only
// from that void; posted any other way it would cancel an entry that still
// reads as posted. PocketBase has one write connection, so posting
// transactions do not overlap and the mark cannot leak to another void.
var voiding sync.Map

// postedReversalQuery selects the posted reversal of an entry. It repeats
// the partial index's own conditions (reverses is not empty, status is
// posted), so SQLite seeks idx_books_je_one_reversal instead of reading
// every posted entry.
func postedReversalQuery(app core.App, entryID string) *dbx.SelectQuery {
	return app.RecordQuery("books_journal_entries").
		AndWhere(dbx.NewExp(`[[books_journal_entries.reverses]] != ''
			AND [[books_journal_entries.reverses]] = {:id}
			AND [[books_journal_entries.status]] = 'posted'`, dbx.Params{"id": entryID})).
		Limit(1)
}

// postedReversalOf returns the posted reversal of an entry, or nil.
func postedReversalOf(app core.App, entryID string) (*core.Record, error) {
	rev := &core.Record{}
	err := postedReversalQuery(app, entryID).One(rev)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("books: read reversal of %s: %w", entryID, err)
	}
	return rev, nil
}

func reversalTarget(tx core.App, entry *core.Record) (*core.Record, error) {
	target, err := tx.FindRecordById("books_journal_entries", entry.GetString("reverses"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, refuse("The entry to reverse does not exist.")
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the entry to reverse: %w", err)
	}
	if target.GetString("status") != statusPosted {
		return nil, refuse("Only a posted entry can be reversed. %s is %s.", entryName(target), target.GetString("status"))
	}
	if target.GetString("origin") == originVoidReversal {
		return nil, refuse("%s records a void and cannot be reversed.", entryName(target))
	}
	if _, ok := voiding.Load(target.Id); entry.GetString("origin") == originVoidReversal && !ok {
		return nil, refuse("Books writes a void's reversal when it voids an entry. Void %s instead.", entryName(target))
	}
	if entry.GetString("date") < target.GetString("date") {
		return nil, refuse("A reversal cannot be dated before the entry it reverses (%s).", target.GetString("date"))
	}
	existing, err := postedReversalOf(tx, target.Id)
	if err != nil {
		return nil, err
	}
	if existing != nil && existing.Id != entry.Id {
		return nil, refuse("%s is already reversed by entry %s.", entryName(target), existing.GetString("number"))
	}
	return target, nil
}

// writeReversalLines copies the target's lines with debit and credit swapped.
func writeReversalLines(tx core.App, reversal, target *core.Record) error {
	existing, err := tx.CountRecords("books_journal_lines", dbx.HashExp{"entry": reversal.Id})
	if err != nil {
		return err
	}
	if existing > 0 {
		return refuse("Books writes the lines of a reversal. Remove the lines added by hand.")
	}
	lines, err := entryLines(tx, target.Id)
	if err != nil {
		return err
	}
	col, err := tx.FindCachedCollectionByNameOrId("books_journal_lines")
	if err != nil {
		return err
	}
	for _, src := range lines {
		l := core.NewRecord(col)
		l.Set("entry", reversal.Id)
		l.Set("account", src.GetString("account"))
		l.Set("debit", src.GetInt("credit"))
		l.Set("credit", src.GetInt("debit"))
		l.Set("memo", src.GetString("memo"))
		l.Set("position", src.GetInt("position"))
		if err := tx.Save(l); err != nil {
			return fmt.Errorf("books: write reversal line: %w", err)
		}
	}
	return nil
}

func newReversalDraft(tx core.App, target *core.Record, origin, date, memo, createdBy string) (*core.Record, error) {
	col, err := tx.FindCachedCollectionByNameOrId("books_journal_entries")
	if err != nil {
		return nil, err
	}
	rev := core.NewRecord(col)
	rev.Set("date", date)
	rev.Set("status", statusDraft)
	rev.Set("doc_type", target.GetString("doc_type"))
	rev.Set("origin", origin)
	rev.Set("reverses", target.Id)
	rev.Set("memo", memo)
	rev.Set("created_by", createdBy)
	if err := tx.Save(rev); err != nil {
		return nil, fmt.Errorf("books: write reversal of %s: %w", target.Id, err)
	}
	return rev, nil
}

// postDraft reloads a draft Books just wrote and posts it as actorID, through
// the same update hook a person's post takes.
func postDraft(tx core.App, id, actorID string) error {
	fresh, err := tx.FindRecordById("books_journal_entries", id)
	if err != nil {
		return err
	}
	fresh.Set("status", statusPosted)
	fresh.Set("posted_by", actorID)
	return tx.Save(fresh)
}

// voidEntry runs while entry moves from posted to void. Its reversal is dated
// in the original period, so the close date applies to it as to any post.
func voidEntry(tx core.App, entry *core.Record, now time.Time) error {
	if entry.GetString("origin") == originVoidReversal {
		return refuse("%s records a void. It cannot be voided.", entryName(entry))
	}
	existing, err := postedReversalOf(tx, entry.Id)
	if err != nil {
		return err
	}
	if existing != nil {
		return refuse("%s is reversed by entry %s. Void that reversal first.", entryName(entry), existing.GetString("number"))
	}
	voiding.Store(entry.Id, true)
	defer voiding.Delete(entry.Id)
	actor := entry.GetString("voided_by")
	rev, err := newReversalDraft(tx, entry, originVoidReversal, entry.GetString("date"), "Void of "+entry.GetString("number"), actor)
	if err != nil {
		return err
	}
	if err := postDraft(tx, rev.Id, actor); err != nil {
		return err
	}
	entry.Set("voided_at", now)
	return nil
}

// voidReplaced voids the entry a correction replaces, in the correction's
// transaction, and returns it so the correction can take its number.
func voidReplaced(tx core.App, corrected *core.Record, now time.Time) (*core.Record, error) {
	original, err := tx.FindRecordById("books_journal_entries", corrected.GetString("replaces"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, refuse("The entry being edited does not exist.")
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the entry being edited: %w", err)
	}
	if original.GetString("status") != statusPosted {
		return nil, refuse("%s is %s and cannot be edited.", entryName(original), original.GetString("status"))
	}
	if original.GetString("origin") == originVoidReversal {
		return nil, refuse("%s records a void and cannot be edited.", entryName(original))
	}
	if original.GetString("doc_type") != corrected.GetString("doc_type") {
		return nil, refuse("A correction must have the same document type as the entry it replaces.")
	}
	original.Set("status", statusVoid)
	original.Set("voided_by", corrected.GetString("posted_by"))
	if err := tx.Save(original); err != nil {
		return nil, err
	}
	return tx.FindRecordById("books_journal_entries", original.Id)
}

// numberFor settles a posting entry's number. A void's reversal shares the
// voided entry's number; an edit takes the number of the entry it replaces,
// which it voids here; everything else takes the next number of its type.
func numberFor(tx core.App, entry, reversed *core.Record, now time.Time) (int, string, error) {
	if reversed != nil && entry.GetString("origin") == originVoidReversal {
		return reversed.GetInt("sequence"), reversed.GetString("number"), nil
	}
	if entry.GetString("replaces") != "" {
		original, err := voidReplaced(tx, entry, now)
		if err != nil {
			return 0, "", err
		}
		return original.GetInt("sequence"), original.GetString("number"), nil
	}
	return allocateNumber(tx, entry.GetString("doc_type"))
}
