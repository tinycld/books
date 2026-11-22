package books

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/reports"
)

// trialBalanceSpecFromLines is the Trial Balance as it was before it read the
// stored months: every figure is a sum over the account's posted lines up to
// the as-of day, and an earlier year's income or expense line is grouped onto
// the retained-earnings account. The stored read must show what it shows.
func trialBalanceSpecFromLines() *reports.Spec {
	net := op("sub", fld("debit"), fld("credit"))
	priorPL := op("and",
		op("in", fld("account", "type"), lit(profitAndLossTypes())),
		op("lt", op("fiscalYear", fld("date")), op("fiscalYear", prm("asOf"))),
	)
	reAccount := &reports.Node{
		Op:     "lookup",
		Source: "books.accounts",
		Where:  op("eq", fld("detail_type"), lit("retained_earnings")),
		Value:  mustJSON(fld("id")),
		Pick:   "min",
	}
	spec := trialBalanceSpec()
	spec.Filter = op("and",
		op("eq", fld("posted"), lit(true)),
		op("lte", fld("date"), prm("asOf")),
		op("in", col("account"), prm("accounts")),
	)
	for i := range spec.Columns {
		c := &spec.Columns[i]
		c.Drill, c.Rollup = nil, nil
		switch c.ID {
		case "account":
			c.Path, c.Formula = nil, op("if", priorPL, reAccount, link("account"))
		case "debit":
			c.Formula = op("if",
				op("eq", op("count", fld("id")), lit(0)),
				lit(nil),
				op("if", op("gte", op("sum", net), lit(0)), op("sum", net), lit(nil)),
			)
		case "credit":
			c.Formula = op("if", op("lt", op("sum", net), lit(0)), op("sub", lit(0), op("sum", net)), lit(nil))
		}
	}
	g := &spec.Groups[0]
	g.Opening = nil
	g.Fill = &reports.Fill{Where: op("and",
		op("eq", fld("inactive"), lit(false)),
		op("in", fld("id"), prm("accounts")),
	)}
	g.Having = op("or",
		op("eq", prm("rows"), lit("all")),
		op("and", op("eq", prm("rows"), lit("active")), op("gt", op("count", fld("id")), lit(0))),
		op("ne", op("sum", net), lit(0)),
	)
	return spec
}

