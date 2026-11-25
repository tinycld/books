package books

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/nathanstitt/omnidoc/pkg/xlsx"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The 1099 Summary and Detail (1099 report spec §3, §4; plan D7, D9): the
// payment rows of 1099 vendors on Cost of goods sold, Expense and Other
// expense accounts, by payment date, one row per vendor, one row per box under
// it, the payments under a box, and the Total; the columns Reportable,
// Excluded and All payments; the Show, Form, Vendor and Order choices; and
// the threshold header line. Every book is a f1099Book and every run is the
// Books reader's, with a fixed day.

// f1099Today is the reader's day in every run unless a test sets one.
const f1099Today = "2026-11-21"

// f1099Day is the day f1099Pay posts on: inside f1099October.
const f1099Day = "2026-10-15"

// The period most tests run: October 2026.
var f1099October = ebvPeriod("2026-10-01", "2026-10-31")

// f1099Book is newEBVBook's book (newAPBook's book with the expense guards and
// the expense poster bound: plan D9 names newAPBook, whose book cannot post an
// expense) with the accounts plan D9 lists, their boxes set by bound writes:
// an Expense account on NEC 1, one on MISC 1, a Cost of goods sold account on
// NEC 1, an Other expense account on MISC 2, an Expense account on MISC 10 and
// an Expense account with no box. card is the book's credit card account,
// 2100 Company Card. The threshold is 2,000.00.
type f1099Book struct {
	ebvBook
	nec, misc1, cogsNec, misc2, misc10, noBox *core.Record
	card                                      *core.Record
}

func new1099Book(t *testing.T) f1099Book {
	t.Helper()
	b := newEBVBook(t)
	app := b.app
	f := f1099Book{
		ebvBook: b,
		nec:     mkNumberedAccount(t, app, "Contract Labor", "6410", "expense", "contractors"),
		misc1:   mkNumberedAccount(t, app, "Studio Rent", "6420", "expense", "rent_lease"),
		cogsNec: mkNumberedAccount(t, app, "Subcontracted Labor", "5410", "cost_of_goods_sold", "cost_of_labor"),
		misc2:   mkNumberedAccount(t, app, "Royalties Paid", "8410", "other_expense", "other_misc_expense"),
		misc10:  mkNumberedAccount(t, app, "Settlements Through Counsel", "6430", "expense", "legal_professional"),
		noBox:   mkNumberedAccount(t, app, "Team Meals", "6440", "expense", "meals"),
		card:    b.card2100,
	}
	f.setBox(t, f.nec, "nec_1")
	f.setBox(t, f.misc1, "misc_1")
	f.setBox(t, f.cogsNec, "nec_1")
	f.setBox(t, f.misc2, "misc_2")
	f.setBox(t, f.misc10, "misc_10")
	saveSettings(t, app, map[string]any{"threshold_1099": 200000})
	return f
}

// setBox gives account the 1099 box box ("" for none).
func (b f1099Book) setBox(t *testing.T, account *core.Record, box string) {
	t.Helper()
	if err := setFields(t, b.app, "books_accounts", account.Id, map[string]any{"form_1099_box": box}); err != nil {
		t.Fatalf("give %s the box %q: %v", account.GetString("name"), box, err)
	}
}

// f1099Vendor saves an active vendor named name with Track payments for 1099 on.
func f1099Vendor(t *testing.T, b f1099Book, name string) *core.Record {
	t.Helper()
	v := apVendor(t, b.apBook, name)
	if err := setFields(t, b.app, "books_vendors", v.Id, map[string]any{"track_1099": true}); err != nil {
		t.Fatalf("track %s for 1099: %v", name, err)
	}
	return reload(t, b.app, "books_vendors", v.Id)
}

// The kinds of payment document f1099Pay posts.
const (
	f1099Expense      = "expense"
	f1099BillPayment  = "bill payment"
	f1099VendorRefund = "vendor refund"
)

// f1099Pay posts one payment of cents to vendor on account, dated f1099Day,
// with the payment method method from paidFrom: an expense with one account
// line; a bill payment that pays the whole of a bill with one account line;
// or a vendor refund of the whole of a vendor credit with one account line,
// refunded to paidFrom. It returns the payment document as stored.
func f1099Pay(t *testing.T, b f1099Book, kind string, vendor, account *core.Record, cents int64, method string, paidFrom *core.Record) *core.Record {
	t.Helper()
	switch kind {
	case f1099Expense:
		exp := b.mkExpense(t, map[string]any{
			"vendor": vendor.Id, "date": f1099Day, "payment_method": method, "paid_from": paidFrom.Id,
		})
		mkExpenseLine(t, b.app, exp, 0, accountLine(account, cents))
		return mustPostExpense(t, b.app, exp.Id, b.users.bookkeeper.Id)
	case f1099BillPayment:
		bill := b.postBill(t, vendor, f1099Day, billAmount{account, cents})
		return b.pay(t, vendor, map[string]any{"date": f1099Day, "payment_method": method, "paid_from": paidFrom.Id},
			payLine{bill, cents})
	case f1099VendorRefund:
		credit := b.postedCredit(t, vendor, f1099Day, billAmount{account, cents})
		return b.refund(t, map[string]any{
			"vendor": vendor.Id, "date": f1099Day, "payment_method": method, "refunded_to": paidFrom.Id,
		}, refundLine{credit, cents})
	}
	t.Fatalf("f1099Pay: no payment kind %q", kind)
	return nil
}

// run1099Err runs the shipped 1099 Summary and Detail as reader, as core's run
// endpoint does: Load, then Run with the posted params, the reader's headers
// and, unless opts sets one, the day f1099Today.
func run1099Err(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) (*reports.Result, error) {
	t.Helper()
	shipped := form1099Shipped()
	spec, info, err := reports.Load(shipped.Spec)
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
		opts.Today = f1099Today
	}
	return reports.Run(context.Background(), app, reports.Request{
		Spec: spec, Loaded: info, Params: given, Options: opts, Auth: reader,
		Headers: readerInfo(reader).Headers, Live: shipped.Live,
	})
}

// run1099 runs the report as b's reader on f1099Today with no expansion state.
func run1099(t *testing.T, b f1099Book, params map[string]any) *reports.Result {
	t.Helper()
	return run1099Opts(t, b, params, reports.Options{})
}

func run1099Opts(t *testing.T, b f1099Book, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	res, err := run1099Err(t, b.app, b.reader, params, opts)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// run1099All runs the report with every vendor and every box opened.
func run1099All(t *testing.T, b f1099Book, params map[string]any) *reports.Result {
	t.Helper()
	return run1099Opts(t, b, params, reports.Options{ExpandAll: true})
}

// with is params with the values of more over them.
func with(params map[string]any, more map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range params {
		out[k] = v
	}
	for k, v := range more {
		out[k] = v
	}
	return out
}

// octoberAll is October with Show = All 1099 vendors, so no threshold hides a
// vendor.
var octoberAll = map[string]any{"period": f1099October, "show": "tracked"}

// f1099VendorRow is the vendor row (level 1) of vendor.
func f1099VendorRow(t *testing.T, res *reports.Result, vendor *core.Record) reports.Row {
	t.Helper()
	r, ok := cbGroupRow(res, 1, vendor.Id)
	if !ok {
		t.Fatalf("no vendor row for %s; rows %q", vendor.GetString("display_name"), bsLabels(res))
	}
	return r
}

func f1099HasVendor(res *reports.Result, vendor *core.Record) bool {
	_, ok := cbGroupRow(res, 1, vendor.Id)
	return ok
}

// f1099VendorRows are the vendor rows (level 1), in result order.
func f1099VendorRows(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup && r.Level == 1 {
			out = append(out, r)
		}
	}
	return out
}

// f1099BoxKeyOf is the box a box row stands for: the second value of its key,
// "" for Not reported.
func f1099BoxKeyOf(r reports.Row) string {
	if len(r.GroupKey) < 2 {
		return ""
	}
	key, _ := r.GroupKey[1].(string)
	return key
}

// f1099BoxRows are vendor's box rows (level 2), in result order.
func f1099BoxRows(res *reports.Result, vendor *core.Record) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind != reports.KindGroup || r.Level != 2 || len(r.GroupKey) < 1 {
			continue
		}
		if own, _ := r.GroupKey[0].(string); own == vendor.Id {
			out = append(out, r)
		}
	}
	return out
}

func f1099BoxKeys(res *reports.Result, vendor *core.Record) []string {
	out := []string{}
	for _, r := range f1099BoxRows(res, vendor) {
		out = append(out, f1099BoxKeyOf(r))
	}
	return out
}

// f1099BoxRow is vendor's box row of box ("" for Not reported).
func f1099BoxRow(t *testing.T, res *reports.Result, vendor *core.Record, box string) reports.Row {
	t.Helper()
	for _, r := range f1099BoxRows(res, vendor) {
		if f1099BoxKeyOf(r) == box {
			return r
		}
	}
	t.Fatalf("%s has no box row %q; rows %q", vendor.GetString("display_name"), box, bsLabels(res))
	return reports.Row{}
}

// f1099Total is the one Total row.
func f1099Total(t *testing.T, res *reports.Result) reports.Row {
	t.Helper()
	return totalOf(t, res)
}

// f1099Figs are a row's Reportable, Excluded and All payments; Excluded 0
// stands for a blank cell.
type f1099Figs struct {
	Reportable, Excluded, All int64
}

// f1099FigsOf reads a row's three figures. Reportable and All payments must
// hold an amount; Excluded is blank when zero (spec §3, D7), so an Excluded
// cell of 0 fails the test.
func f1099FigsOf(t *testing.T, r reports.Row) f1099Figs {
	t.Helper()
	exc, ok := moneyCell(t, r, "excluded")
	if ok && exc == 0 {
		t.Errorf("%s (%s) Excluded = 0, want a blank cell when zero", r.Label, r.Kind)
	}
	return f1099Figs{Reportable: amt(t, r, "reportable"), Excluded: exc, All: amt(t, r, "all")}
}

func requireF1099Figs(t *testing.T, what string, r reports.Row, want f1099Figs) {
	t.Helper()
	if got := f1099FigsOf(t, r); got != want {
		t.Errorf("%s (%q, %s): Reportable, Excluded, All payments = %+v, want %+v", what, r.Label, r.Kind, got, want)
	}
}

// f1099Line is what a test reads of a payment row: its day (the label's first
// part) and its All payments.
type f1099Line struct {
	Day string
	All int64
}

// f1099Payments are the payment rows under vendor's row in an opened run, in
// result order.
func f1099Payments(t *testing.T, res *reports.Result, vendor *core.Record) []f1099Line {
	t.Helper()
	row := f1099VendorRow(t, res, vendor)
	at := slices.IndexFunc(res.Rows, func(r reports.Row) bool { return r.ID == row.ID })
	out := []f1099Line{}
	for _, r := range res.Rows[at+1:] {
		if r.Kind == reports.KindTotal || (r.Kind == reports.KindGroup && r.Level == 1) {
			break
		}
		if r.Kind != reports.KindDetail {
			continue
		}
		day, _, _ := strings.Cut(r.Label, " · ")
		out = append(out, f1099Line{Day: day, All: amt(t, r, "all")})
	}
	return out
}

func requireF1099Line(t *testing.T, what string, lines []f1099Line, want f1099Line) {
	t.Helper()
	if !slices.Contains(lines, want) {
		t.Errorf("%s: no payment row %+v; payment rows %+v", what, want, lines)
	}
}

// requireOnlyTotal fails unless the run shows no row: core always gives the
// Total row, and the view shows its empty text when no other row is there.
func requireOnlyTotal(t *testing.T, what string, res *reports.Result) {
	t.Helper()
	if len(res.Rows) != 1 || res.Rows[0].Kind != reports.KindTotal {
		t.Fatalf("%s: rows %q, want the Total row only", what, bsLabels(res))
	}
	total := res.Rows[0]
	for _, col := range []string{"reportable", "all"} {
		if v, ok := moneyCell(t, total, col); ok && v != 0 {
			t.Errorf("%s: the Total's %s = %d, want 0 or blank", what, col, v)
		}
	}
	if v := total.Cells["excluded"]; v != nil {
		t.Errorf("%s: the Total's Excluded = %#v, want blank", what, v)
	}
}

// f1099SpecFile is server/testdata/form_1099_spec.json, which
// tests/report-1099-fixture.test.ts and tests/form-1099.test.ts read too.
type f1099SpecFile struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Params      json.RawMessage `json:"params"`
	Display     json.RawMessage `json:"display"`
	BoxLabels   []struct {
		Key   string `json:"key"`
		Label string `json:"label"`
	} `json:"boxLabels"`
	NotReported string `json:"notReported"`
	EmptyFrom   string `json:"emptyFrom"`
	EmptyTo     string `json:"emptyTo"`
}

func readF1099SpecFile(t *testing.T) f1099SpecFile {
	t.Helper()
	raw, err := os.ReadFile("testdata/form_1099_spec.json")
	if err != nil {
		t.Fatalf("read testdata/form_1099_spec.json: %v", err)
	}
	var file f1099SpecFile
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("parse testdata/form_1099_spec.json: %v", err)
	}
	return file
}

