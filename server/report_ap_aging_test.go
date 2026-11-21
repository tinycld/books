package books

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The A/P Aging report (spec §3, §4): the open items of each vendor on the
// As of day, by age column. Every book is built with the checkpoint-2 helpers
// (apBook) and every run is the Books reader's, with a fixed day.

// apToday is the reader's day in every run unless a test sets one, so the
// default As of (Today) never moves with the clock.
const apToday = "2026-11-18"

// apEmptyDay reads the empty day from server/testdata/ap_aging_spec.json
// (key emptyDay), the day tests/ap-aging-fixture.test.ts holds
// AP_AGING_EMPTY_DAY to: a day before every line.
func apEmptyDay(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile("testdata/ap_aging_spec.json")
	if err != nil {
		t.Fatalf("read testdata/ap_aging_spec.json: %v", err)
	}
	var file struct {
		EmptyDay string `json:"emptyDay"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("parse testdata/ap_aging_spec.json: %v", err)
	}
	if file.EmptyDay == "" {
		t.Fatal("testdata/ap_aging_spec.json has no emptyDay")
	}
	return file.EmptyDay
}

// runAPErr runs apAgingSpec() as reader, as core's run endpoint does: Load,
// then Run with the posted params, the reader's headers and, unless opts sets
// one, the day apToday.
func runAPErr(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) (*reports.Result, error) {
	t.Helper()
	spec, info, err := reports.Load(mustJSON(apAgingSpec()))
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
		opts.Today = apToday
	}
	return reports.Run(context.Background(), app, reports.Request{
		Spec: spec, Loaded: info, Params: given, Options: opts, Auth: reader,
		Headers: readerInfo(reader).Headers,
	})
}

// runAP runs the shipped A/P Aging as reader on apToday with every row closed.
func runAP(t *testing.T, app core.App, reader *core.Record, params map[string]any) *reports.Result {
	t.Helper()
	res, err := runAPErr(t, app, reader, params, reports.Options{})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// apRunOpen runs the report as b's reader with the group rows keyed by keys
// opened, as the view asks when a reader presses rows.
func apRunOpen(t *testing.T, b apBook, params map[string]any, keys ...[]any) *reports.Result {
	t.Helper()
	res, err := runAPErr(t, b.app, b.reader, params, reports.Options{Expand: keys, Collapse: [][]any{}})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// apVendorRow is the vendor row (level 1) of vendor.
func apVendorRow(t *testing.T, res *reports.Result, vendor *core.Record) reports.Row {
	t.Helper()
	r, ok := cbGroupRow(res, 1, vendor.Id)
	if !ok {
		t.Fatalf("no vendor row for %s; rows %q", vendor.GetString("display_name"), bsLabels(res))
	}
	return r
}

func apHasVendor(res *reports.Result, vendor *core.Record) bool {
	_, ok := cbGroupRow(res, 1, vendor.Id)
	return ok
}

// apVendorRows are the vendor rows (level 1), the No vendor row included.
func apVendorRows(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup && r.Level == 1 {
			out = append(out, r)
		}
	}
	return out
}

// apItemRow is the item row (level 2) whose own key is item; ok false when
// the run has none.
func apItemRow(res *reports.Result, item string) (reports.Row, bool) {
	for _, r := range res.Rows {
		if r.Kind != reports.KindGroup || r.Level != 2 || len(r.GroupKey) < 2 {
			continue
		}
		if own, _ := r.GroupKey[1].(string); own == item {
			return r, true
		}
	}
	return reports.Row{}, false
}

func apRequireItemRow(t *testing.T, res *reports.Result, item string) reports.Row {
	t.Helper()
	r, ok := apItemRow(res, item)
	if !ok {
		t.Fatalf("no item row for %s; rows %q", item, bsLabels(res))
	}
	return r
}

// apItemsOf are the item rows under an opened vendor row.
func apItemsOf(t *testing.T, res *reports.Result, vendorRow reports.Row) []reports.Row {
	t.Helper()
	out := []reports.Row{}
	for _, r := range arUnder(t, res, vendorRow) {
		if r.Kind == reports.KindGroup && r.Level == 2 {
			out = append(out, r)
		}
	}
	return out
}

// apOpenVendor runs the report with vendor's row opened.
func apOpenVendor(t *testing.T, b apBook, params map[string]any, vendor *core.Record) (*reports.Result, reports.Row) {
	t.Helper()
	key := apVendorRow(t, runAP(t, b.app, b.reader, params), vendor).GroupKey
	res := apRunOpen(t, b, params, key)
	return res, apVendorRow(t, res, vendor)
}

// apOpenItem runs the report with vendor's row and its item opened.
func apOpenItem(t *testing.T, b apBook, params map[string]any, vendor *core.Record, item string) (*reports.Result, reports.Row) {
	t.Helper()
	opened, row := apOpenVendor(t, b, params, vendor)
	itemKey := apRequireItemRow(t, opened, item).GroupKey
	res := apRunOpen(t, b, params, row.GroupKey, itemKey)
	return res, apRequireItemRow(t, res, item)
}

// apItemTotal is the Total of item's row as of day with vendor opened.
func apItemTotal(t *testing.T, b apBook, day string, vendor *core.Record, item string) int64 {
	t.Helper()
	res, _ := apOpenVendor(t, b, map[string]any{"asOf": day}, vendor)
	v, _ := agedCell(t, apRequireItemRow(t, res, item), "total")
	return v
}

// apNo is the number Books prints for a posted document: its entry's number.
func apNo(t *testing.T, b apBook, doc *core.Record) string {
	t.Helper()
	number, _ := apEntry(t, b, doc.GetString("entry"))
	return number
}

// apRoute is the app path of a document of type kind (server/entry_routes.json).
func apRoute(t *testing.T, kind, id string) string {
	t.Helper()
	raw, err := os.ReadFile("entry_routes.json")
	if err != nil {
		t.Fatalf("read entry_routes.json: %v", err)
	}
	routes := map[string]string{}
	if err := json.Unmarshal(raw, &routes); err != nil {
		t.Fatalf("parse entry_routes.json: %v", err)
	}
	route, ok := routes[kind]
	if !ok {
		t.Fatalf("entry_routes.json has no route for %s", kind)
	}
	return "books/" + route + "/" + id
}

type apLineShape struct {
	Label, Open, Due string
	Figs             map[string]int64
}

func apLineShapes(t *testing.T, lines []reports.Row) []apLineShape {
	t.Helper()
	out := make([]apLineShape, len(lines))
	for i, l := range lines {
		out[i] = apLineShape{l.Label, l.Open, dueOf(l), arFigs(t, l)}
	}
	return out
}

func TestAPAgingSpecLoads(t *testing.T) {
	b := newAPBook(t)
	if err := reports.CheckSources(b.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}

	shipped := apAgingShipped()
	if apAgingKey != "books.ap_aging" || shipped.Key != apAgingKey {
		t.Errorf("key = %q (const %q), want books.ap_aging", shipped.Key, apAgingKey)
	}
	if shipped.Title != "A/P Aging" {
		t.Errorf("title = %q, want A/P Aging", shipped.Title)
	}
	if shipped.Description != "What you owe each vendor on one day, by how long each open bill is past due." {
		t.Errorf("description = %q", shipped.Description)
	}
	if shipped.Revision != 1 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	if !jsonEqual(t, shipped.Spec, string(mustJSON(apAgingSpec()))) {
		t.Errorf("the shipped spec is not apAgingSpec()")
	}

	spec, _, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.Version != reports.CurrentVersion {
		t.Errorf("version %d, want %d", spec.Version, reports.CurrentVersion)
	}
	if spec.Source != "books.payable_items" {
		t.Errorf("source = %q, want books.payable_items", spec.Source)
	}
	if err := reports.Validate(b.app, spec); err != nil {
		t.Fatalf("Validate: %v", err)
	}

	paramIDs := make([]string, len(spec.Params))
	for i, p := range spec.Params {
		paramIDs[i] = p.ID
	}
	if !reflect.DeepEqual(paramIDs, []string{"asOf", "vendors", "order"}) {
		t.Fatalf("params = %v, want asOf, vendors, order", paramIDs)
	}
	asOf := paramOf(t, spec, "asOf")
	if asOf.Type != reports.ParamAsOf || asOf.Label != "As of" || !jsonEqual(t, asOf.Default, `{"preset":"today"}`) {
		t.Errorf("asOf = %+v (default %s), want As of, default Today", asOf, asOf.Default)
	}
	vendors := paramOf(t, spec, "vendors")
	if got, want := mustJSON(vendors), mustJSON(vendorsParam()); string(got) != string(want) {
		t.Errorf("the vendors param = %s, want vendorsParam() %s", got, want)
	}
	if vendors.Type != reports.ParamChoice || !vendors.Multiple || vendors.Label != "Vendor" || vendors.Header != "Vendor: {label}" ||
		vendors.OptionsFrom == nil || vendors.OptionsFrom.Source != "books.vendors" {
		t.Errorf("vendors = %+v, want a multiple choice Vendor from books.vendors with the header \"Vendor: {label}\"", vendors)
	}
	order := paramOf(t, spec, "order")
	wantOrder := []reports.Option{{Value: "name", Label: "Name"}, {Value: "balance", Label: "Largest balance"}}
	if order.Type != reports.ParamChoice || order.Label != "Order" || order.Multiple || order.OptionsFrom != nil ||
		!reflect.DeepEqual(order.Options, wantOrder) || !jsonEqual(t, order.Default, `"name"`) {
		t.Errorf("order = %+v (default %s), want a single choice Order: Name (default), Largest balance", order, order.Default)
	}

	colIDs := make([]string, len(spec.Columns))
	for i, c := range spec.Columns {
		colIDs[i] = c.ID
	}
	wantColIDs := []string{"name", "due", "current", "d30", "d60", "d90", "d91", "total", "vendorKey", "itemKey", "itemNo"}
	if !reflect.DeepEqual(colIDs, wantColIDs) {
		t.Errorf("columns = %v, want %v", colIDs, wantColIDs)
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
		{ID: "byVendor", Col: "vendorKey", HideEmpty: true, Muted: true},
		{ID: "byItem", Col: "itemKey", Having: true},
	}
	if !reflect.DeepEqual(gotGroups, wantGroups) {
		t.Errorf("groups = %+v\nwant %+v", gotGroups, wantGroups)
	}
	if spec.Detail == nil || spec.Detail.Label == nil || spec.Detail.Open == nil {
		t.Errorf("detail = %+v, want a label and an open path", spec.Detail)
	}

	// A run shows the eight columns only; the hidden keys stay hidden.
	v := apVendor(t, b, "Shown Co")
	apBill(t, b, v, "2026-10-01", "2026-10-31", 10000)
	res, row := apOpenVendor(t, b, nil, v)
	type colShape struct{ ID, Label string }
	gotCols := make([]colShape, len(res.Columns))
	for i, col := range res.Columns {
		gotCols[i] = colShape{col.ID, col.Label}
	}
	wantCols := []colShape{
		{"name", "Vendor"}, {"due", "Due date"}, {"current", "Current"}, {"d30", "1 - 30"},
		{"d60", "31 - 60"}, {"d90", "61 - 90"}, {"d91", "91 and over"}, {"total", "Total"},
	}
	if !reflect.DeepEqual(gotCols, wantCols) {
		t.Errorf("result columns =\n%v\nwant\n%v", gotCols, wantCols)
	}
	if len(apItemsOf(t, res, row)) == 0 {
		t.Fatalf("the opened vendor has no item rows; rows %q", bsLabels(res))
	}
	for _, r := range res.Rows {
		for _, key := range []string{"vendorKey", "itemKey", "itemNo"} {
			if v, ok := r.Cells[key]; ok {
				t.Errorf("%s (%s) carries a %s cell %#v", r.Label, r.Kind, key, v)
			}
		}
	}
	requireNoDrift(t, b.app)
}

func TestAPAgingAgeColumns(t *testing.T) {
	b := newAPBook(t)
	// As of 2026-11-18: each due date gives the named age.
	cases := []struct {
		name, due, col string
		cents          int
	}{
		{name: "Age not yet due", due: "2026-11-30", col: "current", cents: 10100},
		{name: "Age 0", due: "2026-11-18", col: "current", cents: 20200},
		{name: "Age 1", due: "2026-11-17", col: "d30", cents: 40400},
		{name: "Age 30", due: "2026-10-19", col: "d30", cents: 80800},
		{name: "Age 31", due: "2026-10-18", col: "d60", cents: 161600},
		{name: "Age 60", due: "2026-09-19", col: "d60", cents: 323200},
		{name: "Age 61", due: "2026-09-18", col: "d90", cents: 646400},
		{name: "Age 90", due: "2026-08-20", col: "d90", cents: 1292800},
		{name: "Age 91", due: "2026-08-19", col: "d91", cents: 2585600},
	}
	vendors := map[string]*core.Record{}
	bills := map[string]*core.Record{}
	for _, c := range cases {
		vendors[c.name] = apVendor(t, b, c.name)
		bills[c.name] = apBill(t, b, vendors[c.name], "2026-08-01", c.due, c.cents)
	}

	params := map[string]any{"asOf": apToday}
	res := runAP(t, b.app, b.reader, params)
	want := map[string]int64{}
	var total int64
	keys := [][]any{}
	for _, c := range cases {
		row := apVendorRow(t, res, vendors[c.name])
		requireFigs(t, c.name+" (due "+c.due+")", row, map[string]int64{c.col: int64(c.cents), "total": int64(c.cents)})
		requireAgesAddUp(t, row)
		keys = append(keys, row.GroupKey)
		want[c.col] += int64(c.cents)
		total += int64(c.cents)
	}
	want["total"] = total
	requireFigs(t, "the Total", totalOf(t, res), want)
	requireAgesAddUp(t, totalOf(t, res))

	// Each item row has its amount in its one age column and in Total; every
	// other age cell is blank.
	opened := apRunOpen(t, b, params, keys...)
	for _, c := range cases {
		item := apRequireItemRow(t, opened, bills[c.name].Id)
		requireFigs(t, c.name+"'s bill", item, map[string]int64{c.col: int64(c.cents), "total": int64(c.cents)})
		vendorRow := apVendorRow(t, opened, vendors[c.name])
		if sum, figs := arSumFigs(t, apItemsOf(t, opened, vendorRow)), arFigs(t, vendorRow); !reflect.DeepEqual(sum, figs) {
			t.Errorf("%s: the items add up to %v, want the vendor row's %v", c.name, sum, figs)
		}
	}

	// A column with no money is blank on the Total row too; Total has a figure.
	one := runAP(t, b.app, b.reader, map[string]any{"asOf": apToday, "vendors": []string{vendors["Age 31"].Id}})
	requireFigs(t, "the Total of Age 31 alone", totalOf(t, one), map[string]int64{"d60": 161600, "total": 161600})
	requireNoDrift(t, b.app)
}

func TestAPAgingOpenItems(t *testing.T) {
	b := newAPBook(t)
	// A part payment, and a bill paid in full beside it.
	part := apVendor(t, b, "Part Co")
	partBill := apBill(t, b, part, "2026-10-01", "2026-10-31", 100000)
	apPayBills(t, b, part, "2026-11-03", map[string]int{partBill.Id: 30000})
	paidBill := apBill(t, b, part, "2026-10-02", "2026-11-01", 20000)
	apPayBills(t, b, part, "2026-11-04", map[string]int{paidBill.Id: 20000})
	// One payment of two bills.
	two := apVendor(t, b, "Two Bills Co")
	first := apBill(t, b, two, "2026-10-01", "2026-10-31", 40000)
	second := apBill(t, b, two, "2026-10-02", "2026-11-01", 60000)
	apPayBills(t, b, two, "2026-11-04", map[string]int{first.Id: 10000, second.Id: 25000})
	// A payment dated after the As of day.
	later := apVendor(t, b, "Later Co")
	laterBill := apBill(t, b, later, "2026-10-01", "2026-10-31", 50000)
	apPayBills(t, b, later, "2026-11-10", map[string]int{laterBill.Id: 20000})
	// A vendor whose only bill is paid.
	paidOnly := apVendor(t, b, "Paid Co")
	paidOnlyBill := apBill(t, b, paidOnly, "2026-10-01", "2026-10-31", 40000)
	apPayBills(t, b, paidOnly, "2026-10-05", map[string]int{paidOnlyBill.Id: 40000})

	res, row := apOpenVendor(t, b, nil, part)
	items := apItemsOf(t, res, row)
	if got, want := labelsOf(items), []string{"Bill " + apNo(t, b, partBill)}; !reflect.DeepEqual(got, want) {
		t.Errorf("Part Co's items = %q, want %q (the bill paid in full has none)", got, want)
	}
	if r, ok := apItemRow(res, paidBill.Id); ok {
		t.Errorf("a bill paid in full has the item %q", r.Label)
	}
	if v, _ := agedCell(t, apRequireItemRow(t, res, partBill.Id), "total"); v != 70000 {
		t.Errorf("the part-paid bill = %d, want 100000 less the payment 30000 = 70000", v)
	}

	if got := apItemTotal(t, b, apToday, two, first.Id); got != 30000 {
		t.Errorf("the first bill of the one payment = %d, want 40000 less its line 10000 = 30000", got)
	}
	if got := apItemTotal(t, b, apToday, two, second.Id); got != 35000 {
		t.Errorf("the second bill of the one payment = %d, want 60000 less its line 25000 = 35000", got)
	}

	if got := apItemTotal(t, b, "2026-11-09", later, laterBill.Id); got != 50000 {
		t.Errorf("as of 2026-11-09 a bill paid on 2026-11-10 = %d, want 50000 (the payment is after the day)", got)
	}

	if all := runAP(t, b.app, b.reader, nil); apHasVendor(all, paidOnly) {
		t.Errorf("a vendor whose only bill is paid has a row; rows %q", bsLabels(all))
	}
	requireNoDrift(t, b.app)
}

func TestAPAgingVendorCredit(t *testing.T) {
	b := newAPBook(t)

	t.Run("a credit with no application", func(t *testing.T) {
		v := apVendor(t, b, "Credit Co")
		apBill(t, b, v, "2026-10-01", "2026-10-31", 80000)
		credit := apVendorCredit(t, b, v, "2026-10-20", 25000)
		res, row := apOpenVendor(t, b, nil, v)
		item := apRequireItemRow(t, res, credit.Id)
		if want := "Vendor credit " + apNo(t, b, credit); item.Label != want {
			t.Errorf("the credit's item is labelled %q, want %q", item.Label, want)
		}
		// Its own date 2026-10-20 is 29 days before the As of day.
		requireFigs(t, "the credit", item, map[string]int64{"d30": -25000, "total": -25000})
		if dueOf(item) != "2026-10-20" {
			t.Errorf("the credit's Due date = %q, want its own date 2026-10-20", dueOf(item))
		}
		if v, _ := agedCell(t, row, "total"); v != 55000 {
			t.Errorf("the vendor's Total = %d, want the bill 80000 less the credit 25000 = 55000", v)
		}
	})

	t.Run("a credit applied in part, before and on the apply date", func(t *testing.T) {
		v := apVendor(t, b, "Applied Co")
		bill := apBill(t, b, v, "2026-10-01", "2026-10-31", 80000)
		credit := apVendorCredit(t, b, v, "2026-10-20", 25000)
		apApply(t, b, credit, bill, "2026-11-05", 10000)
		for _, tc := range []struct {
			day          string
			bill, credit int64
		}{
			{"2026-11-04", 80000, -25000},
			{"2026-11-05", 70000, -15000},
		} {
			if got := apItemTotal(t, b, tc.day, v, bill.Id); got != tc.bill {
				t.Errorf("as of %s the bill = %d, want %d", tc.day, got, tc.bill)
			}
			if got := apItemTotal(t, b, tc.day, v, credit.Id); got != tc.credit {
				t.Errorf("as of %s the credit = %d, want %d", tc.day, got, tc.credit)
			}
		}
	})

	t.Run("a removed application reads as never applied on its old day", func(t *testing.T) {
		v := apVendor(t, b, "Removed Co")
		bill := apBill(t, b, v, "2026-10-01", "2026-10-31", 80000)
		credit := apVendorCredit(t, b, v, "2026-10-20", 25000)
		application := apApply(t, b, credit, bill, "2026-11-05", 10000)
		if a := b.removeAs(t, b.users.bookkeeper, application); a.status != http.StatusNoContent {
			t.Fatalf("remove the application answered %d; body: %s", a.status, a.body)
		}
		if got := apItemTotal(t, b, "2026-11-05", v, bill.Id); got != 80000 {
			t.Errorf("as of the old apply date the bill = %d, want it whole 80000", got)
		}
		if got := apItemTotal(t, b, "2026-11-05", v, credit.Id); got != -25000 {
			t.Errorf("as of the old apply date the credit = %d, want it whole -25000", got)
		}
	})

	t.Run("a refund of part of the credit", func(t *testing.T) {
		v := apVendor(t, b, "Refund Co")
		credit := apVendorCredit(t, b, v, "2026-10-20", 25000)
		apRefund(t, b, v, "2026-11-06", map[string]int{credit.Id: 10000})
		if got := apItemTotal(t, b, apToday, v, credit.Id); got != -15000 {
			t.Errorf("the credit after a refund of 10000 = %d, want -15000", got)
		}
	})

	t.Run("a credit used up by an application and a refund", func(t *testing.T) {
		v := apVendor(t, b, "Used Co")
		bill := apBill(t, b, v, "2026-10-01", "2026-10-31", 80000)
		credit := apVendorCredit(t, b, v, "2026-10-20", 20000)
		apApply(t, b, credit, bill, "2026-11-05", 12000)
		apRefund(t, b, v, "2026-11-06", map[string]int{credit.Id: 8000})
		res, _ := apOpenVendor(t, b, nil, v)
		if r, ok := apItemRow(res, credit.Id); ok {
			t.Errorf("a credit used up has the item %q", r.Label)
		}
		if v, _ := agedCell(t, apRequireItemRow(t, res, bill.Id), "total"); v != 68000 {
			t.Errorf("the bill = %d, want 80000 less the applied 12000 = 68000", v)
		}
	})
	requireNoDrift(t, b.app)
}

func TestAPAgingAsOfDay(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Day Co")
	bill := apBill(t, b, v, "2026-10-01", "2026-10-31", 90000)
	apPayBills(t, b, v, "2026-11-03", map[string]int{bill.Id: 30000})

	if res := runAP(t, b.app, b.reader, map[string]any{"asOf": "2026-09-30"}); apHasVendor(res, v) {
		t.Errorf("as of 2026-09-30 (the day before the bill) the vendor has a row; rows %q", bsLabels(res))
	}
	if got := apItemTotal(t, b, "2026-11-02", v, bill.Id); got != 90000 {
		t.Errorf("as of 2026-11-02 (the day before the payment) the bill = %d, want it whole 90000", got)
	}
	if got := apItemTotal(t, b, "2026-11-03", v, bill.Id); got != 60000 {
		t.Errorf("as of 2026-11-03 (the payment's day) the bill = %d, want 60000", got)
	}
	requireNoDrift(t, b.app)
}

// An item paid in full is not read from its settled day on, and is read whole
// on a day before it: the settled filter is strict (settled > As of).
func TestAPAgingSettledItemOnPastDay(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Settled Co")
	bill := apBill(t, b, v, "2026-10-01", "2026-10-31", 40000)
	apPayBills(t, b, v, "2026-10-05", map[string]int{bill.Id: 40000})
	if got := apSettledOf(t, b.app, bill.Id); got != "2026-10-05" {
		t.Fatalf("the paid bill's rows are settled %q, want 2026-10-05", got)
	}

	if got := apItemTotal(t, b, "2026-10-04", v, bill.Id); got != 40000 {
		t.Errorf("as of 2026-10-04 (before it settled) the bill = %d, want it whole 40000", got)
	}
	for _, day := range []string{"2026-10-05", "2026-10-06", apToday} {
		if res := runAP(t, b.app, b.reader, map[string]any{"asOf": day}); apHasVendor(res, v) {
			t.Errorf("as of %s (paid in full) the vendor has a row; rows %q", day, bsLabels(res))
		}
	}
	requireNoDrift(t, b.app)
}

func TestAPAgingItemLines(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Lines Co")
	bill := apBill(t, b, v, "2026-10-01", "2026-10-31", 200000)
	pay := apPayBills(t, b, v, "2026-11-03", map[string]int{bill.Id: 80000})
	credit := apVendorCredit(t, b, v, "2026-10-02", 40000)
	apApply(t, b, credit, bill, "2026-11-05", 15000)
	refund := apRefund(t, b, v, "2026-11-09", map[string]int{credit.Id: 10000})
	je := apJournal(t, b, "2026-09-01", v, 0, 31000)

	// The bill is due 2026-10-31: age 18, so every line is in 1 - 30.
	res, item := apOpenItem(t, b, nil, v, bill.Id)
	if dueOf(item) != "2026-10-31" {
		t.Errorf("the bill's item Due date = %q, want 2026-10-31", dueOf(item))
	}
	billNo := apNo(t, b, bill)
	creditNo := apNo(t, b, credit)
	got := apLineShapes(t, arLinesOf(t, res, item))
	want := []apLineShape{
		{"2026-10-01 · Bill " + billNo, apRoute(t, "bill", bill.Id), "", map[string]int64{"d30": 200000, "total": 200000}},
		{"2026-11-03 · Bill payment " + apNo(t, b, pay), apRoute(t, "bill_payment", pay.Id), "", map[string]int64{"d30": -80000, "total": -80000}},
		{"2026-11-05 · Vendor credit " + creditNo, apRoute(t, "vendor_credit", credit.Id), "", map[string]int64{"d30": -15000, "total": -15000}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("the bill's lines =\n%+v\nwant\n%+v", got, want)
	}
	if sum, figs := arSumFigs(t, arLinesOf(t, res, item)), arFigs(t, item); !reflect.DeepEqual(sum, figs) || figs["total"] != 105000 {
		t.Errorf("the bill's lines add up to %v, want the item's %v (total 105000)", sum, figs)
	}
	if r := apVendorRow(t, res, v); dueOf(r) != "" {
		t.Errorf("the vendor row has a Due date %q, want blank", dueOf(r))
	}
	if r := totalOf(t, res); dueOf(r) != "" {
		t.Errorf("the Total row has a Due date %q, want blank", dueOf(r))
	}

	// The credit is dated 2026-10-02: age 47, so every line is in 31 - 60.
	cres, citem := apOpenItem(t, b, nil, v, credit.Id)
	gotCredit := apLineShapes(t, arLinesOf(t, cres, citem))
	wantCredit := []apLineShape{
		{"2026-10-02 · Vendor credit " + creditNo, apRoute(t, "vendor_credit", credit.Id), "", map[string]int64{"d60": -40000, "total": -40000}},
		{"2026-11-05 · Bill " + billNo, apRoute(t, "bill", bill.Id), "", map[string]int64{"d60": 15000, "total": 15000}},
		{"2026-11-09 · Vendor refund " + apNo(t, b, refund), apRoute(t, "vendor_refund", refund.Id), "", map[string]int64{"d60": 10000, "total": 10000}},
	}
	if !reflect.DeepEqual(gotCredit, wantCredit) {
		t.Errorf("the credit's lines =\n%+v\nwant\n%+v", gotCredit, wantCredit)
	}
	if sum, figs := arSumFigs(t, arLinesOf(t, cres, citem)), arFigs(t, citem); !reflect.DeepEqual(sum, figs) || figs["total"] != -15000 {
		t.Errorf("the credit's lines add up to %v, want the item's %v (total -15000)", sum, figs)
	}

	jres, jitem := apOpenItem(t, b, nil, v, apLineOf(t, b, je.Id).Id)
	jlines := arLinesOf(t, jres, jitem)
	if len(jlines) != 1 || jlines[0].Open != "books/entries/"+je.Id {
		t.Errorf("the journal item's lines = %+v, want one that opens books/entries/%s", apLineShapes(t, jlines), je.Id)
	}
	requireNoDrift(t, b.app)
}

// Items of one vendor are by due date, then by number as an integer: bill 9
// before bill 10, where text puts "10" first.
func TestAPAgingItemOrder(t *testing.T) {
	b := newAPBook(t)
	if err := setFields(t, b.app, "books_doc_sequences", "booksseqbill000", map[string]any{"next_number": 9}); err != nil {
		t.Fatalf("set the bill sequence to 9: %v", err)
	}
	v := apVendor(t, b, "Order Co")
	bill9 := apBill(t, b, v, "2026-10-11", "2026-11-10", 1000)
	bill10 := apBill(t, b, v, "2026-10-11", "2026-11-10", 2000)
	bill11 := apBill(t, b, v, "2026-10-02", "2026-11-01", 3000)
	if got := []string{apNo(t, b, bill9), apNo(t, b, bill10), apNo(t, b, bill11)}; !reflect.DeepEqual(got, []string{"9", "10", "11"}) {
		t.Fatalf("the bills are numbered %q, want 9, 10 and 11", got)
	}

	for _, order := range []string{"name", "balance"} {
		res, row := apOpenVendor(t, b, map[string]any{"order": order}, v)
		got := []string{}
		for _, r := range apItemsOf(t, res, row) {
			own, _ := r.GroupKey[1].(string)
			got = append(got, own)
		}
		if want := []string{bill11.Id, bill9.Id, bill10.Id}; !reflect.DeepEqual(got, want) {
			t.Errorf("order = %s: the items %q (labels %q), want bill 11 (due first), then 9, then 10",
				order, got, labelsOf(apItemsOf(t, res, row)))
		}
	}
	requireNoDrift(t, b.app)
}

func TestAPAgingNoVendor(t *testing.T) {
	b := newAPBook(t)
	rivera := apVendor(t, b, "Rivera Accounting Partners")
	// 2026-10-04 is 45 days before the As of day.
	owed := apJournal(t, b, "2026-10-04", rivera, 0, 31000)
	paidDown := apJournal(t, b, "2026-11-02", rivera, 4000, 0)
	zed := apVendor(t, b, "Zed Supply")
	apBill(t, b, zed, "2026-10-01", "2026-10-31", 5000)
	// Larger than every vendor, so Largest balance would put it first.
	none := apJournal(t, b, "2026-11-02", nil, 0, 90000)

	res, row := apOpenVendor(t, b, nil, rivera)
	item := apRequireItemRow(t, res, apLineOf(t, b, owed.Id).Id)
	if want := "Journal entry " + owed.GetString("number"); item.Label != want {
		t.Errorf("the manual line's item is labelled %q, want %q", item.Label, want)
	}
	requireFigs(t, "the manual credit line", item, map[string]int64{"d60": 31000, "total": 31000})
	if dueOf(item) != "2026-10-04" {
		t.Errorf("the manual line's Due date = %q, want its entry's date 2026-10-04", dueOf(item))
	}
	requireFigs(t, "the manual debit line", apRequireItemRow(t, res, apLineOf(t, b, paidDown.Id).Id),
		map[string]int64{"d30": -4000, "total": -4000})
	if v, _ := agedCell(t, row, "total"); v != 27000 {
		t.Errorf("Rivera's Total = %d, want 31000 - 4000 = 27000", v)
	}

	for _, order := range []string{"name", "balance"} {
		ordered := runAP(t, b.app, b.reader, map[string]any{"order": order})
		labels := cbDepth0(ordered)
		if len(labels) == 0 || labels[len(labels)-1] != "No vendor" {
			t.Errorf("order = %s: vendor rows %q, want No vendor last", order, labels)
		}
		noVendor := bsRow(t, ordered, "No vendor")
		if noVendor.Kind != reports.KindGroup || noVendor.Level != 1 {
			t.Errorf("order = %s: No vendor is %s level %d, want a vendor row", order, noVendor.Kind, noVendor.Level)
		}
		if order != "name" {
			continue
		}
		opened := apRunOpen(t, b, nil, noVendor.GroupKey)
		items := apItemsOf(t, opened, bsRow(t, opened, "No vendor"))
		if got, want := labelsOf(items), []string{"Journal entry " + none.GetString("number")}; !reflect.DeepEqual(got, want) {
			t.Errorf("No vendor opened = %q, want %q", got, want)
		}
	}

	if picked := runAP(t, b.app, b.reader, map[string]any{"vendors": []string{zed.Id}}); bsHas(picked, "No vendor") {
		t.Errorf("with one vendor picked the No vendor row shows; rows %q", bsLabels(picked))
	}
	requireNoDrift(t, b.app)
}

func TestAPAgingVoids(t *testing.T) {
	b := newAPBook(t)
	admin := b.users.admin.Id

	voidBill := apVendor(t, b, "Void Bill Co")
	voided := apBill(t, b, voidBill, "2026-10-01", "2026-10-31", 30000)
	open := apBill(t, b, voidBill, "2026-10-02", "2026-11-01", 10000)
	if err := voidBillAs(b.app, voided.Id, admin); err != nil {
		t.Fatalf("void the bill: %v", err)
	}

	voidPay := apVendor(t, b, "Void Payment Co")
	unpaid := apBill(t, b, voidPay, "2026-10-01", "2026-10-31", 40000)
	pay := apPayBills(t, b, voidPay, "2026-11-03", map[string]int{unpaid.Id: 30000})
	if err := voidBillPaymentAs(b.app, pay.Id, admin); err != nil {
		t.Fatalf("void the bill payment: %v", err)
	}

	voidCredit := apVendor(t, b, "Void Credit Co")
	apBill(t, b, voidCredit, "2026-10-01", "2026-10-31", 50000)
	credit := apVendorCredit(t, b, voidCredit, "2026-10-20", 20000)
	if err := voidVendorCreditAs(b.app, credit.Id, admin); err != nil {
		t.Fatalf("void the vendor credit: %v", err)
	}

	voidRefund := apVendor(t, b, "Void Refund Co")
	refunded := apVendorCredit(t, b, voidRefund, "2026-10-20", 20000)
	refund := apRefund(t, b, voidRefund, "2026-11-06", map[string]int{refunded.Id: 5000})
	if err := voidRefundAs(b.app, refund.Id, admin); err != nil {
		t.Fatalf("void the vendor refund: %v", err)
	}

	res := apRunOpen(t, b, nil,
		apVendorRow(t, runAP(t, b.app, b.reader, nil), voidBill).GroupKey,
		apVendorRow(t, runAP(t, b.app, b.reader, nil), voidPay).GroupKey,
		apVendorRow(t, runAP(t, b.app, b.reader, nil), voidCredit).GroupKey,
		apVendorRow(t, runAP(t, b.app, b.reader, nil), voidRefund).GroupKey,
	)
	if r, ok := apItemRow(res, voided.Id); ok {
		t.Errorf("a void bill has the item %q", r.Label)
	}
	if got, want := labelsOf(apItemsOf(t, res, apVendorRow(t, res, voidBill))), []string{"Bill " + apNo(t, b, open)}; !reflect.DeepEqual(got, want) {
		t.Errorf("Void Bill Co's items = %q, want %q", got, want)
	}
	if v, _ := agedCell(t, apRequireItemRow(t, res, unpaid.Id), "total"); v != 40000 {
		t.Errorf("the bill after its payment's void = %d, want it whole 40000", v)
	}
	if r, ok := apItemRow(res, credit.Id); ok {
		t.Errorf("a void vendor credit has the item %q", r.Label)
	}
	if v, _ := agedCell(t, apRequireItemRow(t, res, refunded.Id), "total"); v != -20000 {
		t.Errorf("the credit after its refund's void = %d, want -20000 (as before the refund)", v)
	}
	requireNoDrift(t, b.app)
}

func TestAPAgingCorrections(t *testing.T) {
	// The corrections are dated with the test defaults (billDay,
	// vendorCreditDay), so every run reads a day after all of them.
	params := map[string]any{"asOf": "2026-12-31"}

	t.Run("a corrected bill", func(t *testing.T) {
		b := newAPBook(t)
		v := apVendor(t, b, "Corrected Bill Co")
		original := apBill(t, b, v, billDay, billDueDay, 50000)
		pay := apPayBills(t, b, v, "2026-11-10", map[string]int{original.Id: 20000})
		credit := apVendorCredit(t, b, v, "2026-11-05", 10000)
		apApply(t, b, credit, original, "2026-11-12", 10000)
		draft := b.billCorrectionOf(t, original, v, 45000)
		mustPostBill(t, b.app, draft.Id, b.users.bookkeeper.Id)
		corrected := reload(t, b.app, "books_bills", draft.Id)

		res, row := apOpenVendor(t, b, params, v)
		if r, ok := apItemRow(res, original.Id); ok {
			t.Errorf("the replaced bill has the item %q", r.Label)
		}
		items := apItemsOf(t, res, row)
		if got, want := labelsOf(items), []string{"Bill " + apNo(t, b, corrected)}; !reflect.DeepEqual(got, want) {
			t.Fatalf("the vendor's items = %q, want one item under the correction's number %q", got, want)
		}
		lres, item := apOpenItem(t, b, params, v, corrected.Id)
		if v, _ := agedCell(t, item, "total"); v != 15000 {
			t.Errorf("the corrected bill = %d, want 45000 less the payment 20000 and the credit 10000 = 15000", v)
		}
		labels := labelsOf(arLinesOf(t, lres, item))
		for _, want := range []string{
			"2026-11-10 · Bill payment " + apNo(t, b, pay),
			"2026-11-12 · Vendor credit " + apNo(t, b, credit),
		} {
			if !slices.Contains(labels, want) {
				t.Errorf("the corrected bill's lines %q have no %q", labels, want)
			}
		}
		requireNoDrift(t, b.app)
	})

	t.Run("a corrected bill payment", func(t *testing.T) {
		b := newAPBook(t)
		v := apVendor(t, b, "Corrected Payment Co")
		first := apBill(t, b, v, "2026-08-04", "2026-09-03", 30000)
		second := apBill(t, b, v, "2026-08-05", "2026-09-04", 40000)
		original := apPayBills(t, b, v, "2026-09-10", map[string]int{first.Id: 30000})
		b.pay(t, v, map[string]any{"replaces": original.Id, "date": "2026-09-10", "paid_from": b.bank.Id},
			payLine{first, 30000}, payLine{second, 10000})

		res, _ := apOpenVendor(t, b, params, v)
		if r, ok := apItemRow(res, first.Id); ok {
			t.Errorf("the bill the correction pays in full has the item %q", r.Label)
		}
		if v, _ := agedCell(t, apRequireItemRow(t, res, second.Id), "total"); v != 30000 {
			t.Errorf("the second bill = %d, want 40000 less the correction's line 10000 = 30000", v)
		}
		requireNoDrift(t, b.app)
	})

	t.Run("a corrected vendor credit", func(t *testing.T) {
		b := newAPBook(t)
		v := apVendor(t, b, "Corrected Credit Co")
		credit := apVendorCredit(t, b, v, vendorCreditDay, 42500)
		bill := apBill(t, b, v, billDay, billDueDay, 50000)
		apApply(t, b, credit, bill, applyDay, 10000)
		apRefund(t, b, v, refundDay, map[string]int{credit.Id: 15000})
		draft := b.creditCorrectionOf(t, credit, v, billAmount{b.expense, 40000})
		mustPostVendorCredit(t, b.app, draft.Id, b.users.bookkeeper.Id)

		res, _ := apOpenVendor(t, b, params, v)
		if r, ok := apItemRow(res, credit.Id); ok {
			t.Errorf("the replaced credit has the item %q", r.Label)
		}
		item := apRequireItemRow(t, res, draft.Id)
		if want := "Vendor credit " + apNo(t, b, reload(t, b.app, "books_vendor_credits", draft.Id)); item.Label != want {
			t.Errorf("the correction's item is labelled %q, want %q", item.Label, want)
		}
		if v, _ := agedCell(t, item, "total"); v != -15000 {
			t.Errorf("the corrected credit = %d, want -(40000 - 10000 - 15000) = -15000", v)
		}
		if v, _ := agedCell(t, apRequireItemRow(t, res, bill.Id), "total"); v != 40000 {
			t.Errorf("the bill = %d, want 50000 less the moved application 10000 = 40000", v)
		}
		requireNoDrift(t, b.app)
	})
}

func TestAPAgingInactive(t *testing.T) {
	b := newAPBook(t)
	sleepy := apVendor(t, b, "Sleepy Supply")
	awake := apVendor(t, b, "Awake Supply")
	apBill(t, b, sleepy, "2026-10-01", "2026-10-31", 10000)
	apBill(t, b, awake, "2026-10-01", "2026-10-31", 20000)
	if err := setFields(t, b.app, "books_vendors", sleepy.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Sleepy Supply inactive: %v", err)
	}

	res := runAP(t, b.app, b.reader, nil)
	sleepyRow := apVendorRow(t, res, sleepy)
	if !sleepyRow.Muted || sleepyRow.Label != "Sleepy Supply (inactive)" {
		t.Errorf("the inactive vendor = label %q muted %v, want \"Sleepy Supply (inactive)\" muted", sleepyRow.Label, sleepyRow.Muted)
	}
	awakeRow := apVendorRow(t, res, awake)
	if awakeRow.Muted || strings.HasSuffix(awakeRow.Label, " (inactive)") {
		t.Errorf("the active vendor = label %q muted %v, want \"Awake Supply\" not muted", awakeRow.Label, awakeRow.Muted)
	}
	if totalOf(t, res).Muted {
		t.Errorf("the Total row is muted, want never")
	}
	requireNoDrift(t, b.app)
}

func TestAPAgingVendorsParam(t *testing.T) {
	b := newAPBook(t)
	aspen := apVendor(t, b, "Aspen Supply")
	birch := apVendor(t, b, "Birch Supply")
	cedar := apVendor(t, b, "Cedar Supply")
	apBill(t, b, aspen, "2026-10-01", "2026-10-31", 10000)
	apBill(t, b, birch, "2026-10-01", "2026-10-31", 20000)
	apBill(t, b, cedar, "2026-10-01", "2026-10-31", 40000)
	if err := setFields(t, b.app, "books_vendors", cedar.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Cedar Supply inactive: %v", err)
	}

	res := runAP(t, b.app, b.reader, map[string]any{"vendors": []string{aspen.Id, birch.Id}})
	if got, want := labelsOf(apVendorRows(res)), []string{"Aspen Supply", "Birch Supply"}; !reflect.DeepEqual(got, want) {
		t.Errorf("two vendors picked: vendor rows %q, want %q", got, want)
	}
	requireFigs(t, "the Total of the two picks", totalOf(t, res), map[string]int64{"d30": 30000, "total": 30000})
	if !slices.Contains(res.HeaderLines, "Vendor: Aspen Supply, Birch Supply") {
		t.Errorf("header lines = %q, want \"Vendor: Aspen Supply, Birch Supply\"", res.HeaderLines)
	}

	spec, _, err := reports.Load(apAgingShipped().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	options, err := reports.ReadParamOptions(context.Background(), b.app, reports.OptionsRequest{
		Spec: spec, Param: "vendors", Auth: b.reader, Today: apToday,
	})
	if err != nil {
		t.Fatalf("the vendors param's options: %v", err)
	}
	if !slices.ContainsFunc(options.Options, func(o reports.ParamOption) bool {
		return o.Value == cedar.Id && o.Label == "Cedar Supply"
	}) {
		t.Errorf("the Vendor picker does not offer the inactive Cedar Supply; options %+v", options.Options)
	}
	requireNoDrift(t, b.app)
}

func TestAPAgingOrder(t *testing.T) {
	b := newAPBook(t)
	// Delta posts its 10.00 bill first: one due date, so by number it is first.
	delta := apVendor(t, b, "Delta")
	apBill(t, b, delta, "2026-10-02", "2026-11-02", 1000)
	apBill(t, b, delta, "2026-10-02", "2026-11-02", 2000)
	// bravo ties Delta at 30.00; its items' figures are not in due-date order.
	bravo := apVendor(t, b, "bravo")
	apBill(t, b, bravo, "2026-10-03", "2026-11-03", 2500)
	apBill(t, b, bravo, "2026-10-02", "2026-11-02", 1000)
	apVendorCredit(t, b, bravo, "2026-11-04", 500)
	charlie := apVendor(t, b, "Charlie")
	apBill(t, b, charlie, "2026-10-02", "2026-11-02", 7000)
	// A credit-only vendor: a negative Total.
	echo := apVendor(t, b, "Echo")
	apVendorCredit(t, b, echo, "2026-11-02", 500)
	// No vendor, larger than every vendor.
	apJournal(t, b, "2026-11-02", nil, 0, 90000)

	itemFigs := func(order string, v *core.Record) []int64 {
		res, row := apOpenVendor(t, b, map[string]any{"order": order}, v)
		out := []int64{}
		for _, r := range apItemsOf(t, res, row) {
			n, _ := agedCell(t, r, "total")
			out = append(out, n)
		}
		return out
	}

	byName := runAP(t, b.app, b.reader, map[string]any{"order": "name"})
	if got, want := cbDepth0(byName), []string{"bravo", "Charlie", "Delta", "Echo", "No vendor"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = name: vendor rows %q, want %q (name order ignoring case, No vendor last)", got, want)
	}
	if byDefault := runAP(t, b.app, b.reader, nil); !reflect.DeepEqual(bsLabels(byDefault), bsLabels(byName)) {
		t.Errorf("no Order param gives %q, want Name's %q", bsLabels(byDefault), bsLabels(byName))
	}
	byBalance := runAP(t, b.app, b.reader, map[string]any{"order": "balance"})
	if got, want := cbDepth0(byBalance), []string{"Charlie", "bravo", "Delta", "Echo", "No vendor"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = balance: vendor rows %q, want %q (largest first, ties by name, the credit-only vendor after the positive ones, No vendor last)", got, want)
	}

	for _, order := range []string{"name", "balance"} {
		if got := itemFigs(order, bravo); !reflect.DeepEqual(got, []int64{1000, 2500, -500}) {
			t.Errorf("order = %s: bravo's items = %v, want [1000 2500 -500] (due-date order)", order, got)
		}
		if got := itemFigs(order, delta); !reflect.DeepEqual(got, []int64{1000, 2000}) {
			t.Errorf("order = %s: Delta's items = %v, want [1000 2000] (one due date: by number)", order, got)
		}
	}
	requireNoDrift(t, b.app)
}

func TestAPAgingTies(t *testing.T) {
	b := newAPBook(t)
	vendors := apTieBook(t, b)
	for _, day := range []string{apToday, "2026-09-15"} {
		t.Run("as of "+day, func(t *testing.T) {
			opts := reports.Options{Today: day}
			res, err := runAPErr(t, b.app, b.reader, map[string]any{"asOf": day}, opts)
			if err != nil {
				t.Fatalf("Run: %v", err)
			}
			bs := runBS(t, b.app, b.reader, map[string]any{"asOf": day}, opts)
			if day == apToday {
				balances := partyBalances(t, b.app)
				for _, v := range vendors {
					row := apVendorRow(t, res, v)
					if want, found := balances[v.Id]; !found || amt(t, row, "total") != int64(want) {
						t.Errorf("%s: Total %d, want its books_party_balances balance %d (found %v)",
							v.GetString("display_name"), amt(t, row, "total"), want, found)
					}
				}
			}
			total := amt(t, totalOf(t, res), "total")
			if want := amt(t, bsAccount(t, bs, b.payable), "current"); total != want {
				t.Errorf("the Total %d, want the Balance Sheet's Accounts payable %d", total, want)
			}
			for _, r := range res.Rows {
				if (r.Kind == reports.KindGroup && r.Level == 1) || r.Kind == reports.KindTotal {
					requireAgesAddUp(t, r)
				}
			}
		})
	}
	requireNoDrift(t, b.app)
}

func TestAPAgingEmpty(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "October Co")
	apBill(t, b, v, "2026-10-01", "2026-10-31", 10000)
	if !apHasVendor(runAP(t, b.app, b.reader, nil), v) {
		t.Fatal("today has no row for October Co: the book must hold an open item")
	}
	emptyDay := apEmptyDay(t)
	res := runAP(t, b.app, b.reader, map[string]any{"asOf": emptyDay})
	for _, r := range res.Rows {
		if r.Kind != reports.KindTotal {
			t.Errorf("as of %s the report has the row %q (%s), want no rows", emptyDay, r.Label, r.Kind)
		}
	}
	requireNoDrift(t, b.app)
}

func TestAPAgingNoAccess(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Seen Co")
	apBill(t, b, v, "2026-10-01", "2026-10-31", 10000)
	if !apHasVendor(runAP(t, b.app, b.reader, nil), v) {
		t.Fatal("the Books reader does not see Seen Co")
	}
	res, err := runAPErr(t, b.app, b.none, nil, reports.Options{})
	if err != nil {
		t.Fatalf("the run of a user with Books level none was refused (%v); core runs it with the rule's rows", err)
	}
	if rows := apVendorRows(res); len(rows) != 0 {
		t.Errorf("a user with Books level none sees vendor rows %q", labelsOf(rows))
	}
	requireNoDrift(t, b.app)
}

func TestAPAgingTopics(t *testing.T) {
	b := newAPBook(t)
	apBill(t, b, apVendor(t, b, "Topic Co"), "2026-10-01", "2026-10-31", 10000)
	res := runAP(t, b.app, b.reader, nil)
	if len(apVendorRows(res)) == 0 {
		t.Fatalf("the run has no vendor row; rows %q", bsLabels(res))
	}
	// Core adds the topics of the access rules the run reads (users, org_pkg_access,
	// books_admins); of the Books collections, only the report's three and books_admins
	// may be topics, so a stray Books table still fails.
	want := []string{"collection/books_payable_items", "collection/books_vendors", "collection/books_settings"}
	for _, topic := range want {
		if !slices.Contains(res.Topics, topic) {
			t.Errorf("the run's topics %v miss %s", res.Topics, topic)
		}
	}
	allowed := append(slices.Clone(want), "collection/books_admins")
	for _, topic := range res.Topics {
		if strings.HasPrefix(topic, "collection/books_") && !slices.Contains(allowed, topic) {
			t.Errorf("the run's topics %v hold %s, a Books table the report does not read", res.Topics, topic)
		}
	}
	requireNoDrift(t, b.app)
}

// Register ships the A/P Aging; core creates it unpublished, and Books shares
// it with every Books reader.
func TestAPAgingShippedShared(t *testing.T) {
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
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": "books.ap_aging"})
	if err != nil {
		t.Fatalf("no reports row with shipped_key books.ap_aging: %v", err)
	}
	if row.GetBool("published") || row.GetString("published_by") != "" {
		t.Errorf("published = %v (by %q), want unpublished", row.GetBool("published"), row.GetString("published_by"))
	}
	if row.GetString("title") != "A/P Aging" || row.GetInt("shipped_revision") != 1 || row.GetString("source") != "books.payable_items" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a guest with Books readonly access")
	requireNoShare(t, app, row, outsider, "a guest without Books access")
	requireNoDrift(t, app)
}

// exportAPCSV is the CSV export of the shipped A/P Aging as reader: core
// exports a stored report by id, so it ships the report and Books' shares on
// b's app, then posts to /api/reports/export through the app's router. The
// first call on an app sets it up; core's shipped registry is global, so the
// test resets it when it ends.
func exportAPCSV(t testing.TB, b apBook, reader *core.Record, params map[string]any) string {
	t.Helper()
	if _, err := b.app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": apAgingKey}); err != nil {
		t.Cleanup(reports.ResetForTesting)
		reports.Register(b.app)
		reports.RegisterShipped(apAgingShipped())
		// Core stores a shipped report only when an owner or admin exists to own it.
		mkUser(t, b.app, "owner")
		if err := reports.ReconcileShipped(b.app); err != nil {
			t.Fatalf("ReconcileShipped: %v", err)
		}
		if err := reconcileBooksReportShares(b.app); err != nil {
			t.Fatalf("reconcileBooksReportShares: %v", err)
		}
	}
	row, err := b.app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": apAgingKey})
	if err != nil {
		t.Fatalf("no reports row with shipped_key %s: %v", apAgingKey, err)
	}
	given := map[string]json.RawMessage{}
	for id, v := range params {
		given[id] = mustJSON(v)
	}
	body := mustJSON(map[string]any{
		"reportId": row.Id, "format": "csv", "params": given,
		"options": map[string]any{"today": apToday},
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
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestAPAgingCSVOpensEveryGroup(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Csv Co")
	bill := apBill(t, b, v, "2026-10-01", "2026-10-31", 200000)
	pay := apPayBills(t, b, v, "2026-11-03", map[string]int{bill.Id: 80000})
	credit := apVendorCredit(t, b, v, "2026-11-06", 40000)
	other := apVendor(t, b, "Csv Two")
	otherBill := apBill(t, b, other, "2026-10-01", "2026-10-31", 5000)

	text := exportAPCSV(t, b, b.reader, nil)
	records, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(text, "\xef\xbb\xbf"))).ReadAll()
	if err != nil {
		t.Fatalf("read the CSV: %v\n%s", err, text)
	}
	if len(records) == 0 {
		t.Fatal("the CSV has no line")
	}
	if want := []string{"Vendor", "Due date", "Current", "1 - 30", "31 - 60", "61 - 90", "91 and over", "Total"}; !reflect.DeepEqual(records[0], want) {
		t.Errorf("the heading line = %q, want %q", records[0], want)
	}
	labels := make([]string, len(records))
	for i, r := range records {
		labels[i] = r[0]
	}
	for _, block := range [][]string{
		{
			"Csv Co",
			"Bill " + apNo(t, b, bill),
			"2026-10-01 · Bill " + apNo(t, b, bill),
			"2026-11-03 · Bill payment " + apNo(t, b, pay),
			"Vendor credit " + apNo(t, b, credit),
			"2026-11-06 · Vendor credit " + apNo(t, b, credit),
		},
		{
			"Csv Two",
			"Bill " + apNo(t, b, otherBill),
			"2026-10-01 · Bill " + apNo(t, b, otherBill),
		},
	} {
		at := slices.Index(labels, block[0])
		if at < 0 {
			t.Errorf("no CSV line labelled %s; labels %q", block[0], labels)
			continue
		}
		if got := labels[at:min(at+len(block), len(labels))]; !reflect.DeepEqual(got, block) {
			t.Errorf("the CSV under %s = %q, want %q (every group open)", block[0], got, block)
		}
	}
	requireNoDrift(t, b.app)
}

// The display block is the A/R Aging's (spec §3 Wide, Phone and narrow
// widths, §4.4 display).
func TestAPAgingDisplayLayouts(t *testing.T) {
	d := apDisplay()
	if !reflect.DeepEqual(d, agingDisplay()) {
		t.Errorf("apDisplay() =\n%s\nwant agingDisplay()\n%s", mustJSON(d), mustJSON(agingDisplay()))
	}
	want := []reports.DisplayLayout{
		{
			Width: "mobile", Tracks: 3,
			Cells: []reports.DisplayCell{
				{Col: "name", Line: 1, Span: 2},
				{Col: "due", Line: 1},
				{Col: "current", Line: 2},
				{Col: "d30", Line: 2},
				{Col: "total", Line: 2},
				{Col: "d60", Line: 3},
				{Col: "d90", Line: 3},
				{Col: "d91", Line: 3},
			},
		},
		{
			Width: "tablet", MinWidth: "640px", Tracks: 12,
			Cells: []reports.DisplayCell{
				{Col: "name", Line: 1, Span: 10},
				{Col: "total", Line: 1, Span: 2},
				{Col: "due", Line: 2, Span: 2},
				{Col: "current", Line: 2, Span: 2},
				{Col: "d30", Line: 2, Span: 2},
				{Col: "d60", Line: 2, Span: 2},
				{Col: "d90", Line: 2, Span: 2},
				{Col: "d91", Line: 2, Span: 2},
			},
		},
	}
	if !reflect.DeepEqual(d.Layouts, want) {
		t.Errorf("display.layouts =\n%s\nwant\n%s", mustJSON(d.Layouts), mustJSON(want))
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

	b := newAPBook(t)
	spec, _, err := reports.Load(apAgingShipped().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if err := reports.Validate(b.app, spec); err != nil {
		t.Errorf("Validate with the layouts: %v", err)
	}
	requireNoDrift(t, b.app)
}

// D11: the title, the description, the params and the display are held two
// times, here and in the fixture (tinycld/books/lib/ap-aging-fixture.ts).
// Both copies are compared with server/testdata/ap_aging_spec.json
// (tests/ap-aging-fixture.test.ts reads it too), so a value changed on one
// side only fails one of the two tests.
func TestAPAgingMatchesSharedSpecFile(t *testing.T) {
	raw, err := os.ReadFile("testdata/ap_aging_spec.json")
	if err != nil {
		t.Fatalf("read testdata/ap_aging_spec.json: %v", err)
	}
	// The four shared spec values only: the file's emptyDay is the day of
	// TestAPAgingEmpty, not a part of the spec.
	var file struct {
		Title       string          `json:"title"`
		Description string          `json:"description"`
		Params      json.RawMessage `json:"params"`
		Display     json.RawMessage `json:"display"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("parse testdata/ap_aging_spec.json: %v", err)
	}
	shipped := apAgingShipped()
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
	if got := mustJSON(spec.Params); !jsonEqual(t, got, string(file.Params)) {
		t.Errorf("params =\n%s\nwant testdata/ap_aging_spec.json params\n%s", got, file.Params)
	}
	if got := mustJSON(spec.Display); !jsonEqual(t, got, string(file.Display)) {
		t.Errorf("display =\n%s\nwant testdata/ap_aging_spec.json display\n%s", got, file.Display)
	}
}
