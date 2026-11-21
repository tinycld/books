package books

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The Vendor Balance (spec §3, §4): the posted Accounts payable lines on or
// before the As of day, one row per vendor, the No vendor row and the Total.
// Every book is an apBook and every run is the Books reader's, with a fixed day.

// vbToday is the reader's day in every run unless a test sets one: the
// fixture's day (VENDOR_BALANCE_TODAY).
const vbToday = "2026-11-20"

// vbEmptyDay reads the empty day from server/testdata/vendor_balance_spec.json
// (key emptyDay), the day tests/vendor-balance-fixture.test.ts holds
// VENDOR_BALANCE_EMPTY_DAY to: a day before every line.
func vbEmptyDay(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile("testdata/vendor_balance_spec.json")
	if err != nil {
		t.Fatalf("read testdata/vendor_balance_spec.json: %v", err)
	}
	var file struct {
		EmptyDay string `json:"emptyDay"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("parse testdata/vendor_balance_spec.json: %v", err)
	}
	if file.EmptyDay == "" {
		t.Fatal("testdata/vendor_balance_spec.json has no emptyDay")
	}
	return file.EmptyDay
}

// runVBErr runs the shipped Vendor Balance as reader, as core's run endpoint
// does: Load, then Run with the posted params, the reader's headers and,
// unless opts sets one, the day vbToday.
func runVBErr(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) (*reports.Result, error) {
	t.Helper()
	spec, info, err := reports.Load(vendorBalanceShipped().Spec)
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
		opts.Today = vbToday
	}
	return reports.Run(context.Background(), app, reports.Request{
		Spec: spec, Loaded: info, Params: given, Options: opts, Auth: reader,
		Headers: readerInfo(reader).Headers,
	})
}

// runVB runs the shipped Vendor Balance as reader on vbToday with every row
// closed.
func runVB(t *testing.T, app core.App, reader *core.Record, params map[string]any) *reports.Result {
	t.Helper()
	res, err := runVBErr(t, app, reader, params, reports.Options{})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// vbVendorRow is the vendor row (level 1) of vendor.
func vbVendorRow(t *testing.T, res *reports.Result, vendor *core.Record) reports.Row {
	t.Helper()
	r, ok := cbGroupRow(res, 1, vendor.Id)
	if !ok {
		t.Fatalf("no vendor row for %s; rows %q", vendor.GetString("display_name"), bsLabels(res))
	}
	return r
}

func vbHasVendor(res *reports.Result, vendor *core.Record) bool {
	_, ok := cbGroupRow(res, 1, vendor.Id)
	return ok
}

// vbVendorRows are the vendor rows (level 1), the No vendor row included.
func vbVendorRows(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup && r.Level == 1 {
			out = append(out, r)
		}
	}
	return out
}

// vbBalance is the Balance of vendor's row.
func vbBalance(t *testing.T, res *reports.Result, vendor *core.Record) int64 {
	t.Helper()
	return amt(t, vbVendorRow(t, res, vendor), "balance")
}

// vbTotal is the Balance of the Total row.
func vbTotal(t *testing.T, res *reports.Result) int64 {
	t.Helper()
	return amt(t, totalOf(t, res), "balance")
}

func TestVendorBalanceSpecLoads(t *testing.T) {
	b := newAPBook(t)
	if err := reports.CheckSources(b.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}

	shipped := vendorBalanceShipped()
	if vendorBalanceKey != "books.vendor_balance" || shipped.Key != vendorBalanceKey {
		t.Errorf("key = %q (const %q), want books.vendor_balance", shipped.Key, vendorBalanceKey)
	}
	if shipped.Title != "Vendor Balance" {
		t.Errorf("title = %q, want Vendor Balance", shipped.Title)
	}
	if shipped.Description != "What you owe each vendor on one day, from posted transactions on Accounts payable accounts." {
		t.Errorf("description = %q", shipped.Description)
	}
	if shipped.Revision != 1 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	if !jsonEqual(t, shipped.Spec, string(mustJSON(vendorBalanceSpec()))) {
		t.Errorf("the shipped spec is not vendorBalanceSpec()")
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
	if !reflect.DeepEqual(paramIDs, []string{"asOf", "rows", "vendors", "order"}) {
		t.Fatalf("params = %v, want asOf, rows, vendors, order (the chips' order)", paramIDs)
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
	if got, want := mustJSON(paramOf(t, spec, "vendors")), mustJSON(vendorsParam()); string(got) != string(want) {
		t.Errorf("the vendors param = %s, want vendorsParam() %s", got, want)
	}
	order := paramOf(t, spec, "order")
	wantOrder := []reports.Option{{Value: "name", Label: "Name"}, {Value: "balance", Label: "Largest balance"}}
	if order.Type != reports.ParamChoice || order.Label != "Order" || order.Multiple || order.OptionsFrom != nil ||
		!reflect.DeepEqual(order.Options, wantOrder) || !jsonEqual(t, order.Default, `"name"`) {
		t.Errorf("order = %+v (default %s), want a single choice Order: Name (default), Largest balance", order, order.Default)
	}

	type colShape struct {
		ID, Label string
		Hidden    bool
	}
	gotCols := make([]colShape, len(spec.Columns))
	for i, c := range spec.Columns {
		gotCols[i] = colShape{c.ID, c.Label, c.Hidden}
		// The hidden key column's label is not pinned.
		if c.Hidden {
			gotCols[i].Label = ""
		}
	}
	wantCols := []colShape{
		{ID: "name", Label: "Vendor"},
		{ID: "balance", Label: "Balance"},
		{ID: "vendorKey", Hidden: true},
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
	// No HideEmpty: core refuses it on the last level, which has no child groups
	// to be empty of (core reports/bind.go); a vendor with no line has no row
	// with no flag, and Having hides the rest.
	wantGroups := []groupShape{{ID: "byVendor", Col: "vendorKey", Having: true, Muted: true}}
	if !reflect.DeepEqual(gotGroups, wantGroups) {
		t.Errorf("groups = %+v\nwant %+v", gotGroups, wantGroups)
	}

	// An opened vendor's line is labelled and opens its document (spec §3
	// Opening a vendor, Opening a transaction; §4 detail).
	if spec.Detail == nil || spec.Detail.Label == nil || spec.Detail.Open == nil {
		t.Errorf("detail = %+v, want a label and an open path", spec.Detail)
	} else {
		if got, want := mustJSON(spec.Detail.Label), mustJSON(balanceDetailLabel()); string(got) != string(want) {
			t.Errorf("detail.label = %s\nwant balanceDetailLabel() %s", got, want)
		}
		if got, want := mustJSON(spec.Detail.Open), mustJSON(entryOpenPath()); string(got) != string(want) {
			t.Errorf("detail.open = %s\nwant entryOpenPath() %s", got, want)
		}
	}

	// A run shows the two visible columns only; the vendor key stays hidden.
	apBill(t, b, apVendor(t, b, "Shown Co"), "2026-10-01", "2026-10-31", 10000)
	res := runVB(t, b.app, b.reader, nil)
	ids := make([]string, len(res.Columns))
	for i, c := range res.Columns {
		ids[i] = c.ID
	}
	if !reflect.DeepEqual(ids, []string{"name", "balance"}) {
		t.Errorf("result columns = %v, want name, balance", ids)
	}
	if len(vbVendorRows(res)) == 0 {
		t.Fatalf("the run has no vendor rows; rows %q", bsLabels(res))
	}
	for _, r := range res.Rows {
		if v, ok := r.Cells["vendorKey"]; ok {
			t.Errorf("%s (%s) carries a vendorKey cell %#v", r.Label, r.Kind, v)
		}
	}
	requireNoDrift(t, b.app)
}

func TestVendorBalanceMatchesSharedSpecFile(t *testing.T) {
	raw, err := os.ReadFile("testdata/vendor_balance_spec.json")
	if err != nil {
		t.Fatalf("read testdata/vendor_balance_spec.json: %v", err)
	}
	// The four shared spec values only: the file's emptyDay is the day of
	// TestVendorBalanceEmpty, not a part of the spec.
	var file struct {
		Title       string          `json:"title"`
		Description string          `json:"description"`
		Params      json.RawMessage `json:"params"`
		Display     json.RawMessage `json:"display"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("parse testdata/vendor_balance_spec.json: %v", err)
	}
	shipped := vendorBalanceShipped()
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
		t.Errorf("params =\n%s\nwant testdata/vendor_balance_spec.json params\n%s", got, file.Params)
	}
	if got := mustJSON(spec.Display); !jsonEqual(t, got, string(file.Display)) {
		t.Errorf("display =\n%s\nwant testdata/vendor_balance_spec.json display\n%s", got, file.Display)
	}
}

