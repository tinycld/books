package books

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// Posting writes each month row's first day, verify finds a row whose first
// day is not its month's, and the rebuild repairs it.
func TestBalances_FirstDayFollowsThePeriod(t *testing.T) {
	app := newBooksApp(t)
	cash := mkAccount(t, app, "Checking", "bank", "checking")
	income := mkAccount(t, app, "Income", "income", "service_income")
	// rawPost only sets the status; the balance rows come from the posting
	// path, which this test skips, so it applies the entry by hand.
	rawPost(t, app, mkDraft(t, app, "2026-05-19", ln{cash, 500, 0}, ln{income, 0, 500}), "posted")
	err := app.RunInTransaction(func(tx core.App) error {
		if err := applyToBalances(tx, cash.Id, "2026-05-19", 500, 0, "USD"); err != nil {
			return err
		}
		return applyToBalances(tx, income.Id, "2026-05-19", 0, 500, "USD")
	})
	if err != nil {
		t.Fatal(err)
	}
	firstDay := func() string {
		t.Helper()
		row, err := app.FindFirstRecordByFilter("books_account_balances", "account = {:a} && period = '2026-05'", map[string]any{"a": cash.Id})
		if err != nil {
			t.Fatal(err)
		}
		return row.GetString("month_start")
	}
	if got := firstDay(); got != "2026-05-01" {
		t.Fatalf("month_start = %q, want 2026-05-01", got)
	}
	if drifts, err := verifyBalances(app); err != nil || len(drifts) != 0 {
		t.Fatalf("a posted ledger drifts: %+v, %v", drifts, err)
	}
	// A write past the hooks (a bulk import) leaves the day blank.
	if _, err := app.DB().NewQuery("UPDATE books_account_balances SET month_start = '' WHERE account = {:a}").Bind(map[string]any{"a": cash.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	drifts, err := verifyBalances(app)
	if err != nil || len(drifts) != 1 || drifts[0].Account != cash.Id || drifts[0].Period != "2026-05" {
		t.Fatalf("drifts = %+v, %v; want the one row with a blank first day", drifts, err)
	}
	if drifts[0].StoredMonthStart != "" {
		t.Fatalf("StoredMonthStart = %q, want the blank stored day", drifts[0].StoredMonthStart)
	}
	if fixed, err := rebuildBalances(app); err != nil || fixed != 1 {
		t.Fatalf("fixed = %d, err %v; want 1", fixed, err)
	}
	if got := firstDay(); got != "2026-05-01" {
		t.Fatalf("after the rebuild month_start = %q, want 2026-05-01", got)
	}
}
