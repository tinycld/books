package books

import (
	"encoding/json"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The Method param (pay-bills spec §3.10): Profit and Loss, Profit and Loss by
// Month, Balance Sheet and Transaction Detail by Account read books.basis_lines
// and run on the accrual or the cash basis; the document header prints the
// basis; the statements' drills carry the method to Transaction Detail.

// cashReportBook is a bill payment env with Books' report sources, the shipped
// reports stored and shared as core's reconcile stores them, a retained
// earnings account, a fiscal year from January, and 6100 Office Expenses and
// 6300 Postage beside 6200 Software Subscriptions.
type cashReportBook struct {
	*billPayEnv
	reader          *core.Record
	td              *core.Record
	office, postage *core.Record
}

func newCashReportBook(t *testing.T) cashReportBook {
	t.Helper()
	bp := newBillPayEnv(t)
	registerBooksSources(t)
	mkUser(t, bp.app, "owner")
	if err := reports.ReconcileShipped(bp.app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	if err := reconcileBooksReportShares(bp.app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	td, err := bp.app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": transactionDetailKey})
	if err != nil {
		t.Fatalf("no reports row with shipped_key %s: %v", transactionDetailKey, err)
	}
	mkRetainedEarnings(t, bp.app, "3900")
	saveSettings(t, bp.app, map[string]any{"fiscal_year_start_month": 1})
	return cashReportBook{
		billPayEnv: bp,
		reader:     bp.users.readOnly,
		td:         td,
		office:     mkNumberedAccount(t, bp.app, "Office Expenses", "6100", "expense", "office_general"),
		postage:    mkNumberedAccount(t, bp.app, "Postage", "6300", "expense", "office_general"),
	}
}

// paidBook posts, on cashDay1, a bill of Office Supply World of 50.00 on 6300
// Postage (Bill 1001, never paid) and a bill of Summit IT Services of 1000.00,
// 6100 700.00 and 6200 300.00 (Bill 1002), and pays 400.00 of the second on
// cashDay2 (Bill payment 1001: its number differs from the bill's).
func paidBook(t *testing.T) (b cashReportBook, bill, payment *core.Record) {
	t.Helper()
	b = newCashReportBook(t)
	b.postedBillOn(t, b.officeSupply, cashDay1, billAmount{b.postage, 5000})
	bill = b.postedBillOn(t, b.summit, cashDay1, billAmount{b.office, 70000}, billAmount{b.software, 30000})
	payment = b.payOn(t, b.summit, cashDay2, payLine{bill, 40000})
	if bill.GetString("number") == payment.GetString("number") {
		t.Fatalf("bill and payment both numbered %s; the drill test needs them apart", bill.GetString("number"))
	}
	return b, bill, payment
}

func (b cashReportBook) pl(t *testing.T, from, to, method string) *reports.Result {
	t.Helper()
	return runPL(t, b.app, profitAndLossShipped(), b.reader, withMethod(map[string]any{"period": glPeriod(from, to)}, method), reports.Options{Today: plToday})
}

func (b cashReportBook) plByMonth(t *testing.T, from, to, method string) *reports.Result {
	t.Helper()
	return runPL(t, b.app, profitAndLossByMonthShipped(), b.reader, withMethod(map[string]any{"period": glPeriod(from, to)}, method), reports.Options{Today: plToday})
}

func (b cashReportBook) bs(t *testing.T, asOf, method string) *reports.Result {
	t.Helper()
	return runBS(t, b.app, b.reader, withMethod(map[string]any{"asOf": asOf, "rows": "active"}, method), reports.Options{Today: asOf})
}

// withMethod adds the method param; "" leaves it at its default.
func withMethod(params map[string]any, method string) map[string]any {
	if method != "" {
		params["method"] = method
	}
	return params
}

// plFigure is an account's P&L Total, 0 when the statement shows no row for it.
func plFigure(t *testing.T, res *reports.Result, account *core.Record) int64 {
	t.Helper()
	if !plHasRow(t, res, account) {
		return 0
	}
	return plAmount(t, plRowFor(t, res, account))
}

// bsFigure is an account's Balance Sheet Current figure, 0 when it has no row
// or a blank one.
func bsFigure(t *testing.T, res *reports.Result, account *core.Record) int64 {
	t.Helper()
	r, ok := bsFindAccount(res, account)
	if !ok {
		return 0
	}
	v, _ := moneyCell(t, r, "current")
	return v
}

// bsLineFigure is a labelled Balance Sheet row's Current figure, 0 when blank.
func bsLineFigure(t *testing.T, res *reports.Result, label string) int64 {
	t.Helper()
	v, _ := moneyCell(t, bsRow(t, res, label), "current")
	return v
}

func requireHeaderLines(t *testing.T, what string, res *reports.Result, want string) {
	t.Helper()
	if !reflect.DeepEqual(res.HeaderLines, []string{want}) {
		t.Errorf("%s header lines = %q, want [%q]", what, res.HeaderLines, want)
	}
}

// requireMethodDrill fails unless the row's <col>@drill carries method = want.
func requireMethodDrill(t *testing.T, r reports.Row, colID, want string) {
	t.Helper()
	got, ok := drillOf(t, r, colID)
	if !ok {
		t.Fatalf("%s (%s) has no %s@drill cell (drill cells %v)", r.Label, r.Kind, colID, drillKeys(r))
	}
	raw, has := got["method"]
	if !has {
		t.Errorf("%s (%s) %s@drill = %v, want method %q among its params", r.Label, r.Kind, colID, got, want)
		return
	}
	var method string
	if err := json.Unmarshal(raw, &method); err != nil || method != want {
		t.Errorf("%s (%s) %s@drill method = %s, want %q", r.Label, r.Kind, colID, raw, want)
	}
}

func TestCashBasisReport_ProfitAndLoss(t *testing.T) {
	b, _, _ := paidBook(t)

	accrual := b.pl(t, cashDay1, cashDay2, "")
	if got := plFigure(t, accrual, b.office); got != 70000 {
		t.Errorf("Accrual over %s..%s: 6100 = %d, want 70000", cashDay1, cashDay2, got)
	}
	if got := plFigure(t, accrual, b.postage); got != 5000 {
		t.Errorf("Accrual: 6300 = %d, want 5000 (the unpaid bill counts)", got)
	}
	requireHeaderLines(t, "the default (Accrual) run", accrual, "Accrual basis")
	requireHeaderLines(t, "the Accrual run", b.pl(t, cashDay1, cashDay2, "accrual"), "Accrual basis")

	beforePaid := b.pl(t, cashDay1, cashDay1, "cash")
	if got := plFigure(t, beforePaid, b.office); got != 0 {
		t.Errorf("Cash over %s..%s: 6100 = %d, want 0 (nothing paid yet)", cashDay1, cashDay1, got)
	}
	requireHeaderLines(t, "the Cash run", beforePaid, "Cash basis")

	cash := b.pl(t, cashDay1, cashDay2, "cash")
	for _, w := range []struct {
		account *core.Record
		want    int64
	}{{b.office, 28000}, {b.software, 12000}, {b.postage, 0}} {
		if got := plFigure(t, cash, w.account); got != w.want {
			t.Errorf("Cash over %s..%s: %s = %d, want %d", cashDay1, cashDay2, w.account.GetString("name"), got, w.want)
		}
	}
	if got := plAmount(t, plComputedRow(t, cash, "Net income")); got != -40000 {
		t.Errorf("Cash Net income = %d, want -40000 (the 400.00 paid)", got)
	}
	requireHeaderLines(t, "the Cash run", cash, "Cash basis")
}

func TestCashBasisReport_ProfitAndLossByMonthPlacesTheShareInItsMonth(t *testing.T) {
	b, _, _ := paidBook(t)
	res := b.plByMonth(t, cashDay1, cashDay2, "cash")
	row := plRowFor(t, res, b.office)
	if got := plMonthCell(t, res, row, "2026-03"); got != 0 {
		t.Errorf("Cash: 6100 in March = %d, want 0 (the bill's month; nothing paid)", got)
	}
	if got := plMonthCell(t, res, row, "2026-04"); got != 28000 {
		t.Errorf("Cash: 6100 in April = %d, want 28000 (the payment's month)", got)
	}
	requireHeaderLines(t, "Profit and Loss by Month on Cash", res, "Cash basis")
	for _, c := range plMonths(res) {
		if c.Pivot.Key == "2026-04" {
			requireMethodDrill(t, row, c.ID, "cash")
		}
	}
	requireMethodDrill(t, row, "amount", "cash")
}

func TestCashBasisReport_BalanceSheetBalancesOnCash(t *testing.T) {
	b, _, _ := paidBook(t)
	accrual := b.bs(t, cashDay2, "accrual")
	cash := b.bs(t, cashDay2, "cash")
	requireHeaderLines(t, "the Balance Sheet on Accrual", accrual, "Accrual basis")
	requireHeaderLines(t, "the Balance Sheet on Cash", cash, "Cash basis")

	assets := bsLineFigure(t, cash, "Total Assets")
	liabilities := bsLineFigure(t, cash, "Total Liabilities")
	equity := bsLineFigure(t, cash, "Total Equity")
	if total := bsLineFigure(t, cash, "Total liabilities and equity"); assets != total || total != liabilities+equity {
		t.Errorf("Cash: Total Assets %d, Total Liabilities %d + Total Equity %d = Total liabilities and equity %d; want them to balance",
			assets, liabilities, equity, total)
	}
	if got := bsFigure(t, cash, b.checking1000); got != -40000 {
		t.Errorf("Cash: 1000 Business Checking = %d, want -40000 (a payment counts as posted)", got)
	}
	// Accrual holds 600.00 + 50.00 unpaid; on cash nothing unpaid is owed.
	accrualAP, cashAP := bsFigure(t, accrual, b.payable), bsFigure(t, cash, b.payable)
	if accrualAP != 65000 || accrualAP-cashAP != 65000 {
		t.Errorf("Accounts Payable: Accrual %d, Cash %d; want 65000 and the unpaid 65000 less on Cash", accrualAP, cashAP)
	}
	if got := bsLineFigure(t, accrual, "Net income"); got != -105000 {
		t.Errorf("Accrual Net income = %d, want -105000", got)
	}
	if got := bsLineFigure(t, cash, "Net income"); got != -40000 {
		t.Errorf("Cash Net income = %d, want -40000 (read from the same source on Cash)", got)
	}

	row := bsAccount(t, cash, b.checking1000)
	requireMethodDrill(t, row, "current", "cash")
}

// On Cash an account's Current drills from the first day of the month of its
// first line on the cash basis, a cash-basis row included, and lists the same
// lines as a range from that line's own day.
func TestCashBasisReport_BalanceSheetDrillStartsOnTheFirstOfTheMonth(t *testing.T) {
	b, _, _ := paidBook(t)
	const cashMethod = `"cash"`
	tdOnCash := func(account *core.Record, from string) *reports.Result {
		return runTD(t, b.app, b.reader, map[string]any{
			"period": glPeriod(from, cashDay2), "method": "cash", "accounts": []string{account.Id},
		}, reports.Options{Today: plToday})
	}
	requireSameLines := func(what string, res *reports.Result, account *core.Record, firstDay string, wantLines int) {
		t.Helper()
		row := bsAccount(t, res, account)
		td := drillTD(t, b.app, b.reader, res, row.ID, "current")
		requireHeaderLines(t, what+": the drilled Transaction Detail", td, "Cash basis")
		got, want := tdLineIDs(t, td, account), tdLineIDs(t, tdOnCash(account, firstDay), account)
		if len(got) != wantLines || !slices.Equal(got, want) {
			t.Errorf("%s drills to lines %v, want the %d lines of a range from the first line's day %s: %v", what, got, wantLines, firstDay, want)
		}
		if total, figure := tdSectionTotal(t, td, account), bsFigure(t, res, account); total != figure {
			t.Errorf("%s drills to a total of %d, want the figure %d", what, total, figure)
		}
	}

	cash := b.bs(t, cashDay2, "cash")
	// Accounts Payable's first line is of March 10 (the bills).
	requireDrill(t, bsAccount(t, cash, b.payable), "current", map[string]string{
		"period": rangeJSON("2026-03-01", cashDay2), "method": cashMethod, "accounts": idList(b.payable.Id)})
	requireSameLines("Accounts Payable", cash, b.payable, cashDay1, 6)
	// Business Checking's first line is the payment of April 15.
	requireDrill(t, bsAccount(t, cash, b.checking1000), "current", map[string]string{
		"period": rangeJSON("2026-04-01", cashDay2), "method": cashMethod, "accounts": idList(b.checking1000.Id)})
	requireSameLines("Business Checking", cash, b.checking1000, cashDay2, 1)

	// Both months exist and differ: with the March stored month gone, the stored
	// month is April and the cash month is March; the drill takes the earlier.
	if _, err := b.app.DB().NewQuery("DELETE FROM books_account_balances WHERE account = {:a} AND month_start = '2026-03-01'").Bind(dbx.Params{"a": b.payable.Id}).Execute(); err != nil {
		t.Fatalf("delete the March stored month of Accounts Payable: %v", err)
	}
	stored := b.bs(t, cashDay2, "cash")
	requireDrill(t, bsAccount(t, stored, b.payable), "current", map[string]string{
		"period": rangeJSON("2026-03-01", cashDay2), "method": cashMethod, "accounts": idList(b.payable.Id)})
	storedTD := drillTD(t, b.app, b.reader, stored, bsAccount(t, stored, b.payable).ID, "current")
	if got, want := tdLineIDs(t, storedTD, b.payable), tdLineIDs(t, tdOnCash(b.payable, cashDay1), b.payable); len(got) == 0 || !slices.Equal(got, want) {
		t.Errorf("Accounts Payable with only its April stored month drills to lines %v, want the lines of a range from %s: %v", got, cashDay1, want)
	}

	// An account whose cash-basis rows start in a month with no ledger line of
	// its own: with Accounts Payable's stored months gone, only its cash-basis
	// rows give the first month.
	if _, err := b.app.DB().NewQuery("DELETE FROM books_account_balances WHERE account = {:a}").Bind(dbx.Params{"a": b.payable.Id}).Execute(); err != nil {
		t.Fatalf("delete the stored months of Accounts Payable: %v", err)
	}
	cashOnly := b.bs(t, cashDay2, "cash")
	requireDrill(t, bsAccount(t, cashOnly, b.payable), "current", map[string]string{
		"period": rangeJSON("2026-03-01", cashDay2), "method": cashMethod, "accounts": idList(b.payable.Id)})
	// No total check: the figure falls with its stored months, the lines do not.
	cashOnlyTD := drillTD(t, b.app, b.reader, cashOnly, bsAccount(t, cashOnly, b.payable).ID, "current")
	if got, want := tdLineIDs(t, cashOnlyTD, b.payable), tdLineIDs(t, tdOnCash(b.payable, cashDay1), b.payable); len(got) == 0 || !slices.Equal(got, want) {
		t.Errorf("Accounts Payable with no stored month drills to lines %v, want the lines of a range from %s: %v", got, cashDay1, want)
	}
}

// A bill dated in the prior fiscal year and paid in the current one counts in
// the current year only on Cash: Retained earnings at a date after the
// fiscal-year end take the prior year's cash net income, which has none of it.
func TestCashBasisReport_RetainedEarningsOnCash(t *testing.T) {
	b := newCashReportBook(t)
	bill := b.postedBillOn(t, b.summit, "2025-12-10", billAmount{b.office, 50000})
	b.payOn(t, b.summit, "2026-02-10", payLine{bill, 50000})
	const asOf = "2026-04-30"

	accrual := b.bs(t, asOf, "accrual")
	if re, ni := bsLineFigure(t, accrual, "Retained earnings"), bsLineFigure(t, accrual, "Net income"); re != -50000 || ni != 0 {
		t.Errorf("Accrual: Retained earnings %d, Net income %d; want -50000 and 0 (the bill is in 2025)", re, ni)
	}
	cash := b.bs(t, asOf, "cash")
	if re, ni := bsLineFigure(t, cash, "Retained earnings"), bsLineFigure(t, cash, "Net income"); re != 0 || ni != -50000 {
		t.Errorf("Cash: Retained earnings %d, Net income %d; want 0 and -50000 (paid in 2026)", re, ni)
	}
}

// A drill from the cash P&L opens Transaction Detail on Cash, which lists the
// payment's share row under the payment entry's number.
func TestCashBasisReport_DrillKeepsTheMethod(t *testing.T) {
	b, bill, payment := paidBook(t)
	res := b.pl(t, cashDay1, cashDay2, "cash")
	requireColumnDrill(t, res, "amount", b.td)
	row := plRowFor(t, res, b.office)
	requireMethodDrill(t, row, "amount", "cash")

	td := drillTD(t, b.app, b.reader, res, row.ID, "amount")
	requireHeaderLines(t, "the drilled Transaction Detail", td, "Cash basis")
	if got := tdSectionTotal(t, td, b.office); got != 28000 {
		t.Errorf("the drilled Total 6100 = %d, want the pressed 28000", got)
	}
	paymentNumber := reload(t, b.app, "books_journal_entries", payment.GetString("entry")).GetString("number")
	wantMemo := "Bill " + bill.GetString("number") + " paid (cash basis)"
	var found bool
	for _, l := range sectionFor(t, td, b.office).lines {
		if textCell(t, l, "description") != wantMemo {
			continue
		}
		found = true
		if got := tdAmountOf(t, l); got != 28000 {
			t.Errorf("the share line's Amount = %d, want 28000", got)
		}
		if got := textCell(t, l, "number"); got != paymentNumber {
			t.Errorf("the share line's No. = %q, want the payment entry's %q", got, paymentNumber)
		}
	}
	if !found {
		var got []string
		for _, l := range sectionFor(t, td, b.office).lines {
			got = append(got, textCell(t, l, "description"))
		}
		t.Errorf("the drilled 6100 lines %q have none with %q", got, wantMemo)
	}

	unpaid := false
	for _, l := range sectionFor(t, td, b.office).lines {
		if textCell(t, l, "description") == "Unpaid bill (cash basis)" {
			unpaid = true
			if got := textCell(t, l, "number"); got != bill.GetString("number") {
				t.Errorf("the taken-out line's No. = %q, want the bill entry's %q", got, bill.GetString("number"))
			}
		}
	}
	if !unpaid {
		t.Error("the drilled 6100 lines have no taken-out line \"Unpaid bill (cash basis)\"")
	}

	accrualTD := runTD(t, b.app, b.reader, map[string]any{
		"period": glPeriod(cashDay1, cashDay2), "accounts": []string{b.office.Id},
	}, reports.Options{Today: plToday})
	requireHeaderLines(t, "Transaction Detail on its default", accrualTD, "Accrual basis")
	if got := tdSectionTotal(t, accrualTD, b.office); got != 70000 {
		t.Errorf("Transaction Detail on Accrual: Total 6100 = %d, want 70000", got)
	}
}

func TestCashBasisReport_ShippedSpecs(t *testing.T) {
	app := newBooksApp(t)
	registerBooksSources(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	cases := []struct {
		shipped  reports.Shipped
		revision int
		after    string
	}{
		{profitAndLossShipped(), 3, "period"},
		{profitAndLossByMonthShipped(), 3, "period"},
		// 3 for the Method param, 4 for the stored months, 5 for the stored
		// months on Cash, 6 for the drill's first day from the stored months.
		{balanceSheetShipped(), 6, "asOf"},
		{transactionDetailShipped(), 2, "period"},
	}
	for _, c := range cases {
		t.Run(c.shipped.Title, func(t *testing.T) {
			if c.shipped.Revision != c.revision {
				t.Errorf("revision %d, want %d (the Method param's, or a later one)", c.shipped.Revision, c.revision)
			}
			if strings.Contains(strings.ToLower(c.shipped.Description), "accrual basis") {
				t.Errorf("description %q still says \"accrual basis\"", c.shipped.Description)
			}
			spec, _, err := reports.Load(c.shipped.Spec)
			if err != nil {
				t.Fatalf("Load: %v", err)
			}
			if spec.Source != "books.basis_lines" {
				t.Errorf("source = %q, want books.basis_lines", spec.Source)
			}
			if err := reports.Validate(app, spec); err != nil {
				t.Errorf("Validate: %v", err)
			}
			at := -1
			for i, p := range spec.Params {
				if p.ID == "method" {
					at = i
				}
			}
			if at < 1 || spec.Params[at-1].ID != c.after {
				t.Fatalf("params %v: want method right after %s", paramIDs(spec), c.after)
			}
			m := spec.Params[at]
			if !reflect.DeepEqual(m, methodParam()) {
				t.Errorf("method = %+v, want methodParam() %+v", m, methodParam())
			}
			wantOptions := []reports.Option{{Value: "accrual", Label: "Accrual"}, {Value: "cash", Label: "Cash"}}
			if m.Type != reports.ParamChoice || m.Label != "Method" || m.Multiple ||
				!reflect.DeepEqual(m.Options, wantOptions) || !jsonEqual(t, m.Default, `"accrual"`) || m.Header != "{label} basis" {
				t.Errorf("method = %+v (default %s), want the single choice \"Method\" of Accrual (default) and Cash, header \"{label} basis\"", m, m.Default)
			}
		})
	}

	// General Ledger, Trial Balance and Journal keep the accrual basis only.
	for _, shipped := range []reports.Shipped{generalLedgerShipped(), trialBalanceShipped(), journalShipped()} {
		spec, _, err := reports.Load(shipped.Spec)
		if err != nil {
			t.Fatalf("%s: Load: %v", shipped.Title, err)
		}
		if _, ok := findParam(spec, "method"); ok {
			t.Errorf("%s has a method param, want none (accrual only)", shipped.Title)
		}
	}
}

func paramIDs(spec *reports.Spec) []string {
	out := make([]string, len(spec.Params))
	for i, p := range spec.Params {
		out[i] = p.ID
	}
	return out
}