// runTBSpec runs spec as reader with the posted params.
func runTBSpec(t *testing.T, b tbBook, spec *reports.Spec, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	loaded, info, err := reports.Load(mustJSON(spec))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	given := map[string]json.RawMessage{}
	for id, v := range params {
		given[id] = mustJSON(v)
	}
	res, err := reports.Run(context.Background(), b.app, reports.Request{
		Spec: loaded, Loaded: info, Params: given, Options: opts, Auth: b.reader,
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// tbFigures writes each account row and the Total as one line: its kind,
// label, number, and the Debit and Credit figures with their currency codes.
// A cell the row does not have reads <nil>.
func tbFigures(res *reports.Result) string {
	var out strings.Builder
	for _, r := range res.Rows {
		if r.Kind != reports.KindGroup && r.Kind != reports.KindTotal {
			continue
		}
		fmt.Fprintf(&out, "%s|%s|%v|%v %v|%v %v\n", r.Kind, r.Label, r.Cells["number"],
			r.Cells["debit"], r.Cells["debit@currency"], r.Cells["credit"], r.Cells["credit@currency"])
	}
	return out.String()
}

// tbStoredBook has two fiscal years of posted lines: income and expense in
// 2025 (they fold onto Retained earnings in 2026), months with lines, and no
// line in May, October or November 2026. Retained earnings has a line of its
// own in June 2025 and one in March 2026 (before the 19th). Idle has no line;
// Closed is inactive and has lines of 2025.
type tbStoredBook struct {
	tbBook
	checking, savings, income, rent, retained, idle, closed *core.Record
}

func newTBStoredBook(t *testing.T) tbStoredBook {
	t.Helper()
	b := tbStoredBook{tbBook: newTBBook(t)}
	b.checking = b.account(t, "Checking", "1000", "bank", "checking")
	b.savings = b.account(t, "Savings", "1010", "bank", "savings")
	b.idle = b.account(t, "Idle", "1020", "bank", "checking")
	b.closed = b.account(t, "Closed", "1030", "bank", "checking")
	b.retained = mkRetainedEarnings(t, b.app, "3900")
	b.income = b.account(t, "Consulting", "4000", "income", "service_income")
	b.rent = b.account(t, "Rent", "6000", "expense", "rent_lease")
	b.post(t, "2025-03-10", ln{account: b.checking, debit: 90000}, ln{account: b.income, credit: 90000})
	b.post(t, "2025-06-15", ln{account: b.checking, debit: 1000}, ln{account: b.retained, credit: 1000})
	b.post(t, "2025-11-20", ln{account: b.rent, debit: 25000}, ln{account: b.checking, credit: 25000})
	b.post(t, "2025-12-31", ln{account: b.closed, debit: 700}, ln{account: b.checking, credit: 700})
	b.post(t, "2026-01-15", ln{account: b.checking, debit: 40000}, ln{account: b.income, credit: 40000})
	b.post(t, "2026-03-05", ln{account: b.rent, debit: 12000}, ln{account: b.checking, credit: 12000})
	b.post(t, "2026-03-10", ln{account: b.checking, debit: 2000}, ln{account: b.retained, credit: 2000})
	b.post(t, "2026-03-20", ln{account: b.savings, debit: 30000}, ln{account: b.checking, credit: 30000})
	b.post(t, "2026-04-30", ln{account: b.checking, debit: 5000}, ln{account: b.savings, credit: 5000})
	b.post(t, "2026-06-01", ln{account: b.rent, debit: 12000}, ln{account: b.checking, credit: 12000})
	// Savings is back at 0 from September on: a row of zero with posted lines.
	b.post(t, "2026-09-09", ln{account: b.checking, debit: 25000}, ln{account: b.savings, credit: 25000})
	// Dormant is inactive with no line: no Rows choice shows it.
	dormant := b.account(t, "Dormant", "1040", "bank", "checking")
	for _, inactive := range []*core.Record{b.closed, dormant} {
		inactive.Set("inactive", true)
		saveOrFail(t, b.app, inactive)
	}
	return b
}

// The stored read shows what the line read shows: the same account rows in the
// same order, the same Debit and Credit with the same currency codes, and the
// same Total. The days are a month's first, middle and last day, a day in a
// month with no line (May, November), a day before the first line, and the
// last day of the first fiscal year; each with every Rows choice, for every
// account and for an account list.
func TestTrialBalanceStoredMonthsEqualTheLines(t *testing.T) {
	for _, fiscalStart := range []int{1, 7} {
		b := newTBStoredBook(t)
		saveSettings(t, b.app, map[string]any{"fiscal_year_start_month": fiscalStart})
		opts := reports.Options{Today: tbToday}
		some := idsOf(b.checking, b.rent, b.retained, b.idle)
		for _, asOf := range []string{"2024-12-31", "2025-12-31", "2026-03-01", "2026-03-05", "2026-03-19", "2026-03-31", "2026-05-31", "2026-06-30", "2026-07-01", tbToday} {
			for _, rows := range []string{"nonzero", "active", "all"} {
				for name, accounts := range map[string][]string{"every account": nil, "an account list": some} {
					params := map[string]any{"asOf": asOf, "rows": rows}
					if accounts != nil {
						params["accounts"] = accounts
					}
					stored := tbFigures(runTBSpec(t, b.tbBook, trialBalanceSpec(), params, opts))
					lines := tbFigures(runTBSpec(t, b.tbBook, trialBalanceSpecFromLines(), params, opts))
					if stored != lines {
						t.Errorf("fiscal start %d, as of %s, rows %s, %s:\nstored months\n%s\nlines\n%s", fiscalStart, asOf, rows, name, stored, lines)
					}
					if asOf == tbToday && rows == "nonzero" && !strings.Contains(stored, "total|Total|") {
						t.Errorf("fiscal start %d, %s: no Total row in\n%s", fiscalStart, name, stored)
					}
				}
			}
		}
	}
}

// A month with no posted line still has every figure: each account row comes
// from its stored months, and the Total adds them, in the book's currency.
func TestTrialBalanceOfAMonthWithNoLine(t *testing.T) {
	b := newTBStoredBook(t)
	res := runTB(t, b.app, b.reader, map[string]any{"asOf": "2026-05-31"}, reports.Options{Today: tbToday})
	requireSplit(t, rowFor(t, res, b.checking), int64(70300), nil)
	requireSplit(t, rowFor(t, res, b.savings), int64(25000), nil)
	requireSplit(t, rowFor(t, res, b.income), nil, int64(40000))
	requireSplit(t, rowFor(t, res, b.retained), nil, int64(68000))
	total := totalOf(t, res)
	requireSplit(t, total, int64(108000), int64(108000))
	for _, cell := range []string{"debit@currency", "credit@currency"} {
		if got := total.Cells[cell]; got != "USD" {
			t.Errorf("Total %s = %#v, want USD", cell, got)
		}
	}
}

// The months before the as-of day's month are read from the stored months and
// that month from its lines: a stored month's change shows on the account row
// only when the month is an earlier one.
func TestTrialBalanceReadsTheStoredMonths(t *testing.T) {
	b := newTBStoredBook(t)
	debit := func() int64 {
		t.Helper()
		res := runTB(t, b.app, b.reader, map[string]any{"asOf": "2026-06-30"}, reports.Options{Today: tbToday})
		v, ok := moneyCell(t, rowFor(t, res, b.checking), "debit")
		if !ok {
			t.Fatal("Checking has no Debit")
		}
		return v
	}
	bump := func(period string) {
		t.Helper()
		_, err := b.app.DB().NewQuery("UPDATE books_account_balances SET debit_total = debit_total + 5 WHERE account = {:a} AND period = {:p}").
			Bind(map[string]any{"a": b.checking.Id, "p": period}).Execute()
		if err != nil {
			t.Fatal(err)
		}
	}
	before := debit()
	bump("2026-04")
	if got := debit(); got != before+5 {
		t.Errorf("after April's stored debit rose by 5, Checking = %d, want %d: April is read from its stored month", got, before+5)
	}
	bump("2026-06")
	if got := debit(); got != before+5 {
		t.Errorf("after June's stored debit rose by 5, Checking = %d, want %d: the as-of day's month is read from its lines", got, before+5)
	}
}

// An opened account shows one row for the months before the as-of day's month,
// labelled with that month, then the month's lines up to the day. The opening
// row's figure and the lines add up to the account's row.
func TestTrialBalanceOpenedAccountRows(t *testing.T) {
	b := newTBStoredBook(t)
	opts := reports.Options{Today: tbToday}
	params := map[string]any{"asOf": "2026-03-19", "rows": "all"}
	closed := runTB(t, b.app, b.reader, params, opts)
	opts.Expand = [][]any{rowFor(t, closed, b.checking).GroupKey, rowFor(t, closed, b.idle).GroupKey, rowFor(t, closed, b.retained).GroupKey}
	open := runTB(t, b.app, b.reader, params, opts)

	under := func(account *core.Record) []reports.Row {
		t.Helper()
		section := rowFor(t, open, account).ID
		var rows []reports.Row
		for _, r := range open.Rows {
			if r.Section == section && (r.Kind == reports.KindOpening || r.Kind == reports.KindDetail) {
				rows = append(rows, r)
			}
		}
		return rows
	}
	requireOpening := func(r reports.Row, debit, credit any) {
		t.Helper()
		if r.Kind != reports.KindOpening || r.LabelTemplate != "Balance before {value}" || r.LabelType != reports.Month || r.LabelValue != "2026-03" {
			t.Fatalf("first row = %s %q (template %q, type %q, value %#v); want the opening row \"Balance before {value}\" of month 2026-03",
				r.Kind, r.Label, r.LabelTemplate, r.LabelType, r.LabelValue)
		}
		if r.Open != "" {
			t.Errorf("the opening row opens %q, want no open", r.Open)
		}
		requireSplit(t, r, debit, credit)
	}

	// Checking: 1000 + 90000 - 25000 - 700 + 40000 before March, then the
	// lines of March 5 and March 10. The line of March 20 is after the day.
	// Row: 105300 - 12000 + 2000 = 95300.
	checking := under(b.checking)
	if len(checking) != 3 {
		t.Fatalf("Checking's opened rows = %q, want the opening row and two lines", labelsOf(checking))
	}
	requireOpening(checking[0], int64(105300), nil)
	if !strings.HasPrefix(checking[1].Label, "2026-03-05 · ") {
		t.Errorf("Checking's first line = %q, want the line of 2026-03-05", checking[1].Label)
	}
	requireSplit(t, checking[1], nil, int64(12000))
	if !strings.HasPrefix(checking[2].Label, "2026-03-10 · ") {
		t.Errorf("Checking's second line = %q, want the line of 2026-03-10", checking[2].Label)
	}
	requireSplit(t, checking[2], int64(2000), nil)
	requireSplit(t, rowFor(t, open, b.checking), int64(95300), nil)

	// Retained earnings: its opening row is its own line of June 2025 (1000)
	// plus the income and expense of 2025 (90000 - 25000) folded onto it,
	// 66000; then its own line of March 10 (2000). Row: 66000 + 2000 = 68000.
	retained := under(b.retained)
	if len(retained) != 2 {
		t.Fatalf("Retained earnings' opened rows = %q, want the opening row and one line", labelsOf(retained))
	}
	requireOpening(retained[0], nil, int64(66000))
	if !strings.HasPrefix(retained[1].Label, "2026-03-10 · ") {
		t.Errorf("Retained earnings' line = %q, want the line of 2026-03-10", retained[1].Label)
	}
	requireSplit(t, retained[1], nil, int64(2000))
	requireSplit(t, rowFor(t, open, b.retained), nil, int64(68000))

	// An account with no posted line has an opening row of 0.
	idle := under(b.idle)
	if len(idle) != 1 {
		t.Fatalf("Idle's opened rows = %q, want the opening row only", labelsOf(idle))
	}
	requireOpening(idle[0], int64(0), nil)
}
