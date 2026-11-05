package books

import (
	"context"
	"encoding/json"
	"maps"
	"reflect"
	"slices"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// tbToday is the reader's day in every run, so presets never move with the
// clock.
const tbToday = "2026-11-04"

// runTB loads the shipped Trial Balance and runs it as reader, as core's run
// endpoint does: Load, then Run with the posted params.
func runTB(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	spec, info, err := reports.Load(trialBalanceShipped().Spec)
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

// tbBook is a Books app with every ledger hook bound, Books' report sources,
// and a reader with Books read-only access.
type tbBook struct {
	app    core.App
	reader *core.Record
}

func newTBBook(t *testing.T) tbBook {
	t.Helper()
	app := newGuardedApp(t)
	registerBooksSources(t)
	reader := mkUser(t, app, "member")
	setPkgAccess(t, app, reader, "readonly")
	return tbBook{app: app, reader: reader}
}

// account saves a top-level account; an empty number leaves it unnumbered.
func (b tbBook) account(t *testing.T, name, number, accountType, detailType string) *core.Record {
	t.Helper()
	return saveRecord(t, b.app, "books_accounts", map[string]any{
		"name": name, "number": number, "type": accountType, "detail_type": detailType, "currency": "USD",
	})
}

// memoLine is a journal line with its own memo, in minor units.
type memoLine struct {
	account       *core.Record
	debit, credit int
	memo          string
}

// postMemo saves a manual entry with a memo and its lines, posts it, and
// returns the posted entry (its number is set by the post).
func (b tbBook) postMemo(t *testing.T, date, memo string, lines ...memoLine) *core.Record {
	t.Helper()
	entry := saveRecord(t, b.app, "books_journal_entries", map[string]any{
		"date": date, "status": "draft", "doc_type": "journal", "origin": "manual", "currency": "USD", "memo": memo,
	})
	for i, l := range lines {
		saveRecord(t, b.app, "books_journal_lines", map[string]any{
			"entry": entry.Id, "account": l.account.Id, "debit": l.debit, "credit": l.credit,
			"memo": l.memo, "position": i, "currency": "USD",
		})
	}
	return mustPost(t, b.app, entry.Id, "")
}

func (b tbBook) post(t *testing.T, date string, lines ...ln) *core.Record {
	t.Helper()
	return mustPost(t, b.app, mkDraft(t, b.app, date, lines...).Id, "")
}

// accountRows are the result's account rows, in the order the report shows
// them.
func accountRows(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup {
			out = append(out, r)
		}
	}
	return out
}

// accountOf is the account a row stands for: the first value of its group
// key, which is the account id. A row with no string id fails the test, so
// a check that an account is absent cannot pass on an unreadable key.
func accountOf(t *testing.T, r reports.Row) string {
	t.Helper()
	if len(r.GroupKey) == 0 {
		t.Fatalf("%s (%s) has no group key", r.Label, r.Kind)
	}
	id, ok := r.GroupKey[0].(string)
	if !ok || id == "" {
		t.Fatalf("%s (%s) group key %#v: the first value is a %T, want an account id string", r.Label, r.Kind, r.GroupKey, r.GroupKey[0])
	}
	return id
}

func accountIDs(t *testing.T, rows []reports.Row) []string {
	t.Helper()
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = accountOf(t, r)
	}
	return out
}

func idsOf(accounts ...*core.Record) []string {
	out := make([]string, len(accounts))
	for i, a := range accounts {
		out[i] = a.Id
	}
	return out
}

// sameAccounts compares two sets of account ids.
func sameAccounts(got, want []string) bool {
	return reflect.DeepEqual(slices.Sorted(slices.Values(got)), slices.Sorted(slices.Values(want)))
}

func rowFor(t *testing.T, res *reports.Result, account *core.Record) reports.Row {
	t.Helper()
	for _, r := range accountRows(res) {
		if accountOf(t, r) == account.Id {
			return r
		}
	}
	t.Fatalf("no row for %s; rows %v", account.GetString("full_name"), labelsOf(accountRows(res)))
	return reports.Row{}
}

func hasRowFor(t *testing.T, res *reports.Result, account *core.Record) bool {
	t.Helper()
	return slices.Contains(accountIDs(t, accountRows(res)), account.Id)
}

