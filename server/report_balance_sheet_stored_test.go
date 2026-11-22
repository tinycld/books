package books

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/reports"
)

// bsLinesSum is credits − debits of the posted lines on or before x that match
// which, read from the lines alone.
func bsLinesSum(x, which *reports.Node) *reports.Node {
	return glSum("books.basis_lines", op("sub", fld("credit"), fld("debit")),
		basisFilter(), op("eq", fld("posted"), lit(true)), op("lte", fld("date"), x), which)
}

// balanceSheetSpecFromLines is the Balance Sheet as it was before it read the
// stored months: its rows are every posted line up to the as-of day, each
// figure is a sum over them, and Retained earnings and Net income read every
// line. The stored read must show what it shows.
func balanceSheetSpecFromLines() *reports.Spec {
	d := prm("asOf")
	dPrior := op("addMonths", prm("asOf"), lit(-12))
	signed := bsSigned("debit", "credit")
	pl := op("in", fld("account", "type"), lit(profitAndLossTypes()))
	retained := func(x *reports.Node) *reports.Node {
		return bsLinesSum(x, op("or",
			op("eq", fld("account", "detail_type"), lit("retained_earnings")),
			op("and", pl, op("lt", op("fiscalYear", fld("date")), op("fiscalYear", x))),
		))
	}
	netIncome := func(x *reports.Node) *reports.Node {
		return bsLinesSum(x, op("and", pl, op("gte", op("fiscalYear", fld("date")), op("fiscalYear", x))))
	}
	spec := balanceSheetSpec()
	spec.Filter = op("and",
		basisFilter(),
		op("eq", fld("posted"), lit(true)),
		op("lte", fld("date"), d),
		op("not", pl),
		op("ne", fld("account", "detail_type"), lit("retained_earnings")),
	)
	for i := range spec.Columns {
		c := &spec.Columns[i]
		switch c.ID {
		case "current":
			c.Total, c.Rollup, c.Drill = "", nil, nil
			c.Formula = op("coalesce", op("sum", signed), lit(0))
		case "prior":
			c.Total, c.Rollup, c.Drill = "", nil, nil
			c.Formula = op("coalesce", op("sum", op("if", op("lte", fld("date"), dPrior), signed, lit(nil))), lit(0))
		}
	}
	g := &spec.Groups[len(spec.Groups)-1]
	g.Fill, g.Opening = nil, nil
	g.Having = op("or",
		op("eq", prm("rows"), lit("active")),
		op("ne", col("current"), lit(0)),
		op("ne", col("prior"), lit(0)),
	)
	for i := range spec.Layout {
		switch item := &spec.Layout[i]; item.Row {
		case "retainedEarnings":
			item.Cells = map[string]*reports.Node{"current": retained(d), "prior": retained(dPrior)}
		case "netIncome":
			item.Cells = map[string]*reports.Node{"current": netIncome(d), "prior": netIncome(dPrior)}
		}
	}
	return spec
}

// bsFigures writes every row as one line: its kind, level, label, and the
// four figures, Current and Prior year with their currency codes. A cell the
// row does not have reads <nil>.
func bsFigures(res *reports.Result) string {
	var out strings.Builder
	for _, r := range res.Rows {
		fmt.Fprintf(&out, "%s|%d|%s|%v %v|%v %v|%v|%v\n", r.Kind, r.Level, r.Label,
			r.Cells["current"], r.Cells["current@currency"], r.Cells["prior"], r.Cells["prior@currency"],
			r.Cells["change"], r.Cells["pct"])
	}
	return out.String()
}

// bsStoredBook has three fiscal years of posted lines. Income and expense of
// 2024 and 2025 fold into Retained earnings; Retained earnings has lines of
// its own (June 2025, March 2026). No line is dated May, October or November
// 2026. Equipment (the only fixed asset) and Loan (the only long-term
// liability) have lines of 2025 only, so in 2026 their class has no line in
// the month. Netted is back at 0 from April 2026 on; Idle has no line; Closed
// is inactive with a balance.
type bsStoredBook struct {
	bsBook
	checking, savings, receivable, equipment, visa, loan, owner, retained, income, rent, netted, idle, closed *core.Record
}

