package books

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"slices"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// plToday is the reader's day in every run, so presets never move with the
// clock.
const plToday = "2026-11-09"

// plMarch is the period most tests run: every line they post is in it unless
// the test says otherwise.
var plMarch = map[string]any{"from": "2026-03-01", "to": "2026-03-31"}

// runPL loads a shipped report and runs it as reader, as core's run endpoint
// does: Load, then Run with the posted params.
func runPL(t *testing.T, app core.App, shipped reports.Shipped, reader *core.Record, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	spec, info, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	given := map[string]json.RawMessage{}
	for id, v := range params {
		raw, err := json.Marshal(v)
		if err != nil {
			t.Fatalf("param %s: %v", id, err)
		}
		given[id] = raw
	}
	res, err := reports.Run(context.Background(), app, reports.Request{
		Spec: spec, Loaded: info, Params: given, Options: opts, Auth: reader,
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// plBook is a ledger with every hook bound (newLedgerEnv: its Checking,
// Consulting Income and Rent have no lines unless a test posts to them),
// Books' report sources, and a reader with Books read-only access.
type plBook struct {
	app      core.App
	env      *ledgerEnv
	reader   *core.Record
	checking *core.Record
}

func newPLBook(t *testing.T) plBook {
	t.Helper()
	env := newLedgerEnv(t)
	registerBooksSources(t)
	reader := mkUser(t, env.app, "member")
	setPkgAccess(t, env.app, reader, "readonly")
	return plBook{app: env.app, env: env, reader: reader, checking: env.checking}
}

// plAccount saves an account with a number ("" for none) and a parent ("" for
// a top-level account), and reads it back with its full name.
func plAccount(t *testing.T, app core.App, name, number, accountType, detailType, parent string) *core.Record {
	t.Helper()
	fields := map[string]any{
		"name": name, "number": number, "type": accountType, "detail_type": detailType, "currency": "USD",
	}
	if parent != "" {
		fields["parent"] = parent
	}
	r, err := newAccount(app, fields)
	if err != nil {
		t.Fatalf("save account %s: %v", name, err)
	}
	return reload(t, app, "books_accounts", r.Id)
}

func (b plBook) post(t *testing.T, date string, lines ...ln) *core.Record {
	t.Helper()
	return mustPost(t, b.app, mkDraft(t, b.app, date, lines...).Id, "")
}

func (b plBook) run(t *testing.T, params map[string]any) *reports.Result {
	t.Helper()
	return runPL(t, b.app, profitAndLossShipped(), b.reader, params, reports.Options{Today: plToday})
}

// The statement's fixed texts.
var (
	plSections = []struct{ id, title string }{
		{"income", "Income"},
		{"cogs", "Cost of goods sold"},
		{"expenses", "Expenses"},
		{"otherIncome", "Other income"},
		{"otherExpenses", "Other expenses"},
	}
	plComputed = []string{"Gross profit", "Net operating income", "Net other income", "Net income"}
)

func plRowText(r reports.Row) string { return r.Kind + ":" + r.Label }

func plRowTexts(rows []reports.Row) []string {
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = plRowText(r)
	}
	return out
}

// plIsAccount is an account row: a group row of the second level (the first
// is the section).
func plIsAccount(r reports.Row) bool { return r.Kind == reports.KindGroup && r.Level == 2 }

func plAccountRows(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if plIsAccount(r) {
			out = append(out, r)
		}
	}
	return out
}

// plAccountOf is the account an account row stands for: the second value of
// its group key (core's key is one value per level, the section key first,
// then the row's currencies).
func plAccountOf(t *testing.T, r reports.Row) string {
	t.Helper()
	if len(r.GroupKey) < 2 {
		t.Fatalf("%s (%s) group key %#v has no second value", r.Label, r.Kind, r.GroupKey)
	}
	id, ok := r.GroupKey[1].(string)
	if !ok || id == "" {
		t.Fatalf("%s (%s) group key %#v: the second value is a %T, want an account id string", r.Label, r.Kind, r.GroupKey, r.GroupKey[1])
	}
	return id
}

func plAccountIDs(t *testing.T, res *reports.Result) []string {
	t.Helper()
	var out []string
	for _, r := range plAccountRows(res) {
		out = append(out, plAccountOf(t, r))
	}
	return out
}

func plHasRow(t *testing.T, res *reports.Result, account *core.Record) bool {
	t.Helper()
	return slices.Contains(plAccountIDs(t, res), account.Id)
}

func plRowFor(t *testing.T, res *reports.Result, account *core.Record) reports.Row {
	t.Helper()
	for _, r := range plAccountRows(res) {
		if plAccountOf(t, r) == account.Id {
			return r
		}
	}
	t.Fatalf("no row for %s; rows %v", account.GetString("full_name"), plRowTexts(res.Rows))
	return reports.Row{}
}

// plOne is the one row of the kind with the label.
func plOne(t *testing.T, res *reports.Result, kind, label string) reports.Row {
	t.Helper()
	var found []reports.Row
	for _, r := range res.Rows {
		if r.Kind == kind && r.Label == label {
			found = append(found, r)
		}
	}
	if len(found) != 1 {
		t.Fatalf("%d %s rows labelled %q, want 1; rows %v", len(found), kind, label, plRowTexts(res.Rows))
	}
	return found[0]
}

func plTotal(t *testing.T, res *reports.Result, title string) reports.Row {
	t.Helper()
	return plOne(t, res, reports.KindSubtotal, "Total "+title)
}

func plComputedRow(t *testing.T, res *reports.Result, label string) reports.Row {
	t.Helper()
	return plOne(t, res, reports.KindComputed, label)
}

// plAmount is a row's Total: it must hold an amount.
func plAmount(t *testing.T, r reports.Row) int64 {
	t.Helper()
	v, ok := moneyCell(t, r, "amount")
	if !ok {
		t.Fatalf("%s (%s) has a blank Total, want an amount", r.Label, r.Kind)
	}
	return v
}

// plPct reads a % of income cell: a float64 percent, or ok false for an empty
// cell. A cell of any other type fails the test.
func plPct(t *testing.T, r reports.Row) (float64, bool) {
	t.Helper()
	cell := r.Cells["pct"]
	if cell == nil {
		return 0, false
	}
	v, ok := cell.(float64)
	if !ok {
		t.Fatalf("%s (%s) pct = %#v, a %T; want a float64 percent or nil", r.Label, r.Kind, cell, cell)
	}
	return v, true
}

// plWantPct is amount ÷ income × 100 at one decimal.
func plWantPct(amount, income int64) float64 {
	return math.Round(float64(amount)*1000/float64(income)) / 10
}

func requirePct(t *testing.T, r reports.Row, want float64) {
	t.Helper()
	got, ok := plPct(t, r)
	if !ok {
		t.Errorf("%s (%s) %% of income is blank, want %.1f", r.Label, r.Kind, want)
		return
	}
	if math.Abs(got-want) > 1e-9 {
		t.Errorf("%s (%s) %% of income = %v, want %.1f", r.Label, r.Kind, got, want)
	}
}

func requireNoPct(t *testing.T, res *reports.Result) {
	t.Helper()
	for _, r := range res.Rows {
		if v, ok := plPct(t, r); ok {
			t.Errorf("%s (%s) %% of income = %v, want blank (no income)", r.Label, r.Kind, v)
		}
	}
}

// plSkeleton is the statement with no account rows: each section's title and
// total, and the computed rows where they stand.
func plSkeleton() []string {
	g, s, c := reports.KindGroup+":", reports.KindSubtotal+":", reports.KindComputed+":"
	return []string{
		g + "Income", s + "Total Income",
		g + "Cost of goods sold", s + "Total Cost of goods sold",
		c + "Gross profit",
		g + "Expenses", s + "Total Expenses",
		c + "Net operating income",
		g + "Other income", s + "Total Other income",
		g + "Other expenses", s + "Total Other expenses",
		c + "Net other income",
		c + "Net income",
	}
}

func TestProfitAndLossSpecLoads(t *testing.T) {
	app := newBooksApp(t)
	registerBooksSources(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	shipped := profitAndLossShipped()
	if profitAndLossKey != "books.profit_and_loss" || shipped.Key != profitAndLossKey {
		t.Errorf("key = %q (const %q), want books.profit_and_loss", shipped.Key, profitAndLossKey)
	}
	if shipped.Title != "Profit and Loss" {
		t.Errorf("title = %q, want Profit and Loss", shipped.Title)
	}
	if shipped.Description != "Income and expenses for a period, and what is left, on the accrual basis." {
		t.Errorf("description = %q", shipped.Description)
	}
	if shipped.Revision != 1 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	if !jsonEqual(t, shipped.Spec, string(mustJSON(profitAndLossSpec()))) {
		t.Errorf("the shipped spec is not profitAndLossSpec()")
	}

	spec, _, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.Version != reports.CurrentVersion {
		t.Errorf("version %d, want %d", spec.Version, reports.CurrentVersion)
	}
	if spec.Source != "books.journal_lines" {
		t.Errorf("source = %q, want books.journal_lines", spec.Source)
	}
	if err := reports.Validate(app, spec); err != nil {
		t.Errorf("Validate: %v", err)
	}

	ids := make([]string, len(spec.Params))
	for i, p := range spec.Params {
		ids[i] = p.ID
	}
	if !reflect.DeepEqual(ids, []string{"period", "rows"}) {
		t.Fatalf("params = %v, want period, rows (the chips' order)", ids)
	}
	period := paramOf(t, spec, "period")
	if period.Type != reports.ParamDateRange || period.Label != "Period" || !jsonEqual(t, period.Default, `{"preset":"thisFiscalYearToDate"}`) {
		t.Errorf("period = %+v (default %s), want a dateRange labelled Period, default This fiscal year to date", period, period.Default)
	}
	rows := paramOf(t, spec, "rows")
	wantRows := []reports.Option{{Value: "nonzero", Label: "Non-zero"}, {Value: "active", Label: "Active"}}
	if rows.Type != reports.ParamChoice || rows.Label != "Rows" || rows.Multiple ||
		!reflect.DeepEqual(rows.Options, wantRows) || !jsonEqual(t, rows.Default, `"nonzero"`) {
		t.Errorf("rows = %+v (default %s), want a choice Rows of Non-zero (default) and Active", rows, rows.Default)
	}

	type colWant struct {
		id, label, format string
		hidden            bool
	}
	gotCols := make([]colWant, len(spec.Columns))
	for i, c := range spec.Columns {
		gotCols[i] = colWant{c.ID, c.Label, c.Format, c.Hidden}
	}
	wantCols := []colWant{
		{"account", "Account", "", false},
		{"amount", "Total", "", false},
		{"pct", "% of income", "percent", false},
		{"sec", "", "", true},
	}
	if len(gotCols) != len(wantCols) {
		t.Fatalf("columns = %+v, want %+v", gotCols, wantCols)
	}
	for i, want := range wantCols {
		got := gotCols[i]
		if got.id != want.id || got.format != want.format || got.hidden != want.hidden || (want.label != "" && got.label != want.label) {
			t.Errorf("column %d = %+v, want %+v", i, got, want)
		}
	}

	type groupWant struct {
		id              string
		open, subtotals bool
	}
	gotGroups := make([]groupWant, len(spec.Groups))
	for i, g := range spec.Groups {
		gotGroups[i] = groupWant{g.ID, g.Open, g.Subtotals}
	}
	wantGroups := []groupWant{{"section", true, true}, {"byAccount", false, false}}
	if !reflect.DeepEqual(gotGroups, wantGroups) {
		t.Errorf("groups = %+v, want section (open, subtotals) then byAccount (closed)", gotGroups)
	}
	if len(spec.Groups) == 2 && (spec.Groups[0].Col != "sec" || spec.Groups[1].Col != "account") {
		t.Errorf("group columns = %q, %q; want sec, account", spec.Groups[0].Col, spec.Groups[1].Col)
	}
}

// With no Period the run takes This fiscal year to date, from the Books fiscal
// start month read at the run.
func TestProfitAndLossDefaultPeriod(t *testing.T) {
	cases := []struct {
		name       string
		startMonth int
		from       string
	}{
		{"fiscal year from January", 1, "2026-01-01"},
		{"fiscal year from July", 7, "2026-07-01"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			b := newPLBook(t)
			saveSettings(t, b.app, map[string]any{"fiscal_year_start_month": c.startMonth})
			res := runPL(t, b.app, profitAndLossShipped(), b.reader, nil, reports.Options{Today: plToday})
			var resolved *reports.ResolvedParam
			for i := range res.Params {
				if res.Params[i].ID == "period" {
					resolved = &res.Params[i]
				}
			}
			if resolved == nil || resolved.From != c.from || resolved.To != plToday {
				t.Errorf("resolved period = %+v, want %s..%s", resolved, c.from, plToday)
			}
		})
	}
}

func TestProfitAndLossStatementOrder(t *testing.T) {
	b := newPLBook(t)
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	materials := plAccount(t, b.app, "Materials", "5000", "cost_of_goods_sold", "supplies_materials", "")
	// Saved against the wanted order, so neither storage nor id order passes.
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	office := plAccount(t, b.app, "Office", "6200", "expense", "office_general", "")
	advertising := plAccount(t, b.app, "Advertising", "6100", "expense", "advertising_marketing", "")
	paper := plAccount(t, b.app, "Paper", "", "expense", "office_general", office.Id)
	fees := plAccount(t, b.app, "Bank fees", "", "expense", "bank_charges", "")
	interest := plAccount(t, b.app, "Interest earned", "7000", "other_income", "interest_earned", "")
	penalties := plAccount(t, b.app, "Penalties", "8000", "other_expense", "penalties_settlements", "")
	c := b.checking
	b.post(t, "2026-03-10", ln{c, 100000, 0}, ln{service, 0, 100000})
	b.post(t, "2026-03-10", ln{materials, 20000, 0}, ln{c, 0, 20000})
	b.post(t, "2026-03-11", ln{rent, 30000, 0}, ln{c, 0, 30000})
	b.post(t, "2026-03-11", ln{office, 700, 0}, ln{c, 0, 700})
	b.post(t, "2026-03-11", ln{advertising, 5000, 0}, ln{c, 0, 5000})
	b.post(t, "2026-03-12", ln{paper, 2000, 0}, ln{c, 0, 2000})
	b.post(t, "2026-03-12", ln{fees, 1000, 0}, ln{c, 0, 1000})
	b.post(t, "2026-03-13", ln{c, 3000, 0}, ln{interest, 0, 3000})
	b.post(t, "2026-03-13", ln{penalties, 500, 0}, ln{c, 0, 500})

	res := b.run(t, map[string]any{"period": plMarch})
	g, s, cp := reports.KindGroup+":", reports.KindSubtotal+":", reports.KindComputed+":"
	want := []string{
		g + "Income", g + "4000 Service", s + "Total Income",
		g + "Cost of goods sold", g + "5000 Materials", s + "Total Cost of goods sold",
		cp + "Gross profit",
		// Unnumbered accounts first, then by number; a sub-account is flat
		// under its full name.
		g + "Expenses", g + "Bank fees", g + "Office:Paper", g + "6100 Advertising", g + "6200 Office", g + "6600 Rent or lease", s + "Total Expenses",
		cp + "Net operating income",
		g + "Other income", g + "7000 Interest earned", s + "Total Other income",
		g + "Other expenses", g + "8000 Penalties", s + "Total Other expenses",
		cp + "Net other income",
		cp + "Net income",
	}
	if got := plRowTexts(res.Rows); !slices.Equal(got, want) {
		t.Fatalf("rows =\n%q\nwant\n%q", got, want)
	}
	if last := res.Rows[len(res.Rows)-1]; last.Kind != reports.KindComputed || last.Label != "Net income" {
		t.Errorf("last row = %s, want Net income", plRowText(last))
	}
	paperRow := plRowFor(t, res, paper)
	officeRow := plRowFor(t, res, office)
	if paperRow.Level != officeRow.Level || paperRow.Depth != officeRow.Depth || paperRow.Parent != "" {
		t.Errorf("Office:Paper level %d depth %d parent %q; Office level %d depth %d: want the sub-account flat beside its parent",
			paperRow.Level, paperRow.Depth, paperRow.Parent, officeRow.Level, officeRow.Depth)
	}

	// A period with no posted P&L line: every section shows with its 0.00
	// total, the computed rows read 0.00, and % of income is blank.
	empty := b.run(t, map[string]any{"period": map[string]any{"from": "2025-01-01", "to": "2025-01-31"}})
	if got := plRowTexts(empty.Rows); !slices.Equal(got, plSkeleton()) {
		t.Fatalf("rows with no lines =\n%q\nwant\n%q", got, plSkeleton())
	}
	for _, sec := range plSections {
		if v := plAmount(t, plTotal(t, empty, sec.title)); v != 0 {
			t.Errorf("Total %s = %d with no lines, want 0", sec.title, v)
		}
	}
	for _, label := range plComputed {
		if v := plAmount(t, plComputedRow(t, empty, label)); v != 0 {
			t.Errorf("%s = %d with no lines, want 0", label, v)
		}
	}
	requireNoPct(t, empty)
}

// Each account reads by its normal side: credits less debits for income and
// other income, debits less credits for cost of goods sold, expense and other
// expense.
func TestProfitAndLossSigns(t *testing.T) {
	b := newPLBook(t)
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	discounts := plAccount(t, b.app, "Discounts and refunds given", "4200", "income", "discounts_refunds", "")
	materials := plAccount(t, b.app, "Materials", "5000", "cost_of_goods_sold", "supplies_materials", "")
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	interest := plAccount(t, b.app, "Interest earned", "7000", "other_income", "interest_earned", "")
	penalties := plAccount(t, b.app, "Penalties", "8000", "other_expense", "penalties_settlements", "")
	c := b.checking
	b.post(t, "2026-03-10", ln{c, 50000, 0}, ln{service, 0, 50000})
	b.post(t, "2026-03-11", ln{discounts, 3000, 0}, ln{c, 0, 3000})
	b.post(t, "2026-03-12", ln{materials, 2000, 0}, ln{c, 0, 2000})
	b.post(t, "2026-03-13", ln{rent, 1500, 0}, ln{c, 0, 1500})
	b.post(t, "2026-03-14", ln{c, 400, 0}, ln{interest, 0, 400})
	b.post(t, "2026-03-15", ln{penalties, 700, 0}, ln{c, 0, 700})

	res := b.run(t, map[string]any{"period": plMarch})
	for _, c := range []struct {
		account *core.Record
		want    int64
	}{
		{service, 50000}, {discounts, -3000}, {materials, 2000}, {rent, 1500}, {interest, 400}, {penalties, 700},
	} {
		if got := plAmount(t, plRowFor(t, res, c.account)); got != c.want {
			t.Errorf("%s = %d, want %d", c.account.GetString("full_name"), got, c.want)
		}
	}
}

func TestProfitAndLossComputedRows(t *testing.T) {
	b := newPLBook(t)
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	discounts := plAccount(t, b.app, "Discounts and refunds given", "4200", "income", "discounts_refunds", "")
	materials := plAccount(t, b.app, "Materials", "5000", "cost_of_goods_sold", "supplies_materials", "")
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	fees := plAccount(t, b.app, "Bank fees", "6700", "expense", "bank_charges", "")
	interest := plAccount(t, b.app, "Interest earned", "7000", "other_income", "interest_earned", "")
	penalties := plAccount(t, b.app, "Penalties", "8000", "other_expense", "penalties_settlements", "")
	c := b.checking
	b.post(t, "2026-03-02", ln{c, 100000, 0}, ln{service, 0, 100000})
	b.post(t, "2026-03-03", ln{discounts, 5000, 0}, ln{c, 0, 5000})
	b.post(t, "2026-03-04", ln{materials, 20000, 0}, ln{c, 0, 20000})
	b.post(t, "2026-03-05", ln{c, 1000, 0}, ln{materials, 0, 1000})
	b.post(t, "2026-03-06", ln{rent, 30000, 0}, ln{c, 0, 30000})
	b.post(t, "2026-03-07", ln{fees, 2500, 0}, ln{c, 0, 2500})
	b.post(t, "2026-03-08", ln{c, 3000, 0}, ln{interest, 0, 3000})
	b.post(t, "2026-03-09", ln{penalties, 800, 0}, ln{c, 0, 800})

	// Hand sums of the lines above, by normal side.
	const (
		income        = 100000 - 5000
		cogs          = 20000 - 1000
		expenses      = 30000 + 2500
		otherIncome   = 3000
		otherExpenses = 800
	)
	res := b.run(t, map[string]any{"period": plMarch})
	totals := map[string]int64{
		"Income": income, "Cost of goods sold": cogs, "Expenses": expenses,
		"Other income": otherIncome, "Other expenses": otherExpenses,
	}
	for title, want := range totals {
		if got := plAmount(t, plTotal(t, res, title)); got != want {
			t.Errorf("Total %s = %d, want %d", title, got, want)
		}
	}
	ti := plAmount(t, plTotal(t, res, "Income"))
	tc := plAmount(t, plTotal(t, res, "Cost of goods sold"))
	te := plAmount(t, plTotal(t, res, "Expenses"))
	toi := plAmount(t, plTotal(t, res, "Other income"))
	toe := plAmount(t, plTotal(t, res, "Other expenses"))
	gp := plAmount(t, plComputedRow(t, res, "Gross profit"))
	noi := plAmount(t, plComputedRow(t, res, "Net operating income"))
	nother := plAmount(t, plComputedRow(t, res, "Net other income"))
	ni := plAmount(t, plComputedRow(t, res, "Net income"))
	if gp != ti-tc || gp != income-cogs {
		t.Errorf("Gross profit = %d, want Total Income %d − Total Cost of goods sold %d = %d", gp, ti, tc, income-cogs)
	}
	if noi != gp-te || noi != income-cogs-expenses {
		t.Errorf("Net operating income = %d, want Gross profit %d − Total Expenses %d = %d", noi, gp, te, income-cogs-expenses)
	}
	if nother != toi-toe || nother != otherIncome-otherExpenses {
		t.Errorf("Net other income = %d, want Total Other income %d − Total Other expenses %d = %d", nother, toi, toe, otherIncome-otherExpenses)
	}
	if ni != noi+nother || ni != income-cogs-expenses+otherIncome-otherExpenses {
		t.Errorf("Net income = %d, want Net operating income %d + Net other income %d = %d", ni, noi, nother, income-cogs-expenses+otherIncome-otherExpenses)
	}
}

func TestProfitAndLossPercentOfIncome(t *testing.T) {
	b := newPLBook(t)
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	sales := plAccount(t, b.app, "Sales", "4100", "income", "product_sales", "")
	materials := plAccount(t, b.app, "Materials", "5000", "cost_of_goods_sold", "supplies_materials", "")
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	interest := plAccount(t, b.app, "Interest earned", "7000", "other_income", "interest_earned", "")
	penalties := plAccount(t, b.app, "Penalties", "8000", "other_expense", "penalties_settlements", "")
	c := b.checking
	b.post(t, "2026-03-02", ln{c, 40000, 0}, ln{service, 0, 40000})
	b.post(t, "2026-03-03", ln{c, 10000, 0}, ln{sales, 0, 10000})
	b.post(t, "2026-03-04", ln{materials, 10000, 0}, ln{c, 0, 10000})
	b.post(t, "2026-03-05", ln{rent, 12500, 0}, ln{c, 0, 12500})
	b.post(t, "2026-03-06", ln{c, 2500, 0}, ln{interest, 0, 2500})
	b.post(t, "2026-03-07", ln{penalties, 1000, 0}, ln{c, 0, 1000})

	res := b.run(t, map[string]any{"period": plMarch})
	// Total Income (Income alone, not Other income) is the denominator: 500.00.
	requirePct(t, plTotal(t, res, "Income"), 100.0)
	requirePct(t, plRowFor(t, res, service), 80.0)
	requirePct(t, plRowFor(t, res, sales), 20.0)
	requirePct(t, plRowFor(t, res, materials), 20.0)
	requirePct(t, plTotal(t, res, "Cost of goods sold"), 20.0)
	requirePct(t, plComputedRow(t, res, "Gross profit"), 80.0)
	requirePct(t, plRowFor(t, res, rent), 25.0)
	requirePct(t, plTotal(t, res, "Expenses"), 25.0)
	requirePct(t, plComputedRow(t, res, "Net operating income"), 55.0)
	requirePct(t, plRowFor(t, res, interest), 5.0)
	requirePct(t, plTotal(t, res, "Other income"), 5.0)
	requirePct(t, plRowFor(t, res, penalties), 2.0)
	requirePct(t, plTotal(t, res, "Other expenses"), 2.0)
	requirePct(t, plComputedRow(t, res, "Net other income"), 3.0)
	requirePct(t, plComputedRow(t, res, "Net income"), 58.0)
	// Every account, section total and computed row is its own amount over the
	// same denominator.
	ti := plAmount(t, plTotal(t, res, "Income"))
	for _, r := range res.Rows {
		if plIsAccount(r) || r.Kind == reports.KindSubtotal || r.Kind == reports.KindComputed {
			requirePct(t, r, plWantPct(plAmount(t, r), ti))
		}
	}

	t.Run("other income only", func(t *testing.T) {
		o := newPLBook(t)
		interest := plAccount(t, o.app, "Interest earned", "7000", "other_income", "interest_earned", "")
		o.post(t, "2026-03-06", ln{o.checking, 2500, 0}, ln{interest, 0, 2500})
		res := o.run(t, map[string]any{"period": plMarch})
		if got := plAmount(t, plRowFor(t, res, interest)); got != 2500 {
			t.Fatalf("Interest earned = %d, want 2500", got)
		}
		requireNoPct(t, res)
	})
	t.Run("no income", func(t *testing.T) {
		o := newPLBook(t)
		rent := plAccount(t, o.app, "Rent or lease", "6600", "expense", "rent_lease", "")
		o.post(t, "2026-03-05", ln{rent, 12500, 0}, ln{o.checking, 0, 12500})
		res := o.run(t, map[string]any{"period": plMarch})
		if got := plAmount(t, plRowFor(t, res, rent)); got != 12500 {
			t.Fatalf("Rent or lease = %d, want 12500", got)
		}
		requireNoPct(t, res)
	})
}

func TestProfitAndLossPostedInPeriod(t *testing.T) {
	b := newPLBook(t)
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	retired := plAccount(t, b.app, "Old income", "4300", "income", "other_primary_income", "")
	c := b.checking
	b.post(t, "2026-03-10", ln{c, 10000, 0}, ln{service, 0, 10000})
	b.post(t, "2026-03-12", ln{c, 2000, 0}, ln{retired, 0, 2000})
	// Outside the period, both sides.
	b.post(t, "2026-02-28", ln{c, 4000, 0}, ln{service, 0, 4000})
	b.post(t, "2026-04-01", ln{c, 5000, 0}, ln{service, 0, 5000})
	// A draft in the period.
	mkDraft(t, b.app, "2026-03-11", ln{c, 777, 0}, ln{service, 0, 777})

	res := b.run(t, map[string]any{"period": plMarch, "rows": "active"})
	if got := plAmount(t, plRowFor(t, res, service)); got != 10000 {
		t.Errorf("Service = %d, want 10000 (no draft, no line outside March)", got)
	}
	if plHasRow(t, res, c) {
		t.Errorf("the bank account %s shows: a balance-sheet account's line is not a P&L line", c.GetString("full_name"))
	}
	for _, r := range plAccountRows(res) {
		if id := plAccountOf(t, r); id != service.Id && id != retired.Id {
			t.Errorf("unexpected account row %q", r.Label)
		}
	}

	// A void and its reversal cancel.
	voided := b.post(t, "2026-03-15", ln{c, 3000, 0}, ln{service, 0, 3000})
	if err := setStatus(b.app, voided.Id, statusVoid, ""); err != nil {
		t.Fatalf("void: %v", err)
	}
	if reload(t, b.app, "books_journal_entries", voided.Id).GetString("status") != statusVoid {
		t.Fatal("the entry was not voided")
	}
	afterVoid := b.run(t, map[string]any{"period": plMarch, "rows": "active"})
	if got := plAmount(t, plRowFor(t, afterVoid, service)); got != 10000 {
		t.Errorf("Service after a void pair = %d, want 10000 (the void and its reversal cancel)", got)
	}

	// An account made inactive after it posted still shows (D9).
	before := plAmount(t, plComputedRow(t, afterVoid, "Net income"))
	makeAccountInactive(t, b.app, retired)
	inactive := b.run(t, map[string]any{"period": plMarch})
	if got := plAmount(t, plRowFor(t, inactive, retired)); got != 2000 {
		t.Errorf("the inactive Old income = %d, want 2000", got)
	}
	if got := plAmount(t, plComputedRow(t, inactive, "Net income")); got != before || got != 12000 {
		t.Errorf("Net income = %d after the account went inactive, want %d (unchanged, 12000)", got, before)
	}
}

func TestProfitAndLossRows(t *testing.T) {
	b := newPLBook(t)
	c := b.checking
	busy := plAccount(t, b.app, "Busy", "6100", "expense", "rent_lease", "")
	zeroed := plAccount(t, b.app, "Zeroed", "6200", "expense", "office_general", "")
	drafted := plAccount(t, b.app, "Drafted", "6300", "expense", "travel", "")
	outside := plAccount(t, b.app, "Outside", "6400", "expense", "meals", "")
	b.post(t, "2026-03-02", ln{busy, 7000, 0}, ln{c, 0, 7000})
	b.post(t, "2026-03-03", ln{zeroed, 5000, 0}, ln{c, 0, 5000})
	b.post(t, "2026-03-04", ln{c, 5000, 0}, ln{zeroed, 0, 5000})
	mkDraft(t, b.app, "2026-03-05", ln{drafted, 900, 0}, ln{c, 0, 900})
	b.post(t, "2026-04-05", ln{outside, 600, 0}, ln{c, 0, 600})

	nonzero := b.run(t, map[string]any{"period": plMarch, "rows": "nonzero"})
	if got := plAccountIDs(t, nonzero); !sameAccounts(got, idsOf(busy)) {
		t.Errorf("Non-zero rows = %v, want only Busy", plRowTexts(plAccountRows(nonzero)))
	}
	byDefault := b.run(t, map[string]any{"period": plMarch})
	if got := plAccountIDs(t, byDefault); !sameAccounts(got, idsOf(busy)) {
		t.Errorf("rows with no Rows param = %v, want only Busy (Non-zero is the default)", plRowTexts(plAccountRows(byDefault)))
	}
	active := b.run(t, map[string]any{"period": plMarch, "rows": "active"})
	if got := plAccountIDs(t, active); !sameAccounts(got, idsOf(busy, zeroed)) {
		t.Errorf("Active rows = %v, want Busy and Zeroed (no draft-only or out-of-period account)", plRowTexts(plAccountRows(active)))
	}
	if plHasRow(t, active, zeroed) {
		if got := plAmount(t, plRowFor(t, active, zeroed)); got != 0 {
			t.Errorf("Zeroed under Active = %d, want 0", got)
		}
	}
}

// Each account's Total is the General Ledger's net of the account for the same
// period, by the account's normal side.
func TestProfitAndLossMatchesGeneralLedger(t *testing.T) {
	b := newPLBook(t)
	c := b.checking
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	discounts := plAccount(t, b.app, "Discounts and refunds given", "4200", "income", "discounts_refunds", "")
	materials := plAccount(t, b.app, "Materials", "5000", "cost_of_goods_sold", "supplies_materials", "")
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	interest := plAccount(t, b.app, "Interest earned", "7000", "other_income", "interest_earned", "")
	penalties := plAccount(t, b.app, "Penalties", "8000", "other_expense", "penalties_settlements", "")
	b.post(t, "2026-02-20", ln{c, 9000, 0}, ln{service, 0, 9000})
	b.post(t, "2026-03-02", ln{c, 40000, 0}, ln{service, 0, 40000})
	b.post(t, "2026-03-03", ln{service, 1500, 0}, ln{c, 0, 1500})
	b.post(t, "2026-03-04", ln{discounts, 2000, 0}, ln{c, 0, 2000})
	b.post(t, "2026-03-05", ln{materials, 8000, 0}, ln{c, 0, 8000})
	b.post(t, "2026-03-06", ln{c, 500, 0}, ln{materials, 0, 500})
	b.post(t, "2026-03-07", ln{rent, 12000, 0}, ln{c, 0, 12000})
	b.post(t, "2026-03-08", ln{c, 700, 0}, ln{interest, 0, 700})
	b.post(t, "2026-03-09", ln{penalties, 300, 0}, ln{c, 0, 300})
	b.post(t, "2026-04-02", ln{rent, 999, 0}, ln{c, 0, 999})
	opts := reports.Options{Today: plToday}

	pl := runPL(t, b.app, profitAndLossShipped(), b.reader, map[string]any{"period": plMarch}, opts)
	gl := runGL(t, b.app, b.reader, map[string]any{"period": plMarch}, opts)
	accounts := []*core.Record{service, discounts, materials, rent, interest, penalties}
	if got := plAccountIDs(t, pl); !sameAccounts(got, idsOf(accounts...)) {
		t.Fatalf("P&L rows = %v, want the six accounts with lines in March", plRowTexts(plAccountRows(pl)))
	}
	for _, a := range accounts {
		s := sectionFor(t, gl, a)
		if s.total == nil {
			t.Errorf("%s has no General Ledger total row", s.head.Label)
			continue
		}
		d, _ := moneyCell(t, *s.total, "debit")
		cr, _ := moneyCell(t, *s.total, "credit")
		ty, ok := accountType(a.GetString("type"))
		if !ok {
			t.Fatalf("%s has no account type", a.GetString("full_name"))
		}
		want := d - cr
		if ty.Normal == "credit" {
			want = cr - d
		}
		if got := plAmount(t, plRowFor(t, pl, a)); got != want {
			t.Errorf("%s = %d, want %d (the General Ledger's March debits %d, credits %d, by the %s side)",
				a.GetString("full_name"), got, want, d, cr, ty.Normal)
		}
	}
}

func TestProfitAndLossNoSectionKey(t *testing.T) {
	b := newPLBook(t)
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	b.post(t, "2026-03-02", ln{b.checking, 40000, 0}, ln{service, 0, 40000})
	b.post(t, "2026-03-03", ln{rent, 12000, 0}, ln{b.checking, 0, 12000})

	res := b.run(t, map[string]any{"period": plMarch})
	ids := make([]string, len(res.Columns))
	for i, c := range res.Columns {
		ids[i] = c.ID
	}
	if !slices.Equal(ids, []string{"account", "amount", "pct"}) {
		t.Errorf("result columns = %v, want account, amount, pct (the section key stays hidden)", ids)
	}
	if len(res.Rows) == 0 {
		t.Fatal("the run has no rows")
	}
	for _, r := range res.Rows {
		if v, has := r.Cells["sec"]; has {
			t.Errorf("%s (%s) carries a sec cell %#v", r.Label, r.Kind, v)
		}
	}
}

// A user with Books level none runs the report without error and gets no
// account rows: every section and computed row reads 0 (D8).
func TestProfitAndLossNoAccess(t *testing.T) {
	b := newPLBook(t)
	outsider := mkUser(t, b.app, "member")
	setPkgAccess(t, b.app, outsider, "none")
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	b.post(t, "2026-03-02", ln{b.checking, 40000, 0}, ln{service, 0, 40000})
	b.post(t, "2026-03-03", ln{rent, 12000, 0}, ln{b.checking, 0, 12000})

	if got := plAccountIDs(t, b.run(t, map[string]any{"period": plMarch})); !sameAccounts(got, idsOf(service, rent)) {
		t.Fatalf("a Books reader sees accounts %v, want Service and Rent or lease", got)
	}
	res := runPL(t, b.app, profitAndLossShipped(), outsider, map[string]any{"period": plMarch, "rows": "active"}, reports.Options{Today: plToday})
	if rows := plAccountRows(res); len(rows) != 0 {
		t.Errorf("a user with Books level none sees %v", plRowTexts(rows))
	}
	if got := plRowTexts(res.Rows); !slices.Equal(got, plSkeleton()) {
		t.Fatalf("rows = %q, want the statement with no account rows %q", got, plSkeleton())
	}
	for _, sec := range plSections {
		if v := plAmount(t, plTotal(t, res, sec.title)); v != 0 {
			t.Errorf("Total %s = %d for a user with no access, want 0", sec.title, v)
		}
	}
	for _, label := range plComputed {
		if v := plAmount(t, plComputedRow(t, res, label)); v != 0 {
			t.Errorf("%s = %d for a user with no access, want 0", label, v)
		}
	}
}

// Register ships the Profit and Loss; core creates it unpublished, and Books
// shares it with every Books reader.
func TestProfitAndLossShippedShared(t *testing.T) {
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	app, _ := newRegisteredApp(t)
	mkUser(t, app, "owner")
	reader := mkUser(t, app, "member")
	setPkgAccess(t, app, reader, "readonly")
	if err := reports.ReconcileShipped(app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": "books.profit_and_loss"})
	if err != nil {
		t.Fatalf("no reports row with shipped_key books.profit_and_loss: %v", err)
	}
	if row.GetBool("published") || row.GetString("published_by") != "" {
		t.Errorf("published = %v (by %q), want unpublished", row.GetBool("published"), row.GetString("published_by"))
	}
	if row.GetString("title") != "Profit and Loss" || row.GetInt("shipped_revision") != 1 || row.GetString("source") != "books.journal_lines" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a Books reader")
}

// plLine is one posted entry of two lines: account takes debit (or credit,
// when debit is 0), other takes the opposite side. The line on account has
// the record id lineID ("" for a server one) and its own memo ("" for none),
// so a test sets the storage order of an opened account's lines.
type plLine struct {
	date, entryMemo, lineID, lineMemo string
	account, other                    *core.Record
	debit, credit                     int
}

func (b plBook) postLine(t *testing.T, l plLine) *core.Record {
	t.Helper()
	entry := saveRecord(t, b.app, "books_journal_entries", map[string]any{
		"date": l.date, "status": "draft", "doc_type": "journal", "origin": "manual", "currency": "USD", "memo": l.entryMemo,
	})
	line := map[string]any{
		"entry": entry.Id, "account": l.account.Id, "debit": l.debit, "credit": l.credit,
		"memo": l.lineMemo, "position": 0, "currency": "USD",
	}
	if l.lineID != "" {
		line["id"] = l.lineID
	}
	saveRecord(t, b.app, "books_journal_lines", line)
	saveRecord(t, b.app, "books_journal_lines", map[string]any{
		"entry": entry.Id, "account": l.other.Id, "debit": l.credit, "credit": l.debit, "position": 1, "currency": "USD",
	})
	return mustPost(t, b.app, entry.Id, "")
}

// plOpening is the run options that open one account row, as core's view
// sends them: Expand names the row, and Collapse is sent (empty), so the
// sections, open by default, stay open beside it (core run.go: an Expand with
// no Collapse opens only the groups it lists).
func plOpening(account reports.Row) reports.Options {
	return reports.Options{Today: plToday, Expand: [][]any{account.GroupKey}, Collapse: [][]any{}}
}

// plLineLabel is an opened line's label: "<date> · <entry number> · <memo>".
func plLineLabel(entry *core.Record, memo string) string {
	return entry.GetString("date") + " · " + entry.GetString("number") + " · " + memo
}

// plLinesOf are the detail rows of the opened account row, in result order.
func plLinesOf(res *reports.Result, account reports.Row) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindDetail && r.Section == account.ID {
			out = append(out, r)
		}
	}
	return out
}