func TestVendorBalanceWhatCounts(t *testing.T) {
	b := newAPBook(t)
	admin := b.users.admin.Id
	vendors := []*core.Record{}
	vendor := func(name string) *core.Record {
		v := apVendor(t, b, name)
		vendors = append(vendors, v)
		return v
	}

	// A bill of 1,000.00 and a bill payment of 400.00.
	acme := vendor("Acme Supply")
	acmeBill := apBill(t, b, acme, "2026-10-01", "2026-10-31", 100000)
	apPayBills(t, b, acme, "2026-11-03", map[string]int{acmeBill.Id: 40000})

	// A void bill: its reversal cancels it.
	voided := vendor("Voided Bill Co")
	if err := voidBillAs(b.app, apBill(t, b, voided, "2026-10-02", "2026-11-01", 20000).Id, admin); err != nil {
		t.Fatalf("void the bill: %v", err)
	}

	// A void bill payment leaves the bill whole.
	unpaid := vendor("Void Payment Co")
	unpaidBill := apBill(t, b, unpaid, "2026-10-02", "2026-11-01", 40000)
	pay := apPayBills(t, b, unpaid, "2026-11-04", map[string]int{unpaidBill.Id: 30000})
	if err := voidBillPaymentAs(b.app, pay.Id, admin); err != nil {
		t.Fatalf("void the bill payment: %v", err)
	}

	// A line on the day counts, the one after does not.
	edge := vendor("Edge Co")
	apJournal(t, b, "2026-11-12", edge, 0, 3000)
	apJournal(t, b, "2026-11-13", edge, 0, 9000)

	// One bill: its expense debit names no vendor and is on another account.
	single := vendor("Single Bill Co")
	apBill(t, b, single, "2026-10-05", "2026-11-04", 100000)

	// A draft bill posts no line.
	drafted := vendor("Draft Bill Co")
	draft := mkBill(t, b.app, drafted, map[string]any{"date": "2026-10-06", "due_date": "2026-11-05"})
	mkBillLine(t, b.app, draft, 0, accountLine(b.expense, 55500))

	res := runVB(t, b.app, b.reader, nil)
	if got := vbBalance(t, res, acme); got != 60000 {
		t.Errorf("Acme Supply = %d, want 60000 (bill 1,000.00 less payment 400.00)", got)
	}
	if vbHasVendor(res, voided) {
		t.Errorf("Voided Bill Co has a row; its void's reversal cancels the bill")
	}
	if got := vbBalance(t, res, unpaid); got != 40000 {
		t.Errorf("Void Payment Co = %d, want the bill's whole 40000 after the payment's void", got)
	}
	if got := vbBalance(t, res, single); got != 100000 {
		t.Errorf("Single Bill Co = %d, want 100000: the bill's expense debit is not on Accounts payable", got)
	}
	if bsHas(res, "No vendor") {
		t.Errorf("the bills' expense debits, which name no vendor, made a No vendor row; rows %q", bsLabels(res))
	}
	if vbHasVendor(res, drafted) {
		t.Errorf("Draft Bill Co has a row; a draft bill posts no line")
	}
	if vbHasVendor(runVB(t, b.app, b.reader, map[string]any{"rows": "activity"}), drafted) {
		t.Errorf("Draft Bill Co has a row under With activity; a draft bill posts no line")
	}

	onDay := runVB(t, b.app, b.reader, map[string]any{"asOf": "2026-11-12"})
	if got := vbBalance(t, onDay, edge); got != 3000 {
		t.Errorf("Edge Co as of 2026-11-12 = %d, want 3000 (the line on the day counts, the one after does not)", got)
	}
	nextDay := runVB(t, b.app, b.reader, map[string]any{"asOf": "2026-11-13"})
	if got := vbBalance(t, nextDay, edge); got != 12000 {
		t.Errorf("Edge Co as of 2026-11-13 = %d, want 12000 (both lines)", got)
	}

	// The whole book on one day: each vendor row is its page's Open balance and
	// its A/P Aging Total; the Total is the Balance Sheet's Accounts payable.
	day := vbToday
	opts := reports.Options{Today: day}
	vb, err := runVBErr(t, b.app, b.reader, map[string]any{"asOf": day}, opts)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	ap, err := runAPErr(t, b.app, b.reader, map[string]any{"asOf": day}, opts)
	if err != nil {
		t.Fatalf("A/P Aging Run: %v", err)
	}
	bs := runBS(t, b.app, b.reader, map[string]any{"asOf": day}, opts)
	open := partyBalances(t, b.app)
	for _, v := range vendors {
		name := v.GetString("display_name")
		if !vbHasVendor(vb, v) {
			if open[v.Id] != 0 {
				t.Errorf("%s has a party balance of %d and no row; rows %q", name, open[v.Id], bsLabels(vb))
			}
			continue
		}
		got := amt(t, vbVendorRow(t, vb, v), "balance")
		if want, found := open[v.Id]; !found || got != int64(want) {
			t.Errorf("%s = %d, want its books_party_balances balance %d (found %v)", name, got, want, found)
		}
		if want, ok := moneyCell(t, apVendorRow(t, ap, v), "total"); !ok || got != want {
			t.Errorf("%s = %d, want its A/P Aging Total %d", name, got, want)
		}
	}
	if total, want := vbTotal(t, vb), amt(t, bsAccount(t, bs, b.payable), "current"); total != want {
		t.Errorf("the Total %d, want the Balance Sheet's Accounts payable %d", total, want)
	}
	requireNoDrift(t, b.app)
}

