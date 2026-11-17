package books

import (
	"context"
	"encoding/json"
	"math"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// salesToday is the reader's day in every run of the sales reports.
const salesToday = "2026-11-17"

// salesOctober is the Period of most runs: every document a test posts is
// dated in it, or on a day just outside it.
var salesOctober = glPeriod("2026-10-01", "2026-10-31")

// runSalesErr loads the shipped sales report of key and runs it as reader, as
// core's run endpoint does: Load, then Run with the posted params. Core has
// no public lookup of a shipped report by key, so each key names its own
// shipped function.
func runSalesErr(t *testing.T, app core.App, reader *core.Record, key string, params map[string]any, opts reports.Options) (*reports.Result, error) {
	t.Helper()
	var shipped reports.Shipped
	switch key {
	case salesByCustomerKey:
		shipped = salesByCustomerShipped()
	default:
		t.Fatalf("runSales: no shipped sales report %q", key)
	}
	spec, info, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load %s: %v", key, err)
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

func runSales(t *testing.T, app core.App, reader *core.Record, key string, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	res, err := runSalesErr(t, app, reader, key, params, opts)
	if err != nil {
		t.Fatalf("Run %s: %v", key, err)
	}
	return res
}

// salesBook is the credit memo book of the Sales Tax Liability tests
// (newCreditMemoSTLBook): the invoice, sales receipt and credit memo guards,
// Harborview Dental, the products Monthly bookkeeping (service), Wireless
// access point (accessPoint) and Discount, Books' report sources, a Books
// read-only reader and the poster. Every document it posts names no tax rate:
// the sales reports read amounts before tax.
type salesBook struct {
	stlBook
	ce       *creditMemoEnv
	discount *core.Record
}

func newSalesBook(t *testing.T) salesBook {
	t.Helper()
	b, ce := newCreditMemoSTLBook(t)
	return salesBook{stlBook: b, ce: ce, discount: ce.discount}
}

func (b salesBook) addCustomer(t *testing.T, name string, parent *core.Record) *core.Record {
	t.Helper()
	parentID := ""
	if parent != nil {
		parentID = parent.Id
	}
	return mkCustomer(t, b.app, name, parentID)
}

func (b salesBook) inactive(t *testing.T, customer *core.Record) {
	t.Helper()
	if err := setCustomer(t, b.app, customer.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make %s inactive: %v", customer.GetString("display_name"), err)
	}
}

// sale is one item line, not taxable.
func sale(product *core.Record, qty float64, cents int64) map[string]any {
	return item(product, qty, cents, false)
}

// draftInv saves a draft invoice of customer dated day (due the same day).
func (b salesBook) draftInv(t *testing.T, customer *core.Record, day string, extra map[string]any, lines ...map[string]any) *core.Record {
	t.Helper()
	return b.draftInvoice(t, customer, nil, day, extra, lines...)
}

// invoice posts an invoice of customer dated day with lines.
func (b salesBook) invoice(t *testing.T, customer *core.Record, day string, lines ...map[string]any) *core.Record {
	t.Helper()
	return mustPostInvoice(t, b.app, b.draftInv(t, customer, day, nil, lines...).Id, b.actor)
}

// correct posts a correction of the posted invoice original (an Edit of a
// posted invoice): it keeps the original's sequence and voids it.
func (b salesBook) correct(t *testing.T, original *core.Record, lines ...map[string]any) *core.Record {
	t.Helper()
	customer := reload(t, b.app, "books_customers", original.GetString("customer"))
	draft := b.draftInv(t, customer, original.GetString("date"), map[string]any{"replaces": original.Id}, lines...)
	posted := mustPostInvoice(t, b.app, draft.Id, b.actor)
	if s := reload(t, b.app, "books_invoices", original.Id).GetString("status"); s == statusPosted {
		t.Fatalf("the corrected original is still posted")
	}
	return posted
}

func (b salesBook) draftRct(t *testing.T, customer *core.Record, day string, lines ...map[string]any) *core.Record {
	t.Helper()
	fields := map[string]any{"date": day, "customer": ""}
	if customer != nil {
		fields["customer"] = customer.Id
	}
	r := b.mkReceipt(t, fields)
	for i, l := range lines {
		mkReceiptLine(t, b.app, r, i, l)
	}
	return r
}

// receipt posts a sales receipt dated day with lines; a nil customer is a
// receipt with no customer.
func (b salesBook) receipt(t *testing.T, customer *core.Record, day string, lines ...map[string]any) *core.Record {
	t.Helper()
	return mustPostReceipt(t, b.app, b.draftRct(t, customer, day, lines...).Id, b.actor)
}

func (b salesBook) draftMemo(t *testing.T, customer *core.Record, day string, extra map[string]any, lines ...map[string]any) *core.Record {
	t.Helper()
	fields := map[string]any{"customer": customer.Id, "date": day}
	for k, v := range extra {
		fields[k] = v
	}
	m := b.ce.mkCreditMemo(t, fields)
	for i, l := range lines {
		mkCreditMemoLine(t, b.app, m, i, l)
	}
	return m
}

// memo posts a credit memo of customer dated day with lines.
func (b salesBook) memo(t *testing.T, customer *core.Record, day string, extra map[string]any, lines ...map[string]any) *core.Record {
	t.Helper()
	return mustPostCreditMemo(t, b.app, b.draftMemo(t, customer, day, extra, lines...).Id, b.actor)
}

// withPeriod gives params the Period October 2026 unless they set one.
func withPeriod(params map[string]any) map[string]any {
	out := map[string]any{"period": salesOctober}
	for k, v := range params {
		out[k] = v
	}
	return out
}

func (b salesBook) run(t *testing.T, params map[string]any) *reports.Result {
	t.Helper()
	return runSales(t, b.app, b.reader, salesByCustomerKey, withPeriod(params), reports.Options{Today: salesToday})
}

// runOpen runs with the rows of keys opened; an empty Collapse keeps the
// family level open beside Expand, as core's view sends a press.
func (b salesBook) runOpen(t *testing.T, params map[string]any, keys ...[]any) *reports.Result {
	t.Helper()
	return runSales(t, b.app, b.reader, salesByCustomerKey, withPeriod(params), reports.Options{
		Today: salesToday, Expand: keys, Collapse: [][]any{},
	})
}

// saleLinesOf are the stored item and percent lines of a document, with their
// stored amounts, in position order.
func saleLinesOf(t *testing.T, app core.App, kind salesDocKind, docID string) []*core.Record {
	t.Helper()
	collection, parent := "", ""
	switch kind.Collection {
	case "books_invoices":
		collection, parent = "books_invoice_lines", "invoice"
	case "books_sales_receipts":
		collection, parent = "books_sales_receipt_lines", "sales_receipt"
	case "books_credit_memos":
		collection, parent = "books_credit_memo_lines", "credit_memo"
	default:
		t.Fatalf("no line collection for %s", kind.Collection)
	}
	lines, err := app.FindRecordsByFilter(collection, parent+" = {:id} && (kind = 'item' || kind = 'percent')", "position", 0, 0, dbx.Params{"id": docID})
	if err != nil {
		t.Fatalf("read the lines of %s %s: %v", kind.Collection, docID, err)
	}
	return lines
}

// saleSum adds the stored amounts of a document's item and percent lines.
func saleSum(t *testing.T, app core.App, kind salesDocKind, docID string) int64 {
	t.Helper()
	var sum int64
	for _, l := range saleLinesOf(t, app, kind, docID) {
		sum += int64(l.GetInt("amount"))
	}
	return sum
}

// salesLinesUnder are the detail rows right after row, in result order.
func salesLinesUnder(res *reports.Result, row reports.Row) []reports.Row {
	at := slices.IndexFunc(res.Rows, func(r reports.Row) bool { return r.ID == row.ID })
	if at < 0 {
		return nil
	}
	var out []reports.Row
	for _, r := range res.Rows[at+1:] {
		if r.Kind != reports.KindDetail {
			break
		}
		out = append(out, r)
	}
	return out
}

// wantShare is sales ÷ total × 100 at 2 places, rounded half away from zero.
func wantShare(sales, total int64) float64 {
	return math.Round(float64(sales)*10000/float64(total)) / 100
}

func requireSalesShare(t *testing.T, r reports.Row, want float64) {
	t.Helper()
	got, ok := pctCell(t, r)
	if !ok {
		t.Errorf("%s (%s) has a blank %% of sales, want %.2f", r.Label, r.Kind, want)
		return
	}
	if math.Abs(got-want) > 1e-6 {
		t.Errorf("%s (%s) %% of sales = %v, want %.2f", r.Label, r.Kind, got, want)
	}
}

func requireBlankShare(t *testing.T, r reports.Row, why string) {
	t.Helper()
	if v, ok := pctCell(t, r); ok {
		t.Errorf("%s (%s) %% of sales = %v, want blank (%s)", r.Label, r.Kind, v, why)
	}
}

func TestSalesByCustomerSpecLoads(t *testing.T) {
	b := newSalesBook(t)
	if err := reports.CheckSources(b.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}

	shipped := salesByCustomerShipped()
	if salesByCustomerKey != "books.sales_by_customer" || shipped.Key != salesByCustomerKey {
		t.Errorf("key = %q (const %q), want books.sales_by_customer", shipped.Key, salesByCustomerKey)
	}
	if shipped.Title != "Sales by Customer" {
		t.Errorf("title = %q, want Sales by Customer", shipped.Title)
	}
	if want := "What each customer bought in a period, from posted invoices and sales receipts, less posted credit memos, before sales tax."; shipped.Description != want {
		t.Errorf("description = %q, want %q", shipped.Description, want)
	}
	if shipped.Revision != 1 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	built, err := json.Marshal(salesByCustomerSpec())
	if err != nil {
		t.Fatal(err)
	}
	if !jsonEqual(t, shipped.Spec, string(built)) {
		t.Errorf("the shipped spec is not salesByCustomerSpec()")
	}

	spec, _, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.Source != "books.sales_lines" {
		t.Errorf("source = %q, want books.sales_lines", spec.Source)
	}
	if err := reports.Validate(b.app, spec); err != nil {
		t.Fatalf("Validate: %v", err)
	}

	// No Method choice: the report is on the accrual basis.
	paramIDs := make([]string, len(spec.Params))
	for i, p := range spec.Params {
		paramIDs[i] = p.ID
	}
	if !reflect.DeepEqual(paramIDs, []string{"period", "customers", "order"}) {
		t.Fatalf("params = %v, want exactly period, customers, order", paramIDs)
	}
	period := paramOf(t, spec, "period")
	if period.Type != reports.ParamDateRange || period.Label != "Period" {
		t.Errorf("period = %+v, want a date range Period", period)
	}
	if got, want := mustJSON(paramOf(t, spec, "customers")), mustJSON(customersParam()); string(got) != string(want) {
		t.Errorf("the customers param = %s, want customersParam() %s", got, want)
	}
	order := paramOf(t, spec, "order")
	wantOrder := []reports.Option{{Value: "name", Label: "Name"}, {Value: "sales", Label: "Largest sales"}}
	if order.Type != reports.ParamChoice || order.Label != "Order" || order.Multiple ||
		!reflect.DeepEqual(order.Options, wantOrder) || !jsonEqual(t, order.Default, `"name"`) {
		t.Errorf("order = %+v (default %s), want a single choice Order: Name (default), Largest sales", order, order.Default)
	}
}

// Spec §3 "What counts" (Q2): item and percent lines of posted invoices and
// sales receipts in the period; not a draft, a void, a corrected original, a
// subtotal or description line, or a document outside the period.
func TestSalesByCustomerWhatCounts(t *testing.T) {
	b := newSalesBook(t)
	harbor := b.customer

	inv1 := b.invoice(t, harbor, "2026-10-05",
		sale(b.service, 2, 10000),
		sale(b.accessPoint, 1, 15000),
		descriptionLine("Installed on site"),
		subtotalLine(),
		percentLine(b.discount, -100000),
	)
	rct := b.receipt(t, harbor, "2026-10-08", sale(b.service, 1, 6000))

	b.draftInv(t, harbor, "2026-10-09", nil, sale(b.service, 1, 99900))
	voidInv := b.invoice(t, harbor, "2026-10-10", sale(b.service, 1, 77700))
	if err := voidInvoiceAs(b.app, voidInv.Id, b.actor); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	voidRct := b.receipt(t, harbor, "2026-10-11", sale(b.service, 1, 55500))
	if err := voidReceiptAs(b.app, voidRct.Id, b.actor); err != nil {
		t.Fatalf("void the sales receipt: %v", err)
	}
	b.draftMemo(t, harbor, "2026-10-12", nil, sale(b.service, 1, 4400))
	voidMemo := b.memo(t, harbor, "2026-10-13", nil, sale(b.service, 1, 3300))
	if err := voidCreditMemoAs(b.app, voidMemo.Id, b.actor); err != nil {
		t.Fatalf("void the credit memo: %v", err)
	}
	b.invoice(t, harbor, "2026-09-30", sale(b.service, 1, 11100))
	b.invoice(t, harbor, "2026-11-01", sale(b.service, 1, 22200))
	original := b.invoice(t, harbor, "2026-10-15", sale(b.service, 1, 1000))
	corrected := b.correct(t, original, sale(b.service, 1, 1500))

	// The stored item and percent amounts of the posted documents in the
	// period: 20000 + 15000 − 3500 (10% of the subtotal) + 6000 + 1500.
	want := saleSum(t, b.app, invoiceKind, inv1.Id) +
		saleSum(t, b.app, salesReceiptKind, rct.Id) +
		saleSum(t, b.app, invoiceKind, corrected.Id)
	if want != 39000 {
		t.Fatalf("the stored sale lines add up to %d, want 39000 (the book is not as the test means)", want)
	}

	res := b.run(t, nil)
	if got := amt(t, cbCustomerRow(t, res, harbor), "sales"); got != want {
		t.Errorf("Harborview Dental's Sales = %d, want %d (posted item and percent lines in the period, the correction once)", got, want)
	}
	subtotals := int64(reload(t, b.app, "books_invoices", inv1.Id).GetInt("subtotal")) +
		int64(reload(t, b.app, "books_sales_receipts", rct.Id).GetInt("subtotal")) +
		int64(reload(t, b.app, "books_invoices", corrected.Id).GetInt("subtotal"))
	if got := amt(t, totalOf(t, res), "sales"); got != subtotals {
		t.Errorf("Total Sales = %d, want the posted documents' stored Subtotals %d", got, subtotals)
	}
}

// Spec §3 "Date" and "Sign" (Q3, Q4): a posted credit memo lowers Sales by its
// Subtotal on its own date, applied, refunded or neither.
func TestSalesByCustomerCreditMemo(t *testing.T) {
	b := newSalesBook(t)
	harbor := b.customer
	inv := b.invoice(t, harbor, "2026-10-05", sale(b.service, 1, 50000))
	before := b.run(t, nil)
	if got := amt(t, cbCustomerRow(t, before, harbor), "sales"); got != 50000 {
		t.Fatalf("Harborview Dental's Sales before any memo = %d, want 50000", got)
	}

	open := b.memo(t, harbor, "2026-10-10", nil, sale(b.service, 1, 8000))
	applied := b.memo(t, harbor, "2026-10-12", map[string]any{"invoice": inv.Id}, sale(b.service, 1, 5000))
	refunded := b.memo(t, harbor, "2026-10-14", nil, sale(b.service, 1, 2000))
	// Nothing applies or refunds a credit memo yet (credit_memo_cash_basis_test.go),
	// so the applied and the refunded memo's stored balance is set to 0 in the
	// table: that is all an application or a refund changes on the memo.
	for _, m := range []*core.Record{applied, refunded} {
		if _, err := b.app.DB().NewQuery("UPDATE books_credit_memos SET balance = 0 WHERE id = {:id}").
			Bind(dbx.Params{"id": m.Id}).Execute(); err != nil {
			t.Fatalf("set the balance of memo %s to 0: %v", m.Id, err)
		}
	}
	// Dated after the period: it does not count in October.
	b.memo(t, harbor, "2026-11-03", nil, sale(b.service, 1, 1000))

	memoSubtotals := int64(0)
	for _, m := range []*core.Record{open, applied, refunded} {
		memoSubtotals += int64(reload(t, b.app, "books_credit_memos", m.Id).GetInt("subtotal"))
	}
	if memoSubtotals != 15000 {
		t.Fatalf("the memos' Subtotals add up to %d, want 15000", memoSubtotals)
	}
	invSubtotal := int64(reload(t, b.app, "books_invoices", inv.Id).GetInt("subtotal"))

	// A customer whose only document in the period is a credit memo.
	refundCo := b.addCustomer(t, "Refund Co", nil)
	b.memo(t, refundCo, "2026-10-20", nil, sale(b.service, 1, 3000))

	res := b.run(t, nil)
	if got := amt(t, cbCustomerRow(t, res, harbor), "sales"); got != invSubtotal-memoSubtotals {
		t.Errorf("Harborview Dental's Sales = %d, want %d (the invoice less the three memos of the period)", got, invSubtotal-memoSubtotals)
	}
	total := amt(t, totalOf(t, res), "sales")
	if total != invSubtotal-memoSubtotals-3000 {
		t.Errorf("Total Sales = %d, want %d (the invoice's Subtotal less every posted memo's in the period)", total, invSubtotal-memoSubtotals-3000)
	}
	refundRow := cbCustomerRow(t, res, refundCo)
	if got := amt(t, refundRow, "sales"); got != -3000 {
		t.Errorf("Refund Co's Sales = %d, want -3000 (a row below zero)", got)
	}
	share, ok := pctCell(t, refundRow)
	if !ok || share >= 0 {
		t.Errorf("Refund Co's %% of sales = %v (shown %v), want a share below zero", share, ok)
	}
	requireSalesShare(t, refundRow, wantShare(-3000, total))
}

// Spec §3 "Rows" (Q6): a family draws a header, its rows and a total only when
// a sub-customer has a sale; the header and the total carry the family's
// Sales (D3).
func TestSalesByCustomerFamilies(t *testing.T) {
	b := newSalesBook(t)
	aspen := b.addCustomer(t, "Aspen Co", nil)
	b.addCustomer(t, "Aspen West", aspen) // a sub-customer with no sale
	b.invoice(t, aspen, "2026-10-05", sale(b.service, 1, 2000))

	mesa := b.addCustomer(t, "Mesa Group", nil)
	north := b.addCustomer(t, "Mesa North", mesa)
	b.invoice(t, mesa, "2026-10-06", sale(b.service, 1, 5000))
	b.invoice(t, north, "2026-10-07", sale(b.service, 1, 2000))

	ridge := b.addCustomer(t, "Ridge Co", nil)
	east := b.addCustomer(t, "Ridge East", ridge)
	b.invoice(t, east, "2026-10-08", sale(b.service, 1, 3000))

	res := b.run(t, nil)

	aspenRow := cbCustomerRow(t, res, aspen)
	if aspenRow.Depth != 0 || aspenRow.Label != "Aspen Co" {
		t.Errorf("Aspen Co's row = depth %d label %q, want one row at depth 0", aspenRow.Depth, aspenRow.Label)
	}
	for _, label := range []string{"Total Aspen Co", "Aspen West"} {
		if bsHas(res, label) {
			t.Errorf("a family with no sub-customer sale shows %q; rows %q", label, bsLabels(res))
		}
	}
	if n := len(slices.DeleteFunc(bsLabels(res), func(l string) bool { return l != "Aspen Co" })); n != 1 {
		t.Errorf("%d rows labelled Aspen Co, want one (no header)", n)
	}

	g, s := reports.KindGroup, reports.KindSubtotal
	shapes := func(rows []reports.Row) []cbShape {
		out := make([]cbShape, len(rows))
		for i, r := range rows {
			out[i] = cbShapeOf(r)
		}
		return out
	}
	mesaFamily := cbFamily(t, res, "Mesa Group")
	if got, want := shapes(mesaFamily), []cbShape{
		{"Mesa Group", g, 0, true},
		{"Mesa Group", g, 1, false},
		{"Mesa North", g, 1, false},
		{"Total Mesa Group", s, 0, false},
	}; !reflect.DeepEqual(got, want) {
		t.Errorf("Mesa Group's family =\n%v\nwant\n%v (an open header, the parent's own row first, the sub-customer, the total)", got, want)
	}
	if got := cbCustomerOf(mesaFamily[1]); got != mesa.Id {
		t.Errorf("the row after the Mesa Group header stands for %q, want the parent's own row %s", got, mesa.Id)
	}

	ridgeFamily := cbFamily(t, res, "Ridge Co")
	if got, want := shapes(ridgeFamily), []cbShape{
		{"Ridge Co", g, 0, true},
		{"Ridge East", g, 1, false},
		{"Total Ridge Co", s, 0, false},
	}; !reflect.DeepEqual(got, want) {
		t.Errorf("Ridge Co's family =\n%v\nwant\n%v (no row for a parent with no sale)", got, want)
	}
	if cbHasCustomer(res, ridge) {
		t.Errorf("Ridge Co, with no sale of its own, has a customer row; rows %q", bsLabels(res))
	}

	for _, w := range []struct {
		family []reports.Row
		sales  int64
	}{{mesaFamily, 7000}, {ridgeFamily, 3000}} {
		header, total := w.family[0], w.family[len(w.family)-1]
		if got := amt(t, header, "sales"); got != w.sales {
			t.Errorf("the %s header's Sales = %d, want the family's %d", header.Label, got, w.sales)
		}
		if got := amt(t, total, "sales"); got != w.sales {
			t.Errorf("%s Sales = %d, want the family's %d", total.Label, got, w.sales)
		}
	}
}

// Spec §4 pin (D2): a customer inside a family gets its share of the report's
// Total, not of its family; a family row the family's share.
func TestSalesByCustomerShares(t *testing.T) {
	b := newSalesBook(t)
	aspen := b.addCustomer(t, "Aspen Co", nil)
	b.invoice(t, aspen, "2026-10-05", sale(b.service, 1, 2000))
	mesa := b.addCustomer(t, "Mesa Group", nil)
	north := b.addCustomer(t, "Mesa North", mesa)
	south := b.addCustomer(t, "Mesa South", mesa)
	b.invoice(t, mesa, "2026-10-06", sale(b.service, 1, 5000))
	b.invoice(t, north, "2026-10-07", sale(b.service, 1, 2000))
	b.invoice(t, south, "2026-10-08", sale(b.service, 1, 3000))
	b.receipt(t, nil, "2026-10-09", sale(b.service, 1, 1000))
	const total = int64(13000)

	res := b.run(t, nil)
	if got := amt(t, totalOf(t, res), "sales"); got != total {
		t.Fatalf("Total Sales = %d, want %d", got, total)
	}
	var pct *reports.ResultColumn
	for i, c := range res.Columns {
		if c.ID == "pct" {
			pct = &res.Columns[i]
		}
	}
	if pct == nil {
		t.Fatalf("the result has no pct column; columns %+v", res.Columns)
	}
	if pct.Label != "% of sales" || pct.Type != reports.Percent || pct.Scale == nil || *pct.Scale != 2 {
		t.Errorf("pct column = label %q type %q scale %v, want %% of sales, percent, scale 2", pct.Label, pct.Type, pct.Scale)
	}

	requireSalesShare(t, cbCustomerRow(t, res, aspen), wantShare(2000, total))
	family := cbFamily(t, res, "Mesa Group")
	requireSalesShare(t, family[0], wantShare(10000, total))
	requireSalesShare(t, family[len(family)-1], wantShare(10000, total))
	// Each member's share of the report's Total, not of its family's 10000.
	requireSalesShare(t, cbCustomerRow(t, res, mesa), wantShare(5000, total))
	requireSalesShare(t, cbCustomerRow(t, res, north), wantShare(2000, total))
	requireSalesShare(t, cbCustomerRow(t, res, south), wantShare(3000, total))
	requireSalesShare(t, bsRow(t, res, "No customer"), wantShare(1000, total))
	requireSalesShare(t, totalOf(t, res), 100)

	opened := b.runOpen(t, nil, cbCustomerRow(t, res, aspen).GroupKey)
	lines := salesLinesUnder(opened, cbCustomerRow(t, opened, aspen))
	if len(lines) != 1 {
		t.Fatalf("opened Aspen Co has %d sale line rows, want 1; rows %q", len(lines), bsLabels(opened))
	}
	requireBlankShare(t, lines[0], "a sale line row has no share")
}

// Spec §3 "% of sales": when the Total is zero the column is blank on every row.
func TestSalesZeroTotalHasNoShares(t *testing.T) {
	b := newSalesBook(t)
	sold := b.addCustomer(t, "Sold Co", nil)
	credited := b.addCustomer(t, "Credited Co", nil)
	b.invoice(t, sold, "2026-10-05", sale(b.service, 1, 5000))
	b.memo(t, credited, "2026-10-06", nil, sale(b.service, 1, 5000))

	res := b.run(t, nil)
	if got := amt(t, cbCustomerRow(t, res, sold), "sales"); got != 5000 {
		t.Errorf("Sold Co's Sales = %d, want 5000", got)
	}
	if got := amt(t, cbCustomerRow(t, res, credited), "sales"); got != -5000 {
		t.Errorf("Credited Co's Sales = %d, want -5000", got)
	}
	if got := amt(t, totalOf(t, res), "sales"); got != 0 {
		t.Errorf("Total Sales = %d, want 0", got)
	}
	for _, r := range res.Rows {
		requireBlankShare(t, r, "the Total is zero")
	}
}

// Spec §3 "No customer" (Q5).
func TestSalesByCustomerNoCustomer(t *testing.T) {
	b := newSalesBook(t)
	aspen := b.addCustomer(t, "Aspen Co", nil)
	zed := b.addCustomer(t, "Zed Co", nil)
	b.invoice(t, aspen, "2026-10-05", sale(b.service, 1, 2000))
	b.invoice(t, zed, "2026-10-05", sale(b.service, 1, 1000))
	// The largest sales of the book, so Largest sales would put it first.
	walkIn := b.receipt(t, nil, "2026-10-09", sale(b.service, 1, 9000))

	for _, order := range []string{"name", "sales"} {
		res := b.run(t, map[string]any{"order": order})
		depth0 := cbDepth0(res)
		if len(depth0) == 0 || depth0[len(depth0)-1] != "No customer" {
			t.Errorf("order = %s: depth-0 rows %q, want No customer last", order, depth0)
		}
		if got := amt(t, bsRow(t, res, "No customer"), "sales"); got != 9000 {
			t.Errorf("order = %s: No customer's Sales = %d, want 9000", order, got)
		}
	}

	closed := b.run(t, nil)
	noCustomer := bsRow(t, closed, "No customer")
	opened := b.runOpen(t, nil, noCustomer.GroupKey)
	lines := salesLinesUnder(opened, bsRow(t, opened, "No customer"))
	want := "2026-10-09 · Sales receipt " + walkIn.GetString("number") + " · Monthly bookkeeping"
	if got := labelsOf(lines); !reflect.DeepEqual(got, []string{want}) {
		t.Errorf("No customer opened = %q, want [%q]", got, want)
	}

	picked := b.run(t, map[string]any{"customers": []string{aspen.Id}})
	if bsHas(picked, "No customer") {
		t.Errorf("with customers picked the No customer row shows; rows %q", bsLabels(picked))
	}
}

// Spec §3 "Opening a customer".
func TestSalesByCustomerOpened(t *testing.T) {
	b := newSalesBook(t)
	openCo := b.addCustomer(t, "Open Co", nil)
	inv := b.invoice(t, openCo, "2026-10-05",
		sale(b.service, 1.5, 10000),
		sale(b.accessPoint, 2, 20000),
		percentLine(b.discount, -100000),
	)
	rct := b.receipt(t, openCo, "2026-10-08", sale(b.service, 1, 6000))
	memo := b.memo(t, openCo, "2026-10-12", nil, sale(b.service, 1, 3000))
	// Two invoices on one day: the correction of the first keeps its lower
	// sequence but is written after the second, so only document.sequence
	// puts it first.
	original := b.invoice(t, openCo, "2026-10-20", sale(b.service, 1, 1000))
	second := b.invoice(t, openCo, "2026-10-20", sale(b.accessPoint, 1, 2000))
	first := b.correct(t, original, sale(b.service, 1, 1200))
	if first.GetInt("sequence") >= second.GetInt("sequence") {
		t.Fatalf("sequences %d, %d: the correction must keep the original's lower sequence", first.GetInt("sequence"), second.GetInt("sequence"))
	}

	closed := b.run(t, nil)
	for _, r := range closed.Rows {
		if r.Kind == reports.KindDetail {
			t.Errorf("with no Expand, a sale line row %q is in the result", r.Label)
		}
	}
	opened := b.runOpen(t, nil, cbCustomerRow(t, closed, openCo).GroupKey)
	row := cbCustomerRow(t, opened, openCo)
	lines := salesLinesUnder(opened, row)

	type want struct {
		label, open string
		amount      int64
	}
	var wants []want
	add := func(day, word, segment string, kind salesDocKind, doc *core.Record, sign int64) {
		for _, l := range saleLinesOf(t, b.app, kind, doc.Id) {
			product := reload(t, b.app, "books_products", l.GetString("product"))
			wants = append(wants, want{
				label:  day + " · " + word + " " + doc.GetString("number") + " · " + product.GetString("name"),
				open:   "books/" + segment + "/" + doc.Id,
				amount: sign * int64(l.GetInt("amount")),
			})
		}
	}
	add("2026-10-05", "Invoice", "invoices", invoiceKind, inv, 1)
	add("2026-10-08", "Sales receipt", "sales-receipts", salesReceiptKind, rct, 1)
	add("2026-10-12", "Credit memo", "credit-memos", creditMemoKind, memo, -1)
	add("2026-10-20", "Invoice", "invoices", invoiceKind, first, 1)
	add("2026-10-20", "Invoice", "invoices", invoiceKind, second, 1)
	if len(wants) != 7 {
		t.Fatalf("the book has %d sale lines, want 7", len(wants))
	}

	gotLabels, wantLabels := labelsOf(lines), make([]string, len(wants))
	for i, w := range wants {
		wantLabels[i] = w.label
	}
	if !reflect.DeepEqual(gotLabels, wantLabels) {
		t.Fatalf("Open Co's sale line rows =\n%q\nwant (date, then sequence, then position)\n%q", gotLabels, wantLabels)
	}
	var sum int64
	for i, w := range wants {
		got := amt(t, lines[i], "sales")
		if got != w.amount {
			t.Errorf("%s Sales = %d, want %d", w.label, got, w.amount)
		}
		if lines[i].Open != w.open {
			t.Errorf("%s opens %q, want %q", w.label, lines[i].Open, w.open)
		}
		sum += got
	}
	if discount := amt(t, lines[2], "sales"); discount >= 0 {
		t.Errorf("the percent line's Sales = %d, want below zero", discount)
	}
	if credit := amt(t, lines[4], "sales"); credit >= 0 {
		t.Errorf("the credit memo line's Sales = %d, want below zero", credit)
	}
	if got := amt(t, row, "sales"); got != sum {
		t.Errorf("Open Co's Sales = %d, want the sum of its sale line rows %d", got, sum)
	}
}

// Spec §3 "Order" (D6).
func TestSalesByCustomerOrder(t *testing.T) {
	b := newSalesBook(t)
	day := "2026-10-05"
	b.invoice(t, b.addCustomer(t, "bravo", nil), day, sale(b.service, 1, 2000))
	b.invoice(t, b.addCustomer(t, "Delta", nil), day, sale(b.service, 1, 3000))
	// A family whose total (7000) is the largest, though the parent's own row
	// (1000) is smaller than one sub-customer's.
	charlie := b.addCustomer(t, "Charlie", nil)
	b.invoice(t, charlie, day, sale(b.service, 1, 1000))
	b.invoice(t, b.addCustomer(t, "zulu sub", charlie), day, sale(b.service, 1, 4000))
	b.invoice(t, b.addCustomer(t, "Alpha sub", charlie), day, sale(b.service, 1, 2000))
	// No customer has the largest sales, and stays last.
	b.receipt(t, nil, day, sale(b.service, 1, 9000))

	family := func(res *reports.Result) []string {
		return labelsOf(cbFamily(t, res, "Charlie")[1:4])
	}

	byName := b.run(t, map[string]any{"order": "name"})
	if got, want := cbDepth0(byName), []string{"bravo", "Charlie", "Delta", "No customer"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = name: depth-0 rows %q, want %q (by name ignoring case, No customer last)", got, want)
	}
	if got, want := family(byName), []string{"Charlie", "Alpha sub", "zulu sub"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = name: Charlie's family %q, want %q (the parent's own row, then by name)", got, want)
	}
	if byDefault := b.run(t, nil); !reflect.DeepEqual(bsLabels(byDefault), bsLabels(byName)) {
		t.Errorf("no Order param gives %q, want Name's %q", bsLabels(byDefault), bsLabels(byName))
	}

	bySales := b.run(t, map[string]any{"order": "sales"})
	if got, want := cbDepth0(bySales), []string{"Charlie", "Delta", "bravo", "No customer"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = sales: depth-0 rows %q, want %q (largest first, a family by its total, No customer last)", got, want)
	}
	if got, want := family(bySales), []string{"Charlie", "zulu sub", "Alpha sub"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = sales: Charlie's family %q, want %q (the parent's own row, then largest first)", got, want)
	}
}

