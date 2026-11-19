package books

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The A/R Aging report (spec §3, §4): the open items of each customer on the
// As of day, by age column. Every run is the reader's, with a fixed day.

// arToday is the reader's day in every run unless a test sets one, so the
// default As of (Today) never moves with the clock.
const arToday = "2026-11-18"

// arAgeCols are the five age columns, youngest first.
var arAgeCols = []string{"current", "d30", "d60", "d90", "d91"}

// arFigureCols are the age columns and Total.
var arFigureCols = append(slices.Clone(arAgeCols), "total")

// runARErr runs arAgingSpec() as reader, as core's run endpoint does: Load,
// then Run with the posted params, the reader's headers and, unless opts sets
// one, the day arToday.
func runARErr(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) (*reports.Result, error) {
	t.Helper()
	spec, info, err := reports.Load(mustJSON(arAgingSpec()))
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
	if opts.Today == "" {
		opts.Today = arToday
	}
	return reports.Run(context.Background(), app, reports.Request{
		Spec: spec, Loaded: info, Params: given, Options: opts, Auth: reader,
		Headers: readerInfo(reader).Headers,
	})
}

func runAR(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	res, err := runARErr(t, app, reader, params, opts)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

func (b arBook) run(t *testing.T, params map[string]any) *reports.Result {
	t.Helper()
	return runAR(t, b.app, b.reader, params, reports.Options{})
}

// runOpen runs the report with the group rows keyed by keys opened, as the
// view asks when a reader presses rows: an empty collapse keeps the family
// level open beside them (core run.go openLevels).
func (b arBook) runOpen(t *testing.T, params map[string]any, keys ...[]any) *reports.Result {
	t.Helper()
	return runAR(t, b.app, b.reader, params, reports.Options{Expand: keys, Collapse: [][]any{}})
}

// agedCell reads an age or Total cell: an int64 of minor units, or ok false
// for a blank cell (no cell or a nil value).
func agedCell(t *testing.T, r reports.Row, col string) (int64, bool) {
	t.Helper()
	return moneyCell(t, r, col)
}

// arFigs are a row's five age cells and Total; a blank cell is absent.
func arFigs(t *testing.T, r reports.Row) map[string]int64 {
	t.Helper()
	out := map[string]int64{}
	for _, c := range arFigureCols {
		if v, ok := agedCell(t, r, c); ok {
			out[c] = v
		}
	}
	return out
}

// arSumFigs adds rows' figures column by column; a column no row has money in
// is absent.
func arSumFigs(t *testing.T, rows []reports.Row) map[string]int64 {
	t.Helper()
	out := map[string]int64{}
	for _, r := range rows {
		for c, v := range arFigs(t, r) {
			out[c] += v
		}
	}
	for c, v := range out {
		if v == 0 {
			delete(out, c)
		}
	}
	return out
}

// requireFigs fails unless row's figures are exactly want.
func requireFigs(t *testing.T, what string, r reports.Row, want map[string]int64) {
	t.Helper()
	if got := arFigs(t, r); !reflect.DeepEqual(got, want) {
		t.Errorf("%s (%q, %s) figures = %v, want %v (an absent column is blank)", what, r.Label, r.Kind, got, want)
	}
}

// requireAgesAddUp fails unless the five age cells of r add up to its Total,
// which is never blank.
func requireAgesAddUp(t *testing.T, r reports.Row) {
	t.Helper()
	total, ok := agedCell(t, r, "total")
	if !ok {
		t.Errorf("%q (%s) has a blank Total, want a figure", r.Label, r.Kind)
		return
	}
	var sum int64
	for _, c := range arAgeCols {
		v, _ := agedCell(t, r, c)
		sum += v
	}
	if sum != total {
		t.Errorf("%q (%s): the age cells add up to %d, want its Total %d", r.Label, r.Kind, sum, total)
	}
}

// arItemRow is the item row (level 3) whose own key is item; ok false when
// the run has none.
func arItemRow(res *reports.Result, item string) (reports.Row, bool) {
	for _, r := range res.Rows {
		if r.Kind != reports.KindGroup || r.Level != 3 || len(r.GroupKey) < 3 {
			continue
		}
		if own, _ := r.GroupKey[2].(string); own == item {
			return r, true
		}
	}
	return reports.Row{}, false
}

func requireItemRow(t *testing.T, res *reports.Result, item string) reports.Row {
	t.Helper()
	r, ok := arItemRow(res, item)
	if !ok {
		t.Fatalf("no item row for %s; rows %q", item, bsLabels(res))
	}
	return r
}

// arUnder are the rows one depth below row, from the rows after it until the
// first row at its depth or above.
func arUnder(t *testing.T, res *reports.Result, row reports.Row) []reports.Row {
	t.Helper()
	at := slices.IndexFunc(res.Rows, func(r reports.Row) bool { return r.ID == row.ID })
	if at < 0 {
		t.Fatalf("no row %s (%q); rows %q", row.ID, row.Label, bsLabels(res))
	}
	out := []reports.Row{}
	for _, r := range res.Rows[at+1:] {
		if r.Depth <= row.Depth {
			break
		}
		if r.Depth == row.Depth+1 {
			out = append(out, r)
		}
	}
	return out
}

// arItemsOf are the item rows under an opened customer row.
func arItemsOf(t *testing.T, res *reports.Result, customerRow reports.Row) []reports.Row {
	t.Helper()
	out := []reports.Row{}
	for _, r := range arUnder(t, res, customerRow) {
		if r.Kind == reports.KindGroup && r.Level == 3 {
			out = append(out, r)
		}
	}
	return out
}

// arLinesOf are the detail rows under an opened item row.
func arLinesOf(t *testing.T, res *reports.Result, itemRow reports.Row) []reports.Row {
	t.Helper()
	out := []reports.Row{}
	for _, r := range arUnder(t, res, itemRow) {
		if r.Kind == reports.KindDetail {
			out = append(out, r)
		}
	}
	return out
}

// openCustomer runs the report with customer's row opened.
func (b arBook) openCustomer(t *testing.T, params map[string]any, customer *core.Record) (*reports.Result, reports.Row) {
	t.Helper()
	key := cbCustomerRow(t, b.run(t, params), customer).GroupKey
	res := b.runOpen(t, params, key)
	return res, cbCustomerRow(t, res, customer)
}

// openItem runs the report with customer's row and its item opened.
func (b arBook) openItem(t *testing.T, params map[string]any, customer *core.Record, item string) (*reports.Result, reports.Row) {
	t.Helper()
	opened, row := b.openCustomer(t, params, customer)
	itemKey := requireItemRow(t, opened, item).GroupKey
	res := b.runOpen(t, params, row.GroupKey, itemKey)
	return res, requireItemRow(t, res, item)
}

func dueOf(r reports.Row) string {
	if r.Cells["due"] == nil {
		return ""
	}
	return fmt.Sprint(r.Cells["due"])
}

func entryNumber(t *testing.T, b arBook, entryID string) string {
	t.Helper()
	return reload(t, b.app, "books_journal_entries", entryID).GetString("number")
}

// arCharge posts a manual entry dated day: a debit of cents on Accounts
// receivable naming customer (none when nil), credited to income.
func arCharge(t *testing.T, b arBook, day string, customer *core.Record, cents int) *core.Record {
	t.Helper()
	return postJournal(t, b.app, "", day, "A/R charge",
		jnLine{account: b.receivable, debit: cents, position: 0, customer: partyID(customer)},
		jnLine{account: b.income, credit: cents, position: 1})
}

// arCredit posts a manual entry dated day: a credit of cents on Accounts
// receivable naming customer (none when nil), debited to income.
func arCredit(t *testing.T, b arBook, day string, customer *core.Record, cents int) *core.Record {
	t.Helper()
	return postJournal(t, b.app, "", day, "A/R credit",
		jnLine{account: b.income, debit: cents, position: 0},
		jnLine{account: b.receivable, credit: cents, position: 1, customer: partyID(customer)})
}

// arMixed is one customer with every kind of item (TestARAgingOpenItems).
type arMixed struct {
	customer, invoice, payment, unapplied, memo, entry *core.Record
}

// newARMixed posts, for a new customer "Mixed Co": an invoice of 2,000.00
// dated 2026-10-01 due 2026-10-31, a payment of 800.00 applied to it on
// 2026-11-03, an unapplied payment of 150.00 on 2026-10-02, a credit memo of
// 635.00 on 2026-10-20 and a manual Accounts receivable entry of 310.00 on
// 2026-09-01.
func newARMixed(t *testing.T, b arBook) arMixed {
	t.Helper()
	arJournalPrefix(t, b)
	c := mkCustomer(t, b.app, "Mixed Co", "")
	inv := arInvoice(t, b, c, "2026-10-01", "2026-10-31", 200000)
	return arMixed{
		customer:  c,
		invoice:   inv,
		payment:   arPayment(t, b, c, "2026-11-03", 80000, map[string]int{inv.Id: 80000}),
		unapplied: arPayment(t, b, c, "2026-10-02", 15000, nil),
		memo:      arCreditMemo(t, b, c, "2026-10-20", 63500),
		entry:     arCharge(t, b, "2026-09-01", c, 31000),
	}
}

func TestARAgingSpecLoads(t *testing.T) {
	b := newARBook(t)
	if err := reports.CheckSources(b.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}

	shipped := arAgingShipped()
	if arAgingKey != "books.ar_aging" || shipped.Key != arAgingKey {
		t.Errorf("key = %q (const %q), want books.ar_aging", shipped.Key, arAgingKey)
	}
	if shipped.Title != "A/R Aging" {
		t.Errorf("title = %q, want A/R Aging", shipped.Title)
	}
	if shipped.Description != "What each customer owes on one day, by how long each open invoice is past due." {
		t.Errorf("description = %q", shipped.Description)
	}
	if shipped.Revision != 1 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	if !jsonEqual(t, shipped.Spec, string(mustJSON(arAgingSpec()))) {
		t.Errorf("the shipped spec is not arAgingSpec()")
	}

	spec, _, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.Version != reports.CurrentVersion {
		t.Errorf("version %d, want %d", spec.Version, reports.CurrentVersion)
	}
	if spec.Source != "books.receivable_items" {
		t.Errorf("source = %q, want books.receivable_items", spec.Source)
	}
	if err := reports.Validate(b.app, spec); err != nil {
		t.Fatalf("Validate: %v", err)
	}

	paramIDs := make([]string, len(spec.Params))
	for i, p := range spec.Params {
		paramIDs[i] = p.ID
	}
	if !reflect.DeepEqual(paramIDs, []string{"asOf", "customers", "order"}) {
		t.Fatalf("params = %v, want asOf, customers, order", paramIDs)
	}
	asOf := paramOf(t, spec, "asOf")
	if asOf.Type != reports.ParamAsOf || asOf.Label != "As of" || !jsonEqual(t, asOf.Default, `{"preset":"today"}`) {
		t.Errorf("asOf = %+v (default %s), want As of, default Today", asOf, asOf.Default)
	}
	customers := paramOf(t, spec, "customers")
	if got, want := mustJSON(customers), mustJSON(customersParam()); string(got) != string(want) {
		t.Errorf("the customers param = %s, want customersParam() %s", got, want)
	}
	if customers.Header != "Customer: {label}" {
		t.Errorf("customers.header = %q, want \"Customer: {label}\"", customers.Header)
	}
	order := paramOf(t, spec, "order")
	wantOrder := []reports.Option{{Value: "name", Label: "Name"}, {Value: "balance", Label: "Largest balance"}}
	if order.Type != reports.ParamChoice || order.Label != "Order" || order.Multiple || order.OptionsFrom != nil ||
		!reflect.DeepEqual(order.Options, wantOrder) || !jsonEqual(t, order.Default, `"name"`) {
		t.Errorf("order = %+v (default %s), want a single choice Order: Name (default), Largest balance", order, order.Default)
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
		{ID: "byCustomer", Col: "customerKey", HideEmpty: true, Muted: true},
		{ID: "byItem", Col: "itemKey", Having: true},
	}
	if !reflect.DeepEqual(gotGroups, wantGroups) {
		t.Errorf("groups = %+v\nwant %+v", gotGroups, wantGroups)
	}

	if spec.Detail == nil || spec.Detail.Label == nil || spec.Detail.Open == nil {
		t.Errorf("detail = %+v, want a label and an open path", spec.Detail)
	}

	d := spec.Display
	if d == nil {
		t.Fatal("the shipped spec has no display")
	}
	if d.OneLine == nil || d.OneLine.MinWidth != "940px" {
		t.Errorf("display.oneLine = %+v, want minWidth 940px", d.OneLine)
	}
	figure := reports.ColumnFit{MinWidth: "max-content"}
	wantFit := map[string]reports.ColumnFit{
		"name": {WhiteSpace: "normal", LineClamp: 3},
		"due":  figure, "current": figure, "d30": figure, "d60": figure, "d90": figure, "d91": figure, "total": figure,
	}
	if !reflect.DeepEqual(d.Columns, wantFit) {
		t.Errorf("display.columns = %+v, want %+v", d.Columns, wantFit)
	}

	// A run shows the eight columns only; the hidden keys stay hidden.
	c := mkCustomer(t, b.app, "Shown Co", "")
	arInvoice(t, b, c, "2026-10-01", "2026-10-31", 10000)
	res := b.runOpen(t, nil, cbCustomerRow(t, b.run(t, nil), c).GroupKey)
	type colShape struct{ ID, Label string }
	gotCols := make([]colShape, len(res.Columns))
	for i, col := range res.Columns {
		gotCols[i] = colShape{col.ID, col.Label}
	}
	wantCols := []colShape{
		{"name", "Customer"}, {"due", "Due date"}, {"current", "Current"}, {"d30", "1 - 30"},
		{"d60", "31 - 60"}, {"d90", "61 - 90"}, {"d91", "91 and over"}, {"total", "Total"},
	}
	if !reflect.DeepEqual(gotCols, wantCols) {
		t.Errorf("result columns =\n%v\nwant\n%v", gotCols, wantCols)
	}
	// Only Due date has no cell above the item level, so the view does not
	// size it by its heading alone.
	for _, col := range res.Columns {
		if want := col.ID == "due"; col.BlankAbove != want {
			t.Errorf("result column %s BlankAbove = %v, want %v", col.ID, col.BlankAbove, want)
		}
	}
	if len(arItemsOf(t, res, cbCustomerRow(t, res, c))) == 0 {
		t.Fatalf("the opened customer has no item rows; rows %q", bsLabels(res))
	}
	for _, r := range res.Rows {
		for _, key := range []string{"topKey", "customerKey", "itemKey", "itemNo"} {
			if v, ok := r.Cells[key]; ok {
				t.Errorf("%s (%s) carries a %s cell %#v", r.Label, r.Kind, key, v)
			}
		}
	}
}

func TestARAgingAgeColumns(t *testing.T) {
	b := newARBook(t)
	family := mkCustomer(t, b.app, "Age family", "")
	cases := []struct {
		name, due, col string
		cents          int
		parent         string
	}{
		{name: "Age not yet due", due: "2026-11-30", col: "current", cents: 10100},
		{name: "Age 0", due: "2026-11-18", col: "current", cents: 20200},
		{name: "Age 1", due: "2026-11-17", col: "d30", cents: 40400},
		{name: "Age 30", due: "2026-10-19", col: "d30", cents: 80800},
		{name: "Age 31", due: "2026-10-18", col: "d60", cents: 161600},
		{name: "Age 90", due: "2026-08-20", col: "d90", cents: 323200},
		// A sub-customer, so the run has a family header and its total.
		{name: "Age 91", due: "2026-08-19", col: "d91", cents: 646400, parent: family.Id},
	}
	customers := map[string]*core.Record{}
	for _, c := range cases {
		customers[c.name] = mkCustomer(t, b.app, c.name, c.parent)
		arInvoice(t, b, customers[c.name], "2026-08-01", c.due, c.cents)
	}

	res := b.run(t, map[string]any{"asOf": "2026-11-18"})
	want := map[string]int64{}
	var total int64
	for _, c := range cases {
		row := cbCustomerRow(t, res, customers[c.name])
		requireFigs(t, c.name+" (due "+c.due+")", row, map[string]int64{c.col: int64(c.cents), "total": int64(c.cents)})
		want[c.col] += int64(c.cents)
		total += int64(c.cents)
	}
	want["total"] = total
	requireFigs(t, "the Total", totalOf(t, res), want)

	// Due date shows on an item row only.
	bsRow(t, res, "Total Age family")
	for _, r := range res.Rows {
		if r.Kind == reports.KindDetail {
			continue
		}
		if r.Kind == reports.KindGroup && r.Level == 3 {
			continue
		}
		if r.Cells["due"] != nil {
			t.Errorf("%q (%s, level %d) has a Due date %#v, want blank", r.Label, r.Kind, r.Level, r.Cells["due"])
		}
	}

	// A column with no money is blank on the Total row too; Total has a figure.
	one := b.run(t, map[string]any{"asOf": "2026-11-18", "customers": []string{customers["Age 31"].Id}})
	requireFigs(t, "the Total of Age 31 alone", totalOf(t, one), map[string]int64{"d60": 161600, "total": 161600})
	if r := totalOf(t, one); r.Cells["due"] != nil {
		t.Errorf("the Total has a Due date %#v, want blank", r.Cells["due"])
	}
}

func TestARAgingOpenItems(t *testing.T) {
	b := newARBook(t)
	m := newARMixed(t, b)

	res, row := b.openCustomer(t, nil, m.customer)
	items := arItemsOf(t, res, row)
	type itemShape struct {
		Label, Due string
		Figs       map[string]int64
	}
	got := make([]itemShape, len(items))
	for i, r := range items {
		got[i] = itemShape{r.Label, dueOf(r), arFigs(t, r)}
	}
	// As of 2026-11-18: ages 78, 47, 29 and 18.
	want := []itemShape{
		{"Journal entry " + m.entry.GetString("number"), "2026-09-01", map[string]int64{"d90": 31000, "total": 31000}},
		{"Payment " + m.unapplied.GetString("number"), "2026-10-02", map[string]int64{"d60": -15000, "total": -15000}},
		{"Credit memo " + m.memo.GetString("number"), "2026-10-20", map[string]int64{"d30": -63500, "total": -63500}},
		{"Invoice " + m.invoice.GetString("number"), "2026-10-31", map[string]int64{"d30": 120000, "total": 120000}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Mixed Co's items =\n%+v\nwant\n%+v", got, want)
	}
	for _, r := range items {
		if r.Depth != row.Depth+1 {
			t.Errorf("item %q at depth %d, want %d (under its customer)", r.Label, r.Depth, row.Depth+1)
		}
	}
	if sum, figs := arSumFigs(t, items), arFigs(t, row); !reflect.DeepEqual(sum, figs) {
		t.Errorf("the items add up to %v, want the customer row's %v", sum, figs)
	}
	requireFigs(t, "Mixed Co", row, map[string]int64{"d30": 56500, "d60": -15000, "d90": 31000, "total": 72500})

	// Two invoices with one due date: number order, though the later number
	// is dated earlier.
	twin := mkCustomer(t, b.app, "Twin Co", "")
	first := arInvoice(t, b, twin, "2026-10-05", "2026-10-31", 11100)
	second := arInvoice(t, b, twin, "2026-10-01", "2026-10-31", 22200)
	twinRes, twinRow := b.openCustomer(t, nil, twin)
	labels := labelsOf(arItemsOf(t, twinRes, twinRow))
	if wantLabels := []string{"Invoice " + first.GetString("number"), "Invoice " + second.GetString("number")}; !reflect.DeepEqual(labels, wantLabels) {
		t.Errorf("Twin Co's items = %q, want %q (one due date: by number)", labels, wantLabels)
	}
}

func TestARAgingAsOfDay(t *testing.T) {
	b := newARBook(t)
	m := newARMixed(t, b)

	before, item := b.openItem(t, map[string]any{"asOf": "2026-11-02"}, m.customer, m.invoice.Id)
	if v, _ := agedCell(t, item, "total"); v != 200000 {
		t.Errorf("as of 2026-11-02 (before the payment) the invoice item = %d, want 200000", v)
	}
	for _, l := range arLinesOf(t, before, item) {
		if strings.Contains(l.Label, "Payment") {
			t.Errorf("as of 2026-11-02 the invoice item has the line %q, want no payment line", l.Label)
		}
	}

	_, item = b.openItem(t, map[string]any{"asOf": "2026-11-03"}, m.customer, m.invoice.Id)
	if v, _ := agedCell(t, item, "total"); v != 120000 {
		t.Errorf("as of 2026-11-03 the invoice item = %d, want 120000", v)
	}

	early, _ := b.openCustomer(t, map[string]any{"asOf": "2026-09-30"}, m.customer)
	if r, ok := arItemRow(early, m.invoice.Id); ok {
		t.Errorf("as of 2026-09-30 (before the invoice's date) the invoice has the item %q", r.Label)
	}

	res := runAR(t, b.app, b.reader, nil, reports.Options{Today: "2026-11-18"})
	if got := fmt.Sprint(resolvedAsOf(t, res)); got != "2026-11-18" {
		t.Errorf("with no asOf the run resolved As of to %s, want the reader's today 2026-11-18", got)
	}
}

func TestARAgingHiddenItems(t *testing.T) {
	t.Run("an invoice paid in full", func(t *testing.T) {
		b := newARBook(t)
		paidOnly := mkCustomer(t, b.app, "Paid Co", "")
		inv := arInvoice(t, b, paidOnly, "2026-10-01", "2026-10-31", 40000)
		arPayment(t, b, paidOnly, "2026-10-05", 40000, map[string]int{inv.Id: 40000})
		half := mkCustomer(t, b.app, "Half Co", "")
		paid := arInvoice(t, b, half, "2026-10-01", "2026-10-31", 30000)
		arPayment(t, b, half, "2026-10-05", 30000, map[string]int{paid.Id: 30000})
		open := arInvoice(t, b, half, "2026-10-02", "2026-11-01", 50000)

		res, row := b.openCustomer(t, nil, half)
		if cbHasCustomer(res, paidOnly) {
			t.Errorf("a customer whose only invoice is paid in full has a row; rows %q", bsLabels(res))
		}
		if r, ok := arItemRow(res, paid.Id); ok {
			t.Errorf("an invoice paid in full has the item %q", r.Label)
		}
		if got, want := labelsOf(arItemsOf(t, res, row)), []string{"Invoice " + open.GetString("number")}; !reflect.DeepEqual(got, want) {
			t.Errorf("Half Co's items = %q, want %q", got, want)
		}
	})

	t.Run("an overpayment", func(t *testing.T) {
		b := newARBook(t)
		c := mkCustomer(t, b.app, "Over Co", "")
		inv := arInvoice(t, b, c, "2026-10-01", "2026-10-31", 20000)
		p := arPayment(t, b, c, "2026-10-05", 50000, map[string]int{inv.Id: 20000})
		res, row := b.openCustomer(t, nil, c)
		items := arItemsOf(t, res, row)
		if len(items) != 1 || items[0].Label != "Payment "+p.GetString("number") {
			t.Fatalf("Over Co's items = %q, want only %q", labelsOf(items), "Payment "+p.GetString("number"))
		}
		if dueOf(items[0]) != "2026-10-05" {
			t.Errorf("the credit's due date = %q, want the payment's date 2026-10-05", dueOf(items[0]))
		}
		// Age 44 on 2026-11-18.
		requireFigs(t, "the unapplied part", items[0], map[string]int64{"d60": -30000, "total": -30000})
	})

	t.Run("a voided invoice", func(t *testing.T) {
		b := newARBook(t)
		c := mkCustomer(t, b.app, "Void Co", "")
		voided := arInvoice(t, b, c, "2026-10-01", "2026-10-31", 30000)
		open := arInvoice(t, b, c, "2026-10-02", "2026-11-01", 10000)
		if err := voidInvoiceAs(b.app, voided.Id, b.docs.users.admin.Id); err != nil {
			t.Fatalf("void the invoice: %v", err)
		}
		res, row := b.openCustomer(t, nil, c)
		if r, ok := arItemRow(res, voided.Id); ok {
			t.Errorf("a voided invoice has the item %q", r.Label)
		}
		if got, want := labelsOf(arItemsOf(t, res, row)), []string{"Invoice " + open.GetString("number")}; !reflect.DeepEqual(got, want) {
			t.Errorf("Void Co's items = %q, want %q", got, want)
		}
	})

	t.Run("a voided manual entry", func(t *testing.T) {
		b := newARBook(t)
		arJournalPrefix(t, b)
		c := mkCustomer(t, b.app, "Void JE Co", "")
		open := arInvoice(t, b, c, "2026-08-01", "2026-08-31", 10000)
		je := arCharge(t, b, "2026-09-01", c, 31000)
		line := arLineOf(t, b, je.Id)
		if err := setStatus(b.app, je.Id, statusVoid, b.docs.users.admin.Id); err != nil {
			t.Fatalf("void the entry: %v", err)
		}
		voidDay := findReversal(t, b.app, je.Id).GetString("date")
		if voidDay != "2026-09-01" {
			t.Fatalf("the reversal is dated %s, want the entry's day 2026-09-01", voidDay)
		}
		for _, day := range []string{voidDay, "2026-11-18"} {
			res, row := b.openCustomer(t, map[string]any{"asOf": day}, c)
			if r, ok := arItemRow(res, line.Id); ok {
				t.Errorf("as of %s the voided entry has the item %q", day, r.Label)
			}
			if got, want := labelsOf(arItemsOf(t, res, row)), []string{"Invoice " + open.GetString("number")}; !reflect.DeepEqual(got, want) {
				t.Errorf("as of %s Void JE Co's items = %q, want %q", day, got, want)
			}
		}
	})

	t.Run("a voided payment", func(t *testing.T) {
		b := newARBook(t)
		c := mkCustomer(t, b.app, "Unpaid Co", "")
		inv := arInvoice(t, b, c, "2026-10-01", "2026-10-31", 40000)
		p := arPayment(t, b, c, "2026-10-05", 30000, map[string]int{inv.Id: 30000})
		if err := voidPaymentAs(b.app, p.Id, b.docs.users.admin.Id); err != nil {
			t.Fatalf("void the payment: %v", err)
		}
		res, row := b.openCustomer(t, nil, c)
		if r, ok := arItemRow(res, p.Id); ok {
			t.Errorf("a voided payment has the item %q", r.Label)
		}
		if got := labelsOf(arItemsOf(t, res, row)); len(got) != 1 {
			t.Errorf("Unpaid Co's items = %q, want the invoice only", got)
		}
		requireFigs(t, "the invoice after the void", requireItemRow(t, res, inv.Id), map[string]int64{"d30": 40000, "total": 40000})
	})

	t.Run("a corrected payment", func(t *testing.T) {
		b := newARBook(t)
		c := mkCustomer(t, b.app, "Corrected Co", "")
		first := arInvoice(t, b, c, "2026-08-04", "2026-09-03", 30000)
		second := arInvoice(t, b, c, "2026-08-05", "2026-09-04", 40000)
		original := arPayment(t, b, c, "2026-09-10", 70000, map[string]int{first.Id: 30000, second.Id: 25000})
		draft := b.docs.mkPayment(t, map[string]any{
			"customer": c.Id, "replaces": original.Id, "date": "2026-09-10", "amount": 70000,
		})
		arApply(t, b, draft, map[string]int{first.Id: 30000, second.Id: 30000})
		mustPostPayment(t, b.app, draft.Id, b.docs.users.bookkeeper.Id)

		res, _ := b.openCustomer(t, nil, c)
		for what, id := range map[string]string{"the replaced payment": original.Id, "the invoice paid in full": first.Id} {
			if r, ok := arItemRow(res, id); ok {
				t.Errorf("%s has the item %q", what, r.Label)
			}
		}
		// Due 2026-09-04 and 2026-09-10: ages 75 and 69 on 2026-11-18.
		requireFigs(t, "the second invoice less the new application", requireItemRow(t, res, second.Id),
			map[string]int64{"d90": 10000, "total": 10000})
		requireFigs(t, "the correction's credit", requireItemRow(t, res, draft.Id),
			map[string]int64{"d90": -10000, "total": -10000})
	})
}

func TestARAgingItemLines(t *testing.T) {
	b := newARBook(t)
	m := newARMixed(t, b)

	res, item := b.openItem(t, nil, m.customer, m.invoice.Id)
	lines := arLinesOf(t, res, item)
	type lineShape struct {
		Label, Open, Due string
		Figs             map[string]int64
	}
	got := make([]lineShape, len(lines))
	for i, l := range lines {
		got[i] = lineShape{l.Label, l.Open, dueOf(l), arFigs(t, l)}
	}
	want := []lineShape{
		{
			"2026-10-01 · Invoice " + entryNumber(t, b, m.invoice.GetString("entry")),
			"books/invoices/" + m.invoice.Id, "", map[string]int64{"d30": 200000, "total": 200000},
		},
		{
			"2026-11-03 · Payment " + entryNumber(t, b, m.payment.GetString("entry")),
			"books/payments/" + m.payment.Id, "", map[string]int64{"d30": -80000, "total": -80000},
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("the part-paid invoice's lines =\n%+v\nwant\n%+v", got, want)
	}
	if sum, figs := arSumFigs(t, lines), arFigs(t, item); !reflect.DeepEqual(sum, figs) {
		t.Errorf("the lines add up to %v, want the item's %v", sum, figs)
	}

	jeRes, jeItem := b.openItem(t, nil, m.customer, arLineOf(t, b, m.entry.Id).Id)
	jeLines := arLinesOf(t, jeRes, jeItem)
	if len(jeLines) != 1 || jeLines[0].Open != "books/entries/"+m.entry.Id {
		t.Errorf("the journal item's lines = %+v, want one that opens books/entries/%s", jeLines, m.entry.Id)
	}

	// Two lines of one day: posting order. Each order is read once, so a
	// tie broken by row id fails one of the two.
	c := mkCustomer(t, b.app, "Same Day Co", "")
	inv := arInvoice(t, b, c, "2026-10-01", "2026-10-31", 50000)
	p1 := arPayment(t, b, c, "2026-11-05", 10000, map[string]int{inv.Id: 10000})
	p2 := arPayment(t, b, c, "2026-11-05", 20000, map[string]int{inv.Id: 20000})
	paymentFigs := func() []int64 {
		res, item := b.openItem(t, nil, c, inv.Id)
		lines := arLinesOf(t, res, item)
		if len(lines) != 3 {
			t.Fatalf("Same Day Co's invoice has lines %q, want the invoice's and two payments'", labelsOf(lines))
		}
		out := []int64{}
		for _, l := range lines[1:] {
			v, _ := agedCell(t, l, "total")
			out = append(out, v)
		}
		return out
	}
	setPostedAt(t, b.app, p1.GetString("entry"), "2026-11-12 10:00:00.000Z")
	setPostedAt(t, b.app, p2.GetString("entry"), "2026-11-12 09:00:00.000Z")
	if got := paymentFigs(); !reflect.DeepEqual(got, []int64{-20000, -10000}) {
		t.Errorf("the payment lines of one day = %v, want [-20000 -10000] (the 200.00 posted first)", got)
	}
	setPostedAt(t, b.app, p1.GetString("entry"), "2026-11-12 08:00:00.000Z")
	if got := paymentFigs(); !reflect.DeepEqual(got, []int64{-10000, -20000}) {
		t.Errorf("the payment lines of one day = %v, want [-10000 -20000] (the 100.00 posted first)", got)
	}
}

func TestARAgingFamilies(t *testing.T) {
	b := newARBook(t)
	day, due := "2026-10-01", "2026-10-31"
	paidInFull := func(c *core.Record, cents int) {
		inv := arInvoice(t, b, c, day, due, cents)
		arPayment(t, b, c, "2026-10-05", cents, map[string]int{inv.Id: cents})
	}

	solo := mkCustomer(t, b.app, "Solo Co", "")
	arInvoice(t, b, solo, day, due, 10000)

	parent := mkCustomer(t, b.app, "Family Parent", "")
	beta := mkCustomer(t, b.app, "beta sub", parent.Id)
	alpha := mkCustomer(t, b.app, "Alpha sub", parent.Id)
	arInvoice(t, b, parent, day, due, 20000)
	arInvoice(t, b, beta, day, "2026-11-15", 30000)
	arInvoice(t, b, alpha, day, due, 40000)

	lonely := mkCustomer(t, b.app, "Lonely Parent", "")
	arInvoice(t, b, mkCustomer(t, b.app, "Lonely sub", lonely.Id), day, due, 5000)

	keeper := mkCustomer(t, b.app, "Keeper Parent", "")
	arInvoice(t, b, keeper, day, due, 6000)
	paidInFull(mkCustomer(t, b.app, "Keeper sub", keeper.Id), 7000)

	gone := mkCustomer(t, b.app, "Gone Parent", "")
	paidInFull(gone, 8000)
	paidInFull(mkCustomer(t, b.app, "Gone sub", gone.Id), 9000)

	res := b.run(t, nil)
	g, s := reports.KindGroup, reports.KindSubtotal

	soloAt := slices.IndexFunc(res.Rows, func(r reports.Row) bool {
		return r.Kind == g && r.Level == 2 && cbCustomerOf(r) == solo.Id
	})
	if soloAt < 0 {
		t.Fatalf("no customer row for Solo Co; rows %q", bsLabels(res))
	}
	if r := res.Rows[soloAt]; r.Label != "Solo Co" || r.Depth != 0 {
		t.Errorf("Solo Co = %+v, want a customer group row at depth 0", cbShapeOf(r))
	}
	if soloAt > 0 {
		if before := res.Rows[soloAt-1]; before.Kind == g && before.Level == 1 && len(before.GroupKey) > 0 && before.GroupKey[0] == solo.Id {
			t.Errorf("the row before Solo Co is its family header: %+v", cbShapeOf(before))
		}
	}
	if bsHas(res, "Total Solo Co") {
		t.Errorf("a customer with no sub-customers has a total row; rows %q", bsLabels(res))
	}

	shapes := func(rows []reports.Row) []cbShape {
		out := make([]cbShape, len(rows))
		for i, r := range rows {
			out[i] = cbShapeOf(r)
		}
		return out
	}
	family := cbFamily(t, res, "Family Parent")
	wantFamily := []cbShape{
		{"Family Parent", g, 0, true},
		{"Family Parent", g, 1, false},
		{"Alpha sub", g, 1, false},
		{"beta sub", g, 1, false},
		{"Total Family Parent", s, 0, false},
	}
	if got := shapes(family); !reflect.DeepEqual(got, wantFamily) {
		t.Fatalf("Family Parent's rows (label, kind, depth, expanded) =\n%v\nwant\n%v", got, wantFamily)
	}
	if family[1].Level != 2 || cbCustomerOf(family[1]) != parent.Id {
		t.Errorf("the row after the header = level %d customer %q, want the parent's own row", family[1].Level, cbCustomerOf(family[1]))
	}
	if sum, figs := arSumFigs(t, family[1:4]), arFigs(t, family[4]); !reflect.DeepEqual(sum, figs) || figs["total"] != 90000 {
		t.Errorf("Total Family Parent = %v, want the three rows' sum %v (total 90000)", figs, sum)
	}

	lonelyRows := cbFamily(t, res, "Lonely Parent")
	if got, want := shapes(lonelyRows), []cbShape{
		{"Lonely Parent", g, 0, true}, {"Lonely sub", g, 1, false}, {"Total Lonely Parent", s, 0, false},
	}; !reflect.DeepEqual(got, want) {
		t.Errorf("Lonely Parent's rows =\n%v\nwant\n%v", got, want)
	}

	// D7: a sub-customer with no open item keeps the family's header and total.
	keeperRows := cbFamily(t, res, "Keeper Parent")
	if got, want := shapes(keeperRows), []cbShape{
		{"Keeper Parent", g, 0, true}, {"Keeper Parent", g, 1, false}, {"Total Keeper Parent", s, 0, false},
	}; !reflect.DeepEqual(got, want) {
		t.Errorf("Keeper Parent's rows =\n%v\nwant\n%v (D7: the family keeps its header and total)", got, want)
	}

	for _, label := range []string{"Gone Parent", "Total Gone Parent", "Gone sub"} {
		if bsHas(res, label) {
			t.Errorf("a family with no shown customer has the row %q", label)
		}
	}

	// An opened customer inside a family has its items at depth 2, an inlined
	// one at depth 1.
	opened := b.runOpen(t, nil, cbCustomerRow(t, res, alpha).GroupKey, cbCustomerRow(t, res, solo).GroupKey)
	for c, depth := range map[*core.Record]int{alpha: 2, solo: 1} {
		items := arItemsOf(t, opened, cbCustomerRow(t, opened, c))
		if len(items) != 1 {
			t.Fatalf("%s opened has items %q, want one", c.GetString("display_name"), labelsOf(items))
		}
		if items[0].Depth != depth {
			t.Errorf("%s's item is at depth %d, want %d", c.GetString("display_name"), items[0].Depth, depth)
		}
	}
}

func TestARAgingNoCustomer(t *testing.T) {
	b := newARBook(t)
	arJournalPrefix(t, b)
	zed := mkCustomer(t, b.app, "Zed Co", "")
	arCharge(t, b, "2026-10-01", zed, 5000)
	arCharge(t, b, "2026-10-01", mkCustomer(t, b.app, "Able Co", ""), 6000)
	none := arCharge(t, b, "2026-09-02", nil, 12000)

	res := b.run(t, nil)
	at := slices.IndexFunc(res.Rows, func(r reports.Row) bool { return r.Label == "No customer" })
	if at < 0 {
		t.Fatalf("no No customer row; rows %q", bsLabels(res))
	}
	row := res.Rows[at]
	if row.Kind != reports.KindGroup || row.Depth != 0 {
		t.Errorf("No customer = %+v, want a group row at depth 0", cbShapeOf(row))
	}
	for _, r := range res.Rows[at+1:] {
		if r.Kind != reports.KindTotal {
			t.Errorf("row %q (%s) after No customer, want the Total only", r.Label, r.Kind)
		}
	}
	if total := slices.IndexFunc(res.Rows, func(r reports.Row) bool { return r.Kind == reports.KindTotal }); total != at+1 {
		t.Errorf("the Total is at %d, want right after No customer (%d)", total, at+1)
	}

	opened := b.runOpen(t, nil, row.GroupKey)
	openedRow := bsRow(t, opened, "No customer")
	items := arItemsOf(t, opened, openedRow)
	if got, want := labelsOf(items), []string{"Journal entry " + none.GetString("number")}; !reflect.DeepEqual(got, want) {
		t.Errorf("No customer opened = %q, want %q", got, want)
	}

	if picked := b.run(t, map[string]any{"customers": []string{zed.Id}}); bsHas(picked, "No customer") {
		t.Errorf("with a customer picked the No customer row shows; rows %q", bsLabels(picked))
	}
}

func TestARAgingInactive(t *testing.T) {
	b := newARBook(t)
	parent := mkCustomer(t, b.app, "Muted Family", "")
	sleepy := mkCustomer(t, b.app, "Sleepy sub", parent.Id)
	awake := mkCustomer(t, b.app, "Awake sub", parent.Id)
	arInvoice(t, b, sleepy, "2026-10-01", "2026-10-31", 10000)
	arInvoice(t, b, awake, "2026-10-01", "2026-10-31", 20000)
	if err := setCustomer(t, b.app, sleepy.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Sleepy sub inactive: %v", err)
	}

	res := b.run(t, nil)
	sleepyRow := cbCustomerRow(t, res, sleepy)
	if !sleepyRow.Muted || sleepyRow.Label != "Sleepy sub (inactive)" {
		t.Errorf("the inactive customer = label %q muted %v, want \"Sleepy sub (inactive)\" muted", sleepyRow.Label, sleepyRow.Muted)
	}
	awakeRow := cbCustomerRow(t, res, awake)
	if awakeRow.Muted || strings.HasSuffix(awakeRow.Label, " (inactive)") {
		t.Errorf("the active customer = label %q muted %v, want \"Awake sub\" not muted", awakeRow.Label, awakeRow.Muted)
	}
	for _, r := range []reports.Row{bsRow(t, res, "Muted Family"), bsRow(t, res, "Total Muted Family"), totalOf(t, res)} {
		if r.Muted {
			t.Errorf("%q (%s) is muted, want never", r.Label, r.Kind)
		}
	}
}

func TestARAgingCustomersParam(t *testing.T) {
	b := newARBook(t)
	a := mkCustomer(t, b.app, "Aspen Co", "")
	arInvoice(t, b, a, "2026-10-01", "2026-10-31", 10000)
	parent := mkCustomer(t, b.app, "Pick Family", "")
	s1 := mkCustomer(t, b.app, "Pick one", parent.Id)
	s2 := mkCustomer(t, b.app, "Pick two", parent.Id)
	arInvoice(t, b, parent, "2026-10-01", "2026-10-31", 20000)
	arInvoice(t, b, s1, "2026-10-01", "2026-10-31", 30000)
	arInvoice(t, b, s2, "2026-10-01", "2026-10-31", 40000)

	res := b.run(t, map[string]any{"customers": []string{a.Id}})
	if got := labelsOf(cbCustomerRows(res)); !reflect.DeepEqual(got, []string{"Aspen Co"}) {
		t.Errorf("customers = [Aspen Co]: customer rows %q, want only Aspen Co", got)
	}
	requireFigs(t, "the Total of Aspen Co alone", totalOf(t, res), arFigs(t, cbCustomerRow(t, res, a)))
	if !slices.Contains(res.HeaderLines, "Customer: Aspen Co") {
		t.Errorf("header lines = %q, want \"Customer: Aspen Co\"", res.HeaderLines)
	}

	subs := b.run(t, map[string]any{"customers": []string{s1.Id, s2.Id}})
	shapes := []cbShape{}
	for _, r := range cbFamily(t, subs, "Pick Family") {
		shapes = append(shapes, cbShapeOf(r))
	}
	want := []cbShape{
		{"Pick Family", reports.KindGroup, 0, true},
		{"Pick one", reports.KindGroup, 1, false},
		{"Pick two", reports.KindGroup, 1, false},
		{"Total Pick Family", reports.KindSubtotal, 0, false},
	}
	if !reflect.DeepEqual(shapes, want) {
		t.Errorf("every sub-customer of Pick Family picked =\n%v\nwant\n%v (no parent's own row)", shapes, want)
	}
	if cbHasCustomer(subs, parent) {
		t.Errorf("the parent's own row shows though only its sub-customers are picked")
	}
}

func TestARAgingOrder(t *testing.T) {
	// Spec Q9: No customer is after every customer under both orders, also
	// when its total is larger than every customer's. A sub-test, so a
	// failure of the main case below does not hide it.
	t.Run("a large No customer is still last", func(t *testing.T) {
		b := newARBook(t)
		arJournalPrefix(t, b)
		arCharge(t, b, "2026-11-02", mkCustomer(t, b.app, "Kilo", ""), 2000)
		arCharge(t, b, "2026-11-02", mkCustomer(t, b.app, "lima", ""), 3000)
		arCharge(t, b, "2026-11-02", nil, 90000)
		for order, want := range map[string][]string{
			"name":    {"Kilo", "lima", "No customer"},
			"balance": {"lima", "Kilo", "No customer"},
		} {
			res := b.run(t, map[string]any{"order": order})
			if got := cbDepth0(res); !reflect.DeepEqual(got, want) {
				t.Errorf("order = %s with No customer at 900.00: depth-0 rows %q, want %q (No customer last whatever its total)", order, got, want)
			}
		}
	})

	b := newARBook(t)
	arJournalPrefix(t, b)
	// Delta posts first, so its two items are JE-1 and JE-2 of one day: by
	// number the 10.00 is first, by balance the 20.00 would be.
	delta := mkCustomer(t, b.app, "Delta", "")
	arCharge(t, b, "2026-11-02", delta, 1000)
	arCharge(t, b, "2026-11-02", delta, 2000)
	// bravo ties Delta at 30.00; its items' figures are not in due-date order.
	bravo := mkCustomer(t, b.app, "bravo", "")
	arCharge(t, b, "2026-11-03", bravo, 2500)
	arCharge(t, b, "2026-11-02", bravo, 1000)
	arCredit(t, b, "2026-11-04", bravo, 500)
	// A family whose total (70.00) is the largest, though the parent's own
	// row (10.00) is smaller than a sub-customer's.
	charlie := mkCustomer(t, b.app, "Charlie", "")
	arCharge(t, b, "2026-11-02", charlie, 1000)
	arCharge(t, b, "2026-11-02", mkCustomer(t, b.app, "zulu sub", charlie.Id), 4000)
	arCharge(t, b, "2026-11-02", mkCustomer(t, b.app, "Alpha sub", charlie.Id), 2000)
	// A credit Total.
	arCredit(t, b, "2026-11-02", mkCustomer(t, b.app, "Echo", ""), 500)
	// A No customer credit; the sub-test below holds a No customer total
	// larger than every customer's.
	arCredit(t, b, "2026-11-02", nil, 1500)

	family := func(res *reports.Result) []string {
		return labelsOf(cbFamily(t, res, "Charlie")[1:4])
	}
	itemFigs := func(order string, c *core.Record) []int64 {
		res, row := b.openCustomer(t, map[string]any{"order": order}, c)
		out := []int64{}
		for _, r := range arItemsOf(t, res, row) {
			v, _ := agedCell(t, r, "total")
			out = append(out, v)
		}
		return out
	}

	byName := b.run(t, map[string]any{"order": "name"})
	if got, want := cbDepth0(byName), []string{"bravo", "Charlie", "Delta", "Echo", "No customer"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = name: depth-0 rows %q, want %q (name order ignoring case, No customer last)", got, want)
	}
	if got, want := family(byName), []string{"Charlie", "Alpha sub", "zulu sub"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = name: Charlie's family %q, want %q (the parent's own row, then by name)", got, want)
	}
	if byDefault := b.run(t, nil); !reflect.DeepEqual(bsLabels(byDefault), bsLabels(byName)) {
		t.Errorf("no Order param gives %q, want Name's %q", bsLabels(byDefault), bsLabels(byName))
	}

	byBalance := b.run(t, map[string]any{"order": "balance"})
	if got, want := cbDepth0(byBalance), []string{"Charlie", "bravo", "Delta", "Echo", "No customer"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = balance: depth-0 rows %q, want %q (largest first, a family by its total, ties by name, the credit last, No customer last)", got, want)
	}
	if got, want := family(byBalance), []string{"Charlie", "zulu sub", "Alpha sub"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = balance: Charlie's family %q, want %q (the parent's own row, then largest first)", got, want)
	}

	// D6: under both orders an opened customer's items are by due date, then
	// number; Largest balance never orders the items.
	for _, order := range []string{"name", "balance"} {
		if got := itemFigs(order, bravo); !reflect.DeepEqual(got, []int64{1000, 2500, -500}) {
			t.Errorf("order = %s: bravo's items = %v, want [1000 2500 -500] (due-date order)", order, got)
		}
		if got := itemFigs(order, delta); !reflect.DeepEqual(got, []int64{1000, 2000}) {
			t.Errorf("order = %s: Delta's items = %v, want [1000 2000] (one due date: by number)", order, got)
		}
	}
}

// D6: items of one due date are in number order, the number as an integer:
// JE-9 before JE-10 and invoice 999 before 1000, where text puts "JE-10" and
// "1000" first.
func TestARAgingItemNumberOrder(t *testing.T) {
	b := newARBook(t)
	arJournalPrefix(t, b)
	if err := setFields(t, b.app, "books_doc_sequences", "booksseqjournal", map[string]any{"next_number": 9}); err != nil {
		t.Fatalf("set the journal sequence to 9: %v", err)
	}
	if err := setFields(t, b.app, "books_doc_sequences", "booksseqinvoice", map[string]any{"next_number": 999}); err != nil {
		t.Fatalf("set the invoice sequence to 999: %v", err)
	}

	journal := mkCustomer(t, b.app, "Journal Co", "")
	je9 := arCharge(t, b, "2026-11-02", journal, 1000)
	je10 := arCharge(t, b, "2026-11-02", journal, 2000)
	if got := []string{je9.GetString("number"), je10.GetString("number")}; !reflect.DeepEqual(got, []string{"JE-9", "JE-10"}) {
		t.Fatalf("the manual entries are numbered %q, want JE-9 and JE-10", got)
	}

	invoices := mkCustomer(t, b.app, "Invoice Co", "")
	inv999 := arInvoice(t, b, invoices, "2026-10-01", "2026-10-31", 3000)
	inv1000 := arInvoice(t, b, invoices, "2026-10-01", "2026-10-31", 4000)
	if got := []string{inv999.GetString("number"), inv1000.GetString("number")}; !reflect.DeepEqual(got, []string{"999", "1000"}) {
		t.Fatalf("the invoices are numbered %q, want 999 and 1000", got)
	}

	for _, order := range []string{"name", "balance"} {
		params := map[string]any{"order": order}
		for _, tc := range []struct {
			customer *core.Record
			want     []string
		}{
			{journal, []string{journalItem(t, b, je9), journalItem(t, b, je10)}},
			{invoices, []string{inv999.Id, inv1000.Id}},
		} {
			res, row := b.openCustomer(t, params, tc.customer)
			got := []string{}
			for _, r := range arItemsOf(t, res, row) {
				own, _ := r.GroupKey[2].(string)
				got = append(got, own)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Errorf("order = %s: %s's items %q (labels %q), want %q (one due date: by number as an integer)",
					order, tc.customer.GetString("display_name"), got, labelsOf(arItemsOf(t, res, row)), tc.want)
			}
		}
	}
}

// journalItem is the item of a manual entry's one Accounts receivable line:
// the line itself.
func journalItem(t *testing.T, b arBook, entry *core.Record) string {
	t.Helper()
	return arLineOf(t, b, entry.Id).Id
}

func TestARAgingTies(t *testing.T) {
	b := newARBook(t)
	customers := arTieBook(t, b)
	for _, day := range []string{arToday, "2026-09-15"} {
		t.Run("as of "+day, func(t *testing.T) {
			opts := reports.Options{Today: day}
			res := runAR(t, b.app, b.reader, map[string]any{"asOf": day}, opts)
			cb := runCB(t, b.app, b.reader, map[string]any{"asOf": day}, opts)
			bs := runBS(t, b.app, b.reader, map[string]any{"asOf": day}, opts)
			balances := partyBalances(t, b.app)
			for _, c := range customers {
				row, ok := cbGroupRow(res, 2, c.Id)
				cbRow, cbOK := cbGroupRow(cb, 2, c.Id)
				if cbOK && !ok {
					t.Errorf("%s: the Customer Balance has a row, A/R Aging has none; want A/R Aging to show it", c.GetString("display_name"))
					continue
				}
				if !ok {
					continue
				}
				got := amt(t, row, "total")
				// A customer whose open items add to 0 shows in A/R Aging, while
				// the Customer Balance hides a zero balance by default.
				if !cbOK {
					if got != 0 {
						t.Errorf("%s: A/R Aging Total %d with no Customer Balance row, want 0", c.GetString("display_name"), got)
					}
					if day == arToday {
						if want, found := balances[c.Id]; found && want != 0 {
							t.Errorf("%s: A/R Aging Total %d with no Customer Balance row, but its books_party_balances balance is %d, want 0 or no row",
								c.GetString("display_name"), got, want)
						}
					}
					requireAgesAddUp(t, row)
					continue
				}
				if want := amt(t, cbRow, "balance"); got != want {
					t.Errorf("%s: Total %d, want its Customer Balance %d", c.GetString("display_name"), got, want)
				}
				if day == arToday {
					if want, found := balances[c.Id]; !found || got != int64(want) {
						t.Errorf("%s: Total %d, want its books_party_balances balance %d (found %v)", c.GetString("display_name"), got, want, found)
					}
				}
			}
			for _, cbRow := range cbCustomerRows(cb) {
				if _, ok := cbGroupRow(res, 2, cbCustomerOf(cbRow)); !ok {
					t.Errorf("%q: the Customer Balance has a row, A/R Aging has none", cbRow.Label)
				}
			}
			if day == arToday && len(cbCustomerRows(res)) == 0 {
				t.Fatalf("the tie book has no customer row today; rows %q", bsLabels(res))
			}
			total := amt(t, totalOf(t, res), "total")
			if want := amt(t, totalOf(t, cb), "balance"); total != want {
				t.Errorf("the Total %d, want the Customer Balance Total %d", total, want)
			}
			if want := amt(t, bsAccount(t, bs, b.receivable), "current"); total != want {
				t.Errorf("the Total %d, want the Balance Sheet's Accounts receivable %d", total, want)
			}
			for _, r := range res.Rows {
				if (r.Kind == reports.KindGroup && r.Level == 2) || r.Kind == reports.KindSubtotal || r.Kind == reports.KindTotal {
					requireAgesAddUp(t, r)
				}
			}
		})
	}
}

func TestARAgingEmpty(t *testing.T) {
	b := newARBook(t)
	c := mkCustomer(t, b.app, "October Co", "")
	arInvoice(t, b, c, "2026-10-01", "2026-10-31", 10000)
	if !cbHasCustomer(b.run(t, nil), c) {
		t.Fatal("today has no row for October Co: the book must hold an open item")
	}
	res := b.run(t, map[string]any{"asOf": "2026-09-30"})
	if groups := cbGroupRows(res); len(groups) != 0 {
		t.Errorf("a day before every line has group rows %q", labelsOf(groups))
	}
}

func TestARAgingNoAccess(t *testing.T) {
	b := newARBook(t)
	c := mkCustomer(t, b.app, "Seen Co", "")
	arInvoice(t, b, c, "2026-10-01", "2026-10-31", 10000)
	if !cbHasCustomer(b.run(t, nil), c) {
		t.Fatal("the Books reader does not see Seen Co")
	}
	res, err := runARErr(t, b.app, b.none, nil, reports.Options{})
	if err != nil {
		t.Fatalf("the run of a user with Books level none was refused (%v); core runs it with the rule's rows", err)
	}
	if rows := cbCustomerRows(res); len(rows) != 0 {
		t.Errorf("a user with Books level none sees customer rows %q", labelsOf(rows))
	}
}

func TestARAgingTopics(t *testing.T) {
	b := newARBook(t)
	arInvoice(t, b, mkCustomer(t, b.app, "Topic Co", ""), "2026-10-01", "2026-10-31", 10000)
	res := b.run(t, nil)
	if len(cbCustomerRows(res)) == 0 {
		t.Fatalf("the run has no customer row; rows %q", bsLabels(res))
	}
	for _, topic := range []string{
		"collection/books_journal_lines",
		"collection/books_journal_entries",
		"collection/books_accounts",
		"collection/books_invoices",
		"collection/books_payments",
		"collection/books_payment_applications",
		"collection/books_customers",
		"collection/books_settings",
	} {
		if !slices.Contains(res.Topics, topic) {
			t.Errorf("topics = %v, want %s", res.Topics, topic)
		}
	}
}

// Register ships the A/R Aging; core creates it unpublished, and Books shares
// it with every Books reader.
func TestARAgingShippedShared(t *testing.T) {
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
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": arAgingKey})
	if err != nil {
		t.Fatalf("no reports row with shipped_key %s: %v", arAgingKey, err)
	}
	if row.GetBool("published") || row.GetString("published_by") != "" {
		t.Errorf("published = %v (by %q), want unpublished", row.GetBool("published"), row.GetString("published_by"))
	}
	if row.GetString("title") != "A/R Aging" || row.GetInt("shipped_revision") != 1 || row.GetString("source") != "books.receivable_items" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a guest with Books readonly access")
	requireNoShare(t, app, row, outsider, "a guest without Books access")
}

// exportARCSV is the CSV export of the shipped A/R Aging as reader (D11): core
// exports a stored report by id, so it ships the report and Books' shares on
// b's app, then posts to /api/reports/export through the app's router. The
// first call on an app sets it up (no stored A/R Aging row yet); core's
// shipped registry is global, so the test resets it when it ends.
func exportARCSV(t testing.TB, b arBook, reader *core.Record, params map[string]any) string {
	t.Helper()
	out, err := exportARCSVErr(t, b, reader, params)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

// exportARCSVErr is exportARCSV that returns a refused export (a run that
// passes core's time limit) instead of ending the test. Its setup still fails
// the test.
func exportARCSVErr(t testing.TB, b arBook, reader *core.Record, params map[string]any) (string, error) {
	t.Helper()
	if _, err := b.app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": arAgingKey}); err != nil {
		t.Cleanup(reports.ResetForTesting)
		reports.Register(b.app)
		reports.RegisterShipped(arAgingShipped())
		// Core stores a shipped report only when an owner or admin exists to own it.
		mkUser(t, b.app, "owner")
		if err := reports.ReconcileShipped(b.app); err != nil {
			t.Fatalf("ReconcileShipped: %v", err)
		}
		if err := reconcileBooksReportShares(b.app); err != nil {
			t.Fatalf("reconcileBooksReportShares: %v", err)
		}
	}
	row, err := b.app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": arAgingKey})
	if err != nil {
		t.Fatalf("no reports row with shipped_key %s: %v", arAgingKey, err)
	}
	given := map[string]json.RawMessage{}
	for id, v := range params {
		given[id] = mustJSON(v)
	}
	body := mustJSON(map[string]any{
		"reportId": row.Id, "format": "csv", "params": given,
		"options": map[string]any{"today": arToday},
	})

	router, err := apis.NewRouter(b.app)
	if err != nil {
		t.Fatal(err)
	}
	out := ""
	err = b.app.OnServe().Trigger(&core.ServeEvent{App: b.app, Router: router}, func(e *core.ServeEvent) error {
		mux, err := e.Router.BuildMux()
		if err != nil {
			return err
		}
		req := httptest.NewRequest(http.MethodPost, "/api/reports/export", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", tokenFor(t, reader))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			return fmt.Errorf("export: status %d, want 200; body: %s", rec.Code, rec.Body.String())
		}
		out = rec.Body.String()
		return nil
	})
	return out, err
}

func TestARAgingCSVOpensEveryGroup(t *testing.T) {
	b := newARBook(t)
	c := mkCustomer(t, b.app, "Csv Co", "")
	inv := arInvoice(t, b, c, "2026-10-01", "2026-10-31", 200000)
	pay := arPayment(t, b, c, "2026-11-03", 80000, map[string]int{inv.Id: 80000})

	text := exportARCSV(t, b, b.reader, nil)
	records, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(text, "\xef\xbb\xbf"))).ReadAll()
	if err != nil {
		t.Fatalf("read the CSV: %v\n%s", err, text)
	}
	if len(records) == 0 {
		t.Fatal("the CSV has no line")
	}
	if want := []string{"Customer", "Due date", "Current", "1 - 30", "31 - 60", "61 - 90", "91 and over", "Total"}; !reflect.DeepEqual(records[0], want) {
		t.Errorf("the heading line = %q, want %q", records[0], want)
	}
	labels := make([]string, len(records))
	for i, r := range records {
		labels[i] = r[0]
	}
	at := slices.Index(labels, "Csv Co")
	if at < 0 {
		t.Fatalf("no CSV line labelled Csv Co; labels %q", labels)
	}
	want := []string{
		"Csv Co",
		"Invoice " + inv.GetString("number"),
		"2026-10-01 · Invoice " + entryNumber(t, b, inv.GetString("entry")),
		"2026-11-03 · Payment " + entryNumber(t, b, pay.GetString("entry")),
	}
	if got := labels[at:min(at+len(want), len(labels))]; !reflect.DeepEqual(got, want) {
		t.Errorf("the CSV under Csv Co = %q, want %q (every group open)", got, want)
	}
}