// The Show and Form choices' labels, as the header lines print them.
var (
	f1099ShowLabels = map[string]string{
		"meets":     "At or above the threshold",
		"below":     "Below the threshold",
		"tracked":   "All 1099 vendors",
		"untracked": "Not tracked for 1099",
	}
	f1099FormLabels = map[string]string{"all": "NEC and MISC", "nec": "1099-NEC", "misc": "1099-MISC"}
	f1099Shows      = []string{"meets", "below", "tracked", "untracked"}
)

const f1099Description = "Payments to each 1099 vendor by box for a calendar year, without card payments, against your 1099 threshold."

func TestForm1099SpecLoads(t *testing.T) {
	b := new1099Book(t)
	if err := reports.CheckSources(b.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}

	shipped := form1099Shipped()
	if form1099Key != "books.form_1099" || shipped.Key != form1099Key {
		t.Errorf("key = %q (const %q), want books.form_1099", shipped.Key, form1099Key)
	}
	if shipped.Title != "1099 Summary and Detail" {
		t.Errorf("title = %q, want 1099 Summary and Detail", shipped.Title)
	}
	if shipped.Description != f1099Description {
		t.Errorf("description = %q, want %q", shipped.Description, f1099Description)
	}
	if shipped.Revision != 2 || !shipped.Unpublished || shipped.Live {
		t.Errorf("revision %d, unpublished %v, live %v; want revision 1, shipped unpublished, not live",
			shipped.Revision, shipped.Unpublished, shipped.Live)
	}
	if !jsonEqual(t, shipped.Spec, string(mustJSON(form1099Spec()))) {
		t.Errorf("the shipped spec is not form1099Spec()")
	}

	spec, _, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.Source != "books.basis_lines" {
		t.Errorf("source = %q, want books.basis_lines", spec.Source)
	}
	if err := reports.Validate(b.app, spec); err != nil {
		t.Fatalf("Validate: %v", err)
	}

	paramIDs := make([]string, len(spec.Params))
	for i, p := range spec.Params {
		paramIDs[i] = p.ID
	}
	if !reflect.DeepEqual(paramIDs, []string{"period", "show", "form", "vendors", "order"}) {
		t.Fatalf("params = %v, want period, show, form, vendors, order", paramIDs)
	}
	period := paramOf(t, spec, "period")
	if period.Type != reports.ParamDateRange || period.Label != "Period" || !jsonEqual(t, period.Default, `{"preset":"thisCalendarYear"}`) {
		t.Errorf("period = %+v (default %s), want Period, default This calendar year", period, period.Default)
	}
	show := paramOf(t, spec, "show")
	wantShow := []reports.Option{
		{Value: "meets", Label: "At or above the threshold"}, {Value: "below", Label: "Below the threshold"},
		{Value: "tracked", Label: "All 1099 vendors"}, {Value: "untracked", Label: "Not tracked for 1099"},
	}
	if show.Type != reports.ParamChoice || show.Label != "Show" || show.Multiple || show.Header != "Vendors: {label}" ||
		!reflect.DeepEqual(show.Options, wantShow) || !jsonEqual(t, show.Default, `"meets"`) {
		t.Errorf("show = %+v (default %s), want a single choice Show with the four choices, default meets, header \"Vendors: {label}\"", show, show.Default)
	}
	form := paramOf(t, spec, "form")
	wantForm := []reports.Option{{Value: "all", Label: "NEC and MISC"}, {Value: "nec", Label: "1099-NEC"}, {Value: "misc", Label: "1099-MISC"}}
	if form.Type != reports.ParamChoice || form.Label != "Form" || form.Multiple || form.Header != "Form: {label}" ||
		!reflect.DeepEqual(form.Options, wantForm) || !jsonEqual(t, form.Default, `"all"`) {
		t.Errorf("form = %+v (default %s), want a single choice Form: NEC and MISC (default), 1099-NEC, 1099-MISC, header \"Form: {label}\"", form, form.Default)
	}
	if got, want := mustJSON(paramOf(t, spec, "vendors")), mustJSON(vendorsParam()); string(got) != string(want) {
		t.Errorf("the vendors param = %s, want vendorsParam() %s", got, want)
	}
	order := paramOf(t, spec, "order")
	wantOrder := []reports.Option{{Value: "name", Label: "Name"}, {Value: "amount", Label: "Largest reportable"}}
	if order.Type != reports.ParamChoice || order.Label != "Order" || order.Multiple || order.OptionsFrom != nil ||
		!reflect.DeepEqual(order.Options, wantOrder) || !jsonEqual(t, order.Default, `"name"`) {
		t.Errorf("order = %+v (default %s), want a single choice Order: Name (default), Largest reportable", order, order.Default)
	}

	// The threshold header line (core E2), its value the settings lookup.
	if len(spec.Header) != 1 {
		t.Fatalf("header = %+v, want one line", spec.Header)
	}
	if spec.Header[0].Text != "1099 threshold: {value}" {
		t.Errorf("header line text = %q, want \"1099 threshold: {value}\"", spec.Header[0].Text)
	}
	if got, want := mustJSON(spec.Header[0].Value), mustJSON(thresholdLookup()); string(got) != string(want) {
		t.Errorf("header line value = %s, want thresholdLookup() %s", got, want)
	}

	// The shown columns in order, then the hidden ones (D7).
	var shown []string
	hidden := map[string]reports.Column{}
	columns := map[string]reports.Column{}
	for _, c := range spec.Columns {
		columns[c.ID] = c
		if c.Hidden {
			hidden[c.ID] = c
			continue
		}
		shown = append(shown, c.ID+" "+c.Label)
	}
	if want := []string{"name Vendor", "reportable Reportable", "excluded Excluded", "all All payments"}; !reflect.DeepEqual(shown, want) {
		t.Errorf("shown columns = %q, want %q", shown, want)
	}
	var hiddenIDs []string
	for id := range hidden {
		hiddenIDs = append(hiddenIDs, id)
	}
	slices.Sort(hiddenIDs)
	if want := []string{"boxKey", "excludedSum", "vendorKey"}; !reflect.DeepEqual(hiddenIDs, want) {
		t.Errorf("hidden columns = %v, want %v", hiddenIDs, want)
	}
	if c := columns["excludedSum"]; !c.Hidden || c.Total != reports.TotalRows {
		t.Errorf("excludedSum = hidden %v, total %q; want a hidden column with total \"rows\"", c.Hidden, c.Total)
	}
	for _, id := range []string{"reportable", "all"} {
		if c := columns[id]; c.Total != reports.TotalRows {
			t.Errorf("%s total = %q, want \"rows\" (the Total adds the shown vendors)", id, c.Total)
		}
	}
	excluded := columns["excluded"]
	if excluded.Total != "" || excluded.Aggregate != "" {
		t.Errorf("excluded = total %q, aggregate %q; want neither (D7: never a recompute sum of its own)", excluded.Total, excluded.Aggregate)
	}
	if got, want := mustJSON(excluded.Formula), mustJSON(blankZero(&reports.Node{Col: "excludedSum"})); string(got) != string(want) {
		t.Errorf("excluded formula = %s, want blankZero of {col: excludedSum} %s", got, want)
	}

	// A hidden column has no display entry (core refuses one).
	if spec.Display == nil {
		t.Fatal("the spec has no display block")
	}
	for id := range spec.Display.Columns {
		if _, ok := hidden[id]; ok {
			t.Errorf("display.columns names the hidden column %s", id)
		}
	}
	for _, layout := range spec.Display.Layouts {
		for _, cell := range layout.Cells {
			if _, ok := hidden[cell.Col]; ok {
				t.Errorf("a display layout names the hidden column %s", cell.Col)
			}
		}
	}

	gotOpen := make([]string, len(spec.Groups))
	for i, g := range spec.Groups {
		gotOpen[i] = fmt.Sprintf("%s %s open=%v", g.ID, g.Col, g.Open)
	}
	if want := []string{"byVendor vendorKey open=true", "byBox boxKey open=false"}; !reflect.DeepEqual(gotOpen, want) {
		t.Errorf("groups = %q, want %q", gotOpen, want)
	}
	if spec.Detail == nil || spec.Detail.Open == nil {
		t.Errorf("detail = %+v, want an open path", spec.Detail)
	} else if got, want := mustJSON(spec.Detail.Open), mustJSON(entryOpenPath()); string(got) != string(want) {
		t.Errorf("detail.open = %s\nwant entryOpenPath() %s", got, want)
	}
	requireNoDrift(t, b.app)
}

func TestForm1099MatchesSharedSpecFile(t *testing.T) {
	file := readF1099SpecFile(t)
	shipped := form1099Shipped()
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
		t.Errorf("params =\n%s\nwant testdata/form_1099_spec.json params\n%s", got, file.Params)
	}
	if got := mustJSON(spec.Display); !jsonEqual(t, got, string(file.Display)) {
		t.Errorf("display =\n%s\nwant testdata/form_1099_spec.json display\n%s", got, file.Display)
	}

	// D6: one table of box labels, in the order of boxes1099.
	var keys []string
	for _, entry := range file.BoxLabels {
		keys = append(keys, entry.Key)
		if got := box1099Labels[entry.Key]; got != entry.Label {
			t.Errorf("box1099Labels[%q] = %q, want the case file's %q", entry.Key, got, entry.Label)
		}
	}
	if !slices.Equal(keys, boxes1099) {
		t.Errorf("the case file's boxLabels keys = %v, want boxes1099 %v in order", keys, boxes1099)
	}
	labelKeys := make([]string, 0, len(box1099Labels))
	for key := range box1099Labels {
		labelKeys = append(labelKeys, key)
	}
	slices.Sort(labelKeys)
	wantKeys := slices.Clone(boxes1099)
	slices.Sort(wantKeys)
	if !slices.Equal(labelKeys, wantKeys) {
		t.Errorf("box1099Labels keys = %v, want exactly the keys of boxes1099 %v", labelKeys, wantKeys)
	}
	if file.NotReported != "Not reported" {
		t.Errorf("notReported = %q, want \"Not reported\"", file.NotReported)
	}
	// The box level's label writes each label of the case file, and Not
	// reported for a blank box.
	labelCase := string(mustJSON(box1099LabelCase(&reports.Node{Col: "boxKey"})))
	for _, text := range append([]string{file.NotReported}, func() []string {
		out := []string{}
		for _, entry := range file.BoxLabels {
			out = append(out, entry.Label)
		}
		return out
	}()...) {
		if !strings.Contains(labelCase, string(mustJSON(text))) {
			t.Errorf("box1099LabelCase writes no %q: %s", text, labelCase)
		}
	}
	if file.EmptyFrom != "2020-01-01" || file.EmptyTo != "2020-01-31" {
		t.Errorf("emptyFrom %q, emptyTo %q; want 2020-01-01 and 2020-01-31", file.EmptyFrom, file.EmptyTo)
	}
}

