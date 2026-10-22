package books

import (
	"sync/atomic"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

// raceWindow is how long a racing post gets to commit while a guarded write
// sits between its guard and its write. A guard that holds PocketBase's one
// write connection from its check to its write makes the post wait for the
// write, so the window always runs out first. A guard that checks outside
// that serialization lets the post commit inside the window, and the write
// then lands on what the guard no longer saw. A slow machine can only make a
// test miss that regression; it cannot fail a serialized guard.
const raceWindow = 500 * time.Millisecond

// bindRace binds a hook that runs after the Books guards of the same event.
// The first time it fires, it starts race on another goroutine and gives it
// raceWindow to finish before it lets the write go on. The returned func
// waits for race and returns its result.
func bindRace(t *testing.T, h *hook.TaggedHook[*core.RecordEvent], race func() error) func() error {
	t.Helper()
	done := make(chan error, 1)
	var fired atomic.Bool
	h.BindFunc(func(e *core.RecordEvent) error {
		if !fired.CompareAndSwap(false, true) {
			return e.Next()
		}
		go func() { done <- race() }()
		select {
		case err := <-done:
			done <- err
		case <-time.After(raceWindow):
		}
		return e.Next()
	})
	return func() error {
		t.Helper()
		if !fired.Load() {
			t.Fatal("the racing hook never fired")
		}
		return <-done
	}
}

func postLater(env *ledgerEnv, entryID string) func() error {
	return func() error { return setStatus(env.app, entryID, statusPosted, "") }
}

// A line added to a draft while the draft posts: the post must see the line
// or the line must be refused. A posted entry never gains a line it was not
// checked with.
func TestRace_ALineAddedWhileTheEntryPosts(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	posted := bindRace(t, env.app.OnRecordCreate("books_journal_lines"), postLater(env, entry.Id))
	saveRecord(t, env.app, "books_journal_lines", map[string]any{
		"entry": entry.Id, "account": env.rent.Id, "debit": 50,
	})
	requireRefused(t, posted(), "out of balance by 0.50")
	requireNothingPosted(t, env.app, entry.Id)
	requireNoDrift(t, env.app)
}

func threeLineDraft(t *testing.T, env *ledgerEnv) (*core.Record, []*core.Record) {
	t.Helper()
	entry := mkDraft(t, env.app, "2026-05-10",
		ln{env.checking, 100, 0}, ln{env.revenue, 0, 60}, ln{env.revenue, 0, 40})
	lines, err := entryLines(env.app, entry.Id)
	if err != nil || len(lines) != 3 {
		t.Fatalf("lines = %d (%v), want 3", len(lines), err)
	}
	return entry, lines
}

func TestRace_ALineDeletedWhileTheEntryPosts(t *testing.T) {
	env := newLedgerEnv(t)
	entry, lines := threeLineDraft(t, env)
	posted := bindRace(t, env.app.OnRecordDelete("books_journal_lines"), postLater(env, entry.Id))
	if err := env.app.Delete(lines[2]); err != nil {
		t.Fatalf("delete a draft line: %v", err)
	}
	requireRefused(t, posted(), "out of balance by 0.40")
	requireNothingPosted(t, env.app, entry.Id)
	requireNoDrift(t, env.app)
}

func TestRace_ALineChangedWhileTheEntryPosts(t *testing.T) {
	env := newLedgerEnv(t)
	entry, lines := threeLineDraft(t, env)
	posted := bindRace(t, env.app.OnRecordUpdate("books_journal_lines"), postLater(env, entry.Id))
	lines[0].Set("debit", 150)
	if err := env.app.Save(lines[0]); err != nil {
		t.Fatalf("change a draft line: %v", err)
	}
	requireRefused(t, posted(), "out of balance by 0.50")
	requireNothingPosted(t, env.app, entry.Id)
	requireNoDrift(t, env.app)
}

// A draft deleted while it posts: either the delete wins and the post finds
// nothing, or the post wins and the delete is refused. A posted entry is
// never deleted, and its number and balance rows never outlive it.
func TestRace_AnEntryDeletedWhileItPosts(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	posted := bindRace(t, env.app.OnRecordDelete("books_journal_entries"), postLater(env, entry.Id))
	if err := env.app.Delete(entry); err != nil {
		t.Fatalf("delete a draft: %v", err)
	}
	if err := posted(); err == nil {
		t.Fatal("the post of a deleted draft succeeded")
	}
	requireRowCounts(t, env.app, 0, 0)
	requireNextNumber(t, env.app, 1)
	requireBalance(t, env.app, env.checking, "2026-05", 0, 0)
	requireNoDrift(t, env.app)
}

// A close date set while an entry with an auto-reverse date posts: the
// reversal must never end up on or before the close date, where the sweep
// could not post it.
func TestRace_TheCloseDateMovesWhileAnAutoReversingEntryPosts(t *testing.T) {
	env := newLedgerEnv(t)
	entry := mkDraft(t, env.app, "2026-05-31", ln{env.rent, 2000, 0}, ln{env.checking, 0, 2000})
	entry.Set("auto_reverse_on", "2026-06-01")
	if err := env.app.Save(entry); err != nil {
		t.Fatal(err)
	}
	posted := bindRace(t, env.app.OnRecordUpdate("books_settings"), postLater(env, entry.Id))
	setCloseDate(t, env.app, "2026-06-30")
	requireRefused(t, posted(), "The books are closed through 2026-06-30")
	if err := checkPendingAutoReversals(env.app, "2026-06-30"); err != nil {
		t.Fatalf("a pending auto-reversal sits in the closed period: %v", err)
	}
}

// A sequence edited while an entry posts: the edit must not move the counter
// back over the number the post took, or the next post reuses it.
func TestRace_ASequenceEditedWhileAnEntryPosts(t *testing.T) {
	env := newLedgerEnv(t)
	mustPost(t, env.app, env.sale(t, "2026-05-01", 100).Id, "")
	racing := env.sale(t, "2026-05-02", 200)
	posted := bindRace(t, env.app.OnRecordUpdate("books_doc_sequences"), postLater(env, racing.Id))
	seq := reload(t, env.app, "books_doc_sequences", "booksseqjournal")
	seq.Set("prefix", "JE-")
	if err := env.app.Save(seq); err != nil {
		t.Fatalf("edit the prefix: %v", err)
	}
	if err := posted(); err != nil {
		t.Fatalf("racing post: %v", err)
	}
	next := mustPost(t, env.app, env.sale(t, "2026-05-03", 300).Id, "")
	if got := reload(t, env.app, "books_journal_entries", racing.Id).GetString("number"); got != "JE-2" {
		t.Errorf("racing post number = %q, want JE-2", got)
	}
	if got := next.GetString("number"); got != "JE-3" {
		t.Errorf("next post number = %q, want JE-3", got)
	}
	requireNextNumber(t, env.app, 4)
}
