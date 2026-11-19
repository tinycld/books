package books

import (
	"context"
	"encoding/json"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// stlToday is the reader's day in every run: the default Period, Last month,
// is then October 2026.
const stlToday = "2026-11-14"

// The four report sources the Sales Tax Liability reads (spec §5).
var stlSourceKeys = []string{
	"books.tax_agencies", "books.tax_rates", "books.sales_documents", "books.sales_tax_lines",
}

// runSTLErr loads the shipped Sales Tax Liability and runs it as reader, as
// core's run endpoint does: Load, then Run with the posted params.
func runSTLErr(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) (*reports.Result, error) {
	t.Helper()
	spec, info, err := reports.Load(salesTaxLiabilityShipped().Spec)
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

func runSTL(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	res, err := runSTLErr(t, app, reader, params, opts)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// stlBook is one book of posted invoices and sales receipts (newSalesTaxEnv,
// D8), Books' report sources, a Books read-only reader and the poster.
type stlBook struct {
	*receiptEnv
	reader *core.Record
	actor  string
}

func newSTLBook(t *testing.T) stlBook {
	t.Helper()
	env := newSalesTaxEnv(t)
	registerBooksSources(t)
	reader := mkUser(t, env.app, "member")
	setPkgAccess(t, env.app, reader, "readonly")
	return stlBook{receiptEnv: env, reader: reader, actor: env.users.bookkeeper.Id}
}

func (b stlBook) run(t *testing.T, params map[string]any) *reports.Result {
	t.Helper()
	return runSTL(t, b.app, b.reader, params, reports.Options{Today: stlToday})
}

// agency saves an agency over a liability account of its own.
func (b stlBook) agency(t *testing.T, name string) *core.Record {
	t.Helper()
	return mkTaxAgency(t, b.app, name, mkLiabilityAccount(t, b.app, name+" payable"))
}

// sale is one line of the taxable service product, its taxable flag given.
func (b stlBook) sale(cents int64, taxable bool) map[string]any {
	return item(b.service, 1, cents, taxable)
}

// draftInvoice saves a draft invoice for customer dated day (due the same
// day) under rate (none when nil), with its lines.
func (b stlBook) draftInvoice(t *testing.T, customer, rate *core.Record, day string, extra map[string]any, lines ...map[string]any) *core.Record {
	t.Helper()
	fields := map[string]any{"date": day, "due_date": day}
	if rate != nil {
		fields["tax_rate"] = rate.Id
	}
	for k, v := range extra {
		fields[k] = v
	}
	inv, err := newInvoice(b.app, customer, fields)
	if err != nil {
		t.Fatalf("save a draft invoice dated %s: %v", day, err)
	}
	for i, l := range lines {
		mkInvoiceLine(t, b.app, inv, i, l)
	}
	return inv
}

func (b stlBook) postInvoice(t *testing.T, rate *core.Record, day string, lines ...map[string]any) *core.Record {
	t.Helper()
	return mustPostInvoice(t, b.app, b.draftInvoice(t, b.customer, rate, day, nil, lines...).Id, b.actor)
}

func (b stlBook) draftReceipt(t *testing.T, rate *core.Record, day string, lines ...map[string]any) *core.Record {
	t.Helper()
	r := b.mkReceipt(t, map[string]any{"tax_rate": rate.Id, "date": day})
	for i, l := range lines {
		mkReceiptLine(t, b.app, r, i, l)
	}
	return r
}

func (b stlBook) postReceipt(t *testing.T, rate *core.Record, day string, lines ...map[string]any) *core.Record {
	t.Helper()
	return mustPostReceipt(t, b.app, b.draftReceipt(t, rate, day, lines...).Id, b.actor)
}

// stlFig is a rate row's four figures, in minor units.
type stlFig struct{ gross, nontaxable, taxable, tax int64 }

func stlFigures(t *testing.T, r reports.Row) stlFig {
	t.Helper()
	return stlFig{amt(t, r, "gross"), amt(t, r, "nontaxable"), amt(t, r, "taxable"), amt(t, r, "tax")}
}

func requireRateFigures(t *testing.T, res *reports.Result, label string, want stlFig) {
	t.Helper()
	if got := stlFigures(t, bsRow(t, res, label)); got != want {
		t.Errorf("%s: gross, non-taxable, taxable, tax = %+v, want %+v", label, got, want)
	}
}

// requireTaxOnly asserts the row shows the tax and no sales figure: no
// gross, non-taxable or taxable cell, and no currency cell for them
// (blankAbove "byRate", core G2).
func requireTaxOnly(t *testing.T, r reports.Row) {
	t.Helper()
	for _, c := range []string{"gross", "nontaxable", "taxable"} {
		if v := r.Cells[c]; v != nil {
			t.Errorf("%s (%s) %s = %#v, want blank above the rate level", r.Label, r.Kind, c, v)
		}
		if v, ok := r.Cells[c+"@currency"]; ok {
			t.Errorf("%s (%s) has a %s@currency cell %#v, want none above the rate level", r.Label, r.Kind, c, v)
		}
	}
	amt(t, r, "tax")
}

type stlShape struct {
	Label    string
	Kind     string
	Depth    int
	Expanded bool
}

func stlShapes(res *reports.Result) []stlShape {
	out := make([]stlShape, len(res.Rows))
	for i, r := range res.Rows {
		out[i] = stlShape{r.Label, r.Kind, r.Depth, r.Expanded}
	}
	return out
}

// stlGroupRow is the group row of level (1 agency, 2 rate) whose key holds
// id.
func stlGroupRow(res *reports.Result, level int, id string) (reports.Row, bool) {
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup && r.Level == level && slices.Contains(r.GroupKey, any(id)) {
			return r, true
		}
	}
	return reports.Row{}, false
}

func stlGroupRows(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup {
			out = append(out, r)
		}
	}
	return out
}

// docRef is one posted document, by kind.
type docRef struct {
	kind salesDocKind
	id   string
}

// lineSums adds the stored tax lines of docs by component: the figures a
// rate row must show (spec §3: the figures stored at posting).
func lineSums(t *testing.T, app core.App, docs ...docRef) map[string]stlFig {
	t.Helper()
	out := map[string]stlFig{}
	for _, d := range docs {
		for _, line := range docTaxLinesOf(t, app, d.kind, d.id) {
			f := out[line.GetString("component")]
			gross, taxable := int64(line.GetInt("gross_amount")), int64(line.GetInt("taxable_amount"))
			f.gross += gross
			f.taxable += taxable
			f.nontaxable += gross - taxable
			f.tax += int64(line.GetInt("amount"))
			out[line.GetString("component")] = f
		}
	}
	return out
}

func TestSalesTaxLiabilitySpecLoads(t *testing.T) {
	b := newSTLBook(t)
	if err := reports.CheckSources(b.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	refused := reports.Refused(b.app)
	accepted := map[string]bool{}
	for _, s := range reports.Sources(b.app) {
		accepted[s.Key] = true
	}
	for _, key := range stlSourceKeys {
		if reason, bad := refused[key]; bad {
			t.Errorf("source %s refused: %s", key, reason)
		}
		if !accepted[key] {
			t.Errorf("source %s is not registered and accepted", key)
		}
	}

	shipped := salesTaxLiabilityShipped()
	if salesTaxLiabilityKey != "books.sales_tax_liability" || shipped.Key != salesTaxLiabilityKey {
		t.Errorf("key = %q (const %q), want books.sales_tax_liability", shipped.Key, salesTaxLiabilityKey)
	}
	if shipped.Title != "Sales Tax Liability" {
		t.Errorf("title = %q, want Sales Tax Liability", shipped.Title)
	}
	// The hub text drops "(accrual basis)" (pay-bills spec §3.10, Q3): the
	// report runs on either method. It names the credit memos that lower the
	// tax (credit memo spec §3.11, Q17).
	if shipped.Description != "The sales tax you charged on posted invoices and sales receipts, less the tax on posted credit memos, by agency and rate." {
		t.Errorf("description = %q, want the hub text that names credit memos, without \"(accrual basis)\"", shipped.Description)
	}
	if strings.Contains(strings.ToLower(shipped.Description), "accrual basis") {
		t.Errorf("description %q still says \"accrual basis\"", shipped.Description)
	}
	if shipped.Revision != 3 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 3 (credit memos), shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	built, err := json.Marshal(salesTaxLiabilitySpec())
	if err != nil {
		t.Fatal(err)
	}
	if !jsonEqual(t, shipped.Spec, string(built)) {
		t.Errorf("the shipped spec is not salesTaxLiabilitySpec()")
	}

	spec, _, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.Version != reports.CurrentVersion {
		t.Errorf("version %d, want %d", spec.Version, reports.CurrentVersion)
	}
	if spec.Source != "books.sales_tax_lines" {
		t.Errorf("source = %q, want books.sales_tax_lines", spec.Source)
	}
	if err := reports.Validate(b.app, spec); err != nil {
		t.Fatalf("Validate: %v", err)
	}

	paramIDs := make([]string, len(spec.Params))
	for i, p := range spec.Params {
		paramIDs[i] = p.ID
	}
	if !reflect.DeepEqual(paramIDs, []string{"period", "method", "agencies"}) {
		t.Fatalf("params = %v, want period, method, agencies (the chips' order: Method after Period)", paramIDs)
	}
	if method := paramOf(t, spec, "method"); !reflect.DeepEqual(method, methodParam()) {
		t.Errorf("method = %+v, want methodParam() %+v", method, methodParam())
	}
	period := paramOf(t, spec, "period")
	if period.Type != reports.ParamDateRange || period.Label != "Period" || !jsonEqual(t, period.Default, `{"preset":"lastMonth"}`) {
		t.Errorf("period = %+v (default %s), want a date range labelled Period, default Last month", period, period.Default)
	}
	agencies := paramOf(t, spec, "agencies")
	if agencies.Type != reports.ParamChoice || agencies.Label != "Agency" || !agencies.Multiple {
		t.Errorf("agencies = %+v, want a multiple choice labelled Agency", agencies)
	}
	of := agencies.OptionsFrom
	if of == nil || of.Source != "books.tax_agencies" ||
		!reflect.DeepEqual(of.Value, reports.Path{{Field: "id"}}) || !reflect.DeepEqual(of.Label, reports.Path{{Field: "name"}}) {
		t.Errorf("agencies optionsFrom = %+v, want source books.tax_agencies, value [id], label [name]", of)
	}

	type colShape struct {
		ID, Label  string
		Hidden     bool
		BlankAbove string
	}
	gotCols := make([]colShape, len(spec.Columns))
	for i, c := range spec.Columns {
		gotCols[i] = colShape{c.ID, c.Label, c.Hidden, c.BlankAbove}
	}
	wantCols := []colShape{
		{ID: "name", Label: "Tax name"},
		{ID: "gross", Label: "Gross total", BlankAbove: "byRate"},
		{ID: "nontaxable", Label: "Non-taxable", BlankAbove: "byRate"},
		{ID: "taxable", Label: "Taxable amount", BlankAbove: "byRate"},
		{ID: "tax", Label: "Tax amount"},
		{ID: "agencyKey", Hidden: true},
		{ID: "rateKey", Hidden: true},
	}
	// The hidden key columns' labels are not pinned.
	for i := range gotCols {
		if gotCols[i].Hidden {
			gotCols[i].Label = ""
		}
	}
	if !reflect.DeepEqual(gotCols, wantCols) {
		t.Errorf("columns =\n%+v\nwant\n%+v", gotCols, wantCols)
	}

	type groupShape struct {
		ID, Col         string
		Open, Subtotals bool
	}
	gotGroups := make([]groupShape, len(spec.Groups))
	for i, g := range spec.Groups {
		gotGroups[i] = groupShape{g.ID, g.Col, g.Open, g.Subtotals}
	}
	wantGroups := []groupShape{
		{ID: "byAgency", Col: "agencyKey", Open: true, Subtotals: true},
		{ID: "byRate", Col: "rateKey", Open: false, Subtotals: true},
	}
	if !reflect.DeepEqual(gotGroups, wantGroups) {
		t.Errorf("groups = %+v\nwant %+v", gotGroups, wantGroups)
	}

	// The fixture's SALES_TAX_LIABILITY_DISPLAY, written out.
	d := spec.Display
	if d == nil {
		t.Fatal("the shipped spec has no display: a phone cuts a document label to its date")
	}
	if d.OneLine == nil || d.OneLine.MinWidth != "600px" {
		t.Errorf("display.oneLine = %+v, want minWidth 600px", d.OneLine)
	}
	if want := map[string]reports.ColumnFit{"name": {MinWidth: "12ch"}}; !reflect.DeepEqual(d.Columns, want) {
		t.Errorf("display.columns = %+v, want %+v", d.Columns, want)
	}
	type layoutShape struct {
		Width    string
		MinWidth string
		Tracks   int
		Cells    []bsCell
	}
	gotLayouts := make([]layoutShape, len(d.Layouts))
	for i, l := range d.Layouts {
		gotLayouts[i] = layoutShape{l.Width, l.MinWidth, l.Tracks, bsCells(l.Cells)}
	}
	wantLayouts := []layoutShape{{Width: "mobile", Tracks: 2, Cells: []bsCell{
		{Col: "name", Line: 1, Span: 2, Lines: 1},
		{Col: "gross", Line: 2, Span: 1, Lines: 1},
		{Col: "nontaxable", Line: 2, Span: 1, Lines: 1},
		{Col: "taxable", Line: 3, Span: 1, Lines: 1},
		{Col: "tax", Line: 3, Span: 1, Lines: 1},
	}}}
	if !reflect.DeepEqual(gotLayouts, wantLayouts) {
		t.Errorf("display.layouts = %+v\nwant %+v", gotLayouts, wantLayouts)
	}

	// A run shows the five visible columns only; the group keys stay hidden.
	agency := b.agency(t, "Alpha agency")
	b.postInvoice(t, mkTaxRate(t, b.app, "A rate one", 50000, agency), "2026-10-05", b.sale(10000, true))
	res := b.run(t, nil)
	ids := make([]string, len(res.Columns))
	for i, c := range res.Columns {
		ids[i] = c.ID
	}
	if !reflect.DeepEqual(ids, []string{"name", "gross", "nontaxable", "taxable", "tax"}) {
		t.Errorf("result columns = %v, want name, gross, nontaxable, taxable, tax", ids)
	}
	if len(stlGroupRows(res)) == 0 {
		t.Fatalf("the run has no group rows; rows %q", bsLabels(res))
	}
	for _, r := range res.Rows {
		for _, key := range []string{"agencyKey", "rateKey"} {
			if v, ok := r.Cells[key]; ok {
				t.Errorf("%s (%s) carries a %s cell %#v", r.Label, r.Kind, key, v)
			}
		}
	}
}

func TestSalesTaxLiabilityTotals(t *testing.T) {
	b := newSTLBook(t)
	// Saved out of name order, so the rows' order is the names'.
	agencyB := b.agency(t, "Beta agency")
	agencyA := b.agency(t, "Alpha agency")
	a2 := mkTaxRate(t, b.app, "A rate two", 20000, agencyA)
	a1 := mkTaxRate(t, b.app, "A rate one", 50000, agencyA)
	b1 := mkTaxRate(t, b.app, "B rate one", 10000, agencyB)
	mixed := mkTaxGroup(t, b.app, "Mixed group", a2, b1)
	pair := mkTaxGroup(t, b.app, "A pair", a1, a2)

	inv1 := b.postInvoice(t, a1, "2026-10-05", b.sale(10000, true), b.sale(2000, false))
	inv2 := b.postInvoice(t, mixed, "2026-10-10", b.sale(20000, true))
	rct := b.postReceipt(t, mixed, "2026-10-12", b.sale(5000, true), b.sale(1000, false))
	// One document taxed by two rates of agency A: once per component.
	inv3 := b.postInvoice(t, pair, "2026-10-15", b.sale(10000, true))

	res := b.run(t, nil)
	g, s, tot := reports.KindGroup, reports.KindSubtotal, reports.KindTotal
	want := []stlShape{
		{"Alpha agency", g, 0, true},
		{"A rate one", g, 1, false},
		{"A rate two", g, 1, false},
		{"Total Alpha agency", s, 0, false},
		{"Beta agency", g, 0, true},
		{"B rate one", g, 1, false},
		{"Total Beta agency", s, 0, false},
		{"Total", tot, 0, false},
	}
	if got := stlShapes(res); !reflect.DeepEqual(got, want) {
		t.Fatalf("rows (label, kind, depth, expanded) =\n%v\nwant\n%v", got, want)
	}

	// Hand sums: a1 = inv1 (12000 gross, 10000 taxable, 500) + inv3 (10000,
	// 10000, 500); a2 = inv2 (20000, 20000, 400) + rct (6000, 5000, 100) + inv3
	// (10000, 10000, 200); b1 = inv2 (20000, 20000, 200) + rct (6000, 5000, 50).
	requireRateFigures(t, res, "A rate one", stlFig{22000, 2000, 20000, 1000})
	requireRateFigures(t, res, "A rate two", stlFig{36000, 1000, 35000, 700})
	requireRateFigures(t, res, "B rate one", stlFig{26000, 1000, 25000, 250})

	sums := lineSums(t, b.app,
		docRef{invoiceKind, inv1.Id}, docRef{invoiceKind, inv2.Id},
		docRef{salesReceiptKind, rct.Id}, docRef{invoiceKind, inv3.Id})
	for label, rate := range map[string]*core.Record{"A rate one": a1, "A rate two": a2, "B rate one": b1} {
		if got := stlFigures(t, bsRow(t, res, label)); got != sums[rate.Id] {
			t.Errorf("%s = %+v, want the sums of its documents' tax lines %+v", label, got, sums[rate.Id])
		}
	}

	for _, label := range []string{"Alpha agency", "Total Alpha agency", "Beta agency", "Total Beta agency", "Total"} {
		requireTaxOnly(t, bsRow(t, res, label))
	}
	totalA := amt(t, bsRow(t, res, "Total Alpha agency"), "tax")
	totalB := amt(t, bsRow(t, res, "Total Beta agency"), "tax")
	if want := amt(t, bsRow(t, res, "A rate one"), "tax") + amt(t, bsRow(t, res, "A rate two"), "tax"); totalA != want || totalA != 1700 {
		t.Errorf("Total Alpha agency tax = %d, want a1 + a2 = %d (1700)", totalA, want)
	}
	if want := sums[a1.Id].tax + sums[a2.Id].tax; totalA != want {
		t.Errorf("Total Alpha agency tax = %d, want each document's tax once per component of A = %d", totalA, want)
	}
	if got := amt(t, bsRow(t, res, "Alpha agency"), "tax"); got != totalA {
		t.Errorf("Alpha agency tax = %d, want its total %d", got, totalA)
	}
	if totalB != 250 {
		t.Errorf("Total Beta agency tax = %d, want 250", totalB)
	}
	if got := amt(t, bsRow(t, res, "Total"), "tax"); got != totalA+totalB {
		t.Errorf("Total tax = %d, want Total Alpha agency + Total Beta agency = %d", got, totalA+totalB)
	}
}

func TestSalesTaxLiabilityPostedOnly(t *testing.T) {
	b := newSTLBook(t)
	rate := mkTaxRate(t, b.app, "Posted rate", 50000, b.agency(t, "Posted agency"))
	draftRate := mkTaxRate(t, b.app, "Draft rate", 50000, b.agency(t, "Draft agency"))

	b.draftInvoice(t, b.customer, draftRate, "2026-10-03", nil, b.sale(9900, true))
	b.draftReceipt(t, draftRate, "2026-10-03", b.sale(9800, true))
	b.postInvoice(t, rate, "2026-10-05", b.sale(10000, true))
	b.postReceipt(t, rate, "2026-10-06", b.sale(4000, true))
	voidInv := b.postInvoice(t, rate, "2026-10-07", b.sale(7000, true))
	voidRct := b.postReceipt(t, rate, "2026-10-08", b.sale(3000, true))
	original := b.postInvoice(t, rate, "2026-10-09", b.sale(8000, true))

	// Every posted document counts: invoices and sales receipts alike.
	before := b.run(t, nil)
	requireRateFigures(t, before, "Posted rate", stlFig{32000, 0, 32000, 1600})

	if err := voidInvoiceAs(b.app, voidInv.Id, b.actor); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	if err := voidReceiptAs(b.app, voidRct.Id, b.actor); err != nil {
		t.Fatalf("void the sales receipt: %v", err)
	}
	// A correction (Edit of a posted invoice) voids the original.
	correction := b.draftInvoice(t, b.customer, rate, "2026-10-09", map[string]any{"replaces": original.Id, "memo": "Corrected"}, b.sale(9000, true))
	mustPostInvoice(t, b.app, correction.Id, b.actor)
	if s := reload(t, b.app, "books_invoices", original.Id).GetString("status"); s != statusVoid {
		t.Fatalf("the corrected original's status = %q, want void", s)
	}

	res := b.run(t, nil)
	for _, label := range []string{"Draft agency", "Draft rate"} {
		if bsHas(res, label) {
			t.Errorf("a row is labelled %q: a draft has no tax lines", label)
		}
	}
	// 10000 invoice + 4000 receipt + 9000 correction; the voids and the
	// original drop out.
	requireRateFigures(t, res, "Posted rate", stlFig{23000, 0, 23000, 1150})
	for _, label := range []string{"Posted agency", "Total Posted agency", "Total"} {
		if got := amt(t, bsRow(t, res, label), "tax"); got != 1150 {
			t.Errorf("%s tax = %d, want 1150 (posted documents only)", label, got)
		}
	}
}

func TestSalesTaxLiabilityPeriod(t *testing.T) {
	b := newSTLBook(t)
	rate := mkTaxRate(t, b.app, "Period rate", 100000, b.agency(t, "Period agency"))
	post := func(day, due string, cents int64) {
		t.Helper()
		inv := b.draftInvoice(t, b.customer, rate, day, map[string]any{"due_date": due}, b.sale(cents, true))
		mustPostInvoice(t, b.app, inv.Id, b.actor)
	}
	// Due inside October, dated before it: out (accrual: its own date).
	post("2026-09-30", "2026-10-30", 1000)
	post("2026-10-01", "2026-10-01", 2000)
	b.postReceipt(t, rate, "2026-10-31", b.sale(4000, true))
	post("2026-11-01", "2026-11-01", 8000)
	// Dated inside October, due after it: in.
	post("2026-10-20", "2026-11-20", 16000)

	res := b.run(t, nil)
	var resolved *reports.ResolvedParam
	for i, p := range res.Params {
		if p.ID == "period" {
			resolved = &res.Params[i]
		}
	}
	if resolved == nil || resolved.From != "2026-10-01" || resolved.To != "2026-10-31" {
		t.Errorf("period resolved to %+v, want 2026-10-01..2026-10-31 (Last month of %s)", resolved, stlToday)
	}
	requireRateFigures(t, res, "Period rate", stlFig{22000, 0, 22000, 2200})

	november := b.run(t, map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")})
	requireRateFigures(t, november, "Period rate", stlFig{8000, 0, 8000, 800})
}

func TestSalesTaxLiabilityAgencies(t *testing.T) {
	b := newSTLBook(t)
	alpha := b.agency(t, "Alpha agency")
	beta := b.agency(t, "Beta agency")
	gamma := b.agency(t, "Gamma agency")
	if err := setTaxAgency(t, b.app, gamma.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Gamma agency inactive: %v", err)
	}
	b.postInvoice(t, mkTaxRate(t, b.app, "Alpha rate", 50000, alpha), "2026-10-05", b.sale(10000, true))
	b.postInvoice(t, mkTaxRate(t, b.app, "Beta rate", 10000, beta), "2026-10-06", b.sale(20000, true))

	only := b.run(t, map[string]any{"agencies": []string{beta.Id}})
	if got, want := bsLabels(only), []string{"Beta agency", "Beta rate", "Total Beta agency", "Total"}; !reflect.DeepEqual(got, want) {
		t.Errorf("Agency = Beta agency: rows %q, want %q", got, want)
	}
	if got := amt(t, bsRow(t, only, "Total"), "tax"); got != 200 {
		t.Errorf("Agency = Beta agency: Total tax = %d, want Beta's 200", got)
	}

	every := b.run(t, nil)
	for _, label := range []string{"Alpha agency", "Alpha rate", "Beta agency", "Beta rate"} {
		if !bsHas(every, label) {
			t.Errorf("Agency unset: no row %q; rows %q", label, bsLabels(every))
		}
	}
	if got := amt(t, bsRow(t, every, "Total"), "tax"); got != 700 {
		t.Errorf("Agency unset: Total tax = %d, want 700", got)
	}

	spec, _, err := reports.Load(salesTaxLiabilityShipped().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	options, err := reports.ReadParamOptions(context.Background(), b.app, reports.OptionsRequest{
		Spec: spec, Param: "agencies", Auth: b.reader, Today: stlToday,
	})
	if err != nil {
		t.Fatalf("the agencies param's options: %v", err)
	}
	labels := []string{}
	for _, o := range options.Options {
		labels = append(labels, o.Label)
		if o.Label == "Gamma agency" && o.Value != gamma.Id {
			t.Errorf("Gamma agency's option value = %q, want its id %q", o.Value, gamma.Id)
		}
	}
	for _, name := range []string{"Alpha agency", "Beta agency", "Gamma agency"} {
		if !slices.Contains(labels, name) {
			t.Errorf("the Agency picker lists %q, want %s (inactive agencies included)", labels, name)
		}
	}
}

func TestSalesTaxLiabilityEdges(t *testing.T) {
	b := newSTLBook(t)
	echo := b.agency(t, "Echo agency")
	foxtrot := b.agency(t, "Foxtrot agency")
	golf := b.agency(t, "Golf agency")
	five := mkTaxRate(t, b.app, "Echo five", 50000, echo)
	zero := mkTaxRate(t, b.app, "Echo zero", 0, echo)
	moving := mkTaxRate(t, b.app, "Echo moving", 50000, echo)
	golfRate := mkTaxRate(t, b.app, "Golf rate", 20000, golf)

	// A rate and no taxable line: Non-taxable sales, tax 0.
	b.postInvoice(t, five, "2026-10-05", b.sale(3000, false))
	// A 0% rate: taxable sales, tax 0.
	b.postReceipt(t, zero, "2026-10-06", b.sale(4000, true))
	b.postInvoice(t, moving, "2026-10-07", b.sale(10000, true))
	b.postInvoice(t, golfRate, "2026-10-08", b.sale(5000, true))
	before := b.run(t, nil)
	requireRateFigures(t, before, "Echo five", stlFig{3000, 3000, 0, 0})
	requireRateFigures(t, before, "Echo zero", stlFig{4000, 0, 4000, 0})
	requireRateFigures(t, before, "Echo moving", stlFig{10000, 0, 10000, 500})
	requireRateFigures(t, before, "Golf rate", stlFig{5000, 0, 5000, 100})

	// A document with no tax rate has no tax line: no row, no figure moves.
	walkIn := mkCustomer(t, b.app, "Walk-in buyer", "")
	untaxed := mustPostInvoice(t, b.app, b.draftInvoice(t, walkIn, nil, "2026-10-09", nil, b.sale(6000, true)).Id, b.actor)
	if lines := docTaxLinesOf(t, b.app, invoiceKind, untaxed.Id); len(lines) != 0 {
		t.Fatalf("an invoice with no tax rate has %d tax lines, want none", len(lines))
	}
	noRate := b.run(t, nil)
	if !reflect.DeepEqual(noRate.Rows, before.Rows) {
		t.Errorf("an invoice with no tax rate changed the rows:\n%+v\nwant\n%+v", noRate.Rows, before.Rows)
	}

	// After posting: an inactive rate and agency, a renamed rate moved to
	// another agency with a new percent, a product no longer taxable and a
	// customer made exempt.
	if err := setTaxRate(t, b.app, golfRate.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Golf rate inactive: %v", err)
	}
	if err := setTaxAgency(t, b.app, golf.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Golf agency inactive: %v", err)
	}
	if err := setTaxRate(t, b.app, moving.Id, map[string]any{"name": "Renamed rate", "rate_ppm": 90000, "agency": foxtrot.Id}); err != nil {
		t.Fatalf("rename, re-rate and move Echo moving: %v", err)
	}
	if err := setFields(t, b.app, "books_products", b.service.Id, map[string]any{"taxable": false}); err != nil {
		t.Fatalf("make the product not taxable: %v", err)
	}
	if err := setCustomer(t, b.app, b.customer.Id, map[string]any{"tax_exempt": true, "exemption_reason": "resale"}); err != nil {
		t.Fatalf("make the customer exempt: %v", err)
	}

	after := b.run(t, nil)
	golfRow, ok := stlGroupRow(after, 2, golfRate.Id)
	if !ok || golfRow.Label != "Golf rate" {
		t.Errorf("the inactive Golf rate's row = %+v (found %v), want it shown like an active one", golfRow, ok)
	}
	if row, ok := stlGroupRow(after, 1, golf.Id); !ok || row.Label != "Golf agency" {
		t.Errorf("the inactive Golf agency's row = %+v (found %v), want it shown like an active one", row, ok)
	}
	movedRow, ok := stlGroupRow(after, 2, moving.Id)
	if !ok {
		t.Fatalf("no row for the renamed rate; rows %q", bsLabels(after))
	}
	if movedRow.Label != "Renamed rate" {
		t.Errorf("the renamed rate's row is labelled %q, want its new name Renamed rate", movedRow.Label)
	}
	if !slices.Contains(movedRow.GroupKey, any(echo.Id)) || slices.Contains(movedRow.GroupKey, any(foxtrot.Id)) {
		t.Errorf("the moved rate's row key = %v, want it under Echo agency (the agency on its tax lines), not Foxtrot", movedRow.GroupKey)
	}
	if bsHas(after, "Foxtrot agency") {
		t.Errorf("Foxtrot agency has a row; it has no tax lines")
	}
	labels := bsLabels(after)
	echoAt, movedAt, echoTotalAt := slices.Index(labels, "Echo agency"), slices.Index(labels, "Renamed rate"), slices.Index(labels, "Total Echo agency")
	if echoAt < 0 || movedAt <= echoAt || echoTotalAt <= movedAt {
		t.Errorf("rows %q: want Renamed rate between Echo agency and Total Echo agency", labels)
	}
	requireRateFigures(t, after, "Renamed rate", stlFig{10000, 0, 10000, 500})
	requireRateFigures(t, after, "Echo five", stlFig{3000, 3000, 0, 0})
	requireRateFigures(t, after, "Echo zero", stlFig{4000, 0, 4000, 0})
	requireRateFigures(t, after, "Golf rate", stlFig{5000, 0, 5000, 100})
	// Every figure is the one stored at posting.
	cellsByID := map[string]map[string]any{}
	for _, r := range after.Rows {
		cellsByID[r.ID] = r.Cells
	}
	for _, r := range before.Rows {
		got, ok := cellsByID[r.ID]
		if !ok {
			t.Errorf("row %s (%s) is gone after the changes", r.ID, r.Label)
			continue
		}
		if !reflect.DeepEqual(got, r.Cells) {
			t.Errorf("row %s (%s) cells = %v after the changes, want the posted %v", r.ID, r.Label, got, r.Cells)
		}
	}
}

func TestSalesTaxLiabilityEmpty(t *testing.T) {
	b := newSTLBook(t)
	b.postInvoice(t, mkTaxRate(t, b.app, "October rate", 50000, b.agency(t, "October agency")), "2026-10-05", b.sale(10000, true))
	if len(stlGroupRows(b.run(t, nil))) == 0 {
		t.Fatal("October has no group rows: the book must hold a posted taxed sale")
	}

	res := b.run(t, map[string]any{"period": glPeriod("2026-09-01", "2026-09-30")})
	if groups := stlGroupRows(res); len(groups) != 0 {
		t.Errorf("a period with no posted taxed sale has group rows %q", labelsOf(groups))
	}
	totals := 0
	for _, r := range res.Rows {
		if r.Kind != reports.KindTotal {
			t.Errorf("row %q (%s) in an empty period, want the Total only", r.Label, r.Kind)
			continue
		}
		totals++
		if v := r.Cells["tax"]; v != nil {
			t.Errorf("the empty period's Total tax = %#v, want no figure", v)
		}
	}
	if totals != 1 {
		t.Errorf("an empty period has %d Total rows, want exactly 1", totals)
	}
}

func TestSalesTaxLiabilityNoAccess(t *testing.T) {
	b := newSTLBook(t)
	b.postInvoice(t, mkTaxRate(t, b.app, "Seen rate", 50000, b.agency(t, "Seen agency")), "2026-10-05", b.sale(10000, true))
	// The reader sees the sale, so the outsider's empty run is the rule's doing.
	if !bsHas(b.run(t, nil), "Seen rate") {
		t.Fatal("the Books reader does not see the posted sale")
	}

	res, err := runSTLErr(t, b.app, b.users.none, nil, reports.Options{Today: stlToday})
	if err != nil {
		t.Fatalf("the run of a user with Books level none was refused (%v); core runs it with the rule's rows", err)
	}
	if groups := stlGroupRows(res); len(groups) != 0 {
		t.Errorf("a user with Books level none sees rows %q", labelsOf(groups))
	}
	for _, r := range res.Rows {
		if v := r.Cells["tax"]; v != nil && v != int64(0) {
			t.Errorf("a user with Books level none: %s (%s) tax = %#v, want 0 or empty", r.Label, r.Kind, v)
		}
	}
}

func TestSalesTaxLiabilityTopics(t *testing.T) {
	b := newSTLBook(t)
	rate := mkTaxRate(t, b.app, "Topic rate", 50000, b.agency(t, "Topic agency"))
	b.postInvoice(t, rate, "2026-10-05", b.sale(10000, true))
	res := b.run(t, nil)
	for _, topic := range []string{
		"collection/books_invoice_tax_lines",
		"collection/books_sales_receipt_tax_lines",
		"collection/books_invoices",
		"collection/books_sales_receipts",
		"collection/books_tax_rates",
		"collection/books_tax_agencies",
	} {
		if !slices.Contains(res.Topics, topic) {
			t.Errorf("topics = %v, want %s (a void or post re-runs the open report)", res.Topics, topic)
		}
	}

	// The document label names the customer: a renamed customer re-runs the
	// report with an opened rate. Only an opened rate reads the label.
	rateRow, ok := stlGroupRow(res, 2, rate.Id)
	if !ok {
		t.Fatalf("no row for Topic rate; rows %q", bsLabels(res))
	}
	opened := runSTL(t, b.app, b.reader, nil, reports.Options{
		Today:    stlToday,
		Expand:   [][]any{rateRow.GroupKey},
		Collapse: [][]any{},
	})
	if !slices.Contains(opened.Topics, "collection/books_customers") {
		t.Errorf("topics with Topic rate opened = %v, want collection/books_customers", opened.Topics)
	}
}

// stlDetailsUnder are the detail rows of the opened rate row rate, in result
// order.
func stlDetailsUnder(res *reports.Result, rate reports.Row) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindDetail && r.Section == rate.ID {
			out = append(out, r)
		}
	}
	return out
}

// stlLineFigures is the four figures of doc's tax line for component: the
// figures its document row must show.
func stlLineFigures(t *testing.T, app core.App, doc docRef, component string) stlFig {
	t.Helper()
	for _, line := range docTaxLinesOf(t, app, doc.kind, doc.id) {
		if line.GetString("component") != component {
			continue
		}
		gross, taxable := int64(line.GetInt("gross_amount")), int64(line.GetInt("taxable_amount"))
		return stlFig{gross, gross - taxable, taxable, int64(line.GetInt("amount"))}
	}
	t.Fatalf("%s %s has no tax line for component %s", doc.kind.Collection, doc.id, component)
	return stlFig{}
}

func TestSalesTaxLiabilityOpenedRate(t *testing.T) {
	b := newSTLBook(t)
	agency := b.agency(t, "Alpha agency")
	a1 := mkTaxRate(t, b.app, "A rate one", 50000, agency)
	a2 := mkTaxRate(t, b.app, "A rate two", 20000, agency)
	pair := mkTaxGroup(t, b.app, "A pair", a1, a2)
	customer := b.customer.GetString("display_name")

	// Posted first, dated last: the rows follow the date, not the sequence.
	late := b.postInvoice(t, a1, "2026-10-27", b.sale(1000, true))
	early := b.postInvoice(t, a1, "2026-10-06", b.sale(10000, true), b.sale(2500, false))
	// A sales receipt with no customer.
	draft := b.mkReceipt(t, map[string]any{"customer": "", "tax_rate": a1.Id, "date": "2026-10-14"})
	mkReceiptLine(t, b.app, draft, 0, b.sale(4000, true))
	walkIn := mustPostReceipt(t, b.app, draft.Id, b.actor)
	// Two invoices on one day. The first is then corrected: the correction
	// keeps the original's sequence but its tax lines are written after the
	// second invoice's, so only the sequence puts it first.
	original := b.postInvoice(t, a1, "2026-10-20", b.sale(3000, true))
	sameDayB := b.postInvoice(t, a1, "2026-10-20", b.sale(6000, true))
	correction := b.draftInvoice(t, b.customer, a1, "2026-10-20", map[string]any{"replaces": original.Id}, b.sale(3500, true))
	sameDayA := mustPostInvoice(t, b.app, correction.Id, b.actor)
	if sameDayA.GetInt("sequence") >= sameDayB.GetInt("sequence") {
		t.Fatalf("sequences %d, %d: the correction must keep the original's lower sequence",
			sameDayA.GetInt("sequence"), sameDayB.GetInt("sequence"))
	}
	// A group-rate document: one tax line under each of the two rates.
	grouped := b.postInvoice(t, pair, "2026-10-22", b.sale(20000, true))

	label := func(day, kind string, doc *core.Record, withCustomer bool) string {
		out := day + " · " + kind + " " + doc.GetString("number")
		if withCustomer {
			out += " · " + customer
		}
		return out
	}

	closed := b.run(t, nil)
	for _, r := range closed.Rows {
		if r.Kind == reports.KindDetail {
			t.Errorf("with no Expand, a detail row %q is in the result", r.Label)
		}
	}
	rateOne, ok := stlGroupRow(closed, 2, a1.Id)
	if !ok {
		t.Fatalf("no row for A rate one; rows %q", bsLabels(closed))
	}
	rateTwo, ok := stlGroupRow(closed, 2, a2.Id)
	if !ok {
		t.Fatalf("no row for A rate two; rows %q", bsLabels(closed))
	}

	// An empty Collapse keeps the agency level open beside Expand, as core's
	// view sends a press (Ruling R2).
	opened := runSTL(t, b.app, b.reader, nil, reports.Options{
		Today:    stlToday,
		Expand:   [][]any{rateOne.GroupKey, rateTwo.GroupKey},
		Collapse: [][]any{},
	})
	openOne, ok := stlGroupRow(opened, 2, a1.Id)
	if !ok || !openOne.Expanded {
		t.Fatalf("A rate one = %+v (found %v), want it opened; rows %q", openOne, ok, bsLabels(opened))
	}
	openTwo, ok := stlGroupRow(opened, 2, a2.Id)
	if !ok || !openTwo.Expanded {
		t.Fatalf("A rate two = %+v (found %v), want it opened; rows %q", openTwo, ok, bsLabels(opened))
	}

	type want struct {
		label string
		doc   docRef
	}
	check := func(rate reports.Row, component string, wants []want) {
		t.Helper()
		rows := stlDetailsUnder(opened, rate)
		got := make([]string, len(rows))
		for i, r := range rows {
			got[i] = r.Label
		}
		wantLabels := make([]string, len(wants))
		for i, w := range wants {
			wantLabels[i] = w.label
		}
		if !reflect.DeepEqual(got, wantLabels) {
			t.Fatalf("%s's document rows =\n%q\nwant\n%q", rate.Label, got, wantLabels)
		}
		var sum stlFig
		for i, w := range wants {
			fig := stlLineFigures(t, b.app, w.doc, component)
			if gotFig := stlFigures(t, rows[i]); gotFig != fig {
				t.Errorf("%s: gross, non-taxable, taxable, tax = %+v, want its tax line's %+v", w.label, gotFig, fig)
			}
			sum.gross += fig.gross
			sum.nontaxable += fig.nontaxable
			sum.taxable += fig.taxable
			sum.tax += fig.tax
		}
		requireRateFigures(t, opened, "Total "+rate.Label, sum)
		if got := stlFigures(t, bsRow(t, opened, "Total "+rate.Label)); got != stlFigures(t, rate) {
			t.Errorf("Total %s = %+v, want the rate row's figures %+v", rate.Label, got, stlFigures(t, rate))
		}
	}

	check(openOne, a1.Id, []want{
		{label("2026-10-06", "Invoice", early, true), docRef{invoiceKind, early.Id}},
		{label("2026-10-14", "Sales receipt", walkIn, false), docRef{salesReceiptKind, walkIn.Id}},
		{label("2026-10-20", "Invoice", sameDayA, true), docRef{invoiceKind, sameDayA.Id}},
		{label("2026-10-20", "Invoice", sameDayB, true), docRef{invoiceKind, sameDayB.Id}},
		{label("2026-10-22", "Invoice", grouped, true), docRef{invoiceKind, grouped.Id}},
		{label("2026-10-27", "Invoice", late, true), docRef{invoiceKind, late.Id}},
	})
	// The group-rate invoice shows once under each of its two rates.
	check(openTwo, a2.Id, []want{
		{label("2026-10-22", "Invoice", grouped, true), docRef{invoiceKind, grouped.Id}},
	})
}

// A document row opens its document's read view by kind (core detail.open,
// the result row's Open); rate rows, agency rows and totals open nothing.
func TestSalesTaxLiabilityDocumentOpens(t *testing.T) {
	b := newSTLBook(t)
	rate := mkTaxRate(t, b.app, "Open rate", 50000, b.agency(t, "Open agency"))
	customer := b.customer.GetString("display_name")
	inv := b.postInvoice(t, rate, "2026-10-05", b.sale(10000, true))
	rct := b.postReceipt(t, rate, "2026-10-06", b.sale(4000, true))

	closed := b.run(t, nil)
	rateRow, ok := stlGroupRow(closed, 2, rate.Id)
	if !ok {
		t.Fatalf("no row for Open rate; rows %q", bsLabels(closed))
	}
	opened := runSTL(t, b.app, b.reader, nil, reports.Options{
		Today:    stlToday,
		Expand:   [][]any{rateRow.GroupKey},
		Collapse: [][]any{},
	})
	openRate, ok := stlGroupRow(opened, 2, rate.Id)
	if !ok || !openRate.Expanded {
		t.Fatalf("Open rate = %+v (found %v), want it opened; rows %q", openRate, ok, bsLabels(opened))
	}

	want := map[string]string{
		"2026-10-05 · Invoice " + inv.GetString("number") + " · " + customer:       "books/invoices/" + inv.Id,
		"2026-10-06 · Sales receipt " + rct.GetString("number") + " · " + customer: "books/sales-receipts/" + rct.Id,
	}
	got := map[string]string{}
	for _, r := range stlDetailsUnder(opened, openRate) {
		got[r.Label] = r.Open
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("document rows (label → open) =\n%q\nwant\n%q", got, want)
	}

	for _, res := range []*reports.Result{closed, opened} {
		for _, r := range res.Rows {
			if r.Kind != reports.KindDetail && r.Open != "" {
				t.Errorf("%s row %q opens %q, want nothing (only a document row opens)", r.Kind, r.Label, r.Open)
			}
		}
	}
	for _, label := range []string{"Open agency", "Open rate", "Total Open agency", "Total"} {
		if !bsHas(opened, label) {
			t.Errorf("no row %q to check opens nothing; rows %q", label, bsLabels(opened))
		}
	}
}

// Register ships the Sales Tax Liability; core creates it unpublished, owned
// by the first admin, and Books shares it with every Books reader.
func TestSalesTaxLiabilityShippedShared(t *testing.T) {
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
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": salesTaxLiabilityKey})
	if err != nil {
		t.Fatalf("no reports row with shipped_key %s: %v", salesTaxLiabilityKey, err)
	}
	if row.GetBool("published") || row.GetString("published_by") != "" {
		t.Errorf("published = %v (by %q), want unpublished", row.GetBool("published"), row.GetString("published_by"))
	}
	if row.GetString("title") != "Sales Tax Liability" || row.GetInt("shipped_revision") != 3 || row.GetString("source") != "books.sales_tax_lines" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a guest with Books readonly access")
	requireNoShare(t, app, row, outsider, "a guest without Books access")
}

// newCreditMemoSTLBook is an stlBook whose app also binds the credit memo
// guards and host, beside the invoice's and the sales receipt's.
func newCreditMemoSTLBook(t *testing.T) (stlBook, *creditMemoEnv) {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, invoiceKind)
	registerSalesDocGuards(app, salesReceiptKind)
	registerSalesDocGuards(app, creditMemoKind)
	bindHostsByKey(t, app, invoiceKind.HostKey, salesReceiptKind.HostKey, creditMemoHostKey)
	ce := creditMemoEnvOn(t, app)
	registerBooksSources(t)
	reader := mkUser(t, app, "member")
	setPkgAccess(t, app, reader, "readonly")
	return stlBook{receiptEnv: ce.receiptEnv, reader: reader, actor: ce.users.bookkeeper.Id}, ce
}

// Credit memo spec §3.10 (Q5, Q17): on Accrual a posted credit memo lowers its
// rate's gross, taxable and tax on its date, and its document row reads
// "<date> · Credit memo 1001 · <customer>" and opens the memo; an invoice row
// and a sales receipt row keep their labels and paths. On Cash the memo
// changes no figure and has no row.
func TestSalesTaxLiabilityCreditMemo(t *testing.T) {
	b, ce := newCreditMemoSTLBook(t)
	rate := mkTaxRate(t, b.app, "Memo rate", 80000, b.agency(t, "Memo agency"))
	customer := b.customer.GetString("display_name")

	inv := b.postInvoice(t, rate, "2026-10-05", b.sale(100000, true))
	rct := b.postReceipt(t, rate, "2026-10-06", b.sale(10000, true))
	without := b.run(t, nil)
	requireRateFigures(t, without, "Memo rate", stlFig{110000, 0, 110000, 8800})

	draft := ce.mkCreditMemo(t, map[string]any{"date": "2026-10-07", "tax_rate": rate.Id})
	mkCreditMemoLine(t, b.app, draft, 0, b.sale(25000, true))
	memo := mustPostCreditMemo(t, b.app, draft.Id, b.actor)
	if memo.GetString("number") != "1001" || memo.GetInt("tax_total") != 2000 {
		t.Fatalf("credit memo number %q tax %d, want 1001 and 2000 (8%% of 250.00)", memo.GetString("number"), memo.GetInt("tax_total"))
	}

	// Lowered by the memo's 250.00 taxable and 20.00 tax.
	accrual := b.run(t, nil)
	requireRateFigures(t, accrual, "Memo rate", stlFig{85000, 0, 85000, 6800})
	if got := amt(t, bsRow(t, accrual, "Total Memo agency"), "tax"); got != 6800 {
		t.Errorf("Total Memo agency tax = %d on Accrual, want 6800 (8800 less the memo's 2000)", got)
	}

	open := func(method string) (reports.Row, *reports.Result) {
		t.Helper()
		params := withMethod(map[string]any{}, method)
		closed := b.run(t, params)
		rateRow, ok := stlGroupRow(closed, 2, rate.Id)
		if !ok {
			t.Fatalf("%s: no row for Memo rate; rows %q", method, bsLabels(closed))
		}
		opened := runSTL(t, b.app, b.reader, params, reports.Options{
			Today: stlToday, Expand: [][]any{rateRow.GroupKey}, Collapse: [][]any{},
		})
		openRate, ok := stlGroupRow(opened, 2, rate.Id)
		if !ok || !openRate.Expanded {
			t.Fatalf("%s: Memo rate = %+v (found %v), want it opened; rows %q", method, openRate, ok, bsLabels(opened))
		}
		return openRate, opened
	}

	openRate, opened := open("accrual")
	got := map[string]string{}
	for _, r := range stlDetailsUnder(opened, openRate) {
		got[r.Label] = r.Open
	}
	want := map[string]string{
		"2026-10-05 · Invoice " + inv.GetString("number") + " · " + customer:       "books/invoices/" + inv.Id,
		"2026-10-06 · Sales receipt " + rct.GetString("number") + " · " + customer: "books/sales-receipts/" + rct.Id,
		"2026-10-07 · Credit memo 1001 · " + customer:                              "books/credit-memos/" + memo.Id,
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Accrual document rows (label → open) =\n%q\nwant\n%q", got, want)
	}

	// On Cash the unpaid invoice is taken out and the memo counts for nothing:
	// only the sales receipt's figures stay.
	cash := b.run(t, withMethod(map[string]any{}, "cash"))
	requireRateFigures(t, cash, "Memo rate", stlFig{10000, 0, 10000, 800})
	cashRate, cashOpened := open("cash")
	for _, r := range stlDetailsUnder(cashOpened, cashRate) {
		if strings.Contains(r.Label, "Credit memo") || strings.Contains(r.Open, memo.Id) {
			t.Errorf("Cash: a document row %q (opens %q) shows the credit memo, want none", r.Label, r.Open)
		}
	}

	// A posted memo whose subtotal is zero (a taxable 100.00 and a
	// non-taxable −100.00) still owes back 8.00 tax: its taken-out cash row
	// has a zero gross, so only what the row is (no payment) can tell it from
	// a row that brings the memo back. On a rate of its own beside a sales
	// receipt of 100.00 (8.00 tax).
	zeroRate := mkTaxRate(t, b.app, "Zero memo rate", 80000, b.agency(t, "Zero memo agency"))
	b.postReceipt(t, zeroRate, "2026-10-06", b.sale(10000, true))
	zeroDraft := ce.mkCreditMemo(t, map[string]any{"date": "2026-10-08", "tax_rate": zeroRate.Id})
	mkCreditMemoLine(t, b.app, zeroDraft, 0, b.sale(10000, true))
	mkCreditMemoLine(t, b.app, zeroDraft, 1, b.sale(-10000, false))
	zeroMemo := mustPostCreditMemo(t, b.app, zeroDraft.Id, b.actor)
	if zeroMemo.GetInt("subtotal") != 0 || zeroMemo.GetInt("tax_total") != 800 {
		t.Fatalf("zero memo subtotal %d tax %d, want 0 and 800", zeroMemo.GetInt("subtotal"), zeroMemo.GetInt("tax_total"))
	}

	// Accrual: the memo lowers the taxable and the tax by 100.00 and 8.00; its
	// gross is zero, so the gross stays.
	requireRateFigures(t, b.run(t, nil), "Zero memo rate", stlFig{10000, 10000, 0, 0})

	// Cash: the receipt alone, and no row for the memo.
	requireRateFigures(t, b.run(t, withMethod(map[string]any{}, "cash")), "Zero memo rate", stlFig{10000, 0, 10000, 800})
	zeroCash := b.run(t, withMethod(map[string]any{}, "cash"))
	zeroRow, ok := stlGroupRow(zeroCash, 2, zeroRate.Id)
	if !ok {
		t.Fatalf("Cash: no row for Zero memo rate; rows %q", bsLabels(zeroCash))
	}
	zeroOpened := runSTL(t, b.app, b.reader, withMethod(map[string]any{}, "cash"), reports.Options{
		Today: stlToday, Expand: [][]any{zeroRow.GroupKey}, Collapse: [][]any{},
	})
	zeroOpen, ok := stlGroupRow(zeroOpened, 2, zeroRate.Id)
	if !ok || !zeroOpen.Expanded {
		t.Fatalf("Cash: Zero memo rate = %+v (found %v), want it opened; rows %q", zeroOpen, ok, bsLabels(zeroOpened))
	}
	for _, r := range stlDetailsUnder(zeroOpened, zeroOpen) {
		if strings.Contains(r.Label, "Credit memo") || strings.Contains(r.Open, zeroMemo.Id) {
			t.Errorf("Cash: a document row %q (opens %q) shows the zero-subtotal credit memo, want none", r.Label, r.Open)
		}
	}
}

// newRefundSTLBook is an stlBook whose app also binds the credit memo and
// refund receipt guards and hosts, beside the invoice's and the sales
// receipt's.
func newRefundSTLBook(t *testing.T) (stlBook, *refundReceiptEnv) {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, invoiceKind)
	registerSalesDocGuards(app, salesReceiptKind)
	registerSalesDocGuards(app, creditMemoKind)
	registerSalesDocGuards(app, refundReceiptKind)
	bindHostsByKey(t, app, invoiceKind.HostKey, salesReceiptKind.HostKey, creditMemoHostKey, refundReceiptHostKey)
	rr := refundReceiptEnvOn(t, app)
	registerBooksSources(t)
	reader := mkUser(t, app, "member")
	setPkgAccess(t, app, reader, "readonly")
	return stlBook{receiptEnv: rr.receiptEnv, reader: reader, actor: rr.users.bookkeeper.Id}, rr
}