func labelsOf(rows []reports.Row) []string {
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = r.Label
	}
	return out
}

func totalOf(t *testing.T, res *reports.Result) reports.Row {
	t.Helper()
	var totals []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindTotal {
			totals = append(totals, r)
		}
	}
	if len(totals) != 1 {
		t.Fatalf("%d total rows, want 1: %+v", len(totals), totals)
	}
	return totals[0]
}

// requireSplit checks a row's Debit and Credit cells: an int64 of minor
// units, or nil for an empty cell.
func requireSplit(t *testing.T, r reports.Row, debit, credit any) {
	t.Helper()
	if r.Cells["debit"] != debit || r.Cells["credit"] != credit {
		t.Errorf("%s: debit %#v, credit %#v; want debit %#v, credit %#v", r.Label, r.Cells["debit"], r.Cells["credit"], debit, credit)
	}
}

// resolvedAsOf is the day the run resolved As of to.
func resolvedAsOf(t *testing.T, res *reports.Result) any {
	t.Helper()
	for _, p := range res.Params {
		if p.ID == "asOf" {
			return p.Value
		}
	}
	t.Fatalf("the result has no asOf param: %+v", res.Params)
	return nil
}

// moneyCell reads an amount cell: an int64 of minor units, or nil (ok false)
// for an empty cell. A cell of any other type fails the test, so a check over
// the cells never skips one.
func moneyCell(t *testing.T, r reports.Row, col string) (int64, bool) {
	t.Helper()
	cell := r.Cells[col]
	if cell == nil {
		return 0, false
	}
	v, ok := cell.(int64)
	if !ok {
		t.Fatalf("%s (%s) %s = %#v, a %T; want int64 minor units or nil", r.Label, r.Kind, col, cell, cell)
	}
	return v, true
}

func jsonEqual(t *testing.T, raw json.RawMessage, want string) bool {
	t.Helper()
	var got, exp any
	if err := json.Unmarshal(raw, &got); err != nil {
		return false
	}
	if err := json.Unmarshal([]byte(want), &exp); err != nil {
		t.Fatalf("bad want %s: %v", want, err)
	}
	return reflect.DeepEqual(got, exp)
}

func paramOf(t *testing.T, spec *reports.Spec, id string) reports.ParamDef {
	t.Helper()
	for _, p := range spec.Params {
		if p.ID == id {
			return p
		}
	}
	t.Fatalf("the spec has no param %q", id)
	return reports.ParamDef{}
}

