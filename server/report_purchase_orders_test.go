package books

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The Open Purchase Orders report (purchase-orders spec §3.10, §3.11): the open
// lines of open purchase orders, grouped by vendor and then by order, with
// Ordered, Received and Open (sums of the product lines, blank where there is
// none) and Open amount; a Total row of Open amount. Every run is the Books
// reader's, with a fixed day. Orders and bills are saved and posted through
// the app, so every order and bill guard runs and refreshPurchaseOrder writes
// the open values the report reads.

const (
	opoKey   = "books.open_purchase_orders"
	opoToday = "2026-11-20"
	opoEmpty = "No open purchase orders"
)

// opoBook is the purchase order env with the bill guards (newPOBillEnv) and
// Books' report sources registered.
type opoBook struct {
	*poBillEnv
}

func newOPOBook(t *testing.T) opoBook {
	t.Helper()
	pb := newPOBillEnv(t)
	registerBooksSources(t)
	return opoBook{poBillEnv: pb}
}

func withDescription(fields map[string]any, description string) map[string]any {
	fields["description"] = description
	return fields
}

// opoRunErr runs the shipped Open Purchase Orders as reader, as core's run
// endpoint does: Load, then Run with the posted params, the reader's headers
// and the day opoToday.
func opoRunErr(t *testing.T, app core.App, reader *core.Record, params map[string]any) (*reports.Result, error) {
	t.Helper()
	shipped := openPurchaseOrdersReport()
	spec, info, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	given := map[string]json.RawMessage{}
	for id, v := range params {
		given[id] = mustJSON(v)
	}
	return reports.Run(context.Background(), app, reports.Request{
		Spec: spec, Loaded: info, Params: given, Options: reports.Options{Today: opoToday}, Auth: reader,
		Headers: readerInfo(reader).Headers, Live: shipped.Live,
	})
}

func (b opoBook) run(t *testing.T, params map[string]any) *reports.Result {
	t.Helper()
	res, err := opoRunErr(t, b.app, b.users.readOnly, params)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// opoQty reads a quantity cell: ok false for a blank cell. The engine gives a
// count-guarded sum as int64, and a fractional quantity as float64.
func opoQty(t *testing.T, r reports.Row, col string) (float64, bool) {
	t.Helper()
	switch v := r.Cells[col].(type) {
	case nil:
		return 0, false
	case int64:
		return float64(v), true
	case int:
		return float64(v), true
	case float64:
		return v, true
	default:
		t.Fatalf("%s (%s) %s = %#v, a %T; want a number or nil", r.Label, r.Kind, col, v, v)
		return 0, false
	}
}

// requireOPOQuantities checks Ordered, Received and Open of r.
func requireOPOQuantities(t *testing.T, r reports.Row, ordered, received, open float64) {
	t.Helper()
	for _, c := range []struct {
		col  string
		want float64
	}{{"ordered", ordered}, {"received", received}, {"open", open}} {
		got, ok := opoQty(t, r, c.col)
		if !ok || got != c.want {
			t.Errorf("%s (%s) %s = %v (set %v), want %v", r.Label, r.Kind, c.col, r.Cells[c.col], ok, c.want)
		}
	}
}

// requireOPOBlankQuantities fails unless Ordered, Received and Open of r are
// blank.
func requireOPOBlankQuantities(t *testing.T, r reports.Row, why string) {
	t.Helper()
	for _, col := range []string{"ordered", "received", "open"} {
		if v, ok := opoQty(t, r, col); ok {
			t.Errorf("%s (%s) %s = %v, want blank (%s)", r.Label, r.Kind, col, v, why)
		}
	}
}

// opoGroup is the one group row of level labelled label.
func opoGroup(t *testing.T, res *reports.Result, level int, label string) reports.Row {
	t.Helper()
	var found []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup && r.Level == level && r.Label == label {
			found = append(found, r)
		}
	}
	if len(found) != 1 {
		t.Fatalf("%d level-%d group rows labelled %q, want one; rows %q", len(found), level, label, bsLabels(res))
	}
	return found[0]
}