func plDetailRows(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindDetail {
			out = append(out, r)
		}
	}
	return out
}

// An opened account shows its posted lines in the period beneath it, in date
// order then entry sequence, labelled "<date> · <entry number> · <memo>" (the
// entry's memo when the line has none), each by the account's normal side, %
// of income blank. The line ids run against both orders, and the entries post
// out of date order, so neither storage nor posting order passes.
func TestProfitAndLossOpenedLines(t *testing.T) {
	b := newPLBook(t)
	c := b.checking
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	late := b.postLine(t, plLine{date: "2026-03-20", entryMemo: "Late rent", lineID: "plopenedline001", account: rent, other: c, debit: 4000})
	early := b.postLine(t, plLine{date: "2026-03-05", entryMemo: "Rent entry", lineID: "plopenedline003", lineMemo: "Early rent", account: rent, other: c, debit: 1000})
	// Two lines on one day: first posts first (the lower sequence), but its
	// line id sorts after second's.
	first := b.postLine(t, plLine{date: "2026-03-12", entryMemo: "Mid rent one", lineID: "plopenedline005", account: rent, other: c, debit: 2000})
	second := b.postLine(t, plLine{date: "2026-03-12", entryMemo: "Mid rent two", lineID: "plopenedline004", account: rent, other: c, debit: 3000})
	if first.GetInt("sequence") >= second.GetInt("sequence") {
		t.Fatalf("sequences %d, %d: want the first post lower", first.GetInt("sequence"), second.GetInt("sequence"))
	}
	// Not among the opened lines: a draft and a line outside the period.
	mkDraft(t, b.app, "2026-03-15", ln{rent, 777, 0}, ln{c, 0, 777})
	b.postLine(t, plLine{date: "2026-04-02", entryMemo: "April rent", account: rent, other: c, debit: 999})
	sale := b.postLine(t, plLine{date: "2026-03-08", entryMemo: "Sale", lineMemo: "Design work", account: service, other: c, credit: 7500})

	closed := b.run(t, map[string]any{"period": plMarch})
	if got := plDetailRows(closed); len(got) != 0 {
		t.Fatalf("with no Expand the run has detail rows %v, want none", plRowTexts(got))
	}
	for _, label := range plComputed {
		if r := plComputedRow(t, closed, label); r.CanExpand {
			t.Errorf("the computed row %s can open, want not", label)
		}
	}

	opts := plOpening(plRowFor(t, closed, rent))
	open := runPL(t, b.app, profitAndLossShipped(), b.reader, map[string]any{"period": plMarch}, opts)
	rentRow := plRowFor(t, open, rent)
	lines := plLinesOf(open, rentRow)
	gotLabels := make([]string, len(lines))
	for i, r := range lines {
		gotLabels[i] = r.Label
	}
	wantLabels := []string{
		plLineLabel(early, "Early rent"),
		plLineLabel(first, "Mid rent one"),
		plLineLabel(second, "Mid rent two"),
		plLineLabel(late, "Late rent"),
	}
	if !slices.Equal(gotLabels, wantLabels) {
		t.Fatalf("opened lines =\n%q\nwant (date, then entry sequence; the entry memo when the line has none)\n%q", gotLabels, wantLabels)
	}
	for i, want := range []int64{1000, 2000, 3000, 4000} {
		if got := plAmount(t, lines[i]); got != want {
			t.Errorf("%s Total = %d, want %d", lines[i].Label, got, want)
		}
	}
	for _, r := range plDetailRows(open) {
		if v, has := r.Cells["pct"]; has {
			t.Errorf("opened line %q has a pct cell %#v, want none (%% of income is blank on an opened line)", r.Label, v)
		}
	}
	if got := len(plDetailRows(open)); got != len(lines) {
		t.Errorf("%d detail rows, want only the opened account's %d", got, len(lines))
	}

	// An income line credited 75.00 reads 75.00 by its normal side.
	opts = plOpening(plRowFor(t, closed, service))
	income := runPL(t, b.app, profitAndLossShipped(), b.reader, map[string]any{"period": plMarch}, opts)
	saleLines := plLinesOf(income, plRowFor(t, income, service))
	if len(saleLines) != 1 {
		t.Fatalf("Service's opened lines = %v, want one", plRowTexts(saleLines))
	}
	if want := plLineLabel(sale, "Design work"); saleLines[0].Label != want {
		t.Errorf("Service's line = %q, want %q", saleLines[0].Label, want)
	}
	if got := plAmount(t, saleLines[0]); got != 7500 {
		t.Errorf("Service's line Total = %d, want 7500 (credits less debits)", got)
	}
	for _, label := range plComputed {
		if r := plComputedRow(t, income, label); r.CanExpand {
			t.Errorf("the computed row %s can open with an account open, want not", label)
		}
	}
}