func TestVendorBalanceSign(t *testing.T) {
	b := newAPBook(t)
	// Only an unapplied vendor credit: the vendor owes the business.
	owesUs := apVendor(t, b, "Credit Only Co")
	apVendorCredit(t, b, owesUs, "2026-10-05", 15000)
	owed := apVendor(t, b, "Owed Co")
	apBill(t, b, owed, "2026-10-01", "2026-10-31", 50000)

	res := runVB(t, b.app, b.reader, nil)
	if got := vbBalance(t, res, owesUs); got != -15000 {
		t.Errorf("Credit Only Co = %d, want -15000", got)
	}
	if got := vbTotal(t, res); got != 35000 {
		t.Errorf("Total = %d, want 50000 - 15000 = 35000", got)
	}

	// A vendor credit applied to a bill posts no line.
	mixed := apVendor(t, b, "Mixed Co")
	mixedBill := apBill(t, b, mixed, "2026-10-01", "2026-10-31", 30000)
	credit := apVendorCredit(t, b, mixed, "2026-10-05", 10000)
	before := runVB(t, b.app, b.reader, nil)
	beforeMixed, beforeTotal := vbBalance(t, before, mixed), vbTotal(t, before)
	if beforeMixed != 20000 {
		t.Errorf("Mixed Co before the apply = %d, want 30000 - 10000 = 20000", beforeMixed)
	}
	apApply(t, b, credit, mixedBill, "2026-10-10", 6000)
	after := runVB(t, b.app, b.reader, nil)
	if got := vbBalance(t, after, mixed); got != beforeMixed {
		t.Errorf("Mixed Co after the apply = %d, want %d (an apply changes no balance)", got, beforeMixed)
	}
	if got := vbTotal(t, after); got != beforeTotal {
		t.Errorf("Total after the apply = %d, want %d", got, beforeTotal)
	}

	// A refund of the credit's rest raises the balance by its amount.
	apRefund(t, b, mixed, "2026-10-15", map[string]int{credit.Id: 4000})
	if got := vbBalance(t, runVB(t, b.app, b.reader, nil), mixed); got != beforeMixed+4000 {
		t.Errorf("Mixed Co after a refund of 40.00 = %d, want %d", got, beforeMixed+4000)
	}

	// One bill payment of two bills lowers the balance by the payment's total.
	two := apVendor(t, b, "Two Bills Co")
	first := apBill(t, b, two, "2026-10-01", "2026-10-31", 20000)
	second := apBill(t, b, two, "2026-10-02", "2026-11-01", 30000)
	beforePay := vbBalance(t, runVB(t, b.app, b.reader, nil), two)
	apPayBills(t, b, two, "2026-11-03", map[string]int{first.Id: 20000, second.Id: 15000})
	if got := vbBalance(t, runVB(t, b.app, b.reader, nil), two); got != beforePay-35000 || got != 15000 {
		t.Errorf("Two Bills Co after one payment of both bills = %d, want %d - 35000 = 15000", got, beforePay)
	}
	requireNoDrift(t, b.app)
}