// postedRefundOn posts a refund of Harborview Dental dated day under rate
// (none when nil) with lines.
func (rr *refundReceiptEnv) postedRefundOn(t testing.TB, rate *core.Record, day string, lines ...map[string]any) *core.Record {
	t.Helper()
	fields := map[string]any{"date": day}
	if rate != nil {
		fields["tax_rate"] = rate.Id
	}
	r := rr.mkRefundReceipt(t, fields)
	for i, l := range lines {
		mkRefundReceiptLine(t, rr.app, r, i, l)
	}
	return mustPostRefundReceipt(t, rr.app, r.Id, rr.users.bookkeeper.Id)
}

// Refund receipt spec §3.13 (Q10): a posted plain refund lowers its rate's
// gross, taxable and tax on its date, and its document row reads "<date> ·
// Refund receipt 1001 · <customer>" and opens the refund; on Cash it counts on
// its date too. A payout writes no tax line: it adds no row and changes no
// figure.
func TestSalesTaxLiabilityRefundReceipt(t *testing.T) {
	b, rr := newRefundSTLBook(t)
	rate := mkTaxRate(t, b.app, "Refund rate", 80000, b.agency(t, "Refund agency"))
	customer := b.customer.GetString("display_name")

	rct := b.postReceipt(t, rate, "2026-10-06", b.sale(100000, true))
	requireRateFigures(t, b.run(t, nil), "Refund rate", stlFig{100000, 0, 100000, 8000})

	refund := rr.postedRefundOn(t, rate, "2026-10-08", b.sale(25000, true))
	if refund.GetString("number") != "1001" || refund.GetInt("tax_total") != 2000 {
		t.Fatalf("refund number %q tax %d, want 1001 and 2000 (8%% of 250.00)", refund.GetString("number"), refund.GetInt("tax_total"))
	}
	// Lowered by the refund's 250.00 taxable and 20.00 tax, on both methods.
	for _, method := range []string{"accrual", "cash"} {
		res := b.run(t, withMethod(map[string]any{}, method))
		requireRateFigures(t, res, "Refund rate", stlFig{75000, 0, 75000, 6000})
		if got := amt(t, bsRow(t, res, "Total Refund agency"), "tax"); got != 6000 {
			t.Errorf("%s: Total Refund agency tax = %d, want 6000 (8000 less the refund's 2000)", method, got)
		}
	}

	opened := func(rate *core.Record, method string) []reports.Row {
		t.Helper()
		params := withMethod(map[string]any{}, method)
		closed := b.run(t, params)
		rateRow, ok := stlGroupRow(closed, 2, rate.Id)
		if !ok {
			t.Fatalf("%s: no row for %s; rows %q", method, rate.GetString("name"), bsLabels(closed))
		}
		res := runSTL(t, b.app, b.reader, params, reports.Options{
			Today: stlToday, Expand: [][]any{rateRow.GroupKey}, Collapse: [][]any{},
		})
		openRate, ok := stlGroupRow(res, 2, rate.Id)
		if !ok || !openRate.Expanded {
			t.Fatalf("%s: %s = %+v (found %v), want it opened; rows %q", method, rate.GetString("name"), openRate, ok, bsLabels(res))
		}
		return stlDetailsUnder(res, openRate)
	}
	for _, method := range []string{"accrual", "cash"} {
		got := map[string]string{}
		for _, r := range opened(rate, method) {
			got[r.Label] = r.Open
		}
		want := map[string]string{
			"2026-10-06 · Sales receipt " + rct.GetString("number") + " · " + customer: "books/sales-receipts/" + rct.Id,
			"2026-10-08 · Refund receipt 1001 · " + customer:                           "books/refund-receipts/" + refund.Id,
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%s document rows (label → open) =\n%q\nwant\n%q", method, got, want)
		}
	}

	// A payout of a taxed credit memo on a rate of its own: the memo's row
	// stays, the payout adds none and changes no figure.
	payoutRate := mkTaxRate(t, b.app, "Payout rate", 80000, b.agency(t, "Payout agency"))
	memoDraft := rr.mkCreditMemo(t, map[string]any{"date": "2026-10-09", "tax_rate": payoutRate.Id})
	mkCreditMemoLine(t, b.app, memoDraft, 0, b.sale(10000, true))
	memo := mustPostCreditMemo(t, b.app, memoDraft.Id, b.actor)
	before := stlFigures(t, bsRow(t, b.run(t, nil), "Payout rate"))
	payout, _ := rr.draftPayout(t, memo, 5000, map[string]any{"date": "2026-10-10"})
	payout = mustPostRefundReceipt(t, b.app, payout.Id, b.actor)
	if n, err := b.app.CountRecords("books_refund_receipt_tax_lines"); err != nil || n != 1 {
		t.Fatalf("%d refund receipt tax lines stored (err %v), want the plain refund's 1 and none of the payout", n, err)
	}
	if got := stlFigures(t, bsRow(t, b.run(t, nil), "Payout rate")); got != before {
		t.Errorf("Payout rate figures = %+v after the payout, want them unchanged %+v", got, before)
	}
	for _, r := range opened(payoutRate, "accrual") {
		if strings.Contains(r.Label, "Refund receipt") || strings.Contains(r.Open, payout.Id) {
			t.Errorf("a document row %q (opens %q) shows the payout, want none", r.Label, r.Open)
		}
	}
}

