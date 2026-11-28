package books

import (
	"context"
	"encoding/json"
	"os"
	"reflect"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The Stock by Bin Location report (inventory-adjust spec §3.9): the bin stock
// rows of the book, one group for each bin (a blank bin is "No bin", an
// inactive bin has " (inactive)"), the items of the bin as detail rows
// "<code> · <name>" with Quantity and Reorder point, a bin row that counts its
// items, and no Total row. Every run is the Books reader's, with a fixed day.
// The stock is written through the app (opening stock, transfers, a sale), so
// every bin stock writer runs.

const (
	sbbKey   = "books.stock_by_bin"
	sbbToday = "2026-11-27"
	sbbEmpty = "No stock in a bin location"
)

// sbbRunErr runs the shipped Stock by Bin Location as reader, as core's run
// endpoint does: Load, then Run with the posted params, the reader's headers
// and the day sbbToday.
func sbbRunErr(t *testing.T, app core.App, reader *core.Record, params map[string]any) (*reports.Result, error) {
	t.Helper()
	shipped := stockByBinReport()
	spec, info, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	given := map[string]json.RawMessage{}
	for id, v := range params {
		given[id] = mustJSON(v)
	}
	return reports.Run(context.Background(), app, reports.Request{
		Spec: spec, Loaded: info, Params: given, Options: reports.Options{Today: sbbToday}, Auth: reader,
		Headers: readerInfo(reader).Headers, Live: shipped.Live,
	})
}

func sbbRun(t *testing.T, app core.App, reader *core.Record, params map[string]any) *reports.Result {
	t.Helper()
	res, err := sbbRunErr(t, app, reader, params)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// sbbBook is the bin stock env (two bins, Aisle 3 and Front counter) with
// Books' report sources registered, and the items of the small book.
type sbbBook struct {
	*binStockEnv
	anchor, cable, bubble, clamps, drill, epoxy *core.Record
}

func newSBBEnv(t *testing.T) *sbbBook {
	t.Helper()
	e := newBinStockEnv(t)
	registerBooksSources(t)
	return &sbbBook{binStockEnv: e}
}

// sbbItem saves an Inventory item with opening stock of qty on 2026-07-01 in
// its default bin bin ("" for No bin).
func (b *sbbBook) sbbItem(t *testing.T, name, code, bin string, qty float64, reorder float64) *core.Record {
	t.Helper()
	r, err := newProduct(b.app, map[string]any{
		"type": "inventory", "name": name, "code": code, "income_account": b.revenue.Id, "cost": 500,
		"opening_quantity": qty, "opening_value": int64(qty * 400), "opening_date": "2026-07-01",
		"default_bin": bin, "reorder_point": reorder,
	})
	if err != nil {
		t.Fatalf("save %s with opening stock: %v", name, err)
	}
	return r
}

// shape is the small book of the report:
//   - Anchor bolts (ZZ-ANCHOR, reorder point 8): 10 in Aisle 3, 4 moved to
//     Front counter. An item in two bins.
//   - Cable ties (AA-CABLE): 7 in Aisle 3.
//   - Bubble wrap (BUB-1): 5 with no default bin, so in No bin.
//   - Clamps (CLAMP-1): 3 in Aisle 3, all moved to Front counter: its Aisle 3
//     row stays with quantity 0.
//   - Drill bits (DRILL-1): 2 in Aisle 3, then inactive. An inactive item with
//     stock.
//   - Epoxy (EPOXY-1): 2 in Aisle 3; its default bin made Front counter and 2
//     sold, so Aisle 3 holds 2, Front counter -2 and it has none on hand; then
//     inactive. An inactive item without stock, whose bin rows are not 0.
//   - Front counter is then made inactive. An inactive bin with stock.
func (b *sbbBook) shape(t *testing.T) {
	t.Helper()
	b.anchor = b.sbbItem(t, "Anchor bolts", "ZZ-ANCHOR", b.aisle.Id, 10, 8)
	b.transfer(t, b.anchor, b.aisle.Id, b.counter.Id, 4)
	b.cable = b.sbbItem(t, "Cable ties", "AA-CABLE", b.aisle.Id, 7, 0)
	b.bubble = b.sbbItem(t, "Bubble wrap", "BUB-1", "", 5, 0)
	b.clamps = b.sbbItem(t, "Clamps", "CLAMP-1", b.aisle.Id, 3, 0)
	b.transfer(t, b.clamps, b.aisle.Id, b.counter.Id, 3)
	b.drill = b.sbbItem(t, "Drill bits", "DRILL-1", b.aisle.Id, 2, 0)
	makeProductInactive(t, b.app, b.drill)
	b.epoxy = b.sbbItem(t, "Epoxy", "EPOXY-1", b.aisle.Id, 2, 0)
	setDefaultBin(t, b.app, b.epoxy, b.counter.Id)
	b.sell(t, b.epoxy, "2026-07-02", 2)
	makeProductInactive(t, b.app, b.epoxy)
	if err := setFields(t, b.app, "books_bins", b.counter.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Front counter inactive: %v", err)
	}

	// The book the cases read: each row the shape says, as the bin stock writers
	// left it.
	requireSameBinStock(t, binStockOf(t, b.app, b.clamps.Id), map[string]float64{b.aisle.Id: 0, b.counter.Id: 3}, "the clamps")
	requireSameBinStock(t, binStockOf(t, b.app, b.epoxy.Id), map[string]float64{b.aisle.Id: 2, b.counter.Id: -2}, "the epoxy")
	requireSameBinStock(t, binStockOf(t, b.app, b.bubble.Id), map[string]float64{"": 5}, "the bubble wrap")
	if got := reload(t, b.app, "books_products", b.epoxy.Id).GetFloat("quantity_on_hand"); got != 0 {
		t.Fatalf("the epoxy has %v on hand, want 0", got)
	}
}

func sbbGroupLabels(res *reports.Result) []string {
	var out []string
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup {
			out = append(out, r.Label)
		}
	}
	return out
}

// sbbDetailsUnder are the detail rows of the group labelled label, in result
// order.
func sbbDetailsUnder(t *testing.T, res *reports.Result, label string) []reports.Row {
	t.Helper()
	group := sbbGroup(t, res, label)
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindDetail && r.Section == group.ID {
			out = append(out, r)
		}
	}
	return out
}