// opoGroupLabels are the labels of the group rows of level, in result order.
func opoGroupLabels(res *reports.Result, level int) []string {
	var out []string
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup && r.Level == level {
			out = append(out, r.Label)
		}
	}
	return out
}

func opoDetails(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindDetail {
			out = append(out, r)
		}
	}
	return out
}

// opoOrderLabel is "<number> · <order date>", the order group's label.
func opoOrderLabel(t *testing.T, app core.App, order *core.Record) string {
	t.Helper()
	stored := reload(t, app, "books_purchase_orders", order.Id)
	if stored.GetString("number") == "" {
		t.Fatalf("purchase order %s has no number", order.Id)
	}
	return stored.GetString("number") + " · " + stored.GetString("date")
}

// opoShape is the seeded shape of the report (the fixture's orders, scaled
// down): Office Supply World's order A dated 2026-11-03 with a product line of
// 10 Wireless access points at 121.40 ("Ceiling mount"), an account line of
// 300.00 on 6200 Software Subscriptions ("Annual license") and an account line
// of 40.00 on 6210 Design Tools ("Icon set"); a posted bill takes 4 of the
// product line, 120.00 of the first account line and all 40.00 of the second.
// Order B of Office Supply World, dated 2026-11-05, holds one account line of
// 50.00 on 6210 Design Tools ("Font license"). Summit IT Services' order C
// holds an account line of 200.00 and is closed by an admin.
type opoShape struct {
	orderA, orderB, orderC   *core.Record
	item, license, iconSet   *core.Record
	fontLicense, closedLine  *core.Record
	orderALabel, orderBLabel string
}

func (b opoBook) shape(t *testing.T) opoShape {
	t.Helper()
	var s opoShape
	s.orderA = mkPO(t, b.app, b.officeSupply, map[string]any{"date": "2026-11-03"})
	s.item = mkPOLine(t, b.app, s.orderA, 0, withDescription(productLine(b.accessPoint, 10, 12140), "Ceiling mount"))
	s.license = mkPOLine(t, b.app, s.orderA, 1, withDescription(accountLine(b.software, 30000), "Annual license"))
	s.iconSet = mkPOLine(t, b.app, s.orderA, 2, withDescription(accountLine(b.designTools, 4000), "Icon set"))
	b.postedOrderBill(t, s.orderA, []*core.Record{s.item, s.license, s.iconSet}, []float64{4, 12000, 4000})
	// 10 - 4 = 6 open, 6 x 121.40 = 728.40; 300.00 - 120.00 = 180.00; 0.
	requirePOLineOpen(t, b.app, s.item.Id, 4, 48560, 6, 72840)
	requirePOLineOpen(t, b.app, s.license.Id, 0, 12000, 0, 18000)
	requirePOLineOpen(t, b.app, s.iconSet.Id, 0, 4000, 0, 0)
	requirePOStatus(t, b.app, s.orderA.Id, "open", "")

	s.orderB = mkPO(t, b.app, b.officeSupply, map[string]any{"date": "2026-11-05"})
	s.fontLicense = mkPOLine(t, b.app, s.orderB, 0, withDescription(accountLine(b.designTools, 5000), "Font license"))

	s.orderC = mkPO(t, b.app, b.summit, map[string]any{"date": "2026-11-04"})
	s.closedLine = mkPOLine(t, b.app, s.orderC, 0, withDescription(accountLine(b.software, 20000), "Support plan"))
	code, body := b.closePO(t, b.users.admin, s.orderC.Id)
	requireCode(t, "an admin's Close", code, body, http.StatusOK)
	requirePOStatus(t, b.app, s.orderC.Id, "closed", "manual")

	s.orderALabel = opoOrderLabel(t, b.app, s.orderA)
	s.orderBLabel = opoOrderLabel(t, b.app, s.orderB)
	return s
}