func TestForm1099WhatCounts(t *testing.T) {
	b := new1099Book(t)

	// An expense by check counts on its date; Cost of goods sold and Other
	// expense count; the vendor's name on an asset, a liability, an equity or
	// an income line adds nothing; an expense after the period adds nothing.
	counted := f1099Vendor(t, b, "Counted Co")
	b.postExpense(t, counted, "2026-10-05", billAmount{b.nec, 10000})
	b.postExpense(t, counted, "2026-10-06", billAmount{b.cogsNec, 7000})
	b.postExpense(t, counted, "2026-10-07", billAmount{b.misc2, 3000})
	b.postEntry(t, "2026-10-08", counted, b.asset, 50000)
	postJournal(t, b.app, "", "2026-10-09", "Named lines off the expense accounts",
		jnLine{account: b.loan, credit: 1000, position: 0, vendor: counted.Id},
		jnLine{account: b.equity, debit: 400, position: 1, vendor: counted.Id},
		jnLine{account: b.revenue, debit: 600, position: 2, vendor: counted.Id})
	b.postExpense(t, counted, "2026-11-01", billAmount{b.nec, 8800})
	// A line with no vendor adds nothing.
	b.postExpense(t, nil, "2026-10-10", billAmount{b.nec, 9900})

	// A draft and a void expense and a void bill payment add nothing.
	voids := f1099Vendor(t, b, "Void Documents Co")
	b.postExpense(t, voids, "2026-10-05", billAmount{b.nec, 1000})
	draft := b.mkExpense(t, map[string]any{"vendor": voids.Id, "date": "2026-10-06"})
	mkExpenseLine(t, b.app, draft, 0, accountLine(b.nec, 55500))
	voided := b.postExpense(t, voids, "2026-10-07", billAmount{b.nec, 20000})
	if err := voidExpenseAs(b.app, voided.Id, b.users.admin.Id); err != nil {
		t.Fatalf("void the expense: %v", err)
	}
	unpaid := b.postBill(t, voids, "2026-10-08", billAmount{b.nec, 30000})
	payment := b.payOn(t, voids, "2026-10-09", payLine{unpaid, 30000})
	if err := voidBillPaymentAs(b.app, payment.Id, b.users.admin.Id); err != nil {
		t.Fatalf("void the bill payment: %v", err)
	}

	// A bill counts only as far as it is paid, in the year it is paid.
	twoYears := f1099Vendor(t, b, "Two Years Co")
	bill := b.postBill(t, twoYears, "2025-11-10", billAmount{b.nec, 100000})
	year2025 := with(octoberAll, map[string]any{"period": ebvPeriod("2025-01-01", "2025-12-31")})
	year2026 := with(octoberAll, map[string]any{"period": ebvPeriod("2026-01-01", "2026-12-31")})
	if res := run1099(t, b, year2025); f1099HasVendor(res, twoYears) {
		t.Errorf("2025 before any payment: Two Years Co has a row; an unpaid bill counts nothing; rows %q", bsLabels(res))
	}
	b.payOn(t, twoYears, "2025-12-15", payLine{bill, 40000})
	b.payOn(t, twoYears, "2026-01-20", payLine{reload(t, b.app, "books_bills", bill.Id), 60000})

	// A bill paid in part by a vendor credit: the paid shares on the payment's
	// and the application's dates, and the credit's applied share below zero
	// on the application's date.
	credited := f1099Vendor(t, b, "Credit Applied Co")
	creditedBill := b.postBill(t, credited, "2026-10-01", billAmount{b.nec, 50000})
	credit := b.postedCredit(t, credited, "2026-10-02", billAmount{b.nec, 20000})
	apApply(t, b.apBook, credit, reload(t, b.app, "books_bills", creditedBill.Id), "2026-10-10", 20000)
	b.payOn(t, credited, "2026-10-12", payLine{reload(t, b.app, "books_bills", creditedBill.Id), 30000})

	// A vendor refund's share is below zero on the refund's date.
	refunded := f1099Vendor(t, b, "Refunded Co")
	refundedCredit := b.postedCredit(t, refunded, "2026-10-03", billAmount{b.nec, 15000})
	apRefund(t, b.apBook, refunded, "2026-10-14", map[string]int{refundedCredit.Id: 15000})

	res := run1099All(t, b, octoberAll)
	requireF1099Figs(t, "Counted Co", f1099VendorRow(t, res, counted), f1099Figs{Reportable: 20000, All: 20000})
	countedLines := f1099Payments(t, res, counted)
	for _, want := range []f1099Line{{"2026-10-05", 10000}, {"2026-10-06", 7000}, {"2026-10-07", 3000}} {
		requireF1099Line(t, "Counted Co", countedLines, want)
	}
	if len(countedLines) != 3 {
		t.Errorf("Counted Co has the payment rows %+v, want its three expense lines only", countedLines)
	}
	requireF1099Figs(t, "Void Documents Co: the posted expense only", f1099VendorRow(t, res, voids), f1099Figs{Reportable: 1000, All: 1000})
	if f1099HasVendor(res, twoYears) {
		t.Errorf("October 2026: Two Years Co has a row; its payments are dated 2025-12-15 and 2026-01-20")
	}
	requireF1099Figs(t, "Credit Applied Co", f1099VendorRow(t, res, credited), f1099Figs{Reportable: 30000, All: 30000})
	creditedLines := f1099Payments(t, res, credited)
	requireF1099Line(t, "the share the vendor credit paid", creditedLines, f1099Line{"2026-10-10", 20000})
	requireF1099Line(t, "the credit's applied share", creditedLines, f1099Line{"2026-10-10", -20000})
	requireF1099Line(t, "the share the bill payment paid", creditedLines, f1099Line{"2026-10-12", 30000})
	if len(creditedLines) != 3 {
		t.Errorf("Credit Applied Co has the payment rows %+v, want the three shares only (no bill or credit line of its own)", creditedLines)
	}
	requireF1099Figs(t, "Refunded Co", f1099VendorRow(t, res, refunded), f1099Figs{Reportable: -15000, All: -15000})
	if lines := f1099Payments(t, res, refunded); !reflect.DeepEqual(lines, []f1099Line{{"2026-10-14", -15000}}) {
		t.Errorf("Refunded Co has the payment rows %+v, want the refund's share below zero on 2026-10-14 only", lines)
	}
	if bsHas(res, "No vendor") {
		t.Errorf("a No vendor row shows; a payment with no vendor adds nothing; rows %q", bsLabels(res))
	}
	var sum int64
	for _, r := range f1099VendorRows(res) {
		sum += amt(t, r, "all")
	}
	if got := amt(t, f1099Total(t, res), "all"); got != sum || got != 20000+1000+30000-15000 {
		t.Errorf("Total All payments = %d, want the vendor rows' %d (36000)", got, sum)
	}

	requireF1099Figs(t, "Two Years Co in 2025", f1099VendorRow(t, run1099(t, b, year2025), twoYears), f1099Figs{Reportable: 40000, All: 40000})
	requireF1099Figs(t, "Two Years Co in 2026", f1099VendorRow(t, run1099(t, b, year2026), twoYears), f1099Figs{Reportable: 60000, All: 60000})

	// Under Not tracked for 1099 the tracking term does not drop the line with
	// no vendor (its vendor is not tracked either), so only the vendor term
	// keeps it out: the rows and the Total are the untracked vendor's alone.
	untracked := apVendor(t, b.apBook, "Untracked Named Co")
	b.postExpense(t, untracked, "2026-10-11", billAmount{b.nec, 4400})
	notTracked := run1099All(t, b, with(octoberAll, map[string]any{"show": "untracked"}))
	if bsHas(notTracked, "No vendor") {
		t.Errorf("Not tracked for 1099: a No vendor row shows; a payment with no vendor adds nothing; rows %q", bsLabels(notTracked))
	}
	vendorRows := f1099VendorRows(notTracked)
	if got := labelsOf(vendorRows); !slices.Equal(got, []string{"Untracked Named Co"}) {
		t.Errorf("Not tracked for 1099: vendor rows %q, want Untracked Named Co only; rows %q", got, bsLabels(notTracked))
	}
	for _, r := range vendorRows {
		if own, _ := r.GroupKey[0].(string); own == "" {
			t.Errorf("Not tracked for 1099: a vendor row %q has no vendor", r.Label)
		}
	}
	requireF1099Figs(t, "Not tracked for 1099: the Total, the untracked vendor's only", f1099Total(t, notTracked),
		f1099Figs{Reportable: 4400, All: 4400})
	requireNoDrift(t, b.app)
}

func TestForm1099JournalEntryLines(t *testing.T) {
	b := new1099Book(t)
	named := f1099Vendor(t, b, "Journal Named Co")
	b.postEntry(t, "2026-10-08", named, b.nec, 50000)

	before := run1099All(t, b, octoberAll)
	requireF1099Figs(t, "the journal entry line", f1099VendorRow(t, before, named), f1099Figs{Reportable: 50000, All: 50000})
	if lines := f1099Payments(t, before, named); !reflect.DeepEqual(lines, []f1099Line{{"2026-10-08", 50000}}) {
		t.Errorf("payment rows %+v, want the journal entry line on the entry's date", lines)
	}
	if keys := f1099BoxKeys(before, named); !slices.Equal(keys, []string{"nec_1"}) {
		t.Errorf("box rows %v, want nec_1", keys)
	}

	// An entry that moves 200.00 from the NEC 1 account to the MISC 1 account
	// for the vendor moves it between the box rows.
	postJournal(t, b.app, "", "2026-10-20", "Move to studio rent",
		jnLine{account: b.nec, credit: 20000, position: 0, vendor: named.Id},
		jnLine{account: b.misc1, debit: 20000, position: 1, vendor: named.Id})
	after := run1099All(t, b, octoberAll)
	requireF1099Figs(t, "the vendor after the move", f1099VendorRow(t, after, named), f1099Figs{Reportable: 50000, All: 50000})
	requireF1099Figs(t, "NEC 1 after the move", f1099BoxRow(t, after, named, "nec_1"), f1099Figs{Reportable: 30000, All: 30000})
	requireF1099Figs(t, "MISC 1 after the move", f1099BoxRow(t, after, named, "misc_1"), f1099Figs{Reportable: 20000, All: 20000})
	requireNoDrift(t, b.app)
}

func TestForm1099Boxes(t *testing.T) {
	file := readF1099SpecFile(t)
	labels := map[string]string{"": file.NotReported}
	for _, entry := range file.BoxLabels {
		labels[entry.Key] = entry.Label
	}
	b := new1099Book(t)
	three := f1099Vendor(t, b, "Three Boxes Co")
	b.postExpense(t, three, "2026-10-05", billAmount{b.nec, 1000})
	b.postExpense(t, three, "2026-10-06", billAmount{b.misc1, 2000})
	b.postExpense(t, three, "2026-10-07", billAmount{b.noBox, 3000})
	b.postExpense(t, three, "2025-10-07", billAmount{b.misc1, 4000})

	requireBoxes := func(what string, res *reports.Result, vendor *core.Record, keys []string, alls []int64) {
		t.Helper()
		rows := f1099BoxRows(res, vendor)
		var gotKeys, gotLabels, wantLabels []string
		var gotAlls []int64
		for _, r := range rows {
			gotKeys = append(gotKeys, f1099BoxKeyOf(r))
			gotLabels = append(gotLabels, r.Label)
			gotAlls = append(gotAlls, amt(t, r, "all"))
		}
		for _, k := range keys {
			wantLabels = append(wantLabels, labels[k])
		}
		if !slices.Equal(gotKeys, keys) || !slices.Equal(gotLabels, wantLabels) || !slices.Equal(gotAlls, alls) {
			t.Errorf("%s: box rows %q %q %v, want %q %q %v", what, gotKeys, gotLabels, gotAlls, keys, wantLabels, alls)
		}
	}

	requireBoxes("NEC 1, MISC 1 and no box", run1099(t, b, octoberAll), three,
		[]string{"nec_1", "misc_1", ""}, []int64{1000, 2000, 3000})

	// A change of an account's box moves its payments of every year.
	b.setBox(t, b.misc1, "misc_10")
	if labels["misc_10"] != "MISC 10 · Gross proceeds paid to an attorney" {
		t.Errorf("the case file labels misc_10 %q", labels["misc_10"])
	}
	requireBoxes("this year after the move to MISC 10", run1099(t, b, octoberAll), three,
		[]string{"nec_1", "misc_10", ""}, []int64{1000, 2000, 3000})
	lastYear := with(octoberAll, map[string]any{"period": ebvPeriod("2025-01-01", "2025-12-31")})
	requireBoxes("last year after the move to MISC 10", run1099(t, b, lastYear), three,
		[]string{"misc_10"}, []int64{4000})

	// The box list's order, not the keys' text order ("misc_10" < "misc_2").
	twoMisc := f1099Vendor(t, b, "Two Misc Co")
	b.postExpense(t, twoMisc, "2026-10-08", billAmount{b.misc10, 500})
	b.postExpense(t, twoMisc, "2026-10-09", billAmount{b.misc2, 600})
	requireBoxes("MISC 2 and MISC 10", run1099(t, b, octoberAll), twoMisc,
		[]string{"misc_2", "misc_10"}, []int64{600, 500})
	requireNoDrift(t, b.app)
}

func TestForm1099Columns(t *testing.T) {
	b := new1099Book(t)
	mixed := f1099Vendor(t, b, "Mixed Payments Co")
	b.postExpense(t, mixed, f1099Day, billAmount{b.nec, 10000})
	f1099Pay(t, b, f1099Expense, mixed, b.nec, 4000, "credit_card", b.bank)
	b.postExpense(t, mixed, f1099Day, billAmount{b.noBox, 2500})
	checkOnly := f1099Vendor(t, b, "Check Only Co")
	b.postExpense(t, checkOnly, f1099Day, billAmount{b.nec, 8000})

	res := run1099All(t, b, with(octoberAll, map[string]any{"vendors": []string{mixed.Id}}))
	requireF1099Figs(t, "the vendor", f1099VendorRow(t, res, mixed), f1099Figs{Reportable: 10000, Excluded: 6500, All: 16500})
	requireF1099Figs(t, "NEC 1", f1099BoxRow(t, res, mixed, "nec_1"), f1099Figs{Reportable: 10000, Excluded: 4000, All: 14000})
	requireF1099Figs(t, "Not reported", f1099BoxRow(t, res, mixed, ""), f1099Figs{Reportable: 0, Excluded: 2500, All: 2500})
	requireF1099Figs(t, "the Total, the vendor's card payment held", f1099Total(t, res), f1099Figs{Reportable: 10000, Excluded: 6500, All: 16500})
	for _, r := range res.Rows {
		if f := f1099FigsOf(t, r); f.Reportable+f.Excluded != f.All {
			t.Errorf("%s (%s): Reportable %d + Excluded %d != All payments %d", r.Label, r.Kind, f.Reportable, f.Excluded, f.All)
		}
	}

	// D7: with no excluded amount, Excluded is a blank cell (nil, not 0) on
	// the payment row, the box row, the vendor row and the Total row.
	alone := run1099All(t, b, with(octoberAll, map[string]any{"vendors": []string{checkOnly.Id}}))
	kinds := map[string]bool{}
	for _, r := range alone.Rows {
		kind := r.Kind
		if r.Kind == reports.KindGroup {
			kind = fmt.Sprintf("group %d", r.Level)
		}
		kinds[kind] = true
		if v := r.Cells["excluded"]; v != nil {
			t.Errorf("Check Only Co alone: %s (%s) Excluded = %#v, want a blank (nil) cell", r.Label, kind, v)
		}
		if got := amt(t, r, "reportable"); got != 8000 {
			t.Errorf("Check Only Co alone: %s (%s) Reportable = %d, want 8000", r.Label, kind, got)
		}
	}
	for _, kind := range []string{reports.KindDetail, "group 2", "group 1", reports.KindTotal} {
		if !kinds[kind] {
			t.Errorf("Check Only Co alone has no %s row; rows %q", kind, bsLabels(alone))
		}
	}

	ids := make([]string, len(res.Columns))
	for i, c := range res.Columns {
		ids[i] = c.ID
	}
	if !reflect.DeepEqual(ids, []string{"name", "reportable", "excluded", "all"}) {
		t.Errorf("result columns = %v, want name, reportable, excluded, all", ids)
	}
	for _, r := range res.Rows {
		for _, col := range []string{"excludedSum", "vendorKey", "boxKey"} {
			if v, ok := r.Cells[col]; ok {
				t.Errorf("%s (%s) carries a %s cell %#v; a hidden column is in no cell", r.Label, r.Kind, col, v)
			}
		}
	}
	requireNoDrift(t, b.app)
}

