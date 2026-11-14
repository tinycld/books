package books

import (
	"context"
	"encoding/json"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// glToday is the reader's day in every run, so presets never move with the
// clock.
const glToday = "2026-11-04"

// runGLErr loads the shipped General Ledger and runs it as reader, as core's
// run endpoint does: Load, then Run with the posted params.
func runGLErr(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) (*reports.Result, error) {
	t.Helper()
	spec, info, err := reports.Load(generalLedgerShipped().Spec)
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
	return reports.Run(context.Background(), app, reports.Request{
		Spec: spec, Loaded: info, Params: given, Options: opts, Auth: reader,
	})
}

func runGL(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	res, err := runGLErr(t, app, reader, params, opts)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// glPeriod is a custom Period.
func glPeriod(from, to string) map[string]any {
	return map[string]any{"from": from, "to": to}
}

var glAllDates = map[string]any{"preset": "allDates"}

// glBook is a ledger with every hook bound (newLedgerEnv, whose Checking,
// Consulting Income and Rent accounts have no lines unless a test posts to
// them), Books' report sources, and its Books read-only reader.
type glBook struct {
	tbBook
	env *ledgerEnv
}

func newGLBook(t *testing.T) glBook {
	t.Helper()
	env := newLedgerEnv(t)
	registerBooksSources(t)
	return glBook{tbBook: tbBook{app: env.app, reader: env.users.readOnly}, env: env}
}

// glLine is one line of a posted entry, in minor units. id, memo, customer
// and vendor are optional.
type glLine struct {
	id                     string
	account                *core.Record
	debit, credit          int
	memo, customer, vendor string
}

// postEntry saves a manual entry with a memo and its lines (positions in the
// order given), posts it, and returns the posted entry.
func (b glBook) postEntry(t *testing.T, date, memo string, lines ...glLine) *core.Record {
	t.Helper()
	entry := saveRecord(t, b.app, "books_journal_entries", map[string]any{
		"date": date, "status": "draft", "doc_type": "journal", "origin": "manual", "currency": "USD", "memo": memo,
	})
	for i, l := range lines {
		fields := map[string]any{
			"entry": entry.Id, "account": l.account.Id, "debit": l.debit, "credit": l.credit,
			"memo": l.memo, "position": i, "currency": "USD",
		}
		if l.id != "" {
			fields["id"] = l.id
		}
		if l.customer != "" {
			fields["customer"] = l.customer
		}
		if l.vendor != "" {
			fields["vendor"] = l.vendor
		}
		saveRecord(t, b.app, "books_journal_lines", fields)
	}
	return mustPost(t, b.app, entry.Id, "")
}

// entryLineOn is entry's line on account.
func entryLineOn(t *testing.T, app core.App, entryID string, account *core.Record) *core.Record {
	t.Helper()
	line, err := app.FindFirstRecordByFilter("books_journal_lines", "entry = {:e} && account = {:a}",
		dbx.Params{"e": entryID, "a": account.Id})
	if err != nil {
		t.Fatalf("no line of entry %s on %s: %v", entryID, account.GetString("full_name"), err)
	}
	return line
}

// glSection is one account's section: its heading row, then the rows that
// name it as their section, in the order the result holds them.
type glSection struct {
	head    reports.Row
	kinds   []string
	opening *reports.Row
	lines   []reports.Row
	total   *reports.Row
}

func glSections(t *testing.T, res *reports.Result) []glSection {
	t.Helper()
	var out []glSection
	at := map[string]int{}
	for _, r := range res.Rows {
		switch r.Kind {
		case reports.KindGroup:
			at[r.ID] = len(out)
			out = append(out, glSection{head: r})
		case reports.KindOpening, reports.KindDetail, reports.KindSubtotal:
			i, ok := at[r.Section]
			if !ok {
				t.Fatalf("%s row %s (%s) names section %q, which has no group row before it", r.Kind, r.ID, r.Label, r.Section)
			}
			s := &out[i]
			s.kinds = append(s.kinds, r.Kind)
			row := r
			switch r.Kind {
			case reports.KindOpening:
				s.opening = &row
			case reports.KindDetail:
				s.lines = append(s.lines, row)
			case reports.KindSubtotal:
				s.total = &row
			}
		}
	}
	return out
}

func sectionIDs(t *testing.T, secs []glSection) []string {
	t.Helper()
	out := make([]string, len(secs))
	for i, s := range secs {
		out[i] = accountOf(t, s.head)
	}
	return out
}

func sectionLabels(secs []glSection) []string {
	out := make([]string, len(secs))
	for i, s := range secs {
		out[i] = s.head.Label
	}
	return out
}

func findSection(t *testing.T, res *reports.Result, account *core.Record) (glSection, bool) {
	t.Helper()
	for _, s := range glSections(t, res) {
		if accountOf(t, s.head) == account.Id {
			return s, true
		}
	}
	return glSection{}, false
}

func sectionFor(t *testing.T, res *reports.Result, account *core.Record) glSection {
	t.Helper()
	s, ok := findSection(t, res, account)
	if !ok {
		t.Fatalf("no section for %s; sections %v", account.GetString("full_name"), sectionLabels(glSections(t, res)))
	}
	return s
}

func hasSection(t *testing.T, res *reports.Result, account *core.Record) bool {
	t.Helper()
	_, ok := findSection(t, res, account)
	return ok
}

// balanceCell is a row's Balance: it must hold an amount.
func balanceCell(t *testing.T, r reports.Row) int64 {
	t.Helper()
	v, ok := moneyCell(t, r, "balance")
	if !ok {
		t.Fatalf("%s (%s) has a blank Balance, want an amount", r.Label, r.Kind)
	}
	return v
}

func balances(t *testing.T, rows []reports.Row) []int64 {
	t.Helper()
	out := make([]int64, len(rows))
	for i, r := range rows {
		out[i] = balanceCell(t, r)
	}
	return out
}

func debits(t *testing.T, rows []reports.Row) []int64 {
	t.Helper()
	out := make([]int64, len(rows))
	for i, r := range rows {
		out[i], _ = moneyCell(t, r, "debit")
	}
	return out
}

// textCell reads a text cell: "" for an empty cell. A cell of any other type
// fails the test.
func textCell(t *testing.T, r reports.Row, col string) string {
	t.Helper()
	cell := r.Cells[col]
	if cell == nil {
		return ""
	}
	s, ok := cell.(string)
	if !ok {
		t.Fatalf("%s (%s) %s = %#v, a %T; want text", r.Label, r.Kind, col, cell, cell)
	}
	return s
}

// lineRow is the detail row of a journal line.
func lineRow(t *testing.T, res *reports.Result, line *core.Record) reports.Row {
	t.Helper()
	for _, r := range res.Rows {
		if r.Kind == reports.KindDetail && r.ID == "d:"+line.Id {
			return r
		}
	}
	t.Fatalf("no detail row for line %s (%s)", line.Id, line.GetString("memo"))
	return reports.Row{}
}

func hasLineRow(res *reports.Result, line *core.Record) bool {
	for _, r := range res.Rows {
		if r.Kind == reports.KindDetail && r.ID == "d:"+line.Id {
			return true
		}
	}
	return false
}

func findParam(spec *reports.Spec, id string) (reports.ParamDef, bool) {
	for _, p := range spec.Params {
		if p.ID == id {
			return p, true
		}
	}
	return reports.ParamDef{}, false
}

func TestGeneralLedgerSpecLoads(t *testing.T) {
	app := newBooksApp(t)
	registerBooksSources(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	shipped := generalLedgerShipped()
	if generalLedgerKey != "books.general_ledger" || shipped.Key != generalLedgerKey {
		t.Errorf("key = %q (const %q), want books.general_ledger", shipped.Key, generalLedgerKey)
	}
	if shipped.Title != "General Ledger" {
		t.Errorf("title = %q, want General Ledger", shipped.Title)
	}
	if shipped.Description != "Every posted line, grouped by account, for a period." {
		t.Errorf("description = %q", shipped.Description)
	}
	if shipped.Revision != 1 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	built, err := json.Marshal(generalLedgerSpec())
	if err != nil {
		t.Fatal(err)
	}
	if !jsonEqual(t, shipped.Spec, string(built)) {
		t.Errorf("the shipped spec is not generalLedgerSpec()")
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
	if !reflect.DeepEqual(ids, []string{"period", "rows", "accounts"}) {
		t.Errorf("params = %v, want period, rows, accounts (the chips' order)", ids)
	}
	if period, ok := findParam(spec, "period"); !ok || period.Type != reports.ParamDateRange ||
		!jsonEqual(t, period.Default, `{"preset":"thisMonthToDate"}`) {
		t.Errorf("period = %+v (default %s), want a date range defaulting to This month to date", period, period.Default)
	}
	rows, ok := findParam(spec, "rows")
	wantRows := []reports.Option{{Value: "active", Label: "With activity"}, {Value: "all", Label: "All"}}
	if !ok || rows.Type != reports.ParamChoice || rows.Label != "Rows" || rows.Multiple ||
		!reflect.DeepEqual(rows.Options, wantRows) || !jsonEqual(t, rows.Default, `"active"`) {
		t.Errorf("rows = %+v (default %s), want With activity (default) and All", rows, rows.Default)
	}
	accounts, ok := findParam(spec, "accounts")
	wantFrom := &reports.OptionsFrom{
		Source:     "books.accounts",
		Value:      reports.Path{{Field: "id"}},
		Label:      reports.Path{{Field: "full_name"}},
		Group:      reports.Path{{Field: "type"}},
		GroupOrder: &reports.GroupOrder{By: "declared"},
		GroupLabel: "All {group} accounts",
	}
	if !ok || accounts.Type != reports.ParamChoice || accounts.Label != "Accounts" || !accounts.Multiple ||
		accounts.Default != nil || !reflect.DeepEqual(accounts.OptionsFrom, wantFrom) {
		t.Errorf("accounts = %+v (optionsFrom %+v), want the Trial Balance's multiple choice %+v", accounts, accounts.OptionsFrom, wantFrom)
	}

	type head struct{ id, label string }
	var cols []head
	for _, c := range spec.Columns {
		cols = append(cols, head{c.ID, c.Label})
	}
	wantCols := []head{
		{"account", "Account / Date"}, {"type", "Type"}, {"number", "No."}, {"name", "Name"},
		{"description", "Description"}, {"split", "Split"}, {"debit", "Debit"}, {"credit", "Credit"},
		{"balance", "Balance"},
	}
	if !reflect.DeepEqual(cols, wantCols) {
		t.Errorf("columns = %v, want %v", cols, wantCols)
	}

	if len(spec.Groups) != 1 {
		t.Fatalf("groups = %+v, want one section per account", spec.Groups)
	}
	g := spec.Groups[0]
	if g.ID != "byAccount" || g.Col != "account" || !g.Open || !g.Subtotals {
		t.Errorf("group = id %q col %q open %v subtotals %v; want byAccount on account, open, with subtotals", g.ID, g.Col, g.Open, g.Subtotals)
	}
	if g.Opening == nil || g.Opening.Label != "Beginning balance" || g.Opening.Cells["balance"] == nil {
		t.Errorf("group opening = %+v, want \"Beginning balance\" with a Balance cell", g.Opening)
	}
}

// Sections come in the chart order: account type in account_types.json order
// (not by key), then number, then full name. The numbers and names are chosen
// so that each of the three keys alone gives a different order.
func TestGeneralLedgerChartOrder(t *testing.T) {
	b := newGLBook(t)
	prepaid := b.account(t, "Prepaid rent", "7200", "other_current_asset", "prepaid_expenses")
	deposits := mkSubAccount(t, b.app, "Deposits", prepaid)
	undeposited := b.account(t, "Undeposited funds", "7100", "other_current_asset", "undeposited_funds")
	amex := b.account(t, "Amex", "2200", "credit_card", "credit_card")
	visa := b.account(t, "Visa", "2100", "credit_card", "credit_card")
	travel := mkSubAccount(t, b.app, "Travel card", visa)
	advertising := b.account(t, "Advertising", "1200", "expense", "advertising_marketing")
	supplies := b.account(t, "Supplies", "1100", "expense", "office_general")
	paper := mkSubAccount(t, b.app, "Paper", supplies)
	fees := b.account(t, "Bank fees", "", "expense", "bank_charges")

	debited := []*core.Record{prepaid, deposits, undeposited, visa, travel, advertising, supplies, paper, fees}
	lines := []ln{{account: amex, credit: 1000 * len(debited)}}
	for _, a := range debited {
		lines = append(lines, ln{account: a, debit: 1000})
	}
	b.post(t, "2026-03-10", lines...)

	res := runGL(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-03-01", "2026-03-31")}, reports.Options{Today: glToday})
	secs := glSections(t, res)
	want := []*core.Record{deposits, undeposited, prepaid, travel, visa, amex, fees, paper, supplies, advertising}
	if got := sectionIDs(t, secs); !reflect.DeepEqual(got, idsOf(want...)) {
		t.Fatalf("sections = %v\nwant       [Prepaid rent:Deposits, 7100 Undeposited funds, 7200 Prepaid rent, Visa:Travel card, 2100 Visa, 2200 Amex, Bank fees, Supplies:Paper, 1100 Supplies, 1200 Advertising]", sectionLabels(secs))
	}
	wantLabels := []string{
		"Prepaid rent:Deposits", "7100 Undeposited funds", "7200 Prepaid rent", "Visa:Travel card",
		"2100 Visa", "2200 Amex", "Bank fees", "Supplies:Paper", "1100 Supplies", "1200 Advertising",
	}
	if got := sectionLabels(secs); !reflect.DeepEqual(got, wantLabels) {
		t.Errorf("section labels = %q, want %q (\"<number> <full name>\", or the full name with no number)", got, wantLabels)
	}
	prepaidSection := sectionFor(t, res, prepaid)
	if prepaidSection.total == nil || prepaidSection.total.Label != "Total 7200 Prepaid rent" {
		t.Errorf("Prepaid rent's total row = %+v, want \"Total 7200 Prepaid rent\"", prepaidSection.total)
	}
}

// A section's Beginning balance follows the Trial Balance's rules as of the
// day before the period: a balance-sheet account counts every earlier line,
// income and expense only the period's fiscal year, and the retained-earnings
// account adds every earlier fiscal year's income and expense.
func TestGeneralLedgerBeginningBalance(t *testing.T) {
	cases := []struct {
		name                      string
		startMonth                int
		priorIncome, priorExpense string // days in the previous fiscal year
		boundary                  string // the first day of the period's fiscal year
		currentYear               string // a day of that year before the period
		from, to, inPeriod        string
	}{
		{name: "fiscal year from January", startMonth: 1,
			priorIncome: "2025-06-15", priorExpense: "2025-08-20", boundary: "2026-01-01",
			currentYear: "2026-02-01", from: "2026-03-01", to: "2026-03-31", inPeriod: "2026-03-10"},
		// 2026-03-15 is in calendar 2026 but in the fiscal year that ends
		// 2026-06-30.
		{name: "fiscal year from July", startMonth: 7,
			priorIncome: "2026-03-15", priorExpense: "2025-09-10", boundary: "2026-07-01",
			currentYear: "2026-08-01", from: "2026-09-01", to: "2026-09-30", inPeriod: "2026-09-10"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			b := newGLBook(t)
			saveSettings(t, b.app, map[string]any{"fiscal_year_start_month": c.startMonth})
			operating := b.account(t, "Operating", "1000", "bank", "checking")
			equity := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
			retained := mkRetainedEarnings(t, b.app, "3900")
			income := b.account(t, "Design income", "4000", "income", "service_income")
			rent := b.account(t, "Office rent", "6000", "expense", "rent_lease")
			b.post(t, c.priorIncome, ln{operating, 30000, 0}, ln{income, 0, 30000})
			b.post(t, c.priorExpense, ln{rent, 10000, 0}, ln{operating, 0, 10000})
			b.post(t, c.boundary, ln{operating, 5000, 0}, ln{income, 0, 5000})
			b.post(t, c.currentYear, ln{operating, 100000, 0}, ln{equity, 0, 100000})
			b.post(t, c.currentYear, ln{rent, 2000, 0}, ln{operating, 0, 2000})
			b.post(t, c.inPeriod, ln{operating, 700, 0}, ln{equity, 0, 700})
			opts := reports.Options{Today: glToday}

			res := runGL(t, b.app, b.reader, map[string]any{"period": glPeriod(c.from, c.to)}, opts)
			wants := []struct {
				account *core.Record
				opening int64
				why     string
			}{
				{operating, 123000, "every earlier line of a balance-sheet account"},
				{equity, 100000, "credit-normal, so a credit reads positive"},
				{retained, 20000, "the previous fiscal year's 300.00 income less 100.00 expense"},
				{income, 5000, "only the line of the period's fiscal year"},
				{rent, 2000, "only the line of the period's fiscal year"},
			}
			for _, w := range wants {
				s := sectionFor(t, res, w.account)
				if s.opening == nil {
					t.Errorf("%s has no opening row", s.head.Label)
					continue
				}
				if len(s.kinds) == 0 || s.kinds[0] != reports.KindOpening {
					t.Errorf("%s rows %v, want the opening row first", s.head.Label, s.kinds)
				}
				if s.opening.Label != "Beginning balance" {
					t.Errorf("%s opening label = %q, want \"Beginning balance\"", s.head.Label, s.opening.Label)
				}
				if got := balanceCell(t, *s.opening); got != w.opening {
					t.Errorf("%s Beginning balance = %d, want %d (%s)", s.head.Label, got, w.opening, w.why)
				}
			}
			// Retained earnings, the income and the expense have no line in the
			// period: their sections show for the beginning balance alone.
			for _, a := range []*core.Record{retained, income, rent} {
				if s := sectionFor(t, res, a); len(s.lines) != 0 {
					t.Errorf("%s has %d lines in the period, want none", s.head.Label, len(s.lines))
				}
			}
			if got := balances(t, sectionFor(t, res, operating).lines); !slices.Equal(got, []int64{123700}) {
				t.Errorf("Operating line balances = %v, want [123700]", got)
			}

			all := runGL(t, b.app, b.reader, map[string]any{"period": glAllDates, "rows": "all"}, opts)
			secs := glSections(t, all)
			if len(secs) == 0 {
				t.Fatal("All dates shows no section")
			}
			for _, s := range secs {
				if s.opening == nil {
					t.Errorf("All dates: %s has no opening row", s.head.Label)
					continue
				}
				if v, ok := moneyCell(t, *s.opening, "balance"); !ok || v != 0 {
					t.Errorf("All dates: %s Beginning balance = %d (set %v), want 0.00", s.head.Label, v, ok)
				}
			}
		})
	}
}

// Balance runs by the account's normal side: a bank credited reads negative, a
// credit card charged reads positive, and the section's total row holds the
// ending balance with the period's Debit and Credit sums. Lines read in date
// order, then posting order, then position, whatever order they were stored in.
func TestGeneralLedgerRunningBalance(t *testing.T) {
	b := newGLBook(t)
	bank := b.account(t, "Operating", "1000", "bank", "checking")
	card := b.account(t, "Visa", "2100", "credit_card", "credit_card")
	supplies := b.account(t, "Supplies", "6100", "expense", "office_general")
	prepaid := b.account(t, "Prepaid insurance", "1300", "other_current_asset", "prepaid_expenses")
	b.post(t, "2026-08-04", ln{supplies, 10000, 0}, ln{bank, 0, 10000})
	b.post(t, "2026-08-04", ln{supplies, 4500, 0}, ln{card, 0, 4500})
	b.post(t, "2026-08-18", ln{bank, 3000, 0}, ln{supplies, 0, 3000})
	// A contra entry on an asset: a credit with no debit before it.
	b.post(t, "2026-08-18", ln{supplies, 2500, 0}, ln{prepaid, 0, 2500})
	opts := reports.Options{Today: glToday}

	res := runGL(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-08-04", "2026-08-18")}, opts)
	bs := sectionFor(t, res, bank)
	if bs.opening == nil || balanceCell(t, *bs.opening) != 0 {
		t.Errorf("Operating Beginning balance = %+v, want 0", bs.opening)
	}
	if got := balances(t, bs.lines); !slices.Equal(got, []int64{-10000, -7000}) {
		t.Errorf("Operating balances = %v, want [-10000 -7000] (debits less credits)", got)
	}
	if len(bs.lines) == 2 {
		requireSplit(t, bs.lines[0], nil, int64(10000))
		requireSplit(t, bs.lines[1], int64(3000), nil)
	}
	if bs.total == nil {
		t.Fatalf("Operating has no total row; rows %v", bs.kinds)
	}
	if got := balanceCell(t, *bs.total); got != -7000 {
		t.Errorf("Operating ending balance = %d, want -7000", got)
	}
	requireSplit(t, *bs.total, int64(3000), int64(10000))

	cs := sectionFor(t, res, card)
	if got := balances(t, cs.lines); !slices.Equal(got, []int64{4500}) {
		t.Errorf("Visa balances = %v, want [4500] (a charge reads positive on a credit card)", got)
	}
	ps := sectionFor(t, res, prepaid)
	if got := balances(t, ps.lines); !slices.Equal(got, []int64{-2500}) {
		t.Errorf("Prepaid insurance balances = %v, want [-2500] (a contra asset reads negative)", got)
	}

	// The order: an entry dated later is posted first; two entries share a
	// day; one entry has two lines on the account. The line ids run against
	// the wanted order, so neither storage order nor id order can pass.
	postage := b.account(t, "Postage", "6200", "expense", "office_general")
	pause := func() { time.Sleep(5 * time.Millisecond) } // posted_at has millisecond precision
	b.postEntry(t, "2026-08-20", "Later day",
		glLine{id: "glordr000000001", account: postage, debit: 100}, glLine{account: bank, credit: 100})
	pause()
	b.postEntry(t, "2026-08-11", "Posted first",
		glLine{id: "glordr000000003", account: postage, debit: 200}, glLine{account: bank, credit: 200})
	pause()
	b.postEntry(t, "2026-08-11", "Posted second",
		glLine{id: "glordr000000002", account: postage, debit: 300}, glLine{account: bank, credit: 300})
	pause()
	b.postEntry(t, "2026-08-11", "Two lines",
		glLine{id: "glordr000000005", account: postage, debit: 400},
		glLine{id: "glordr000000004", account: postage, debit: 500},
		glLine{account: bank, credit: 900})
	ordered := runGL(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-08-01", "2026-08-31")}, opts)
	if got := debits(t, sectionFor(t, ordered, postage).lines); !slices.Equal(got, []int64{200, 300, 400, 500, 100}) {
		t.Errorf("Postage line debits = %v, want [200 300 400 500 100] (date, then posted_at, then position)", got)
	}
}

// The section total's Balance is the Trial Balance's figure for the account
// as of the period's last day, by the normal side.
func TestGeneralLedgerEndingMatchesTrialBalance(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	prepaid := b.account(t, "Prepaid insurance", "1300", "other_current_asset", "prepaid_expenses")
	card := b.account(t, "Visa", "2100", "credit_card", "credit_card")
	equity := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	retained := mkRetainedEarnings(t, b.app, "3900")
	income := b.account(t, "Design income", "4000", "income", "service_income")
	rent := b.account(t, "Office rent", "6000", "expense", "rent_lease")
	b.post(t, "2025-05-10", ln{operating, 50000, 0}, ln{equity, 0, 50000})
	b.post(t, "2025-07-01", ln{operating, 30000, 0}, ln{income, 0, 30000})
	b.post(t, "2025-09-01", ln{rent, 10000, 0}, ln{operating, 0, 10000})
	b.post(t, "2026-01-15", ln{operating, 8000, 0}, ln{income, 0, 8000})
	b.post(t, "2026-02-10", ln{rent, 1500, 0}, ln{card, 0, 1500})
	b.post(t, "2026-03-05", ln{card, 500, 0}, ln{operating, 0, 500})
	b.post(t, "2026-03-12", ln{prepaid, 1200, 0}, ln{operating, 0, 1200})
	b.post(t, "2026-03-20", ln{operating, 400, 0}, ln{income, 0, 400})
	// After the period: in neither report.
	b.post(t, "2026-04-02", ln{rent, 999, 0}, ln{operating, 0, 999})
	opts := reports.Options{Today: glToday}

	gl := runGL(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-03-01", "2026-03-31")}, opts)
	tb := runTB(t, b.app, b.reader, map[string]any{"asOf": "2026-03-31", "rows": "active"}, opts)
	for _, a := range []*core.Record{operating, prepaid, card, equity, retained, income, rent} {
		s, ok := findSection(t, gl, a)
		if !ok {
			t.Errorf("no section for %s", a.GetString("full_name"))
			continue
		}
		if s.total == nil {
			t.Errorf("%s has no total row", s.head.Label)
			continue
		}
		var net int64
		if hasRowFor(t, tb, a) {
			row := rowFor(t, tb, a)
			d, _ := moneyCell(t, row, "debit")
			c, _ := moneyCell(t, row, "credit")
			net = d - c
		}
		ty, ok := accountType(a.GetString("type"))
		if !ok {
			t.Fatalf("%s has no account type", a.GetString("full_name"))
		}
		want := net
		if ty.Normal == "credit" {
			want = -net
		}
		if got := balanceCell(t, *s.total); got != want {
			t.Errorf("%s ending balance = %d, want %d (the Trial Balance's net %d as of 2026-03-31, by the %s side)",
				s.head.Label, got, want, net, ty.Normal)
		}
	}
}

// Each line row shows its entry's type, number, the line's customer or vendor,
// its description, the other account, and its amounts.
func TestGeneralLedgerLineColumns(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	reserve := b.account(t, "Reserve", "1010", "bank", "savings")
	equity := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	office := b.account(t, "Office supplies", "6100", "expense", "office_general")
	postage := b.account(t, "Postage", "6200", "expense", "office_general")
	customer := mkCustomer(t, b.app, "Northwind Traders", "")
	vendor := mkVendor(t, b.app, "Paper Supply Co")
	day := "2026-08-04"

	manual := b.postEntry(t, day, "Entry memo",
		glLine{account: office, debit: 1200, memo: "Toner", customer: customer.Id},
		glLine{account: operating, credit: 1200, vendor: vendor.Id})
	split := b.postEntry(t, day, "Three ways",
		glLine{account: office, debit: 300}, glLine{account: postage, debit: 200}, glLine{account: operating, credit: 500})
	transfer := mustPost(t, b.app, transferDraft(t, b.app, day, operating, reserve, 2500).Id, "")
	opening := mustPost(t, b.app, mkOpening(t, b.app, "2026-08-01", "", ln{reserve, 7000, 0}, ln{equity, 0, 7000}).Id, "")
	reversed := b.post(t, day, ln{postage, 800, 0}, ln{operating, 0, 800})
	reversal := mustPost(t, b.app, reversalDraft(t, b.app, reversed, "2026-08-10").Id, "")
	voided := b.post(t, day, ln{postage, 600, 0}, ln{operating, 0, 600})
	if err := setStatus(b.app, voided.Id, statusVoid, ""); err != nil {
		t.Fatalf("void: %v", err)
	}
	voidReversal := findReversal(t, b.app, voided.Id)
	accrued := accrual(t, b.env, day, "2026-08-05")
	requireSweep(t, b.app, at("2026-08-05", 1), 1)
	autoReversal := findReversal(t, b.app, accrued.Id)
	// Posting always numbers an entry; an entry with no number (an imported
	// one) cannot be made through the hooks, so the test blanks it in SQL.
	unnumbered := b.post(t, day, ln{postage, 50, 0}, ln{operating, 0, 50})
	if _, err := b.app.DB().Update("books_journal_entries", dbx.Params{"number": ""}, dbx.HashExp{"id": unnumbered.Id}).Execute(); err != nil {
		t.Fatalf("blank the number: %v", err)
	}

	res := runGL(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-08-01", "2026-08-31")}, reports.Options{Today: glToday})
	type cols struct{ typ, number, name, description, split string }
	read := func(r reports.Row) cols {
		return cols{
			typ: textCell(t, r, "type"), number: textCell(t, r, "number"), name: textCell(t, r, "name"),
			description: textCell(t, r, "description"), split: textCell(t, r, "split"),
		}
	}
	check := func(what string, r reports.Row, want cols) {
		t.Helper()
		if got := read(r); got != want {
			t.Errorf("%s = %+v\nwant %+v", what, got, want)
		}
	}

	officeLine := lineRow(t, res, entryLineOn(t, b.app, manual.Id, office))
	check("the manual entry's Office supplies line", officeLine, cols{
		typ: "Journal entry", number: manual.GetString("number"), name: "Northwind Traders",
		description: "Toner", split: "Operating",
	})
	requireSplit(t, officeLine, int64(1200), nil)
	operatingLine := lineRow(t, res, entryLineOn(t, b.app, manual.Id, operating))
	check("the manual entry's Operating line", operatingLine, cols{
		typ: "Journal entry", number: manual.GetString("number"), name: "Paper Supply Co",
		description: "Entry memo", split: "Office supplies",
	})
	requireSplit(t, operatingLine, nil, int64(1200))

	for _, a := range []*core.Record{office, postage, operating} {
		check("the 3-line entry's "+a.GetString("full_name")+" line", lineRow(t, res, entryLineOn(t, b.app, split.Id, a)), cols{
			typ: "Journal entry", number: split.GetString("number"), description: "Three ways", split: "-Split-",
		})
	}

	transferNumber := reload(t, b.app, "books_journal_entries", transfer.Id).GetString("number")
	if !strings.HasPrefix(transferNumber, "TR-") {
		t.Fatalf("transfer number %q, want TR-<n>", transferNumber)
	}
	check("the transfer's Reserve line", lineRow(t, res, entryLineOn(t, b.app, transfer.Id, reserve)), cols{
		typ: "Transfer", number: transferNumber, split: "Operating",
	})
	check("the opening entry's Reserve line", lineRow(t, res, entryLineOn(t, b.app, opening.Id, reserve)), cols{
		typ: "Opening balances", number: opening.GetString("number"), split: "Owner's equity",
	})
	check("the reversal's Postage line", lineRow(t, res, entryLineOn(t, b.app, reversal.Id, postage)), cols{
		typ: "Reversal of " + reversed.GetString("number"), number: reversal.GetString("number"),
		description: reversal.GetString("memo"), split: "Operating",
	})
	check("the void reversal's Postage line", lineRow(t, res, entryLineOn(t, b.app, voidReversal.Id, postage)), cols{
		typ: "Void reversal of " + voided.GetString("number"), number: voided.GetString("number"),
		description: voidReversal.GetString("memo"), split: "Operating",
	})
	check("the auto reversal's Rent line", lineRow(t, res, entryLineOn(t, b.app, autoReversal.Id, b.env.rent)), cols{
		typ: "Auto reversal of " + accrued.GetString("number"), number: autoReversal.GetString("number"),
		description: autoReversal.GetString("memo"), split: "Checking",
	})
	unnumberedLine := lineRow(t, res, entryLineOn(t, b.app, unnumbered.Id, postage))
	if got := textCell(t, unnumberedLine, "number"); got != "" {
		t.Errorf("No. of an entry with no number = %q, want blank", got)
	}
}

// An invoice's entry reads Type "Invoice", No. its number and Name its
// customer on every line; its void reversal reads "Void reversal of <number>"
// and names the customer too; a transfer still reads "Transfer" (spec Q24).
func TestGeneralLedgerInvoiceRows(t *testing.T) {
	b := newGLBook(t)
	registerSalesDocGuards(b.app, invoiceKind)
	ie := invoiceEnvOn(t, b.env)
	receivable := b.account(t, "Receivables", "1200", "accounts_receivable", "accounts_receivable")
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	reserve := b.account(t, "Reserve", "1010", "bank", "savings")
	transfer := mustPost(t, b.app, transferDraft(t, b.app, "2026-11-04", operating, reserve, 2500).Id, "")

	inv := ie.mkInvoice(t, nil)
	mkInvoiceLine(t, b.app, inv, 0, item(ie.service, 1, 45000, false))
	entryID := mustPostInvoice(t, b.app, inv.Id, b.env.users.bookkeeper.Id).GetString("entry")
	if err := voidInvoiceAs(b.app, inv.Id, b.env.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	voidReversal := findReversal(t, b.app, entryID)

	res := runGL(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")}, reports.Options{Today: glToday})
	type cols struct{ typ, number, name string }
	read := func(r reports.Row) cols {
		return cols{typ: textCell(t, r, "type"), number: textCell(t, r, "number"), name: textCell(t, r, "name")}
	}
	for _, w := range []struct {
		what    string
		entry   string
		account *core.Record
		want    cols
	}{
		{"the invoice's A/R line", entryID, receivable, cols{"Invoice", "1001", "Harborview Dental"}},
		{"the invoice's income line", entryID, b.env.revenue, cols{"Invoice", "1001", "Harborview Dental"}},
		{"the void reversal's A/R line", voidReversal.Id, receivable, cols{"Void reversal of 1001", "1001", "Harborview Dental"}},
		{"the void reversal's income line", voidReversal.Id, b.env.revenue, cols{"Void reversal of 1001", "1001", "Harborview Dental"}},
		{"the transfer's Reserve line", transfer.Id, reserve, cols{"Transfer", transfer.GetString("number"), ""}},
	} {
		if got := read(lineRow(t, res, entryLineOn(t, b.app, w.entry, w.account))); got != w.want {
			t.Errorf("%s = %+v, want %+v", w.what, got, w.want)
		}
	}
}

// Rows With activity shows an account with a line in the period or a
// beginning balance that is not zero; All adds every active account. Accounts
// narrows the sections, and the Total adds the lines shown.
func TestGeneralLedgerRowsAndAccounts(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	software := b.account(t, "Software", "6100", "expense", "dues_subscriptions")
	travel := b.account(t, "Travel", "6200", "expense", "travel")
	meals := b.account(t, "Meals", "6300", "expense", "meals")
	utilities := b.account(t, "Utilities", "6400", "expense", "utilities")
	makeAccountInactive(t, b.app, utilities)
	// Before the period, in its fiscal year: Travel's beginning balance.
	b.post(t, "2026-09-05", ln{travel, 4000, 0}, ln{operating, 0, 4000})
	b.post(t, "2026-10-07", ln{software, 1500, 0}, ln{operating, 0, 1500})
	period := glPeriod("2026-10-01", "2026-10-31")
	opts := reports.Options{Today: glToday}

	active := runGL(t, b.app, b.reader, map[string]any{"period": period, "rows": "active"}, opts)
	if got := sectionIDs(t, glSections(t, active)); !sameAccounts(got, idsOf(operating, software, travel)) {
		t.Errorf("With activity sections = %v, want Operating, Software, Travel", sectionLabels(glSections(t, active)))
	}
	ts := sectionFor(t, active, travel)
	if ts.opening == nil || balanceCell(t, *ts.opening) != 4000 || len(ts.lines) != 0 {
		t.Errorf("Travel = opening %+v, %d lines; want Beginning balance 4000 and no lines", ts.opening, len(ts.lines))
	}

	all := runGL(t, b.app, b.reader, map[string]any{"period": period, "rows": "all"}, opts)
	if !hasSection(t, all, meals) {
		t.Errorf("All does not show Meals, an active account with nothing in it; sections %v", sectionLabels(glSections(t, all)))
	}
	for _, a := range []*core.Record{operating, software, travel} {
		if !hasSection(t, all, a) {
			t.Errorf("All drops %s", a.GetString("full_name"))
		}
	}
	if hasSection(t, all, utilities) {
		t.Errorf("All shows Utilities, an inactive account with nothing in it")
	}
	if hasSection(t, active, meals) {
		t.Errorf("With activity shows Meals, which has nothing in it")
	}

	one := runGL(t, b.app, b.reader, map[string]any{"period": period, "accounts": []string{software.Id}}, opts)
	if got := sectionIDs(t, glSections(t, one)); !reflect.DeepEqual(got, idsOf(software)) {
		t.Fatalf("Accounts = Software: sections %v, want only Software", sectionLabels(glSections(t, one)))
	}
	total := totalOf(t, one)
	d, _ := moneyCell(t, total, "debit")
	c, _ := moneyCell(t, total, "credit")
	if d != 1500 || c != 0 {
		t.Errorf("Accounts = Software: Total debit %d, credit %d; want 1500 and 0 (its lines only)", d, c)
	}

	group := runGL(t, b.app, b.reader, map[string]any{"period": period, "accounts": []any{map[string]any{"group": "expense"}}}, opts)
	if got := sectionIDs(t, glSections(t, group)); !sameAccounts(got, idsOf(software, travel)) {
		t.Errorf("Accounts = all Expense accounts: sections %v, want Software and Travel", sectionLabels(glSections(t, group)))
	}
}

// A draft's line never shows; a void entry and its void reversal both show
// and cancel in the account's ending balance.
func TestGeneralLedgerDraftsAndVoids(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	rent := b.account(t, "Office rent", "6000", "expense", "rent_lease")
	kept := b.post(t, "2026-08-04", ln{rent, 4000, 0}, ln{operating, 0, 4000})
	draft := mkDraft(t, b.app, "2026-08-05", ln{rent, 999, 0}, ln{operating, 0, 999})
	voided := b.post(t, "2026-08-06", ln{rent, 7000, 0}, ln{operating, 0, 7000})
	if err := setStatus(b.app, voided.Id, statusVoid, ""); err != nil {
		t.Fatalf("void: %v", err)
	}
	voidReversal := findReversal(t, b.app, voided.Id)

	res := runGL(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-08-01", "2026-08-31")}, reports.Options{Today: glToday})
	if hasLineRow(res, entryLineOn(t, b.app, draft.Id, rent)) {
		t.Errorf("the draft's line shows")
	}
	for name, entry := range map[string]*core.Record{"posted": kept, "voided": voided, "void reversal": voidReversal} {
		if !hasLineRow(res, entryLineOn(t, b.app, entry.Id, rent)) {
			t.Errorf("the %s entry's Office rent line does not show", name)
		}
	}
	for _, w := range []struct {
		account *core.Record
		ending  int64
	}{{rent, 4000}, {operating, -4000}} {
		s := sectionFor(t, res, w.account)
		if s.total == nil {
			t.Fatalf("%s has no total row", s.head.Label)
		}
		if got := balanceCell(t, *s.total); got != w.ending {
			t.Errorf("%s ending balance = %d, want %d (the void pair cancels)", s.head.Label, got, w.ending)
		}
	}
}

// The Total row adds every line shown: its Debit equals its Credit with no
// Accounts param, and its Balance is blank.
func TestGeneralLedgerTotals(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	card := b.account(t, "Visa", "2100", "credit_card", "credit_card")
	software := b.account(t, "Software", "6100", "expense", "dues_subscriptions")
	rent := b.account(t, "Office rent", "6200", "expense", "rent_lease")
	b.post(t, "2026-08-04", ln{software, 12345, 0}, ln{card, 0, 12345})
	b.post(t, "2026-08-05", ln{rent, 50000, 0}, ln{operating, 0, 50000})
	b.post(t, "2026-08-06", ln{card, 2000, 0}, ln{operating, 0, 2000})

	res := runGL(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-08-01", "2026-08-31")}, reports.Options{Today: glToday})
	total := totalOf(t, res)
	if total.Label != "Total" {
		t.Errorf("total label = %q, want Total", total.Label)
	}
	var lineDebits int64
	for _, r := range res.Rows {
		if r.Kind == reports.KindDetail {
			d, _ := moneyCell(t, r, "debit")
			lineDebits += d
		}
	}
	d, _ := moneyCell(t, total, "debit")
	c, _ := moneyCell(t, total, "credit")
	if d != 64345 || d != c || d != lineDebits {
		t.Errorf("Total debit %d, credit %d; the lines' debits add to %d; want 64345 each", d, c, lineDebits)
	}
	if v := total.Cells["balance"]; v != nil {
		t.Errorf("Total Balance = %#v, want blank", v)
	}
}

// A viewer sort orders the lines inside a section and leaves each line's
// Balance as the report's running order computed it; Balance is no sort key.
func TestGeneralLedgerViewSort(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	supplies := b.account(t, "Supplies", "6100", "expense", "office_general")
	b.post(t, "2026-08-03", ln{supplies, 2000, 0}, ln{operating, 0, 2000})
	b.post(t, "2026-08-04", ln{supplies, 5000, 0}, ln{operating, 0, 5000})
	b.post(t, "2026-08-05", ln{supplies, 1000, 0}, ln{operating, 0, 1000})
	params := map[string]any{"period": glPeriod("2026-08-01", "2026-08-31"), "accounts": []string{supplies.Id}}

	plain := sectionFor(t, runGL(t, b.app, b.reader, params, reports.Options{Today: glToday}), supplies)
	if got := debits(t, plain.lines); !slices.Equal(got, []int64{2000, 5000, 1000}) {
		t.Fatalf("unsorted debits = %v, want [2000 5000 1000] (date order)", got)
	}
	runningBalance := map[string]int64{}
	for _, r := range plain.lines {
		runningBalance[r.ID] = balanceCell(t, r)
	}
	if got := balances(t, plain.lines); !slices.Equal(got, []int64{2000, 7000, 8000}) {
		t.Errorf("unsorted balances = %v, want [2000 7000 8000]", got)
	}

	sortedRes := runGL(t, b.app, b.reader, params, reports.Options{Today: glToday, Sort: []reports.ViewSort{{Col: "debit", Dir: "desc"}}})
	sorted := sectionFor(t, sortedRes, supplies)
	if got := debits(t, sorted.lines); !slices.Equal(got, []int64{5000, 2000, 1000}) {
		t.Errorf("debits sorted descending = %v, want [5000 2000 1000]", got)
	}
	for _, r := range sorted.lines {
		if want, ok := runningBalance[r.ID]; !ok || balanceCell(t, r) != want {
			t.Errorf("sorted line %s Balance = %d, want %d (its balance in the report's order)", r.ID, balanceCell(t, r), want)
		}
	}

	_, err := runGLErr(t, b.app, b.reader, params, reports.Options{Today: glToday, Sort: []reports.ViewSort{{Col: "balance"}}})
	if err == nil || !strings.Contains(err.Error(), "running value") {
		t.Errorf("a sort on Balance = %v, want a refusal (a running value is not a sort key)", err)
	}
}

// A section longer than a page continues on the next page, and its running
// balance continues with it.
func TestGeneralLedgerPaging(t *testing.T) {
	b := newGLBook(t)
	petty := b.account(t, "Petty cash", "1050", "bank", "cash_on_hand")
	sales := b.account(t, "Sales", "4000", "income", "service_income")
	for k := 1; k <= 8; k++ {
		b.post(t, "2026-08-0"+string(rune('0'+k)), ln{petty, 100 * k, 0}, ln{sales, 0, 100 * k})
	}
	params := map[string]any{"period": glPeriod("2026-08-01", "2026-08-31"), "accounts": []string{petty.Id}}
	opts := reports.Options{Today: glToday, Limit: 5}

	var pages [][]int64
	for range 4 {
		res := runGL(t, b.app, b.reader, params, opts)
		var page []reports.Row
		for _, r := range res.Rows {
			if r.Kind == reports.KindDetail {
				page = append(page, r)
			}
		}
		pages = append(pages, balances(t, page))
		if res.Page == nil || res.Page.Next == "" {
			break
		}
		opts.Cursor = res.Page.Next
	}
	if len(pages) < 2 || len(pages[0]) == 0 || len(pages[0]) >= 8 {
		t.Fatalf("pages of balances = %v, want page 1 to end inside the 8-line section", pages)
	}
	if len(pages[1]) == 0 {
		t.Fatalf("page 2 holds no line: %v", pages)
	}
	last := pages[0][len(pages[0])-1]
	next := int64(100 * (len(pages[0]) + 1))
	if pages[1][0] != last+next {
		t.Errorf("page 2's first Balance = %d, want page 1's last %d + %d", pages[1][0], last, next)
	}
	var all []int64
	for _, p := range pages {
		all = append(all, p...)
	}
	if want := []int64{100, 300, 600, 1000, 1500, 2100, 2800, 3600}; !slices.Equal(all, want) {
		t.Errorf("balances across pages = %v, want %v", all, want)
	}
}

// Every collection the run reads is a topic, so a post, a void, an account
// edit, a customer or vendor rename or a settings change re-runs the report.
func TestGeneralLedgerTopics(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	rent := b.account(t, "Office rent", "6000", "expense", "rent_lease")
	b.post(t, "2026-08-04", ln{rent, 4000, 0}, ln{operating, 0, 4000})

	res := runGL(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-08-01", "2026-08-31")}, reports.Options{Today: glToday})
	for _, topic := range []string{
		"collection/books_journal_lines", "collection/books_journal_entries", "collection/books_accounts",
		"collection/books_customers", "collection/books_vendors", "collection/books_settings",
	} {
		if !slices.Contains(res.Topics, topic) {
			t.Errorf("topics = %v, want %s", res.Topics, topic)
		}
	}
}

func TestGeneralLedgerNoAccess(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	rent := b.account(t, "Office rent", "6000", "expense", "rent_lease")
	b.post(t, "2026-08-04", ln{rent, 4000, 0}, ln{operating, 0, 4000})
	params := map[string]any{"period": glPeriod("2026-08-01", "2026-08-31"), "rows": "all"}
	opts := reports.Options{Today: glToday}

	if !hasSection(t, runGL(t, b.app, b.reader, params, opts), rent) {
		t.Fatal("a Books reader does not see Office rent")
	}
	res := runGL(t, b.app, b.env.users.none, params, opts)
	for _, r := range res.Rows {
		if r.Kind != reports.KindTotal {
			t.Errorf("a user with Books level none sees %s row %q", r.Kind, r.Label)
		}
	}
}

// An empty run holds only the Total row and the period it resolved, which
// core's empty state prints.
func TestGeneralLedgerEmpty(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	rent := b.account(t, "Office rent", "6000", "expense", "rent_lease")
	// After the period: no line in it and no beginning balance.
	b.post(t, "2026-10-05", ln{rent, 4000, 0}, ln{operating, 0, 4000})

	res := runGL(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-09-01", "2026-09-30"), "rows": "active"}, reports.Options{Today: glToday})
	kinds := make([]string, len(res.Rows))
	for i, r := range res.Rows {
		kinds[i] = r.Kind
	}
	if !slices.Equal(kinds, []string{reports.KindTotal}) {
		t.Errorf("rows = %v (%v), want only the Total row", kinds, labelsOf(res.Rows))
	}
	var resolved *reports.ResolvedParam
	for i := range res.Params {
		if res.Params[i].ID == "period" {
			resolved = &res.Params[i]
		}
	}
	if resolved == nil || resolved.From != "2026-09-01" || resolved.To != "2026-09-30" {
		t.Errorf("resolved period = %+v, want from 2026-09-01 to 2026-09-30", resolved)
	}
}

// Register ships the General Ledger; core creates it unpublished, owned by the
// first admin, and Books shares it with every Books reader.
func TestGeneralLedgerShippedUnpublished(t *testing.T) {
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	app, _ := newRegisteredApp(t)
	owner := mkUser(t, app, "owner")
	reader := mkUser(t, app, "member")
	setPkgAccess(t, app, reader, "readonly")
	if err := reports.ReconcileShipped(app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": "books.general_ledger"})
	if err != nil {
		t.Fatalf("no reports row with shipped_key books.general_ledger: %v", err)
	}
	if row.GetString("owner") != owner.Id {
		t.Errorf("owner = %q, want the first admin %q", row.GetString("owner"), owner.Id)
	}
	if row.GetBool("published") || row.GetString("published_by") != "" {
		t.Errorf("published = %v (by %q), want unpublished", row.GetBool("published"), row.GetString("published_by"))
	}
	if row.GetString("title") != "General Ledger" || row.GetInt("shipped_revision") != 1 || row.GetString("source") != "books.journal_lines" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a Books reader")
}

// glCell is a layout cell with its defaults spelled out (span and lines 1, start
// 0), so a cell that writes `span: 1` equals one that leaves it out.
type glCell struct {
	col                      string
	line, start, span, lines int
}

func glCellOf(c reports.DisplayCell) glCell {
	one := func(n int) int {
		if n == 0 {
			return 1
		}
		return n
	}
	return glCell{c.Col, c.Line, c.Start, one(c.Span), one(c.Lines)}
}

// The spec's authored layouts (spec §3 Phone, §5 display.layouts), written out
// here rather than read from lib/general-ledger-fixture.ts, so a drift on either
// side fails. The spec authors no desktop layout: the one line is tried only from
// 1040 px (display.oneLine.minWidth), below that the tablet layout from 600 px
// (its MinWidth), and on a phone the mobile layout. The tablet layout gives No. two
// tracks, room for a whole entry number ("JE-41", "TR-12").
func TestGeneralLedgerLayouts(t *testing.T) {
	app := newBooksApp(t)
	registerBooksSources(t)
	spec, _, err := reports.Load(generalLedgerShipped().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.Display == nil {
		t.Fatalf("the General Ledger spec has no display; want the phone (mobile) and tablet layouts of spec §3/§5")
	}

	type layout struct {
		width  string
		tracks int
		cells  []glCell
	}
	want := []layout{
		{"mobile", 3, []glCell{
			{"account", 1, 0, 1, 1}, {"type", 1, 0, 1, 1}, {"number", 1, 0, 1, 1},
			{"name", 2, 0, 1, 1}, {"description", 2, 0, 2, 1},
			{"split", 3, 0, 3, 1},
			{"debit", 4, 0, 1, 1}, {"credit", 4, 0, 1, 1}, {"balance", 4, 0, 1, 1},
		}},
		{"tablet", 12, []glCell{
			{"account", 1, 0, 2, 1}, {"type", 1, 0, 2, 1}, {"number", 1, 0, 2, 1},
			{"debit", 1, 0, 2, 1}, {"credit", 1, 0, 2, 1}, {"balance", 1, 0, 2, 1},
			{"name", 2, 0, 3, 1}, {"description", 2, 0, 5, 1}, {"split", 2, 0, 4, 1},
		}},
	}

	got := spec.Display.Layouts
	for _, l := range got {
		if l.Width == "desktop" {
			t.Errorf("the spec authors a desktop layout %+v; want none (core fits the one line, then wraps to the tablet layout)", l)
		}
	}
	if len(got) != len(want) {
		t.Fatalf("display.layouts = %+v, want %d layouts (mobile, tablet)", got, len(want))
	}
	for i, w := range want {
		g := got[i]
		if g.Width != w.width || g.Tracks != w.tracks {
			t.Errorf("layout %d = width %q, %d tracks; want %q, %d tracks", i, g.Width, g.Tracks, w.width, w.tracks)
		}
		if len(g.Cells) != len(w.cells) {
			t.Errorf("%s layout has %d cells %+v, want %d", w.width, len(g.Cells), g.Cells, len(w.cells))
			continue
		}
		for j, wc := range w.cells {
			if gc := glCellOf(g.Cells[j]); gc != wc {
				t.Errorf("%s layout cell %d = %+v, want %+v", w.width, j, gc, wc)
			}
		}
	}

	for _, l := range got {
		if l.Width != "tablet" {
			continue
		}
		for _, c := range l.Cells {
			if c.Col == "number" && glCellOf(c).span < 2 {
				t.Errorf("tablet No. spans %d track(s); want at least 2, room for a whole entry number", glCellOf(c).span)
			}
		}
	}

	// Spec §5 (core spec v4): the one line is tried only from 1040 px, the
	// tablet layout from 600 px, and the column fit settings below.
	if spec.Display.OneLine == nil || spec.Display.OneLine.MinWidth != "1040px" {
		t.Errorf("display.oneLine = %+v, want minWidth \"1040px\"", spec.Display.OneLine)
	}
	for _, l := range got {
		if l.Width == "tablet" && l.MinWidth != "600px" {
			t.Errorf("tablet layout minWidth = %q, want \"600px\"", l.MinWidth)
		}
	}
	grow := 2
	wantFit := map[string]reports.ColumnFit{
		"type":        {MinWidth: "12ch"},
		"number":      {MinWidth: "max-content"},
		"debit":       {MinWidth: "max-content"},
		"credit":      {MinWidth: "max-content"},
		"balance":     {MinWidth: "max-content"},
		"description": {FlexGrow: &grow},
		"split":       {MinWidth: "20ch"},
		"name":        {MinWidth: "16ch"},
	}
	if !reflect.DeepEqual(spec.Display.Columns, wantFit) {
		gotFit := map[string]string{}
		for k, v := range spec.Display.Columns {
			b, _ := json.Marshal(v)
			gotFit[k] = string(b)
		}
		t.Errorf("display.columns = %v, want type minWidth 12ch, number/debit/credit/balance minWidth max-content, description flexGrow 2, split minWidth 20ch, name minWidth 16ch, and no other column", gotFit)
	}

	if err := reports.Validate(app, spec); err != nil {
		t.Errorf("Validate refuses the layouts: %v", err)
	}
}

// The General Ledger's spec JSON stays byte-identical when its type label, its
// account label and blankZero move to the shared helpers the Journal uses
// (journal-report spec §5). The golden is mustJSON(generalLedgerSpec()) taken
// before the move.
func TestGeneralLedgerSpecUnchanged(t *testing.T) {
	got := string(mustJSON(generalLedgerSpec()))
	if got == generalLedgerSpecGolden {
		return
	}
	at := 0
	for at < len(got) && at < len(generalLedgerSpecGolden) && got[at] == generalLedgerSpecGolden[at] {
		at++
	}
	from := max(at-80, 0)
	t.Errorf("the General Ledger spec JSON changed at byte %d (%d bytes, golden %d):\n got  …%s…\n want …%s…",
		at, len(got), len(generalLedgerSpecGolden),
		got[from:min(at+80, len(got))], generalLedgerSpecGolden[from:min(at+80, len(generalLedgerSpecGolden))])
}

const generalLedgerSpecGolden = "" +
	`{"version":4,"source":"books.journal_lines","params":[{"id":"period","type":"dateRange","label":"Period","default":{"preset":"thisMonthToDate"}},{"id":"rows","t` +
	`ype":"choice","label":"Rows","default":"active","options":[{"value":"active","label":"With activity"},{"value":"all","label":"All"}]},{"id":"accounts","type":"c` +
	`hoice","label":"Accounts","optionsFrom":{"source":"books.accounts","value":[{"field":"id"}],"label":[{"field":"full_name"}],"group":[{"field":"type"}],"groupOrd` +
	`er":{"by":"declared"},"groupLabel":"All {group} accounts"},"multiple":true}],"columns":[{"id":"account","label":"Account / Date","path":[{"link":"account"}]},{"` +
	`id":"type","label":"Type","formula":{"op":"case","args":[` +
	`{"op":"and","args":[{"op":"eq","args":[{"path":[{"link":"entry"},{"field":"doc_type"}]},{"value":"bill"}]},` +
	`{"op":"not","args":[{"op":"in","args":[{"path":[{"link":"entry"},{"field":"origin"}]},{"value":["reversal","void_reversal","auto_reversal"]}]}]}]},` +
	`{"value":"Bill"},` +
	`{"op":"and","args":[{"op":"eq","args":[{"path":[{"link":"entry"},{"field":"doc_type"}]},{"value":"invo` +
	`ice"}]},{"op":"not","args":[{"op":"in","args":[{"path":[{"link":"entry"},{"field":"origin"}]},{"value":["reversal","void_reversal","auto_reversal"]}]}]}]},` +
	`{"value":"Invoice"},{"op":"and","args":[{"op":"eq","args":[{"path":[{"link":"entry"},{"field":"doc_type"}]},{"value":"sales_receipt"}]},` +
	`{"op":"not","args":[{"op":"in","args":[{"path":[{"link":"entry"},{"field":"origin"}]},{"value":["reversal","void_reversal","auto_reversal"]}]}]}]},` +
	`{"value":"Sales receipt"},{"op":"and","args":[{"op":"eq","args":[{"path":[{"link":"entry"},{"field":"doc_type"}]},{"value":"transfer"}]},` +
	`{"op":"not","args":[{"op":"in","args":[{"path":[{"link":"entry"},{"field":"origin"}]},{"value":["reversal","void_reversal","auto_reversal"]}]}]}]},{"value":"Transfer"},{"op":"eq","args":[{"path":[{"link":"entry` +
	`"},{"field":"origin"}]},{"value":"reversal"}]},{"op":"if","args":[{"op":"isEmpty","args":[{"path":[{"link":"entry"},{"link":"reverses"},{"field":"number"}]}]},{` +
	`"value":"Reversal"},{"op":"concat","args":[{"value":"Reversal"},{"value":" of "},{"path":[{"link":"entry"},{"link":"reverses"},{"field":"number"}]}]}]},{"op":"e` +
	`q","args":[{"path":[{"link":"entry"},{"field":"origin"}]},{"value":"void_reversal"}]},{"op":"if","args":[{"op":"isEmpty","args":[{"path":[{"link":"entry"},{"lin` +
	`k":"reverses"},{"field":"number"}]}]},{"value":"Void reversal"},{"op":"concat","args":[{"value":"Void reversal"},{"value":" of "},{"path":[{"link":"entry"},{"li` +
	`nk":"reverses"},{"field":"number"}]}]}]},{"op":"eq","args":[{"path":[{"link":"entry"},{"field":"origin"}]},{"value":"auto_reversal"}]},{"op":"if","args":[{"op":` +
	`"isEmpty","args":[{"path":[{"link":"entry"},{"link":"reverses"},{"field":"number"}]}]},{"value":"Auto reversal"},{"op":"concat","args":[{"value":"Auto reversal"` +
	`},{"value":" of "},{"path":[{"link":"entry"},{"link":"reverses"},{"field":"number"}]}]}]},{"op":"eq","args":[{"path":[{"link":"entry"},{"field":"origin"}]},{"va` +
	`lue":"manual"}]},{"value":"Journal entry"},{"op":"eq","args":[{"path":[{"link":"entry"},{"field":"origin"}]},{"value":"opening_balance"}]},{"value":"Opening bal` +
	`ances"},{"value":"Journal entry"}]}},{"id":"number","label":"No.","formula":{"path":[{"link":"entry"},{"field":"number"}]}},{"id":"name","label":"Name","formula` +
	`":{"op":"coalesce","args":[{"path":[{"link":"customer"},{"field":"display_name"}]},{"path":[{"link":"vendor"},{"field":"display_name"}]}]}},{"id":"description",` +
	`"label":"Description","formula":{"op":"if","args":[{"op":"isEmpty","args":[{"path":[{"field":"memo"}]}]},{"path":[{"link":"entry"},{"field":"memo"}]},{"path":[{` +
	`"field":"memo"}]}]}},{"id":"split","label":"Split","formula":{"op":"case","args":[{"op":"eq","args":[{"op":"lookup","value":{"path":[{"field":"id"}]},"where":{"` +
	`op":"eq","args":[{"path":[{"link":"entry"}]},{"outer":[{"link":"entry"}]}]},"source":"books.journal_lines","pick":"count"},{"value":2}]},{"op":"lookup","value":` +
	`{"path":[{"link":"account"},{"field":"full_name"}]},"where":{"op":"and","args":[{"op":"eq","args":[{"path":[{"link":"entry"}]},{"outer":[{"link":"entry"}]}]},{"` +
	`op":"ne","args":[{"path":[{"field":"id"}]},{"outer":[{"field":"id"}]}]}]},"source":"books.journal_lines","pick":"min"},{"op":"gt","args":[{"op":"lookup","value"` +
	`:{"path":[{"field":"id"}]},"where":{"op":"eq","args":[{"path":[{"link":"entry"}]},{"outer":[{"link":"entry"}]}]},"source":"books.journal_lines","pick":"count"},` +
	`{"value":2}]},{"value":"-Split-"},{"value":null}]}},{"id":"debit","label":"Debit","formula":{"op":"if","args":[{"op":"eq","args":[{"path":[{"field":"debit"}]},{` +
	`"value":0}]},{"value":null},{"path":[{"field":"debit"}]}]},"rollup":{"op":"sum","args":[{"path":[{"field":"debit"}]}]}},{"id":"credit","label":"Credit","formula` +
	`":{"op":"if","args":[{"op":"eq","args":[{"path":[{"field":"credit"}]},{"value":0}]},{"value":null},{"path":[{"field":"credit"}]}]},"rollup":{"op":"sum","args":[` +
	`{"path":[{"field":"credit"}]}]}},{"id":"balance","label":"Balance","formula":{"op":"if","args":[{"op":"in","args":[{"path":[{"field":"type"}],"record":"byAccoun` +
	`t"},{"value":["accounts_payable","credit_card","other_current_liability","long_term_liability","equity","income","other_income"]}]},{"op":"sub","args":[{"value"` +
	`:0},{"op":"add","args":[{"op":"add","args":[{"op":"coalesce","args":[{"op":"lookup","value":{"op":"sub","args":[{"path":[{"field":"debit"}]},{"path":[{"field":"` +
	`credit"}]}]},"where":{"op":"and","args":[{"op":"eq","args":[{"path":[{"link":"account"}]},{"path":[{"field":"id"}],"record":"byAccount"}]},{"op":"eq","args":[{"` +
	`path":[{"field":"posted"}]},{"value":true}]},{"op":"lt","args":[{"path":[{"field":"date"}]},{"param":"period","bound":"from"}]},{"op":"or","args":[{"op":"not","` +
	`args":[{"op":"in","args":[{"path":[{"link":"account"},{"field":"type"}]},{"value":["income","other_income","cost_of_goods_sold","expense","other_expense"]}]}]},` +
	`{"op":"gte","args":[{"op":"fiscalYear","args":[{"path":[{"field":"date"}]}]},{"op":"fiscalYear","args":[{"param":"period","bound":"from"}]}]}]}]},"source":"book` +
	`s.journal_lines","pick":"sum"},{"value":0}]},{"op":"if","args":[{"op":"eq","args":[{"path":[{"field":"detail_type"}],"record":"byAccount"},{"value":"retained_ea` +
	`rnings"}]},{"op":"coalesce","args":[{"op":"lookup","value":{"op":"sub","args":[{"path":[{"field":"debit"}]},{"path":[{"field":"credit"}]}]},"where":{"op":"and",` +
	`"args":[{"op":"eq","args":[{"path":[{"field":"posted"}]},{"value":true}]},{"op":"in","args":[{"path":[{"link":"account"},{"field":"type"}]},{"value":["income","` +
	`other_income","cost_of_goods_sold","expense","other_expense"]}]},{"op":"lt","args":[{"op":"fiscalYear","args":[{"path":[{"field":"date"}]}]},{"op":"fiscalYear",` +
	`"args":[{"param":"period","bound":"from"}]}]}]},"source":"books.journal_lines","pick":"sum"},{"value":0}]},{"value":0}]}]},{"op":"runningSum","args":[{"op":"sub` +
	`","args":[{"path":[{"field":"debit"}]},{"path":[{"field":"credit"}]}]}]}]}]},{"op":"add","args":[{"op":"add","args":[{"op":"coalesce","args":[{"op":"lookup","va` +
	`lue":{"op":"sub","args":[{"path":[{"field":"debit"}]},{"path":[{"field":"credit"}]}]},"where":{"op":"and","args":[{"op":"eq","args":[{"path":[{"link":"account"}` +
	`]},{"path":[{"field":"id"}],"record":"byAccount"}]},{"op":"eq","args":[{"path":[{"field":"posted"}]},{"value":true}]},{"op":"lt","args":[{"path":[{"field":"date` +
	`"}]},{"param":"period","bound":"from"}]},{"op":"or","args":[{"op":"not","args":[{"op":"in","args":[{"path":[{"link":"account"},{"field":"type"}]},{"value":["inc` +
	`ome","other_income","cost_of_goods_sold","expense","other_expense"]}]}]},{"op":"gte","args":[{"op":"fiscalYear","args":[{"path":[{"field":"date"}]}]},{"op":"fis` +
	`calYear","args":[{"param":"period","bound":"from"}]}]}]}]},"source":"books.journal_lines","pick":"sum"},{"value":0}]},{"op":"if","args":[{"op":"eq","args":[{"pa` +
	`th":[{"field":"detail_type"}],"record":"byAccount"},{"value":"retained_earnings"}]},{"op":"coalesce","args":[{"op":"lookup","value":{"op":"sub","args":[{"path":` +
	`[{"field":"debit"}]},{"path":[{"field":"credit"}]}]},"where":{"op":"and","args":[{"op":"eq","args":[{"path":[{"field":"posted"}]},{"value":true}]},{"op":"in","a` +
	`rgs":[{"path":[{"link":"account"},{"field":"type"}]},{"value":["income","other_income","cost_of_goods_sold","expense","other_expense"]}]},{"op":"lt","args":[{"o` +
	`p":"fiscalYear","args":[{"path":[{"field":"date"}]}]},{"op":"fiscalYear","args":[{"param":"period","bound":"from"}]}]}]},"source":"books.journal_lines","pick":"` +
	`sum"},{"value":0}]},{"value":0}]}]},{"op":"runningSum","args":[{"op":"sub","args":[{"path":[{"field":"debit"}]},{"path":[{"field":"credit"}]}]}]}]}]},"rollup":{` +
	`"op":"if","args":[{"op":"in","args":[{"path":[{"field":"type"}],"record":"byAccount"},{"value":["accounts_payable","credit_card","other_current_liability","long` +
	`_term_liability","equity","income","other_income"]}]},{"op":"sub","args":[{"value":0},{"op":"add","args":[{"op":"add","args":[{"op":"coalesce","args":[{"op":"lo` +
	`okup","value":{"op":"sub","args":[{"path":[{"field":"debit"}]},{"path":[{"field":"credit"}]}]},"where":{"op":"and","args":[{"op":"eq","args":[{"path":[{"link":"` +
	`account"}]},{"path":[{"field":"id"}],"record":"byAccount"}]},{"op":"eq","args":[{"path":[{"field":"posted"}]},{"value":true}]},{"op":"lt","args":[{"path":[{"fie` +
	`ld":"date"}]},{"param":"period","bound":"from"}]},{"op":"or","args":[{"op":"not","args":[{"op":"in","args":[{"path":[{"link":"account"},{"field":"type"}]},{"val` +
	`ue":["income","other_income","cost_of_goods_sold","expense","other_expense"]}]}]},{"op":"gte","args":[{"op":"fiscalYear","args":[{"path":[{"field":"date"}]}]},{` +
	`"op":"fiscalYear","args":[{"param":"period","bound":"from"}]}]}]}]},"source":"books.journal_lines","pick":"sum"},{"value":0}]},{"op":"if","args":[{"op":"eq","ar` +
	`gs":[{"path":[{"field":"detail_type"}],"record":"byAccount"},{"value":"retained_earnings"}]},{"op":"coalesce","args":[{"op":"lookup","value":{"op":"sub","args":` +
	`[{"path":[{"field":"debit"}]},{"path":[{"field":"credit"}]}]},"where":{"op":"and","args":[{"op":"eq","args":[{"path":[{"field":"posted"}]},{"value":true}]},{"op` +
	`":"in","args":[{"path":[{"link":"account"},{"field":"type"}]},{"value":["income","other_income","cost_of_goods_sold","expense","other_expense"]}]},{"op":"lt","a` +
	`rgs":[{"op":"fiscalYear","args":[{"path":[{"field":"date"}]}]},{"op":"fiscalYear","args":[{"param":"period","bound":"from"}]}]}]},"source":"books.journal_lines"` +
	`,"pick":"sum"},{"value":0}]},{"value":0}]}]},{"op":"coalesce","args":[{"op":"sum","args":[{"op":"sub","args":[{"path":[{"field":"debit"}]},{"path":[{"field":"cr` +
	`edit"}]}]}]},{"value":0}]}]}]},{"op":"add","args":[{"op":"add","args":[{"op":"coalesce","args":[{"op":"lookup","value":{"op":"sub","args":[{"path":[{"field":"de` +
	`bit"}]},{"path":[{"field":"credit"}]}]},"where":{"op":"and","args":[{"op":"eq","args":[{"path":[{"link":"account"}]},{"path":[{"field":"id"}],"record":"byAccoun` +
	`t"}]},{"op":"eq","args":[{"path":[{"field":"posted"}]},{"value":true}]},{"op":"lt","args":[{"path":[{"field":"date"}]},{"param":"period","bound":"from"}]},{"op"` +
	`:"or","args":[{"op":"not","args":[{"op":"in","args":[{"path":[{"link":"account"},{"field":"type"}]},{"value":["income","other_income","cost_of_goods_sold","expe` +
	`nse","other_expense"]}]}]},{"op":"gte","args":[{"op":"fiscalYear","args":[{"path":[{"field":"date"}]}]},{"op":"fiscalYear","args":[{"param":"period","bound":"fr` +
	`om"}]}]}]}]},"source":"books.journal_lines","pick":"sum"},{"value":0}]},{"op":"if","args":[{"op":"eq","args":[{"path":[{"field":"detail_type"}],"record":"byAcco` +
	`unt"},{"value":"retained_earnings"}]},{"op":"coalesce","args":[{"op":"lookup","value":{"op":"sub","args":[{"path":[{"field":"debit"}]},{"path":[{"field":"credit` +
	`"}]}]},"where":{"op":"and","args":[{"op":"eq","args":[{"path":[{"field":"posted"}]},{"value":true}]},{"op":"in","args":[{"path":[{"link":"account"},{"field":"ty` +
	`pe"}]},{"value":["income","other_income","cost_of_goods_sold","expense","other_expense"]}]},{"op":"lt","args":[{"op":"fiscalYear","args":[{"path":[{"field":"dat` +
	`e"}]}]},{"op":"fiscalYear","args":[{"param":"period","bound":"from"}]}]}]},"source":"books.journal_lines","pick":"sum"},{"value":0}]},{"value":0}]}]},{"op":"coa` +
	`lesce","args":[{"op":"sum","args":[{"op":"sub","args":[{"path":[{"field":"debit"}]},{"path":[{"field":"credit"}]}]}]},{"value":0}]}]}]}}],"filter":{"op":"and","` +
	`args":[{"op":"eq","args":[{"path":[{"field":"posted"}]},{"value":true}]},{"op":"between","args":[{"path":[{"field":"date"}]},{"param":"period"}]},{"op":"in","ar` +
	`gs":[{"col":"account"},{"param":"accounts"}]}]},"sort":[{"formula":{"op":"case","args":[{"op":"eq","args":[{"path":[{"field":"type"}],"record":"byAccount"},{"va` +
	`lue":"bank"}]},{"value":1},{"op":"eq","args":[{"path":[{"field":"type"}],"record":"byAccount"},{"value":"accounts_receivable"}]},{"value":2},{"op":"eq","args":[` +
	`{"path":[{"field":"type"}],"record":"byAccount"},{"value":"other_current_asset"}]},{"value":3},{"op":"eq","args":[{"path":[{"field":"type"}],"record":"byAccount` +
	`"},{"value":"fixed_asset"}]},{"value":4},{"op":"eq","args":[{"path":[{"field":"type"}],"record":"byAccount"},{"value":"other_asset"}]},{"value":5},{"op":"eq","a` +
	`rgs":[{"path":[{"field":"type"}],"record":"byAccount"},{"value":"accounts_payable"}]},{"value":6},{"op":"eq","args":[{"path":[{"field":"type"}],"record":"byAcco` +
	`unt"},{"value":"credit_card"}]},{"value":7},{"op":"eq","args":[{"path":[{"field":"type"}],"record":"byAccount"},{"value":"other_current_liability"}]},{"value":8` +
	`},{"op":"eq","args":[{"path":[{"field":"type"}],"record":"byAccount"},{"value":"long_term_liability"}]},{"value":9},{"op":"eq","args":[{"path":[{"field":"type"}` +
	`],"record":"byAccount"},{"value":"equity"}]},{"value":10},{"op":"eq","args":[{"path":[{"field":"type"}],"record":"byAccount"},{"value":"income"}]},{"value":11},` +
	`{"op":"eq","args":[{"path":[{"field":"type"}],"record":"byAccount"},{"value":"other_income"}]},{"value":12},{"op":"eq","args":[{"path":[{"field":"type"}],"recor` +
	`d":"byAccount"},{"value":"cost_of_goods_sold"}]},{"value":13},{"op":"eq","args":[{"path":[{"field":"type"}],"record":"byAccount"},{"value":"expense"}]},{"value"` +
	`:14},{"op":"eq","args":[{"path":[{"field":"type"}],"record":"byAccount"},{"value":"other_expense"}]},{"value":15},{"value":16}]}},{"formula":{"path":[{"field":"` +
	`number"}],"record":"byAccount"}},{"formula":{"path":[{"field":"full_name"}],"record":"byAccount"}},{"formula":{"path":[{"field":"date"}]}},{"formula":{"path":[{` +
	`"link":"entry"},{"field":"posted_at"}]}},{"formula":{"path":[{"field":"position"}]}}],"groups":[{"id":"byAccount","col":"account","subtotals":true,"open":true,"` +
	`label":{"op":"if","args":[{"op":"isEmpty","args":[{"path":[{"field":"number"}],"record":"byAccount"}]},{"path":[{"field":"full_name"}],"record":"byAccount"},{"o` +
	`p":"concat","args":[{"path":[{"field":"number"}],"record":"byAccount"},{"value":" "},{"path":[{"field":"full_name"}],"record":"byAccount"}]}]},"fill":{"where":{` +
	`"op":"in","args":[{"path":[{"field":"id"}]},{"param":"accounts"}]}},"having":{"op":"or","args":[{"op":"gt","args":[{"op":"count","args":[{"path":[{"field":"id"}` +
	`]}]},{"value":0}]},{"op":"ne","args":[{"op":"add","args":[{"op":"coalesce","args":[{"op":"lookup","value":{"op":"sub","args":[{"path":[{"field":"debit"}]},{"pat` +
	`h":[{"field":"credit"}]}]},"where":{"op":"and","args":[{"op":"eq","args":[{"path":[{"link":"account"}]},{"path":[{"field":"id"}],"record":"byAccount"}]},{"op":"` +
	`eq","args":[{"path":[{"field":"posted"}]},{"value":true}]},{"op":"lt","args":[{"path":[{"field":"date"}]},{"param":"period","bound":"from"}]},{"op":"or","args":` +
	`[{"op":"not","args":[{"op":"in","args":[{"path":[{"link":"account"},{"field":"type"}]},{"value":["income","other_income","cost_of_goods_sold","expense","other_e` +
	`xpense"]}]}]},{"op":"gte","args":[{"op":"fiscalYear","args":[{"path":[{"field":"date"}]}]},{"op":"fiscalYear","args":[{"param":"period","bound":"from"}]}]}]}]},` +
	`"source":"books.journal_lines","pick":"sum"},{"value":0}]},{"op":"if","args":[{"op":"eq","args":[{"path":[{"field":"detail_type"}],"record":"byAccount"},{"value` +
	`":"retained_earnings"}]},{"op":"coalesce","args":[{"op":"lookup","value":{"op":"sub","args":[{"path":[{"field":"debit"}]},{"path":[{"field":"credit"}]}]},"where` +
	`":{"op":"and","args":[{"op":"eq","args":[{"path":[{"field":"posted"}]},{"value":true}]},{"op":"in","args":[{"path":[{"link":"account"},{"field":"type"}]},{"valu` +
	`e":["income","other_income","cost_of_goods_sold","expense","other_expense"]}]},{"op":"lt","args":[{"op":"fiscalYear","args":[{"path":[{"field":"date"}]}]},{"op"` +
	`:"fiscalYear","args":[{"param":"period","bound":"from"}]}]}]},"source":"books.journal_lines","pick":"sum"},{"value":0}]},{"value":0}]}]},{"value":0}]},{"op":"an` +
	`d","args":[{"op":"eq","args":[{"param":"rows"},{"value":"all"}]},{"op":"eq","args":[{"path":[{"field":"inactive"}],"record":"byAccount"},{"value":false}]}]}]},"` +
	`opening":{"label":"Beginning balance","cells":{"balance":{"op":"if","args":[{"op":"in","args":[{"path":[{"field":"type"}],"record":"byAccount"},{"value":["accou` +
	`nts_payable","credit_card","other_current_liability","long_term_liability","equity","income","other_income"]}]},{"op":"sub","args":[{"value":0},{"op":"add","arg` +
	`s":[{"op":"coalesce","args":[{"op":"lookup","value":{"op":"sub","args":[{"path":[{"field":"debit"}]},{"path":[{"field":"credit"}]}]},"where":{"op":"and","args":` +
	`[{"op":"eq","args":[{"path":[{"link":"account"}]},{"path":[{"field":"id"}],"record":"byAccount"}]},{"op":"eq","args":[{"path":[{"field":"posted"}]},{"value":tru` +
	`e}]},{"op":"lt","args":[{"path":[{"field":"date"}]},{"param":"period","bound":"from"}]},{"op":"or","args":[{"op":"not","args":[{"op":"in","args":[{"path":[{"lin` +
	`k":"account"},{"field":"type"}]},{"value":["income","other_income","cost_of_goods_sold","expense","other_expense"]}]}]},{"op":"gte","args":[{"op":"fiscalYear","` +
	`args":[{"path":[{"field":"date"}]}]},{"op":"fiscalYear","args":[{"param":"period","bound":"from"}]}]}]}]},"source":"books.journal_lines","pick":"sum"},{"value":` +
	`0}]},{"op":"if","args":[{"op":"eq","args":[{"path":[{"field":"detail_type"}],"record":"byAccount"},{"value":"retained_earnings"}]},{"op":"coalesce","args":[{"op` +
	`":"lookup","value":{"op":"sub","args":[{"path":[{"field":"debit"}]},{"path":[{"field":"credit"}]}]},"where":{"op":"and","args":[{"op":"eq","args":[{"path":[{"fi` +
	`eld":"posted"}]},{"value":true}]},{"op":"in","args":[{"path":[{"link":"account"},{"field":"type"}]},{"value":["income","other_income","cost_of_goods_sold","expe` +
	`nse","other_expense"]}]},{"op":"lt","args":[{"op":"fiscalYear","args":[{"path":[{"field":"date"}]}]},{"op":"fiscalYear","args":[{"param":"period","bound":"from"` +
	`}]}]}]},"source":"books.journal_lines","pick":"sum"},{"value":0}]},{"value":0}]}]}]},{"op":"add","args":[{"op":"coalesce","args":[{"op":"lookup","value":{"op":"` +
	`sub","args":[{"path":[{"field":"debit"}]},{"path":[{"field":"credit"}]}]},"where":{"op":"and","args":[{"op":"eq","args":[{"path":[{"link":"account"}]},{"path":[` +
	`{"field":"id"}],"record":"byAccount"}]},{"op":"eq","args":[{"path":[{"field":"posted"}]},{"value":true}]},{"op":"lt","args":[{"path":[{"field":"date"}]},{"param` +
	`":"period","bound":"from"}]},{"op":"or","args":[{"op":"not","args":[{"op":"in","args":[{"path":[{"link":"account"},{"field":"type"}]},{"value":["income","other_` +
	`income","cost_of_goods_sold","expense","other_expense"]}]}]},{"op":"gte","args":[{"op":"fiscalYear","args":[{"path":[{"field":"date"}]}]},{"op":"fiscalYear","ar` +
	`gs":[{"param":"period","bound":"from"}]}]}]}]},"source":"books.journal_lines","pick":"sum"},{"value":0}]},{"op":"if","args":[{"op":"eq","args":[{"path":[{"field` +
	`":"detail_type"}],"record":"byAccount"},{"value":"retained_earnings"}]},{"op":"coalesce","args":[{"op":"lookup","value":{"op":"sub","args":[{"path":[{"field":"d` +
	`ebit"}]},{"path":[{"field":"credit"}]}]},"where":{"op":"and","args":[{"op":"eq","args":[{"path":[{"field":"posted"}]},{"value":true}]},{"op":"in","args":[{"path` +
	`":[{"link":"account"},{"field":"type"}]},{"value":["income","other_income","cost_of_goods_sold","expense","other_expense"]}]},{"op":"lt","args":[{"op":"fiscalYe` +
	`ar","args":[{"path":[{"field":"date"}]}]},{"op":"fiscalYear","args":[{"param":"period","bound":"from"}]}]}]},"source":"books.journal_lines","pick":"sum"},{"valu` +
	`e":0}]},{"value":0}]}]}]}}}}],"detail":{"label":{"path":[{"field":"date"}]}},"display":{"oneLine":{"minWidth":"1040px"},"columns":{"balance":{"minWidth":"max-co` +
	`ntent"},"credit":{"minWidth":"max-content"},"debit":{"minWidth":"max-content"},"description":{"flexGrow":2},"name":{"minWidth":"16ch"},"number":{"minWidth":"max` +
	`-content"},"split":{"minWidth":"20ch"},"type":{"minWidth":"12ch"}},"layouts":[{"width":"mobile","tracks":3,"cells":[{"col":"account","line":1},{"col":"type","li` +
	`ne":1},{"col":"number","line":1},{"col":"name","line":2},{"col":"description","line":2,"span":2},{"col":"split","line":3,"span":3},{"col":"debit","line":4},{"co` +
	`l":"credit","line":4},{"col":"balance","line":4}]},{"width":"tablet","minWidth":"600px","tracks":12,"cells":[{"col":"account","line":1,"span":2},{"col":"type","` +
	`line":1,"span":2},{"col":"number","line":1,"span":2},{"col":"debit","line":1,"span":2},{"col":"credit","line":1,"span":2},{"col":"balance","line":1,"span":2},{"` +
	`col":"name","line":2,"span":3},{"col":"description","line":2,"span":5},{"col":"split","line":2,"span":4}]}]}}`