// The Method param (pay-bills spec §3.10, Q3): on Accrual a tax line counts on
// its own date; on Cash an invoice's tax is taken out at the invoice date and
// comes back by each payment's share at the payment date, and a sales
// receipt's tax counts on its date on both methods. The document header
// prints the basis.
func TestSalesTaxLiabilityMethod(t *testing.T) {
	ce := newCashTaxEnv(t)
	registerBooksSources(t)
	reader := mkUser(t, ce.app, "member")
	setPkgAccess(t, ce.app, reader, "readonly")
	b := stlBook{receiptEnv: ce.receiptEnv, reader: reader, actor: ce.actor}

	// Invoice of 1080.00 (1000.00 + 80.00 tax) on D1, 540.00 of it paid on
	// D2; a sales receipt of 500.00 (40.00 tax) on D3.
	inv := b.postInvoice(t, ce.eight, cashDay1, b.sale(100000, true))
	ce.payOn(t, inv, cashDay2, 54000)
	b.postReceipt(t, ce.eight, cashDay3, b.sale(50000, true))

	agencyTotal := "Total " + ce.agency.GetString("name")
	run := func(from, to, method string) *reports.Result {
		t.Helper()
		return b.run(t, withMethod(map[string]any{"period": glPeriod(from, to)}, method))
	}
	// The agency's tax, 0 when the run shows no row for it.
	tax := func(res *reports.Result) int64 {
		t.Helper()
		if !bsHas(res, agencyTotal) {
			return 0
		}
		return amt(t, bsRow(t, res, agencyTotal), "tax")
	}

	accrual := run(cashDay1, cashDay1, "")
	if got := tax(accrual); got != 8000 {
		t.Errorf("Accrual (default) over %s..%s: %s = %d, want 8000 (the invoice's tax on its own date)", cashDay1, cashDay1, agencyTotal, got)
	}
	requireHeaderLines(t, "the default (Accrual) run", accrual, "Accrual basis")
	if got := tax(run(cashDay1, cashDay1, "accrual")); got != 8000 {
		t.Errorf("Accrual over %s..%s: %s = %d, want 8000", cashDay1, cashDay1, agencyTotal, got)
	}

	cashD1 := run(cashDay1, cashDay1, "cash")
	if got := tax(cashD1); got != 0 {
		t.Errorf("Cash over %s..%s: %s = %d, want 0 (nothing paid on the invoice date)", cashDay1, cashDay1, agencyTotal, got)
	}
	requireHeaderLines(t, "the Cash run", cashD1, "Cash basis")
	if got := tax(run(cashDay1, cashDay2, "cash")); got != 4000 {
		t.Errorf("Cash over %s..%s: %s = %d, want 4000 (the 540.00 payment's share)", cashDay1, cashDay2, agencyTotal, got)
	}
	// The share counts on the payment date, not the invoice's: the report
	// filters by the tax line's own date.
	if got := tax(run(cashDay2, cashDay2, "cash")); got != 4000 {
		t.Errorf("Cash over %s..%s: %s = %d, want 4000 (the share on the payment date)", cashDay2, cashDay2, agencyTotal, got)
	}

	for _, method := range []string{"accrual", "cash"} {
		if got := tax(run(cashDay3, cashDay3, method)); got != 4000 {
			t.Errorf("%s over %s..%s: %s = %d, want 4000 (the sales receipt's tax on its date)", method, cashDay3, cashDay3, agencyTotal, got)
		}
	}
}
