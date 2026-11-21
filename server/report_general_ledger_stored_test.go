package books

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// glOpeningFromLines is the beginning balance as the General Ledger read it
// before it read the stored months: every figure from the journal lines. The
// tests below run the report with it and require the same rows.
func glOpeningFromLines() *reports.Node {
	net := glNet()
	from := bound("period", "from")
	pl := lit(profitAndLossTypes())
	own := &reports.Node{
		Op:     "lookup",
		Source: "books.journal_lines",
		Where: op("and",
			op("eq", link("account"), rec("byAccount", "id")),
			op("eq", fld("posted"), lit(true)),
			op("lt", fld("date"), from),
			op("or",
				op("not", op("in", fld("account", "type"), pl)),
				op("gte", op("fiscalYear", fld("date")), op("fiscalYear", from)),
			),
		),
		Value: mustJSON(net),
		Pick:  "sum",
	}
	earlierPL := &reports.Node{
		Op:     "lookup",
		Source: "books.journal_lines",
		Where: op("and",
			op("eq", fld("posted"), lit(true)),
			op("in", fld("account", "type"), pl),
			op("lt", op("fiscalYear", fld("date")), op("fiscalYear", from)),
		),
		Value: mustJSON(net),
		Pick:  "sum",
	}
	return op("add",
		op("coalesce", own, lit(0)),
		op("if",
			op("eq", rec("byAccount", "detail_type"), lit("retained_earnings")),
			op("coalesce", earlierPL, lit(0)),
			lit(0),
		),
	)
}

// generalLedgerOpeningGolden is mustJSON(generalLedgerOpening()): the stored
// months before the period's first month, the lines of that month before the
// period and, on retained earnings, the stored income and expense months of
// earlier fiscal years. TestGeneralLedgerSpecUnchanged holds the spec to it.
const generalLedgerOpeningGolden = "" +
	`{"op":"add","args":[{"op":"add","args":[` +
	`{"op":"coalesce","args":[{"op":"lookup","value":{"op":"sub","args":[{"path":[{"field":"debit_total"}]},{"path":[{"field":"credit_total"}]}]},` +
	`"where":{"op":"and","args":[{"op":"eq","args":[{"path":[{"link":"account"}]},{"path":[{"field":"id"}],"record":"byAccount"}]},` +
	`{"op":"lt","args":[{"path":[{"field":"month_start"}]},{"op":"startOfMonth","args":[{"param":"period","bound":"from"}]}]},` +
	`{"op":"or","args":[{"op":"not","args":[{"op":"in","args":[{"path":[{"link":"account"},{"field":"type"}]},` +
	`{"value":["income","other_income","cost_of_goods_sold","expense","other_expense"]}]}]},` +
	`{"op":"gte","args":[{"op":"fiscalYear","args":[{"path":[{"field":"month_start"}]}]},{"op":"fiscalYear","args":[{"param":"period","bound":"from"}]}]}]}]},` +
	`"source":"books.account_balances","pick":"sum"},{"value":0}]},` +
	`{"op":"coalesce","args":[{"op":"lookup","value":{"op":"sub","args":[{"path":[{"field":"debit"}]},{"path":[{"field":"credit"}]}]},` +
	`"where":{"op":"and","args":[{"op":"eq","args":[{"path":[{"link":"account"}]},{"path":[{"field":"id"}],"record":"byAccount"}]},` +
	`{"op":"eq","args":[{"path":[{"field":"posted"}]},{"value":true}]},` +
	`{"op":"gte","args":[{"path":[{"field":"date"}]},{"op":"startOfMonth","args":[{"param":"period","bound":"from"}]}]},` +
	`{"op":"lt","args":[{"path":[{"field":"date"}]},{"param":"period","bound":"from"}]}]},` +
	`"source":"books.journal_lines","pick":"sum"},{"value":0}]}]},` +
	`{"op":"if","args":[{"op":"eq","args":[{"path":[{"field":"detail_type"}],"record":"byAccount"},{"value":"retained_earnings"}]},` +
	`{"op":"coalesce","args":[{"op":"lookup","value":{"op":"sub","args":[{"path":[{"field":"debit_total"}]},{"path":[{"field":"credit_total"}]}]},` +
	`"where":{"op":"and","args":[{"op":"in","args":[{"path":[{"link":"account"},{"field":"type"}]},` +
	`{"value":["income","other_income","cost_of_goods_sold","expense","other_expense"]}]},` +
	`{"op":"lt","args":[{"op":"fiscalYear","args":[{"path":[{"field":"month_start"}]}]},{"op":"fiscalYear","args":[{"param":"period","bound":"from"}]}]}]},` +
	`"source":"books.account_balances","pick":"sum"},{"value":0}]},{"value":0}]}]}`