// Spec §3 "Params shared": the Customer filter and its header line.
func TestSalesByCustomerFilter(t *testing.T) {
	b := newSalesBook(t)
	aspen := b.addCustomer(t, "Aspen Co", nil)
	b.invoice(t, aspen, "2026-10-05", sale(b.service, 1, 2500))
	mesa := b.addCustomer(t, "Mesa Group", nil)
	north := b.addCustomer(t, "Mesa North", mesa)
	south := b.addCustomer(t, "Mesa South", mesa)
	b.invoice(t, mesa, "2026-10-06", sale(b.service, 1, 5000))
	b.invoice(t, north, "2026-10-07", sale(b.service, 1, 2000))
	b.invoice(t, south, "2026-10-08", sale(b.service, 1, 3000))
	old := b.addCustomer(t, "Old Co", nil)
	b.invoice(t, old, "2026-10-09", sale(b.service, 1, 400))
	b.inactive(t, old)
	b.receipt(t, nil, "2026-10-10", sale(b.service, 1, 700))

	one := b.run(t, map[string]any{"customers": []string{north.Id}})
	if got, want := labelsOf(cbGroupRows(one)), []string{"Mesa Group", "Mesa North"}; !reflect.DeepEqual(got, want) {
		t.Errorf("customers = [Mesa North] shows group rows %q, want %q (the family with that one member)", got, want)
	}
	if got := amt(t, totalOf(t, one), "sales"); got != 2000 {
		t.Errorf("Total with customers = [Mesa North] = %d, want 2000 (its lines only)", got)
	}
	if len(one.HeaderLines) != 1 || !strings.HasPrefix(one.HeaderLines[0], "Customer: ") || !strings.Contains(one.HeaderLines[0], "Mesa North") {
		t.Errorf("header lines = %q, want one line \"Customer: …\" naming Mesa North", one.HeaderLines)
	}

	whole := b.run(t, map[string]any{"customers": []string{mesa.Id, north.Id, south.Id}})
	if got, want := labelsOf(cbFamily(t, whole, "Mesa Group")), []string{"Mesa Group", "Mesa Group", "Mesa North", "Mesa South", "Total Mesa Group"}; !reflect.DeepEqual(got, want) {
		t.Errorf("the whole family picked shows %q, want %q", got, want)
	}
	if bsHas(whole, "Aspen Co") || bsHas(whole, "No customer") {
		t.Errorf("the whole family picked keeps other rows; rows %q", bsLabels(whole))
	}
	if got := amt(t, totalOf(t, whole), "sales"); got != 10000 {
		t.Errorf("Total with the Mesa family picked = %d, want 10000", got)
	}
	if len(whole.HeaderLines) != 1 || !strings.HasPrefix(whole.HeaderLines[0], "Customer: ") {
		t.Errorf("header lines = %q, want one line \"Customer: …\"", whole.HeaderLines)
	} else {
		for _, name := range []string{"Mesa Group", "Mesa North", "Mesa South"} {
			if !strings.Contains(whole.HeaderLines[0], name) {
				t.Errorf("header line %q does not name %s", whole.HeaderLines[0], name)
			}
		}
	}
	// Core gives one line per param with a header, "" when the param is unset
	// (the client maps them by position): no line may print text.
	for _, line := range b.run(t, nil).HeaderLines {
		if line != "" {
			t.Errorf("with no customer picked, header line %q, want no text", line)
		}
	}

	spec, _, err := reports.Load(salesByCustomerShipped().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	options, err := reports.ReadParamOptions(context.Background(), b.app, reports.OptionsRequest{
		Spec: spec, Param: "customers", Auth: b.reader, Today: salesToday,
	})
	if err != nil {
		t.Fatalf("the customers param's options: %v", err)
	}
	if !slices.ContainsFunc(options.Options, func(o reports.ParamOption) bool { return o.Value == old.Id }) {
		t.Errorf("the Customer picker does not offer the inactive Old Co; options %+v", options.Options)
	}
}

// Spec §3 "Inactive records".
func TestSalesByCustomerInactive(t *testing.T) {
	b := newSalesBook(t)
	barn := b.addCustomer(t, "Old Barn", nil)
	live := b.addCustomer(t, "Live Co", nil)
	hill := b.addCustomer(t, "Hill Co", nil)
	shed := b.addCustomer(t, "Hill Shed", hill)
	b.invoice(t, barn, "2026-10-05", sale(b.service, 1, 1000))
	b.invoice(t, live, "2026-10-05", sale(b.service, 1, 2000))
	b.invoice(t, hill, "2026-10-05", sale(b.service, 1, 3000))
	b.invoice(t, shed, "2026-10-05", sale(b.service, 1, 4000))
	// A record on a new document must be active, so each is made inactive
	// after its sale posts.
	b.inactive(t, barn)
	b.inactive(t, shed)

	res := b.run(t, nil)
	for _, w := range []struct {
		customer *core.Record
		name     string
	}{{barn, "Old Barn"}, {shed, "Hill Shed"}} {
		r := cbCustomerRow(t, res, w.customer)
		if r.Label != w.name+" (inactive)" || !r.Muted {
			t.Errorf("%s's row = label %q, muted %v; want %q, muted", w.name, r.Label, r.Muted, w.name+" (inactive)")
		}
	}
	for _, r := range []reports.Row{cbCustomerRow(t, res, live), cbCustomerRow(t, res, hill), totalOf(t, res)} {
		if strings.HasSuffix(r.Label, " (inactive)") || r.Muted {
			t.Errorf("active row = label %q (%s), muted %v; want no mark", r.Label, r.Kind, r.Muted)
		}
	}
}

// Spec §2: shared with every Books reader; the rule hides what a user cannot
// read.
func TestSalesByCustomerReaders(t *testing.T) {
	b := newSalesBook(t)
	seen := b.addCustomer(t, "Seen Co", nil)
	b.invoice(t, seen, "2026-10-05", sale(b.service, 1, 1000))
	if !cbHasCustomer(b.run(t, nil), seen) {
		t.Errorf("the Books read-only reader does not see the posted sale")
	}
	res, err := runSalesErr(t, b.app, b.users.none, salesByCustomerKey, withPeriod(nil), reports.Options{Today: salesToday})
	if err != nil {
		t.Fatalf("the run of a user with Books level none was refused (%v); core runs it with the rule's rows", err)
	}
	if groups := cbGroupRows(res); len(groups) != 0 {
		t.Errorf("a user with Books level none sees rows %q", labelsOf(groups))
	}

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
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": salesByCustomerKey})
	if err != nil {
		t.Fatalf("no reports row with shipped_key %s: %v", salesByCustomerKey, err)
	}
	if row.GetBool("published") {
		t.Errorf("published = true, want unpublished")
	}
	if row.GetString("title") != "Sales by Customer" || row.GetInt("shipped_revision") != 1 || row.GetString("source") != "books.sales_lines" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a guest with Books readonly access")
	requireNoShare(t, app, row, outsider, "a guest without Books access")
}

// Spec §3 "Live": the run's topics.
func TestSalesReportsTopics(t *testing.T) {
	b := newSalesBook(t)
	topicCo := b.addCustomer(t, "Topic Co", nil)
	b.invoice(t, topicCo, "2026-10-05", sale(b.service, 1, 1000))
	all := []string{
		"collection/books_invoice_lines",
		"collection/books_sales_receipt_lines",
		"collection/books_credit_memo_lines",
		"collection/books_invoices",
		"collection/books_sales_receipts",
		"collection/books_credit_memos",
		"collection/books_customers",
		"collection/books_products",
		"collection/books_settings",
	}
	closed := b.run(t, nil)
	// A closed run reads no product: only an opened sale line names one.
	for _, topic := range all {
		if topic == "collection/books_products" {
			continue
		}
		if !slices.Contains(closed.Topics, topic) {
			t.Errorf("closed run topics = %v, want %s", closed.Topics, topic)
		}
	}
	opened := b.runOpen(t, nil, cbCustomerRow(t, closed, topicCo).GroupKey)
	for _, topic := range all {
		if !slices.Contains(opened.Topics, topic) {
			t.Errorf("opened run topics = %v, want %s", opened.Topics, topic)
		}
	}
}

// Spec §3 "Empty" and "Heading". The empty text itself is the client's
// (core emptyMessage of the period); the e2e pins it. Here: no group or detail
// row, only the Total (the engine's sum of no rows is 0, and core's view hides
// a Total-only result and prints the empty text).
func TestSalesByCustomerEmptyAndHeading(t *testing.T) {
	b := newSalesBook(t)
	if err := setFields(t, b.app, "books_settings", settingsID, map[string]any{
		"business_name": "Harbor Lane Design LLC", "fiscal_year_start_month": 7,
	}); err != nil {
		t.Fatalf("save settings: %v", err)
	}
	b.invoice(t, b.addCustomer(t, "October Co", nil), "2026-10-05", sale(b.service, 1, 1000))
	if len(cbGroupRows(b.run(t, nil))) == 0 {
		t.Fatal("October has no rows: the book must hold a posted sale")
	}

	res := b.run(t, map[string]any{"period": glPeriod("2020-01-01", "2020-12-31")})
	totals := 0
	for _, r := range res.Rows {
		if r.Kind != reports.KindTotal {
			t.Errorf("row %q (%s) in a period with no sale, want the Total only", r.Label, r.Kind)
			continue
		}
		totals++
	}
	if totals > 1 {
		t.Errorf("an empty period has %d Total rows, want at most 1", totals)
	}
	if res.Heading != "Harbor Lane Design LLC" {
		t.Errorf("heading = %q, want the Books business name", res.Heading)
	}

	spec, _, err := reports.Load(salesByCustomerShipped().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if period := paramOf(t, spec, "period"); !jsonEqual(t, period.Default, `{"preset":"thisFiscalYearToDate"}`) {
		t.Errorf("period default = %s, want the preset thisFiscalYearToDate", period.Default)
	}
	// With no Period posted the run resolves This fiscal year to date: the
	// fiscal year starts in July.
	byDefault := runSales(t, b.app, b.reader, salesByCustomerKey, nil, reports.Options{Today: salesToday})
	var period *reports.ResolvedParam
	for i, p := range byDefault.Params {
		if p.ID == "period" {
			period = &byDefault.Params[i]
		}
	}
	if period == nil || period.From != "2026-07-01" || period.To != salesToday {
		t.Errorf("the default period resolved to %+v, want 2026-07-01 to %s", period, salesToday)
	}
	if !bsHas(byDefault, "October Co") {
		t.Errorf("the default period leaves out the October sale; rows %q", bsLabels(byDefault))
	}
}