// opoSpecFile is server/testdata/open_purchase_orders_spec.json, which
// tests/open-purchase-orders-fixture.test.ts reads too.
type opoSpecFile struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	EmptyText   string          `json:"emptyText"`
	Params      json.RawMessage `json:"params"`
	Display     json.RawMessage `json:"display"`
}

func readOPOSpecFile(t *testing.T) opoSpecFile {
	t.Helper()
	raw, err := os.ReadFile("testdata/open_purchase_orders_spec.json")
	if err != nil {
		t.Fatalf("read testdata/open_purchase_orders_spec.json: %v", err)
	}
	var file opoSpecFile
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("parse testdata/open_purchase_orders_spec.json: %v", err)
	}
	return file
}

// The shipped spec: key, title, description, unpublished; it loads and passes
// Validate on a migrated app; its source, its two groups, its columns and
// its detail; and every SELECT a run makes passes EXPLAIN QUERY PLAN.
func TestOpenPurchaseOrdersSpecLoadsValidatesAndExplains(t *testing.T) {
	b := newOPOBook(t)
	if err := reports.CheckSources(b.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	shipped := openPurchaseOrdersReport()
	if shipped.Key != opoKey {
		t.Errorf("key = %q, want %s", shipped.Key, opoKey)
	}
	if shipped.Title != "Open Purchase Orders" {
		t.Errorf("title = %q, want Open Purchase Orders", shipped.Title)
	}
	if shipped.Description != "What is ordered and not yet received, by vendor and purchase order." {
		t.Errorf("description = %q", shipped.Description)
	}
	if !shipped.Unpublished || shipped.Revision < 1 {
		t.Errorf("unpublished %v revision %d, want an unpublished shipped report with a revision", shipped.Unpublished, shipped.Revision)
	}

	spec, _, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.Source != "books.purchase_order_lines" {
		t.Errorf("source = %q, want books.purchase_order_lines", spec.Source)
	}
	if err := reports.Validate(b.app, spec); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if spec.EmptyText != opoEmpty {
		t.Errorf("emptyText = %q, want %q", spec.EmptyText, opoEmpty)
	}
	if len(spec.Groups) != 2 {
		t.Errorf("%d group levels, want 2 (Vendor, then Purchase order)", len(spec.Groups))
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
		res, runErr = opoRunErr(t, b.app, b.users.readOnly, nil)
	})
	if runErr != nil {
		t.Fatalf("Run: %v", runErr)
	}
	if len(opoDetails(res)) == 0 {
		t.Fatalf("the run has no detail rows; rows %q", bsLabels(res))
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
		if c.ID != "name" {
			got = append(got, colShape{c.ID, c.Label})
		}
	}
	want := []colShape{{"ordered", "Ordered"}, {"received", "Received"}, {"open", "Open"}, {"open_amount", "Open amount"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("figure columns = %+v, want %+v", got, want)
	}
	if res.Columns[0].ID != "name" {
		t.Errorf("first column = %q, want the label column name", res.Columns[0].ID)
	}
}

func TestOpenPurchaseOrdersMatchesSharedSpecFile(t *testing.T) {
	file := readOPOSpecFile(t)
	shipped := openPurchaseOrdersReport()
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
		t.Errorf("params =\n%s\nwant testdata/open_purchase_orders_spec.json params\n%s", got, file.Params)
	}
	if got := mustJSON(spec.Display); !jsonEqual(t, got, string(file.Display)) {
		t.Errorf("display =\n%s\nwant testdata/open_purchase_orders_spec.json display\n%s", got, file.Display)
	}
}