// The stored months' currency is the journal lines' currency (core
// SameCurrencyAs), so a report adds the two.
func TestReportSourcesBalancesShareTheLinesCurrency(t *testing.T) {
	for _, s := range reportSources() {
		if s.Key != "books.account_balances" {
			continue
		}
		for _, f := range s.Fields {
			if f.Key == "currency" && f.SameCurrencyAs == "books.journal_lines.currency" {
				return
			}
		}
		t.Fatalf("the currency field of books.account_balances does not declare SameCurrencyAs books.journal_lines.currency: %+v", s.Fields)
	}
	t.Fatal("no books.account_balances source")
}

// glSpecFromLines is the shipped General Ledger with every beginning balance
// read from the journal lines.
func glSpecFromLines(t *testing.T) json.RawMessage {
	t.Helper()
	shipped := string(mustJSON(generalLedgerSpec()))
	stored := string(mustJSON(generalLedgerOpening()))
	// byNormal writes its value twice, so the Balance formula, its rollup and
	// the opening row hold the beginning balance twice each, and the having once.
	if n := strings.Count(shipped, stored); n != 7 {
		t.Fatalf("the spec holds the beginning balance %d times, want 7", n)
	}
	return json.RawMessage(strings.ReplaceAll(shipped, stored, string(mustJSON(glOpeningFromLines()))))
}

// runGLSpec runs a General Ledger spec as reader and returns its rows as JSON.
func runGLSpec(t *testing.T, app core.App, reader *core.Record, raw json.RawMessage, params map[string]any) string {
	t.Helper()
	spec, info, err := reports.Load(raw)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	given := map[string]json.RawMessage{}
	for id, v := range params {
		given[id] = mustJSON(v)
	}
	res, err := reports.Run(context.Background(), app, reports.Request{
		Spec: spec, Loaded: info, Params: given, Options: reports.Options{Today: glToday}, Auth: reader,
	})
	if err != nil {
		t.Fatalf("Run %v: %v", params, err)
	}
	return string(mustJSON(res.Rows))
}

// glStoredBook is a book whose fiscal year starts in July, with lines in an
// earlier fiscal year, in whole months of the current one, in August before
// the 12th, on the 12th and after it, a void pair in July and one in August,
// and a draft.
type glStoredBook struct {
	glBook
	operating, card, equity, retained, income, rent *core.Record
}

func newGLStoredBook(t *testing.T) glStoredBook {
	t.Helper()
	b := glStoredBook{glBook: newGLBook(t)}
	saveSettings(t, b.app, map[string]any{"fiscal_year_start_month": 7})
	b.operating = b.account(t, "Operating", "1000", "bank", "checking")
	b.card = b.account(t, "Company card", "2100", "credit_card", "credit_card")
	b.equity = b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	b.retained = mkRetainedEarnings(t, b.app, "3900")
	b.income = b.account(t, "Design income", "4000", "income", "service_income")
	b.rent = b.account(t, "Office rent", "6000", "expense", "rent_lease")
	void := func(entry *core.Record) {
		t.Helper()
		if err := setStatus(b.app, entry.Id, statusVoid, ""); err != nil {
			t.Fatalf("void: %v", err)
		}
	}
	// The fiscal year that ended 2025-06-30, and the one that ended 2026-06-30.
	b.post(t, "2025-03-15", ln{b.operating, 30000, 0}, ln{b.income, 0, 30000})
	b.post(t, "2025-09-10", ln{b.rent, 10000, 0}, ln{b.operating, 0, 10000})
	b.post(t, "2026-06-30", ln{b.rent, 900, 0}, ln{b.card, 0, 900})
	// The period's fiscal year: its first day, and July.
	b.post(t, "2026-07-01", ln{b.operating, 5000, 0}, ln{b.income, 0, 5000})
	void(b.post(t, "2026-07-10", ln{b.rent, 4000, 0}, ln{b.operating, 0, 4000}))
	b.post(t, "2026-07-20", ln{b.rent, 2000, 0}, ln{b.card, 0, 2000})
	// August before the 12th.
	b.post(t, "2026-08-03", ln{b.operating, 100000, 0}, ln{b.equity, 0, 100000})
	void(b.post(t, "2026-08-05", ln{b.rent, 7000, 0}, ln{b.operating, 0, 7000}))
	b.post(t, "2026-08-11", ln{b.rent, 300, 0}, ln{b.card, 0, 300})
	mkDraft(t, b.app, "2026-08-04", ln{b.rent, 999, 0}, ln{b.operating, 0, 999})
	// The 12th and after.
	b.post(t, "2026-08-12", ln{b.operating, 700, 0}, ln{b.income, 0, 700})
	b.post(t, "2026-08-20", ln{b.rent, 60, 0}, ln{b.operating, 0, 60})
	return b
}