func newBSStoredBook(t *testing.T) bsStoredBook {
	t.Helper()
	b := bsStoredBook{bsBook: newBSBook(t)}
	b.checking = b.account(t, "Operating", "1000", "bank", "checking")
	b.savings = b.account(t, "Reserve", "1010", "bank", "savings")
	b.netted = b.account(t, "Netted", "1020", "bank", "checking")
	b.idle = b.account(t, "Idle", "1030", "bank", "checking")
	b.closed = b.account(t, "Closed", "1040", "bank", "checking")
	b.receivable = b.account(t, "Receivables", "1100", "accounts_receivable", "accounts_receivable")
	b.equipment = b.account(t, "Equipment", "1500", "fixed_asset", "machinery_equipment")
	b.visa = b.account(t, "Visa", "2100", "credit_card", "credit_card")
	b.loan = b.account(t, "Bank loan", "2700", "long_term_liability", "notes_payable")
	b.owner = b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	b.retained = mkRetainedEarnings(t, b.app, "3900")
	b.income = b.account(t, "Fees", "4000", "income", "service_income")
	b.rent = b.account(t, "Office rent", "6000", "expense", "rent_lease")
	b.post(t, "2024-08-10", ln{b.checking, 50000, 0}, ln{b.income, 0, 50000})
	b.post(t, "2024-12-05", ln{b.rent, 8000, 0}, ln{b.checking, 0, 8000})
	b.post(t, "2025-02-01", ln{b.checking, 30000, 0}, ln{b.owner, 0, 30000})
	b.post(t, "2025-03-10", ln{b.equipment, 12000, 0}, ln{b.loan, 0, 12000})
	b.post(t, "2025-03-12", ln{b.receivable, 90000, 0}, ln{b.income, 0, 90000})
	b.post(t, "2025-03-25", ln{b.checking, 60000, 0}, ln{b.receivable, 0, 60000})
	b.post(t, "2025-06-15", ln{b.checking, 1000, 0}, ln{b.retained, 0, 1000})
	b.post(t, "2025-11-20", ln{b.rent, 25000, 0}, ln{b.visa, 0, 25000})
	b.post(t, "2025-12-31", ln{b.closed, 700, 0}, ln{b.checking, 0, 700})
	b.post(t, "2026-01-15", ln{b.checking, 40000, 0}, ln{b.income, 0, 40000})
	b.post(t, "2026-03-05", ln{b.rent, 12000, 0}, ln{b.checking, 0, 12000})
	b.post(t, "2026-03-10", ln{b.checking, 2000, 0}, ln{b.retained, 0, 2000})
	b.post(t, "2026-03-15", ln{b.netted, 5000, 0}, ln{b.owner, 0, 5000})
	b.post(t, "2026-03-20", ln{b.savings, 30000, 0}, ln{b.checking, 0, 30000})
	b.post(t, "2026-04-02", ln{b.owner, 5000, 0}, ln{b.netted, 0, 5000})
	b.post(t, "2026-04-30", ln{b.visa, 10000, 0}, ln{b.checking, 0, 10000})
	b.post(t, "2026-06-01", ln{b.rent, 12000, 0}, ln{b.checking, 0, 12000})
	b.post(t, "2026-09-09", ln{b.checking, 25000, 0}, ln{b.savings, 0, 25000})
	b.closed.Set("inactive", true)
	saveOrFail(t, b.app, b.closed)
	return b
}

