package books

import "testing"

func draftTotal(t testing.TB, env *ledgerEnv, id string) int {
	t.Helper()
	return reload(t, env.app, "books_journal_entries", id).GetInt("total")
}

func TestDraftTotal_LineCreateRestatesTheTotal(t *testing.T) {
	env := newLedgerEnv(t)
	draft := mkDraft(t, env.app, "2026-05-01")
	if got := draftTotal(t, env, draft.Id); got != 0 {
		t.Fatalf("a draft with no lines has total %d, want 0", got)
	}
	saveRecord(t, env.app, "books_journal_lines", map[string]any{
		"entry": draft.Id, "account": env.checking.Id, "debit": 300, "credit": 0, "position": 0, "currency": "USD",
	})
	if got := draftTotal(t, env, draft.Id); got != 300 {
		t.Fatalf("total after one debit line = %d, want 300", got)
	}
	// An unbalanced draft shows the sum of its debits, not its credits.
	saveRecord(t, env.app, "books_journal_lines", map[string]any{
		"entry": draft.Id, "account": env.revenue.Id, "debit": 0, "credit": 100, "position": 1, "currency": "USD",
	})
	if got := draftTotal(t, env, draft.Id); got != 300 {
		t.Fatalf("total after a credit line = %d, want 300", got)
	}
}

func TestDraftTotal_LineUpdateRestatesTheTotal(t *testing.T) {
	env := newLedgerEnv(t)
	draft := env.sale(t, "2026-05-01", 100)
	if got := draftTotal(t, env, draft.Id); got != 100 {
		t.Fatalf("total after create = %d, want 100", got)
	}
	lines, err := env.app.FindAllRecords("books_journal_lines")
	if err != nil || len(lines) == 0 {
		t.Fatalf("lines: %v", err)
	}
	for _, l := range lines {
		if l.GetString("entry") == draft.Id && l.GetInt("debit") > 0 {
			l.Set("debit", 250)
			if err := env.app.Save(l); err != nil {
				t.Fatalf("edit a draft line: %v", err)
			}
		}
	}
	if got := draftTotal(t, env, draft.Id); got != 250 {
		t.Fatalf("total after a line update = %d, want 250", got)
	}
}

func TestDraftTotal_LineDeleteRestatesTheTotal(t *testing.T) {
	env := newLedgerEnv(t)
	draft := mkDraft(t, env.app, "2026-05-01", ln{env.checking, 100, 0}, ln{env.rent, 50, 0}, ln{env.revenue, 0, 150})
	if got := draftTotal(t, env, draft.Id); got != 150 {
		t.Fatalf("total = %d, want 150", got)
	}
	lines, err := env.app.FindAllRecords("books_journal_lines")
	if err != nil {
		t.Fatal(err)
	}
	for _, l := range lines {
		if l.GetString("entry") != draft.Id {
			continue
		}
		if err := env.app.Delete(l); err != nil {
			t.Fatalf("delete a draft line: %v", err)
		}
		if l.GetInt("debit") == 100 {
			if got := draftTotal(t, env, draft.Id); got != 50 {
				t.Fatalf("total after deleting the 100 debit = %d, want 50", got)
			}
		}
	}
	if got := draftTotal(t, env, draft.Id); got != 0 {
		t.Fatalf("total after deleting every line = %d, want 0", got)
	}
}

func TestDraftTotal_PostedTotalIsUnchanged(t *testing.T) {
	env := newLedgerEnv(t)
	draft := env.sale(t, "2026-05-01", 100)
	posted := mustPost(t, env.app, draft.Id, env.users.bookkeeper.Id)
	if got := posted.GetInt("total"); got != 100 {
		t.Fatalf("posted total = %d, want 100", got)
	}
	lines, err := env.app.FindAllRecords("books_journal_lines")
	if err != nil {
		t.Fatal(err)
	}
	for _, l := range lines {
		if l.GetString("entry") == draft.Id && l.GetInt("debit") > 0 {
			l.Set("debit", 999)
			if err := env.app.Save(l); err == nil {
				t.Fatal("a line of a posted entry was edited")
			}
		}
	}
	if got := draftTotal(t, env, draft.Id); got != 100 {
		t.Fatalf("posted total after a refused line edit = %d, want 100", got)
	}
	requireNoDrift(t, env.app)
}

func TestDraftTotal_VoidAndReversalTotalsAreUnchanged(t *testing.T) {
	env := newLedgerEnv(t)
	draft := env.sale(t, "2026-05-01", 100)
	mustPost(t, env.app, draft.Id, env.users.bookkeeper.Id)
	if err := setStatus(env.app, draft.Id, statusVoid, env.users.bookkeeper.Id); err != nil {
		t.Fatalf("void: %v", err)
	}
	entries, err := env.app.FindAllRecords("books_journal_entries")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if e.GetInt("total") != 100 {
			t.Fatalf("entry %s (%s) has total %d, want 100", e.Id, e.GetString("origin"), e.GetInt("total"))
		}
	}
}

