package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// These tests bind no ledger hooks: they post fixtures with raw saves, so they
// measure the balance arithmetic alone.
func rawPost(t testing.TB, app core.App, entry *core.Record, status string) {
	t.Helper()
	entry.Set("status", status)
	if err := app.Save(entry); err != nil {
		t.Fatalf("raw post: %v", err)
	}
}

func TestApplyToBalances_AddsToTheMonthRow(t *testing.T) {
	app := newBooksApp(t)
	cash := mkAccount(t, app, "Checking", "bank", "checking")
	err := app.RunInTransaction(func(tx core.App) error {
		if err := applyToBalances(tx, cash.Id, "2026-05-03", 1000, 0, "USD"); err != nil {
			return err
		}
		return applyToBalances(tx, cash.Id, "2026-05-30", 0, 250, "USD")
	})
	if err != nil {
		t.Fatal(err)
	}
	row, err := app.FindFirstRecordByFilter("books_account_balances", "account = {:a} && period = '2026-05'", map[string]any{"a": cash.Id})
	if err != nil {
		t.Fatal(err)
	}
	if row.GetInt("debit_total") != 1000 || row.GetInt("credit_total") != 250 || row.GetString("currency") != "USD" {
		t.Fatalf("row = %v", row.PublicExport())
	}
}

func TestVerifyBalances_CountsPostedAndVoidButNotDrafts(t *testing.T) {
	app := newBooksApp(t)
	cash := mkAccount(t, app, "Checking", "bank", "checking")
	income := mkAccount(t, app, "Income", "income", "service_income")
	rawPost(t, app, mkDraft(t, app, "2026-05-01", ln{cash, 500, 0}, ln{income, 0, 500}), "posted")
	rawPost(t, app, mkDraft(t, app, "2026-05-02", ln{cash, 70, 0}, ln{income, 0, 70}), "void")
	mkDraft(t, app, "2026-05-03", ln{cash, 9, 0}, ln{income, 0, 9})

	drifts, err := verifyBalances(app)
	if err != nil {
		t.Fatal(err)
	}
	if len(drifts) != 2 {
		t.Fatalf("drifts = %+v, want one per account", drifts)
	}
	for _, d := range drifts {
		if d.Account == cash.Id && (d.LedgerDebit != 570 || d.StoredDebit != 0) {
			t.Errorf("cash drift = %+v", d)
		}
	}
}

func TestRebuildBalances_FixesDriftAndIsIdempotent(t *testing.T) {
	app := newBooksApp(t)
	cash := mkAccount(t, app, "Checking", "bank", "checking")
	income := mkAccount(t, app, "Income", "income", "service_income")
	rawPost(t, app, mkDraft(t, app, "2026-05-01", ln{cash, 500, 0}, ln{income, 0, 500}), "posted")
	// A stray row with no ledger behind it, and a wrong one.
	saveRecord(t, app, "books_account_balances", map[string]any{"account": cash.Id, "period": "2026-01", "debit_total": 1, "currency": "USD"})
	saveRecord(t, app, "books_account_balances", map[string]any{"account": income.Id, "period": "2026-05", "credit_total": 499, "currency": "USD"})

	fixed, err := rebuildBalances(app)
	if err != nil || fixed != 3 {
		t.Fatalf("fixed = %d, err %v; want 3", fixed, err)
	}
	if drifts, err := verifyBalances(app); err != nil || len(drifts) != 0 {
		t.Fatalf("after rebuild: %+v, %v", drifts, err)
	}
	if fixed, err := rebuildBalances(app); err != nil || fixed != 0 {
		t.Fatalf("second rebuild fixed %d, err %v", fixed, err)
	}
}

func TestRebuildRoute_AdminOnly(t *testing.T) {
	cases := []struct {
		level Level
		want  int
	}{
		{LevelBookkeeper, http.StatusForbidden},
		{LevelAdmin, http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(string(tc.level), func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			req := apiReq{
				method: http.MethodPost,
				url:    "/api/books/balances/rebuild",
				token:  tokenFor(t, users.byLevel(tc.level)),
				want:   tc.want,
				before: bindBalanceRoutes,
			}
			if tc.want == http.StatusOK {
				req.content = []string{`"fixed":0`}
			}
			req.run(t, app)
		})
	}
}

func TestRebuildRoute_AnonymousIsRefused(t *testing.T) {
	app := newBooksApp(t)
	apiReq{method: http.MethodPost, url: "/api/books/balances/rebuild", want: http.StatusForbidden, before: bindBalanceRoutes}.run(t, app)
}

func setLineRaw(t testing.TB, app core.App, lineID, set string) {
	t.Helper()
	// Raw SQL on purpose: the line guard refuses each of these writes.
	if _, err := app.DB().NewQuery("UPDATE books_journal_lines SET " + set + " WHERE id = {:id}").
		Bind(dbx.Params{"id": lineID}).Execute(); err != nil {
		t.Fatalf("set %s: %v", set, err)
	}
}

func TestVerifyLines_ACleanLedgerHasNone(t *testing.T) {
	env := newLedgerEnv(t)
	env.sale(t, "2026-05-01", 100)
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 200).Id, "")
	if err := setStatus(env.app, posted.Id, statusVoid, ""); err != nil {
		t.Fatal(err)
	}
	drifts, err := verifyLines(env.app)
	if err != nil || len(drifts) != 0 {
		t.Fatalf("drifts = %+v, err %v; want none", drifts, err)
	}
}