// bsStoredDays are a month's first, middle and last day, days in a month with
// no line (May, November 2026), a day before the first line, a day whose prior
// day is in a month with lines (2026-03-19 → 2025-03-19, between two lines of
// that month), and the last and first day of a fiscal year.
var bsStoredDays = []string{
	"2024-07-31", "2024-12-31", "2025-06-30", "2025-12-31", "2026-01-01", "2026-03-01", "2026-03-05",
	"2026-03-19", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30", "2026-07-01", bsToday,
}

// The stored read shows what the line read shows: the same rows in the same
// order (sections, classes, kinds, accounts, subtotals, Retained earnings,
// Net income, Total liabilities and equity), the same Current, Prior year,
// Change and % change, and the same currency codes; on each method, with the
// fiscal year starting in January and in July, and with each Rows choice.
func TestBalanceSheetStoredMonthsEqualTheLines(t *testing.T) {
	for _, fiscalStart := range []int{1, 7} {
		b := newBSStoredBook(t)
		b.fiscalStart(t, fiscalStart)
		for _, method := range []string{"accrual", "cash"} {
			for _, asOf := range bsStoredDays {
				for _, rows := range []string{"nonzero", "active"} {
					params := map[string]any{"asOf": asOf, "rows": rows, "method": method}
					opts := reports.Options{Today: bsToday}
					stored := bsFigures(runTBSpec(t, b.tbBook, balanceSheetSpec(), params, opts))
					lines := bsFigures(runTBSpec(t, b.tbBook, balanceSheetSpecFromLines(), params, opts))
					if stored != lines {
						t.Errorf("fiscal start %d, %s, as of %s, rows %s:\nstored months\n%s\nlines\n%s", fiscalStart, method, asOf, rows, stored, lines)
					}
					// Two rows with no code are equal too: from the first year
					// on, Total Assets names the currency in both columns.
					if asOf < "2024-12-31" {
						continue
					}
					named := false
					for _, line := range strings.Split(stored, "\n") {
						if strings.Contains(line, "|Total Assets|") {
							named = strings.Count(line, " USD") == 2
						}
					}
					if !named {
						t.Errorf("fiscal start %d, %s, as of %s, rows %s: Total Assets does not show USD on Current and Prior year in\n%s", fiscalStart, method, asOf, rows, stored)
					}
				}
			}
		}
	}
}

// The same on a book with cash-basis rows (a bill of cashDay1, part paid on
// cashDay2): on Accrual the cash rows count nowhere; on Cash they count in the
// balance before the month, in the month's lines, in the Prior year column a
// year later, and in Retained earnings and Net income.
func TestBalanceSheetStoredMonthsEqualTheLinesWithCashRows(t *testing.T) {
	b, _, _ := paidBook(t)
	book := tbBook{app: b.app, reader: b.reader}
	last := map[string]string{}
	for _, method := range []string{"accrual", "cash"} {
		for _, asOf := range []string{"2026-03-10", "2026-03-31", "2026-04-15", "2026-04-30", "2027-03-20", "2027-04-10", "2027-04-20"} {
			for _, rows := range []string{"nonzero", "active"} {
				params := map[string]any{"asOf": asOf, "rows": rows, "method": method}
				opts := reports.Options{Today: asOf}
				stored := bsFigures(runTBSpec(t, book, balanceSheetSpec(), params, opts))
				lines := bsFigures(runTBSpec(t, book, balanceSheetSpecFromLines(), params, opts))
				if stored != lines {
					t.Errorf("%s, as of %s, rows %s:\nstored months\n%s\nlines\n%s", method, asOf, rows, stored, lines)
				}
				last[method] = stored
			}
		}
	}
	if last["cash"] == last["accrual"] {
		t.Error("the Cash run equals the Accrual run on the last day: the book has no cash-basis row, so this test proves nothing")
	}
}