// The beginning balance from the stored months and the lines of the period's
// first month equals the one from the lines alone, row for row: a period that
// starts in the middle of a month, on the first day of a month, on the first
// day of the fiscal year, in an earlier fiscal year, before every line, and
// All dates; with every account and with a list.
func TestGeneralLedgerBeginningBalanceFromStoredMonthsEqualsTheLines(t *testing.T) {
	b := newGLStoredBook(t)
	fromLines := glSpecFromLines(t)
	stored := mustJSON(generalLedgerSpec())
	for _, period := range []map[string]any{
		glPeriod("2026-08-12", "2026-08-31"),
		glPeriod("2026-08-01", "2026-08-31"),
		glPeriod("2026-07-01", "2026-08-31"),
		glPeriod("2026-07-15", "2026-07-31"),
		glPeriod("2025-09-10", "2025-09-30"),
		glPeriod("2024-01-01", "2024-12-31"),
		glAllDates,
	} {
		for _, params := range []map[string]any{
			{"period": period, "rows": "all"},
			{"period": period},
			{"period": period, "accounts": []string{b.rent.Id, b.retained.Id}},
		} {
			want := runGLSpec(t, b.app, b.reader, fromLines, params)
			got := runGLSpec(t, b.app, b.reader, stored, params)
			if got != want {
				t.Errorf("params %s: the rows differ\n stored months: %s\n lines:         %s", mustJSON(params), got, want)
			}
		}
	}
	// The figures themselves, for the period from the 12th.
	res := runGL(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-08-12", "2026-08-31")}, reports.Options{Today: glToday})
	for _, w := range []struct {
		account *core.Record
		opening int64
		why     string
	}{
		{b.operating, 125000, "300.00 - 100.00 + 50.00 + 1,000.00; the void pairs cancel"},
		{b.card, 3200, "9.00 + 20.00 + 3.00, credit-normal"},
		{b.retained, 19100, "300.00 income less 100.00 and 9.00 rent of earlier fiscal years"},
		{b.income, 5000, "the line of 2026-07-01, the first day of the fiscal year"},
		{b.rent, 2300, "20.00 of July and 3.00 of August 11"},
	} {
		s := sectionFor(t, res, w.account)
		if s.opening == nil {
			t.Fatalf("%s has no opening row", s.head.Label)
		}
		if got := balanceCell(t, *s.opening); got != w.opening {
			t.Errorf("%s Beginning balance = %d, want %d (%s)", s.head.Label, got, w.opening, w.why)
		}
	}
}

// The whole months before the period come from books_account_balances, not
// from the lines: a stored month changed past the ledger moves the beginning
// balance, and the month of the period's first day is read from its lines.
func TestGeneralLedgerBeginningBalanceReadsTheStoredMonths(t *testing.T) {
	b := newGLStoredBook(t)
	opening := func() int64 {
		t.Helper()
		res := runGL(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-08-12", "2026-08-31")}, reports.Options{Today: glToday})
		s := sectionFor(t, res, b.operating)
		if s.opening == nil {
			t.Fatal("Operating has no opening row")
		}
		return balanceCell(t, *s.opening)
	}
	bump := func(period string) {
		t.Helper()
		_, err := b.app.DB().NewQuery("UPDATE books_account_balances SET debit_total = debit_total + 5 WHERE account = {:a} AND period = {:p}").
			Bind(map[string]any{"a": b.operating.Id, "p": period}).Execute()
		if err != nil {
			t.Fatal(err)
		}
	}
	before := opening()
	bump("2026-07")
	if got := opening(); got != before+5 {
		t.Errorf("after July's stored debit rose by 5, Beginning balance = %d, want %d: July is read from its stored month", got, before+5)
	}
	bump("2026-08")
	if got := opening(); got != before+5 {
		t.Errorf("after August's stored debit rose by 5, Beginning balance = %d, want %d: the period's first month is read from its lines", got, before+5)
	}
}