func TestVendorBalanceNoVendor(t *testing.T) {
	b := newAPBook(t)
	ash := apVendor(t, b, "Ash Co")
	apBill(t, b, ash, "2026-10-01", "2026-10-31", 1000)
	zinc := apVendor(t, b, "Zinc Co")
	apBill(t, b, zinc, "2026-10-01", "2026-10-31", 2000)
	// A manual Accounts payable line that names a vendor counts in its row.
	rivera := apVendor(t, b, "Rivera Accounting Partners")
	apJournal(t, b, "2026-10-04", rivera, 0, 31000)
	apJournal(t, b, "2026-11-02", rivera, 4000, 0)
	// Larger than every vendor, so the balance key alone would put it first.
	apJournal(t, b, "2026-11-02", nil, 0, 90000)

	for _, order := range []string{"name", "balance"} {
		res := runVB(t, b.app, b.reader, map[string]any{"order": order})
		none := bsRow(t, res, "No vendor")
		if none.Kind != reports.KindGroup || none.Depth != 0 || none.Level != 1 {
			t.Errorf("order = %s: No vendor = %+v, want a vendor row at depth 0", order, cbShapeOf(none))
		}
		if got := amt(t, none, "balance"); got != 90000 {
			t.Errorf("order = %s: No vendor = %d, want 90000", order, got)
		}
		at := slices.IndexFunc(res.Rows, func(r reports.Row) bool { return r.Label == "No vendor" })
		for _, r := range res.Rows[:at] {
			if r.Kind != reports.KindGroup || r.Level != 1 {
				t.Errorf("order = %s: row %q (%s) before No vendor, want only vendor rows", order, r.Label, r.Kind)
			}
		}
		if at+1 >= len(res.Rows) || res.Rows[at+1].Kind != reports.KindTotal || at+2 != len(res.Rows) {
			t.Errorf("order = %s: rows %q, want No vendor directly before the Total, and the Total last", order, bsLabels(res))
		}
		labels := cbDepth0(res)
		if len(labels) == 0 || labels[len(labels)-1] != "No vendor" {
			t.Errorf("order = %s: vendor rows %q, want No vendor last", order, labels)
		}

		var rows int64
		for _, r := range vbVendorRows(res) {
			rows += amt(t, r, "balance")
		}
		if total := vbTotal(t, res); total != rows || total != 1000+2000+27000+90000 {
			t.Errorf("order = %s: Total = %d, want the sum of every vendor row and No vendor %d (120000)", order, total, rows)
		}
		if got := vbBalance(t, res, rivera); got != 27000 {
			t.Errorf("order = %s: Rivera = %d, want its manual lines 31000 - 4000 = 27000", order, got)
		}
	}

	if picked := runVB(t, b.app, b.reader, map[string]any{"vendors": []string{zinc.Id}}); bsHas(picked, "No vendor") {
		t.Errorf("with one vendor picked the No vendor row shows; rows %q", bsLabels(picked))
	}
	requireNoDrift(t, b.app)
}

func TestVendorBalanceRowsChoice(t *testing.T) {
	b := newAPBook(t)
	paid := apVendor(t, b, "Paid Co")
	paidBill := apBill(t, b, paid, "2026-10-01", "2026-10-31", 20000)
	apPayBills(t, b, paid, "2026-11-03", map[string]int{paidBill.Id: 20000})

	// A vendor named only on an expense line has no Accounts payable line.
	idle := apVendor(t, b, "Idle Co")
	postJournal(t, b.app, "", "2026-11-06", "Expense named Idle",
		jnLine{account: b.expense, debit: 900, position: 0, vendor: idle.Id},
		jnLine{account: b.bank, credit: 900, position: 1})

	// Something shows under Non-zero, so the missing rows are the choice's doing.
	owes := apVendor(t, b, "Owes Co")
	apBill(t, b, owes, "2026-10-01", "2026-10-31", 1000)

	nonzero := runVB(t, b.app, b.reader, map[string]any{"rows": "nonzero"})
	if !vbHasVendor(nonzero, owes) {
		t.Fatalf("Owes Co has no row under Non-zero; rows %q", bsLabels(nonzero))
	}
	if vbHasVendor(nonzero, paid) {
		t.Errorf("Non-zero shows Paid Co, whose bill is paid in full; rows %q", bsLabels(nonzero))
	}
	if vbHasVendor(nonzero, idle) {
		t.Errorf("Non-zero shows Idle Co, which has no Accounts payable line; rows %q", bsLabels(nonzero))
	}
	if byDefault := runVB(t, b.app, b.reader, nil); !reflect.DeepEqual(bsLabels(byDefault), bsLabels(nonzero)) {
		t.Errorf("no Rows param gives %q, want Non-zero's %q", bsLabels(byDefault), bsLabels(nonzero))
	}

	activity := runVB(t, b.app, b.reader, map[string]any{"rows": "activity"})
	if got := vbBalance(t, activity, paid); got != 0 {
		t.Errorf("Paid Co under With activity = %d, want 0", got)
	}
	if vbHasVendor(activity, idle) || bsHas(activity, "Idle Co") {
		t.Errorf("a vendor with no Accounts payable line shows under With activity; rows %q", bsLabels(activity))
	}
	if got, want := vbTotal(t, activity), vbTotal(t, nonzero); got != want {
		t.Errorf("Total under With activity = %d, want Non-zero's %d", got, want)
	}
	requireNoDrift(t, b.app)
}