func sbbGroup(t *testing.T, res *reports.Result, label string) reports.Row {
	t.Helper()
	var found []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup && r.Label == label {
			found = append(found, r)
		}
	}
	if len(found) != 1 {
		t.Fatalf("%d group rows labelled %q, want one; rows %q", len(found), label, bsLabels(res))
	}
	return found[0]
}

func sbbLabels(rows []reports.Row) []string {
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = r.Label
	}
	return out
}

var sbbItemsText = regexp.MustCompile(`^(\d+) items?$`)

// sbbItemCount reads a bin row's count of its items (the items column): a
// number, or the text "<n> items".
func sbbItemCount(t *testing.T, r reports.Row) int {
	t.Helper()
	switch v := r.Cells["items"].(type) {
	case int64:
		return int(v)
	case int:
		return v
	case float64:
		return int(v)
	case string:
		m := sbbItemsText.FindStringSubmatch(v)
		if m == nil {
			t.Fatalf("%s items = %q, want \"<n> items\"", r.Label, v)
		}
		n, _ := strconv.Atoi(m[1])
		return n
	default:
		t.Fatalf("%s items = %#v, a %T; want the count of its items", r.Label, v, v)
		return 0
	}
}

// sbbDetail is a detail row's label, quantity and reorder point (ok false for
// a blank reorder point).
type sbbDetail struct {
	Label      string
	Quantity   float64
	Reorder    float64
	HasReorder bool
}