// Spec §3.10: the Vendor group, then the Purchase order group "<number> ·
// <date>", then the open lines labelled "<product or account> ·
// <description>"; Ordered, Received and Open sum the product lines and are
// blank on an account line and on an order with no product line; Open amount
// sums every open line; the Total row holds Open amount. A closed order and a
// line with no open amount are not in the report. Each line opens its order.
func TestOpenPurchaseOrdersGroupsLabelsAndSums(t *testing.T) {
	b := newOPOBook(t)
	s := b.shape(t)
	res := b.run(t, nil)

	if got, want := opoGroupLabels(res, 1), []string{"Office Supply World"}; !reflect.DeepEqual(got, want) {
		t.Errorf("vendor rows %q, want %q (Summit IT Services' only order is closed)", got, want)
	}
	vendor := opoGroup(t, res, 1, "Office Supply World")
	requireOPOQuantities(t, vendor, 10, 4, 6)
	if got := amt(t, vendor, "open_amount"); got != 72840+18000+5000 {
		t.Errorf("Office Supply World open amount = %d, want 728.40 + 180.00 + 50.00 = 95840", got)
	}

	if got, want := opoGroupLabels(res, 2), []string{s.orderALabel, s.orderBLabel}; !reflect.DeepEqual(got, want) {
		t.Errorf("order rows %q, want %q", got, want)
	}
	orderA := opoGroup(t, res, 2, s.orderALabel)
	if !strings.HasSuffix(s.orderALabel, " · 2026-11-03") {
		t.Errorf("order A label = %q, want \"<number> · 2026-11-03\"", s.orderALabel)
	}
	requireOPOQuantities(t, orderA, 10, 4, 6)
	if got := amt(t, orderA, "open_amount"); got != 90840 {
		t.Errorf("order A open amount = %d, want 728.40 + 180.00 = 90840", got)
	}
	orderB := opoGroup(t, res, 2, s.orderBLabel)
	requireOPOBlankQuantities(t, orderB, "an order with no product line")
	if got := amt(t, orderB, "open_amount"); got != 5000 {
		t.Errorf("order B open amount = %d, want 5000", got)
	}

	linesA := ebvLinesUnder(t, res, orderA)
	var labelsA []string
	for _, r := range linesA {
		labelsA = append(labelsA, r.Label)
	}
	wantA := []string{"Wireless access point · Ceiling mount", "6200 Software Subscriptions · Annual license"}
	if !reflect.DeepEqual(labelsA, wantA) {
		t.Fatalf("order A's lines %q, want %q (the fully billed Icon set line is not open)", labelsA, wantA)
	}
	requireOPOQuantities(t, linesA[0], 10, 4, 6)
	if got := amt(t, linesA[0], "open_amount"); got != 72840 {
		t.Errorf("the product line's open amount = %d, want 72840", got)
	}
	requireOPOBlankQuantities(t, linesA[1], "an account line")
	if got := amt(t, linesA[1], "open_amount"); got != 18000 {
		t.Errorf("the account line's open amount = %d, want 18000", got)
	}
	linesB := ebvLinesUnder(t, res, orderB)
	if len(linesB) != 1 || linesB[0].Label != "6210 Design Tools · Font license" {
		t.Errorf("order B's lines %q, want the Font license line", bsLabels(&reports.Result{Rows: linesB}))
	}

	for _, r := range opoDetails(res) {
		if strings.Contains(r.Label, "Icon set") || strings.Contains(r.Label, "Support plan") {
			t.Errorf("detail %q is in the report: a line with no open amount and a closed order's line are not", r.Label)
		}
	}

	total := totalOf(t, res)
	if got := amt(t, total, "open_amount"); got != 95840 {
		t.Errorf("Total open amount = %d, want 95840", got)
	}

	// Each line opens its order by the Books detail-surface pattern, by its
	// number key as every numbered document (lib/record-key.ts documentKey):
	// the sequence, not the record id.
	keyOf := func(order *core.Record) string {
		sequence := reload(t, b.app, "books_purchase_orders", order.Id).GetInt("sequence")
		if sequence <= 0 {
			t.Fatalf("purchase order %s has no sequence", order.Id)
		}
		return strconv.Itoa(sequence)
	}
	for _, r := range linesA {
		if want := "books/purchase-orders/" + keyOf(s.orderA); r.Open != want {
			t.Errorf("%q opens %q, want %s", r.Label, r.Open, want)
		}
	}
	for _, r := range linesB {
		if want := "books/purchase-orders/" + keyOf(s.orderB); r.Open != want {
			t.Errorf("%q opens %q, want %s", r.Label, r.Open, want)
		}
	}

	// A reopened order is open again and comes back into the report.
	code, body := b.reopenPO(t, b.users.admin, s.orderC.Id)
	requireCode(t, "an admin's Reopen", code, body, http.StatusOK)
	reopened := b.run(t, nil)
	if got, want := opoGroupLabels(reopened, 1), []string{"Office Supply World", "Summit IT Services"}; !reflect.DeepEqual(got, want) {
		t.Errorf("after Reopen: vendor rows %q, want %q", got, want)
	}
}