func TestForm1099TotalAddsShownVendors(t *testing.T) {
	b := new1099Book(t)
	big := f1099Vendor(t, b, "Big Co")
	small := f1099Vendor(t, b, "Small Co")
	b.postExpense(t, big, f1099Day, billAmount{b.nec, 250000})
	b.postExpense(t, small, f1099Day, billAmount{b.nec, 150000})
	f1099Pay(t, b, f1099Expense, small, b.nec, 30000, "credit_card", b.bank)

	cases := []struct {
		show  string
		shown []*core.Record
		total f1099Figs
	}{
		// The hidden Small Co's 300.00 is not added: a blank Excluded.
		{"meets", []*core.Record{big}, f1099Figs{Reportable: 250000, All: 250000}},
		{"below", []*core.Record{small}, f1099Figs{Reportable: 150000, Excluded: 30000, All: 180000}},
		{"tracked", []*core.Record{big, small}, f1099Figs{Reportable: 400000, Excluded: 30000, All: 430000}},
	}
	for _, c := range cases {
		res := run1099(t, b, map[string]any{"period": f1099October, "show": c.show})
		var want, got []string
		for _, v := range c.shown {
			want = append(want, v.GetString("display_name"))
		}
		got = labelsOf(f1099VendorRows(res))
		if !slices.Equal(got, want) {
			t.Errorf("show = %s: vendor rows %q, want %q", c.show, got, want)
		}
		requireF1099Figs(t, "show = "+c.show+": the Total", f1099Total(t, res), c.total)
	}
	requireNoDrift(t, b.app)
}

func TestForm1099Threshold(t *testing.T) {
	b := new1099Book(t)
	at := f1099Vendor(t, b, "At Threshold Co")
	b.postExpense(t, at, f1099Day, billAmount{b.nec, 200000})
	centBelow := f1099Vendor(t, b, "Cent Below Co")
	b.postExpense(t, centBelow, f1099Day, billAmount{b.nec, 199999})
	refundOnly := f1099Vendor(t, b, "Refund Only Co")
	credit := b.postedCredit(t, refundOnly, "2026-10-02", billAmount{b.nec, 5000})
	apRefund(t, b.apBook, refundOnly, "2026-10-14", map[string]int{credit.Id: 5000})
	across := f1099Vendor(t, b, "Across Boxes Co")
	b.postExpense(t, across, f1099Day, billAmount{b.nec, 120000}, billAmount{b.misc1, 90000})
	cardHelped := f1099Vendor(t, b, "Card Helped Co")
	b.postExpense(t, cardHelped, f1099Day, billAmount{b.nec, 150000})
	f1099Pay(t, b, f1099Expense, cardHelped, b.nec, 100000, "credit_card", b.bank)

	meets := run1099(t, b, map[string]any{"period": f1099October, "show": "meets"})
	below := run1099(t, b, map[string]any{"period": f1099October, "show": "below"})
	in := func(what string, res *reports.Result, vendor *core.Record, want bool) {
		t.Helper()
		if got := f1099HasVendor(res, vendor); got != want {
			t.Errorf("%s: %s has a row = %v, want %v; rows %q", what, vendor.GetString("display_name"), got, want, bsLabels(res))
		}
	}
	in("At or above", meets, at, true)
	in("Below", below, at, false)
	in("At or above", meets, centBelow, false)
	in("Below", below, centBelow, true)
	in("At or above", meets, refundOnly, false)
	in("Below", below, refundOnly, true)
	in("At or above: 1,200.00 on NEC 1 and 900.00 on MISC 1", meets, across, true)
	in("Below", below, across, false)
	in("At or above: the card payment does not count", meets, cardHelped, false)
	in("Below", below, cardHelped, true)

	picked := run1099(t, b, map[string]any{"period": f1099October, "vendors": []string{across.Id, at.Id}})
	wantLines := []string{
		"Vendors: At or above the threshold", "Form: NEC and MISC",
		"Vendor: Across Boxes Co, At Threshold Co", "1099 threshold: $2,000.00",
	}
	if !reflect.DeepEqual(picked.HeaderLines, wantLines) {
		t.Errorf("header lines = %q, want %q", picked.HeaderLines, wantLines)
	}

	saveSettings(t, b.app, map[string]any{"threshold_1099": 300000})
	raised := run1099(t, b, map[string]any{"period": f1099October, "show": "meets"})
	in("At or above 3,000.00", raised, across, false)
	in("Below 3,000.00", run1099(t, b, map[string]any{"period": f1099October, "show": "below"}), across, true)
	if n := len(raised.HeaderLines); n == 0 || raised.HeaderLines[n-1] != "1099 threshold: $3,000.00" {
		t.Errorf("header lines after the threshold change = %q, want the last \"1099 threshold: $3,000.00\"", raised.HeaderLines)
	}
	requireNoDrift(t, b.app)
}

func TestForm1099Show(t *testing.T) {
	b := new1099Book(t)
	untracked := apVendor(t, b.apBook, "Untracked Co")
	b.postExpense(t, untracked, f1099Day, billAmount{b.nec, 250000})
	tracked := f1099Vendor(t, b, "Tracked Co")
	b.postExpense(t, tracked, f1099Day, billAmount{b.nec, 250000})

	for _, show := range f1099Shows {
		res := run1099(t, b, map[string]any{"period": f1099October, "show": show})
		if got, want := f1099HasVendor(res, untracked), show == "untracked"; got != want {
			t.Errorf("show = %s: the untracked vendor has a row = %v, want %v; rows %q", show, got, want, bsLabels(res))
		}
		if got, want := f1099HasVendor(res, tracked), show == "meets" || show == "tracked"; got != want {
			t.Errorf("show = %s: the tracked vendor at 2,500.00 has a row = %v, want %v; rows %q", show, got, want, bsLabels(res))
		}
		if want := "Vendors: " + f1099ShowLabels[show]; len(res.HeaderLines) == 0 || res.HeaderLines[0] != want {
			t.Errorf("show = %s: header lines %q, want the first %q", show, res.HeaderLines, want)
		}
	}
	requireNoDrift(t, b.app)
}

func TestForm1099Form(t *testing.T) {
	b := new1099Book(t)
	both := f1099Vendor(t, b, "Both Forms Co")
	b.postExpense(t, both, f1099Day, billAmount{b.nec, 120000}, billAmount{b.misc1, 90000}, billAmount{b.noBox, 5000})

	formRun := func(show, form string) *reports.Result {
		t.Helper()
		params := map[string]any{"period": f1099October, "show": show}
		if form != "" {
			params["form"] = form
		}
		return run1099(t, b, params)
	}
	requireForm := func(what string, res *reports.Result, form string) {
		t.Helper()
		if want := "Form: " + f1099FormLabels[form]; len(res.HeaderLines) < 2 || res.HeaderLines[1] != want {
			t.Errorf("%s: header lines %q, want the second %q", what, res.HeaderLines, want)
		}
	}

	if all := formRun("meets", ""); !f1099HasVendor(all, both) {
		t.Errorf("NEC and MISC: Both Forms Co (2,100.00 reportable) is not at or above; rows %q", bsLabels(all))
	} else {
		requireForm("the default Form", all, "all")
	}

	necBelow := formRun("below", "nec")
	if keys := f1099BoxKeys(necBelow, both); !slices.Equal(keys, []string{"nec_1"}) {
		t.Errorf("1099-NEC: box rows %q, want NEC 1 only (no MISC 1, no Not reported)", keys)
	}
	requireF1099Figs(t, "1099-NEC, Below", f1099VendorRow(t, necBelow, both), f1099Figs{Reportable: 120000, All: 120000})
	requireForm("1099-NEC", necBelow, "nec")
	if necMeets := formRun("meets", "nec"); f1099HasVendor(necMeets, both) {
		t.Errorf("1099-NEC: Both Forms Co (1,200.00 NEC) is at or above the threshold; rows %q", bsLabels(necMeets))
	}

	misc := formRun("tracked", "misc")
	if keys := f1099BoxKeys(misc, both); !slices.Equal(keys, []string{"misc_1"}) {
		t.Errorf("1099-MISC: box rows %q, want MISC 1 only (no NEC 1, no Not reported)", keys)
	}
	requireF1099Figs(t, "1099-MISC", f1099VendorRow(t, misc, both), f1099Figs{Reportable: 90000, All: 90000})
	requireForm("1099-MISC", misc, "misc")
	requireNoDrift(t, b.app)
}

// TestForm1099FormBoxSets pins the Form filter's box sets by the boxes' names,
// not by their places in boxes1099: 1099-MISC is every misc_ box and never
// nec_1; 1099-NEC is nec_1 alone.
func TestForm1099FormBoxSets(t *testing.T) {
	b := new1099Book(t)
	vendor := f1099Vendor(t, b, "Every Box Co")
	var lines []billAmount
	var miscKeys []string
	var miscCents, necCents int64
	for i, box := range boxes1099 {
		account := mkNumberedAccount(t, b.app, "Box account "+box, fmt.Sprintf("67%02d", i), "expense", "contractors")
		b.setBox(t, account, box)
		cents := int64(1000 + 100*i)
		lines = append(lines, billAmount{account, cents})
		switch {
		case strings.HasPrefix(box, "misc_"):
			miscKeys = append(miscKeys, box)
			miscCents += cents
		case box == "nec_1":
			necCents += cents
		default:
			t.Fatalf("box %q is neither nec_1 nor a misc_ box", box)
		}
	}
	if len(miscKeys) != 9 || necCents == 0 {
		t.Fatalf("boxes1099 %v: want nec_1 and the nine MISC boxes", boxes1099)
	}
	b.postExpense(t, vendor, f1099Day, lines...)

	run := func(form string) *reports.Result {
		t.Helper()
		return run1099(t, b, map[string]any{"period": f1099October, "show": "tracked", "form": form, "vendors": []string{vendor.Id}})
	}
	misc := run("misc")
	if keys := f1099BoxKeys(misc, vendor); !slices.Equal(keys, miscKeys) {
		t.Errorf("1099-MISC: box rows %q, want every MISC box %q and no nec_1", keys, miscKeys)
	}
	requireF1099Figs(t, "1099-MISC", f1099VendorRow(t, misc, vendor), f1099Figs{Reportable: miscCents, All: miscCents})

	nec := run("nec")
	if keys := f1099BoxKeys(nec, vendor); !slices.Equal(keys, []string{"nec_1"}) {
		t.Errorf("1099-NEC: box rows %q, want nec_1 only", keys)
	}
	requireF1099Figs(t, "1099-NEC", f1099VendorRow(t, nec, vendor), f1099Figs{Reportable: necCents, All: necCents})
	requireNoDrift(t, b.app)
}

func TestForm1099VendorsParam(t *testing.T) {
	b := new1099Book(t)
	aspen := f1099Vendor(t, b, "Aspen Supply")
	birch := f1099Vendor(t, b, "Birch Supply")
	cedar := f1099Vendor(t, b, "Cedar Supply")
	b.postExpense(t, aspen, f1099Day, billAmount{b.nec, 10000})
	b.postExpense(t, birch, f1099Day, billAmount{b.nec, 30000})
	b.postExpense(t, cedar, f1099Day, billAmount{b.nec, 40000})

	res := run1099(t, b, with(octoberAll, map[string]any{"vendors": []string{aspen.Id, birch.Id}}))
	if got, want := labelsOf(f1099VendorRows(res)), []string{"Aspen Supply", "Birch Supply"}; !reflect.DeepEqual(got, want) {
		t.Errorf("two vendors picked: vendor rows %q, want %q", got, want)
	}
	requireF1099Figs(t, "the Total of the two picks", f1099Total(t, res), f1099Figs{Reportable: 40000, All: 40000})
	if len(res.HeaderLines) != 4 || res.HeaderLines[2] != "Vendor: Aspen Supply, Birch Supply" {
		t.Errorf("header lines = %q, want the third \"Vendor: Aspen Supply, Birch Supply\"", res.HeaderLines)
	}

	unset := run1099(t, b, octoberAll)
	if len(unset.HeaderLines) != 4 || unset.HeaderLines[2] != "" {
		t.Errorf("no vendor picked: header lines = %q, want four with a blank third (Vendor) line", unset.HeaderLines)
	}
	if got := len(f1099VendorRows(unset)); got != 3 {
		t.Errorf("no vendor picked: %d vendor rows (%q), want the three", got, bsLabels(unset))
	}
	requireNoDrift(t, b.app)
}