// plMergedPages joins a run's pages as core's view does (core reports/lib/rows.ts
// mergePages): each earlier page's trailing whole-report rows (the layout's
// top-level computed rows after the page's slice) go, as the next page gives
// them again. Any other row on two pages fails the test.
func plMergedPages(t *testing.T, pages []*reports.Result) []reports.Row {
	t.Helper()
	var rows []reports.Row
	seen := map[string]int{}
	for i, p := range pages {
		page := p.Rows
		if i < len(pages)-1 {
			end := len(page)
			for end > 0 && (page[end-1].Kind == reports.KindTotal || (page[end-1].Kind == reports.KindComputed && page[end-1].Section == "")) {
				end--
			}
			page = page[:end]
		}
		for _, r := range page {
			if at, ok := seen[r.ID]; ok {
				t.Fatalf("%s row %s (%s) is on page %d and page %d", r.Kind, r.ID, r.Label, at+1, i+1)
			}
			seen[r.ID] = i
			rows = append(rows, r)
		}
	}
	return rows
}

// An opened account longer than a page continues on the next. A layout
// report does not page its group rows (core run.go pagedGroups is false with a
// layout): one statement reads every section, account and computed row, and
// only the detail pass pages, by options.limit. Each page is pageWindow's
// slice (core assemble.go): from after the previous page's last line's group
// row (from the start on page 1) to this page's last line (to the end on the
// last page), then the top-level computed rows that fall after the slice,
// appended to every page. So page 1 holds the statement down to the fifth
// line and ends in Net operating income, Net other income and Net income;
// page 2 holds the last three lines and the rest of the statement.
func TestProfitAndLossPagesOpenedLines(t *testing.T) {
	b := newPLBook(t)
	c := b.checking
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	advertising := plAccount(t, b.app, "Advertising", "6100", "expense", "advertising_marketing", "")
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	utilities := plAccount(t, b.app, "Utilities", "6800", "expense", "utilities", "")
	interest := plAccount(t, b.app, "Interest earned", "7000", "other_income", "interest_earned", "")
	b.post(t, "2026-03-01", ln{c, 90000, 0}, ln{service, 0, 90000})
	b.post(t, "2026-03-01", ln{advertising, 500, 0}, ln{c, 0, 500})
	b.post(t, "2026-03-01", ln{utilities, 600, 0}, ln{c, 0, 600})
	b.post(t, "2026-03-01", ln{c, 700, 0}, ln{interest, 0, 700})
	var want []string
	for k := 1; k <= 8; k++ {
		day := "2026-03-1" + string(rune('0'+k))
		memo := "Rent part " + string(rune('0'+k))
		e := b.postLine(t, plLine{date: day, entryMemo: memo, account: rent, other: c, debit: 100 * k})
		want = append(want, plLineLabel(e, memo))
	}
	params := map[string]any{"period": plMarch}
	closed := b.run(t, params)
	opts := plOpening(plRowFor(t, closed, rent))
	opts.Limit = 5

	var pages []*reports.Result
	for range 10 {
		res := runPL(t, b.app, profitAndLossShipped(), b.reader, params, opts)
		pages = append(pages, res)
		if res.Page == nil || res.Page.Next == "" {
			break
		}
		opts.Cursor = res.Page.Next
	}
	if len(pages) < 2 {
		t.Fatalf("%d page(s), want the 8 opened lines over at least two pages of 5", len(pages))
	}
	if n := len(plDetailRows(pages[0])); n == 0 || n >= 8 {
		t.Fatalf("page 1 holds %d lines, want page 1 to end inside the 8 lines", n)
	}
	merged := plMergedPages(t, pages)
	all := &reports.Result{Rows: merged}

	var got []string
	for _, r := range plDetailRows(all) {
		got = append(got, r.Label)
	}
	if !slices.Equal(got, want) {
		t.Fatalf("lines over the pages =\n%q\nwant each once, in date order\n%q", got, want)
	}
	rentRow := plRowFor(t, all, rent)
	for _, r := range plDetailRows(all) {
		if r.Section != rentRow.ID {
			t.Errorf("line %q is under %s, want under %s", r.Label, r.Section, rentRow.ID)
		}
	}
	var skeleton []string
	for _, r := range merged {
		if r.Kind != reports.KindDetail && !plIsAccount(r) {
			skeleton = append(skeleton, plRowText(r))
		}
	}
	if !slices.Equal(skeleton, plSkeleton()) {
		t.Fatalf("sections, totals and computed rows over the pages =\n%q\nwant each once, in statement order\n%q", skeleton, plSkeleton())
	}
	g := reports.KindGroup + ":"
	wantAccounts := []string{g + "4000 Service", g + "6100 Advertising", g + "6600 Rent or lease", g + "6800 Utilities", g + "7000 Interest earned"}
	if got := plRowTexts(plAccountRows(all)); !slices.Equal(got, wantAccounts) {
		t.Errorf("account rows over the pages = %q, want each once %q", got, wantAccounts)
	}
}