// Spec §3.10: Period filters on the order date and is All dates when unset.
func TestOpenPurchaseOrdersPeriod(t *testing.T) {
	b := newOPOBook(t)
	old := mkPO(t, b.app, b.summit, map[string]any{"date": "2025-06-10"})
	mkPOLine(t, b.app, old, 0, withDescription(accountLine(b.software, 7000), "Old order"))
	recent := mkPO(t, b.app, b.officeSupply, map[string]any{"date": "2026-11-03"})
	mkPOLine(t, b.app, recent, 0, withDescription(accountLine(b.software, 9000), "Recent order"))

	all := b.run(t, nil)
	if got, want := opoGroupLabels(all, 1), []string{"Office Supply World", "Summit IT Services"}; !reflect.DeepEqual(got, want) {
		t.Errorf("no Period (All dates): vendor rows %q, want %q", got, want)
	}
	if got := amt(t, totalOf(t, all), "open_amount"); got != 16000 {
		t.Errorf("no Period: Total = %d, want 16000", got)
	}
	allDates := b.run(t, map[string]any{"period": map[string]any{"preset": "allDates"}})
	if !reflect.DeepEqual(bsLabels(allDates), bsLabels(all)) {
		t.Errorf("All dates gives %q, want the unset Period's %q", bsLabels(allDates), bsLabels(all))
	}

	november := b.run(t, map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")})
	if got, want := opoGroupLabels(november, 1), []string{"Office Supply World"}; !reflect.DeepEqual(got, want) {
		t.Errorf("November 2026: vendor rows %q, want %q (the order dated 2025-06-10 is outside)", got, want)
	}
	if got := amt(t, totalOf(t, november), "open_amount"); got != 9000 {
		t.Errorf("November 2026: Total = %d, want 9000", got)
	}
	edge := b.run(t, map[string]any{"period": glPeriod("2026-11-03", "2026-11-03")})
	if got := opoGroupLabels(edge, 1); !reflect.DeepEqual(got, []string{"Office Supply World"}) {
		t.Errorf("the order's own day: vendor rows %q, want Office Supply World", got)
	}
}

// Spec §3.10 Empty: a run with no open line is the Total row only, and the
// spec carries its own empty text.
func TestOpenPurchaseOrdersEmpty(t *testing.T) {
	b := newOPOBook(t)
	order := mkPO(t, b.app, b.officeSupply, map[string]any{"date": "2026-11-03"})
	mkPOLine(t, b.app, order, 0, withDescription(accountLine(b.software, 9000), "Before"))

	res := b.run(t, map[string]any{"period": glPeriod("2026-10-01", "2026-10-31")})
	if len(res.Rows) != 1 || res.Rows[0].Kind != reports.KindTotal {
		t.Fatalf("October 2026: rows %q, want the Total row only", bsLabels(res))
	}
	if got, ok := moneyCell(t, res.Rows[0], "open_amount"); ok && got != 0 {
		t.Errorf("October 2026: Total = %d, want 0 or blank", got)
	}
	spec, _, err := reports.Load(openPurchaseOrdersReport().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.EmptyText != opoEmpty {
		t.Errorf("emptyText = %q, want %q (the view shows it for this run)", spec.EmptyText, opoEmpty)
	}
}

// Spec §3.10: the Vendor param (vendorsParam) keeps the picked vendors only.
func TestOpenPurchaseOrdersVendorsParam(t *testing.T) {
	b := newOPOBook(t)
	a := mkPO(t, b.app, b.officeSupply, nil)
	mkPOLine(t, b.app, a, 0, withDescription(accountLine(b.software, 9000), "Paper"))
	c := mkPO(t, b.app, b.summit, nil)
	mkPOLine(t, b.app, c, 0, withDescription(accountLine(b.software, 4000), "Support"))

	res := b.run(t, map[string]any{"vendors": []string{b.summit.Id}})
	if got, want := opoGroupLabels(res, 1), []string{"Summit IT Services"}; !reflect.DeepEqual(got, want) {
		t.Errorf("Summit picked: vendor rows %q, want %q", got, want)
	}
	if got := amt(t, totalOf(t, res), "open_amount"); got != 4000 {
		t.Errorf("Summit picked: Total = %d, want 4000", got)
	}
	if !slices.ContainsFunc(res.HeaderLines, func(line string) bool {
		return strings.HasPrefix(line, "Vendor: ") && strings.Contains(line, "Summit IT Services")
	}) {
		t.Errorf("header lines = %q, want a \"Vendor: Summit IT Services\" line", res.HeaderLines)
	}
	spec, _, err := reports.Load(openPurchaseOrdersReport().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got, want := mustJSON(paramOf(t, spec, "vendors")), mustJSON(vendorsParam()); string(got) != string(want) {
		t.Errorf("the vendors param = %s, want vendorsParam() %s", got, want)
	}
}

// Spec §3.10: Order Name (the default) sorts vendors by name; Largest open
// amount sorts them by their open amount, largest first.
func TestOpenPurchaseOrdersOrder(t *testing.T) {
	b := newOPOBook(t)
	for _, v := range []struct {
		name  string
		cents int64
	}{{"Cedar Supply", 10000}, {"Aspen Supply", 1000}, {"Birch Supply", 50000}} {
		vendor := mkVendor(t, b.app, v.name)
		order := mkPO(t, b.app, vendor, nil)
		mkPOLine(t, b.app, order, 0, withDescription(accountLine(b.software, v.cents), "Goods"))
	}

	byName := b.run(t, map[string]any{"order": "name"})
	if got, want := opoGroupLabels(byName, 1), []string{"Aspen Supply", "Birch Supply", "Cedar Supply"}; !reflect.DeepEqual(got, want) {
		t.Errorf("Order Name: vendor rows %q, want %q", got, want)
	}
	if byDefault := b.run(t, nil); !reflect.DeepEqual(bsLabels(byDefault), bsLabels(byName)) {
		t.Errorf("no Order gives %q, want Name's %q", bsLabels(byDefault), bsLabels(byName))
	}
	byOpen := b.run(t, map[string]any{"order": "open"})
	if got, want := opoGroupLabels(byOpen, 1), []string{"Birch Supply", "Cedar Supply", "Aspen Supply"}; !reflect.DeepEqual(got, want) {
		t.Errorf("Order Largest open amount: vendor rows %q, want %q", got, want)
	}
}

// A Books reader runs it and sees the rows; a user with Books level none sees
// none. The run is live: it follows the five collections its rows read.
func TestOpenPurchaseOrdersReaderRunsItLive(t *testing.T) {
	b := newOPOBook(t)
	order := mkPO(t, b.app, b.officeSupply, nil)
	mkPOLine(t, b.app, order, 0, withDescription(accountLine(b.software, 9000), "Paper"))

	res := b.run(t, nil)
	if got := opoGroupLabels(res, 1); !reflect.DeepEqual(got, []string{"Office Supply World"}) {
		t.Errorf("the Books reader sees vendor rows %q, want Office Supply World", got)
	}
	if res.Manual {
		t.Errorf("the run is manual, want a live run")
	}
	for _, topic := range []string{
		"collection/books_purchase_order_lines", "collection/books_purchase_orders",
		"collection/books_vendors", "collection/books_products", "collection/books_accounts",
	} {
		if !slices.Contains(res.Topics, topic) {
			t.Errorf("topics %v, want %s", res.Topics, topic)
		}
	}

	none, err := opoRunErr(t, b.app, b.users.none, nil)
	if err != nil {
		t.Fatalf("the run of a user with Books level none was refused (%v); core runs it with the rule's rows", err)
	}
	if got := opoGroupLabels(none, 1); len(got) != 0 {
		t.Errorf("a user with Books level none sees vendor rows %q", got)
	}
}

// Register ships the Open Purchase Orders; core creates it unpublished, and
// Books shares it with every Books reader.
func TestOpenPurchaseOrdersShippedShared(t *testing.T) {
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
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": opoKey})
	if err != nil {
		t.Fatalf("no reports row with shipped_key %s: %v", opoKey, err)
	}
	if row.GetBool("published") {
		t.Errorf("published = true, want unpublished")
	}
	if row.GetString("title") != "Open Purchase Orders" || row.GetString("source") != "books.purchase_order_lines" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a guest with Books readonly access")
	requireNoShare(t, app, row, outsider, "a guest without Books access")
}

// Spec §4 Server: the two sources pass core's check, and each link reads a
// relation field of its collection (core relationCheck).
func TestReportSources_PurchaseOrderSourcesLinkRelations(t *testing.T) {
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
	for key, links := range map[string]map[string]string{
		"books.purchase_order_lines": {"order": "books.purchase_orders", "product": "books.products", "account": "books.accounts"},
		"books.purchase_orders":      {"vendor": "books.vendors"},
	} {
		if reason, bad := refused[key]; bad {
			t.Errorf("source %s refused: %s", key, reason)
		}
		src, ok := sources[key]
		if !ok {
			t.Errorf("source %s is not registered and accepted", key)
			continue
		}
		col, err := app.FindCollectionByNameOrId(src.Collection)
		if err != nil {
			t.Fatalf("source %s reads collection %q: %v", key, src.Collection, err)
		}
		byKey := map[string]reports.Link{}
		for _, l := range src.Links {
			byKey[l.Key] = l
		}
		for name, target := range links {
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
	if got := sources["books.purchase_order_lines"].Collection; got != "books_purchase_order_lines" {
		t.Errorf("books.purchase_order_lines reads %q, want books_purchase_order_lines", got)
	}
	if got := sources["books.purchase_orders"].Collection; got != "books_purchase_orders" {
		t.Errorf("books.purchase_orders reads %q, want books_purchase_orders", got)
	}
}

// Spec §3.11: the products source has "On purchase order" (quantity_on_po),
// and a report over books.products reads it.
func TestReportSources_ProductsHaveOnPurchaseOrder(t *testing.T) {
	var field *reports.Field
	for _, s := range reportSources() {
		if s.Key != "books.products" {
			continue
		}
		for i := range s.Fields {
			if s.Fields[i].Key == "quantity_on_po" {
				field = &s.Fields[i]
			}
		}
	}
	if field == nil {
		t.Fatal("books.products has no quantity_on_po field")
	}
	if field.Label != "On purchase order" || field.Type != reports.Number {
		t.Errorf("quantity_on_po = label %q type %v, want \"On purchase order\", a number", field.Label, field.Type)
	}

	b := newOPOBook(t)
	order := mkPO(t, b.app, b.officeSupply, nil)
	mkPOLine(t, b.app, order, 0, productLine(b.accessPoint, 7, 12140))
	requireOnPO(t, b.app, b.accessPoint, 7)
	res := runAs(t, b.app, b.users.readOnly, `{"version":4,"source":"books.products",
		"columns":[{"id":"name","path":[{"field":"name"}]},{"id":"onPO","path":[{"field":"quantity_on_po"}]}],
		"filter":{"op":"eq","args":[{"path":[{"field":"name"}]},{"value":"Wireless access point"}]}}`)
	details, _ := splitRows(t, res)
	if len(details) != 1 {
		t.Fatalf("%d rows for Wireless access point, want 1", len(details))
	}
	if got, ok := opoQty(t, details[0], "onPO"); !ok || got != 7 {
		t.Errorf("On purchase order = %v, want 7", details[0].Cells["onPO"])
	}
}