func TestTrialBalanceSpecLoads(t *testing.T) {
	app := newBooksApp(t)
	registerBooksSources(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	shipped := trialBalanceShipped()
	if trialBalanceKey != "books.trial_balance" || shipped.Key != trialBalanceKey {
		t.Errorf("key = %q (const %q), want books.trial_balance", shipped.Key, trialBalanceKey)
	}
	if shipped.Title != "Trial Balance" {
		t.Errorf("title = %q", shipped.Title)
	}
	if shipped.Description != "Each account's balance on one day, as a debit or a credit." {
		t.Errorf("description = %q", shipped.Description)
	}
	if shipped.Revision != 1 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	built, err := json.Marshal(trialBalanceSpec())
	if err != nil {
		t.Fatal(err)
	}
	if !jsonEqual(t, shipped.Spec, string(built)) {
		t.Errorf("the shipped spec is not trialBalanceSpec()")
	}

	spec, info, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.Version != 2 || info.UpgradedFrom != 0 {
		t.Errorf("version %d, upgraded from %d; want version 2 with no upgrade", spec.Version, info.UpgradedFrom)
	}
	if spec.Source != "books.journal_lines" {
		t.Errorf("source = %q, want books.journal_lines", spec.Source)
	}
	if err := reports.Validate(app, spec); err != nil {
		t.Fatalf("Validate: %v", err)
	}

	ids := make([]string, len(spec.Params))
	for i, p := range spec.Params {
		ids[i] = p.ID
	}
	if !reflect.DeepEqual(ids, []string{"asOf", "rows", "accounts"}) {
		t.Fatalf("params = %v, want asOf, rows, accounts (the chips' order)", ids)
	}
	asOf := paramOf(t, spec, "asOf")
	if asOf.Type != reports.ParamAsOf || asOf.Label != "As of" || !jsonEqual(t, asOf.Default, `{"preset":"endOfLastMonth"}`) {
		t.Errorf("asOf = %+v (default %s)", asOf, asOf.Default)
	}
	rows := paramOf(t, spec, "rows")
	wantRows := []reports.Option{{Value: "nonzero", Label: "Non-zero"}, {Value: "active", Label: "Active"}, {Value: "all", Label: "All"}}
	if rows.Type != reports.ParamChoice || rows.Label != "Rows" || rows.Multiple ||
		!reflect.DeepEqual(rows.Options, wantRows) || !jsonEqual(t, rows.Default, `"nonzero"`) {
		t.Errorf("rows = %+v (default %s)", rows, rows.Default)
	}
	accounts := paramOf(t, spec, "accounts")
	if accounts.Type != reports.ParamChoice || accounts.Label != "Accounts" || !accounts.Multiple || accounts.Default != nil {
		t.Errorf("accounts = %+v (default %s), want a multiple choice with no default", accounts, accounts.Default)
	}
	wantFrom := &reports.OptionsFrom{
		Source:     "books.accounts",
		Value:      reports.Path{{Field: "id"}},
		Label:      reports.Path{{Field: "full_name"}},
		Group:      reports.Path{{Field: "type"}},
		GroupLabel: "All {group} accounts",
	}
	if !reflect.DeepEqual(accounts.OptionsFrom, wantFrom) {
		t.Errorf("accounts.optionsFrom = %+v, want %+v", accounts.OptionsFrom, wantFrom)
	}
}

// Rows come in the chart order: account type in account_types.json order
// (not by key), then number, then full name. The numbers and names are
// chosen so that each of the three keys alone gives a different order.
func TestTrialBalanceChartOrder(t *testing.T) {
	b := newTBBook(t)
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

	res := runTB(t, b.app, b.reader, map[string]any{"asOf": tbToday}, reports.Options{Today: tbToday})
	rows := accountRows(res)
	want := []*core.Record{deposits, undeposited, prepaid, travel, visa, amex, fees, paper, supplies, advertising}
	if got := accountIDs(t, rows); !reflect.DeepEqual(got, idsOf(want...)) {
		t.Fatalf("rows = %v\nwant   [Prepaid rent:Deposits, Undeposited funds, Prepaid rent, Visa:Travel card, Visa, Amex, Bank fees, Supplies:Paper, Supplies, Advertising]", labelsOf(rows))
	}
	wantNumbers := []any{"", "7100", "7200", "", "2100", "2200", "", "", "1100", "1200"}
	gotNumbers := make([]any, len(rows))
	for i, r := range rows {
		gotNumbers[i] = r.Cells["number"]
	}
	if !reflect.DeepEqual(gotNumbers, wantNumbers) {
		t.Errorf("No. cells = %#v, want %#v (blank for an account with no number)", gotNumbers, wantNumbers)
	}
}

// As of's presets resolve against the reader's day and the Books fiscal start
// month, read again at each run.
func TestTrialBalanceFiscalPreset(t *testing.T) {
	b := newTBBook(t)
	checking := b.account(t, "Checking", "1000", "bank", "checking")
	income := b.account(t, "Consulting Income", "4000", "income", "service_income")
	mkRetainedEarnings(t, b.app, "3900")
	saveSettings(t, b.app, map[string]any{"fiscal_year_start_month": 7})
	b.post(t, "2025-12-15", ln{checking, 200, 0}, ln{income, 0, 200})
	b.post(t, "2026-06-30", ln{checking, 1000, 0}, ln{income, 0, 1000})
	b.post(t, "2026-07-01", ln{checking, 500, 0}, ln{income, 0, 500})
	opts := reports.Options{Today: tbToday}

	byDefault := runTB(t, b.app, b.reader, nil, opts)
	if got := resolvedAsOf(t, byDefault); got != "2026-10-31" {
		t.Errorf("As of with no param resolved to %#v, want 2026-10-31 (End of last month)", got)
	}

	lastFY := map[string]any{"asOf": map[string]any{"preset": "endOfLastFiscalYear"}}
	july := runTB(t, b.app, b.reader, lastFY, opts)
	if got := resolvedAsOf(t, july); got != "2026-06-30" {
		t.Errorf("End of last fiscal year (start month 7) resolved to %#v, want 2026-06-30", got)
	}
	// The 2026-07-01 line is after the day: 200 + 1000 only.
	requireSplit(t, rowFor(t, july, income), nil, int64(1200))

	saveSettings(t, b.app, map[string]any{"fiscal_year_start_month": 1})
	january := runTB(t, b.app, b.reader, lastFY, opts)
	if got := resolvedAsOf(t, january); got != "2025-12-31" {
		t.Errorf("End of last fiscal year (start month 1) resolved to %#v, want 2025-12-31: the start month is read at each run", got)
	}
	requireSplit(t, rowFor(t, january, income), nil, int64(200))
}

// Debit and Credit show the account's net by its sign, never a negative
// amount and never both.
func TestTrialBalanceSignSplit(t *testing.T) {
	b := newTBBook(t)
	checking := b.account(t, "Checking", "1000", "bank", "checking")
	visa := b.account(t, "Visa", "2100", "credit_card", "credit_card")
	software := b.account(t, "Software", "6100", "expense", "dues_subscriptions")
	supplies := b.account(t, "Supplies", "6200", "expense", "office_general")
	mkRetainedEarnings(t, b.app, "3900")
	b.post(t, "2026-03-10", ln{software, 12345, 0}, ln{visa, 0, 12345})
	// A contra entry: the refund is larger than the purchase, so the expense
	// nets to a credit of 76.55.
	b.post(t, "2026-03-11", ln{supplies, 10000, 0}, ln{checking, 0, 10000})
	b.post(t, "2026-03-12", ln{checking, 17655, 0}, ln{supplies, 0, 17655})

	res := runTB(t, b.app, b.reader, map[string]any{"asOf": tbToday}, reports.Options{Today: tbToday})
	requireSplit(t, rowFor(t, res, software), int64(12345), nil)
	requireSplit(t, rowFor(t, res, visa), nil, int64(12345))
	requireSplit(t, rowFor(t, res, supplies), nil, int64(7655))
	requireSplit(t, rowFor(t, res, checking), int64(7655), nil)
	for _, r := range res.Rows {
		for _, col := range []string{"debit", "credit"} {
			if v, ok := moneyCell(t, r, col); ok && v < 0 {
				t.Errorf("%s %s = %d, a negative amount", r.Label, col, v)
			}
		}
	}
}

// rowsBook is one ledger for the Rows choice: a zero-net account, a busy
// one, an idle one, an inactive one with no lines and an inactive one with a
// posted line.
type rowsBook struct {
	tbBook
	checking, zeroed, busy, idle, retired, closed, retained *core.Record
}

func newRowsBook(t *testing.T) rowsBook {
	t.Helper()
	b := rowsBook{tbBook: newTBBook(t)}
	b.checking = b.account(t, "Checking", "1000", "bank", "checking")
	b.zeroed = b.account(t, "Zeroed", "6100", "expense", "office_general")
	b.busy = b.account(t, "Busy", "6200", "expense", "rent_lease")
	b.idle = b.account(t, "Idle", "6300", "expense", "travel")
	b.retired = b.account(t, "Retired", "6400", "expense", "meals")
	b.closed = b.account(t, "Closed", "6500", "expense", "utilities")
	b.retained = mkRetainedEarnings(t, b.app, "3900")
	b.post(t, "2026-02-01", ln{b.zeroed, 5000, 0}, ln{b.checking, 0, 5000})
	b.post(t, "2026-02-02", ln{b.checking, 5000, 0}, ln{b.zeroed, 0, 5000})
	b.post(t, "2026-02-03", ln{b.busy, 7000, 0}, ln{b.checking, 0, 7000})
	b.post(t, "2026-02-04", ln{b.closed, 2000, 0}, ln{b.checking, 0, 2000})
	makeAccountInactive(t, b.app, b.retired)
	makeAccountInactive(t, b.app, b.closed)
	return b
}

func TestTrialBalanceZeroAndBlank(t *testing.T) {
	b := newRowsBook(t)
	opts := reports.Options{Today: tbToday}

	active := runTB(t, b.app, b.reader, map[string]any{"asOf": tbToday, "rows": "active"}, opts)
	requireSplit(t, rowFor(t, active, b.zeroed), int64(0), nil)

	all := runTB(t, b.app, b.reader, map[string]any{"asOf": tbToday, "rows": "all"}, opts)
	requireSplit(t, rowFor(t, all, b.idle), nil, nil)
	if hasRowFor(t, all, b.retired) {
		t.Errorf("an inactive account with no lines shows under All")
	}
	requireSplit(t, rowFor(t, all, b.closed), int64(2000), nil)
}

func TestTrialBalanceRowsChoice(t *testing.T) {
	b := newRowsBook(t)
	opts := reports.Options{Today: tbToday}
	cases := []struct {
		name   string
		params map[string]any
		want   []*core.Record
	}{
		{"nonzero by default", map[string]any{"asOf": tbToday}, []*core.Record{b.checking, b.busy, b.closed}},
		{"nonzero", map[string]any{"asOf": tbToday, "rows": "nonzero"}, []*core.Record{b.checking, b.busy, b.closed}},
		{"active", map[string]any{"asOf": tbToday, "rows": "active"}, []*core.Record{b.checking, b.zeroed, b.busy, b.closed}},
		{"all", map[string]any{"asOf": tbToday, "rows": "all"}, []*core.Record{b.checking, b.zeroed, b.busy, b.idle, b.closed, b.retained}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rows := accountRows(runTB(t, b.app, b.reader, c.params, opts))
			if got := accountIDs(t, rows); !sameAccounts(got, idsOf(c.want...)) {
				wantNames := make([]string, len(c.want))
				for i, a := range c.want {
					wantNames[i] = a.GetString("full_name")
				}
				t.Errorf("rows = %v, want %v", labelsOf(rows), wantNames)
			}
		})
	}
}