// In a month with no posted line every figure still shows, in the book's
// currency: each account row comes from its stored months, under its own
// section, class and kind, and the sections add them.
func TestBalanceSheetOfAMonthWithNoLine(t *testing.T) {
	b := newBSStoredBook(t)
	res := runBS(t, b.app, b.reader, map[string]any{"asOf": "2026-05-31"}, reports.Options{Today: bsToday})
	// Operating: 50000 − 8000 + 30000 + 60000 + 1000 − 700 at the end of 2025
	// (132300), then + 40000 − 12000 + 2000 − 30000 − 10000. A year earlier:
	// 50000 − 8000 + 30000 + 60000.
	requireFigures(t, bsAccount(t, res, b.checking), 122300, 132000)
	requireFigures(t, bsAccount(t, res, b.equipment), 12000, 12000)
	requireFigures(t, bsRow(t, res, "Total Fixed assets"), 12000, 12000)
	requireFigures(t, bsAccount(t, res, b.loan), 12000, 12000)
	requireFigures(t, bsAccount(t, res, b.visa), 15000, 0)
	// Retained earnings: 1000 + 2000 of its own, and 2024 and 2025 income less
	// expense (50000 − 8000 + 90000 − 25000). A year earlier: 2024 only.
	requireFigures(t, bsRow(t, res, "Retained earnings"), 110000, 42000)
	// Net income: 40000 − 12000 in 2026; 90000 by 2025-05-31.
	requireFigures(t, bsRow(t, res, "Net income"), 28000, 90000)
	assets, le := bsRow(t, res, "Total Assets"), bsRow(t, res, "Total liabilities and equity")
	requireFigures(t, le, amt(t, assets, "current"), amt(t, assets, "prior"))
	for _, r := range []reports.Row{assets, le, bsRow(t, res, "Total Fixed assets")} {
		for _, cell := range []string{"current@currency", "prior@currency"} {
			if got := r.Cells[cell]; got != "USD" {
				t.Errorf("%s %s = %#v, want USD", r.Label, cell, got)
			}
		}
	}
}

// The months before the as-of day's month are read from the stored months and
// that month from its lines, on both methods: the cash basis is the ledger and
// the cash-basis rows, and the stored months are the ledger's.
func TestBalanceSheetReadsTheStoredMonths(t *testing.T) {
	b := newBSStoredBook(t)
	figures := func(method string) (current, prior, retained int64) {
		t.Helper()
		res := runBS(t, b.app, b.reader, map[string]any{"asOf": "2026-06-30", "method": method}, reports.Options{Today: bsToday})
		row := bsAccount(t, res, b.checking)
		return amt(t, row, "current"), amt(t, row, "prior"), amt(t, bsRow(t, res, "Retained earnings"), "current")
	}
	bump := func(account *core.Record, period string) {
		t.Helper()
		_, err := b.app.DB().NewQuery("UPDATE books_account_balances SET debit_total = debit_total + 5 WHERE account = {:a} AND period = {:p}").
			Bind(map[string]any{"a": account.Id, "p": period}).Execute()
		if err != nil {
			t.Fatal(err)
		}
	}
	current, prior, retained := figures("accrual")
	cashCurrent, cashPrior, cashRetained := figures("cash")
	bump(b.checking, "2026-04")
	bump(b.checking, "2025-03")
	bump(b.rent, "2025-11")
	// April 2026 and March 2025 are before June 2026; March 2025 is before
	// June 2025 too. Rent's debit of 2025 lowers Retained earnings.
	if c, p, r := figures("accrual"); c != current+10 || p != prior+5 || r != retained-5 {
		t.Errorf("after three earlier stored months rose by 5: Operating %d / %d, Retained earnings %d; want %d / %d, %d",
			c, p, r, current+10, prior+5, retained-5)
	}
	bump(b.checking, "2026-06")
	if c, _, _ := figures("accrual"); c != current+10 {
		t.Errorf("after June's stored debit rose by 5, Operating = %d, want %d: the as-of day's month is read from its lines", c, current+10)
	}
	if c, p, r := figures("cash"); c != cashCurrent+10 || p != cashPrior+5 || r != cashRetained-5 {
		t.Errorf("Cash after three earlier stored months rose by 5: Operating %d / %d, Retained earnings %d; want %d / %d, %d: Cash reads the stored months for the ledger part",
			c, p, r, cashCurrent+10, cashPrior+5, cashRetained-5)
	}
}