func sbbDetailsOf(t *testing.T, rows []reports.Row) []sbbDetail {
	t.Helper()
	out := make([]sbbDetail, len(rows))
	for i, r := range rows {
		qty, ok := opoQty(t, r, "quantity")
		if !ok {
			t.Errorf("%s has a blank Quantity", r.Label)
		}
		reorder, has := opoQty(t, r, "reorder_point")
		out[i] = sbbDetail{r.Label, qty, reorder, has}
	}
	return out
}

// sbbSpecFile is server/testdata/stock_by_bin_spec.json, which
// tests/inventory-adjust-fixture.test.ts reads too.
type sbbSpecFile struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	EmptyText   string          `json:"emptyText"`
	Params      json.RawMessage `json:"params"`
	Display     json.RawMessage `json:"display"`
}

func readSBBSpecFile(t *testing.T) sbbSpecFile {
	t.Helper()
	raw, err := os.ReadFile("testdata/stock_by_bin_spec.json")
	if err != nil {
		t.Fatalf("read testdata/stock_by_bin_spec.json: %v", err)
	}
	var file sbbSpecFile
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("parse testdata/stock_by_bin_spec.json: %v", err)
	}
	return file
}

// The shipped spec: key, title, description, unpublished; it loads and passes
// Validate on a migrated app; its source, its one open group and its detail;
// stockByBinSpec() is the spec it ships; and every SELECT a run makes passes
// EXPLAIN QUERY PLAN.
func TestStockByBinSpecLoadsValidatesAndExplains(t *testing.T) {
	b := newSBBEnv(t)
	if err := reports.CheckSources(b.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	shipped := stockByBinReport()
	if shipped.Key != sbbKey {
		t.Errorf("key = %q, want %s", shipped.Key, sbbKey)
	}
	if shipped.Title != "Stock by Bin Location" {
		t.Errorf("title = %q, want Stock by Bin Location", shipped.Title)
	}
	if shipped.Description != "Quantity on hand of each item, by the bin it is in." {
		t.Errorf("description = %q", shipped.Description)
	}
	if !shipped.Unpublished || shipped.Revision < 1 {
		t.Errorf("unpublished %v revision %d, want an unpublished shipped report with a revision", shipped.Unpublished, shipped.Revision)
	}

	spec, _, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got, want := mustJSON(spec), mustJSON(stockByBinSpec()); string(got) != string(want) {
		t.Errorf("the shipped spec is not stockByBinSpec():\n%s\nwant\n%s", got, want)
	}
	if spec.Source != "books.bin_stock" {
		t.Errorf("source = %q, want books.bin_stock", spec.Source)
	}
	if err := reports.Validate(b.app, spec); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if spec.EmptyText != sbbEmpty {
		t.Errorf("emptyText = %q, want %q", spec.EmptyText, sbbEmpty)
	}
	if len(spec.Groups) != 1 {
		t.Fatalf("%d group levels, want 1 (Bin)", len(spec.Groups))
	}
	if !spec.Groups[0].Open {
		t.Errorf("the Bin group is closed at the start, want open")
	}
	if spec.Detail == nil || spec.Detail.Label == nil || spec.Detail.Open == nil {
		t.Errorf("detail = %+v, want a label and an open path", spec.Detail)
	}

	b.shape(t)
	var res *reports.Result
	var runErr error
	var statements []string
	seen := map[string]bool{}
	recordStatements(t, b.app, func(statement string) {
		st := strings.TrimSpace(statement)
		upper := strings.ToUpper(st)
		if (strings.HasPrefix(upper, "SELECT") || strings.HasPrefix(upper, "WITH")) && !seen[st] {
			seen[st] = true
			statements = append(statements, st)
		}
	}, func() {
		res, runErr = sbbRunErr(t, b.app, b.users.readOnly, nil)
	})
	if runErr != nil {
		t.Fatalf("Run: %v", runErr)
	}
	if len(sbbGroupLabels(res)) == 0 {
		t.Fatalf("the run has no bin rows; rows %q", bsLabels(res))
	}
	if len(statements) == 0 {
		t.Fatal("the run recorded no SELECT statement")
	}
	// explainStatements fails the test on a statement EXPLAIN QUERY PLAN refuses.
	if steps := explainStatements(t, b.app, statements); len(steps) == 0 {
		t.Errorf("EXPLAIN QUERY PLAN gave no step for %d statements", len(statements))
	}

	type colShape struct{ ID, Label string }
	var got []colShape
	for _, c := range res.Columns {
		got = append(got, colShape{c.ID, c.Label})
	}
	want := []colShape{{"name", "Bin"}, {"items", "Items"}, {"quantity", "Quantity"}, {"reorder_point", "Reorder point"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("columns = %+v, want %+v", got, want)
	}
}

// The Go shipped report and tests/inventory-adjust-fixture.test.ts hold the
// same title, description, empty text, params and display, through the one
// spec file.
func TestStockByBinMatchesSharedSpecFile(t *testing.T) {
	file := readSBBSpecFile(t)
	shipped := stockByBinReport()
	if shipped.Title != file.Title {
		t.Errorf("title = %q, want %q", shipped.Title, file.Title)
	}
	if shipped.Description != file.Description {
		t.Errorf("description = %q, want %q", shipped.Description, file.Description)
	}
	spec, _, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.EmptyText != file.EmptyText {
		t.Errorf("emptyText = %q, want %q", spec.EmptyText, file.EmptyText)
	}
	if got := mustJSON(spec.Params); !jsonEqual(t, got, string(file.Params)) {
		t.Errorf("params =\n%s\nwant testdata/stock_by_bin_spec.json params\n%s", got, file.Params)
	}
	if got := mustJSON(spec.Display); !jsonEqual(t, got, string(file.Display)) {
		t.Errorf("display =\n%s\nwant testdata/stock_by_bin_spec.json display\n%s", got, file.Display)
	}
}

// Spec §3.9 (cp9 fix r1 decision): below 420 px the phone layout puts the label
// alone on line 1, spanning every track, so a long item name gets the whole of
// core's 374 px row; line 2 holds Items, Quantity and Reorder point, one track
// each.
func TestStockByBinPhoneLayout(t *testing.T) {
	display := stockByBinSpec().Display
	if display == nil || len(display.Layouts) != 1 {
		t.Fatalf("display %+v, want one phone layout", display)
	}
	layout := display.Layouts[0]
	if layout.Width != "mobile" {
		t.Errorf("layout width %q, want mobile", layout.Width)
	}
	if layout.Tracks != 3 {
		t.Errorf("%d tracks, want 3 (Items, Quantity, Reorder point on line 2)", layout.Tracks)
	}
	span := func(c reports.DisplayCell) int {
		if c.Span == 0 {
			return 1
		}
		return c.Span
	}
	lines := map[int][]reports.DisplayCell{}
	for _, c := range layout.Cells {
		lines[c.Line] = append(lines[c.Line], c)
	}
	if len(lines) != 2 {
		t.Errorf("cells on %d lines, want 2: %+v", len(lines), layout.Cells)
	}
	first := lines[1]
	if len(first) != 1 || first[0].Col != "name" || span(first[0]) != layout.Tracks {
		t.Errorf("line 1 = %+v, want the label (name) alone, spanning all %d tracks", first, layout.Tracks)
	}
	var second []string
	for _, c := range lines[2] {
		second = append(second, c.Col)
		if span(c) != 1 {
			t.Errorf("line 2 cell %s spans %d tracks, want 1", c.Col, span(c))
		}
	}
	if want := []string{"items", "quantity", "reorder_point"}; !reflect.DeepEqual(second, want) {
		t.Errorf("line 2 = %q, want %q", second, want)
	}
}

// Spec §3.9: one group for each bin with stock, "No bin" for the blank bin
// (last, never dropped), " (inactive)" on an inactive bin; no row for a
// quantity of 0; an inactive item with stock is in, one without is not;
// details "<code> · <name>" that open the item; a bin row counts its details
// and has blank Quantity and Reorder point; no Total row.
func TestStockByBinGroupsLabelsAndCounts(t *testing.T) {
	b := newSBBEnv(t)
	b.shape(t)
	// Gloves has no code: books_products.code is optional in the schema, and the
	// record code guard fills a blank code on every app write, so a blank code
	// is left only by a write past the hooks (raw SQL here). Its label is the
	// name alone, never " · Gloves".
	gloves := b.sbbItem(t, "Gloves", "GLOVE-1", b.aisle.Id, 6, 0)
	if _, err := b.app.DB().NewQuery("UPDATE books_products SET code = '' WHERE id = {:id}").
		Bind(dbx.Params{"id": gloves.Id}).Execute(); err != nil {
		t.Fatalf("blank the code of Gloves: %v", err)
	}
	if got := reload(t, b.app, "books_products", gloves.Id).GetString("code"); got != "" {
		t.Fatalf("Gloves has the code %q, want blank", got)
	}
	res := sbbRun(t, b.app, b.users.readOnly, nil)

	if got, want := sbbGroupLabels(res), []string{"Aisle 3", "Front counter (inactive)", "No bin"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("bin rows %q, want %q", got, want)
	}
	for _, r := range res.Rows {
		if r.Kind == reports.KindTotal {
			t.Errorf("a Total row %q, want none (quantities of different items do not add up)", r.Label)
		}
		if r.Kind != reports.KindGroup && r.Kind != reports.KindDetail {
			t.Errorf("row %q is a %s row, want bin and item rows only", r.Label, r.Kind)
		}
	}

	wantDetails := map[string][]sbbDetail{
		"Aisle 3": {
			{"ZZ-ANCHOR · Anchor bolts", 6, 8, true},
			{"AA-CABLE · Cable ties", 7, 0, false},
			{"DRILL-1 · Drill bits", 2, 0, false},
			{"Gloves", 6, 0, false},
		},
		"Front counter (inactive)": {
			{"ZZ-ANCHOR · Anchor bolts", 4, 8, true},
			{"CLAMP-1 · Clamps", 3, 0, false},
		},
		"No bin": {
			{"BUB-1 · Bubble wrap", 5, 0, false},
		},
	}
	opens := map[string]string{
		"ZZ-ANCHOR · Anchor bolts": "books/products/" + b.anchor.Id,
		"AA-CABLE · Cable ties":    "books/products/" + b.cable.Id,
		"DRILL-1 · Drill bits":     "books/products/" + b.drill.Id,
		"CLAMP-1 · Clamps":         "books/products/" + b.clamps.Id,
		"BUB-1 · Bubble wrap":      "books/products/" + b.bubble.Id,
		"Gloves":                   "books/products/" + gloves.Id,
	}
	for label, want := range wantDetails {
		group := sbbGroup(t, res, label)
		details := sbbDetailsUnder(t, res, label)
		if got := sbbDetailsOf(t, details); !reflect.DeepEqual(got, want) {
			t.Errorf("%s holds %+v, want %+v", label, got, want)
		}
		if got := sbbItemCount(t, group); got != len(details) {
			t.Errorf("%s counts %d items, want %d (its detail rows)", label, got, len(details))
		}
		if !group.Expanded {
			t.Errorf("%s is closed at the start, want open", label)
		}
		for _, col := range []string{"quantity", "reorder_point"} {
			if v, ok := opoQty(t, group, col); ok {
				t.Errorf("the bin row %s has %s %v, want blank", label, col, v)
			}
		}
		for _, d := range details {
			if d.Open != opens[d.Label] {
				t.Errorf("%s opens %q, want %q", d.Label, d.Open, opens[d.Label])
			}
		}
	}
	for _, r := range res.Rows {
		if strings.Contains(r.Label, "Epoxy") {
			t.Errorf("row %q: an inactive item with no stock is in the report", r.Label)
		}
	}
}

// Spec §3.9: the Bin param keeps the picked bins only; picking the inactive
// bin keeps it and its " (inactive)" label.
func TestStockByBinBinsParam(t *testing.T) {
	b := newSBBEnv(t)
	b.shape(t)
	for _, c := range []struct {
		bin  *core.Record
		want string
	}{{b.aisle, "Aisle 3"}, {b.counter, "Front counter (inactive)"}} {
		res := sbbRun(t, b.app, b.users.readOnly, map[string]any{"bins": []string{c.bin.Id}})
		if got := sbbGroupLabels(res); !reflect.DeepEqual(got, []string{c.want}) {
			t.Errorf("%s picked: bin rows %q, want %q", c.want, got, []string{c.want})
		}
	}
	res := sbbRun(t, b.app, b.users.readOnly, map[string]any{"bins": []string{b.aisle.Id}})
	if !slices.ContainsFunc(res.HeaderLines, func(line string) bool {
		return strings.HasPrefix(line, "Bin: ") && strings.Contains(line, "Aisle 3")
	}) {
		t.Errorf("header lines = %q, want a \"Bin: Aisle 3\" line", res.HeaderLines)
	}
}

// Spec §3.9: Order Item name (the default) sorts the items of a bin by name;
// Item code sorts them by code.
func TestStockByBinOrder(t *testing.T) {
	b := newSBBEnv(t)
	b.shape(t)
	byName := sbbRun(t, b.app, b.users.readOnly, map[string]any{"order": "name"})
	if got, want := sbbLabels(sbbDetailsUnder(t, byName, "Aisle 3")), []string{"ZZ-ANCHOR · Anchor bolts", "AA-CABLE · Cable ties", "DRILL-1 · Drill bits"}; !reflect.DeepEqual(got, want) {
		t.Errorf("Order Item name: Aisle 3 holds %q, want %q", got, want)
	}
	if byDefault := sbbRun(t, b.app, b.users.readOnly, nil); !reflect.DeepEqual(bsLabels(byDefault), bsLabels(byName)) {
		t.Errorf("no Order gives %q, want Item name's %q", bsLabels(byDefault), bsLabels(byName))
	}
	byCode := sbbRun(t, b.app, b.users.readOnly, map[string]any{"order": "code"})
	if got, want := sbbLabels(sbbDetailsUnder(t, byCode, "Aisle 3")), []string{"AA-CABLE · Cable ties", "DRILL-1 · Drill bits", "ZZ-ANCHOR · Anchor bolts"}; !reflect.DeepEqual(got, want) {
		t.Errorf("Order Item code: Aisle 3 holds %q, want %q", got, want)
	}
	if got, want := sbbLabels(sbbDetailsUnder(t, byCode, "Front counter (inactive)")), []string{"CLAMP-1 · Clamps", "ZZ-ANCHOR · Anchor bolts"}; !reflect.DeepEqual(got, want) {
		t.Errorf("Order Item code: Front counter holds %q, want %q", got, want)
	}
}

// An empty book gives no row, and the view shows the report's empty text.
func TestStockByBinEmpty(t *testing.T) {
	b := newSBBEnv(t)
	res := sbbRun(t, b.app, b.users.readOnly, nil)
	if len(res.Rows) != 0 {
		t.Errorf("an empty book: rows %q, want none", bsLabels(res))
	}
	spec, _, err := reports.Load(stockByBinReport().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.EmptyText != sbbEmpty {
		t.Errorf("emptyText = %q, want %q (the view shows it for this run)", spec.EmptyText, sbbEmpty)
	}
}

// A Books reader runs it and sees the rows; a user with Books level none sees
// none. The run is live: it follows the three collections its rows read.
func TestStockByBinReaderRunsItLive(t *testing.T) {
	b := newSBBEnv(t)
	b.shape(t)
	res := sbbRun(t, b.app, b.users.readOnly, nil)
	if got := sbbGroupLabels(res); len(got) != 3 {
		t.Errorf("the Books reader sees bin rows %q, want the three bins", got)
	}
	if res.Manual {
		t.Errorf("the run is manual, want a live run")
	}
	for _, topic := range []string{"collection/books_bin_stock", "collection/books_bins", "collection/books_products"} {
		if !slices.Contains(res.Topics, topic) {
			t.Errorf("topics %v, want %s", res.Topics, topic)
		}
	}

	none, err := sbbRunErr(t, b.app, b.users.none, nil)
	if err != nil {
		t.Fatalf("the run of a user with Books level none was refused (%v); core runs it with the rule's rows", err)
	}
	if len(none.Rows) != 0 {
		t.Errorf("a user with Books level none sees rows %q", bsLabels(none))
	}
}

// Register ships the Stock by Bin Location; core creates it unpublished, and
// Books shares it with every Books reader.
func TestStockByBinShippedShared(t *testing.T) {
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
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": sbbKey})
	if err != nil {
		t.Fatalf("no reports row with shipped_key %s: %v", sbbKey, err)
	}
	if row.GetBool("published") {
		t.Errorf("published = true, want unpublished")
	}
	if row.GetString("title") != "Stock by Bin Location" || row.GetString("source") != "books.bin_stock" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a guest with Books readonly access")
	requireNoShare(t, app, row, outsider, "a guest without Books access")
}

// Spec §4 Server: the two new sources pass core's check, and each link reads a
// relation field of its collection (core relationCheck), the optional bin
// link of books.bin_stock too.
func TestReportSources_BinSourcesLinkRelations(t *testing.T) {
	app := newBooksApp(t)
	registerBooksSources(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	refused := reports.Refused(app)
	sources := map[string]reports.Source{}
	for _, s := range reports.Sources(app) {
		sources[s.Key] = s
	}
	for key, want := range map[string]struct {
		collection string
		links      map[string]string
	}{
		"books.bin_stock":   {"books_bin_stock", map[string]string{"product": "books.products", "bin": "books.bins"}},
		"books.bins":        {"books_bins", map[string]string{}},
		"books.products":    {"books_products", map[string]string{"default_bin": "books.bins"}},
		"books.stock_moves": {"books_stock_moves", map[string]string{"bin": "books.bins"}},
	} {
		if reason, bad := refused[key]; bad {
			t.Errorf("source %s refused: %s", key, reason)
		}
		src, ok := sources[key]
		if !ok {
			t.Errorf("source %s is not registered and accepted", key)
			continue
		}
		if src.Collection != want.collection {
			t.Errorf("%s reads %q, want %s", key, src.Collection, want.collection)
		}
		col, err := app.FindCollectionByNameOrId(src.Collection)
		if err != nil {
			t.Fatalf("source %s reads collection %q: %v", key, src.Collection, err)
		}
		byKey := map[string]reports.Link{}
		for _, l := range src.Links {
			byKey[l.Key] = l
		}
		for name, target := range want.links {
			l, ok := byKey[name]
			if !ok {
				t.Errorf("source %s has no link %s", key, name)
				continue
			}
			if l.Target != target {
				t.Errorf("link %s of %s targets %s, want %s", name, key, l.Target, target)
			}
			if _, isRelation := col.Fields.GetByName(l.Field).(*core.RelationField); !isRelation {
				t.Errorf("link %s of %s reads %s.%s, which is not a relation field", name, key, src.Collection, l.Field)
			}
		}
	}
}
