package books

import (
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The Cash Balance Sheet reads the cash-basis rows of the months before a
// day's month from the stored cash months (books_cash_basis_balances), and the
// rows of the day's month as lines. These tests hold its figures to the line
// read and prove each of its four reads of the table.

// newBSCashBillBook is a book of bills over two fiscal years, built through
// the write paths: a bill of 2025-08-12 (700.00 office, 300.00 software), a
// payment of 2025-09-20 that is voided, a payment of 2025-11-05 that a
// correction of 2026-02-10 replaces, an unpaid bill of 2026-01-15 (postage), a
// bill of 2026-03-10 that a correction replaces (200.00 software), and a
// payment of 2026-04-15 on the correction. No line is dated October or
// December 2025, or May 2026 and later.
func newBSCashBillBook(t *testing.T) cashReportBook {
	t.Helper()
	b := newCashReportBook(t)
	first := b.postedBillOn(t, b.summit, "2025-08-12", billAmount{b.office, 70000}, billAmount{b.software, 30000})
	voided := b.payOn(t, b.summit, "2025-09-20", payLine{first, 40000})
	if err := voidBillPaymentAs(b.app, voided.Id, b.users.bookkeeper.Id); err != nil {
		t.Fatalf("void a payment: %v", err)
	}
	replaced := b.payOn(t, b.summit, "2025-11-05", payLine{first, 25000})
	b.pay(t, b.summit, map[string]any{"date": "2026-02-10", "replaces": replaced.Id}, payLine{first, 30000})
	b.postedBillOn(t, b.officeSupply, "2026-01-15", billAmount{b.postage, 5000})
	wrong := b.postedBillOn(t, b.officeSupply, "2026-03-10", billAmount{b.office, 12345})
	draft := mkBill(t, b.app, b.officeSupply, map[string]any{"date": "2026-03-10", "due_date": "2026-03-10", "replaces": wrong.Id})
	mkBillLine(t, b.app, draft, 0, accountLine(b.software, 20000))
	corrected := mustPostBill(t, b.app, draft.Id, b.users.bookkeeper.Id)
	b.payOn(t, b.officeSupply, "2026-04-15", payLine{corrected, 10000})
	requireNoCashDrift(t, b.app)
	return b
}

// bsCashBillDays are a day in each month with a line, the days of the void and
// of the two corrections, a day before the cash rows of its own month
// (2026-04-10: the payment is of April 15), days in months with no line
// (October and December 2025, May 2026 and later), the first and last day of
// both fiscal years, and days whose prior day is a day with a line
// (2026-09-20, 2026-11-05, 2027-02-10).
var bsCashBillDays = []string{
	"2025-08-31", "2025-09-20", "2025-10-31", "2025-12-31", "2026-01-01", "2026-01-31", "2026-02-10",
	"2026-03-10", "2026-04-10", "2026-04-30", "2026-05-31", "2026-06-30", "2026-07-01", "2026-09-20", "2026-11-05", "2027-02-10",
}

// newBSCashInvoiceBook is a book of invoices built through the write paths: an
// invoice of 2026-02-03 (500.00), a payment of 300.00 on 2026-03-12, an
// invoice correction (450.00) that takes over the payment, and an unpaid
// invoice of 2026-05-06. No line is dated April 2026.
func newBSCashInvoiceBook(t *testing.T) tbBook {
	t.Helper()
	pe := newPaymentEnv(t)
	registerBooksSources(t)
	invoice := func(fields map[string]any, total int64) *core.Record {
		t.Helper()
		draft, err := newInvoice(pe.app, pe.customer, fields)
		if err != nil {
			t.Fatalf("save a draft invoice: %v", err)
		}
		mkInvoiceLine(t, pe.app, draft, 0, item(pe.service, 1, total, false))
		return mustPostInvoice(t, pe.app, draft.Id, pe.users.bookkeeper.Id)
	}
	first := invoice(map[string]any{"date": "2026-02-03", "due_date": "2026-03-03"}, 50000)
	p := pe.mkPayment(t, map[string]any{"date": "2026-03-12", "amount": 30000, "deposit_to": pe.checking.Id})
	mkApplication(t, pe.app, p, first, 0, 30000)
	mustPostPayment(t, pe.app, p.Id, pe.users.bookkeeper.Id)
	invoice(map[string]any{"date": "2026-02-03", "due_date": "2026-03-03", "replaces": first.Id}, 45000)
	invoice(map[string]any{"date": "2026-05-06", "due_date": "2026-06-05"}, 8000)
	requireNoCashDrift(t, pe.app)
	return tbBook{app: pe.app, reader: pe.users.readOnly}
}

// bsCashInvoiceDays hold a day before the cash rows of its own month
// (2026-03-05: the payment is of March 12) and a month with no line (April).
var bsCashInvoiceDays = []string{
	"2026-02-03", "2026-02-28", "2026-03-05", "2026-03-12", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30", "2026-07-01",
	"2027-03-12", "2027-05-06",
}

// requireBSStoredEqualsLines runs the Balance Sheet and its line read
// (balanceSheetSpecFromLines) on each method, day and Rows choice, and fails
// when a row, a figure or a currency code differs. The book must have
// cash-basis rows and stored cash months: on the last day the Cash run differs
// from the Accrual run, and its Total Assets names the currency in both
// columns.
func requireBSStoredEqualsLines(t *testing.T, what string, book tbBook, days []string) {
	t.Helper()
	if n, err := book.app.CountRecords(cashBalancesCollection); err != nil || n == 0 {
		t.Fatalf("%s: %d stored cash months (err %v), want some", what, n, err)
	}
	last := map[string]string{}
	for _, method := range []string{"accrual", "cash"} {
		for _, asOf := range days {
			for _, rows := range []string{"nonzero", "active"} {
				params := map[string]any{"asOf": asOf, "rows": rows, "method": method}
				opts := reports.Options{Today: asOf}
				stored := bsFigures(runTBSpec(t, book, balanceSheetSpec(), params, opts))
				lines := bsFigures(runTBSpec(t, book, balanceSheetSpecFromLines(), params, opts))
				if stored != lines {
					t.Errorf("%s, %s, as of %s, rows %s:\nstored months\n%s\nlines\n%s", what, method, asOf, rows, stored, lines)
				}
				last[method] = stored
			}
		}
	}
	if last["cash"] == last["accrual"] {
		t.Errorf("%s: the Cash run equals the Accrual run on the last day, so the book proves nothing", what)
	}
	named := false
	for _, line := range strings.Split(last["cash"], "\n") {
		if strings.Contains(line, "|Total Assets|") {
			named = strings.Count(line, " USD") == 2
		}
	}
	if !named {
		t.Errorf("%s: Total Assets on Cash does not show USD on Current and Prior year in\n%s", what, last["cash"])
	}
}

// The stored read shows what the line read shows on a book whose cash-basis
// rows come from posts, payments, a void, a replaced payment and a corrected
// bill, with the fiscal year starting in January and in July.
func TestBalanceSheetCashMonthsEqualTheLines_Bills(t *testing.T) {
	for _, fiscalStart := range []int{1, 7} {
		b := newBSCashBillBook(t)
		saveSettings(t, b.app, map[string]any{"fiscal_year_start_month": fiscalStart})
		requireBSStoredEqualsLines(t, map[int]string{1: "fiscal start 1", 7: "fiscal start 7"}[fiscalStart],
			tbBook{app: b.app, reader: b.reader}, bsCashBillDays)
	}
}

// The same on a book with an invoice correction that takes over a payment.
func TestBalanceSheetCashMonthsEqualTheLines_InvoiceCorrection(t *testing.T) {
	for _, fiscalStart := range []int{1, 7} {
		book := newBSCashInvoiceBook(t)
		saveSettings(t, book.app, map[string]any{"fiscal_year_start_month": fiscalStart})
		requireBSStoredEqualsLines(t, map[int]string{1: "fiscal start 1", 7: "fiscal start 7"}[fiscalStart], book, bsCashInvoiceDays)
	}
}

// bumpCashMonth adds 7 to the stored debit of one cash month, past the hooks.
func bumpCashMonth(t *testing.T, app core.App, account *core.Record, period string) {
	t.Helper()
	res, err := app.DB().NewQuery("UPDATE books_cash_basis_balances SET debit_total = debit_total + 7 WHERE account = {:a} AND period = {:p}").
		Bind(dbx.Params{"a": account.Id, "p": period}).Execute()
	if err != nil {
		t.Fatal(err)
	}
	if n, _ := res.RowsAffected(); n != 1 {
		t.Fatalf("cash month %s %s: %d rows changed, want 1", account.GetString("name"), period, n)
	}
}

// On Cash the months before a day's month are read from the stored cash
// months, and the day's month from its rows; an Accrual run reads no stored
// cash month. paidBook: bills of March 10, a payment of April 15.
func TestBalanceSheetReadsTheStoredCashMonths(t *testing.T) {
	b, _, _ := paidBook(t)
	type figures struct{ payable, payablePrior, retained, netIncomePrior int64 }
	cell := func(r reports.Row, col string) int64 {
		t.Helper()
		v, _ := moneyCell(t, r, col)
		return v
	}
	// As of 2027-06-30 the prior day is 2026-06-30: 2026 income and expense are
	// Retained earnings on the day and Net income on the prior day.
	read := func(method string) figures {
		t.Helper()
		res := b.bs(t, "2027-06-30", method)
		payable := bsAccount(t, res, b.payable)
		return figures{
			cell(payable, "current"), cell(payable, "prior"),
			cell(bsRow(t, res, "Retained earnings"), "current"), cell(bsRow(t, res, "Net income"), "prior"),
		}
	}
	accrual, cash := read("accrual"), read("cash")
	april := bsFigure(t, b.bs(t, "2026-04-30", "cash"), b.payable)

	bumpCashMonth(t, b.app, b.payable, "2026-04")
	bumpCashMonth(t, b.app, b.office, "2026-03")

	// A debit lowers Accounts Payable (credit-normal) and raises an expense.
	want := figures{cash.payable - 7, cash.payablePrior - 7, cash.retained - 7, cash.netIncomePrior - 7}
	if got := read("cash"); got != want {
		t.Errorf("Cash after two earlier stored cash months rose by 7 = %+v, want %+v (before: %+v): the months before a day's month are read from books_cash_basis_balances", got, want, cash)
	}
	if got := read("accrual"); got != accrual {
		t.Errorf("Accrual after two stored cash months rose by 7 = %+v, want %+v: an Accrual run reads no cash month", got, accrual)
	}
	if got := bsFigure(t, b.bs(t, "2026-04-30", "cash"), b.payable); got != april {
		t.Errorf("Cash as of 2026-04-30, Accounts Payable = %d, want %d: April is the day's month, read from its rows, not from its stored cash month", got, april)
	}
}

// With Rows "Active", an account whose only activity is a stored cash month
// before the day's month has a row on Cash and none on Accrual.
func TestBalanceSheetCashMonthMakesAnAccountActive(t *testing.T) {
	b, _, _ := paidBook(t)
	// This row is a fixture the write paths never make: they store no month
	// without a posted cash row. It leaves the account's only activity a stored cash month.
	saveRecord(t, b.app, cashBalancesCollection, map[string]any{
		"account": b.savings1010.Id, "period": "2026-03", "month_start": "2026-03-01", "currency": "USD",
	})
	shown := func(method, rows string) bool {
		t.Helper()
		res := runBS(t, b.app, b.reader, map[string]any{"asOf": "2026-06-30", "rows": rows, "method": method}, reports.Options{Today: "2026-06-30"})
		_, ok := bsFindAccount(res, b.savings1010)
		return ok
	}
	if !shown("cash", "active") {
		t.Error("Cash, Rows Active: 1010 Business Savings has no row, want one (it has a stored cash month before June)")
	}
	if shown("accrual", "active") {
		t.Error("Accrual, Rows Active: 1010 Business Savings has a row, want none (a cash month is no Accrual activity)")
	}
	if shown("cash", "nonzero") {
		t.Error("Cash, Rows Non-zero: 1010 Business Savings has a row, want none (its figures are 0)")
	}
}

// An opened account on Cash: the row for the months before the day's month
// holds the stored months and the stored cash months, then come the month's
// ledger lines and cash-basis rows; together they are the account's figure.
// paidBook: Accounts Payable holds 1,050.00 at the end of March on Accrual and
// nothing on Cash (both bills are unpaid, so the cash basis takes them out).
func TestBalanceSheetCashOpenedAccountRows(t *testing.T) {
	b, _, _ := paidBook(t)
	for _, c := range []struct {
		method           string
		opening, account int64
		lines            int
	}{
		// April: the payment's line (−400.00).
		{"accrual", 105000, 65000, 1},
		// April: the payment's line and its cash-basis share row (+400.00).
		{"cash", 0, 0, 2},
	} {
		params := map[string]any{"asOf": "2026-04-20", "rows": "active", "method": c.method}
		opts := reports.Options{Today: "2026-04-20"}
		closed := runBS(t, b.app, b.reader, params, opts)
		opts.Collapse = [][]any{}
		opts.Expand = [][]any{bsWireKey(t, bsAccount(t, closed, b.payable).GroupKey)}
		open := runBS(t, b.app, b.reader, params, opts)
		account := bsAccount(t, open, b.payable)
		var under []reports.Row
		for _, r := range open.Rows {
			if r.Section == account.ID && (r.Kind == reports.KindOpening || r.Kind == reports.KindDetail) {
				under = append(under, r)
			}
		}
		if len(under) != c.lines+1 || under[0].Kind != reports.KindOpening {
			t.Fatalf("%s: Accounts Payable's opened rows = %q, want the opening row and %d lines", c.method, labelsOf(under), c.lines)
		}
		sum := int64(0)
		for _, r := range under {
			v, _ := moneyCell(t, r, "current")
			sum += v
		}
		opening, _ := moneyCell(t, under[0], "current")
		figure, _ := moneyCell(t, account, "current")
		if opening != c.opening || figure != c.account || sum != figure {
			t.Errorf("%s: opening row %d, account row %d, opened rows add to %d; want %d, %d, and the rows to add to the account row",
				c.method, opening, figure, sum, c.opening, c.account)
		}
	}
}

// On Cash a drill starts on the first day of the account's first stored month,
// ledger or cash. With Accounts Payable's ledger months and its March cash
// month gone, that is April: the day comes from the stored cash months, not
// from the cash-basis rows (which start on March 10).
func TestBalanceSheetCashDrillStartsAtTheFirstStoredCashMonth(t *testing.T) {
	b, _, _ := paidBook(t)
	exec := func(what, sql string) {
		t.Helper()
		if _, err := b.app.DB().NewQuery(sql).Bind(dbx.Params{"a": b.payable.Id}).Execute(); err != nil {
			t.Fatalf("%s: %v", what, err)
		}
	}
	exec("delete the stored months of Accounts Payable", "DELETE FROM books_account_balances WHERE account = {:a}")
	requireDrill(t, bsAccount(t, b.bs(t, cashDay2, "cash"), b.payable), "current", map[string]string{
		"period": rangeJSON("2026-03-01", cashDay2), "method": `"cash"`, "accounts": idList(b.payable.Id)})
	exec("delete the March cash month of Accounts Payable", "DELETE FROM books_cash_basis_balances WHERE account = {:a} AND period = '2026-03'")
	requireDrill(t, bsAccount(t, b.bs(t, cashDay2, "cash"), b.payable), "current", map[string]string{
		"period": rangeJSON("2026-04-01", cashDay2), "method": `"cash"`, "accounts": idList(b.payable.Id)})
}