// Every collection the run reads is a topic, so a post, a void, an account
// edit or a Books settings change re-runs the open report. The opened
// account's lines read their entries (the detail label), so the run opens one.
// Not a guard: it was red on checkpoint 1's spec, which read no
// books_journal_entries field until the detail label and the [entry, sequence]
// sort key added the read.
func TestProfitAndLossTopics(t *testing.T) {
	wantTopics := []string{
		"collection/books_journal_lines", "collection/books_journal_entries",
		"collection/books_accounts", "collection/books_settings",
	}
	t.Run("profit and loss", func(t *testing.T) {
		b := newPLBook(t)
		rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
		b.post(t, "2026-03-10", ln{rent, 4000, 0}, ln{b.checking, 0, 4000})
		closed := b.run(t, map[string]any{"period": plMarch})
		opts := plOpening(plRowFor(t, closed, rent))

		res := runPL(t, b.app, profitAndLossShipped(), b.reader, map[string]any{"period": plMarch}, opts)
		for _, topic := range wantTopics {
			if !slices.Contains(res.Topics, topic) {
				t.Errorf("topics = %v, want %s", res.Topics, topic)
			}
		}
	})
	t.Run("by month", func(t *testing.T) {
		b := newPLBook(t)
		rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
		b.post(t, "2026-03-10", ln{rent, 4000, 0}, ln{b.checking, 0, 4000})

		res := b.runByMonth(t, map[string]any{"period": plMarch})
		if !plHasRow(t, res, rent) {
			t.Fatalf("the by-month run has no Rent or lease row; rows %v", plRowTexts(res.Rows))
		}
		// The by-month report has no opened lines, so it reads no entry field:
		// a post or a void reaches it through the lines it stamps (posting sets
		// a line's posted and date; a void posts reversal lines).
		for _, topic := range []string{
			"collection/books_journal_lines", "collection/books_accounts", "collection/books_settings",
		} {
			if !slices.Contains(res.Topics, topic) {
				t.Errorf("topics = %v, want %s", res.Topics, topic)
			}
		}
		// Plan D13: three topics. A books_journal_entries topic would re-run
		// the report on every entry write (a draft save, a memo edit) that
		// changes no figure it shows.
		if slices.Contains(res.Topics, "collection/books_journal_entries") {
			t.Errorf("topics = %v, want no collection/books_journal_entries (D13)", res.Topics)
		}
	})
}

