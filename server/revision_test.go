package books

import (
	"errors"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func revisionOf(t testing.TB, app core.App, entryID string) int {
	t.Helper()
	return reload(t, app, "books_journal_entries", entryID).GetInt("revision")
}

func TestRevision_ANewEntryStartsAtOne(t *testing.T) {
	env := newLedgerEnv(t)
	entry := saveRecord(t, env.app, "books_journal_entries", map[string]any{
		"date": "2026-05-10", "status": "draft", "doc_type": "journal", "origin": "manual",
	})
	if got := revisionOf(t, env.app, entry.Id); got != 1 {
		t.Fatalf("revision = %d, want 1", got)
	}
}

func TestRevision_ACallerCannotChooseItOnCreate(t *testing.T) {
	env := newLedgerEnv(t)
	col, err := env.app.FindCollectionByNameOrId("books_journal_entries")
	if err != nil {
		t.Fatal(err)
	}
	entry := core.NewRecord(col)
	entry.Load(map[string]any{"date": "2026-05-10", "status": "draft", "doc_type": "journal", "origin": "manual", "revision": 7})
	requireRefused(t, env.app.Save(entry), "Books sets these fields itself: revision.")
}

func TestDraftBase_OneBaseForATransactionAndNoneAfterIt(t *testing.T) {
	env := newLedgerEnv(t)
	rollback := errors.New("rolled back by the test")
	var info *core.TxAppInfo
	err := env.app.RunInTransaction(func(tx core.App) error {
		info = tx.TxInfo()
		if base, first := draftBase(tx, "entry1", 4); base != 4 || !first {
			t.Fatalf("first touch = %d/%v, want 4/true", base, first)
		}
		// The stored value moved inside the transaction; the base does not.
		if base, first := draftBase(tx, "entry1", 5); base != 4 || first {
			t.Fatalf("second touch = %d/%v, want 4/false", base, first)
		}
		return rollback
	})
	if !errors.Is(err, rollback) {
		t.Fatal(err)
	}
	if _, kept := draftTouches.Load(touchKey{info, "entry1"}); kept {
		t.Fatal("the base outlived its transaction")
	}
}