func TestTrialBalanceAccountsParam(t *testing.T) {
	b := newTBBook(t)
	checking := b.account(t, "Checking", "1000", "bank", "checking")
	visa := b.account(t, "Visa", "2100", "credit_card", "credit_card")
	software := b.account(t, "Software", "6100", "expense", "dues_subscriptions")
	rent := b.account(t, "Rent", "6200", "expense", "rent_lease")
	supplies := b.account(t, "Supplies", "6300", "expense", "office_general")
	b.account(t, "Travel", "6400", "expense", "travel")
	mkRetainedEarnings(t, b.app, "3900")
	b.post(t, "2026-03-10", ln{software, 12345, 0}, ln{visa, 0, 12345})
	b.post(t, "2026-03-11", ln{rent, 50000, 0}, ln{checking, 0, 50000})
	b.post(t, "2026-03-12", ln{supplies, 3000, 0}, ln{checking, 0, 3000})
	opts := reports.Options{Today: tbToday}

	one := runTB(t, b.app, b.reader, map[string]any{"asOf": tbToday, "accounts": []string{software.Id}}, opts)
	if got := accountIDs(t, accountRows(one)); !reflect.DeepEqual(got, idsOf(software)) {
		t.Fatalf("rows = %v, want only Software", labelsOf(accountRows(one)))
	}
	// The Total adds the one row shown, so it does not balance; a column with
	// no row shown adds to 0 (core levels.go childSum: COALESCE(sum, 0)).
	requireSplit(t, totalOf(t, one), int64(12345), int64(0))

	group := runTB(t, b.app, b.reader, map[string]any{"asOf": tbToday, "accounts": []any{map[string]any{"group": "expense"}}}, opts)
	if got := accountIDs(t, accountRows(group)); !sameAccounts(got, idsOf(software, rent, supplies)) {
		t.Fatalf("rows = %v, want every expense account with lines: Software, Rent, Supplies", labelsOf(accountRows(group)))
	}
	requireSplit(t, totalOf(t, group), int64(65345), int64(0))
}

