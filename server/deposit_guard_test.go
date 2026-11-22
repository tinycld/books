package books

import (
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The deposited-item guard (bank deposit spec §3.7, Q5): the entry of a line
// that a posted deposit holds cannot move to void. A document void, a
// document correction and a journal entry edit all pass transitionEntry, so
// each is refused with "<Noun> <n> is in Deposit <n>. Remove it from the
// deposit first." Once the deposit is void, both work. A manual reverse stays
// allowed: its new line is an undeposited item of the other sign.

func TestDepositGuard_RefusesAVoidAndAnEditOfADepositedTransaction(t *testing.T) {
	actions := []struct {
		name string
		run  func(s depositSource, t *testing.T) error
	}{
		{"void", func(s depositSource, t *testing.T) error { return s.void(t) }},
		{"correction", func(s depositSource, t *testing.T) error { return s.correct(t) }},
	}
	for _, kind := range depositSourceKinds {
		for _, action := range actions {
			t.Run(kind+" "+action.name, func(t *testing.T) {
				src := depositSourcePosters[kind](t)
				name := src.name(t)
				d := src.depositOf(t)

				requireRefused(t, action.run(src, t), wantItemHeld(name, d.GetString("number")))
				if s := reload(t, src.app, "books_journal_entries", src.entry.Id).GetString("status"); s != statusPosted {
					t.Fatalf("the refused %s left the entry %q, want posted", action.name, s)
				}
				requireItemsPosted(t, src.app, d, true)

				if err := voidDepositAs(src.app, d.Id, src.users.bookkeeper.Id); err != nil {
					t.Fatalf("void the deposit: %v", err)
				}
				if err := action.run(src, t); err != nil {
					t.Fatalf("the %s after the deposit's void was refused: %v", action.name, err)
				}
				if s := reload(t, src.app, "books_journal_entries", src.entry.Id).GetString("status"); s != statusVoid {
					t.Errorf("the entry after the %s is %q, want void", action.name, s)
				}
			})
		}
	}
}

// A manual reverse of a deposited journal entry is allowed: the reversal's line
// is listed by the view with the other sign.
func TestDepositGuard_AllowsAManualReverse(t *testing.T) {
	src := depositSourcePosters["journal"](t)
	src.depositOf(t)
	reversal := mustPost(t, src.app, reversalDraft(t, src.app, src.entry, "2026-11-20").Id, src.users.bookkeeper.Id)
	line := lineOn(t, src.app, reversal.Id, src.undeposited)
	row, err := src.app.FindRecordById(undepositedView, line.Id)
	if err != nil {
		t.Fatalf("the reversal's line is not listed as undeposited: %v", err)
	}
	if got := row.GetInt("amount"); got != -src.amount {
		t.Errorf("the reversal's listed amount = %d, want %d", got, -src.amount)
	}
	if s := reload(t, src.app, "books_journal_entries", src.entry.Id).GetString("status"); s != statusPosted {
		t.Errorf("the reversed entry's status %q, want posted", s)
	}
}

// A deposit's own correction and void pass the guard: the deposit's entry is
// never held by a deposit.
func TestDepositGuard_DoesNotStopTheDepositsOwnCorrectionOrVoid(t *testing.T) {
	de := newDepositEnv(t)
	actor := de.users.bookkeeper.Id
	line := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")
	original := de.postedDeposit(t, []*core.Record{line})
	correction := de.mkDeposit(t, map[string]any{"replaces": original.Id})
	mkDepositItem(t, de.app, correction, line, 0)
	if err := postDepositAs(de.app, correction.Id, actor); err != nil {
		t.Fatalf("the deposit's correction was refused: %v", err)
	}
	if err := voidDepositAs(de.app, correction.Id, actor); err != nil {
		t.Fatalf("the correction's void was refused: %v", err)
	}
	if n, _ := de.app.CountRecords(depositsCol, dbx.HashExp{"status": statusVoid}); n != 2 {
		t.Errorf("%d void deposits, want the original and its correction", n)
	}
}

// depositHolding names the posted deposit that holds a line of an entry, and
// nil when none does.
func TestDepositHolding(t *testing.T) {
	de := newDepositEnv(t)
	line := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")
	entryID := line.GetString("entry")
	draft := de.mkDeposit(t, nil)
	mkDepositItem(t, de.app, draft, line, 0)
	if held, err := depositHolding(de.app, entryID); err != nil || held != nil {
		t.Fatalf("depositHolding with only a draft = %v, %v; want nil, nil", held, err)
	}
	d := mustPostDeposit(t, de.app, draft.Id, de.users.bookkeeper.Id)
	held, err := depositHolding(de.app, entryID)
	if err != nil || held == nil || held.Id != d.Id {
		t.Fatalf("depositHolding after the post = %v, %v; want the deposit", held, err)
	}
	if err := releaseDepositItems(de.app, d.Id); err != nil {
		t.Fatalf("releaseDepositItems: %v", err)
	}
	if held, err := depositHolding(de.app, entryID); err != nil || held != nil {
		t.Errorf("depositHolding after the release = %v, %v; want nil, nil", held, err)
	}
}

// Every noun case of deposit_cases.json gives its label.
func TestDepositGuard_EveryNounCase(t *testing.T) {
	col := &core.Collection{}
	col.Fields.Add(&core.TextField{Name: "doc_type"}, &core.TextField{Name: "number"})
	for _, c := range loadDepositCases(t).Nouns {
		t.Run(c.Label, func(t *testing.T) {
			r := core.NewRecord(col)
			r.Set("doc_type", c.DocType)
			r.Set("number", c.Number)
			if got := entryName(r); got != c.Label {
				t.Errorf("entryName(%s %s) = %q, want %q", c.DocType, c.Number, got, c.Label)
			}
		})
	}
	if noun, this, draft := entryNouns(docTypeDeposit); noun != "Deposit" || this != "This deposit" || draft != "Draft deposit" {
		t.Errorf("entryNouns(deposit) = %q, %q, %q; want Deposit, This deposit, Draft deposit", noun, this, draft)
	}
}
