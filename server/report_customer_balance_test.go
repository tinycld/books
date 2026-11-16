package books

import (
	"context"
	"encoding/json"
	"reflect"
	"slices"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// cbToday is the reader's day in every run, so the default As of (Today)
// never moves with the clock.
const cbToday = "2026-11-16"

// runCBErr loads the shipped Customer Balance and runs it as reader, as core's
// run endpoint does: Load, then Run with the posted params.
func runCBErr(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) (*reports.Result, error) {
	t.Helper()
	spec, info, err := reports.Load(customerBalanceShipped().Spec)
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

func runCB(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	res, err := runCBErr(t, app, reader, params, opts)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// cbBook is a ledger book with every ledger hook bound, an Accounts
// receivable account, an income account, a bank account (a line that is not
// on Accounts receivable), Books' report sources, a Books read-only reader and
// a user with Books level none. On a document book (newCBDocBook) docs posts
// invoices and payments through their guards.
type cbBook struct {
	app                       core.App
	reader, none              *core.Record
	receivable, income, other *core.Record
	docs                      *paymentEnv
}

func newCBBook(t *testing.T) cbBook {
	t.Helper()
	env := newLedgerEnv(t)
	registerBooksSources(t)
	return cbBook{
		app: env.app, reader: env.users.readOnly, none: env.users.none,
		receivable: mkAccount(t, env.app, "Accounts receivable", "accounts_receivable", "accounts_receivable"),
		income:     env.revenue,
		other:      env.checking,
	}
}

// newCBDocBook is a cbBook on newPaymentEnv: invoices post to its Accounts
// receivable (1100), payments credit it.
func newCBDocBook(t *testing.T) cbBook {
	t.Helper()
	pe := newPaymentEnv(t)
	registerBooksSources(t)
	return cbBook{
		app: pe.app, reader: pe.users.readOnly, none: pe.users.none,
		receivable: pe.receivable, income: pe.revenue, other: pe.checking, docs: pe,
	}
}

func (b cbBook) customer(t *testing.T, name string, parent *core.Record) *core.Record {
	t.Helper()
	parentID := ""
	if parent != nil {
		parentID = parent.Id
	}
	return mkCustomer(t, b.app, name, parentID)
}

func partyID(customer *core.Record) string {
	if customer == nil {
		return ""
	}
	return customer.Id
}

// charge posts an entry dated day: a debit of cents on Accounts receivable
// naming customer (none when nil), credited to income.
func (b cbBook) charge(t *testing.T, day string, customer *core.Record, cents int) *core.Record {
	t.Helper()
	return postJournal(t, b.app, "", day, "Customer balance charge",
		jnLine{account: b.receivable, debit: cents, position: 0, customer: partyID(customer)},
		jnLine{account: b.income, credit: cents, position: 1})
}

// credit posts an entry dated day: a credit of cents on Accounts receivable
// naming customer (none when nil), debited to income.
func (b cbBook) credit(t *testing.T, day string, customer *core.Record, cents int) *core.Record {
	t.Helper()
	return postJournal(t, b.app, "", day, "Customer balance credit",
		jnLine{account: b.income, debit: cents, position: 0},
		jnLine{account: b.receivable, credit: cents, position: 1, customer: partyID(customer)})
}

func (b cbBook) inactive(t *testing.T, customer *core.Record) {
	t.Helper()
	if err := setCustomer(t, b.app, customer.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make %s inactive: %v", customer.GetString("display_name"), err)
	}
}

// invoice posts an invoice of customer with one non-taxable line of cents
// (dated 2026-11-04) through every guard. A document book only.
func (b cbBook) invoice(t *testing.T, customer *core.Record, cents int64) *core.Record {
	t.Helper()
	return b.docs.postedInvoice(t, customer, cents)
}

// payment posts a payment of customer of amount (dated 2026-11-10) that
// applies applied to invoice; the rest is the customer's credit.
func (b cbBook) payment(t *testing.T, customer, invoice *core.Record, amount, applied int64) *core.Record {
	t.Helper()
	p := b.docs.mkPayment(t, map[string]any{"customer": customer.Id, "amount": amount})
	mkApplication(t, b.app, p, invoice, 0, applied)
	return mustPostPayment(t, b.app, p.Id, b.docs.users.bookkeeper.Id)
}

func (b cbBook) run(t *testing.T, params map[string]any) *reports.Result {
	t.Helper()
	return runCB(t, b.app, b.reader, params, reports.Options{Today: cbToday})
}

// cbGroupRow is the group row of level (1 family, 2 customer) whose own key
// value (topKey on level 1, customerKey on level 2) is id. A sub-customer's
// key also holds its parent's id as topKey, so only the level's own value is
// read.
func cbGroupRow(res *reports.Result, level int, id string) (reports.Row, bool) {
	for _, r := range res.Rows {
		if r.Kind != reports.KindGroup || r.Level != level || len(r.GroupKey) < level {
			continue
		}
		if own, _ := r.GroupKey[level-1].(string); own == id {
			return r, true
		}
	}
	return reports.Row{}, false
}

func cbCustomerRow(t *testing.T, res *reports.Result, customer *core.Record) reports.Row {
	t.Helper()
	r, ok := cbGroupRow(res, 2, customer.Id)
	if !ok {
		t.Fatalf("no customer row for %s; rows %q", customer.GetString("display_name"), bsLabels(res))
	}
	return r
}

func cbHasCustomer(res *reports.Result, customer *core.Record) bool {
	_, ok := cbGroupRow(res, 2, customer.Id)
	return ok
}

func cbGroupRows(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup {
			out = append(out, r)
		}
	}
	return out
}

// cbCustomerRows are the customer rows (level 2), the No customer row
// included.
func cbCustomerRows(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup && r.Level == 2 {
			out = append(out, r)
		}
	}
	return out
}

// cbCustomerOf is the customer a customer row stands for: the second value
// of its key (customerKey); "" for the No customer row.
func cbCustomerOf(r reports.Row) string {
	if len(r.GroupKey) < 2 {
		return ""
	}
	id, _ := r.GroupKey[1].(string)
	return id
}

type cbShape struct {
	Label    string
	Kind     string
	Depth    int
	Expanded bool
}

func cbShapeOf(r reports.Row) cbShape { return cbShape{r.Label, r.Kind, r.Depth, r.Expanded} }

// cbFamily is the rows from the family header labelled parent through
// "Total <parent>", in result order.
func cbFamily(t *testing.T, res *reports.Result, parent string) []reports.Row {
	t.Helper()
	start := slices.IndexFunc(res.Rows, func(r reports.Row) bool {
		return r.Kind == reports.KindGroup && r.Level == 1 && r.Label == parent
	})
	end := slices.IndexFunc(res.Rows, func(r reports.Row) bool {
		return r.Kind == reports.KindSubtotal && r.Label == "Total "+parent
	})
	if start < 0 || end < start {
		t.Fatalf("no family %s (header at %d, total at %d); rows %q", parent, start, end, bsLabels(res))
	}
	return res.Rows[start : end+1]
}

func TestCustomerBalanceSpecLoads(t *testing.T) {
	b := newCBBook(t)
	if err := reports.CheckSources(b.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}

	shipped := customerBalanceShipped()
	if customerBalanceKey != "books.customer_balance" || shipped.Key != customerBalanceKey {
		t.Errorf("key = %q (const %q), want books.customer_balance", shipped.Key, customerBalanceKey)
	}
	if shipped.Title != "Customer Balance" {
		t.Errorf("title = %q, want Customer Balance", shipped.Title)
	}
	if shipped.Description != "What each customer owes on one day, from posted transactions on Accounts receivable accounts." {
		t.Errorf("description = %q", shipped.Description)
	}
	if shipped.Revision != 1 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	built, err := json.Marshal(customerBalanceSpec())
	if err != nil {
		t.Fatal(err)
	}
	if !jsonEqual(t, shipped.Spec, string(built)) {
		t.Errorf("the shipped spec is not customerBalanceSpec()")
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
	if err := reports.Validate(b.app, spec); err != nil {
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
		t.Errorf("asOf = %+v (default %s), want As of, default Today", asOf, asOf.Default)
	}
	rows := paramOf(t, spec, "rows")
	wantRows := []reports.Option{{Value: "nonzero", Label: "Non-zero"}, {Value: "activity", Label: "With activity"}}
	if rows.Type != reports.ParamChoice || rows.Label != "Rows" || rows.Multiple ||
		!reflect.DeepEqual(rows.Options, wantRows) || !jsonEqual(t, rows.Default, `"nonzero"`) {
		t.Errorf("rows = %+v (default %s), want a single choice Rows: Non-zero (default), With activity", rows, rows.Default)
	}

	type colShape struct {
		ID, Label string
		Hidden    bool
	}
	gotCols := make([]colShape, len(spec.Columns))
	for i, c := range spec.Columns {
		gotCols[i] = colShape{c.ID, c.Label, c.Hidden}
		// The hidden key columns' labels are not pinned.
		if c.Hidden {
			gotCols[i].Label = ""
		}
	}
	wantCols := []colShape{
		{ID: "name", Label: "Customer"},
		{ID: "balance", Label: "Balance"},
		{ID: "topKey", Hidden: true},
		{ID: "customerKey", Hidden: true},
	}
	if !reflect.DeepEqual(gotCols, wantCols) {
		t.Errorf("columns =\n%+v\nwant\n%+v", gotCols, wantCols)
	}

	type groupShape struct {
		ID, Col                    string
		Open, Subtotals, HideEmpty bool
		Inline, Having, Muted      bool
	}
	gotGroups := make([]groupShape, len(spec.Groups))
	for i, g := range spec.Groups {
		gotGroups[i] = groupShape{g.ID, g.Col, g.Open, g.Subtotals, g.HideEmpty, g.Inline != nil, g.Having != nil, g.Muted != nil}
	}
	wantGroups := []groupShape{
		{ID: "byTop", Col: "topKey", Open: true, Subtotals: true, HideEmpty: true, Inline: true},
		{ID: "byCustomer", Col: "customerKey", Having: true, Muted: true},
	}
	if !reflect.DeepEqual(gotGroups, wantGroups) {
		t.Errorf("groups = %+v\nwant %+v", gotGroups, wantGroups)
	}

	// The fixture's CUSTOMER_BALANCE_DISPLAY, written out.
	d := spec.Display
	if d == nil {
		t.Fatal("the shipped spec has no display: a long customer name would not wrap on a phone")
	}
	wantFit := map[string]reports.ColumnFit{
		"name":    {WhiteSpace: "normal", LineClamp: 3},
		"balance": {MinWidth: "max-content"},
	}
	if !reflect.DeepEqual(d.Columns, wantFit) {
		t.Errorf("display.columns = %+v, want %+v", d.Columns, wantFit)
	}
	if d.OneLine != nil {
		t.Errorf("display.oneLine = %+v, want none", d.OneLine)
	}
	if len(d.Layouts) != 0 {
		t.Errorf("display.layouts = %+v, want none", d.Layouts)
	}

	// A run shows the two visible columns only; the group keys stay hidden.
	b.charge(t, "2026-11-02", b.customer(t, "Shown Co", nil), 1000)
	res := b.run(t, nil)
	ids := make([]string, len(res.Columns))
	for i, c := range res.Columns {
		ids[i] = c.ID
	}
	if !reflect.DeepEqual(ids, []string{"name", "balance"}) {
		t.Errorf("result columns = %v, want name, balance", ids)
	}
	if len(cbGroupRows(res)) == 0 {
		t.Fatalf("the run has no group rows; rows %q", bsLabels(res))
	}
	for _, r := range res.Rows {
		for _, key := range []string{"topKey", "customerKey"} {
			if v, ok := r.Cells[key]; ok {
				t.Errorf("%s (%s) carries a %s cell %#v", r.Label, r.Kind, key, v)
			}
		}
	}
}

func TestCustomerBalanceWhatCounts(t *testing.T) {
	b := newCBDocBook(t)
	acme := b.customer(t, "Acme Co", nil)
	inv := b.invoice(t, acme, 100000)
	b.payment(t, acme, inv, 40000, 40000)
	// A draft's line does not count, nor a posted line on another account.
	saveJournalDraft(t, b.app, "", "2026-11-05", "Draft charge",
		jnLine{account: b.receivable, debit: 7777, position: 0, customer: acme.Id},
		jnLine{account: b.income, credit: 7777, position: 1})
	postJournal(t, b.app, "", "2026-11-06", "Cash sale named Acme",
		jnLine{account: b.other, debit: 5555, position: 0, customer: acme.Id},
		jnLine{account: b.income, credit: 5555, position: 1})

	voided := b.customer(t, "Voided Co", nil)
	if err := voidInvoiceAs(b.app, b.invoice(t, voided, 20000).Id, b.docs.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}

	edge := b.customer(t, "Edge Co", nil)
	b.charge(t, "2026-11-12", edge, 3000)
	b.charge(t, "2026-11-13", edge, 9000)

	onDay := b.run(t, map[string]any{"asOf": "2026-11-12"})
	if got := amt(t, cbCustomerRow(t, onDay, acme), "balance"); got != 60000 {
		t.Errorf("Acme Co = %d, want 60000 (invoice 1,000.00 less payment 400.00; the draft and the bank line do not count)", got)
	}
	if got := amt(t, cbCustomerRow(t, onDay, edge), "balance"); got != 3000 {
		t.Errorf("Edge Co as of 2026-11-12 = %d, want 3000 (the line on the day counts, the one after does not)", got)
	}
	if cbHasCustomer(onDay, voided) {
		t.Errorf("Voided Co has a row under Non-zero; its void's reversal cancels the invoice")
	}
	activity := b.run(t, map[string]any{"asOf": "2026-11-12", "rows": "activity"})
	if got := amt(t, cbCustomerRow(t, activity, voided), "balance"); got != 0 {
		t.Errorf("Voided Co under With activity = %d, want 0", got)
	}

	byDefault := b.run(t, nil)
	if got := resolvedAsOf(t, byDefault); got != cbToday {
		t.Errorf("As of with no param resolved to %#v, want %s (Today)", got, cbToday)
	}
	if got := amt(t, cbCustomerRow(t, byDefault, edge), "balance"); got != 12000 {
		t.Errorf("Edge Co as of today = %d, want 12000", got)
	}

	// Every customer row is the customer page's Open figure on the same day.
	open := partyBalances(t, b.app)
	shown := map[string]bool{}
	for _, r := range cbCustomerRows(byDefault) {
		id := cbCustomerOf(r)
		if id == "" {
			continue
		}
		shown[id] = true
		if got := amt(t, r, "balance"); got != int64(open[id]) {
			t.Errorf("%s = %d, want its books_party_balances balance %d", r.Label, got, open[id])
		}
	}
	for id, balance := range open {
		if balance != 0 && !shown[id] {
			t.Errorf("customer %s has a party balance of %d and no row; rows %q", id, balance, bsLabels(byDefault))
		}
	}
}

func TestCustomerBalanceFamilies(t *testing.T) {
	b := newCBBook(t)
	day := "2026-11-02"

	solo := b.customer(t, "Delta Solo", nil)
	b.charge(t, day, solo, 1000)

	mesa := b.customer(t, "Mesa Group", nil)
	birch := b.customer(t, "Birch site", mesa)
	alder := b.customer(t, "alder site", mesa)
	b.charge(t, day, mesa, 5000)
	b.charge(t, day, birch, 2000)
	b.charge(t, day, alder, 3000)

	orchard := b.customer(t, "Orchard Co", nil)
	b.customer(t, "Orchard East", orchard)
	b.charge(t, day, orchard, 4000)

	quarry := b.customer(t, "Quarry Co", nil)
	north := b.customer(t, "Quarry North", quarry)
	b.charge(t, day, north, 2500)

	ridge := b.customer(t, "Ridge Co", nil)
	west := b.customer(t, "Ridge West", ridge)
	b.charge(t, day, ridge, 6000)
	b.charge(t, day, west, 1000)
	b.credit(t, day, west, 1000)

	alpha := b.customer(t, "alpha", nil)
	beta := b.customer(t, "Beta", nil)
	betaChild := b.customer(t, "Beta child", beta)
	gamma := b.customer(t, "gamma", nil)
	b.charge(t, day, alpha, 100)
	b.charge(t, day, betaChild, 200)
	b.charge(t, day, gamma, 300)

	res := b.run(t, nil)
	g, s := reports.KindGroup, reports.KindSubtotal

	// A customer with no sub-customer lines is one plain row.
	soloAt := slices.IndexFunc(res.Rows, func(r reports.Row) bool {
		return r.Kind == g && r.Level == 2 && cbCustomerOf(r) == solo.Id
	})
	if soloAt < 0 {
		t.Fatalf("no customer row for Delta Solo; rows %q", bsLabels(res))
	}
	soloRow := res.Rows[soloAt]
	if soloRow.Label != "Delta Solo" || soloRow.Depth != 0 {
		t.Errorf("Delta Solo = %+v, want a customer group row at depth 0", cbShapeOf(soloRow))
	}
	if got := amt(t, soloRow, "balance"); got != 1000 {
		t.Errorf("Delta Solo = %d, want 1000", got)
	}
	if bsHas(res, "Total Delta Solo") {
		t.Errorf("a customer with no sub-customers has a total row; rows %q", bsLabels(res))
	}
	if soloAt > 0 {
		if before := res.Rows[soloAt-1]; before.Kind == g && before.Level == 1 && len(before.GroupKey) > 0 && before.GroupKey[0] == solo.Id {
			t.Errorf("the row before Delta Solo is its family header: %+v", cbShapeOf(before))
		}
	}
	if soloAt+1 < len(res.Rows) {
		if after := res.Rows[soloAt+1]; after.Label == "Total Delta Solo" {
			t.Errorf("the row after Delta Solo is its family total: %+v", cbShapeOf(after))
		}
	}

	// A parent with its own balance and two sub-customers: header, the
	// parent's row, the sub-customers by name ignoring case, the total.
	family := cbFamily(t, res, "Mesa Group")
	gotShapes := make([]cbShape, len(family))
	for i, r := range family {
		gotShapes[i] = cbShapeOf(r)
	}
	wantShapes := []cbShape{
		{"Mesa Group", g, 0, true},
		{"Mesa Group", g, 1, false},
		{"alder site", g, 1, false},
		{"Birch site", g, 1, false},
		{"Total Mesa Group", s, 0, false},
	}
	if !reflect.DeepEqual(gotShapes, wantShapes) {
		t.Fatalf("Mesa Group's rows (label, kind, depth, expanded) =\n%v\nwant\n%v", gotShapes, wantShapes)
	}
	// No figure of the header's is shown twice. The engine sends the header
	// its family's cells (assemble.go groupWithLabel); core's view draws none
	// on a group row that its own subtotal row follows, and it knows that row
	// by the subtotal's Section, which names the header's id
	// (core/reports/lib/rows.ts visibleRows).
	if header, total := family[0], family[4]; total.Section != header.ID {
		t.Errorf("Total Mesa Group's section = %q, want the header's id %q, so the header draws no figure of its own", total.Section, header.ID)
	}
	if family[0].Level != 1 || family[1].Level != 2 || cbCustomerOf(family[1]) != mesa.Id {
		t.Errorf("Mesa Group's first two rows = levels %d, %d (customer %q), want the family header then the parent's own row", family[0].Level, family[1].Level, cbCustomerOf(family[1]))
	}
	wantFigures := []int64{5000, 3000, 2000}
	var sum int64
	for i, want := range wantFigures {
		got := amt(t, family[i+1], "balance")
		if got != want {
			t.Errorf("%s = %d, want %d", family[i+1].Label, got, want)
		}
		sum += got
	}
	if got := amt(t, family[4], "balance"); got != sum || got != 10000 {
		t.Errorf("Total Mesa Group = %d, want the three rows' sum %d (10000)", got, sum)
	}

	// A parent whose only lines are its own is one plain row.
	orchardRow := bsRow(t, res, "Orchard Co")
	if orchardRow.Depth != 0 || orchardRow.Level != 2 || bsHas(res, "Total Orchard Co") || bsHas(res, "Orchard East") {
		t.Errorf("Orchard Co = %+v (level %d); rows %q; want one plain row, no total, no sub-customer row", cbShapeOf(orchardRow), orchardRow.Level, bsLabels(res))
	}

	// A sub-customer whose parent has no line: header, the sub-customer, total.
	quarryFamily := cbFamily(t, res, "Quarry Co")
	gotQuarry := make([]cbShape, len(quarryFamily))
	for i, r := range quarryFamily {
		gotQuarry[i] = cbShapeOf(r)
	}
	wantQuarry := []cbShape{
		{"Quarry Co", g, 0, true},
		{"Quarry North", g, 1, false},
		{"Total Quarry Co", s, 0, false},
	}
	if !reflect.DeepEqual(gotQuarry, wantQuarry) {
		t.Errorf("Quarry Co's rows =\n%v\nwant\n%v", gotQuarry, wantQuarry)
	}
	if got := amt(t, bsRow(t, res, "Total Quarry Co"), "balance"); got != 2500 {
		t.Errorf("Total Quarry Co = %d, want 2500", got)
	}

	// D1: a sub-customer that nets to zero keeps the family's header and total
	// under Non-zero; only the parent's row shows.
	ridgeFamily := cbFamily(t, res, "Ridge Co")
	gotRidge := make([]cbShape, len(ridgeFamily))
	for i, r := range ridgeFamily {
		gotRidge[i] = cbShapeOf(r)
	}
	wantRidge := []cbShape{
		{"Ridge Co", g, 0, true},
		{"Ridge Co", g, 1, false},
		{"Total Ridge Co", s, 0, false},
	}
	if !reflect.DeepEqual(gotRidge, wantRidge) {
		t.Errorf("Ridge Co's rows =\n%v\nwant\n%v (D1: the family keeps its header and total)", gotRidge, wantRidge)
	}
	if got := amt(t, bsRow(t, res, "Total Ridge Co"), "balance"); got != 6000 {
		t.Errorf("Total Ridge Co = %d, want 6000", got)
	}

	// Families and plain customers in one name order, ignoring case.
	var top []string
	for _, r := range res.Rows {
		if r.Depth == 0 && r.Kind == g {
			top = append(top, r.Label)
		}
	}
	wantTop := []string{"alpha", "Beta", "Delta Solo", "gamma", "Mesa Group", "Orchard Co", "Quarry Co", "Ridge Co"}
	if !reflect.DeepEqual(top, wantTop) {
		t.Errorf("depth-0 rows = %q\nwant %q (one name order, ignoring case)", top, wantTop)
	}
	if r, ok := cbGroupRow(res, 1, beta.Id); !ok || r.Label != "Beta" || !r.Expanded {
		t.Errorf("Beta = %+v (found %v), want a family header", r, ok)
	}
}

func TestCustomerBalanceCredit(t *testing.T) {
	b := newCBDocBook(t)
	pine := b.customer(t, "Pine Co", nil)
	annex := b.customer(t, "Pine Annex", pine)
	b.invoice(t, pine, 50000)
	annexInvoice := b.invoice(t, annex, 30000)
	// An overpayment: 500.00 received, 300.00 applied, 200.00 credited.
	b.payment(t, annex, annexInvoice, 50000, 30000)

	res := b.run(t, nil)
	annexRow := cbCustomerRow(t, res, annex)
	if got := amt(t, annexRow, "balance"); got != -20000 {
		t.Errorf("Pine Annex = %d, want -20000 (a credit balance is negative)", got)
	}
	if got := amt(t, cbCustomerRow(t, res, pine), "balance"); got != 50000 {
		t.Errorf("Pine Co's own row = %d, want 50000", got)
	}
	if got := amt(t, bsRow(t, res, "Total Pine Co"), "balance"); got != 30000 {
		t.Errorf("Total Pine Co = %d, want 30000 (the credit nets the family)", got)
	}
	if got := amt(t, totalOf(t, res), "balance"); got != 30000 {
		t.Errorf("Total = %d, want 30000 (the credit nets the Total)", got)
	}
}

func TestCustomerBalanceNoCustomer(t *testing.T) {
	b := newCBBook(t)
	mkRetainedEarnings(t, b.app, "3900")
	day := "2026-11-02"
	b.charge(t, day, b.customer(t, "Ash Co", nil), 1000)
	b.charge(t, day, b.customer(t, "Zinc Co", nil), 2000)
	b.charge(t, day, nil, 4000)
	b.credit(t, day, nil, 500)
	// After the day: in no figure.
	b.charge(t, "2026-11-20", nil, 70000)

	res := b.run(t, nil)
	none := bsRow(t, res, "No customer")
	if none.Kind != reports.KindGroup || none.Depth != 0 {
		t.Errorf("No customer = %+v, want a plain group row at depth 0", cbShapeOf(none))
	}
	at := slices.IndexFunc(res.Rows, func(r reports.Row) bool { return r.Label == "No customer" })
	for i, r := range res.Rows[:at] {
		if r.Kind == reports.KindGroup && r.Label == "No customer" {
			t.Errorf("row %d: a second No customer row", i)
		}
	}
	for _, r := range res.Rows[at+1:] {
		if r.Kind != reports.KindTotal {
			t.Errorf("row %q (%s) after No customer, want only the Total", r.Label, r.Kind)
		}
	}
	if at+1 >= len(res.Rows) || res.Rows[at+1].Kind != reports.KindTotal {
		t.Errorf("rows %q: want No customer directly before the Total", bsLabels(res))
	}
	if bsHas(res, "Total No customer") {
		t.Errorf("the No customer row has a total of its own; rows %q", bsLabels(res))
	}
	if got := amt(t, none, "balance"); got != 3500 {
		t.Errorf("No customer = %d, want 3500", got)
	}

	total := amt(t, totalOf(t, res), "balance")
	var rows int64
	for _, r := range cbCustomerRows(res) {
		rows += amt(t, r, "balance")
	}
	if total != rows || total != 6500 {
		t.Errorf("Total = %d, want the sum of the customer rows and No customer %d (6500)", total, rows)
	}

	lines, err := b.app.FindAllRecords("books_journal_lines", dbx.HashExp{"account": b.receivable.Id, "posted": true})
	if err != nil {
		t.Fatal(err)
	}
	var net int64
	for _, l := range lines {
		if l.GetString("date") <= cbToday {
			net += int64(l.GetInt("debit") - l.GetInt("credit"))
		}
	}
	if total != net {
		t.Errorf("Total = %d, want the net of every posted Accounts receivable line on or before %s: %d", total, cbToday, net)
	}

	bs := runBS(t, b.app, b.reader, map[string]any{"asOf": cbToday}, reports.Options{Today: cbToday})
	if got := amt(t, bsAccount(t, bs, b.receivable), "current"); got != total {
		t.Errorf("Total = %d, want the Balance Sheet's Accounts receivable on the same day %d", total, got)
	}
}

func TestCustomerBalanceRowsChoice(t *testing.T) {
	b := newCBDocBook(t)
	paid := b.customer(t, "Paid Co", nil)
	inv := b.invoice(t, paid, 20000)
	b.payment(t, paid, inv, 20000, 20000)

	fern := b.customer(t, "Fern Co", nil)
	spur := b.customer(t, "Fern Spur", fern)
	fernInv := b.invoice(t, fern, 10000)
	b.payment(t, fern, fernInv, 10000, 10000)
	spurInv := b.invoice(t, spur, 5000)
	b.payment(t, spur, spurInv, 5000, 5000)

	// A customer named only on a bank line has no Accounts receivable line.
	idle := b.customer(t, "Idle Co", nil)
	postJournal(t, b.app, "", "2026-11-06", "Cash sale named Idle",
		jnLine{account: b.other, debit: 900, position: 0, customer: idle.Id},
		jnLine{account: b.income, credit: 900, position: 1})

	// Something shows under Non-zero, so its empty rows are the choice's doing.
	owes := b.customer(t, "Owes Co", nil)
	b.invoice(t, owes, 1000)

	nonzero := b.run(t, map[string]any{"rows": "nonzero"})
	if !cbHasCustomer(nonzero, owes) {
		t.Fatalf("Owes Co has no row under Non-zero; rows %q", bsLabels(nonzero))
	}
	for _, label := range []string{"Paid Co", "Fern Co", "Fern Spur", "Total Fern Co", "Idle Co"} {
		if bsHas(nonzero, label) {
			t.Errorf("Non-zero shows %q; rows %q", label, bsLabels(nonzero))
		}
	}
	if byDefault := b.run(t, nil); !reflect.DeepEqual(bsLabels(byDefault), bsLabels(nonzero)) {
		t.Errorf("no Rows param gives %q, want Non-zero's %q", bsLabels(byDefault), bsLabels(nonzero))
	}

	activity := b.run(t, map[string]any{"rows": "activity"})
	if got := amt(t, cbCustomerRow(t, activity, paid), "balance"); got != 0 {
		t.Errorf("Paid Co under With activity = %d, want 0", got)
	}
	family := cbFamily(t, activity, "Fern Co")
	got := make([]string, len(family))
	for i, r := range family {
		got[i] = r.Label
		if r.Kind == reports.KindGroup && r.Level == 1 {
			continue
		}
		if v := amt(t, r, "balance"); v != 0 {
			t.Errorf("%s under With activity = %d, want 0", r.Label, v)
		}
	}
	if want := []string{"Fern Co", "Fern Co", "Fern Spur", "Total Fern Co"}; !reflect.DeepEqual(got, want) {
		t.Errorf("Fern Co's rows under With activity = %q, want %q", got, want)
	}
	if cbHasCustomer(activity, idle) || bsHas(activity, "Idle Co") {
		t.Errorf("a customer with no Accounts receivable line shows under With activity; rows %q", bsLabels(activity))
	}
}

func TestCustomerBalanceInactive(t *testing.T) {
	b := newCBBook(t)
	day := "2026-11-02"
	barn := b.customer(t, "Old Barn", nil)
	b.charge(t, day, barn, 1000)
	b.inactive(t, barn)

	live := b.customer(t, "Live Co", nil)
	b.charge(t, day, live, 1000)

	hill := b.customer(t, "Hill Co", nil)
	shed := b.customer(t, "Hill Shed", hill)
	b.charge(t, day, hill, 2000)
	b.charge(t, day, shed, 1000)
	b.inactive(t, shed)

	vale := b.customer(t, "Vale Co", nil)
	valeBarn := b.customer(t, "Vale Barn", vale)
	b.charge(t, day, vale, 3000)
	b.charge(t, day, valeBarn, 1000)
	// A parent becomes inactive only after its sub-customers do.
	b.inactive(t, valeBarn)
	b.inactive(t, vale)

	res := b.run(t, nil)
	requireMarked := func(customer *core.Record, name string) {
		t.Helper()
		r := cbCustomerRow(t, res, customer)
		if r.Label != name+" (inactive)" || !r.Muted {
			t.Errorf("%s's row = label %q, muted %v; want %q, muted", name, r.Label, r.Muted, name+" (inactive)")
		}
	}
	requirePlain := func(r reports.Row, label string) {
		t.Helper()
		if r.Label != label || r.Muted {
			t.Errorf("row = label %q (%s), muted %v; want %q, not muted", r.Label, r.Kind, r.Muted, label)
		}
	}

	requireMarked(barn, "Old Barn")
	requirePlain(cbCustomerRow(t, res, live), "Live Co")

	requireMarked(shed, "Hill Shed")
	hillHeader, ok := cbGroupRow(res, 1, hill.Id)
	if !ok {
		t.Fatalf("no family row for Hill Co; rows %q", bsLabels(res))
	}
	requirePlain(hillHeader, "Hill Co")
	requirePlain(cbCustomerRow(t, res, hill), "Hill Co")
	requirePlain(bsRow(t, res, "Total Hill Co"), "Total Hill Co")
	requirePlain(totalOf(t, res), "Total")

	requireMarked(vale, "Vale Co")
	requireMarked(valeBarn, "Vale Barn")
	valeHeader, ok := cbGroupRow(res, 1, vale.Id)
	if !ok {
		t.Fatalf("no family row for Vale Co; rows %q", bsLabels(res))
	}
	requirePlain(valeHeader, "Vale Co")
	requirePlain(bsRow(t, res, "Total Vale Co"), "Total Vale Co")
	if bsHas(res, "Total Vale Co (inactive)") {
		t.Errorf("the family total of an inactive parent carries the suffix; rows %q", bsLabels(res))
	}
}

func TestCustomerBalanceFamilyFolds(t *testing.T) {
	b := newCBBook(t)
	day := "2026-11-02"
	kiln := b.customer(t, "Kiln Co", nil)
	yard := b.customer(t, "Kiln Yard", kiln)
	b.charge(t, day, kiln, 1000)
	b.charge(t, day, yard, 500)
	b.charge(t, day, b.customer(t, "Moss Co", nil), 700)

	open := b.run(t, nil)
	header, ok := cbGroupRow(open, 1, kiln.Id)
	if !ok || !header.Expanded {
		t.Fatalf("Kiln Co's family row = %+v (found %v), want it open; rows %q", header, ok, bsLabels(open))
	}
	folded := runCB(t, b.app, b.reader, nil, reports.Options{Today: cbToday, Collapse: [][]any{header.GroupKey}})
	got, ok := cbGroupRow(folded, 1, kiln.Id)
	if !ok || got.Label != "Kiln Co" || got.Expanded {
		t.Errorf("folded Kiln Co = %+v (found %v), want its header, not expanded", got, ok)
	}
	if cbHasCustomer(folded, kiln) || cbHasCustomer(folded, yard) || bsHas(folded, "Kiln Yard") || bsHas(folded, "Total Kiln Co") {
		t.Errorf("a folded family keeps its customer rows or total; rows %q", bsLabels(folded))
	}
	if !bsHas(folded, "Moss Co") {
		t.Errorf("folding Kiln Co took Moss Co away; rows %q", bsLabels(folded))
	}
	if before, after := amt(t, totalOf(t, open), "balance"), amt(t, totalOf(t, folded), "balance"); before != after || after != 2200 {
		t.Errorf("Total folded = %d, open = %d; want both 2200", after, before)
	}
}

func TestCustomerBalanceEmpty(t *testing.T) {
	b := newCBBook(t)
	b.charge(t, "2026-10-05", b.customer(t, "October Co", nil), 1000)
	if len(cbGroupRows(b.run(t, nil))) == 0 {
		t.Fatal("today has no group rows: the book must hold a posted Accounts receivable line")
	}

	res := b.run(t, map[string]any{"asOf": "2026-10-04"})
	if groups := cbGroupRows(res); len(groups) != 0 {
		t.Errorf("a day before every line has group rows %q", labelsOf(groups))
	}
	totals := 0
	for _, r := range res.Rows {
		if r.Kind != reports.KindTotal {
			t.Errorf("row %q (%s) on an empty day, want the Total only", r.Label, r.Kind)
			continue
		}
		totals++
		if v := r.Cells["balance"]; v != nil {
			t.Errorf("the empty day's Total balance = %#v, want no figure", v)
		}
	}
	if totals != 1 {
		t.Errorf("an empty day has %d Total rows, want exactly 1", totals)
	}
}

func TestCustomerBalanceNoAccess(t *testing.T) {
	b := newCBBook(t)
	b.charge(t, "2026-11-02", b.customer(t, "Seen Co", nil), 1000)
	// The reader sees the line, so the outsider's empty run is the rule's doing.
	if !bsHas(b.run(t, nil), "Seen Co") {
		t.Fatal("the Books reader does not see the posted line")
	}

	res, err := runCBErr(t, b.app, b.none, nil, reports.Options{Today: cbToday})
	if err != nil {
		t.Fatalf("the run of a user with Books level none was refused (%v); core runs it with the rule's rows", err)
	}
	if groups := cbGroupRows(res); len(groups) != 0 {
		t.Errorf("a user with Books level none sees rows %q", labelsOf(groups))
	}
}

// Register ships the Customer Balance; core creates it unpublished, owned by
// the first admin, and Books shares it with every Books reader.
func TestCustomerBalanceShippedShared(t *testing.T) {
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	app, _ := newRegisteredApp(t)
	mkUser(t, app, "owner")
	reader := mkUser(t, app, "guest")
	setPkgAccess(t, app, reader, "readonly")
	outsider := mkUser(t, app, "guest")
	if err := reports.ReconcileShipped(app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": customerBalanceKey})
	if err != nil {
		t.Fatalf("no reports row with shipped_key %s: %v", customerBalanceKey, err)
	}
	if row.GetBool("published") || row.GetString("published_by") != "" {
		t.Errorf("published = %v (by %q), want unpublished", row.GetBool("published"), row.GetString("published_by"))
	}
	if row.GetString("title") != "Customer Balance" || row.GetInt("shipped_revision") != 1 || row.GetString("source") != "books.journal_lines" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a guest with Books readonly access")
	requireNoShare(t, app, row, outsider, "a guest without Books access")
}