// Income and expense lines of earlier fiscal years count on the one
// retained-earnings account, which sorts among the equity accounts.
func TestTrialBalanceRetainedEarnings(t *testing.T) {
	cases := []struct {
		name                      string
		startMonth                int
		priorIncome, priorExpense string // days in the previous fiscal year
		lastPriorDay, boundary    string // its last day, and the first day of the next
		currentYear               string // a day in the as-of day's fiscal year
	}{
		{name: "fiscal year from January", startMonth: 1,
			priorIncome: "2025-06-15", priorExpense: "2025-08-20",
			lastPriorDay: "2025-12-31", boundary: "2026-01-01", currentYear: "2026-02-01"},
		// 2026-03-15 is in calendar 2026 but in the fiscal year that ends
		// 2026-06-30.
		{name: "fiscal year from July", startMonth: 7,
			priorIncome: "2026-03-15", priorExpense: "2025-09-10",
			lastPriorDay: "2026-06-30", boundary: "2026-07-01", currentYear: "2026-08-01"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			b := newTBBook(t)
			saveSettings(t, b.app, map[string]any{"fiscal_year_start_month": c.startMonth})
			checking := b.account(t, "Checking", "1000", "bank", "checking")
			ownerEquity := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
			retained := mkRetainedEarnings(t, b.app, "3900")
			draws := b.account(t, "Owner draws", "3950", "equity", "owner_draws")
			income := b.account(t, "Consulting Income", "4000", "income", "service_income")
			rent := b.account(t, "Rent", "6000", "expense", "rent_lease")
			b.post(t, c.priorIncome, ln{checking, 30000, 0}, ln{income, 0, 30000})
			b.post(t, c.priorExpense, ln{rent, 10000, 0}, ln{checking, 0, 10000})
			b.post(t, c.boundary, ln{checking, 5000, 0}, ln{income, 0, 5000})
			b.post(t, c.currentYear, ln{checking, 100000, 0}, ln{ownerEquity, 0, 100000})
			b.post(t, c.currentYear, ln{draws, 20000, 0}, ln{checking, 0, 20000})
			opts := reports.Options{Today: tbToday}

			now := runTB(t, b.app, b.reader, map[string]any{"asOf": tbToday, "rows": "active"}, opts)
			rows := accountRows(now)
			// Rent's only line is in the previous year: it has no row of its own.
			if got := accountIDs(t, rows); !reflect.DeepEqual(got, idsOf(checking, ownerEquity, retained, draws, income)) {
				t.Fatalf("rows = %v, want Checking, Owner's equity, Retained earnings, Owner draws, Consulting Income", labelsOf(rows))
			}
			// 300.00 income credit less 100.00 expense debit.
			requireSplit(t, rowFor(t, now, retained), nil, int64(20000))
			// Only the boundary day's line: it belongs to the new year.
			requireSplit(t, rowFor(t, now, income), nil, int64(5000))
			requireSplit(t, rowFor(t, now, checking), int64(105000), nil)

			before := runTB(t, b.app, b.reader, map[string]any{"asOf": c.lastPriorDay, "rows": "active"}, opts)
			requireSplit(t, rowFor(t, before, income), nil, int64(30000))
			requireSplit(t, rowFor(t, before, rent), int64(10000), nil)
			if hasRowFor(t, before, retained) {
				t.Errorf("as of %s the retained-earnings row holds a prior amount: %+v", c.lastPriorDay, rowFor(t, before, retained).Cells)
			}
		})
	}
}

