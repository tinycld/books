package books

import (
	"reflect"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// cashMonth is one stored cash month, or one month of the cash rows added up.
type cashMonth struct {
	Account string `db:"account"`
	Period  string `db:"period"`
	Start   string `db:"month_start"`
	Debit   int    `db:"debit"`
	Credit  int    `db:"credit"`
}

// requireCashMonthsEqualRows reads the stored cash months and the cash rows
// with its own SQL (not through verifyCashBalances) and fails when they
// differ: the stored months equal the posted cash rows added up by account
// and month, and a month with no cash row has no stored row.
func requireCashMonthsEqualRows(t testing.TB, app core.App) {
	t.Helper()
	var stored, want []cashMonth
	if err := app.DB().NewQuery(`
		SELECT account, period, month_start, CAST(debit_total AS INTEGER) AS debit, CAST(credit_total AS INTEGER) AS credit
		FROM books_cash_basis_balances ORDER BY account, period`).All(&stored); err != nil {
		t.Fatalf("read the stored cash months: %v", err)
	}
	if err := app.DB().NewQuery(`
		SELECT account, substr(date, 1, 7) AS period, substr(date, 1, 7) || '-01' AS month_start,
		       CAST(SUM(debit) AS INTEGER) AS debit, CAST(SUM(credit) AS INTEGER) AS credit
		FROM books_cash_basis_lines WHERE posted = 1
		GROUP BY account, substr(date, 1, 7) ORDER BY account, period`).All(&want); err != nil {
		t.Fatalf("add the cash rows per account and month: %v", err)
	}
	if !reflect.DeepEqual(stored, want) {
		t.Errorf("the stored cash months differ from the cash rows:\nstored %+v\nrows   %+v", stored, want)
	}
}

// cashMonthOf is the stored cash month of account for period: its debit and
// credit totals, and whether the row exists.
func cashMonthOf(t testing.TB, app core.App, account *core.Record, period string) (debit, credit int, found bool) {
	t.Helper()
	rows, err := app.FindAllRecords(cashBalancesCollection, dbx.HashExp{"account": account.Id, "period": period})
	if err != nil {
		t.Fatalf("read cash month %s %s: %v", account.GetString("name"), period, err)
	}
	if len(rows) == 0 {
		return 0, 0, false
	}
	if len(rows) > 1 {
		t.Fatalf("cash month %s %s has %d rows, want one", account.GetString("name"), period, len(rows))
	}
	return rows[0].GetInt("debit_total"), rows[0].GetInt("credit_total"), true
}

// The book of cashBook: bill 1 (700.00 office, 300.00 software) on March 10,
// paid 400.00 on April 15 (voided) and 250.00 on May 20; bill 2 (123.45
// office) on April 15, paid in full on May 20; bill 3 (9.99 software) on May
// 20, unpaid. Every post, payment and void wrote its months.
func TestCashBalances_FollowThePostsPaymentsAndVoids(t *testing.T) {
	ce := cashBook(t)
	requireCashMonthsEqualRows(t, ce.app)

	type month struct{ debit, credit int }
	for _, c := range []struct {
		what    string
		account *core.Record
		period  string
		want    month
	}{
		{"bill 1 taken out of office", ce.office, "2026-03", month{0, 70000}},
		{"bill 1 taken out of software", ce.software, "2026-03", month{0, 30000}},
		{"bill 1 taken out of payables", ce.payable, "2026-03", month{100000, 0}},
		{"bill 2 taken out of office", ce.office, "2026-04", month{0, 12345}},
		{"bill 2 taken out of payables", ce.payable, "2026-04", month{12345, 0}},
		{"the May payments bring office back", ce.office, "2026-05", month{17500 + 12345, 0}},
		{"software: bill 1's share back, bill 3 out", ce.software, "2026-05", month{7500, 999}},
		{"payables: bill 3 out, the two payments", ce.payable, "2026-05", month{999, 25000 + 12345}},
	} {
		debit, credit, found := cashMonthOf(t, ce.app, c.account, c.period)
		if !found || (month{debit, credit}) != c.want {
			t.Errorf("%s: cash month %s = %d / %d (found %v), want %d / %d", c.what, c.period, debit, credit, found, c.want.debit, c.want.credit)
		}
	}
	// The voided April payment was the only cash row of software in April: its
	// month row went with its rows.
	if debit, credit, found := cashMonthOf(t, ce.app, ce.software, "2026-04"); found {
		t.Errorf("software has a cash month for April (%d / %d) after the only payment of that month was voided", debit, credit)
	}
	if drifts, err := verifyCashBalances(ce.app); err != nil || len(drifts) != 0 {
		t.Errorf("verifyCashBalances on a book built through the write paths = %+v, err %v; want none", drifts, err)
	}
}

// verifyCashBalances names each kind of drift, and rebuildBalances repairs
// them all and counts them.
func TestVerifyCashBalances_ReportsEachDriftAndTheRebuildRepairsIt(t *testing.T) {
	ce := cashBook(t)
	exec := func(what, sql string, params dbx.Params) {
		t.Helper()
		if _, err := ce.app.DB().NewQuery(sql).Bind(params).Execute(); err != nil {
			t.Fatalf("%s: %v", what, err)
		}
	}
	exec("change a total", "UPDATE books_cash_basis_balances SET debit_total = debit_total + 1 WHERE account = {:a} AND period = '2026-05'", dbx.Params{"a": ce.office.Id})
	exec("delete a month", "DELETE FROM books_cash_basis_balances WHERE account = {:a} AND period = '2026-03'", dbx.Params{"a": ce.software.Id})
	exec("move a month's first day", "UPDATE books_cash_basis_balances SET month_start = '2026-04-02' WHERE account = {:a} AND period = '2026-04'", dbx.Params{"a": ce.payable.Id})
	// A stored month with no cash row, its totals zero: a report that counts
	// months would show the account as active.
	saveRecord(t, ce.app, cashBalancesCollection, map[string]any{
		"account": ce.software.Id, "period": "2026-04", "month_start": "2026-04-01", "currency": "USD",
	})

	drifts, err := verifyCashBalances(ce.app)
	if err != nil {
		t.Fatalf("verifyCashBalances: %v", err)
	}
	got := map[balanceKey]BalanceDrift{}
	for _, d := range drifts {
		got[balanceKey{d.Account, d.Period}] = d
	}
	want := map[balanceKey]BalanceDrift{
		{ce.office.Id, "2026-05"}:   {ce.office.Id, "2026-05", 29846, 0, 29845, 0, "2026-05-01"},
		{ce.software.Id, "2026-03"}: {ce.software.Id, "2026-03", 0, 0, 0, 30000, ""},
		{ce.payable.Id, "2026-04"}:  {ce.payable.Id, "2026-04", 12345, 0, 12345, 0, "2026-04-02"},
		{ce.software.Id, "2026-04"}: {ce.software.Id, "2026-04", 0, 0, 0, 0, "2026-04-01"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("verifyCashBalances = %+v, want %+v", got, want)
	}

	fixed, err := rebuildBalances(ce.app)
	if err != nil {
		t.Fatalf("rebuildBalances: %v", err)
	}
	if fixed != 4 {
		t.Errorf("rebuildBalances fixed %d rows, want the 4 cash months", fixed)
	}
	requireCashMonthsEqualRows(t, ce.app)
	if drifts, err := verifyCashBalances(ce.app); err != nil || len(drifts) != 0 {
		t.Errorf("verifyCashBalances after the rebuild = %+v, err %v; want none", drifts, err)
	}
}

// A cash row deleted past the hooks is a drift of its month until the
// rebuild, which repairs the cash rows first and the months after.
func TestCashBalances_ARowDeletedPastTheHooksIsADrift(t *testing.T) {
	ce := cashBook(t)
	if _, err := ce.app.DB().NewQuery("DELETE FROM books_cash_basis_lines WHERE bill = {:b}").
		Bind(dbx.Params{"b": ce.bill.Id}).Execute(); err != nil {
		t.Fatalf("delete the bill's cash-basis rows: %v", err)
	}
	drifts, err := verifyCashBalances(ce.app)
	if err != nil || len(drifts) == 0 {
		t.Fatalf("verifyCashBalances after cash rows were deleted = %+v, err %v; want drifts", drifts, err)
	}
	if _, err := rebuildBalances(ce.app); err != nil {
		t.Fatalf("rebuildBalances: %v", err)
	}
	requireCashMonthsEqualRows(t, ce.app)
	requireNoDrift(t, ce.app)
}