func TestVendorBalanceInactive(t *testing.T) {
	b := newAPBook(t)
	sleepy := apVendor(t, b, "Sleepy Supply")
	awake := apVendor(t, b, "Awake Supply")
	apBill(t, b, sleepy, "2026-10-01", "2026-10-31", 10000)
	apBill(t, b, awake, "2026-10-01", "2026-10-31", 20000)
	retired := apVendor(t, b, "Retired Supply")
	retiredBill := apBill(t, b, retired, "2026-10-01", "2026-10-31", 5000)
	apPayBills(t, b, retired, "2026-11-03", map[string]int{retiredBill.Id: 5000})
	for _, v := range []*core.Record{sleepy, retired} {
		if err := setFields(t, b.app, "books_vendors", v.Id, map[string]any{"inactive": true}); err != nil {
			t.Fatalf("make %s inactive: %v", v.GetString("display_name"), err)
		}
	}

	res := runVB(t, b.app, b.reader, nil)
	sleepyRow := vbVendorRow(t, res, sleepy)
	if !sleepyRow.Muted || sleepyRow.Label != "Sleepy Supply (inactive)" {
		t.Errorf("the inactive vendor = label %q muted %v, want \"Sleepy Supply (inactive)\" muted", sleepyRow.Label, sleepyRow.Muted)
	}
	awakeRow := vbVendorRow(t, res, awake)
	if awakeRow.Muted || strings.HasSuffix(awakeRow.Label, " (inactive)") {
		t.Errorf("the active vendor = label %q muted %v, want \"Awake Supply\" not muted", awakeRow.Label, awakeRow.Muted)
	}
	if totalOf(t, res).Muted {
		t.Errorf("the Total row is muted, want never")
	}
	if vbHasVendor(res, retired) {
		t.Errorf("the paid-off inactive vendor shows under Non-zero; rows %q", bsLabels(res))
	}

	activity := runVB(t, b.app, b.reader, map[string]any{"rows": "activity"})
	retiredRow := vbVendorRow(t, activity, retired)
	if !retiredRow.Muted || retiredRow.Label != "Retired Supply (inactive)" {
		t.Errorf("the paid-off inactive vendor under With activity = label %q muted %v, want \"Retired Supply (inactive)\" muted", retiredRow.Label, retiredRow.Muted)
	}
	if got := amt(t, retiredRow, "balance"); got != 0 {
		t.Errorf("Retired Supply under With activity = %d, want 0", got)
	}
	if totalOf(t, activity).Muted {
		t.Errorf("the Total row under With activity is muted, want never")
	}
	requireNoDrift(t, b.app)
}