func TestForm1099Order(t *testing.T) {
	b := new1099Book(t)
	// alpha and gamma tie at 10.00 reportable; Beta is the largest; delta has
	// the largest All payments but the least Reportable (a card payment).
	gamma := f1099Vendor(t, b, "gamma")
	b.postExpense(t, gamma, f1099Day, billAmount{b.nec, 1000})
	beta := f1099Vendor(t, b, "Beta")
	b.postExpense(t, beta, f1099Day, billAmount{b.noBox, 200}, billAmount{b.misc1, 500}, billAmount{b.nec, 3000})
	alpha := f1099Vendor(t, b, "alpha")
	b.postExpense(t, alpha, f1099Day, billAmount{b.nec, 1000})
	delta := f1099Vendor(t, b, "delta")
	b.postExpense(t, delta, f1099Day, billAmount{b.nec, 500})
	f1099Pay(t, b, f1099Expense, delta, b.nec, 9000, "debit_card", b.bank)

	byName := run1099(t, b, with(octoberAll, map[string]any{"order": "name"}))
	if got, want := labelsOf(f1099VendorRows(byName)), []string{"alpha", "Beta", "delta", "gamma"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = name: vendor rows %q, want %q (name order ignoring case)", got, want)
	}
	if byDefault := run1099(t, b, octoberAll); !reflect.DeepEqual(bsLabels(byDefault), bsLabels(byName)) {
		t.Errorf("no Order param gives %q, want Name's %q", bsLabels(byDefault), bsLabels(byName))
	}
	byAmount := run1099(t, b, with(octoberAll, map[string]any{"order": "amount"}))
	if got, want := labelsOf(f1099VendorRows(byAmount)), []string{"Beta", "alpha", "gamma", "delta"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = amount: vendor rows %q, want %q (Reportable descending, ties by name)", got, want)
	}
	for name, res := range map[string]*reports.Result{"name": byName, "amount": byAmount} {
		if keys := f1099BoxKeys(res, beta); !slices.Equal(keys, []string{"nec_1", "misc_1", ""}) {
			t.Errorf("order = %s: Beta's box rows %q, want the box order NEC 1, MISC 1, Not reported", name, keys)
		}
	}
	requireNoDrift(t, b.app)
}

func TestForm1099VendorLabel(t *testing.T) {
	b := new1099Book(t)
	closed := f1099Vendor(t, b, "Old Shop")
	legal := f1099Vendor(t, b, "Rivera Design")
	cased := f1099Vendor(t, b, "Case Co")
	blank := f1099Vendor(t, b, "Blank Co")
	for _, v := range []*core.Record{closed, legal, cased, blank} {
		b.postExpense(t, v, f1099Day, billAmount{b.nec, 1000})
	}
	// The line guard refuses a new line for an inactive vendor, so the vendor
	// is made inactive after its payment.
	for v, fields := range map[*core.Record]map[string]any{
		closed: {"inactive": true, "legal_name": "Old Shop Holdings LLC"},
		legal:  {"legal_name": "Ana Rivera"},
		cased:  {"legal_name": "CASE CO"},
	} {
		if err := setFields(t, b.app, "books_vendors", v.Id, fields); err != nil {
			t.Fatalf("save %s %v: %v", v.GetString("display_name"), fields, err)
		}
	}

	res := run1099(t, b, octoberAll)
	cases := []struct {
		vendor *core.Record
		label  string
		muted  bool
	}{
		{closed, "Old Shop (inactive) (legal name: Old Shop Holdings LLC)", true},
		{legal, "Rivera Design (legal name: Ana Rivera)", false},
		{cased, "Case Co", false},
		{blank, "Blank Co", false},
	}
	for _, c := range cases {
		r := f1099VendorRow(t, res, c.vendor)
		if r.Label != c.label || r.Muted != c.muted {
			t.Errorf("label %q muted %v, want %q muted %v", r.Label, r.Muted, c.label, c.muted)
		}
	}
	if f1099Total(t, res).Muted {
		t.Errorf("the Total row is muted, want never")
	}
	requireNoDrift(t, b.app)
}

func TestForm1099NoRowWithoutPayments(t *testing.T) {
	b := new1099Book(t)
	paid := f1099Vendor(t, b, "Paid Co")
	b.postExpense(t, paid, f1099Day, billAmount{b.nec, 250000})
	idle := f1099Vendor(t, b, "Idle Co")
	september := f1099Vendor(t, b, "September Co")
	b.postExpense(t, september, "2026-09-15", billAmount{b.nec, 250000})
	idleUntracked := apVendor(t, b.apBook, "Idle Untracked Co")

	for _, show := range f1099Shows {
		res := run1099(t, b, map[string]any{"period": f1099October, "show": show})
		for _, v := range []*core.Record{idle, september, idleUntracked} {
			if f1099HasVendor(res, v) {
				t.Errorf("show = %s: %s has a row with no payment in October; rows %q", show, v.GetString("display_name"), bsLabels(res))
			}
		}
	}
	if res := run1099(t, b, octoberAll); !f1099HasVendor(res, paid) {
		t.Errorf("Paid Co has no row; rows %q", bsLabels(res))
	}
	requireNoDrift(t, b.app)
}

func TestForm1099Levels(t *testing.T) {
	b := new1099Book(t)
	v := f1099Vendor(t, b, "Two Boxes Co")
	b.postExpense(t, v, f1099Day, billAmount{b.nec, 1000}, billAmount{b.misc1, 2000})

	res := run1099(t, b, octoberAll)
	if r := f1099VendorRow(t, res, v); !r.Expanded {
		t.Errorf("the vendor row is closed, want open with no expansion state sent")
	}
	boxes := f1099BoxRows(res, v)
	if len(boxes) != 2 {
		t.Fatalf("box rows %q, want NEC 1 and MISC 1 shown under the open vendor", labelsOf(boxes))
	}
	for _, r := range boxes {
		if r.Expanded {
			t.Errorf("box row %q is open, want closed", r.Label)
		}
	}
	totals := 0
	for i, r := range res.Rows {
		switch r.Kind {
		case reports.KindDetail:
			t.Errorf("row %q is a payment row; the box rows are closed", r.Label)
		case reports.KindTotal:
			totals++
			if i != len(res.Rows)-1 {
				t.Errorf("the Total row is row %d of %d, want the last", i+1, len(res.Rows))
			}
		}
	}
	if totals != 1 {
		t.Errorf("the report has %d Total rows, want exactly 1", totals)
	}
	requireNoDrift(t, b.app)
}

func TestForm1099CalendarYear(t *testing.T) {
	b := new1099Book(t)
	saveSettings(t, b.app, map[string]any{"fiscal_year_start_month": 7})
	v := f1099Vendor(t, b, "Calendar Co")
	b.postExpense(t, v, "2026-02-10", billAmount{b.nec, 1000})
	b.postExpense(t, v, "2025-12-31", billAmount{b.nec, 2000})

	period := func(res *reports.Result) (string, string) {
		for _, p := range res.Params {
			if p.ID == "period" {
				return p.From, p.To
			}
		}
		t.Fatalf("the result has no period param: %+v", res.Params)
		return "", ""
	}
	byDefault, err := run1099Err(t, b.app, b.reader, map[string]any{"show": "tracked"}, reports.Options{Today: "2026-11-21"})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if from, to := period(byDefault); from != "2026-01-01" || to != "2026-12-31" {
		t.Errorf("the default period = %s to %s, want the calendar year 2026-01-01 to 2026-12-31 (the fiscal year starts in July)", from, to)
	}
	requireF1099Figs(t, "the default period: 2026-02-10 only", f1099VendorRow(t, byDefault, v), f1099Figs{Reportable: 1000, All: 1000})

	last := run1099(t, b, map[string]any{"period": map[string]any{"preset": "lastCalendarYear"}, "show": "tracked"})
	if from, to := period(last); from != "2025-01-01" || to != "2025-12-31" {
		t.Errorf("Last calendar year = %s to %s, want 2025-01-01 to 2025-12-31", from, to)
	}
	requireF1099Figs(t, "Last calendar year: 2025-12-31 only", f1099VendorRow(t, last, v), f1099Figs{Reportable: 2000, All: 2000})
	requireNoDrift(t, b.app)
}

// f1099ByAccount adds, for each vendor row of an opened run, its detail rows'
// col by account: the third part of a row's label ("<date> · <type> <number>
// · <account> · …", expenseDetailLabel), which both reports write. Zero sums
// are left out.
func f1099ByAccount(t *testing.T, res *reports.Result, col string) map[string]map[string]int64 {
	t.Helper()
	out := map[string]map[string]int64{}
	vendor := ""
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup && r.Level == 1 {
			vendor, _ = r.GroupKey[0].(string)
			continue
		}
		if r.Kind != reports.KindDetail || vendor == "" {
			continue
		}
		parts := strings.Split(r.Label, " · ")
		if len(parts) < 3 {
			t.Fatalf("detail row %q has no account part", r.Label)
		}
		v, _ := moneyCell(t, r, col)
		if out[vendor] == nil {
			out[vendor] = map[string]int64{}
		}
		out[vendor][parts[2]] += v
	}
	for vendor, accounts := range out {
		for account, sum := range accounts {
			if sum == 0 {
				delete(accounts, account)
			}
		}
		if len(accounts) == 0 {
			delete(out, vendor)
		}
	}
	return out
}

func TestForm1099TiesOutToExpensesByVendorOnCash(t *testing.T) {
	b := new1099Book(t)
	period := ebvPeriod("2026-09-01", "2026-11-30")

	tracked := f1099Vendor(t, b, "Tie Tracked Co")
	b.postExpense(t, tracked, "2026-10-05", billAmount{b.nec, 10000}, billAmount{b.noBox, 500})
	f1099Pay(t, b, f1099Expense, tracked, b.misc1, 4000, "credit_card", b.bank)
	f1099Pay(t, b, f1099Expense, tracked, b.nec, 3000, "check", b.card)
	bill := b.postBill(t, tracked, "2026-09-20", billAmount{b.nec, 70000}, billAmount{b.cogsNec, 30000})
	b.payOn(t, tracked, "2026-10-03", payLine{bill, 40000})
	b.payOn(t, tracked, "2026-11-05", payLine{reload(t, b.app, "books_bills", bill.Id), 60000})
	f1099Pay(t, b, f1099BillPayment, tracked, b.misc2, 2500, "credit_card", b.bank)
	credit := b.postedCredit(t, tracked, "2026-10-02", billAmount{b.nec, 6000})
	applied := b.postBill(t, tracked, "2026-10-04", billAmount{b.misc10, 9000})
	apApply(t, b.apBook, credit, reload(t, b.app, "books_bills", applied.Id), "2026-10-11", 6000)
	f1099Pay(t, b, f1099VendorRefund, tracked, b.nec, 1500, "", b.bank)
	b.postEntry(t, "2026-10-12", tracked, b.nec, 800)
	postJournal(t, b.app, "", "2026-10-13", "Move to studio rent",
		jnLine{account: b.nec, credit: 200, position: 0, vendor: tracked.Id},
		jnLine{account: b.misc1, debit: 200, position: 1, vendor: tracked.Id})
	voided := b.postExpense(t, tracked, "2026-10-16", billAmount{b.nec, 7700})
	if err := voidExpenseAs(b.app, voided.Id, b.users.admin.Id); err != nil {
		t.Fatalf("void the expense: %v", err)
	}

	untracked := apVendor(t, b.apBook, "Tie Untracked Co")
	b.postExpense(t, untracked, "2026-10-06", billAmount{b.nec, 2000})
	part := b.postBill(t, untracked, "2026-10-07", billAmount{b.misc1, 5000})
	b.payOn(t, untracked, "2026-10-20", payLine{part, 2000})

	report := f1099ByAccount(t, run1099All(t, b, map[string]any{"period": period, "show": "tracked"}), "all")
	for vendor, accounts := range f1099ByAccount(t, run1099All(t, b, map[string]any{"period": period, "show": "untracked"}), "all") {
		report[vendor] = accounts
	}
	ebvRes, err := runEBVErr(t, b.app, b.reader, map[string]any{"period": period, "method": "cash"}, reports.Options{ExpandAll: true, Today: f1099Today})
	if err != nil {
		t.Fatalf("the Expenses by Vendor run: %v", err)
	}
	ebv := f1099ByAccount(t, ebvRes, "amount")
	for _, v := range []*core.Record{tracked, untracked} {
		if len(report[v.Id]) == 0 {
			t.Fatalf("%s has no payment rows in the report", v.GetString("display_name"))
		}
		if !reflect.DeepEqual(report[v.Id], ebv[v.Id]) {
			t.Errorf("%s by account: the report's payment rows %v, want the Expenses by Vendor on Cash %v",
				v.GetString("display_name"), report[v.Id], ebv[v.Id])
		}
	}

	all := run1099(t, b, map[string]any{"period": period, "show": "tracked"})
	notTracked := run1099(t, b, map[string]any{"period": period, "show": "untracked"})
	ebvClosed := runEBV(t, b.app, b.reader, map[string]any{"period": period, "method": "cash"}, reports.Options{Today: f1099Today})
	if got, want := amt(t, f1099VendorRow(t, all, tracked), "all"), ebvAmount(t, ebvClosed, tracked); got != want {
		t.Errorf("Tie Tracked Co: All payments %d, want its Expenses by Vendor Total on Cash %d", got, want)
	}
	if got, want := amt(t, f1099VendorRow(t, notTracked, untracked), "all"), ebvAmount(t, ebvClosed, untracked); got != want {
		t.Errorf("Tie Untracked Co: All payments %d, want its Expenses by Vendor Total on Cash %d", got, want)
	}
	requireNoDrift(t, b.app)
}