// --- Profit and Loss by Month ---

// plQ1 is the by-month tests' period: January to March 2026.
var plQ1 = map[string]any{"from": "2026-01-01", "to": "2026-03-31"}

func (b plBook) runByMonth(t *testing.T, params map[string]any) *reports.Result {
	t.Helper()
	return runPL(t, b.app, profitAndLossByMonthShipped(), b.reader, params, reports.Options{Today: plToday})
}

// plMonths are the result's month columns (pivot columns), in result order.
func plMonths(res *reports.Result) []reports.ResultColumn {
	var out []reports.ResultColumn
	for _, c := range res.Columns {
		if c.Pivot != nil {
			out = append(out, c)
		}
	}
	return out
}

// plMonthKeys are the raw keys ("2026-01") of the month columns, in order.
func plMonthKeys(t *testing.T, res *reports.Result) []string {
	t.Helper()
	var out []string
	for _, c := range plMonths(res) {
		key, ok := c.Pivot.Key.(string)
		if !ok {
			t.Fatalf("month column %s key = %#v, a %T; want a string month key", c.ID, c.Pivot.Key, c.Pivot.Key)
		}
		out = append(out, key)
	}
	return out
}

// plMonthCell is a row's amount in the month column with the key: it must
// hold an amount (a month with no line reads 0, not blank).
func plMonthCell(t *testing.T, res *reports.Result, r reports.Row, key string) int64 {
	t.Helper()
	for _, c := range plMonths(res) {
		if c.Pivot.Key == key {
			v, ok := moneyCell(t, r, c.ID)
			if !ok {
				t.Fatalf("%s (%s) is blank in month %s, want an amount", r.Label, r.Kind, key)
			}
			return v
		}
	}
	t.Fatalf("no month column %s; months %v", key, plMonthKeys(t, res))
	return 0
}