// An opened account shows one row for the months before the as-of day's
// month, labelled with that month, then the month's lines up to the day. The
// opening row and the lines add up to the account's row in both columns.
func TestBalanceSheetOpenedAccountRows(t *testing.T) {
	b := newBSStoredBook(t)
	for _, method := range []string{"accrual", "cash"} {
		opts := reports.Options{Today: bsToday}
		params := map[string]any{"asOf": "2026-03-19", "rows": "active", "method": method}
		closed := runBS(t, b.app, b.reader, params, opts)
		opts.Collapse = [][]any{}
		opts.Expand = [][]any{bsWireKey(t, bsAccount(t, closed, b.checking).GroupKey), bsWireKey(t, bsAccount(t, closed, b.equipment).GroupKey)}
		open := runBS(t, b.app, b.reader, params, opts)

		under := func(account *core.Record) []reports.Row {
			t.Helper()
			var rows []reports.Row
			for _, r := range open.Rows {
				if r.Section == bsAccount(t, open, account).ID && (r.Kind == reports.KindOpening || r.Kind == reports.KindDetail) {
					rows = append(rows, r)
				}
			}
			return rows
		}
		requireOpening := func(r reports.Row, current, prior int64) {
			t.Helper()
			if r.Kind != reports.KindOpening || r.LabelTemplate != "Balance before {value}" || r.LabelType != reports.Month || r.LabelValue != "2026-03" {
				t.Fatalf("%s: first row = %s %q (template %q, type %q, value %#v); want the opening row \"Balance before {value}\" of month 2026-03",
					method, r.Kind, r.Label, r.LabelTemplate, r.LabelType, r.LabelValue)
			}
			requireFigures(t, r, current, prior)
			for _, cell := range []string{"change", "pct"} {
				if got := r.Cells[cell]; got != nil {
					t.Errorf("%s: the opening row's %s = %#v, want none", method, cell, got)
				}
			}
		}

		// Operating: 132300 at the end of 2025, + 40000 in January; then the
		// lines of March 5 and March 10 (March 20 is after the day). A year
		// earlier (2025-03-19): 50000 − 8000 + 30000, before the line of March 25.
		checking := under(b.checking)
		if len(checking) != 3 {
			t.Fatalf("%s: Operating's opened rows = %q, want the opening row and two lines", method, labelsOf(checking))
		}
		requireOpening(checking[0], 172300, 72000)
		for i, want := range []struct {
			day    string
			amount int64
		}{{"2026-03-05", -12000}, {"2026-03-10", 2000}} {
			line := checking[i+1]
			if !strings.HasPrefix(line.Label, want.day+" · ") {
				t.Errorf("%s: Operating's line %d = %q, want the line of %s", method, i+1, line.Label, want.day)
			}
			if got := amt(t, line, "current"); got != want.amount {
				t.Errorf("%s: line of %s current = %d, want %d", method, want.day, got, want.amount)
			}
			if got := amt(t, line, "prior"); got != 0 {
				t.Errorf("%s: line of %s prior = %d, want 0: the line is after the prior day", method, want.day, got)
			}
		}
		requireFigures(t, bsAccount(t, open, b.checking), 162300, 72000)

		// Equipment has no line in March 2026: the opening row only. Its prior
		// figure is the line of 2025-03-10, in the prior day's month.
		equipment := under(b.equipment)
		if len(equipment) != 1 {
			t.Fatalf("%s: Equipment's opened rows = %q, want the opening row only", method, labelsOf(equipment))
		}
		requireOpening(equipment[0], 12000, 12000)
	}
}