func TestForm1099NoTaxID(t *testing.T) {
	b := new1099Book(t)
	v := f1099Vendor(t, b, "Taxed Co")
	if err := setFields(t, b.app, "books_vendors", v.Id, map[string]any{"tax_id_type": "ssn", "tax_id": "987654321"}); err != nil {
		t.Fatalf("save the tax ID: %v", err)
	}
	if got := reload(t, b.app, "books_vendors", v.Id).GetString("tax_id"); got != "987-65-4321" {
		t.Fatalf("the stored tax ID = %q, want 987-65-4321", got)
	}
	b.postExpense(t, v, f1099Day, billAmount{b.nec, 1000})

	if spec := string(form1099Shipped().Spec); strings.Contains(spec, "tax_id") {
		t.Errorf("the spec JSON reads tax_id: %s", spec)
	}
	res := run1099All(t, b, octoberAll)
	if !f1099HasVendor(res, v) {
		t.Fatalf("Taxed Co has no row; rows %q", bsLabels(res))
	}
	digits := []string{"987654321", "987-65-4321", "4321"}
	texts := append([]string{}, res.HeaderLines...)
	for _, r := range res.Rows {
		texts = append(texts, r.Label)
		for _, cell := range r.Cells {
			if s, ok := cell.(string); ok {
				texts = append(texts, s)
			}
		}
	}
	for _, text := range texts {
		for _, d := range digits {
			if strings.Contains(text, d) {
				t.Errorf("the run holds %q in %q", d, text)
			}
		}
	}
	requireNoDrift(t, b.app)
}

func TestForm1099Empty(t *testing.T) {
	b := new1099Book(t)
	v := f1099Vendor(t, b, "Below Only Co")
	b.postExpense(t, v, "2026-10-05", billAmount{b.nec, 100000})
	if !f1099HasVendor(run1099(t, b, octoberAll), v) {
		t.Fatal("October has no row for Below Only Co: the book must hold a payment")
	}
	requireOnlyTotal(t, "2020-01-01 to 2020-01-31", run1099(t, b, with(octoberAll, map[string]any{"period": ebvPeriod("2020-01-01", "2020-01-31")})))
	requireOnlyTotal(t, "the default run, every vendor below the threshold", run1099(t, b, nil))

	untrackedOnly := new1099Book(t)
	u := apVendor(t, untrackedOnly.apBook, "Untracked Only Co")
	untrackedOnly.postExpense(t, u, "2026-10-05", billAmount{untrackedOnly.nec, 500000})
	for _, show := range []string{"meets", "below", "tracked"} {
		requireOnlyTotal(t, "no tracked vendor, show = "+show, run1099(t, untrackedOnly, map[string]any{"period": f1099October, "show": show}))
	}
	if res := run1099(t, untrackedOnly, map[string]any{"period": f1099October, "show": "untracked"}); !f1099HasVendor(res, u) {
		t.Errorf("Not tracked for 1099 has no row for the untracked vendor; rows %q", bsLabels(res))
	}
	requireNoDrift(t, b.app)
}

func TestForm1099NoAccess(t *testing.T) {
	b := new1099Book(t)
	v := f1099Vendor(t, b, "Seen Co")
	b.postExpense(t, v, f1099Day, billAmount{b.nec, 250000})
	if !f1099HasVendor(run1099(t, b, octoberAll), v) {
		t.Fatal("the Books reader does not see Seen Co")
	}
	res, err := run1099Err(t, b.app, b.none, octoberAll, reports.Options{})
	if err != nil {
		t.Fatalf("the run of a user with Books level none was refused (%v); core runs it with the rule's rows", err)
	}
	if rows := f1099VendorRows(res); len(rows) != 0 {
		t.Errorf("a user with Books level none sees vendor rows %q", labelsOf(rows))
	}
	if n := len(res.HeaderLines); n == 0 || res.HeaderLines[n-1] != "" {
		t.Errorf("a user with Books level none: header lines %q, want the threshold line ''", res.HeaderLines)
	}
	requireNoDrift(t, b.app)
}

// Register ships the 1099 Summary and Detail; core creates it unpublished,
// and Books shares it with every Books reader.
func TestForm1099ShippedShared(t *testing.T) {
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
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": "books.form_1099"})
	if err != nil {
		t.Fatalf("no reports row with shipped_key books.form_1099: %v", err)
	}
	if row.GetBool("published") || row.GetString("published_by") != "" {
		t.Errorf("published = %v (by %q), want unpublished", row.GetBool("published"), row.GetString("published_by"))
	}
	if row.GetString("title") != "1099 Summary and Detail" || row.GetInt("shipped_revision") != 2 || row.GetString("source") != "books.basis_lines" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a guest with Books readonly access")
	requireNoShare(t, app, row, outsider, "a guest without Books access")
	requireNoDrift(t, app)
}

// The opened box (report-1099 checkpoint 3): its payment rows, their labels,
// order, cells and documents, the exports and the spec's sha.

// f1099CardSuffix ends the label of a card payment's row (spec §3, Q17).
const f1099CardSuffix = " · paid by card"

// f1099PaymentRows runs params with the boxes closed, then with vendor's box
// box ("" for Not reported) opened by its key, as the view asks when a reader
// presses the box row, and gives the opened run's box row and the payment rows
// under it, in result order.
func f1099PaymentRows(t *testing.T, b f1099Book, params map[string]any, vendor *core.Record, box string) (reports.Row, []reports.Row) {
	t.Helper()
	closed := run1099(t, b, params)
	key := f1099BoxRow(t, closed, vendor, box).GroupKey
	if lines := ebvLinesUnder(t, closed, f1099BoxRow(t, closed, vendor, box)); len(lines) != 0 {
		t.Fatalf("the box %q of %s is open before a press; rows %q", box, vendor.GetString("display_name"), bsLabels(closed))
	}
	res := run1099Opts(t, b, params, reports.Options{Expand: [][]any{key}, Collapse: [][]any{}})
	row := f1099BoxRow(t, res, vendor, box)
	return row, ebvLinesUnder(t, res, row)
}

// f1099LabelsOf reads payment rows as label and All payments.
func f1099LabelsOf(t *testing.T, rows []reports.Row) []ebvLine {
	t.Helper()
	out := make([]ebvLine, len(rows))
	for i, r := range rows {
		out[i] = ebvLine{Label: r.Label, Amount: amt(t, r, "all")}
	}
	return out
}

// f1099ContractLabor is the label of the book's NEC 1 Expense account.
const f1099ContractLabor = "6410 Contract Labor"

func TestForm1099PaymentLabels(t *testing.T) {
	b := new1099Book(t)
	if got := ebvAccountText(t, b.app, b.nec.Id); got != f1099ContractLabor {
		t.Fatalf("the NEC 1 account reads %q, want %s", got, f1099ContractLabor)
	}
	v := f1099Vendor(t, b, "Label Co")
	day := f1099Day + " · "
	on := " · " + f1099ContractLabor

	// Expenses: by check (with a memo), by credit card, by debit card, and by
	// check from the credit card account.
	draft := b.mkExpense(t, map[string]any{
		"vendor": v.Id, "date": f1099Day, "payment_method": "check", "paid_from": b.bank.Id, "memo": "Design retainer",
	})
	mkExpenseLine(t, b.app, draft, 0, accountLine(b.nec, 10000))
	check := mustPostExpense(t, b.app, draft.Id, b.users.bookkeeper.Id)
	if desc := balanceLineDesc(t, b.app, entryLineOn(t, b.app, check.GetString("entry"), b.nec)); desc != "Design retainer" {
		t.Fatalf("the check expense's line has the description %q, want Design retainer", desc)
	}
	credit := f1099Pay(t, b, f1099Expense, v, b.nec, 2000, "credit_card", b.bank)
	debit := f1099Pay(t, b, f1099Expense, v, b.nec, 3000, "debit_card", b.bank)
	fromCard := f1099Pay(t, b, f1099Expense, v, b.nec, 4000, "check", b.card)

	// Bill payments by check and by card.
	checkBill := b.postBill(t, v, f1099Day, billAmount{b.nec, 5000})
	checkPay := b.pay(t, v, map[string]any{"date": f1099Day, "payment_method": "check", "paid_from": b.bank.Id}, payLine{checkBill, 5000})
	cardBill := b.postBill(t, v, f1099Day, billAmount{b.nec, 6000})
	cardPay := b.pay(t, v, map[string]any{"date": f1099Day, "payment_method": "credit_card", "paid_from": b.bank.Id}, payLine{cardBill, 6000})

	// A vendor credit applied to a bill.
	applied := b.postedCredit(t, v, f1099Day, billAmount{b.nec, 1500})
	appliedBill := b.postBill(t, v, f1099Day, billAmount{b.nec, 7000})
	apApply(t, b.apBook, applied, reload(t, b.app, "books_bills", appliedBill.Id), f1099Day, 1500)

	// Vendor refunds: to the bank account by check, and to the credit card account.
	refunded := b.postedCredit(t, v, f1099Day, billAmount{b.nec, 1200})
	refund := b.refund(t, map[string]any{
		"vendor": v.Id, "date": f1099Day, "payment_method": "check", "refunded_to": b.bank.Id,
	}, refundLine{refunded, 1200})
	cardRefunded := b.postedCredit(t, v, f1099Day, billAmount{b.nec, 800})
	cardRefund := b.refund(t, map[string]any{
		"vendor": v.Id, "date": f1099Day, "payment_method": "check", "refunded_to": b.card.Id,
	}, refundLine{cardRefunded, 800})

	// A journal entry line: never a card payment.
	manual := b.postEntry(t, f1099Day, v, b.nec, 900)
	manualLine := ebvLedgerLine(t, b.app, entryLineOn(t, b.app, manual.Id, b.nec), "Journal entry "+ebvEntryNumber(t, b.app, manual.Id))
	if prefix := day + "Journal entry " + ebvEntryNumber(t, b.app, manual.Id) + on; !strings.HasPrefix(manualLine.Label, prefix) {
		t.Fatalf("the wanted journal entry label %q does not start %q", manualLine.Label, prefix)
	}

	no := func(doc *core.Record) string { return apNo(t, b.apBook, doc) }
	want := []ebvLine{
		{day + "Expense " + no(check) + on + " · Design retainer", 10000},
		{day + "Expense " + no(credit) + on + f1099CardSuffix, 2000},
		{day + "Expense " + no(debit) + on + f1099CardSuffix, 3000},
		{day + "Expense " + no(fromCard) + on + f1099CardSuffix, 4000},
		{day + "Bill payment " + no(checkPay) + on + " · Bill " + no(checkBill) + " paid (cash basis)", 5000},
		{day + "Bill payment " + no(cardPay) + on + " · Bill " + no(cardBill) + " paid (cash basis)" + f1099CardSuffix, 6000},
		// Plan D2: the two rows of a vendor credit's application.
		{day + "Vendor credit " + no(applied) + on + " · Bill " + no(appliedBill) + " paid by vendor credit (cash basis)", 1500},
		{day + "Vendor credit " + no(applied) + on + " · Vendor credit " + no(applied) + " applied (cash basis)", -1500},
		{day + "Vendor refund " + no(refund) + on + " · Vendor credit " + no(refunded) + " refunded (cash basis)", -1200},
		{day + "Vendor refund " + no(cardRefund) + on + " · Vendor credit " + no(cardRefunded) + " refunded (cash basis)" + f1099CardSuffix, -800},
		manualLine,
	}
	if strings.HasSuffix(manualLine.Label, f1099CardSuffix) {
		t.Fatalf("the wanted journal entry label %q ends with the card suffix", manualLine.Label)
	}

	_, rows := f1099PaymentRows(t, b, octoberAll, v, "nec_1")
	got := f1099LabelsOf(t, rows)
	byLabel := func(x, y ebvLine) int { return strings.Compare(x.Label, y.Label) }
	slices.SortFunc(got, byLabel)
	slices.SortFunc(want, byLabel)
	requireEBVLines(t, "Label Co's opened NEC 1 box", got, want)
	requireNoDrift(t, b.app)
}