func TestTrialBalanceDraftsAndVoids(t *testing.T) {
	b := newTBBook(t)
	checking := b.account(t, "Checking", "1000", "bank", "checking")
	rent := b.account(t, "Rent", "6000", "expense", "rent_lease")
	mkRetainedEarnings(t, b.app, "3900")
	b.post(t, "2026-03-10", ln{rent, 4000, 0}, ln{checking, 0, 4000})
	mkDraft(t, b.app, "2026-03-09", ln{rent, 999, 0}, ln{checking, 0, 999})
	voided := b.post(t, "2026-03-11", ln{rent, 7000, 0}, ln{checking, 0, 7000})
	if err := setStatus(b.app, voided.Id, statusVoid, ""); err != nil {
		t.Fatalf("void: %v", err)
	}
	if reload(t, b.app, "books_journal_entries", voided.Id).GetString("status") != statusVoid {
		t.Fatal("the entry was not voided")
	}

	res := runTB(t, b.app, b.reader, map[string]any{"asOf": tbToday}, reports.Options{Today: tbToday})
	requireSplit(t, rowFor(t, res, rent), int64(4000), nil)
	requireSplit(t, rowFor(t, res, checking), nil, int64(4000))
}

func TestTrialBalanceTotals(t *testing.T) {
	b := newTBBook(t)
	checking := b.account(t, "Checking", "1000", "bank", "checking")
	visa := b.account(t, "Visa", "2100", "credit_card", "credit_card")
	software := b.account(t, "Software", "6100", "expense", "dues_subscriptions")
	rent := b.account(t, "Rent", "6200", "expense", "rent_lease")
	zeroed := b.account(t, "Zeroed", "6300", "expense", "office_general")
	mkRetainedEarnings(t, b.app, "3900")
	b.post(t, "2026-03-10", ln{software, 12345, 0}, ln{visa, 0, 12345})
	b.post(t, "2026-03-11", ln{rent, 50000, 0}, ln{checking, 0, 50000})
	b.post(t, "2026-03-12", ln{zeroed, 8000, 0}, ln{checking, 0, 8000})
	b.post(t, "2026-03-13", ln{checking, 8000, 0}, ln{zeroed, 0, 8000})
	opts := reports.Options{Today: tbToday}

	nonzero := runTB(t, b.app, b.reader, map[string]any{"asOf": tbToday}, opts)
	if hasRowFor(t, nonzero, zeroed) {
		t.Fatal("Non-zero shows the account that nets to zero")
	}
	var debits, credits int64
	for _, r := range accountRows(nonzero) {
		d, _ := moneyCell(t, r, "debit")
		c, _ := moneyCell(t, r, "credit")
		debits += d
		credits += c
	}
	total := totalOf(t, nonzero)
	if total.Label != "Total" {
		t.Errorf("total label = %q", total.Label)
	}
	if total.Cells["debit"] != debits || total.Cells["credit"] != credits || debits != credits {
		t.Errorf("total debit %#v, credit %#v; rows add to debit %d, credit %d (equal)", total.Cells["debit"], total.Cells["credit"], debits, credits)
	}
	requireSplit(t, total, int64(62345), int64(62345))

	active := runTB(t, b.app, b.reader, map[string]any{"asOf": tbToday, "rows": "active"}, opts)
	if !hasRowFor(t, active, zeroed) {
		t.Fatal("Active hides the account that nets to zero")
	}
	requireSplit(t, totalOf(t, active), int64(62345), int64(62345))
}