// The review's reproduction: a draft's line carries the posted flag. The
// month rows are right (the entry is a draft), so verifyBalances says nothing,
// but every report that selects posted lines counts the line.
func TestVerifyLines_ReportsEachDisagreement(t *testing.T) {
	env := newLedgerEnv(t)
	draft := env.sale(t, "2026-05-01", 100)
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 200).Id, "")
	redated := mustPost(t, env.app, env.sale(t, "2026-05-20", 300).Id, "")

	stamped := mustLines(t, env.app, draft.Id)[0]
	setLineRaw(t, env.app, stamped.Id, "posted = 1")
	dated := mustLines(t, env.app, draft.Id)[1]
	setLineRaw(t, env.app, dated.Id, "date = '2026-05-01'")
	cleared := mustLines(t, env.app, posted.Id)[0]
	setLineRaw(t, env.app, cleared.Id, "posted = 0")
	moved := mustLines(t, env.app, redated.Id)[0]
	setLineRaw(t, env.app, moved.Id, "date = '2026-06-20'")

	if balances, err := verifyBalances(env.app); err != nil || len(balances) != 0 {
		t.Fatalf("verifyBalances = %+v, err %v: the month rows are still right", balances, err)
	}
	drifts, err := verifyLines(env.app)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]LineDrift{}
	for _, d := range drifts {
		got[d.Line] = d
	}
	if len(drifts) != 4 {
		t.Fatalf("drifts = %+v, want 4", drifts)
	}
	if d := got[stamped.Id]; d.Entry != draft.Id || d.EntryStatus != statusDraft || !d.Posted {
		t.Errorf("stamped draft line = %+v", d)
	}
	if d := got[dated.Id]; d.EntryStatus != statusDraft || d.Date != "2026-05-01" {
		t.Errorf("dated draft line = %+v", d)
	}
	if d := got[cleared.Id]; d.EntryStatus != statusPosted || d.Posted {
		t.Errorf("unstamped posted line = %+v", d)
	}
	if d := got[moved.Id]; d.Date != "2026-06-20" || d.EntryDate != "2026-05-20" {
		t.Errorf("redated line = %+v", d)
	}
}

func TestRebuildRoute_ReportsLineDrifts(t *testing.T) {
	env := newLedgerEnv(t)
	draft := env.sale(t, "2026-05-01", 100)
	line := mustLines(t, env.app, draft.Id)[0]
	setLineRaw(t, env.app, line.Id, "posted = 1")
	apiReq{
		method: http.MethodPost, url: "/api/books/balances/rebuild",
		token: tokenFor(t, env.users.admin), want: http.StatusOK, before: bindBalanceRoutes,
		content: []string{`"fixed":0`, `"lineDrifts":[{"line":"` + line.Id + `"`, `"entryStatus":"draft"`, `"lineDriftCount":1`},
	}.run(t, env.app)
}

// A line whose entry row is gone still carries its stamp, and every report
// that selects by the stamp counts it.
func TestVerifyLines_ReportsALineWhoseEntryIsGone(t *testing.T) {
	env := newLedgerEnv(t)
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 200).Id, "")
	lines := mustLines(t, env.app, posted.Id)
	// Raw SQL on purpose: the hooks refuse the delete of a posted entry.
	if _, err := env.app.DB().NewQuery("DELETE FROM books_journal_entries WHERE id = {:id}").
		Bind(dbx.Params{"id": posted.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	drifts, err := verifyLines(env.app)
	if err != nil {
		t.Fatal(err)
	}
	if len(drifts) != len(lines) {
		t.Fatalf("drifts = %+v, want the %d lines of the deleted entry", drifts, len(lines))
	}
	for _, d := range drifts {
		if d.Entry != posted.Id || d.EntryStatus != "" || d.EntryDate != "" || !d.Posted || d.Date != "2026-05-10" {
			t.Errorf("drift = %+v, want a posted line of the missing entry %s", d, posted.Id)
		}
	}
}

// The route answers with at most maxLineDriftsReported lines and the full count.
func TestLineDriftReport_IsCapped(t *testing.T) {
	drifts := make([]LineDrift, maxLineDriftsReported+2)
	for i := range drifts {
		drifts[i].Line = fmt.Sprintf("line%03d", i)
	}
	listed, count := lineDriftReport(drifts)
	if len(listed) != maxLineDriftsReported || count != maxLineDriftsReported+2 {
		t.Fatalf("listed %d, count %d; want %d and %d", len(listed), count, maxLineDriftsReported, maxLineDriftsReported+2)
	}
	if listed[0].Line != "line000" {
		t.Errorf("first listed = %q, want the first drift", listed[0].Line)
	}
	few, n := lineDriftReport(drifts[:3])
	if len(few) != 3 || n != 3 {
		t.Fatalf("listed %d, count %d; want 3 and 3", len(few), n)
	}
}

func TestRebuildRoute_ACleanLedgerReportsAnEmptyList(t *testing.T) {
	env := newLedgerEnv(t)
	apiReq{
		method: http.MethodPost, url: "/api/books/balances/rebuild",
		token: tokenFor(t, env.users.admin), want: http.StatusOK, before: bindBalanceRoutes,
		content: []string{`"lineDrifts":[]`},
	}.run(t, env.app)
}