func TestForm1099PaymentOrder(t *testing.T) {
	b := new1099Book(t)
	v := f1099Vendor(t, b, "Order Co")
	line := func(id string, cents, position int) jnLine {
		return jnLine{id: id, account: b.nec, debit: cents, position: position, vendor: v.Id}
	}
	bank := func(cents, position int) jnLine { return jnLine{account: b.bank, credit: cents, position: position} }

	// The last day, posted earliest: the date decides before the posting time.
	late := postJournal(t, b.app, "", "2026-10-07", "Late day", line("f99ord000000001", 100, 0), bank(100, 1))
	setPostedAt(t, b.app, late.Id, "2026-11-12 08:00:00.000Z")
	// Two entries on one day: posting order decides (the ids sort the other way).
	madeFirst := postJournal(t, b.app, "", "2026-10-05", "Same day, made first", line("f99same00000001", 200, 0), bank(200, 1))
	madeSecond := postJournal(t, b.app, "", "2026-10-05", "Same day, made second", line("f99same99999999", 300, 0), bank(300, 1))
	setPostedAt(t, b.app, madeFirst.Id, "2026-11-12 11:00:00.000Z")
	setPostedAt(t, b.app, madeSecond.Id, "2026-11-12 10:00:00.000Z")
	// Two lines of one entry: position decides (the ids sort the other way).
	split := postJournal(t, b.app, "", "2026-10-03", "Split",
		line("f99pos000000001", 400, 1), line("f99pos999999999", 500, 0), bank(900, 2))
	setPostedAt(t, b.app, split.Id, "2026-11-12 12:00:00.000Z")

	// Ledger note cp 2 · gate 3 A NOTE 4: an application of a vendor credit writes
	// two share rows from the credit's entry on one day (the bill's share, above
	// zero, and the credit's applied share, below it), both at position 2 of
	// their document's cash rows, so date, posting time and position tie. The
	// probe's order (plan D2) is pinned: the bill's share first. Five
	// applications, each on its own day, so an order left to the record ids
	// fails here.
	applyDays := []string{"2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"}
	for i, applyDay := range applyDays {
		cents := int64(1000 + 100*i)
		credit := b.postedCredit(t, v, "2026-10-01", billAmount{b.nec, cents})
		bill := b.postBill(t, v, "2026-10-01", billAmount{b.nec, 20000})
		apApply(t, b.apBook, credit, reload(t, b.app, "books_bills", bill.Id), applyDay, int(cents))
	}

	// keyOf names a journal line by its row id, a share row by its day and kind.
	keyOf := func(r reports.Row) string {
		if strings.HasPrefix(r.ID, "d:f99") {
			return r.ID
		}
		d, _, _ := strings.Cut(r.Label, " · ")
		switch {
		case strings.HasSuffix(r.Label, " paid by vendor credit (cash basis)"):
			return d + " bill share"
		case strings.HasSuffix(r.Label, " applied (cash basis)"):
			return d + " credit applied"
		}
		return "other " + r.Label
	}
	keys := func() []string {
		t.Helper()
		_, rows := f1099PaymentRows(t, b, octoberAll, v, "nec_1")
		out := make([]string, len(rows))
		for i, r := range rows {
			out[i] = keyOf(r)
		}
		return out
	}
	shares := []string{}
	for _, d := range applyDays {
		shares = append(shares, d+" bill share", d+" credit applied")
	}
	want := append([]string{"d:f99pos999999999", "d:f99pos000000001", "d:f99same99999999", "d:f99same00000001", "d:f99ord000000001"}, shares...)
	if got := keys(); !reflect.DeepEqual(got, want) {
		t.Errorf("Order Co's NEC 1 payments =\n%q\nwant\n%q\n(date, then posting time, then position; a vendor credit's application: the bill's share, then the credit's applied share)", got, want)
	}

	setPostedAt(t, b.app, madeFirst.Id, "2026-11-12 09:00:00.000Z")
	want = append([]string{"d:f99pos999999999", "d:f99pos000000001", "d:f99same00000001", "d:f99same99999999", "d:f99ord000000001"}, shares...)
	if got := keys(); !reflect.DeepEqual(got, want) {
		t.Errorf("after the posting order flips, Order Co's NEC 1 payments =\n%q\nwant\n%q", got, want)
	}
	requireNoDrift(t, b.app)
}

func TestForm1099PaymentCells(t *testing.T) {
	b := new1099Book(t)
	v := f1099Vendor(t, b, "Cells Co")
	check := b.postExpense(t, v, f1099Day, billAmount{b.nec, 10000})
	card := f1099Pay(t, b, f1099Expense, v, b.nec, 4000, "credit_card", b.bank)
	cardBillPay := f1099Pay(t, b, f1099BillPayment, v, b.nec, 1500, "debit_card", b.bank)
	noBoxCheck := b.postExpense(t, v, f1099Day, billAmount{b.noBox, 2500})

	rowOf := func(rows []reports.Row, id string) reports.Row {
		t.Helper()
		for _, r := range rows {
			if r.ID == id {
				return r
			}
		}
		t.Fatalf("no payment row %s; rows %q", id, labelsOf(rows))
		return reports.Row{}
	}
	requireSums := func(what string, box reports.Row, rows []reports.Row) {
		t.Helper()
		var sum f1099Figs
		for _, r := range rows {
			f := f1099FigsOf(t, r)
			sum.Reportable += f.Reportable
			sum.Excluded += f.Excluded
			sum.All += f.All
		}
		if got := f1099FigsOf(t, box); got != sum {
			t.Errorf("%s: the box row reads %+v, its payments add up to %+v", what, got, sum)
		}
	}

	box, rows := f1099PaymentRows(t, b, octoberAll, v, "nec_1")
	if len(rows) != 3 {
		t.Fatalf("NEC 1 has the payment rows %q, want the check expense, the card expense and the card bill payment's share", labelsOf(rows))
	}
	requireF1099Figs(t, "the check expense", rowOf(rows, "d:"+entryLineOn(t, b.app, check.GetString("entry"), b.nec).Id),
		f1099Figs{Reportable: 10000, All: 10000})
	requireF1099Figs(t, "the card expense", rowOf(rows, "d:"+entryLineOn(t, b.app, card.GetString("entry"), b.nec).Id),
		f1099Figs{Reportable: 0, Excluded: 4000, All: 4000})
	var share reports.Row
	for _, r := range rows {
		if strings.Contains(r.Label, " · Bill payment "+apNo(t, b.apBook, cardBillPay)+" · ") {
			share = r
		}
	}
	if share.ID == "" {
		t.Fatalf("no share row of the card bill payment; rows %q", labelsOf(rows))
	}
	requireF1099Figs(t, "the card bill payment's share", share, f1099Figs{Reportable: 0, Excluded: 1500, All: 1500})
	requireF1099Figs(t, "the NEC 1 box", box, f1099Figs{Reportable: 10000, Excluded: 5500, All: 15500})
	requireSums("NEC 1", box, rows)

	none, noneRows := f1099PaymentRows(t, b, octoberAll, v, "")
	requireF1099Figs(t, "the check expense on the account with no box",
		rowOf(noneRows, "d:"+entryLineOn(t, b.app, noBoxCheck.GetString("entry"), b.noBox).Id),
		f1099Figs{Reportable: 0, Excluded: 2500, All: 2500})
	requireSums("Not reported", none, noneRows)
	requireNoDrift(t, b.app)
}

func TestForm1099PaymentOpens(t *testing.T) {
	b := new1099Book(t)
	v := f1099Vendor(t, b, "Opens Co")
	exp := b.postExpense(t, v, f1099Day, billAmount{b.nec, 10000})
	bill := b.postBill(t, v, f1099Day, billAmount{b.nec, 4000})
	pay := b.payOn(t, v, f1099Day, payLine{bill, 4000})
	credit := b.postedCredit(t, v, f1099Day, billAmount{b.nec, 1000})
	creditBill := b.postBill(t, v, f1099Day, billAmount{b.nec, 3000})
	apApply(t, b.apBook, credit, reload(t, b.app, "books_bills", creditBill.Id), f1099Day, 1000)
	refunded := b.postedCredit(t, v, f1099Day, billAmount{b.nec, 500})
	refund := apRefund(t, b.apBook, v, f1099Day, map[string]int{refunded.Id: 500})
	manual := b.postEntry(t, f1099Day, v, b.nec, 700)

	_, rows := f1099PaymentRows(t, b, octoberAll, v, "nec_1")
	got := map[string]string{}
	for _, r := range rows {
		got[r.Label] = r.Open
	}
	no := func(doc *core.Record) string { return apNo(t, b.apBook, doc) }
	day, on := f1099Day+" · ", " · "+f1099ContractLabor
	manualLabel := ebvLedgerLabel(t, b.app, entryLineOn(t, b.app, manual.Id, b.nec), "Journal entry "+ebvEntryNumber(t, b.app, manual.Id))
	want := map[string]string{
		day + "Expense " + no(exp) + on: apRoute(t, b.app, "expense", exp),
		day + "Bill payment " + no(pay) + on + " · Bill " + no(bill) + " paid (cash basis)":                            apRoute(t, b.app, "bill_payment", pay),
		day + "Vendor credit " + no(credit) + on + " · Bill " + no(creditBill) + " paid by vendor credit (cash basis)": apRoute(t, b.app, "vendor_credit", credit),
		day + "Vendor credit " + no(credit) + on + " · Vendor credit " + no(credit) + " applied (cash basis)":          apRoute(t, b.app, "vendor_credit", credit),
		day + "Vendor refund " + no(refund) + on + " · Vendor credit " + no(refunded) + " refunded (cash basis)":       apRoute(t, b.app, "vendor_refund", refund),
		manualLabel: "books/entries/" + urlKey(t, b.app, manual),
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Opens Co's NEC 1 payments open\n%q\nwant\n%q", got, want)
	}
	requireNoDrift(t, b.app)
}

func TestForm1099VoidPayment(t *testing.T) {
	b := new1099Book(t)
	v := f1099Vendor(t, b, "Void Payment Co")
	b.postExpense(t, v, f1099Day, billAmount{b.nec, 1000})
	voided := b.postExpense(t, v, f1099Day, billAmount{b.nec, 20000})
	if err := voidExpenseAs(b.app, voided.Id, b.users.admin.Id); err != nil {
		t.Fatalf("void the expense: %v", err)
	}
	bill := b.postBill(t, v, f1099Day, billAmount{b.nec, 30000})
	pay := b.payOn(t, v, f1099Day, payLine{bill, 30000})
	payNo, voidNo := apNo(t, b.apBook, pay), apNo(t, b.apBook, voided)

	// sumOf adds the payment rows' figures in each column.
	sumOf := func(rows []reports.Row) f1099Figs {
		t.Helper()
		var sum f1099Figs
		for _, r := range rows {
			f := f1099FigsOf(t, r)
			sum.Reportable += f.Reportable
			sum.Excluded += f.Excluded
			sum.All += f.All
		}
		return sum
	}
	// voidRows are the rows of the void expense and of its reversal.
	voidRows := func(rows []reports.Row) []reports.Row {
		var out []reports.Row
		for _, r := range rows {
			if strings.Contains(r.Label, " · Expense "+voidNo+" · ") || strings.Contains(r.Label, " · Void reversal of "+voidNo+" · ") {
				out = append(out, r)
			}
		}
		return out
	}

	box, rows := f1099PaymentRows(t, b, octoberAll, v, "nec_1")
	requireF1099Figs(t, "NEC 1 with the bill paid", box, f1099Figs{Reportable: 31000, All: 31000})
	if s := sumOf(rows); s != (f1099Figs{Reportable: 31000, All: 31000}) {
		t.Errorf("NEC 1's payments with the bill paid add up to %+v, want 31000; rows %q", s, labelsOf(rows))
	}
	if s := sumOf(voidRows(rows)); s != (f1099Figs{}) {
		t.Errorf("the void expense's rows %q add up to %+v, want 0", labelsOf(voidRows(rows)), s)
	}

	if err := voidBillPaymentAs(b.app, pay.Id, b.users.admin.Id); err != nil {
		t.Fatalf("void the bill payment: %v", err)
	}
	box, rows = f1099PaymentRows(t, b, octoberAll, v, "nec_1")
	requireF1099Figs(t, "NEC 1 after the void of the bill payment", box, f1099Figs{Reportable: 1000, All: 1000})
	if s := sumOf(rows); s != (f1099Figs{Reportable: 1000, All: 1000}) {
		t.Errorf("NEC 1's payments after the void add up to %+v, want 1000; rows %q", s, labelsOf(rows))
	}
	for _, r := range rows {
		if strings.Contains(r.Label, "Bill payment "+payNo+" ") || strings.Contains(r.Label, " paid (cash basis)") {
			t.Errorf("a share row of the void bill payment shows: %q", r.Label)
		}
	}
	if s := sumOf(voidRows(rows)); s != (f1099Figs{}) {
		t.Errorf("the void expense's rows %q add up to %+v, want 0", labelsOf(voidRows(rows)), s)
	}
	requireF1099Figs(t, "the vendor after the void", f1099VendorRow(t, run1099(t, b, octoberAll), v), f1099Figs{Reportable: 1000, All: 1000})
	requireNoDrift(t, b.app)
}