func TestTrialBalanceHeadingAndLabels(t *testing.T) {
	b := newTBBook(t)
	saveSettings(t, b.app, map[string]any{"business_name": "Harbor Lane Design LLC"})
	checking := b.account(t, "Checking", "1000", "bank", "checking")
	software := b.account(t, "Software", "6100", "expense", "dues_subscriptions")
	design := mkSubAccount(t, b.app, "Design tools", software)
	mkRetainedEarnings(t, b.app, "3900")
	march := b.postMemo(t, "2026-03-10", "March tools",
		memoLine{account: design, debit: 12345, memo: "Figma seats"},
		memoLine{account: checking, credit: 12345})
	april := b.postMemo(t, "2026-04-02", "Refund from vendor",
		memoLine{account: checking, debit: 500},
		memoLine{account: design, credit: 500})
	opts := reports.Options{Today: tbToday}

	res := runTB(t, b.app, b.reader, map[string]any{"asOf": tbToday}, opts)
	if res.Heading != "Harbor Lane Design LLC" {
		t.Errorf("heading = %q, want the Books business name", res.Heading)
	}
	row := rowFor(t, res, design)
	if row.Label != "Software:Design tools" {
		t.Errorf("sub-account label = %q, want its full name Software:Design tools", row.Label)
	}
	if got := rowFor(t, res, checking).Label; got != "Checking" {
		t.Errorf("label = %q, want Checking", got)
	}

	opts.Expand = [][]any{row.GroupKey}
	open := runTB(t, b.app, b.reader, map[string]any{"asOf": tbToday}, opts)
	opened := rowFor(t, open, design)
	details := map[string]reports.Row{}
	for _, r := range open.Rows {
		if r.Kind == reports.KindDetail && r.Section == opened.ID {
			details[r.Label] = r
		}
	}
	figma := "2026-03-10 · " + march.GetString("number") + " · Figma seats"
	refund := "2026-04-02 · " + april.GetString("number") + " · Refund from vendor"
	if len(details) != 2 {
		t.Fatalf("opened lines = %v, want %q and %q", slices.Collect(maps.Keys(details)), figma, refund)
	}
	figmaRow, ok := details[figma]
	if !ok {
		t.Fatalf("no opened line labelled %q", figma)
	}
	requireSplit(t, figmaRow, int64(12345), nil)
	// The line has no memo, so its label reads the entry's.
	refundRow, ok := details[refund]
	if !ok {
		t.Fatalf("no opened line labelled %q", refund)
	}
	requireSplit(t, refundRow, nil, int64(500))
}