func TestDraftTotal_ClientSetTotalMustMatchTheDebitSum(t *testing.T) {
	env := newLedgerEnv(t)
	draft := env.sale(t, "2026-05-01", 100)
	draft.Set("total", 999)
	requireRefused(t, env.app.Save(draft), "total")
	draft = reload(t, env.app, "books_journal_entries", draft.Id)
	if got := draft.GetInt("total"); got != 100 {
		t.Fatalf("total after a refused edit = %d, want 100", got)
	}
	// Restating the correct value is not a change.
	draft.Set("total", 100)
	draft.Set("memo", "same total")
	if err := env.app.Save(draft); err != nil {
		t.Fatalf("a draft saved with its own total: %v", err)
	}
}

// A client that loaded the draft before its lines existed carries total 0.
func TestDraftTotal_StaleRecordSavedWithAMemoKeepsTheSum(t *testing.T) {
	env := newLedgerEnv(t)
	draft := mkDraft(t, env.app, "2026-05-01")
	stale := reload(t, env.app, "books_journal_entries", draft.Id)
	for i, l := range []ln{{env.checking, 300, 0}, {env.revenue, 0, 300}} {
		saveRecord(t, env.app, "books_journal_lines", map[string]any{
			"entry": draft.Id, "account": l.account.Id, "debit": l.debit, "credit": l.credit, "position": i, "currency": "USD",
		})
	}
	stale.Set("memo", "edited with a stale total")
	if err := env.app.Save(stale); err != nil {
		t.Fatalf("save a stale draft with a memo change: %v", err)
	}
	got := reload(t, env.app, "books_journal_entries", draft.Id)
	if got.GetInt("total") != 300 || got.GetString("memo") != "edited with a stale total" {
		t.Fatalf("total = %d, memo = %q, want 300 and the new memo", got.GetInt("total"), got.GetString("memo"))
	}
}

func TestDraftTotal_ForgedTotalOnPostEndsWithTheSum(t *testing.T) {
	env := newLedgerEnv(t)
	draft := env.sale(t, "2026-05-01", 100)
	draft = reload(t, env.app, "books_journal_entries", draft.Id)
	draft.Set("total", 999)
	draft.Set("status", statusPosted)
	if err := env.app.Save(draft); err != nil {
		t.Fatalf("post with a forged total: %v", err)
	}
	got := reload(t, env.app, "books_journal_entries", draft.Id)
	if got.GetString("status") != statusPosted || got.GetInt("total") != 100 {
		t.Fatalf("status = %s, total = %d, want posted and 100", got.GetString("status"), got.GetInt("total"))
	}
	requireNoDrift(t, env.app)
}

func TestDraftTotal_SumIsClampedAtTheStoredLimit(t *testing.T) {
	env := newLedgerEnv(t)
	// Ten lines of 10^15 a side: each line is allowed, the sum is not storable.
	draft := env.bigSale(t, repeat(10, maxAmount)...)
	if got := draftTotal(t, env, draft.Id); got != maxStoredAmount {
		t.Fatalf("clamped draft total = %d, want %d", got, maxStoredAmount)
	}
	requireRefused(t, setStatus(env.app, draft.Id, statusPosted, ""), "largest amount Books can store")
	if got := draftTotal(t, env, draft.Id); got != maxStoredAmount {
		t.Fatalf("total after a refused post = %d, want %d", got, maxStoredAmount)
	}
}

func TestDraftTotal_LineWriteOnAReversalDraftLeavesTheTotal(t *testing.T) {
	env := newLedgerEnv(t)
	posted := mustPost(t, env.app, env.sale(t, "2026-05-01", 100).Id, env.users.bookkeeper.Id)
	rev := reversalDraft(t, env.app, posted, "2026-06-01")
	before := draftTotal(t, env, rev.Id)
	saveRecord(t, env.app, "books_journal_lines", map[string]any{
		"entry": rev.Id, "account": env.checking.Id, "debit": 0, "credit": 100, "position": 0, "currency": "USD",
	})
	saveRecord(t, env.app, "books_journal_lines", map[string]any{
		"entry": rev.Id, "account": env.revenue.Id, "debit": 100, "credit": 0, "position": 1, "currency": "USD",
	})
	if got := draftTotal(t, env, rev.Id); got != before {
		t.Fatalf("reversal draft total = %d after line writes, want unchanged %d", got, before)
	}
}

func TestDraftTotal_DeletingADraftCascadesItsLines(t *testing.T) {
	env := newLedgerEnv(t)
	draft := env.sale(t, "2026-05-01", 100)
	if err := env.app.Delete(draft); err != nil {
		t.Fatalf("delete a draft with lines: %v", err)
	}
	lines, err := entryLines(env.app, draft.Id)
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 0 {
		t.Fatalf("%d lines left after deleting the draft", len(lines))
	}
}