// f1099Export is the export of the shipped 1099 Summary and Detail in format
// (csv, xlsx or pdf) as b's reader on f1099Today, through core's export route
// as exportShippedCSV posts it. exportShippedCSV ships the report and its
// shares on the first call, so each export makes the CSV first.
func f1099Export(t *testing.T, b f1099Book, format string, params map[string]any) []byte {
	t.Helper()
	text := exportShippedCSV(t, b.app, form1099Shipped(), form1099Key, f1099Today, b.reader, params)
	if format == "csv" {
		return []byte(text)
	}
	row, err := b.app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": form1099Key})
	if err != nil {
		t.Fatalf("no reports row with shipped_key %s: %v", form1099Key, err)
	}
	given := map[string]json.RawMessage{}
	for id, v := range params {
		given[id] = mustJSON(v)
	}
	body := mustJSON(map[string]any{
		"reportId": row.Id, "format": format, "params": given,
		"options": map[string]any{"today": f1099Today},
	})
	router, err := apis.NewRouter(b.app)
	if err != nil {
		t.Fatal(err)
	}
	var out []byte
	err = b.app.OnServe().Trigger(&core.ServeEvent{App: b.app, Router: router}, func(e *core.ServeEvent) error {
		mux, err := e.Router.BuildMux()
		if err != nil {
			return err
		}
		req := httptest.NewRequest(http.MethodPost, "/api/reports/export", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", tokenFor(t, b.reader))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			return fmt.Errorf("export %s: status %d, want 200; body: %s", format, rec.Code, rec.Body.String())
		}
		out = rec.Body.Bytes()
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

// f1099Record is one row of an export: its label and its three figures in
// cents; Excluded is nil for an empty cell.
type f1099Record struct {
	Label           string
	Reportable, All int64
	Excluded        *int64
}

func (r f1099Record) String() string {
	exc := "blank"
	if r.Excluded != nil {
		exc = fmt.Sprint(*r.Excluded)
	}
	return fmt.Sprintf("{%q %d %s %d}", r.Label, r.Reportable, exc, r.All)
}

func f1099Cents(c int64) *int64 { return &c }

// f1099CSVRecords reads a CSV export: its heading line and its records.
func f1099CSVRecords(t *testing.T, text string) ([]string, []f1099Record) {
	t.Helper()
	records, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(text, "\xef\xbb\xbf"))).ReadAll()
	if err != nil {
		t.Fatalf("read the CSV: %v\n%s", err, text)
	}
	if len(records) == 0 {
		t.Fatal("the CSV has no line")
	}
	out := []f1099Record{}
	for _, r := range records[1:] {
		if len(r) != 4 {
			t.Fatalf("CSV record %q has %d fields, want 4", r, len(r))
		}
		rec := f1099Record{Label: r[0], Reportable: int64(apCSVCents(t, r[1])), All: int64(apCSVCents(t, r[3]))}
		if r[2] != "" {
			rec.Excluded = f1099Cents(int64(apCSVCents(t, r[2])))
		}
		out = append(out, rec)
	}
	return records[0], out
}

// f1099Sheet reads an Excel export: the lines above the heading row, the
// heading row's texts and the records under it.
func f1099Sheet(t *testing.T, file []byte) (above []string, headings []string, records []f1099Record) {
	t.Helper()
	wb, err := xlsx.OpenBytes(context.Background(), file)
	if err != nil {
		t.Fatalf("read the Excel file: %v", err)
	}
	if len(wb.Sheets) != 1 {
		t.Fatalf("%d sheets, want 1", len(wb.Sheets))
	}
	sheet := wb.Sheets[0]
	text := func(c xlsx.Cell) string {
		if c.Value.Kind == xlsx.KindString {
			return strings.TrimSpace(c.Value.S)
		}
		return ""
	}
	cents := func(c xlsx.Cell, what string) *int64 {
		t.Helper()
		switch c.Value.Kind {
		case xlsx.KindEmpty:
			return nil
		case xlsx.KindNumber:
			return f1099Cents(int64(math.Round(c.Value.F * 100)))
		}
		t.Fatalf("%s: cell %q is kind %d, want a number or empty", what, c.Text, c.Value.Kind)
		return nil
	}
	at := -1
	for i, row := range sheet.Cells {
		if len(row) > 0 && text(row[0]) == "Vendor" {
			at = i
			break
		}
		for _, c := range row {
			if s := text(c); s != "" {
				above = append(above, s)
			}
		}
	}
	if at < 0 {
		t.Fatalf("the sheet has no heading row that starts with Vendor; lines %q", above)
	}
	for _, c := range sheet.Cells[at] {
		if s := text(c); s != "" {
			headings = append(headings, s)
		}
	}
	for i, row := range sheet.Cells[at+1:] {
		cell := func(col int) xlsx.Cell {
			if col < len(row) {
				return row[col]
			}
			return xlsx.Cell{}
		}
		if text(cell(0)) == "" {
			continue
		}
		what := fmt.Sprintf("sheet row %d", at+2+i)
		rep, all := cents(cell(1), what), cents(cell(3), what)
		if rep == nil || all == nil {
			t.Fatalf("%s (%q): Reportable or All payments is empty", what, text(cell(0)))
		}
		records = append(records, f1099Record{Label: text(cell(0)), Reportable: *rep, Excluded: cents(cell(2), what), All: *all})
	}
	return above, headings, records
}

// f1099RecordOf is a run's row as an export record.
func f1099RecordOf(t *testing.T, r reports.Row) f1099Record {
	t.Helper()
	f := f1099FigsOf(t, r)
	rec := f1099Record{Label: r.Label, Reportable: f.Reportable, All: f.All}
	if r.Cells["excluded"] != nil {
		rec.Excluded = f1099Cents(f.Excluded)
	}
	return rec
}

func requireF1099Records(t *testing.T, what string, got, want []f1099Record) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("%s records =\n%v\nwant\n%v", what, got, want)
	}
}

var f1099ExportHeadings = []string{"Vendor", "Reportable", "Excluded", "All payments"}

func TestForm1099CSVOpensEveryBox(t *testing.T) {
	b := new1099Book(t)
	alpha := f1099Vendor(t, b, "Csv Alpha")
	if err := setFields(t, b.app, "books_vendors", alpha.Id, map[string]any{"tax_id_type": "ein", "tax_id": "987654321"}); err != nil {
		t.Fatalf("save the tax ID: %v", err)
	}
	check := b.postExpense(t, alpha, f1099Day, billAmount{b.nec, 10000})
	cardDraft := b.mkExpense(t, map[string]any{
		"vendor": alpha.Id, "date": "2026-10-16", "payment_method": "credit_card", "paid_from": b.bank.Id,
	})
	mkExpenseLine(t, b.app, cardDraft, 0, accountLine(b.nec, 4000))
	card := mustPostExpense(t, b.app, cardDraft.Id, b.users.bookkeeper.Id)
	noBox := b.postExpense(t, alpha, f1099Day, billAmount{b.noBox, 2500})
	beta := f1099Vendor(t, b, "Csv Beta")
	rent := b.postExpense(t, beta, f1099Day, billAmount{b.misc1, 3000})

	no := func(doc *core.Record) string { return apNo(t, b.apBook, doc) }
	on := func(account *core.Record) string { return " · " + ebvAccountText(t, b.app, account.Id) }
	run := run1099(t, b, octoberAll)
	labels := map[string]string{"nec_1": "NEC 1 · Nonemployee compensation", "misc_1": "MISC 1 · Rents", "": "Not reported"}
	want := []f1099Record{
		f1099RecordOf(t, f1099VendorRow(t, run, alpha)),
		{Label: labels["nec_1"], Reportable: 10000, Excluded: f1099Cents(4000), All: 14000},
		{Label: f1099Day + " · Expense " + no(check) + on(b.nec), Reportable: 10000, All: 10000},
		{Label: "2026-10-16 · Expense " + no(card) + on(b.nec) + f1099CardSuffix, Reportable: 0, Excluded: f1099Cents(4000), All: 4000},
		{Label: labels[""], Reportable: 0, Excluded: f1099Cents(2500), All: 2500},
		{Label: f1099Day + " · Expense " + no(noBox) + on(b.noBox), Reportable: 0, Excluded: f1099Cents(2500), All: 2500},
		f1099RecordOf(t, f1099VendorRow(t, run, beta)),
		{Label: labels["misc_1"], Reportable: 3000, All: 3000},
		{Label: f1099Day + " · Expense " + no(rent) + on(b.misc1), Reportable: 3000, All: 3000},
		f1099RecordOf(t, f1099Total(t, run)),
	}
	if !reflect.DeepEqual(want[0], f1099Record{Label: "Csv Alpha", Reportable: 10000, Excluded: f1099Cents(6500), All: 16500}) {
		t.Fatalf("the run's Csv Alpha row %v, want 10000 / 6500 / 16500", want[0])
	}
	if want[6].Excluded != nil || want[6].All != 3000 {
		t.Fatalf("the run's Csv Beta row %v, want 3000 / blank / 3000", want[6])
	}
	if want[9].Label != "Total" || want[9].All != 19500 || want[9].Reportable != 13000 {
		t.Fatalf("the run's Total %v, want Total 13000 / 6500 / 19500", want[9])
	}

	// The CSV: every vendor, every box and every payment, then the Total.
	csvText := string(f1099Export(t, b, "csv", octoberAll))
	heading, records := f1099CSVRecords(t, csvText)
	if !reflect.DeepEqual(heading, f1099ExportHeadings) {
		t.Errorf("the CSV heading line = %q, want %q (no hidden column)", heading, f1099ExportHeadings)
	}
	requireF1099Records(t, "the CSV", records, want)

	// The Excel export: the same rows under the same headings.
	sheetAbove, sheetHeadings, sheetRecords := f1099Sheet(t, f1099Export(t, b, "xlsx", octoberAll))
	if !reflect.DeepEqual(sheetHeadings, f1099ExportHeadings) {
		t.Errorf("the Excel heading row = %q, want %q (no hidden column)", sheetHeadings, f1099ExportHeadings)
	}
	requireF1099Records(t, "the Excel export", sheetRecords, want)

	// The PDF: the four columns only.
	pdf := f1099Export(t, b, "pdf", octoberAll)
	_, pdfText := extractPDFText(t, pdf)
	for _, h := range f1099ExportHeadings {
		if !strings.Contains(pdfText, h) {
			t.Errorf("the PDF has no heading %q:\n%s", h, pdfText)
		}
	}
	for _, hidden := range []string{"Excluded amount", "Vendor key", "1099 box"} {
		if strings.Contains(pdfText, hidden) {
			t.Errorf("the PDF holds the hidden column's heading %q:\n%s", hidden, pdfText)
		}
	}

	// No line of an export holds the tax ID: of the Excel export, the header lines
	// above the heading row, the heading row and the records are searched.
	sheetText := fmt.Sprint(sheetAbove, sheetHeadings, sheetRecords)
	for _, text := range []string{csvText, sheetText, pdfText} {
		for _, d := range []string{"987654321", "98-7654321", "4321"} {
			if strings.Contains(text, d) {
				t.Errorf("an export holds the tax ID part %q", d)
			}
		}
	}

	// Csv Beta alone: Excluded is empty on its vendor row and on the Total row.
	betaOnly := with(octoberAll, map[string]any{"vendors": []string{beta.Id}})
	_, betaRecords := f1099CSVRecords(t, string(f1099Export(t, b, "csv", betaOnly)))
	requireF1099Records(t, "the CSV of Csv Beta alone", betaRecords, []f1099Record{
		{Label: "Csv Beta", Reportable: 3000, All: 3000},
		{Label: labels["misc_1"], Reportable: 3000, All: 3000},
		{Label: f1099Day + " · Expense " + no(rent) + on(b.misc1), Reportable: 3000, All: 3000},
		{Label: "Total", Reportable: 3000, All: 3000},
	})
	requireNoDrift(t, b.app)
}

// form1099SpecSHA256 is the sha256 of mustJSON(form1099Spec()) with the detail
// label final (report-1099 checkpoint 3). It is recorded at the end of
// checkpoint 3: until then it holds no sum. A later change of the filter, the
// columns, the sort or the labels moves it. Checkpoint 4 (spec §11 Q21) moved
// it once: the card mark and the doc type read the row's own copies
// (fld("card_payment"), fld("doc_type")) in place of the entry's.
const form1099SpecSHA256 = "ed243377e6f074f22c922c800190f7167221f98028741262e4b96dce52cbd644"

func TestForm1099SpecSHA(t *testing.T) {
	sum := sha256.Sum256(mustJSON(form1099Spec()))
	if got := hex.EncodeToString(sum[:]); got != form1099SpecSHA256 {
		t.Errorf("sha256 of the 1099 Summary and Detail spec JSON = %s, want %s", got, form1099SpecSHA256)
	}
	if shipped := sha256.Sum256(form1099Shipped().Spec); shipped != sum {
		t.Errorf("the shipped spec JSON is not mustJSON(form1099Spec())")
	}
}

func TestForm1099ExportsPrintThreshold(t *testing.T) {
	b := new1099Book(t)
	v := f1099Vendor(t, b, "Threshold Line Co")
	b.postExpense(t, v, f1099Day, billAmount{b.nec, 250000})
	const line = "1099 threshold: $2,000.00"

	above, _, records := f1099Sheet(t, f1099Export(t, b, "xlsx", octoberAll))
	if len(records) == 0 {
		t.Fatal("the Excel export has no row")
	}
	if !slices.Contains(above, line) {
		t.Errorf("the Excel header lines %q do not hold %q", above, line)
	}
	_, pdfText := extractPDFText(t, f1099Export(t, b, "pdf", octoberAll))
	if !strings.Contains(pdfText, line) {
		t.Errorf("the PDF does not hold %q:\n%s", line, pdfText)
	}
	requireNoDrift(t, b.app)
}

func TestForm1099Topics(t *testing.T) {
	b := new1099Book(t)
	v := f1099Vendor(t, b, "Topic Co")
	b.postExpense(t, v, f1099Day, billAmount{b.nec, 10000})
	bill := b.postBill(t, v, f1099Day, billAmount{b.nec, 4000})
	b.payOn(t, v, f1099Day, payLine{bill, 4000})
	// The run reads both layers of books.basis_lines (an expense line and a
	// bill payment's share).
	closed := run1099(t, b, octoberAll)
	box, rows := f1099PaymentRows(t, b, octoberAll, v, "nec_1")
	if len(rows) != 2 {
		t.Fatalf("NEC 1 opens into %q, want the expense and the share", labelsOf(rows))
	}
	opened := run1099Opts(t, b, octoberAll, reports.Options{Expand: [][]any{box.GroupKey}, Collapse: [][]any{}})
	// Spec §3 Live (Q14): the report reads books.basis_lines, a source core
	// marks NotLive, and ships with Live false: each run is manual and follows
	// no topic; the reader presses Refresh.
	requireManual(t, closed)
	requireManual(t, opened)
	requireManual(t, run1099(t, b, nil))
	requireNoDrift(t, b.app)
}