// plMonthSum adds a row's month cells.
func plMonthSum(t *testing.T, res *reports.Result, r reports.Row) int64 {
	t.Helper()
	var sum int64
	for _, key := range plMonthKeys(t, res) {
		sum += plMonthCell(t, res, r, key)
	}
	return sum
}

// plColumnShape names each result column: its id, or "month:<key>" for a
// month column.
func plColumnShape(res *reports.Result) []string {
	out := make([]string, len(res.Columns))
	for i, c := range res.Columns {
		if c.Pivot != nil {
			out[i] = "month:" + fmt.Sprint(c.Pivot.Key)
			continue
		}
		out[i] = c.ID
	}
	return out
}

func plJSON(t *testing.T, v any) string {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return string(raw)
}

func TestProfitAndLossByMonthSpecLoads(t *testing.T) {
	app := newBooksApp(t)
	registerBooksSources(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	shipped := profitAndLossByMonthShipped()
	if profitAndLossByMonthKey != "books.profit_and_loss_by_month" || shipped.Key != profitAndLossByMonthKey {
		t.Errorf("key = %q (const %q), want books.profit_and_loss_by_month", shipped.Key, profitAndLossByMonthKey)
	}
	if shipped.Title != "Profit and Loss by Month" {
		t.Errorf("title = %q, want Profit and Loss by Month", shipped.Title)
	}
	if shipped.Description != "Income and expenses month by month for a period, on the accrual basis." {
		t.Errorf("description = %q", shipped.Description)
	}
	if shipped.Revision != 1 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	if !jsonEqual(t, shipped.Spec, string(mustJSON(profitAndLossByMonthSpec()))) {
		t.Errorf("the shipped spec is not profitAndLossByMonthSpec()")
	}

	// The spec's parts, read before Load so each missing part is named.
	var spec reports.Spec
	if err := json.Unmarshal(shipped.Spec, &spec); err != nil {
		t.Fatalf("decode the shipped spec: %v", err)
	}
	pl := profitAndLossSpec()
	if got, want := plJSON(t, spec.Params), plJSON(t, pl.Params); got != want {
		t.Errorf("params = %s, want the Profit and Loss's %s", got, want)
	}
	if got, want := plJSON(t, spec.Filter), plJSON(t, pl.Filter); got != want {
		t.Errorf("filter = %s, want the Profit and Loss's %s", got, want)
	}
	if got, want := plJSON(t, spec.Groups), plJSON(t, pl.Groups); got != want {
		t.Errorf("groups = %s, want the Profit and Loss's %s", got, want)
	}
	if got, want := plJSON(t, spec.Layout), plJSON(t, pl.Layout); got != want {
		t.Errorf("layout = %s, want the Profit and Loss's %s", got, want)
	}
	// The two record sort keys only: no [date] / [entry, sequence] (no detail rows).
	if got, want := plJSON(t, spec.Sort), plJSON(t, pl.Sort[:2]); got != want {
		t.Errorf("sort = %s, want the two record keys %s", got, want)
	}

	ids := make([]string, len(spec.Columns))
	for i, c := range spec.Columns {
		ids[i] = c.ID
	}
	if !slices.Equal(ids, []string{"account", "amount", "pct", "sec"}) {
		t.Fatalf("columns = %v, want account, amount, pct, sec", ids)
	}
	plCols := map[string]reports.Column{}
	for _, c := range pl.Columns {
		plCols[c.ID] = c
	}
	for _, c := range spec.Columns {
		if c.Detail != "" {
			t.Errorf("column %s has detail %q, want none (a pivot report has no detail rows)", c.ID, c.Detail)
		}
		switch c.ID {
		case "amount":
			if c.Label != "Total" {
				t.Errorf("amount label = %q, want Total", c.Label)
			}
			if c.Aggregate != reports.Sum {
				t.Errorf("amount aggregate = %q, want sum (D11)", c.Aggregate)
			}
			if got, want := plJSON(t, c.Formula), plJSON(t, plSigned()); got != want {
				t.Errorf("amount formula = %s, want the signed line amount %s", got, want)
			}
		default:
			want := plCols[c.ID]
			want.Detail = ""
			if got, w := plJSON(t, c), plJSON(t, want); got != w {
				t.Errorf("column %s = %s, want the Profit and Loss's (no detail) %s", c.ID, got, w)
			}
		}
	}

	wantPivot := &reports.Pivot{Path: path("date"), Bucket: "month", Cell: "amount", Range: "period", Order: "spec", MaxColumns: 36}
	if !reflect.DeepEqual(spec.Pivot, wantPivot) {
		t.Errorf("pivot = %+v, want %+v", spec.Pivot, wantPivot)
	}
	if spec.Detail != nil {
		t.Errorf("detail = %+v, want none", spec.Detail)
	}
	wantDisplay := &reports.Display{Columns: map[string]reports.ColumnFit{
		"account": {MinWidth: "12ch"},
		"amount":  {MinWidth: "max-content"},
		"pct":     {MinWidth: "max-content"},
	}}
	if !reflect.DeepEqual(spec.Display, wantDisplay) {
		t.Errorf("display = %s, want %s (no layouts, no oneLine)", plJSON(t, spec.Display), plJSON(t, wantDisplay))
	}

	loaded, _, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.Version != reports.CurrentVersion {
		t.Errorf("version %d, want %d", loaded.Version, reports.CurrentVersion)
	}
	if err := reports.Validate(app, loaded); err != nil {
		t.Errorf("Validate: %v", err)
	}
}

func TestProfitAndLossByMonthColumns(t *testing.T) {
	b := newPLBook(t)
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	b.post(t, "2026-01-12", ln{b.checking, 10000, 0}, ln{service, 0, 10000})
	b.post(t, "2026-03-20", ln{b.checking, 5000, 0}, ln{service, 0, 5000})

	res := b.runByMonth(t, map[string]any{"period": plQ1})
	want := []string{"account", "month:2026-01", "month:2026-02", "month:2026-03", "amount", "pct"}
	if got := plColumnShape(res); !slices.Equal(got, want) {
		t.Fatalf("columns = %v, want %v (no sec column)", got, want)
	}
	for _, c := range plMonths(res) {
		if c.Pivot.LabelType != reports.Month {
			t.Errorf("month column %v label type = %q, want %q (D7)", c.Pivot.Key, c.Pivot.LabelType, reports.Month)
		}
	}
	row := plRowFor(t, res, service)
	for key, want := range map[string]int64{"2026-01": 10000, "2026-02": 0, "2026-03": 5000} {
		if got := plMonthCell(t, res, row, key); got != want {
			t.Errorf("Service in %s = %d, want %d", key, got, want)
		}
	}
	if got := plAmount(t, row); got != 15000 {
		t.Errorf("Service Total = %d, want 15000", got)
	}
	if got := plMonthCell(t, res, plTotal(t, res, "Income"), "2026-02"); got != 0 {
		t.Errorf("Total Income in February = %d, want 0", got)
	}
	if got := plMonthCell(t, res, plComputedRow(t, res, "Net income"), "2026-02"); got != 0 {
		t.Errorf("Net income in February = %d, want 0", got)
	}
	for _, r := range plAccountRows(res) {
		if r.CanExpand {
			t.Errorf("account row %s can open, want not (a pivot's innermost level never opens)", r.Label)
		}
	}

	t.Run("no lines", func(t *testing.T) {
		o := newPLBook(t)
		res := o.runByMonth(t, map[string]any{"period": plQ1})
		want := []string{"account", "month:2026-01", "month:2026-02", "month:2026-03", "amount", "pct"}
		if got := plColumnShape(res); !slices.Equal(got, want) {
			t.Fatalf("columns with no lines = %v, want %v", got, want)
		}
		if got := plRowTexts(res.Rows); !slices.Equal(got, plSkeleton()) {
			t.Fatalf("rows with no lines =\n%q\nwant\n%q", got, plSkeleton())
		}
		var zeroRows []reports.Row
		for _, sec := range plSections {
			zeroRows = append(zeroRows, plTotal(t, res, sec.title))
		}
		for _, label := range plComputed {
			zeroRows = append(zeroRows, plComputedRow(t, res, label))
		}
		for _, r := range zeroRows {
			for _, key := range []string{"2026-01", "2026-02", "2026-03"} {
				if v := plMonthCell(t, res, r, key); v != 0 {
					t.Errorf("%s in %s = %d with no lines, want 0", r.Label, key, v)
				}
			}
			if v := plAmount(t, r); v != 0 {
				t.Errorf("%s Total = %d with no lines, want 0", r.Label, v)
			}
		}
		requireNoPct(t, res)
	})
}

// Non-zero reads the period's total, not a month: an account whose months
// cancel is hidden, and Active shows it with each month and a 0.00 Total.
func TestProfitAndLossByMonthRows(t *testing.T) {
	b := newPLBook(t)
	swing := plAccount(t, b.app, "Swing", "6100", "expense", "office_general", "")
	b.post(t, "2026-01-10", ln{swing, 4000, 0}, ln{b.checking, 0, 4000})
	b.post(t, "2026-02-10", ln{b.checking, 4000, 0}, ln{swing, 0, 4000})
	period := map[string]any{"from": "2026-01-01", "to": "2026-02-28"}

	nonzero := b.runByMonth(t, map[string]any{"period": period, "rows": "nonzero"})
	if got := plMonthKeys(t, nonzero); !slices.Equal(got, []string{"2026-01", "2026-02"}) {
		t.Fatalf("months = %v, want 2026-01, 2026-02", got)
	}
	if plHasRow(t, nonzero, swing) {
		t.Errorf("Swing shows under Non-zero, want hidden (its period total is 0)")
	}
	active := b.runByMonth(t, map[string]any{"period": period, "rows": "active"})
	row := plRowFor(t, active, swing)
	if got := plMonthCell(t, active, row, "2026-01"); got != 4000 {
		t.Errorf("Swing in January = %d, want 4000", got)
	}
	if got := plMonthCell(t, active, row, "2026-02"); got != -4000 {
		t.Errorf("Swing in February = %d, want -4000", got)
	}
	if got := plAmount(t, row); got != 0 {
		t.Errorf("Swing Total = %d, want 0", got)
	}
}

// Over lines of every P&L type in three months (and a draft, a line outside
// the period and a void pair, none of which counts), each row's months add to
// its Total, each month's Net income follows from that month's section
// totals, and % of income is the Total over Total Income.
func TestProfitAndLossByMonthAddsUp(t *testing.T) {
	b := newPLBook(t)
	c := b.checking
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	discounts := plAccount(t, b.app, "Discounts and refunds given", "4200", "income", "discounts_refunds", "")
	materials := plAccount(t, b.app, "Materials", "5000", "cost_of_goods_sold", "supplies_materials", "")
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	interest := plAccount(t, b.app, "Interest earned", "7000", "other_income", "interest_earned", "")
	penalties := plAccount(t, b.app, "Penalties", "8000", "other_expense", "penalties_settlements", "")

	b.post(t, "2026-01-05", ln{c, 100000, 0}, ln{service, 0, 100000})
	b.post(t, "2026-01-06", ln{materials, 20000, 0}, ln{c, 0, 20000})
	b.post(t, "2026-01-07", ln{rent, 30000, 0}, ln{c, 0, 30000})
	b.post(t, "2026-01-08", ln{c, 1000, 0}, ln{interest, 0, 1000})
	b.post(t, "2026-01-09", ln{penalties, 500, 0}, ln{c, 0, 500})

	b.post(t, "2026-02-05", ln{c, 50000, 0}, ln{service, 0, 50000})
	b.post(t, "2026-02-06", ln{discounts, 4000, 0}, ln{c, 0, 4000})
	b.post(t, "2026-02-07", ln{rent, 30000, 0}, ln{c, 0, 30000})
	b.post(t, "2026-02-08", ln{penalties, 200, 0}, ln{c, 0, 200})

	b.post(t, "2026-03-05", ln{c, 70000, 0}, ln{service, 0, 70000})
	b.post(t, "2026-03-06", ln{materials, 5000, 0}, ln{c, 0, 5000})
	b.post(t, "2026-03-07", ln{c, 1000, 0}, ln{materials, 0, 1000})
	b.post(t, "2026-03-08", ln{rent, 30000, 0}, ln{c, 0, 30000})
	b.post(t, "2026-03-09", ln{c, 2000, 0}, ln{interest, 0, 2000})

	// None of these counts: a draft, lines outside the period, and a void pair.
	mkDraft(t, b.app, "2026-02-11", ln{c, 777, 0}, ln{service, 0, 777})
	b.post(t, "2025-12-31", ln{c, 888, 0}, ln{service, 0, 888})
	b.post(t, "2026-04-02", ln{rent, 999, 0}, ln{c, 0, 999})
	voided := b.post(t, "2026-02-15", ln{c, 3000, 0}, ln{service, 0, 3000})
	if err := setStatus(b.app, voided.Id, statusVoid, ""); err != nil {
		t.Fatalf("void: %v", err)
	}

	months := []string{"2026-01", "2026-02", "2026-03"}
	res := b.runByMonth(t, map[string]any{"period": plQ1})
	if got := plMonthKeys(t, res); !slices.Equal(got, months) {
		t.Fatalf("months = %v, want %v", got, months)
	}

	// Hand sums by normal side, per month, then the period.
	type want struct {
		months [3]int64
		total  int64
	}
	accounts := []struct {
		account *core.Record
		want    want
	}{
		{service, want{[3]int64{100000, 50000, 70000}, 220000}},
		{discounts, want{[3]int64{0, -4000, 0}, -4000}},
		{materials, want{[3]int64{20000, 0, 4000}, 24000}},
		{rent, want{[3]int64{30000, 30000, 30000}, 90000}},
		{interest, want{[3]int64{1000, 0, 2000}, 3000}},
		{penalties, want{[3]int64{500, 200, 0}, 700}},
	}
	for _, a := range accounts {
		row := plRowFor(t, res, a.account)
		for i, key := range months {
			if got := plMonthCell(t, res, row, key); got != a.want.months[i] {
				t.Errorf("%s in %s = %d, want %d", row.Label, key, got, a.want.months[i])
			}
		}
		if got := plAmount(t, row); got != a.want.total {
			t.Errorf("%s Total = %d, want %d", row.Label, got, a.want.total)
		}
	}
	netIncome := plComputedRow(t, res, "Net income")
	for i, wantNI := range [3]int64{50500, 15800, 38000} {
		if got := plMonthCell(t, res, netIncome, months[i]); got != wantNI {
			t.Errorf("Net income in %s = %d, want %d", months[i], got, wantNI)
		}
	}
	if got := plAmount(t, netIncome); got != 104300 {
		t.Errorf("Net income Total = %d, want 104300", got)
	}

	// Every account, section total and computed row: the months add to Total.
	for _, r := range res.Rows {
		if plIsAccount(r) || r.Kind == reports.KindSubtotal || r.Kind == reports.KindComputed {
			if sum, total := plMonthSum(t, res, r), plAmount(t, r); sum != total {
				t.Errorf("%s (%s): months add to %d, Total = %d", r.Label, r.Kind, sum, total)
			}
		}
	}
	// Each month's Net income is that month's (Income − COGS − Expenses) +
	// (Other income − Other expenses).
	for _, key := range months {
		cell := func(r reports.Row) int64 { return plMonthCell(t, res, r, key) }
		ti, tc, te := cell(plTotal(t, res, "Income")), cell(plTotal(t, res, "Cost of goods sold")), cell(plTotal(t, res, "Expenses"))
		toi, toe := cell(plTotal(t, res, "Other income")), cell(plTotal(t, res, "Other expenses"))
		if got, want := cell(netIncome), (ti-tc-te)+(toi-toe); got != want {
			t.Errorf("Net income in %s = %d, want (%d − %d − %d) + (%d − %d) = %d", key, got, ti, tc, te, toi, toe, want)
		}
	}
	// % of income is the row's Total over Total Income's Total.
	ti := plAmount(t, plTotal(t, res, "Income"))
	if ti != 216000 {
		t.Fatalf("Total Income = %d, want 216000", ti)
	}
	for _, r := range res.Rows {
		if plIsAccount(r) || r.Kind == reports.KindSubtotal || r.Kind == reports.KindComputed {
			requirePct(t, r, plWantPct(plAmount(t, r), ti))
		}
	}
}

// A period of 47 months shows its first 36 and core's pivotCap notice; Total
// and % of income still cover all 47.
func TestProfitAndLossByMonthCap(t *testing.T) {
	b := newPLBook(t)
	c := b.checking
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	b.post(t, "2023-01-15", ln{c, 10000, 0}, ln{service, 0, 10000})
	b.post(t, "2024-05-15", ln{rent, 6000, 0}, ln{c, 0, 6000})
	// After the 36 shown months: counted in Total, not in any column.
	b.post(t, "2026-06-15", ln{c, 20000, 0}, ln{service, 0, 20000})

	res := b.runByMonth(t, map[string]any{"period": map[string]any{"from": "2023-01-01", "to": "2026-11-30"}})
	var want []string
	for y := 2023; y <= 2025; y++ {
		for m := 1; m <= 12; m++ {
			want = append(want, fmt.Sprintf("%d-%02d", y, m))
		}
	}
	if got := plMonthKeys(t, res); !slices.Equal(got, want) {
		t.Fatalf("months = %v, want the first 36: %v", got, want)
	}
	var capNotice *reports.Notice
	for i := range res.Notices {
		if res.Notices[i].Code == "pivotCap" {
			capNotice = &res.Notices[i]
		}
	}
	if capNotice == nil {
		t.Fatalf("notices = %+v, want a pivotCap notice", res.Notices)
	}
	if capNotice.LeftOut != 11 || capNotice.Message != "The pivot shows its first 36 columns; 11 more are left out." {
		t.Errorf("pivotCap notice = %+v, want 11 left out", *capNotice)
	}

	serviceRow := plRowFor(t, res, service)
	if got := plMonthCell(t, res, serviceRow, "2023-01"); got != 10000 {
		t.Errorf("Service in 2023-01 = %d, want 10000", got)
	}
	if got := plAmount(t, serviceRow); got != 30000 {
		t.Errorf("Service Total = %d, want 30000 (the 2026-06 line counts)", got)
	}
	netIncome := plComputedRow(t, res, "Net income")
	if got := plAmount(t, netIncome); got != 24000 {
		t.Errorf("Net income Total = %d, want 24000 over all 47 months", got)
	}
	ti := plAmount(t, plTotal(t, res, "Income"))
	if ti != 30000 {
		t.Fatalf("Total Income = %d, want 30000 over all 47 months", ti)
	}
	requirePct(t, serviceRow, 100.0)
	requirePct(t, plRowFor(t, res, rent), plWantPct(6000, 30000))
	requirePct(t, netIncome, plWantPct(24000, 30000))
}

// All dates has no bounds to fill between: the months are exactly those with
// a posted P&L line.
func TestProfitAndLossByMonthAllDates(t *testing.T) {
	b := newPLBook(t)
	c := b.checking
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	reserve := plAccount(t, b.app, "Reserve", "1010", "bank", "savings", "")
	b.post(t, "2025-11-20", ln{rent, 1500, 0}, ln{c, 0, 1500})
	b.post(t, "2026-01-10", ln{c, 4000, 0}, ln{service, 0, 4000})
	b.post(t, "2026-03-05", ln{c, 2500, 0}, ln{service, 0, 2500})
	// Not a P&L line or not posted: neither makes a month.
	b.post(t, "2025-12-10", ln{reserve, 9000, 0}, ln{c, 0, 9000})
	mkDraft(t, b.app, "2026-02-10", ln{c, 777, 0}, ln{service, 0, 777})

	res := b.runByMonth(t, map[string]any{"period": map[string]any{"preset": "allDates"}})
	if got, want := plMonthKeys(t, res), []string{"2025-11", "2026-01", "2026-03"}; !slices.Equal(got, want) {
		t.Errorf("months = %v, want %v", got, want)
	}
	if got := plAmount(t, plRowFor(t, res, service)); got != 6500 {
		t.Errorf("Service Total = %d, want 6500", got)
	}
}

// A user with Books level none runs the report without error and gets no
// account rows: every section total and computed row reads 0 in every month
// and in Total (D8).
func TestProfitAndLossByMonthNoAccess(t *testing.T) {
	b := newPLBook(t)
	outsider := mkUser(t, b.app, "member")
	setPkgAccess(t, b.app, outsider, "none")
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	b.post(t, "2026-01-12", ln{b.checking, 40000, 0}, ln{service, 0, 40000})
	b.post(t, "2026-02-03", ln{rent, 12000, 0}, ln{b.checking, 0, 12000})

	if got := plAccountIDs(t, b.runByMonth(t, map[string]any{"period": plQ1})); !sameAccounts(got, idsOf(service, rent)) {
		t.Fatalf("a Books reader sees accounts %v, want Service and Rent or lease", got)
	}
	res := runPL(t, b.app, profitAndLossByMonthShipped(), outsider, map[string]any{"period": plQ1, "rows": "active"}, reports.Options{Today: plToday})
	if rows := plAccountRows(res); len(rows) != 0 {
		t.Errorf("a user with Books level none sees %v", plRowTexts(rows))
	}
	if got := plRowTexts(res.Rows); !slices.Equal(got, plSkeleton()) {
		t.Fatalf("rows = %q, want the statement with no account rows %q", got, plSkeleton())
	}
	months := []string{"2026-01", "2026-02", "2026-03"}
	if got := plMonthKeys(t, res); !slices.Equal(got, months) {
		t.Fatalf("months = %v, want %v", got, months)
	}
	var zeroRows []reports.Row
	for _, sec := range plSections {
		zeroRows = append(zeroRows, plTotal(t, res, sec.title))
	}
	for _, label := range plComputed {
		zeroRows = append(zeroRows, plComputedRow(t, res, label))
	}
	for _, r := range zeroRows {
		for _, key := range months {
			if v := plMonthCell(t, res, r, key); v != 0 {
				t.Errorf("%s in %s = %d for a user with no access, want 0", r.Label, key, v)
			}
		}
		if v := plAmount(t, r); v != 0 {
			t.Errorf("%s Total = %d for a user with no access, want 0", r.Label, v)
		}
	}
}

// Register ships the Profit and Loss by Month; core creates it unpublished,
// and Books shares it with every Books reader.
func TestProfitAndLossByMonthShippedShared(t *testing.T) {
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	app, _ := newRegisteredApp(t)
	mkUser(t, app, "owner")
	reader := mkUser(t, app, "member")
	setPkgAccess(t, app, reader, "readonly")
	if err := reports.ReconcileShipped(app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": "books.profit_and_loss_by_month"})
	if err != nil {
		t.Fatalf("no reports row with shipped_key books.profit_and_loss_by_month: %v", err)
	}
	if row.GetBool("published") || row.GetString("published_by") != "" {
		t.Errorf("published = %v (by %q), want unpublished", row.GetBool("published"), row.GetString("published_by"))
	}
	if row.GetString("title") != "Profit and Loss by Month" || row.GetInt("shipped_revision") != 1 || row.GetString("source") != "books.journal_lines" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a Books reader")
}
