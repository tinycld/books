package books

import (
	"net/http"
	"testing"

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