func TestVendorBalanceVendorsParam(t *testing.T) {
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

	res := runVB(t, b.app, b.reader, map[string]any{"vendors": []string{aspen.Id, birch.Id}})
	if got, want := labelsOf(vbVendorRows(res)), []string{"Aspen Supply", "Birch Supply"}; !reflect.DeepEqual(got, want) {
		t.Errorf("two vendors picked: vendor rows %q, want %q", got, want)
	}
	if got := vbTotal(t, res); got != 30000 {
		t.Errorf("the Total of the two picks = %d, want 30000", got)
	}
	if !slices.ContainsFunc(res.HeaderLines, func(line string) bool {
		return strings.HasPrefix(line, "Vendor: ") && strings.Contains(line, "Aspen Supply") && strings.Contains(line, "Birch Supply")
	}) {
		t.Errorf("header lines = %q, want a \"Vendor: \" line with Aspen Supply and Birch Supply", res.HeaderLines)
	}

	all := runVB(t, b.app, b.reader, nil)
	if got, want := labelsOf(vbVendorRows(all)), []string{"Aspen Supply", "Birch Supply", "Cedar Supply (inactive)"}; !reflect.DeepEqual(got, want) {
		t.Errorf("no vendor picked: vendor rows %q, want %q", got, want)
	}

	spec, _, err := reports.Load(vendorBalanceShipped().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	options, err := reports.ReadParamOptions(context.Background(), b.app, reports.OptionsRequest{
		Spec: spec, Param: "vendors", Auth: b.reader, Today: vbToday,
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

func TestVendorBalanceOrder(t *testing.T) {
	b := newAPBook(t)
	// alpha and gamma tie at 30.00; Beta is the largest; delta owes the business.
	apBill(t, b, apVendor(t, b, "gamma"), "2026-10-01", "2026-10-31", 3000)
	apBill(t, b, apVendor(t, b, "Beta"), "2026-10-01", "2026-10-31", 7000)
	apBill(t, b, apVendor(t, b, "alpha"), "2026-10-01", "2026-10-31", 3000)
	apVendorCredit(t, b, apVendor(t, b, "delta"), "2026-10-02", 500)
	// No vendor, larger than every vendor.
	apJournal(t, b, "2026-11-02", nil, 0, 90000)

	byName := runVB(t, b.app, b.reader, map[string]any{"order": "name"})
	if got, want := cbDepth0(byName), []string{"alpha", "Beta", "delta", "gamma", "No vendor"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = name: vendor rows %q, want %q (name order ignoring case, No vendor last)", got, want)
	}
	if byDefault := runVB(t, b.app, b.reader, nil); !reflect.DeepEqual(bsLabels(byDefault), bsLabels(byName)) {
		t.Errorf("no Order param gives %q, want Name's %q", bsLabels(byDefault), bsLabels(byName))
	}
	byBalance := runVB(t, b.app, b.reader, map[string]any{"order": "balance"})
	if got, want := cbDepth0(byBalance), []string{"Beta", "alpha", "gamma", "delta", "No vendor"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = balance: vendor rows %q, want %q (largest first, ties by name, the negative balance last among vendors, No vendor last)", got, want)
	}
	requireNoDrift(t, b.app)
}

func TestVendorBalanceEmpty(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "October Co")
	apBill(t, b, v, "2026-10-01", "2026-10-31", 10000)
	if !vbHasVendor(runVB(t, b.app, b.reader, nil), v) {
		t.Fatal("today has no row for October Co: the book must hold a posted Accounts payable line")
	}
	emptyDay := vbEmptyDay(t)
	res := runVB(t, b.app, b.reader, map[string]any{"asOf": emptyDay})
	totals := 0
	for _, r := range res.Rows {
		if r.Kind != reports.KindTotal {
			t.Errorf("as of %s the report has the row %q (%s), want the Total only", emptyDay, r.Label, r.Kind)
			continue
		}
		totals++
	}
	if totals != 1 {
		t.Errorf("as of %s the report has %d Total rows, want exactly 1", emptyDay, totals)
	}
	requireNoDrift(t, b.app)
}

func TestVendorBalanceNoAccess(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Seen Co")
	apBill(t, b, v, "2026-10-01", "2026-10-31", 10000)
	if !vbHasVendor(runVB(t, b.app, b.reader, nil), v) {
		t.Fatal("the Books reader does not see Seen Co")
	}
	res, err := runVBErr(t, b.app, b.none, nil, reports.Options{})
	if err != nil {
		t.Fatalf("the run of a user with Books level none was refused (%v); core runs it with the rule's rows", err)
	}
	if rows := vbVendorRows(res); len(rows) != 0 {
		t.Errorf("a user with Books level none sees vendor rows %q", labelsOf(rows))
	}
	requireNoDrift(t, b.app)
}

func TestVendorBalanceTopics(t *testing.T) {
	b := newAPBook(t)
	topicCo := apVendor(t, b, "Topic Co")
	apBill(t, b, topicCo, "2026-10-01", "2026-10-31", 10000)
	res := runVB(t, b.app, b.reader, nil)
	if len(vbVendorRows(res)) == 0 {
		t.Fatalf("the run has no vendor row; rows %q", bsLabels(res))
	}
	// Core adds the topics of the access rules a run reads, so each wanted topic
	// is required on its own (D11).
	closedTopics := []string{
		"collection/books_journal_lines", "collection/books_accounts", "collection/books_vendors",
		"collection/books_settings",
	}
	for _, topic := range closedTopics {
		if !slices.Contains(res.Topics, topic) {
			t.Errorf("the closed run's topics %v miss %s", res.Topics, topic)
		}
	}

	// An opened vendor reads its lines' entries (the detail label and open path),
	// so a post or a void of any entry re-runs it.
	opened := vbRunOpen(t, b, nil, vbVendorRow(t, res, topicCo).GroupKey)
	if lines := vbLinesUnder(t, opened, vbVendorRow(t, opened, topicCo)); len(lines) == 0 {
		t.Fatalf("Topic Co did not open; rows %q", bsLabels(opened))
	}
	for _, topic := range append(closedTopics, "collection/books_journal_entries") {
		if !slices.Contains(opened.Topics, topic) {
			t.Errorf("the opened run's topics %v miss %s", opened.Topics, topic)
		}
	}
	requireNoDrift(t, b.app)
}

// vbRunOpen runs the shipped Vendor Balance as b's reader on vbToday with the
// vendor rows keyed by keys opened, as the view asks when a reader presses rows.
func vbRunOpen(t *testing.T, b apBook, params map[string]any, keys ...[]any) *reports.Result {
	t.Helper()
	res, err := runVBErr(t, b.app, b.reader, params, reports.Options{Expand: keys, Collapse: [][]any{}})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// vbLinesUnder are the detail rows right after row, in result order.
func vbLinesUnder(t *testing.T, res *reports.Result, row reports.Row) []reports.Row {
	t.Helper()
	at := slices.IndexFunc(res.Rows, func(r reports.Row) bool { return r.ID == row.ID })
	if at < 0 {
		t.Fatalf("no row %s (%q); rows %q", row.ID, row.Label, bsLabels(res))
	}
	out := []reports.Row{}
	for _, r := range res.Rows[at+1:] {
		if r.Kind != reports.KindDetail {
			break
		}
		out = append(out, r)
	}
	return out
}

// vbLinesOf is what a test reads of opened line rows.
func vbLinesOf(t *testing.T, rows []reports.Row) []cbLine {
	t.Helper()
	out := make([]cbLine, len(rows))
	for i, r := range rows {
		out[i] = cbLine{ID: r.ID, Label: r.Label, Open: r.Open, Balance: amt(t, r, "balance"), Depth: r.Depth}
	}
	return out
}

// vbLineWant is the row the spec gives a posted Accounts payable line:
// "<date> · <type> <entry number> · <the line's memo, else the entry's memo>",
// the line's credit less its debit, and the path it opens. A vendor row is at
// depth 0, so its lines are at depth 1.
func vbLineWant(t *testing.T, app core.App, line *core.Record, typeLabel, open string) cbLine {
	t.Helper()
	line = reload(t, app, "books_journal_lines", line.Id)
	entry := reload(t, app, "books_journal_entries", line.GetString("entry"))
	desc := line.GetString("memo")
	if desc == "" {
		desc = entry.GetString("memo")
	}
	return cbLine{
		ID:      "d:" + line.Id,
		Label:   line.GetString("date") + " · " + typeLabel + " " + entry.GetString("number") + " · " + desc,
		Open:    open,
		Balance: int64(line.GetInt("credit") - line.GetInt("debit")),
		Depth:   1,
	}
}

// vbDocLine is the Accounts payable line of a posted document's entry.
func vbDocLine(t *testing.T, b apBook, doc *core.Record) *core.Record {
	t.Helper()
	return entryLineOn(t, b.app, doc.GetString("entry"), b.payable)
}

func TestVendorBalanceDetail(t *testing.T) {
	b := newAPBook(t)

	// One vendor with every kind of Accounts payable line, one per day.
	acme := apVendor(t, b, "Acme Detail Co")
	bill := apBill(t, b, acme, "2026-10-01", "2026-10-31", 100000)
	pay := apPayBills(t, b, acme, "2026-10-02", map[string]int{bill.Id: 40000})
	credit := apVendorCredit(t, b, acme, "2026-10-03", 15000)
	apApply(t, b, credit, reload(t, b.app, "books_bills", bill.Id), "2026-10-04", 10000)
	refund := apRefund(t, b, acme, "2026-10-05", map[string]int{credit.Id: 5000})
	manual := apJournal(t, b, "2026-10-06", acme, 0, 2500)

	// Two entries on one day: posting order decides (both orders are pinned
	// below, so the line ids cannot decide).
	sameDay := apVendor(t, b, "Same Day Co")
	madeFirst := postJournal(t, b.app, "", "2026-10-08", "Same day, made first",
		jnLine{id: "vbsame000000001", account: b.payable, credit: 1000, position: 0, vendor: sameDay.Id},
		jnLine{account: b.expense, debit: 1000, position: 1})
	madeSecond := postJournal(t, b.app, "", "2026-10-08", "Same day, made second",
		jnLine{id: "vbsame999999999", account: b.payable, credit: 2000, position: 0, vendor: sameDay.Id},
		jnLine{account: b.expense, debit: 2000, position: 1})
	setPostedAt(t, b.app, madeFirst.Id, "2026-11-12 11:00:00.000Z")
	setPostedAt(t, b.app, madeSecond.Id, "2026-11-12 10:00:00.000Z")

	// Two Accounts payable lines of one entry: position decides (the ids sort the
	// other way). The first has its own memo; the second reads the entry's.
	split := apVendor(t, b, "Split Co")
	splitEntry := postJournal(t, b.app, "", "2026-10-09", "Split entry memo",
		jnLine{id: "vbpos0000000001", account: b.payable, credit: 300, position: 1, vendor: split.Id},
		jnLine{id: "vbpos9999999999", account: b.payable, credit: 700, position: 0, vendor: split.Id, memo: "Line memo wins"},
		jnLine{account: b.expense, debit: 1000, position: 2})

	// No vendor: a payable and a later debit.
	noneCredit := apJournal(t, b, "2026-10-07", nil, 0, 7000)
	noneDebit := apJournal(t, b, "2026-10-10", nil, 1000, 0)

	closed := runVB(t, b.app, b.reader, nil)
	for _, r := range closed.Rows {
		if r.Kind == reports.KindDetail {
			t.Fatalf("the report opens with line rows (%q); a vendor row opens only when pressed", r.Label)
		}
	}
	noneRow, ok := cbGroupRow(closed, 1, "")
	if !ok {
		t.Fatalf("no No vendor row; rows %q", bsLabels(closed))
	}
	keys := [][]any{noneRow.GroupKey}
	for _, v := range []*core.Record{acme, sameDay, split} {
		keys = append(keys, vbVendorRow(t, closed, v).GroupKey)
	}
	res := vbRunOpen(t, b, nil, keys...)

	requireLines := func(res *reports.Result, row reports.Row, want []cbLine) {
		t.Helper()
		got := vbLinesOf(t, vbLinesUnder(t, res, row))
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%s opens into\n%+v\nwant\n%+v", row.Label, got, want)
		}
		if sum, balance := cbLinesSum(got), amt(t, row, "balance"); sum != balance {
			t.Errorf("%s's lines add up to %d, want its balance %d", row.Label, sum, balance)
		}
	}

	// Five rows, in day order; the apply posts no line, so it has no row.
	acmeWant := []cbLine{
		vbLineWant(t, b.app, vbDocLine(t, b, bill), "Bill", apRoute(t, "bill", bill.Id)),
		vbLineWant(t, b.app, vbDocLine(t, b, pay), "Bill payment", apRoute(t, "bill_payment", pay.Id)),
		vbLineWant(t, b.app, vbDocLine(t, b, credit), "Vendor credit", apRoute(t, "vendor_credit", credit.Id)),
		vbLineWant(t, b.app, vbDocLine(t, b, refund), "Vendor refund", apRoute(t, "vendor_refund", refund.Id)),
		vbLineWant(t, b.app, entryLineOn(t, b.app, manual.Id, b.payable), "Journal entry", "books/entries/"+manual.Id),
	}
	for i, want := range []struct {
		day   string
		cents int64
	}{{"2026-10-01", 100000}, {"2026-10-02", -40000}, {"2026-10-03", -15000}, {"2026-10-05", 5000}, {"2026-10-06", 2500}} {
		if !strings.HasPrefix(acmeWant[i].Label, want.day+" · ") || acmeWant[i].Balance != want.cents {
			t.Fatalf("Acme's wanted line %d = %q %d, want the day %s and %d", i, acmeWant[i].Label, acmeWant[i].Balance, want.day, want.cents)
		}
	}
	for i, doc := range []*core.Record{bill, pay, credit, refund} {
		if number := apNo(t, b, doc); !strings.Contains(acmeWant[i].Label, " "+number+" · ") {
			t.Fatalf("Acme's wanted line %q does not name its document's number %s", acmeWant[i].Label, number)
		}
	}
	acmeRow := vbVendorRow(t, res, acme)
	if got := amt(t, acmeRow, "balance"); got != 100000-40000-15000+5000+2500 {
		t.Errorf("Acme Detail Co = %d, want 52500", got)
	}
	requireLines(res, acmeRow, acmeWant)

	sameDayWant := func(first, second *core.Record) []cbLine {
		return []cbLine{
			vbLineWant(t, b.app, entryLineOn(t, b.app, first.Id, b.payable), "Journal entry", "books/entries/"+first.Id),
			vbLineWant(t, b.app, entryLineOn(t, b.app, second.Id, b.payable), "Journal entry", "books/entries/"+second.Id),
		}
	}
	requireLines(res, vbVendorRow(t, res, sameDay), sameDayWant(madeSecond, madeFirst))

	splitLines, err := b.app.FindAllRecords("books_journal_lines", dbx.HashExp{"entry": splitEntry.Id, "account": b.payable.Id})
	if err != nil || len(splitLines) != 2 {
		t.Fatalf("Split Co's entry has %d payable lines (%v), want 2", len(splitLines), err)
	}
	slices.SortFunc(splitLines, func(x, y *core.Record) int { return x.GetInt("position") - y.GetInt("position") })
	splitWant := []cbLine{
		vbLineWant(t, b.app, splitLines[0], "Journal entry", "books/entries/"+splitEntry.Id),
		vbLineWant(t, b.app, splitLines[1], "Journal entry", "books/entries/"+splitEntry.Id),
	}
	if !strings.HasSuffix(splitWant[0].Label, " · Line memo wins") || !strings.HasSuffix(splitWant[1].Label, " · Split entry memo") {
		t.Fatalf("Split Co's wanted labels %q, %q: the first reads its line's memo, the second its entry's", splitWant[0].Label, splitWant[1].Label)
	}
	requireLines(res, vbVendorRow(t, res, split), splitWant)

	// The No vendor row opens the same way.
	openNone, ok := cbGroupRow(res, 1, "")
	if !ok {
		t.Fatalf("no No vendor row in the opened run; rows %q", bsLabels(res))
	}
	requireLines(res, openNone, []cbLine{
		vbLineWant(t, b.app, entryLineOn(t, b.app, noneCredit.Id, b.payable), "Journal entry", "books/entries/"+noneCredit.Id),
		vbLineWant(t, b.app, entryLineOn(t, b.app, noneDebit.Id, b.payable), "Journal entry", "books/entries/"+noneDebit.Id),
	})

	// The other posting order flips the same-day lines.
	setPostedAt(t, b.app, madeFirst.Id, "2026-11-12 09:00:00.000Z")
	flipped := vbRunOpen(t, b, nil, keys...)
	requireLines(flipped, vbVendorRow(t, flipped, sameDay), sameDayWant(madeFirst, madeSecond))
	requireNoDrift(t, b.app)
}

// exportVBCSV is the CSV export of the shipped Vendor Balance as reader
// (exportShippedCSV).
func exportVBCSV(t testing.TB, b apBook, reader *core.Record, params map[string]any) string {
	t.Helper()
	return exportShippedCSV(t, b.app, vendorBalanceShipped(), vendorBalanceKey, vbToday, reader, params)
}

func TestVendorBalanceCSVOpensEveryGroup(t *testing.T) {
	b := newAPBook(t)
	alpha := apVendor(t, b, "Csv Alpha")
	alphaBill := apBill(t, b, alpha, "2026-10-01", "2026-10-31", 20000)
	alphaPay := apPayBills(t, b, alpha, "2026-10-03", map[string]int{alphaBill.Id: 8000})
	beta := apVendor(t, b, "Csv Beta")
	betaBill := apBill(t, b, beta, "2026-10-02", "2026-11-01", 5000)
	none := apJournal(t, b, "2026-10-04", nil, 0, 3000)

	text := exportVBCSV(t, b, b.reader, nil)
	records, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(text, "\xef\xbb\xbf"))).ReadAll()
	if err != nil {
		t.Fatalf("read the CSV: %v\n%s", err, text)
	}
	if len(records) == 0 {
		t.Fatal("the CSV has no line")
	}
	if want := []string{"Vendor", "Balance"}; !reflect.DeepEqual(records[0], want) {
		t.Errorf("the heading line = %q, want %q", records[0], want)
	}

	type record struct {
		Label string
		Cents int64
	}
	got := make([]record, 0, len(records))
	for _, r := range records[1:] {
		if len(r) < 2 {
			t.Fatalf("CSV record %q has no Balance", r)
		}
		got = append(got, record{r[0], int64(apCSVCents(t, r[1]))})
	}

	// The vendor records and the Total hold the figures of a closed run.
	run := runVB(t, b.app, b.reader, nil)
	line := func(l cbLine) record { return record{l.Label, l.Balance} }
	want := []record{
		{"Csv Alpha", vbBalance(t, run, alpha)},
		line(vbLineWant(t, b.app, vbDocLine(t, b, alphaBill), "Bill", "")),
		line(vbLineWant(t, b.app, vbDocLine(t, b, alphaPay), "Bill payment", "")),
		{"Csv Beta", vbBalance(t, run, beta)},
		line(vbLineWant(t, b.app, vbDocLine(t, b, betaBill), "Bill", "")),
		{"No vendor", amt(t, bsRow(t, run, "No vendor"), "balance")},
		line(vbLineWant(t, b.app, entryLineOn(t, b.app, none.Id, b.payable), "Journal entry", "")),
		{"Total", vbTotal(t, run)},
	}
	if want[0].Cents != 12000 || want[3].Cents != 5000 || want[5].Cents != 3000 || want[7].Cents != 20000 {
		t.Fatalf("the closed run's figures %+v, want Csv Alpha 12000, Csv Beta 5000, No vendor 3000, Total 20000", want)
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("the CSV records =\n%+v\nwant every vendor followed by its posted lines, then No vendor with its line, then the Total\n%+v", got, want)
	}
	requireNoDrift(t, b.app)
}

// Register ships the Vendor Balance; core creates it unpublished, and Books
// shares it with every Books reader.
func TestVendorBalanceShippedShared(t *testing.T) {
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
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": "books.vendor_balance"})
	if err != nil {
		t.Fatalf("no reports row with shipped_key books.vendor_balance: %v", err)
	}
	if row.GetBool("published") || row.GetString("published_by") != "" {
		t.Errorf("published = %v (by %q), want unpublished", row.GetBool("published"), row.GetString("published_by"))
	}
	if row.GetString("title") != "Vendor Balance" || row.GetInt("shipped_revision") != 1 || row.GetString("source") != "books.journal_lines" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a guest with Books readonly access")
	requireNoShare(t, app, row, outsider, "a guest without Books access")
	requireNoDrift(t, app)
}