// Every collection the run reads is a topic, so a post, a void, an account
// edit or a settings change re-runs the open report. The opened account's
// lines read their entries (the detail label), so the run opens one.
func TestTrialBalanceTopics(t *testing.T) {
	b := newTBBook(t)
	checking := b.account(t, "Checking", "1000", "bank", "checking")
	rent := b.account(t, "Rent", "6000", "expense", "rent_lease")
	mkRetainedEarnings(t, b.app, "3900")
	b.post(t, "2026-03-10", ln{rent, 4000, 0}, ln{checking, 0, 4000})
	opts := reports.Options{Today: tbToday}
	first := runTB(t, b.app, b.reader, map[string]any{"asOf": tbToday}, opts)
	opts.Expand = [][]any{rowFor(t, first, rent).GroupKey}

	res := runTB(t, b.app, b.reader, map[string]any{"asOf": tbToday}, opts)
	for _, topic := range []string{
		"collection/books_journal_lines", "collection/books_accounts",
		"collection/books_journal_entries", "collection/books_settings",
	} {
		if !slices.Contains(res.Topics, topic) {
			t.Errorf("topics = %v, want %s", res.Topics, topic)
		}
	}
}

func TestTrialBalanceNoAccess(t *testing.T) {
	b := newTBBook(t)
	outsider := mkUser(t, b.app, "member")
	setPkgAccess(t, b.app, outsider, "none")
	checking := b.account(t, "Checking", "1000", "bank", "checking")
	rent := b.account(t, "Rent", "6000", "expense", "rent_lease")
	retained := mkRetainedEarnings(t, b.app, "3900")
	b.post(t, "2026-03-10", ln{rent, 4000, 0}, ln{checking, 0, 4000})
	opts := reports.Options{Today: tbToday}
	all := map[string]any{"asOf": tbToday, "rows": "all"}

	if got := accountIDs(t, accountRows(runTB(t, b.app, b.reader, all, opts))); !sameAccounts(got, idsOf(checking, rent, retained)) {
		t.Fatalf("a Books reader sees accounts %v, want Checking, Rent, Retained earnings", got)
	}
	for name, params := range map[string]map[string]any{"Non-zero": {"asOf": tbToday}, "All": all} {
		if rows := accountRows(runTB(t, b.app, outsider, params, opts)); len(rows) != 0 {
			t.Errorf("Rows %s: a user with Books level none sees %v", name, labelsOf(rows))
		}
	}
}

// Register ships the Trial Balance; core creates it unpublished, owned by the
// first admin, and Books shares it.
func TestTrialBalanceShippedUnpublished(t *testing.T) {
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	app, _ := newRegisteredApp(t)
	owner := mkUser(t, app, "owner")
	if err := reports.ReconcileShipped(app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": "books.trial_balance"})
	if err != nil {
		t.Fatalf("no reports row with shipped_key books.trial_balance: %v", err)
	}
	if row.GetString("owner") != owner.Id {
		t.Errorf("owner = %q, want the first admin %q", row.GetString("owner"), owner.Id)
	}
	if row.GetBool("published") || row.GetString("published_by") != "" {
		t.Errorf("published = %v (by %q), want unpublished", row.GetBool("published"), row.GetString("published_by"))
	}
	if row.GetString("title") != "Trial Balance" || row.GetInt("shipped_revision") != 1 || row.GetString("source") != "books.journal_lines" {
		t.Errorf("row = %v", row.PublicExport())
	}
}
