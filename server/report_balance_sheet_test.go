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

// bsToday is the reader's day (and the As of day) in most runs; bsPrior is the
// same day twelve months earlier, the Prior year column's day.
const (
	bsToday = "2026-11-04"
	bsPrior = "2025-11-04"
)

// runBSErr loads the shipped Balance Sheet and runs it as reader, as core's run
// endpoint does: Load, then Run with the posted params.
func runBSErr(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) (*reports.Result, error) {
	t.Helper()
	spec, info, err := reports.Load(balanceSheetShipped().Spec)
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

func runBS(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	res, err := runBSErr(t, app, reader, params, opts)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// bsBook is a ledger with every hook bound (newLedgerEnv, whose Checking,
// Consulting Income and Rent accounts have no lines unless a test posts to
// them), Books' report sources, and its Books read-only reader.
type bsBook struct {
	tbBook
	env *ledgerEnv
}

func newBSBook(t *testing.T) bsBook {
	t.Helper()
	env := newLedgerEnv(t)
	registerBooksSources(t)
	return bsBook{tbBook: tbBook{app: env.app, reader: env.users.readOnly}, env: env}
}

func (b bsBook) fiscalStart(t *testing.T, month int) {
	t.Helper()
	saveSettings(t, b.app, map[string]any{"fiscal_year_start_month": month})
}

// runAt runs the Balance Sheet as the reader as of day (also the reader's
// today), with the given Rows choice ("" for the default).
func (b bsBook) runAt(t *testing.T, day, rows string) *reports.Result {
	t.Helper()
	params := map[string]any{"asOf": day}
	if rows != "" {
		params["rows"] = rows
	}
	return runBS(t, b.app, b.reader, params, reports.Options{Today: day})
}

func (b bsBook) void(t *testing.T, entry *core.Record) {
	t.Helper()
	if err := setStatus(b.app, entry.Id, statusVoid, ""); err != nil {
		t.Fatalf("void %s: %v", entry.Id, err)
	}
	if reload(t, b.app, "books_journal_entries", entry.Id).GetString("status") != statusVoid {
		t.Fatalf("entry %s was not voided", entry.Id)
	}
}

// subAccount saves a sub-account of parent with a number.
func (b bsBook) subAccount(t *testing.T, name, number string, parent *core.Record) *core.Record {
	t.Helper()
	sub := mkSubAccount(t, b.app, name, parent)
	sub.Set("number", number)
	saveOrFail(t, b.app, sub)
	return reload(t, b.app, "books_accounts", sub.Id)
}

func bsLabels(res *reports.Result) []string {
	out := make([]string, len(res.Rows))
	for i, r := range res.Rows {
		out[i] = r.Label
	}
	return out
}

func bsHas(res *reports.Result, label string) bool {
	return slices.Contains(bsLabels(res), label)
}

// bsRow is the one row labelled label; none, or more than one, fails the test.
func bsRow(t *testing.T, res *reports.Result, label string) reports.Row {
	t.Helper()
	var found []reports.Row
	for _, r := range res.Rows {
		if r.Label == label {
			found = append(found, r)
		}
	}
	if len(found) != 1 {
		t.Fatalf("%d rows labelled %q, want one; rows %q", len(found), label, bsLabels(res))
	}
	return found[0]
}

// bsAccountRows are the account rows: group rows of the fourth level
// (byAccount), whatever depth a skipped level leaves them at.
func bsAccountRows(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup && r.Level == 4 {
			out = append(out, r)
		}
	}
	return out
}

func bsFindAccount(res *reports.Result, account *core.Record) (reports.Row, bool) {
	for _, r := range bsAccountRows(res) {
		if slices.Contains(r.GroupKey, any(account.Id)) {
			return r, true
		}
	}
	return reports.Row{}, false
}

func bsAccount(t *testing.T, res *reports.Result, account *core.Record) reports.Row {
	t.Helper()
	r, ok := bsFindAccount(res, account)
	if !ok {
		t.Fatalf("no account row for %s; rows %q", account.GetString("full_name"), bsLabels(res))
	}
	return r
}

func bsHasAccount(res *reports.Result, account *core.Record) bool {
	_, ok := bsFindAccount(res, account)
	return ok
}

// amt is a row's amount in a figure column: it must hold one.
func amt(t *testing.T, r reports.Row, col string) int64 {
	t.Helper()
	v, ok := moneyCell(t, r, col)
	if !ok {
		t.Fatalf("%s (%s) has a blank %s, want an amount", r.Label, r.Kind, col)
	}
	return v
}

// pctCell reads a % change cell: ok false for an empty cell.
func pctCell(t *testing.T, r reports.Row) (float64, bool) {
	t.Helper()
	switch v := r.Cells["pct"].(type) {
	case nil:
		return 0, false
	case float64:
		return v, true
	case int64:
		return float64(v), true
	default:
		t.Fatalf("%s (%s) pct = %#v, a %T; want a number", r.Label, r.Kind, v, v)
		return 0, false
	}
}

// requireChangeAndPct checks a row's Change and % change against its own
// Current and Prior year: Change = Current − Prior year; % change = Change ÷
// |Prior year| × 100 at two decimals (div at scale 4, then × 100), empty where
// Prior year is 0.
func requireChangeAndPct(t *testing.T, r reports.Row) {
	t.Helper()
	cur, pri, chg := amt(t, r, "current"), amt(t, r, "prior"), amt(t, r, "change")
	if chg != cur-pri {
		t.Errorf("%s: change %d, want current %d − prior %d = %d", r.Label, chg, cur, pri, cur-pri)
	}
	got, ok := pctCell(t, r)
	if pri == 0 {
		if ok {
			t.Errorf("%s: %% change %v on a zero prior, want empty", r.Label, got)
		}
		return
	}
	if !ok {
		t.Errorf("%s: %% change empty, want %d ÷ |%d| × 100", r.Label, chg, pri)
		return
	}
	want := float64(chg) / math.Abs(float64(pri)) * 100
	if math.Abs(got-want) > 0.01 {
		t.Errorf("%s: %% change %v, want %.4f (change %d ÷ |prior %d| × 100)", r.Label, got, want, chg, pri)
	}
	if math.Abs(got*100-math.Round(got*100)) > 1e-6 {
		t.Errorf("%s: %% change %v has more than two decimals (div at scale 4, then × 100)", r.Label, got)
	}
}

func requireFigures(t *testing.T, r reports.Row, current, prior int64) {
	t.Helper()
	if c, p := amt(t, r, "current"), amt(t, r, "prior"); c != current || p != prior {
		t.Errorf("%s: current %d, prior %d; want current %d, prior %d", r.Label, c, p, current, prior)
	}
}

func TestBalanceSheetSpecLoads(t *testing.T) {
	app := newBooksApp(t)
	registerBooksSources(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	shipped := balanceSheetShipped()
	if balanceSheetKey != "books.balance_sheet" || shipped.Key != balanceSheetKey {
		t.Errorf("key = %q (const %q), want books.balance_sheet", shipped.Key, balanceSheetKey)
	}
	if shipped.Title != "Balance Sheet" {
		t.Errorf("title = %q, want Balance Sheet", shipped.Title)
	}
	if shipped.Description != "What the business owns and owes on one day, beside the same day a year earlier." {
		t.Errorf("description = %q", shipped.Description)
	}
	if shipped.Revision != 1 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	built, err := json.Marshal(balanceSheetSpec())
	if err != nil {
		t.Fatal(err)
	}
	if !jsonEqual(t, shipped.Spec, string(built)) {
		t.Errorf("the shipped spec is not balanceSheetSpec()")
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
		t.Fatalf("Validate: %v", err)
	}

	paramIDs := make([]string, len(spec.Params))
	for i, p := range spec.Params {
		paramIDs[i] = p.ID
	}
	if !reflect.DeepEqual(paramIDs, []string{"asOf", "rows"}) {
		t.Fatalf("params = %v, want asOf, rows (the chips' order)", paramIDs)
	}
	asOf := paramOf(t, spec, "asOf")
	if asOf.Type != reports.ParamAsOf || asOf.Label != "As of" || !jsonEqual(t, asOf.Default, `{"preset":"today"}`) {
		t.Errorf("asOf = %+v (default %s), want type asOf, label As of, default Today", asOf, asOf.Default)
	}
	rows := paramOf(t, spec, "rows")
	wantRows := []reports.Option{{Value: "nonzero", Label: "Non-zero"}, {Value: "active", Label: "Active"}}
	if rows.Type != reports.ParamChoice || rows.Label != "Rows" || rows.Multiple ||
		!reflect.DeepEqual(rows.Options, wantRows) || !jsonEqual(t, rows.Default, `"nonzero"`) {
		t.Errorf("rows = %+v (default %s), want a single choice Non-zero (default) / Active", rows, rows.Default)
	}

	colIDs := make([]string, len(spec.Columns))
	cols := map[string]reports.Column{}
	for i, c := range spec.Columns {
		colIDs[i] = c.ID
		cols[c.ID] = c
	}
	if !reflect.DeepEqual(colIDs, []string{"account", "current", "prior", "change", "pct", "side", "cls", "knd"}) {
		t.Fatalf("columns = %v, want account, current, prior, change, pct, side, cls, knd", colIDs)
	}
	for _, id := range []string{"side", "cls", "knd"} {
		if !cols[id].Hidden {
			t.Errorf("column %s is not hidden: a group key column is never shown", id)
		}
	}
	for _, id := range []string{"account", "current", "prior", "change", "pct"} {
		if cols[id].Hidden {
			t.Errorf("column %s is hidden", id)
		}
	}
	if got := cols["current"].Heading; got == nil || !jsonEqual(t, mustJSON(got), string(mustJSON(prm("asOf")))) {
		t.Errorf("current heading = %s, want the As of day", mustJSON(got))
	}
	if got := cols["prior"].Heading; got == nil || !jsonEqual(t, mustJSON(got), string(mustJSON(op("addMonths", prm("asOf"), lit(-12))))) {
		t.Errorf("prior heading = %s, want the As of day twelve months earlier", mustJSON(got))
	}
	if cols["pct"].Format != "percent" {
		t.Errorf("pct format = %q, want percent", cols["pct"].Format)
	}

	type groupShape struct {
		ID        string
		Open      bool
		Blank     string
		HideEmpty bool
	}
	gotGroups := make([]groupShape, len(spec.Groups))
	for i, g := range spec.Groups {
		gotGroups[i] = groupShape{g.ID, g.Open, g.Blank, g.HideEmpty}
	}
	wantGroups := []groupShape{
		{ID: "section", Open: true},
		{ID: "class", Open: true, Blank: "skip", HideEmpty: true},
		{ID: "kind", Open: true, Blank: "skip", HideEmpty: true},
		// An account opens into its lines only on a press (Q8).
		{ID: "byAccount", Open: false},
	}
	if !reflect.DeepEqual(gotGroups, wantGroups) {
		t.Errorf("groups = %+v\nwant %+v", gotGroups, wantGroups)
	}

	type layoutShape struct{ Section, Row, Within string }
	gotLayout := make([]layoutShape, len(spec.Layout))
	for i, l := range spec.Layout {
		gotLayout[i] = layoutShape{l.Section, l.Row, l.Within}
	}
	wantLayout := []layoutShape{
		{Section: "assets"}, {Section: "liabilities"}, {Section: "equity"},
		{Row: "retainedEarnings", Within: "equity"},
		{Row: "netIncome", Within: "equity"},
		{Row: "totalLE"},
	}
	if !reflect.DeepEqual(gotLayout, wantLayout) {
		t.Errorf("layout = %+v\nwant %+v", gotLayout, wantLayout)
	}
}

func TestBalanceSheetPlacementCoversTypes(t *testing.T) {
	// Spec §5's class/kind table, written out.
	want := map[string]placement{
		"bank":                    {ClassRank: 1, Class: "Current assets", KindRank: 1, Kind: "Bank accounts"},
		"accounts_receivable":     {ClassRank: 1, Class: "Current assets", KindRank: 2, Kind: "Accounts receivable"},
		"other_current_asset":     {ClassRank: 1, Class: "Current assets", KindRank: 3, Kind: "Other current assets"},
		"fixed_asset":             {ClassRank: 2, Class: "Fixed assets"},
		"other_asset":             {ClassRank: 3, Class: "Other assets"},
		"accounts_payable":        {ClassRank: 4, Class: "Current liabilities", KindRank: 4, Kind: "Accounts payable"},
		"credit_card":             {ClassRank: 4, Class: "Current liabilities", KindRank: 5, Kind: "Credit cards"},
		"other_current_liability": {ClassRank: 4, Class: "Current liabilities", KindRank: 6, Kind: "Other current liabilities"},
		"long_term_liability":     {ClassRank: 5, Class: "Long-term liabilities"},
		"equity":                  {},
	}
	var balanceTypes []string
	for _, at := range accountTypes {
		switch at.Group {
		case "asset", "liability", "equity":
			balanceTypes = append(balanceTypes, at.Key)
			if _, ok := balanceSheetPlacement[at.Key]; !ok {
				t.Errorf("balance-sheet type %s (group %s) has no placement", at.Key, at.Group)
			}
		default:
			if _, ok := balanceSheetPlacement[at.Key]; ok {
				t.Errorf("type %s (group %s) is not a balance-sheet type but has a placement", at.Key, at.Group)
			}
		}
	}
	for key := range balanceSheetPlacement {
		if !slices.Contains(balanceTypes, key) {
			t.Errorf("placement for %q, which is not an asset, liability or equity type of account_types.json", key)
		}
	}
	if !reflect.DeepEqual(balanceSheetPlacement, want) {
		t.Errorf("placement = %+v\nwant (spec §5) %+v", balanceSheetPlacement, want)
	}
	byGroup := slices.Concat(typesInGroup("asset"), typesInGroup("liability"), typesInGroup("equity"))
	if !reflect.DeepEqual(byGroup, balanceTypes) {
		t.Errorf("typesInGroup asset+liability+equity = %v, want %v (account_types.json order)", byGroup, balanceTypes)
	}
}

type bsShape struct {
	Label string
	Kind  string
	Depth int
}

func bsShapes(res *reports.Result) []bsShape {
	out := make([]bsShape, len(res.Rows))
	for i, r := range res.Rows {
		out[i] = bsShape{r.Label, r.Kind, r.Depth}
	}
	return out
}

func TestBalanceSheetOutline(t *testing.T) {
	t.Run("a ledger with every class and type", func(t *testing.T) {
		b := newBSBook(t)
		zeta := b.account(t, "Zeta checking", "1000", "bank", "checking")
		payroll := b.subAccount(t, "Payroll", "1001", zeta)
		alpha := b.account(t, "Alpha savings", "1010", "bank", "savings")
		invoices := b.account(t, "Customer invoices", "1100", "accounts_receivable", "accounts_receivable")
		prepaid := b.account(t, "Prepaid rent", "", "other_current_asset", "prepaid_expenses")
		advance := b.account(t, "Employee advance", "", "other_current_asset", "employee_advances")
		equipment := b.account(t, "Equipment", "1500", "fixed_asset", "machinery_equipment")
		deposit := b.account(t, "Security deposit", "1800", "other_asset", "security_deposits")
		bills := b.account(t, "Vendor bills", "2000", "accounts_payable", "accounts_payable")
		visa := b.account(t, "Visa", "2100", "credit_card", "credit_card")
		salesTax := b.account(t, "Sales tax payable", "2200", "other_current_liability", "sales_tax_payable")
		loan := b.account(t, "Bank loan", "2700", "long_term_liability", "notes_payable")
		owner := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
		partner := b.account(t, "Partner contributions", "3010", "equity", "partner_contributions")
		mkRetainedEarnings(t, b.app, "3900")
		const day = "2026-03-10"
		b.post(t, day, ln{zeta, 10000, 0}, ln{owner, 0, 10000})
		b.post(t, day, ln{payroll, 2000, 0}, ln{owner, 0, 2000})
		b.post(t, day, ln{alpha, 3000, 0}, ln{partner, 0, 3000})
		b.post(t, day, ln{invoices, 4000, 0}, ln{b.env.revenue, 0, 4000})
		b.post(t, day, ln{prepaid, 500, 0}, ln{bills, 0, 500})
		b.post(t, day, ln{advance, 600, 0}, ln{visa, 0, 600})
		b.post(t, day, ln{equipment, 7000, 0}, ln{loan, 0, 7000})
		b.post(t, day, ln{deposit, 800, 0}, ln{salesTax, 0, 800})

		res := b.runAt(t, bsToday, "")
		g, s, c := reports.KindGroup, reports.KindSubtotal, reports.KindComputed
		want := []bsShape{
			{"Assets", g, 0},
			{"Current assets", g, 1},
			{"Bank accounts", g, 2},
			// Inside a type: number, then full name; a sub-account is flat
			// by its full name.
			{"1000 Zeta checking", g, 3},
			{"1001 Zeta checking:Payroll", g, 3},
			{"1010 Alpha savings", g, 3},
			{"Total Bank accounts", s, 2},
			{"Accounts receivable", g, 2},
			{"1100 Customer invoices", g, 3},
			{"Total Accounts receivable", s, 2},
			{"Other current assets", g, 2},
			// No number: the full name alone, and full-name order.
			{"Employee advance", g, 3},
			{"Prepaid rent", g, 3},
			{"Total Other current assets", s, 2},
			{"Total Current assets", s, 1},
			{"Fixed assets", g, 1},
			// The kind level is skipped: the account sits directly under its class.
			{"1500 Equipment", g, 2},
			{"Total Fixed assets", s, 1},
			{"Other assets", g, 1},
			{"1800 Security deposit", g, 2},
			{"Total Other assets", s, 1},
			{"Total Assets", s, 0},
			{"Liabilities", g, 0},
			{"Current liabilities", g, 1},
			{"Accounts payable", g, 2},
			{"2000 Vendor bills", g, 3},
			{"Total Accounts payable", s, 2},
			{"Credit cards", g, 2},
			{"2100 Visa", g, 3},
			{"Total Credit cards", s, 2},
			{"Other current liabilities", g, 2},
			{"2200 Sales tax payable", g, 3},
			{"Total Other current liabilities", s, 2},
			{"Total Current liabilities", s, 1},
			{"Long-term liabilities", g, 1},
			{"2700 Bank loan", g, 2},
			{"Total Long-term liabilities", s, 1},
			{"Total Liabilities", s, 0},
			{"Equity", g, 0},
			// No class and no type: equity accounts sit directly under Equity.
			{"3000 Owner's equity", g, 1},
			{"3010 Partner contributions", g, 1},
			{"Retained earnings", c, 1},
			{"Net income", c, 1},
			{"Total Equity", s, 0},
			{"Total liabilities and equity", c, 0},
		}
		if got := bsShapes(res); !reflect.DeepEqual(got, want) {
			t.Fatalf("rows (label, kind, depth) =\n%v\nwant\n%v", got, want)
		}
		requireFigures(t, bsAccount(t, res, zeta), 10000, 0)
		requireFigures(t, bsAccount(t, res, payroll), 2000, 0)
		requireFigures(t, bsAccount(t, res, equipment), 7000, 0)
		requireFigures(t, bsRow(t, res, "Total Bank accounts"), 15000, 0)
		requireFigures(t, bsRow(t, res, "Total Current assets"), 20100, 0)
		requireFigures(t, bsRow(t, res, "Total Assets"), 27900, 0)
	})

	t.Run("a book with no posted line", func(t *testing.T) {
		b := newBSBook(t)
		mkRetainedEarnings(t, b.app, "3900")
		res := b.runAt(t, bsToday, "")
		want := []string{
			"Assets", "Total Assets", "Liabilities", "Total Liabilities",
			"Equity", "Retained earnings", "Net income", "Total Equity", "Total liabilities and equity",
		}
		if got := bsLabels(res); !reflect.DeepEqual(got, want) {
			t.Fatalf("rows = %q, want the three sections, Retained earnings, Net income and Total liabilities and equity: %q", got, want)
		}
		for _, label := range []string{"Total Assets", "Total Liabilities", "Retained earnings", "Net income", "Total Equity", "Total liabilities and equity"} {
			requireFigures(t, bsRow(t, res, label), 0, 0)
		}
	})
}

func TestBalanceSheetSigns(t *testing.T) {
	b := newBSBook(t)
	checking := b.account(t, "Checking A", "1000", "bank", "checking")
	cash := b.account(t, "Cash box", "1020", "bank", "cash_on_hand")
	prepaid := b.account(t, "Prepaid", "1300", "other_current_asset", "prepaid_expenses")
	equipment := b.account(t, "Equipment", "1500", "fixed_asset", "machinery_equipment")
	accumulated := b.account(t, "Accumulated depreciation", "1590", "fixed_asset", "accumulated_depreciation")
	visa := b.account(t, "Visa", "2100", "credit_card", "credit_card")
	owner := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	draws := b.account(t, "Owner draws", "3100", "equity", "owner_draws")
	mkRetainedEarnings(t, b.app, "3900")
	b.post(t, "2026-03-01", ln{checking, 10000, 0}, ln{owner, 0, 10000})
	b.post(t, "2026-03-02", ln{prepaid, 4000, 0}, ln{visa, 0, 4000})
	b.post(t, "2026-03-03", ln{equipment, 1500, 0}, ln{accumulated, 0, 1500})
	b.post(t, "2026-03-04", ln{cash, 5000, 0}, ln{owner, 0, 5000})
	b.post(t, "2026-03-05", ln{draws, 2500, 0}, ln{cash, 0, 2500})
	// The day after the As of day: not in Current.
	b.post(t, "2026-11-05", ln{checking, 999, 0}, ln{owner, 0, 999})

	res := b.runAt(t, bsToday, "")
	cases := []struct {
		name    string
		account *core.Record
		want    int64
	}{
		{"an asset debited", checking, 10000},
		{"a liability credited", visa, 4000},
		{"a contra asset (Accumulated depreciation) credited", accumulated, -1500},
		{"an equity contra (Owner draws) debited", draws, -2500},
		{"a fixed asset debited", equipment, 1500},
	}
	for _, c := range cases {
		if got := amt(t, bsAccount(t, res, c.account), "current"); got != c.want {
			t.Errorf("%s: current %d, want %d", c.name, got, c.want)
		}
	}
}

// bsBalanceLedger posts asset, liability, equity, income, expense and
// retained-earnings lines on both sides of the prior-year day (2025-11-04) and
// of the fiscal-year starts for months 1 and 7, plus a line after the As of day.
func bsBalanceLedger(t *testing.T, b bsBook) {
	t.Helper()
	bank := b.account(t, "Operating checking", "1000", "bank", "checking")
	receivable := b.account(t, "Customer invoices", "1100", "accounts_receivable", "accounts_receivable")
	equipment := b.account(t, "Equipment", "1500", "fixed_asset", "machinery_equipment")
	visa := b.account(t, "Visa", "2100", "credit_card", "credit_card")
	loan := b.account(t, "Bank loan", "2700", "long_term_liability", "notes_payable")
	owner := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	draws := b.account(t, "Owner draws", "3100", "equity", "owner_draws")
	retained := mkRetainedEarnings(t, b.app, "3900")
	income := b.account(t, "Service income", "4000", "income", "service_income")
	rent := b.account(t, "Office rent", "6000", "expense", "rent_lease")
	days := []string{
		"2024-12-20", "2025-03-01", "2025-06-30", "2025-07-01", "2025-08-01", "2025-11-04", "2025-11-05",
		"2025-12-31", "2026-01-01", "2026-06-30", "2026-07-01", "2026-09-15", "2026-11-04", "2026-11-05",
	}
	for i, day := range days {
		n := 1000 + 137*i
		b.post(t, day, ln{bank, n, 0}, ln{income, 0, n})
		b.post(t, day, ln{rent, n / 3, 0}, ln{visa, 0, n / 3})
		b.post(t, day, ln{receivable, n / 2, 0}, ln{income, 0, n / 2})
		b.post(t, day, ln{bank, 2 * n, 0}, ln{owner, 0, 2 * n})
		b.post(t, day, ln{equipment, n + 11, 0}, ln{loan, 0, n + 11})
		b.post(t, day, ln{draws, n / 4, 0}, ln{bank, 0, n / 4})
		b.post(t, day, ln{retained, n / 5, 0}, ln{bank, 0, n / 5})
	}
}

func TestBalanceSheetBalances(t *testing.T) {
	for _, month := range []int{1, 7} {
		t.Run(fmt.Sprintf("fiscal year from month %d", month), func(t *testing.T) {
			b := newBSBook(t)
			b.fiscalStart(t, month)
			bsBalanceLedger(t, b)
			res := b.runAt(t, bsToday, "")
			assets := bsRow(t, res, "Total Assets")
			liabilities := bsRow(t, res, "Total Liabilities")
			equity := bsRow(t, res, "Total Equity")
			total := bsRow(t, res, "Total liabilities and equity")
			for _, col := range []string{"current", "prior"} {
				a := amt(t, assets, col)
				if a == 0 {
					t.Fatalf("Total Assets %s is 0: the ledger must give both columns figures", col)
				}
				if le := amt(t, total, col); a != le {
					t.Errorf("%s: Total Assets %d ≠ Total liabilities and equity %d", col, a, le)
				}
				if l, e, le := amt(t, liabilities, col), amt(t, equity, col), amt(t, total, col); le != l+e {
					t.Errorf("%s: Total liabilities and equity %d ≠ Total Liabilities %d + Total Equity %d", col, le, l, e)
				}
			}
		})
	}
}

// Fiscal years by start month around D = 2028-02-29 and D′ = 2027-02-28
// (Feb 29 → Feb 28). Signed P&L lines (credits − debits): L1 2026-03-15
// +10000, L2 2026-09-10 −3000, L3 2027-02-28 +2000, L4 2027-03-01 +700,
// L5 2027-08-01 −400, L6 2028-01-15 +5000, L7 2028-02-29 −100, L8 2028-03-01
// +9999 (after D). Retained-earnings account: R1 2026-05-01 +1500, R2
// 2027-12-01 −600.
func TestBalanceSheetRetainedEarningsAndNetIncome(t *testing.T) {
	const day = "2028-02-29"
	cases := []struct {
		month                  int
		reCur, niCur           int64
		rePri, niPri           int64
		currentYear, priorYear string
	}{
		// FY of D from 2028-01-01, of D′ from 2027-01-01.
		// RE(D) = R1 + R2 + L1..L5 = 900 + 9300; NI(D) = L6 + L7.
		// RE(D′) = R1 + L1 + L2 = 1500 + 7000; NI(D′) = L3 (not L4: after D′).
		{month: 1, reCur: 10200, niCur: 4900, rePri: 8500, niPri: 2000},
		// FY of D from 2027-07-01, of D′ from 2026-07-01.
		// RE(D) = 900 + L1..L4 = 900 + 9700; NI(D) = L5 + L6 + L7.
		// RE(D′) = R1 + L1; NI(D′) = L2 + L3.
		{month: 7, reCur: 10600, niCur: 4500, rePri: 11500, niPri: -1000},
	}
	for _, c := range cases {
		t.Run(fmt.Sprintf("fiscal year from month %d", c.month), func(t *testing.T) {
			b := newBSBook(t)
			b.fiscalStart(t, c.month)
			bank := b.account(t, "Operating checking", "1000", "bank", "checking")
			february := b.account(t, "February bank", "1010", "bank", "savings")
			income := b.account(t, "Service income", "4000", "income", "service_income")
			rent := b.account(t, "Office rent", "6000", "expense", "rent_lease")
			retained := mkRetainedEarnings(t, b.app, "3900")
			b.post(t, "2026-03-15", ln{bank, 10000, 0}, ln{income, 0, 10000})
			b.post(t, "2026-09-10", ln{rent, 3000, 0}, ln{bank, 0, 3000})
			b.post(t, "2027-02-28", ln{february, 2000, 0}, ln{income, 0, 2000})
			b.post(t, "2027-03-01", ln{february, 700, 0}, ln{income, 0, 700})
			b.post(t, "2027-08-01", ln{rent, 400, 0}, ln{bank, 0, 400})
			b.post(t, "2028-01-15", ln{bank, 5000, 0}, ln{income, 0, 5000})
			b.post(t, "2028-02-29", ln{rent, 100, 0}, ln{bank, 0, 100})
			b.post(t, "2028-03-01", ln{bank, 9999, 0}, ln{income, 0, 9999})
			b.post(t, "2026-05-01", ln{bank, 1500, 0}, ln{retained, 0, 1500})
			b.post(t, "2027-12-01", ln{retained, 600, 0}, ln{bank, 0, 600})

			res := b.runAt(t, day, "active")
			requireFigures(t, bsRow(t, res, "Retained earnings"), c.reCur, c.rePri)
			requireFigures(t, bsRow(t, res, "Net income"), c.niCur, c.niPri)
			// D′ is 2027-02-28: the line on that day counts in Prior year, the
			// one on 2027-03-01 does not.
			requireFigures(t, bsAccount(t, res, february), 2700, 2000)
			for _, a := range []*core.Record{retained, income, rent} {
				if bsHasAccount(res, a) {
					t.Errorf("%s has an account row; its lines are read only by Retained earnings and Net income", a.GetString("full_name"))
				}
			}
			for _, label := range []string{"3900 Retained earnings", "4000 Service income", "6000 Office rent"} {
				if bsHas(res, label) {
					t.Errorf("a row is labelled %q", label)
				}
			}
			if h := headingOf(t, res, "prior"); h == nil || h.Value != "2027-02-28" {
				t.Errorf("prior heading = %+v, want 2027-02-28 (Feb 29 → Feb 28)", h)
			}
		})
	}
}

func headingOf(t *testing.T, res *reports.Result, col string) *reports.ColumnHeading {
	t.Helper()
	for _, c := range res.Columns {
		if c.ID == col {
			return c.Heading
		}
	}
	t.Fatalf("the result has no column %q; columns %+v", col, res.Columns)
	return nil
}

func TestBalanceSheetChangeColumns(t *testing.T) {
	b := newBSBook(t)
	b.fiscalStart(t, 1)
	checkingA := b.account(t, "Checking A", "1000", "bank", "checking")
	checkingB := b.account(t, "Checking B", "1010", "bank", "checking")
	invoices := b.account(t, "Customer invoices", "1100", "accounts_receivable", "accounts_receivable")
	prepaid := b.account(t, "Prepaid", "1300", "other_current_asset", "prepaid_expenses")
	visa := b.account(t, "Visa", "2100", "credit_card", "credit_card")
	owner := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	draws := b.account(t, "Owner draws", "3100", "equity", "owner_draws")
	mkRetainedEarnings(t, b.app, "3900")
	income := b.account(t, "Service income", "4000", "income", "service_income")
	b.post(t, "2025-06-01", ln{checkingA, 10000, 0}, ln{owner, 0, 10000})
	b.post(t, "2026-03-01", ln{checkingA, 2345, 0}, ln{owner, 0, 2345})
	b.post(t, "2025-06-01", ln{checkingB, 50000, 0}, ln{owner, 0, 50000})
	b.post(t, "2025-06-02", ln{draws, 2000, 0}, ln{checkingB, 0, 2000})
	b.post(t, "2026-04-01", ln{draws, 500, 0}, ln{checkingB, 0, 500})
	b.post(t, "2025-08-01", ln{invoices, 3000, 0}, ln{income, 0, 3000})
	b.post(t, "2026-09-01", ln{invoices, 1000, 0}, ln{income, 0, 1000})
	b.post(t, "2026-02-01", ln{prepaid, 700, 0}, ln{visa, 0, 700})

	res := b.runAt(t, bsToday, "")
	rows := []reports.Row{
		bsAccount(t, res, checkingA),
		bsAccount(t, res, draws),
		bsAccount(t, res, visa),
		bsRow(t, res, "Total Bank accounts"),
		bsRow(t, res, "Total Current assets"),
		bsRow(t, res, "Total Assets"),
		bsRow(t, res, "Retained earnings"),
		bsRow(t, res, "Net income"),
		bsRow(t, res, "Total Equity"),
		bsRow(t, res, "Total liabilities and equity"),
	}
	for _, r := range rows {
		requireChangeAndPct(t, r)
	}

	// 2345 ÷ 10000 × 100.
	if got, ok := pctCell(t, bsAccount(t, res, checkingA)); !ok || math.Abs(got-23.45) > 0.005 {
		t.Errorf("Checking A %% change = %v (ok %v), want 23.45", got, ok)
	}
	// A negative prior divides by its absolute value: −500 ÷ |−2000| × 100.
	drawsRow := bsAccount(t, res, draws)
	requireFigures(t, drawsRow, -2500, -2000)
	if got, ok := pctCell(t, drawsRow); !ok || math.Abs(got-(-25)) > 0.005 {
		t.Errorf("Owner draws %% change = %v (ok %v), want -25.00", got, ok)
	}
	if got, ok := pctCell(t, bsAccount(t, res, visa)); ok {
		t.Errorf("Visa %% change = %v on a zero prior, want empty", got)
	}

	// Total Equity adds Retained earnings and Net income; its % change is from
	// its own Current and Prior year, not the sum of the parts' percents.
	re, ni := bsRow(t, res, "Retained earnings"), bsRow(t, res, "Net income")
	requireFigures(t, re, 3000, 0)
	requireFigures(t, ni, 1000, 3000)
	ownerRow := bsAccount(t, res, owner)
	equity := bsRow(t, res, "Total Equity")
	for _, col := range []string{"current", "prior"} {
		want := amt(t, ownerRow, col) + amt(t, drawsRow, col) + amt(t, re, col) + amt(t, ni, col)
		if got := amt(t, equity, col); got != want {
			t.Errorf("Total Equity %s = %d, want owner + draws + Retained earnings + Net income = %d", col, got, want)
		}
	}
	requireFigures(t, equity, 63845, 61000)
	own, _ := pctCell(t, equity)
	var parts float64
	for _, r := range []reports.Row{ownerRow, drawsRow, re, ni} {
		p, _ := pctCell(t, r)
		parts += p
	}
	if math.Abs(own-parts) < 0.01 {
		t.Errorf("Total Equity %% change %v is the sum of its parts' percents %v", own, parts)
	}
}

func TestBalanceSheetRows(t *testing.T) {
	b := newBSBook(t)
	keeper := b.account(t, "Keeper", "1000", "bank", "checking")
	netted := b.account(t, "Netted", "1020", "bank", "checking")
	closedOut := b.account(t, "Closed out", "1030", "bank", "savings")
	draftOnly := b.account(t, "Draft only", "1040", "bank", "checking")
	future := b.account(t, "Future", "1050", "bank", "checking")
	equipment := b.account(t, "Equipment", "1500", "fixed_asset", "machinery_equipment")
	accumulated := b.account(t, "Accumulated depreciation", "1590", "fixed_asset", "accumulated_depreciation")
	deposit := b.account(t, "Security deposit", "1800", "other_asset", "security_deposits")
	bills := b.account(t, "Vendor bills", "2000", "accounts_payable", "accounts_payable")
	visa := b.account(t, "Visa", "2100", "credit_card", "credit_card")
	salesTax := b.account(t, "Sales tax payable", "2200", "other_current_liability", "sales_tax_payable")
	loan := b.account(t, "Bank loan", "2700", "long_term_liability", "notes_payable")
	owner := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	mkRetainedEarnings(t, b.app, "3900")
	b.post(t, "2025-01-10", ln{keeper, 20000, 0}, ln{owner, 0, 20000})
	// Nets to zero on both days.
	b.post(t, "2026-03-01", ln{netted, 5000, 0}, ln{owner, 0, 5000})
	b.post(t, "2026-03-02", ln{owner, 5000, 0}, ln{netted, 0, 5000})
	// Zero on D, not on D′.
	b.post(t, "2025-05-01", ln{closedOut, 3000, 0}, ln{owner, 0, 3000})
	b.post(t, "2026-05-01", ln{owner, 3000, 0}, ln{closedOut, 0, 3000})
	mkDraft(t, b.app, "2026-03-03", ln{draftOnly, 700, 0}, ln{owner, 0, 700})
	b.post(t, "2026-11-10", ln{future, 800, 0}, ln{owner, 0, 800})
	// Each non-zero, together zero: Fixed assets stays.
	b.post(t, "2026-02-01", ln{equipment, 6000, 0}, ln{accumulated, 0, 6000})
	b.post(t, "2026-02-02", ln{owner, 9000, 0}, ln{loan, 0, 9000})
	// Every current liability nets to zero, and the one other asset.
	for i, a := range []*core.Record{bills, visa, salesTax} {
		b.post(t, fmt.Sprintf("2026-03-0%d", 4+i), ln{owner, 1000, 0}, ln{a, 0, 1000})
		b.post(t, fmt.Sprintf("2026-03-1%d", 4+i), ln{a, 1000, 0}, ln{owner, 0, 1000})
	}
	b.post(t, "2026-03-07", ln{deposit, 400, 0}, ln{owner, 0, 400})
	b.post(t, "2026-03-08", ln{owner, 400, 0}, ln{deposit, 0, 400})

	for _, rows := range []string{"", "nonzero"} {
		t.Run("nonzero "+fmt.Sprintf("%q", rows), func(t *testing.T) {
			res := b.runAt(t, bsToday, rows)
			for _, a := range []*core.Record{keeper, closedOut, equipment, accumulated, loan} {
				if !bsHasAccount(res, a) {
					t.Errorf("Non-zero hides %s; rows %q", a.GetString("full_name"), bsLabels(res))
				}
			}
			requireFigures(t, bsAccount(t, res, closedOut), 0, 3000)
			for _, a := range []*core.Record{netted, draftOnly, future, bills, visa, salesTax, deposit} {
				if bsHasAccount(res, a) {
					t.Errorf("Non-zero shows %s", a.GetString("full_name"))
				}
			}
			for _, label := range []string{
				"Accounts payable", "Total Accounts payable", "Credit cards", "Total Credit cards",
				"Other current liabilities", "Total Other current liabilities",
				"Current liabilities", "Total Current liabilities",
				"Other assets", "Total Other assets",
			} {
				if bsHas(res, label) {
					t.Errorf("%q shows, but every account under it is hidden", label)
				}
			}
			requireFigures(t, bsRow(t, res, "Total Fixed assets"), 0, 0)
			requireFigures(t, bsAccount(t, res, equipment), 6000, 0)
			requireFigures(t, bsAccount(t, res, accumulated), -6000, 0)
			// The hidden groups add nothing: Keeper + Closed out + Fixed assets.
			requireFigures(t, bsRow(t, res, "Total Assets"), 20000, 23000)
		})
	}

	t.Run("active", func(t *testing.T) {
		res := b.runAt(t, bsToday, "active")
		requireFigures(t, bsAccount(t, res, netted), 0, 0)
		for _, a := range []*core.Record{draftOnly, future} {
			if bsHasAccount(res, a) {
				t.Errorf("Active shows %s, whose only lines are a draft or after the As of day", a.GetString("full_name"))
			}
		}
	})
}

func TestBalanceSheetDraftsAndVoids(t *testing.T) {
	b := newBSBook(t)
	b.fiscalStart(t, 1)
	bank := b.account(t, "Operating checking", "1000", "bank", "checking")
	owner := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	income := b.account(t, "Service income", "4000", "income", "service_income")
	rent := b.account(t, "Office rent", "6000", "expense", "rent_lease")
	mkRetainedEarnings(t, b.app, "3900")
	b.post(t, "2026-03-01", ln{bank, 10000, 0}, ln{owner, 0, 10000})
	b.post(t, "2025-07-01", ln{bank, 1200, 0}, ln{income, 0, 1200})
	b.post(t, "2026-02-01", ln{bank, 500, 0}, ln{income, 0, 500})
	// Drafts: on a balance-sheet account and on an income account.
	mkDraft(t, b.app, "2026-03-02", ln{bank, 999, 0}, ln{owner, 0, 999})
	mkDraft(t, b.app, "2026-03-03", ln{bank, 777, 0}, ln{income, 0, 777})
	mkDraft(t, b.app, "2025-06-03", ln{bank, 333, 0}, ln{income, 0, 333})
	// Voids, before and after the prior-year day: each one's reversal cancels it.
	for _, day := range []string{"2025-06-01", "2026-04-01"} {
		b.void(t, b.post(t, day, ln{bank, 3000, 0}, ln{owner, 0, 3000}))
		b.void(t, b.post(t, day, ln{bank, 400, 0}, ln{income, 0, 400}))
		b.void(t, b.post(t, day, ln{rent, 250, 0}, ln{bank, 0, 250}))
	}

	res := b.runAt(t, bsToday, "")
	requireFigures(t, bsAccount(t, res, bank), 11700, 1200)
	requireFigures(t, bsAccount(t, res, owner), 10000, 0)
	// D 2026-11-04 is in fiscal 2026: 2025-07-01's income is earlier.
	requireFigures(t, bsRow(t, res, "Retained earnings"), 1200, 0)
	requireFigures(t, bsRow(t, res, "Net income"), 500, 1200)
}

func TestBalanceSheetMatchesTrialBalance(t *testing.T) {
	b := newBSBook(t)
	b.fiscalStart(t, 1)
	bank := b.account(t, "Operating checking", "1000", "bank", "checking")
	receivable := b.account(t, "Customer invoices", "1100", "accounts_receivable", "accounts_receivable")
	equipment := b.account(t, "Equipment", "1500", "fixed_asset", "machinery_equipment")
	accumulated := b.account(t, "Accumulated depreciation", "1590", "fixed_asset", "accumulated_depreciation")
	visa := b.account(t, "Visa", "2100", "credit_card", "credit_card")
	loan := b.account(t, "Bank loan", "2700", "long_term_liability", "notes_payable")
	owner := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	draws := b.account(t, "Owner draws", "3100", "equity", "owner_draws")
	mkRetainedEarnings(t, b.app, "3900")
	income := b.account(t, "Service income", "4000", "income", "service_income")
	rent := b.account(t, "Office rent", "6000", "expense", "rent_lease")
	b.post(t, "2025-03-01", ln{bank, 50000, 0}, ln{owner, 0, 50000})
	b.post(t, "2025-05-01", ln{receivable, 8000, 0}, ln{income, 0, 8000})
	b.post(t, "2025-09-01", ln{equipment, 12000, 0}, ln{loan, 0, 12000})
	b.post(t, "2025-12-31", ln{rent, 900, 0}, ln{visa, 0, 900})
	b.post(t, "2026-02-01", ln{bank, 6000, 0}, ln{receivable, 0, 6000})
	b.post(t, "2026-06-30", ln{rent, 1100, 0}, ln{accumulated, 0, 1100})
	b.post(t, "2026-08-15", ln{draws, 2500, 0}, ln{bank, 0, 2500})
	b.post(t, "2026-10-01", ln{visa, 400, 0}, ln{bank, 0, 400})
	opts := reports.Options{Today: bsToday}

	tb := runTB(t, b.app, b.reader, map[string]any{"asOf": bsToday, "rows": "active"}, opts)
	bs := b.runAt(t, bsToday, "active")
	accounts := []*core.Record{bank, receivable, equipment, accumulated, visa, loan, owner, draws}
	if n := len(bsAccountRows(bs)); n != len(accounts) {
		t.Errorf("%d account rows, want %d; rows %q", n, len(accounts), bsLabels(bs))
	}
	creditNormal := creditNormalTypes()
	for _, a := range accounts {
		row := rowFor(t, tb, a)
		debit, _ := moneyCell(t, row, "debit")
		credit, _ := moneyCell(t, row, "credit")
		want := debit - credit
		if slices.Contains(creditNormal, a.GetString("type")) {
			want = -want
		}
		if got := amt(t, bsAccount(t, bs, a), "current"); got != want {
			t.Errorf("%s: Balance Sheet current %d, Trial Balance by normal side %d", a.GetString("full_name"), got, want)
		}
	}
}

func TestBalanceSheetHiddenKeys(t *testing.T) {
	b := newBSBook(t)
	bank := b.account(t, "Operating checking", "1000", "bank", "checking")
	equipment := b.account(t, "Equipment", "1500", "fixed_asset", "machinery_equipment")
	owner := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	mkRetainedEarnings(t, b.app, "3900")
	b.post(t, "2025-06-01", ln{bank, 10000, 0}, ln{owner, 0, 10000})
	b.post(t, "2026-06-01", ln{equipment, 4000, 0}, ln{bank, 0, 4000})

	res := b.runAt(t, bsToday, "")
	ids := make([]string, len(res.Columns))
	for i, c := range res.Columns {
		ids[i] = c.ID
	}
	if !reflect.DeepEqual(ids, []string{"account", "current", "prior", "change", "pct"}) {
		t.Errorf("result columns = %v, want account, current, prior, change, pct", ids)
	}
	if len(res.Rows) == 0 {
		t.Fatal("the run has no rows")
	}
	for _, r := range res.Rows {
		for _, key := range []string{"side", "cls", "knd"} {
			if v, ok := r.Cells[key]; ok {
				t.Errorf("%s (%s) carries a %s cell %#v", r.Label, r.Kind, key, v)
			}
		}
	}
	if h := headingOf(t, res, "current"); h == nil || h.Value != bsToday || h.Type != reports.Date {
		t.Errorf("current heading = %+v, want the day %s", h, bsToday)
	}
	if h := headingOf(t, res, "prior"); h == nil || h.Value != bsPrior || h.Type != reports.Date {
		t.Errorf("prior heading = %+v, want the day %s", h, bsPrior)
	}
}

// bsCell is a display cell with core's defaults filled in (Span and Lines 0
// read as 1), so the test compares placement, not how the struct spells it.
type bsCell struct {
	Col     string
	Line    int
	Start   int
	Span    int
	Lines   int
	Justify string
}

func bsCells(cells []reports.DisplayCell) []bsCell {
	out := make([]bsCell, len(cells))
	for i, c := range cells {
		span, lines := c.Span, c.Lines
		if span == 0 {
			span = 1
		}
		if lines == 0 {
			lines = 1
		}
		out[i] = bsCell{c.Col, c.Line, c.Start, span, lines, c.Justify}
	}
	return out
}

// TestBalanceSheetDisplay pins spec §5 `display`, written out here from the
// spec (not read from the TS fixture): a phone draws the label, then Current ·
// Prior year · Change (no % change); a tablet the label, then all four
// figures; the label narrows first and every figure keeps its full width.
func TestBalanceSheetDisplay(t *testing.T) {
	app := newBooksApp(t)
	registerBooksSources(t)
	spec, _, err := reports.Load(balanceSheetShipped().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if err := reports.Validate(app, spec); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	d := spec.Display
	if d == nil {
		t.Fatal("the shipped spec has no display: a phone draws core's automatic lines, % change included")
	}
	if d.OneLine != nil {
		t.Errorf("display.oneLine = %+v, want none (core fits one line to the view)", *d.OneLine)
	}

	wantColumns := map[string]reports.ColumnFit{
		"account": {MinWidth: "12ch"},
		"current": {MinWidth: "max-content"},
		"prior":   {MinWidth: "max-content"},
		"change":  {MinWidth: "max-content"},
		"pct":     {MinWidth: "max-content"},
	}
	if !reflect.DeepEqual(d.Columns, wantColumns) {
		t.Errorf("display.columns = %+v\nwant %+v", d.Columns, wantColumns)
	}

	type layoutShape struct {
		Width    string
		MinWidth string
		Tracks   int
		Cells    []bsCell
	}
	got := make([]layoutShape, len(d.Layouts))
	for i, l := range d.Layouts {
		got[i] = layoutShape{l.Width, l.MinWidth, l.Tracks, bsCells(l.Cells)}
	}
	want := []layoutShape{
		{Width: "mobile", Tracks: 3, Cells: []bsCell{
			{Col: "account", Line: 1, Span: 3, Lines: 1},
			{Col: "current", Line: 2, Span: 1, Lines: 1},
			{Col: "prior", Line: 2, Span: 1, Lines: 1},
			{Col: "change", Line: 2, Span: 1, Lines: 1},
		}},
		{Width: "tablet", MinWidth: "600px", Tracks: 4, Cells: []bsCell{
			{Col: "account", Line: 1, Span: 4, Lines: 1},
			{Col: "current", Line: 2, Span: 1, Lines: 1},
			{Col: "prior", Line: 2, Span: 1, Lines: 1},
			{Col: "change", Line: 2, Span: 1, Lines: 1},
			{Col: "pct", Line: 2, Span: 1, Lines: 1},
		}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("display.layouts = %+v\nwant %+v", got, want)
	}
	for _, l := range d.Layouts {
		if l.Width == "desktop" {
			t.Errorf("display has a desktop layout: core fits one line, then the tablet layout")
		}
	}

	// G7: a hidden key column is never named by display (Validate refuses it).
	hidden := map[string]bool{}
	for _, c := range spec.Columns {
		if c.Hidden {
			hidden[c.ID] = true
		}
	}
	for id := range d.Columns {
		if hidden[id] {
			t.Errorf("display.columns names the hidden column %s", id)
		}
	}
	for _, l := range d.Layouts {
		for _, c := range l.Cells {
			if hidden[c.Col] {
				t.Errorf("layout %s names the hidden column %s", l.Width, c.Col)
			}
		}
	}
}

// Core does not refuse the run of a user who cannot read Books: the source's
// rule leaves the run no journal line, so it has no account row and every
// figure is 0 or empty.
func TestBalanceSheetNoAccess(t *testing.T) {
	b := newBSBook(t)
	b.fiscalStart(t, 1)
	outsider := b.env.users.none
	bank := b.account(t, "Operating checking", "1000", "bank", "checking")
	owner := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	income := b.account(t, "Service income", "4000", "income", "service_income")
	rent := b.account(t, "Office rent", "6000", "expense", "rent_lease")
	mkRetainedEarnings(t, b.app, "3900")
	b.post(t, "2025-06-01", ln{bank, 10000, 0}, ln{owner, 0, 10000})
	b.post(t, "2025-07-01", ln{bank, 4000, 0}, ln{income, 0, 4000})
	b.post(t, "2026-03-01", ln{bank, 2500, 0}, ln{income, 0, 2500})
	b.post(t, "2026-04-01", ln{rent, 700, 0}, ln{bank, 0, 700})
	opts := reports.Options{Today: bsToday}

	// The reader sees the ledger, so the outsider's empty run is the rule's doing.
	seen := b.runAt(t, bsToday, "active")
	requireFigures(t, bsAccount(t, seen, bank), 15800, 14000)
	requireFigures(t, bsRow(t, seen, "Net income"), 1800, 4000)

	for _, rows := range []string{"nonzero", "active"} {
		res, err := runBSErr(t, b.app, outsider, map[string]any{"asOf": bsToday, "rows": rows}, opts)
		if err != nil {
			t.Fatalf("Rows %s: the run of a user with Books level none was refused (%v); core runs it with the rule's rows", rows, err)
		}
		if got := bsAccountRows(res); len(got) != 0 {
			t.Errorf("Rows %s: a user with Books level none sees account rows %q", rows, labelsOf(got))
		}
		for _, r := range res.Rows {
			for _, col := range []string{"current", "prior", "change"} {
				if v := r.Cells[col]; v != nil && v != int64(0) {
					t.Errorf("Rows %s: %s (%s) %s = %#v, want 0 or empty", rows, r.Label, r.Kind, col, v)
				}
			}
			if v := r.Cells["pct"]; v != nil {
				t.Errorf("Rows %s: %s (%s) pct = %#v, want empty", rows, r.Label, r.Kind, v)
			}
		}
	}
}

// Register ships the Balance Sheet; core creates it unpublished, owned by the
// first admin, and Books shares it with every Books reader.
func TestBalanceSheetShippedUnpublished(t *testing.T) {
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	app, _ := newRegisteredApp(t)
	owner := mkUser(t, app, "owner")
	reader := mkUser(t, app, "member")
	setPkgAccess(t, app, reader, "readonly")
	if err := reports.ReconcileShipped(app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": "books.balance_sheet"})
	if err != nil {
		t.Fatalf("no reports row with shipped_key books.balance_sheet: %v", err)
	}
	if row.GetString("owner") != owner.Id {
		t.Errorf("owner = %q, want the first admin %q", row.GetString("owner"), owner.Id)
	}
	if row.GetBool("published") || row.GetString("published_by") != "" {
		t.Errorf("published = %v (by %q), want unpublished", row.GetBool("published"), row.GetString("published_by"))
	}
	if row.GetString("title") != "Balance Sheet" || row.GetInt("shipped_revision") != 1 || row.GetString("source") != "books.journal_lines" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a Books reader")
}

// idLine is a journal line with its own record id (blank for a new one) and
// memo, in minor units: a test sets the storage (id) order of the lines.
type idLine struct {
	id            string
	account       *core.Record
	debit, credit int
	memo          string
}

// postIDs saves a manual entry with a memo and its lines, posts it, and
// returns the posted entry (its number and sequence are set by the post).
func (b bsBook) postIDs(t *testing.T, date, memo string, lines ...idLine) *core.Record {
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
		saveRecord(t, b.app, "books_journal_lines", fields)
	}
	return mustPost(t, b.app, entry.Id, "")
}

// bsWireKey is a group row's groupKey as the client posts it back: through
// JSON, so a rank reads as a JSON number, as core's run endpoint decodes it.
func bsWireKey(t *testing.T, key []any) []any {
	t.Helper()
	raw, err := json.Marshal(key)
	if err != nil {
		t.Fatalf("group key %v: %v", key, err)
	}
	var out []any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("group key %s: %v", raw, err)
	}
	return out
}

// bsOpened runs the Balance Sheet as of bsToday with the given account rows
// opened (their group keys from a run with nothing opened), as the view asks
// after a press. An empty Collapse keeps the levels that are open by default open.
func (b bsBook) bsOpened(t *testing.T, opts reports.Options, accounts ...*core.Record) *reports.Result {
	t.Helper()
	opts.Collapse = [][]any{}
	closed := b.runAt(t, bsToday, "")
	for _, a := range accounts {
		opts.Expand = append(opts.Expand, bsWireKey(t, bsAccount(t, closed, a).GroupKey))
	}
	return runBS(t, b.app, b.reader, map[string]any{"asOf": bsToday}, opts)
}

// bsLines are the detail rows under the account row, in the result's order.
func bsLines(res *reports.Result, accountRow reports.Row) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindDetail && r.Section == accountRow.ID {
			out = append(out, r)
		}
	}
	return out
}

func bsLineLabel(date string, entry *core.Record, memo string) string {
	return date + " · " + entry.GetString("number") + " · " + memo
}

// Pressing an account row opens its posted lines (spec §3): labelled "<date>
// · <entry number> · <memo>", the entry's memo when the line has none, in
// date order then entry sequence, whatever order they were stored in; Current
// by the account's normal side, Prior year only for a line on or before the
// prior-year day, Change and % change blank. The line ids run against the
// date and the sequence order, so storage order fails the order check.
func TestBalanceSheetOpenedLines(t *testing.T) {
	b := newBSBook(t)
	checking := b.account(t, "Operating", "1000", "bank", "checking")
	visa := b.account(t, "Visa", "2100", "credit_card", "credit_card")
	owner := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	supplies := b.account(t, "Supplies", "6200", "expense", "office_general")
	mkRetainedEarnings(t, b.app, "3900")
	// On or before the prior-year day (2025-11-04).
	e1 := b.postIDs(t, "2025-10-01", "Owner deposit",
		idLine{id: "bsopenline00003", account: checking, debit: 1000, memo: "Before the prior day"},
		idLine{account: owner, credit: 1000})
	// Same day, posted in this order: e2 has the lower sequence, e3 the lower id.
	e2 := b.postIDs(t, "2026-03-10", "March deposit",
		idLine{id: "bsopenline00001", account: checking, debit: 2500},
		idLine{account: owner, credit: 2500})
	e3 := b.postIDs(t, "2026-03-10", "Card payment entry",
		idLine{id: "bsopenline00000", account: checking, credit: 400, memo: "Card payment"},
		idLine{account: owner, debit: 400})
	e4 := b.postIDs(t, "2026-01-05", "January entry",
		idLine{id: "bsopenline00002", account: checking, debit: 300, memo: "January"},
		idLine{account: owner, credit: 300})
	e5 := b.postIDs(t, "2026-04-01", "Card purchase",
		idLine{account: supplies, debit: 4500},
		idLine{account: visa, credit: 4500})

	closed := b.runAt(t, bsToday, "")
	for _, r := range closed.Rows {
		if r.Kind == reports.KindDetail {
			t.Fatalf("with no Expand the result holds detail row %q, want none (accounts open only on a press)", r.Label)
		}
	}
	// Retained earnings, Net income and Total liabilities and equity (row ids
	// "c:<row>" plus a currency suffix) do not open.
	var computed []string
	for _, r := range closed.Rows {
		if r.Kind != reports.KindComputed {
			continue
		}
		computed = append(computed, r.Label)
		if r.CanExpand {
			t.Errorf("computed row %s (%q) has CanExpand true, want false (it does not open)", r.ID, r.Label)
		}
	}
	if want := []string{"Retained earnings", "Net income", "Total liabilities and equity"}; !slices.Equal(computed, want) {
		t.Errorf("computed rows = %q, want %q", computed, want)
	}

	open := b.bsOpened(t, reports.Options{Today: bsToday}, checking, visa)
	lines := bsLines(open, bsAccount(t, open, checking))
	type want struct {
		label          string
		current, prior int64
	}
	wants := []want{
		{bsLineLabel("2025-10-01", e1, "Before the prior day"), 1000, 1000},
		{bsLineLabel("2026-01-05", e4, "January"), 300, 0},
		// No line memo: the entry's.
		{bsLineLabel("2026-03-10", e2, "March deposit"), 2500, 0},
		// A bank account credited reads negative by its normal side.
		{bsLineLabel("2026-03-10", e3, "Card payment"), -400, 0},
	}
	var got []string
	for _, l := range lines {
		got = append(got, l.Label)
	}
	var wantLabels []string
	for _, w := range wants {
		wantLabels = append(wantLabels, w.label)
	}
	if !slices.Equal(got, wantLabels) {
		t.Fatalf("Operating's opened lines = %q\nwant (date, then entry sequence) %q", got, wantLabels)
	}
	for i, w := range wants {
		requireFigures(t, lines[i], w.current, w.prior)
	}

	visaLines := bsLines(open, bsAccount(t, open, visa))
	if len(visaLines) != 1 || visaLines[0].Label != bsLineLabel("2026-04-01", e5, "Card purchase") {
		t.Fatalf("Visa's opened lines = %q, want one labelled %q", bsLabels(&reports.Result{Rows: visaLines}), bsLineLabel("2026-04-01", e5, "Card purchase"))
	}
	// A credit card credited 45.00 reads 45.00 (a liability's normal side).
	requireFigures(t, visaLines[0], 4500, 0)

	// Change and % change are blank on an opened line (N5): core leaves the
	// cells out.
	for _, r := range open.Rows {
		if r.Kind != reports.KindDetail {
			continue
		}
		for _, col := range []string{"change", "pct"} {
			if v, has := r.Cells[col]; has {
				t.Errorf("opened line %q has a %s cell %#v, want none", r.Label, col, v)
			}
		}
	}
}

// An opened account longer than a page continues on the next page, in order,
// with no line repeated. The line ids run against the date order.
func TestBalanceSheetPagesOpenedLines(t *testing.T) {
	b := newBSBook(t)
	petty := b.account(t, "Petty cash", "1050", "bank", "cash_on_hand")
	owner := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	mkRetainedEarnings(t, b.app, "3900")
	var want []string
	for k := 1; k <= 8; k++ {
		date := fmt.Sprintf("2026-08-0%d", k)
		memo := fmt.Sprintf("Line %d", k)
		entry := b.postIDs(t, date, "Paging",
			idLine{id: fmt.Sprintf("bspageline0000%d", 9-k), account: petty, debit: 100 * k, memo: memo},
			idLine{account: owner, credit: 100 * k})
		want = append(want, bsLineLabel(date, entry, memo))
	}

	opts := reports.Options{Today: bsToday, Limit: 5, Collapse: [][]any{}}
	closed := b.runAt(t, bsToday, "")
	opts.Expand = [][]any{bsWireKey(t, bsAccount(t, closed, petty).GroupKey)}
	var got []string
	pagesWithLines := 0
	for range 20 {
		res := runBS(t, b.app, b.reader, map[string]any{"asOf": bsToday}, opts)
		n := 0
		for _, r := range res.Rows {
			if r.Kind == reports.KindDetail {
				got = append(got, r.Label)
				n++
			}
		}
		if n > 0 {
			pagesWithLines++
		}
		if res.Page == nil || res.Page.Next == "" {
			break
		}
		opts.Cursor = res.Page.Next
	}
	if pagesWithLines < 2 {
		t.Errorf("the 8 lines came on %d page(s) of 5 rows, want them split across pages", pagesWithLines)
	}
	if !slices.Equal(got, want) {
		t.Errorf("opened lines across pages = %q\nwant each once, in date order %q", got, want)
	}
}

// Every collection the run and its lookups read is a topic, so a post, a
// void, an account edit or a Books settings change re-runs the open report.
// The run opens an account, so the detail label's entry read is in it.
func TestBalanceSheetTopics(t *testing.T) {
	b := newBSBook(t)
	checking := b.account(t, "Operating", "1000", "bank", "checking")
	owner := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	mkRetainedEarnings(t, b.app, "3900")
	b.post(t, "2026-03-10", ln{checking, 4000, 0}, ln{owner, 0, 4000})

	res := b.bsOpened(t, reports.Options{Today: bsToday}, checking)
	for _, topic := range []string{
		"collection/books_journal_lines", "collection/books_journal_entries",
		"collection/books_accounts", "collection/books_settings",
	} {
		if !slices.Contains(res.Topics, topic) {
			t.Errorf("topics = %v, want %s", res.Topics, topic)
		}
	}
}
