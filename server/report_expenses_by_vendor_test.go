package books

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The Expenses by Vendor (spec §3, §4): the posted lines on Cost of goods
// sold, Expense and Other expense accounts dated in the period, on the run's
// basis, one row per vendor, the No vendor row and the Total, with each row's
// share of the Total. Every book is an ebvBook and every run is the Books
// reader's, with a fixed day.

// ebvToday is the reader's day in every run unless a test sets one.
const ebvToday = "2026-11-20"

// ebvBook is an apBook (2000 Accounts Payable, 6200 Software Subscriptions as
// b.expense, 1000 Business Checking as b.bank, the bill, expense, vendor
// credit, bill payment and refund guards) with a second Expense account, a
// Cost of goods sold account, an Other expense account, a Fixed asset account,
// a long-term liability and an equity account. The ledger env's Consulting
// Income (b.revenue) is the income account.
type ebvBook struct {
	apBook
	office, cogs, other, asset, loan, equity *core.Record
}

func newEBVBook(t *testing.T) ebvBook {
	t.Helper()
	b := newEBVAPBook(t)
	return ebvBook{
		apBook: b,
		office: mkNumberedAccount(t, b.app, "Office Expenses", "6150", "expense", "office_general"),
		cogs:   mkNumberedAccount(t, b.app, "Materials", "5150", "cost_of_goods_sold", "supplies_materials"),
		other:  mkNumberedAccount(t, b.app, "Penalties", "8150", "other_expense", "penalties_settlements"),
		asset:  mkNumberedAccount(t, b.app, "Shop Equipment", "1550", "fixed_asset", "machinery_equipment"),
		loan:   mkNumberedAccount(t, b.app, "Owner Loan", "2750", "long_term_liability", "owner_loans"),
		equity: mkNumberedAccount(t, b.app, "Owner's Equity", "3150", "equity", "owners_equity"),
	}
}

// newEBVAPBook is newAPBook's book (newApplyBook, newRefundEnv, newAPBook in
// one) with the expense guards and the expense forms host bound too, so an
// expense posts its entry. Core keeps one set of bound hosts per app, and a
// second bindHostsByKey call replaces the first, so the bill, vendor credit
// and expense hosts are bound in ONE call here.
func newEBVAPBook(t *testing.T) apBook {
	t.Helper()
	env := newLedgerEnv(t)
	registerSalesDocGuards(env.app, billKind)
	registerSalesDocGuards(env.app, vendorCreditKind)
	registerSalesDocGuards(env.app, expenseKind)
	bindHostsByKey(t, env.app, billKind.HostKey, vendorCreditHostKey, expenseKind.HostKey)
	registerBillPaymentGuards(env.app)
	registerVendorCreditApplications(env.app)
	enableBatch(t, env.app)
	bp := &billPayEnv{expenseEnv: expenseEnvOn(t, env)}
	bp.payable = mkNumberedAccount(t, env.app, "Accounts Payable", "2000", "accounts_payable", "accounts_payable")
	if err := setFields(t, env.app, "books_accounts", env.rent.Id, map[string]any{"number": "6100"}); err != nil {
		t.Fatalf("number Rent 6100: %v", err)
	}
	if err := setFields(t, env.app, "books_vendors", bp.pacificPower.Id, map[string]any{"inactive": false}); err != nil {
		t.Fatalf("make Pacific Power active: %v", err)
	}
	registerVendorRefundGuards(bp.app)
	re := &refundEnv{
		billPayEnv:  bp,
		undeposited: mkNumberedAccount(t, bp.app, "Undeposited funds", "1200", "other_current_asset", "undeposited_funds"),
	}
	registerBooksSources(t)
	return apBook{
		refundEnv: re,
		reader:    re.users.readOnly, none: re.users.none,
		payable: re.billPayEnv.payable, expense: re.software, bank: re.checking1000,
	}
}

// postBill posts a bill of vendor dated day with one account line per amount.
func (b ebvBook) postBill(t *testing.T, vendor *core.Record, day string, lines ...billAmount) *core.Record {
	t.Helper()
	return b.postedBillOn(t, vendor, day, lines...)
}

// postExpense posts an expense dated day, paid from 1000 Business Checking,
// with one account line per amount; vendor nil posts it with no payee.
func (b ebvBook) postExpense(t *testing.T, vendor *core.Record, day string, lines ...billAmount) *core.Record {
	t.Helper()
	fields := map[string]any{"date": day}
	if vendor != nil {
		fields["vendor"] = vendor.Id
	}
	exp := b.mkExpense(t, fields)
	for i, l := range lines {
		mkExpenseLine(t, b.app, exp, i, accountLine(l.account, l.amount))
	}
	posted := mustPostExpense(t, b.app, exp.Id, b.users.bookkeeper.Id)
	if posted.GetString("entry") == "" {
		t.Fatalf("expense %s dated %s is posted with no entry: the book binds no expense guards", exp.Id, day)
	}
	return posted
}

// postEntry posts a manual entry dated day that debits account by cents (a
// negative cents credits it) naming vendor (none when nil), against 1000
// Business Checking.
func (b ebvBook) postEntry(t *testing.T, day string, vendor *core.Record, account *core.Record, cents int) *core.Record {
	t.Helper()
	party := ""
	if vendor != nil {
		party = vendor.Id
	}
	line := jnLine{account: account, position: 0, vendor: party}
	bank := jnLine{account: b.bank, position: 1}
	if cents >= 0 {
		line.debit, bank.credit = cents, cents
	} else {
		line.credit, bank.debit = -cents, -cents
	}
	return postJournal(t, b.app, "", day, "Expense adjustment", line, bank)
}

func ebvPeriod(from, to string) map[string]any { return glPeriod(from, to) }

// The period most tests run: October 2026.
var ebvOctober = ebvPeriod("2026-10-01", "2026-10-31")

// runEBVErr runs the shipped Expenses by Vendor as reader, as core's run
// endpoint does: Load, then Run with the posted params, the reader's headers
// and, unless opts sets one, the day ebvToday.
func runEBVErr(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) (*reports.Result, error) {
	t.Helper()
	spec, info, err := reports.Load(expensesByVendorShipped().Spec)
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
		opts.Today = ebvToday
	}
	return reports.Run(context.Background(), app, reports.Request{
		Spec: spec, Loaded: info, Params: given, Options: opts, Auth: reader,
		Headers: readerInfo(reader).Headers, Live: expensesByVendorShipped().Live,
	})
}

// runEBV runs the shipped Expenses by Vendor as reader with every row closed.
func runEBV(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	res, err := runEBVErr(t, app, reader, params, opts)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// run is runEBV as b's reader on ebvToday.
func (b ebvBook) run(t *testing.T, params map[string]any) *reports.Result {
	t.Helper()
	return runEBV(t, b.app, b.reader, params, reports.Options{})
}

// ebvVendorRow is the vendor row (level 1) of vendor.
func ebvVendorRow(t *testing.T, res *reports.Result, vendor *core.Record) reports.Row {
	t.Helper()
	r, ok := cbGroupRow(res, 1, vendor.Id)
	if !ok {
		t.Fatalf("no vendor row for %s; rows %q", vendor.GetString("display_name"), bsLabels(res))
	}
	return r
}

func ebvHasVendor(res *reports.Result, vendor *core.Record) bool {
	_, ok := cbGroupRow(res, 1, vendor.Id)
	return ok
}

// ebvVendorRows are the vendor rows (level 1), the No vendor row included.
func ebvVendorRows(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup && r.Level == 1 {
			out = append(out, r)
		}
	}
	return out
}

// ebvAmount is the Total of vendor's row.
func ebvAmount(t *testing.T, res *reports.Result, vendor *core.Record) int64 {
	t.Helper()
	return amt(t, ebvVendorRow(t, res, vendor), "amount")
}

// ebvTotal is the Total of the Total row.
func ebvTotal(t *testing.T, res *reports.Result) int64 {
	t.Helper()
	return amt(t, totalOf(t, res), "amount")
}

// ebvShare is a row's % of expenses: ok false for a blank cell.
func ebvShare(t *testing.T, r reports.Row) (float64, bool) {
	t.Helper()
	return pctCell(t, r)
}

func requireEBVShare(t *testing.T, r reports.Row, want float64) {
	t.Helper()
	got, ok := ebvShare(t, r)
	if !ok {
		t.Errorf("%s (%s) has a blank %% of expenses, want %.2f", r.Label, r.Kind, want)
		return
	}
	if math.Abs(got-want) > 1e-6 {
		t.Errorf("%s (%s) %% of expenses = %v, want %.2f", r.Label, r.Kind, got, want)
	}
}

func requireEBVBlankShare(t *testing.T, r reports.Row, why string) {
	t.Helper()
	if v, ok := ebvShare(t, r); ok {
		t.Errorf("%s (%s) %% of expenses = %v, want blank (%s)", r.Label, r.Kind, v, why)
	}
}

// ebvSpecFile is server/testdata/expenses_by_vendor_spec.json, which
// tests/expenses-by-vendor-fixture.test.ts reads too.
type ebvSpecFile struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Params      json.RawMessage `json:"params"`
	Display     json.RawMessage `json:"display"`
	EmptyFrom   string          `json:"emptyFrom"`
	EmptyTo     string          `json:"emptyTo"`
}

func readEBVSpecFile(t *testing.T) ebvSpecFile {
	t.Helper()
	raw, err := os.ReadFile("testdata/expenses_by_vendor_spec.json")
	if err != nil {
		t.Fatalf("read testdata/expenses_by_vendor_spec.json: %v", err)
	}
	var file ebvSpecFile
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("parse testdata/expenses_by_vendor_spec.json: %v", err)
	}
	return file
}

func TestExpensesByVendorSpecLoads(t *testing.T) {
	b := newEBVBook(t)
	if err := reports.CheckSources(b.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}

	shipped := expensesByVendorShipped()
	if expensesByVendorKey != "books.expenses_by_vendor" || shipped.Key != expensesByVendorKey {
		t.Errorf("key = %q (const %q), want books.expenses_by_vendor", shipped.Key, expensesByVendorKey)
	}
	if shipped.Title != "Expenses by Vendor" {
		t.Errorf("title = %q, want Expenses by Vendor", shipped.Title)
	}
	if shipped.Description != "What you spent with each vendor in a period, from posted transactions on expense accounts." {
		t.Errorf("description = %q", shipped.Description)
	}
	if shipped.Revision != 2 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	if !jsonEqual(t, shipped.Spec, string(mustJSON(expensesByVendorSpec()))) {
		t.Errorf("the shipped spec is not expensesByVendorSpec()")
	}

	spec, _, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.Version != reports.CurrentVersion {
		t.Errorf("version %d, want %d", spec.Version, reports.CurrentVersion)
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
	if !reflect.DeepEqual(paramIDs, []string{"period", "method", "rows", "vendors", "order"}) {
		t.Fatalf("params = %v, want period, method, rows, vendors, order (the chips' order)", paramIDs)
	}
	period := paramOf(t, spec, "period")
	if period.Type != reports.ParamDateRange || period.Label != "Period" || !jsonEqual(t, period.Default, `{"preset":"thisFiscalYearToDate"}`) {
		t.Errorf("period = %+v (default %s), want Period, default This fiscal year to date", period, period.Default)
	}
	if got, want := mustJSON(paramOf(t, spec, "method")), mustJSON(methodParam()); string(got) != string(want) {
		t.Errorf("the method param = %s, want methodParam() %s", got, want)
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
	wantOrder := []reports.Option{{Value: "name", Label: "Name"}, {Value: "amount", Label: "Largest expenses"}}
	if order.Type != reports.ParamChoice || order.Label != "Order" || order.Multiple || order.OptionsFrom != nil ||
		!reflect.DeepEqual(order.Options, wantOrder) || !jsonEqual(t, order.Default, `"name"`) {
		t.Errorf("order = %+v (default %s), want a single choice Order: Name (default), Largest expenses", order, order.Default)
	}

	type colShape struct {
		ID, Label string
		Hidden    bool
	}
	gotCols := make([]colShape, len(spec.Columns))
	for i, c := range spec.Columns {
		gotCols[i] = colShape{c.ID, c.Label, c.Hidden}
		if c.Hidden {
			gotCols[i].Label = ""
		}
	}
	wantCols := []colShape{
		{ID: "name", Label: "Vendor"},
		{ID: "amount", Label: "Total"},
		{ID: "pct", Label: "% of expenses"},
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
	wantGroups := []groupShape{{ID: "byVendor", Col: "vendorKey", Having: true, Muted: true}}
	if !reflect.DeepEqual(gotGroups, wantGroups) {
		t.Errorf("groups = %+v\nwant %+v", gotGroups, wantGroups)
	}

	// An opened line is labelled and opens its document (spec §3 Opening a
	// transaction). Checkpoint 2 pins the label's text.
	if spec.Detail == nil || spec.Detail.Label == nil || spec.Detail.Open == nil {
		t.Errorf("detail = %+v, want a label and an open path", spec.Detail)
	} else if got, want := mustJSON(spec.Detail.Open), mustJSON(entryOpenPath()); string(got) != string(want) {
		t.Errorf("detail.open = %s\nwant entryOpenPath() %s", got, want)
	}

	// A run shows the three visible columns only; the vendor key stays hidden.
	b.postBill(t, apVendor(t, b.apBook, "Shown Co"), "2026-10-05", billAmount{b.expense, 10000})
	res := b.run(t, map[string]any{"period": ebvOctober})
	ids := make([]string, len(res.Columns))
	for i, c := range res.Columns {
		ids[i] = c.ID
	}
	if !reflect.DeepEqual(ids, []string{"name", "amount", "pct"}) {
		t.Errorf("result columns = %v, want name, amount, pct", ids)
	}
	if len(ebvVendorRows(res)) == 0 {
		t.Fatalf("the run has no vendor rows; rows %q", bsLabels(res))
	}
	for _, r := range res.Rows {
		if v, ok := r.Cells["vendorKey"]; ok {
			t.Errorf("%s (%s) carries a vendorKey cell %#v", r.Label, r.Kind, v)
		}
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorMatchesSharedSpecFile(t *testing.T) {
	file := readEBVSpecFile(t)
	shipped := expensesByVendorShipped()
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
		t.Errorf("params =\n%s\nwant testdata/expenses_by_vendor_spec.json params\n%s", got, file.Params)
	}
	if got := mustJSON(spec.Display); !jsonEqual(t, got, string(file.Display)) {
		t.Errorf("display =\n%s\nwant testdata/expenses_by_vendor_spec.json display\n%s", got, file.Display)
	}
	if file.EmptyFrom != "2025-07-01" || file.EmptyTo != "2025-09-30" {
		t.Errorf("emptyFrom %q, emptyTo %q; want 2025-07-01 and 2025-09-30", file.EmptyFrom, file.EmptyTo)
	}
}

func TestExpensesByVendorWhatCounts(t *testing.T) {
	b := newEBVBook(t)

	// A bill on two expense accounts. Books refuses a bill line on a fixed asset
	// account (purchaseAccountTypes), so the vendor's equipment buy is a manual
	// entry naming it on the Fixed asset account.
	acme := apVendor(t, b.apBook, "Acme Supply")
	b.postBill(t, acme, "2026-10-05", billAmount{b.expense, 30000}, billAmount{b.office, 20000})
	b.postEntry(t, "2026-10-06", acme, b.asset, 50000)

	// The vendor's name on a liability, an equity and an income line adds nothing.
	postJournal(t, b.app, "", "2026-10-07", "Named lines off the expense accounts",
		jnLine{account: b.loan, credit: 1000, position: 0, vendor: acme.Id},
		jnLine{account: b.equity, debit: 400, position: 1, vendor: acme.Id},
		jnLine{account: b.revenue, debit: 600, position: 2, vendor: acme.Id})

	// Cost of goods sold and Other expense count.
	mixed := apVendor(t, b.apBook, "Mixed Accounts Co")
	b.postBill(t, mixed, "2026-10-08", billAmount{b.cogs, 7000}, billAmount{b.other, 3000})

	// An expense with a vendor counts.
	cafe := apVendor(t, b.apBook, "Cafe Co")
	b.postExpense(t, cafe, "2026-10-09", billAmount{b.office, 2500})

	// A manual entry line on an expense account with a vendor counts for it.
	named := apVendor(t, b.apBook, "Journal Named Co")
	b.postEntry(t, "2026-10-10", named, b.expense, 1200)

	// A draft bill posts no line.
	drafted := apVendor(t, b.apBook, "Draft Bill Co")
	draft := mkBill(t, b.app, drafted, map[string]any{"date": "2026-10-11", "due_date": "2026-10-11"})
	mkBillLine(t, b.app, draft, 0, accountLine(b.expense, 55500))

	// A bill one day after the period does not count.
	late := apVendor(t, b.apBook, "Late Co")
	b.postBill(t, late, "2026-11-01", billAmount{b.expense, 8800})
	b.postBill(t, acme, "2026-11-01", billAmount{b.expense, 9900})

	res := b.run(t, map[string]any{"period": ebvOctober})
	if got := ebvAmount(t, res, acme); got != 50000 {
		t.Errorf("Acme Supply = %d, want 50000: its two expense lines, not the fixed asset, liability, equity or income lines, nor the November bill", got)
	}
	if got := ebvAmount(t, res, mixed); got != 10000 {
		t.Errorf("Mixed Accounts Co = %d, want 10000 (Cost of goods sold 7000 + Other expense 3000)", got)
	}
	if got := ebvAmount(t, res, cafe); got != 2500 {
		t.Errorf("Cafe Co = %d, want its expense's 2500", got)
	}
	if got := ebvAmount(t, res, named); got != 1200 {
		t.Errorf("Journal Named Co = %d, want its manual expense line's 1200", got)
	}
	if ebvHasVendor(res, drafted) {
		t.Errorf("Draft Bill Co has a row; a draft bill posts no line")
	}
	if ebvHasVendor(res, late) {
		t.Errorf("Late Co has a row; its bill is dated one day after the period")
	}
	if bsHas(res, "No vendor") {
		t.Errorf("a No vendor row shows; no expense line of the period is without a vendor; rows %q", bsLabels(res))
	}
	if got := ebvTotal(t, res); got != 50000+10000+2500+1200 {
		t.Errorf("Total = %d, want 63700", got)
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorSign(t *testing.T) {
	b := newEBVBook(t)
	lowered := apVendor(t, b.apBook, "Lowered Co")
	b.postBill(t, lowered, "2026-10-05", billAmount{b.expense, 40000})
	apVendorCredit(t, b.apBook, lowered, "2026-10-06", 10000)
	// A refund of an expense: a journal entry that credits the expense account
	// with the vendor's name.
	b.postEntry(t, "2026-10-07", lowered, b.expense, -2000)

	creditOnly := apVendor(t, b.apBook, "Credit Only Co")
	apVendorCredit(t, b.apBook, creditOnly, "2026-10-08", 6000)

	res := b.run(t, map[string]any{"period": ebvOctober})
	if got := ebvAmount(t, res, lowered); got != 28000 {
		t.Errorf("Lowered Co = %d, want 40000 - 10000 (vendor credit) - 2000 (refund) = 28000", got)
	}
	creditRow := ebvVendorRow(t, res, creditOnly)
	if got := amt(t, creditRow, "amount"); got != -6000 {
		t.Errorf("Credit Only Co = %d, want -6000", got)
	}
	if share, ok := ebvShare(t, creditRow); !ok || share >= 0 {
		t.Errorf("Credit Only Co %% of expenses = %v (shown %v), want a share below zero", share, ok)
	}
	if got := ebvTotal(t, res); got != 22000 {
		t.Errorf("Total = %d, want 28000 - 6000 = 22000", got)
	}
	var shares float64
	for _, r := range ebvVendorRows(res) {
		s, ok := ebvShare(t, r)
		if !ok {
			t.Errorf("%s has a blank %% of expenses; the Total is not zero", r.Label)
		}
		shares += s
	}
	if math.Abs(shares-100) > 0.02 {
		t.Errorf("the shares add up to %v, want 100.00 within 0.02", shares)
	}
	requireNoDrift(t, b.app)
}

// requireEBVHeaderLines fails unless the header lines are exactly the basis
// line and an empty Vendor line: core gives one line per param with a header,
// in spec order (Method, then Vendor), and "" for an unset one.
func requireEBVHeaderLines(t *testing.T, what string, res *reports.Result, basis string) {
	t.Helper()
	want := []string{basis, ""}
	if !reflect.DeepEqual(res.HeaderLines, want) {
		t.Errorf("%s header lines = %q, want %q", what, res.HeaderLines, want)
	}
}

func TestExpensesByVendorMethod(t *testing.T) {
	b := newEBVBook(t)
	paid := apVendor(t, b.apBook, "Part Paid Co")
	bill := b.postBill(t, paid, "2026-10-05", billAmount{b.office, 70000}, billAmount{b.expense, 30000})
	b.payOn(t, paid, "2026-11-03", payLine{bill, 40000})
	cafe := apVendor(t, b.apBook, "Cafe Co")
	b.postExpense(t, cafe, "2026-10-09", billAmount{b.office, 2500})

	october, november := ebvOctober, ebvPeriod("2026-11-01", "2026-11-30")
	both := ebvPeriod("2026-10-01", "2026-11-30")

	accrualOct := b.run(t, map[string]any{"period": october, "method": "accrual"})
	if got := ebvAmount(t, accrualOct, paid); got != 100000 {
		t.Errorf("Accrual, October: Part Paid Co = %d, want the bill's 100000 on its date", got)
	}
	requireEBVHeaderLines(t, "the Accrual run", accrualOct, "Accrual basis")
	byDefault := b.run(t, map[string]any{"period": october})
	if got := ebvAmount(t, byDefault, paid); got != 100000 {
		t.Errorf("no Method param, October: Part Paid Co = %d, want Accrual's 100000", got)
	}
	requireEBVHeaderLines(t, "the default run", byDefault, "Accrual basis")
	if accrualNov := b.run(t, map[string]any{"period": november, "method": "accrual"}); ebvHasVendor(accrualNov, paid) {
		t.Errorf("Accrual, November: Part Paid Co has a row; the payment is no expense on Accrual; rows %q", bsLabels(accrualNov))
	}

	cashBoth := b.run(t, map[string]any{"period": both, "method": "cash"})
	if got := ebvAmount(t, cashBoth, paid); got != 40000 {
		t.Errorf("Cash, October to November: Part Paid Co = %d, want the paid 40000", got)
	}
	requireEBVHeaderLines(t, "the Cash run", cashBoth, "Cash basis")
	cashNov := b.run(t, map[string]any{"period": november, "method": "cash"})
	if got := ebvAmount(t, cashNov, paid); got != 40000 {
		t.Errorf("Cash, November: Part Paid Co = %d, want the paid 40000 on the payment's date", got)
	}
	if cashOct := b.run(t, map[string]any{"period": october, "method": "cash"}); ebvHasVendor(cashOct, paid) {
		t.Errorf("Cash, October: Part Paid Co has a row; the unpaid bill is no expense on Cash; rows %q", bsLabels(cashOct))
	}

	for _, method := range []string{"accrual", "cash"} {
		res := b.run(t, map[string]any{"period": october, "method": method})
		if got := ebvAmount(t, res, cafe); got != 2500 {
			t.Errorf("%s, October: Cafe Co = %d, want its expense's 2500 on its date", method, got)
		}
	}
	requireNoDrift(t, b.app)
}

// plExpenseSections is Cost of goods sold + Expenses + Other expenses of a
// Profit and Loss run; a section with no Total row adds 0.
func plExpenseSections(t *testing.T, res *reports.Result) int64 {
	t.Helper()
	var sum int64
	for _, title := range []string{"Cost of goods sold", "Expenses", "Other expenses"} {
		for _, r := range res.Rows {
			if r.Kind == reports.KindSubtotal && r.Label == "Total "+title {
				sum += plAmount(t, r)
			}
		}
	}
	return sum
}

func TestExpensesByVendorTiesOutToProfitAndLoss(t *testing.T) {
	b := newEBVBook(t)
	a := apVendor(t, b.apBook, "Tie Alpha")
	bill := b.postBill(t, a, "2026-10-05", billAmount{b.office, 70000}, billAmount{b.expense, 30000})
	b.payOn(t, a, "2026-11-03", payLine{bill, 40000})
	b.postBill(t, apVendor(t, b.apBook, "Tie Beta"), "2026-10-06", billAmount{b.cogs, 12000})
	apVendorCredit(t, b.apBook, apVendor(t, b.apBook, "Tie Gamma"), "2026-10-07", 5000)
	b.postExpense(t, nil, "2026-10-08", billAmount{b.other, 3000})
	b.postExpense(t, apVendor(t, b.apBook, "Tie Delta"), "2026-10-09", billAmount{b.cogs, 4000}, billAmount{b.other, 1000})
	b.postEntry(t, "2026-10-10", nil, b.rent, 1500)
	b.postEntry(t, "2026-10-11", a, b.expense, 800)
	// Lines the Profit and Loss reads outside the three expense sections.
	postJournal(t, b.app, "", "2026-10-12", "Income",
		jnLine{account: b.bank, debit: 9000, position: 0},
		jnLine{account: b.revenue, credit: 9000, position: 1})

	period := ebvPeriod("2026-10-01", "2026-11-30")
	totals := map[string]int64{}
	for _, method := range []string{"accrual", "cash"} {
		res := b.run(t, map[string]any{"period": period, "method": method})
		pl := runPL(t, b.app, profitAndLossShipped(), b.reader,
			map[string]any{"period": period, "method": method}, reports.Options{Today: ebvToday})
		total, want := ebvTotal(t, res), plExpenseSections(t, pl)
		if total != want {
			t.Errorf("%s: the Total %d, want the Profit and Loss's Cost of goods sold + Expenses + Other expenses %d", method, total, want)
		}
		totals[method] = total
	}
	if totals["accrual"] != 117300 || totals["cash"] != 50300 {
		t.Errorf("Totals %v, want accrual 117300 and cash 50300 (the book's lines)", totals)
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorRowsChoice(t *testing.T) {
	b := newEBVBook(t)
	voided := apVendor(t, b.apBook, "Voided Bill Co")
	bill := b.postBill(t, voided, "2026-10-05", billAmount{b.expense, 20000})
	if err := voidBillAs(b.app, bill.Id, b.users.admin.Id); err != nil {
		t.Fatalf("void the bill: %v", err)
	}
	kept := apVendor(t, b.apBook, "Kept Co")
	b.postBill(t, kept, "2026-10-06", billAmount{b.expense, 10000})

	nonzero := b.run(t, map[string]any{"period": ebvOctober, "rows": "nonzero"})
	if !ebvHasVendor(nonzero, kept) {
		t.Fatalf("Kept Co has no row under Non-zero; rows %q", bsLabels(nonzero))
	}
	if ebvHasVendor(nonzero, voided) {
		t.Errorf("Non-zero shows Voided Bill Co, whose bill and void add up to 0; rows %q", bsLabels(nonzero))
	}
	if byDefault := b.run(t, map[string]any{"period": ebvOctober}); !reflect.DeepEqual(bsLabels(byDefault), bsLabels(nonzero)) {
		t.Errorf("no Rows param gives %q, want Non-zero's %q", bsLabels(byDefault), bsLabels(nonzero))
	}

	activity := b.run(t, map[string]any{"period": ebvOctober, "rows": "activity"})
	row := ebvVendorRow(t, activity, voided)
	if got := amt(t, row, "amount"); got != 0 {
		t.Errorf("Voided Bill Co under With activity = %d, want 0", got)
	}
	// D6: core tc_pct gives 0 for a zero part of a Total that is not zero.
	requireEBVShare(t, row, 0)
	if got, want := ebvTotal(t, activity), ebvTotal(t, nonzero); got != want || got != 10000 {
		t.Errorf("Total under With activity = %d, want Non-zero's %d (10000)", got, want)
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorShareUnderHaving(t *testing.T) {
	b := newEBVBook(t)
	big := apVendor(t, b.apBook, "Big Co")
	small := apVendor(t, b.apBook, "Small Co")
	hidden := apVendor(t, b.apBook, "Hidden Co")
	b.postBill(t, big, "2026-10-05", billAmount{b.expense, 30000})
	b.postBill(t, small, "2026-10-05", billAmount{b.office, 10000})
	b.postBill(t, hidden, "2026-10-06", billAmount{b.expense, 5000})
	apVendorCredit(t, b.apBook, hidden, "2026-10-07", 5000)

	res := b.run(t, map[string]any{"period": ebvOctober})
	if ebvHasVendor(res, hidden) {
		t.Fatalf("Hidden Co shows under Non-zero; rows %q", bsLabels(res))
	}
	total := ebvTotal(t, res)
	if total != 40000 {
		t.Fatalf("Total = %d, want 40000", total)
	}
	for _, r := range ebvVendorRows(res) {
		want := math.Round(float64(amt(t, r, "amount"))*10000/float64(total)) / 100
		requireEBVShare(t, r, want)
	}
	requireEBVShare(t, ebvVendorRow(t, res, big), 75)
	requireEBVShare(t, ebvVendorRow(t, res, small), 25)
	requireEBVShare(t, totalOf(t, res), 100)
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorZeroTotalHasNoShares(t *testing.T) {
	b := newEBVBook(t)
	billed := apVendor(t, b.apBook, "Billed Co")
	credited := apVendor(t, b.apBook, "Credited Co")
	b.postBill(t, billed, "2026-10-05", billAmount{b.expense, 5000})
	apVendorCredit(t, b.apBook, credited, "2026-10-06", 5000)

	res := b.run(t, map[string]any{"period": ebvOctober, "rows": "activity"})
	if got := ebvAmount(t, res, billed); got != 5000 {
		t.Errorf("Billed Co = %d, want 5000", got)
	}
	if got := ebvAmount(t, res, credited); got != -5000 {
		t.Errorf("Credited Co = %d, want -5000", got)
	}
	if got := ebvTotal(t, res); got != 0 {
		t.Errorf("Total = %d, want 0", got)
	}
	for _, r := range res.Rows {
		requireEBVBlankShare(t, r, "the Total is zero")
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorNoVendor(t *testing.T) {
	b := newEBVBook(t)
	ash := apVendor(t, b.apBook, "Ash Co")
	zinc := apVendor(t, b.apBook, "Zinc Co")
	b.postBill(t, ash, "2026-10-05", billAmount{b.expense, 2000})
	b.postBill(t, zinc, "2026-10-05", billAmount{b.expense, 3000})
	// The largest figure of the book, so the amount key alone would put it first.
	b.postExpense(t, nil, "2026-10-09", billAmount{b.office, 9000})
	b.postEntry(t, "2026-10-10", nil, b.rent, 1000)

	for _, order := range []string{"name", "amount"} {
		res := b.run(t, map[string]any{"period": ebvOctober, "order": order})
		none := bsRow(t, res, "No vendor")
		if none.Kind != reports.KindGroup || none.Depth != 0 || none.Level != 1 {
			t.Errorf("order = %s: No vendor = %+v, want a vendor row at depth 0", order, cbShapeOf(none))
		}
		if got := amt(t, none, "amount"); got != 10000 {
			t.Errorf("order = %s: No vendor = %d, want the expense with no payee and the unnamed journal line, 10000", order, got)
		}
		labels := cbDepth0(res)
		if len(labels) == 0 || labels[len(labels)-1] != "No vendor" {
			t.Errorf("order = %s: vendor rows %q, want No vendor last", order, labels)
		}
		at := slices.IndexFunc(res.Rows, func(r reports.Row) bool { return r.Label == "No vendor" })
		if at+1 >= len(res.Rows) || res.Rows[at+1].Kind != reports.KindTotal || at+2 != len(res.Rows) {
			t.Errorf("order = %s: rows %q, want No vendor directly before the Total, and the Total last", order, bsLabels(res))
		}
		if total := ebvTotal(t, res); total != 15000 {
			t.Errorf("order = %s: Total = %d, want every row, No vendor included, 15000", order, total)
		}
	}

	if picked := b.run(t, map[string]any{"period": ebvOctober, "vendors": []string{zinc.Id}}); bsHas(picked, "No vendor") {
		t.Errorf("with one vendor picked the No vendor row shows; rows %q", bsLabels(picked))
	}
	requireNoDrift(t, b.app)
}

// D9: the write-off's bad debt line names a customer, not a vendor.
func TestExpensesByVendorWriteOffIsNoVendor(t *testing.T) {
	we := newWriteOffEnv(t)
	registerBooksSources(t)
	inv := we.postedInvoice(t, 25000)
	wo := we.mkWriteOff(t, inv, nil)
	amount := int64(wo.GetInt("amount"))
	if amount != 25000 {
		t.Fatalf("the write-off is of %d, want the invoice's whole 25000", amount)
	}

	res := runEBV(t, we.app, we.users.readOnly,
		map[string]any{"period": ebvPeriod("2026-11-01", "2026-11-30"), "method": "accrual"}, reports.Options{})
	none := bsRow(t, res, "No vendor")
	if got := amt(t, none, "amount"); got != amount {
		t.Errorf("No vendor = %d, want the write-off's bad debt line %d", got, amount)
	}
	if rows := ebvVendorRows(res); len(rows) != 1 {
		t.Errorf("vendor rows %q, want No vendor only", labelsOf(rows))
	}
	requireNoDrift(t, we.app)
}

func TestExpensesByVendorVendorsParam(t *testing.T) {
	b := newEBVBook(t)
	aspen := apVendor(t, b.apBook, "Aspen Supply")
	birch := apVendor(t, b.apBook, "Birch Supply")
	cedar := apVendor(t, b.apBook, "Cedar Supply")
	b.postBill(t, aspen, "2026-10-05", billAmount{b.expense, 10000})
	b.postBill(t, birch, "2026-10-05", billAmount{b.expense, 30000})
	b.postBill(t, cedar, "2026-10-05", billAmount{b.expense, 40000})
	b.postExpense(t, nil, "2026-10-09", billAmount{b.office, 7000})
	if err := setFields(t, b.app, "books_vendors", birch.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Birch Supply inactive: %v", err)
	}

	res := b.run(t, map[string]any{"period": ebvOctober, "vendors": []string{aspen.Id, birch.Id}})
	if got, want := labelsOf(ebvVendorRows(res)), []string{"Aspen Supply", "Birch Supply (inactive)"}; !reflect.DeepEqual(got, want) {
		t.Errorf("two vendors picked: vendor rows %q, want %q", got, want)
	}
	if got := ebvTotal(t, res); got != 40000 {
		t.Errorf("the Total of the two picks = %d, want 40000", got)
	}
	requireEBVShare(t, ebvVendorRow(t, res, aspen), 25)
	requireEBVShare(t, ebvVendorRow(t, res, birch), 75)
	if !slices.ContainsFunc(res.HeaderLines, func(line string) bool {
		return strings.HasPrefix(line, "Vendor: ") && strings.Contains(line, "Aspen Supply") && strings.Contains(line, "Birch Supply")
	}) {
		t.Errorf("header lines = %q, want a \"Vendor: \" line with Aspen Supply and Birch Supply", res.HeaderLines)
	}

	spec, _, err := reports.Load(expensesByVendorShipped().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	options, err := reports.ReadParamOptions(context.Background(), b.app, reports.OptionsRequest{
		Spec: spec, Param: "vendors", Auth: b.reader, Today: ebvToday,
	})
	if err != nil {
		t.Fatalf("the vendors param's options: %v", err)
	}
	if !slices.ContainsFunc(options.Options, func(o reports.ParamOption) bool {
		return o.Value == birch.Id && o.Label == "Birch Supply"
	}) {
		t.Errorf("the Vendor picker does not offer the inactive Birch Supply; options %+v", options.Options)
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorPeriodParam(t *testing.T) {
	b := newEBVBook(t)
	saveSettings(t, b.app, map[string]any{"fiscal_year_start_month": 7})
	old := apVendor(t, b.apBook, "Last Year Co")
	before := apVendor(t, b.apBook, "Day Before Co")
	first := apVendor(t, b.apBook, "First Day Co")
	today := apVendor(t, b.apBook, "Today Co")
	b.postBill(t, old, "2025-11-03", billAmount{b.expense, 5500})
	b.postBill(t, before, "2026-06-30", billAmount{b.expense, 1100})
	b.postBill(t, first, "2026-07-01", billAmount{b.expense, 2200})
	b.postBill(t, today, ebvToday, billAmount{b.expense, 3300})

	byDefault := b.run(t, nil)
	if got, want := labelsOf(ebvVendorRows(byDefault)), []string{"First Day Co", "Today Co"}; !reflect.DeepEqual(got, want) {
		t.Errorf("the default period (This fiscal year to date, 2026-07-01 to %s): vendor rows %q, want %q", ebvToday, got, want)
	}
	if got := ebvTotal(t, byDefault); got != 5500 {
		t.Errorf("the default period's Total = %d, want 2200 + 3300 = 5500", got)
	}

	all := b.run(t, map[string]any{"period": map[string]any{"preset": "allDates"}})
	for _, v := range []*core.Record{old, before, first, today} {
		if !ebvHasVendor(all, v) {
			t.Errorf("All dates has no row for %s; rows %q", v.GetString("display_name"), bsLabels(all))
		}
	}
	if got := ebvTotal(t, all); got != 5500+1100+2200+3300 {
		t.Errorf("All dates Total = %d, want every posted expense line, 12100", got)
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorOrder(t *testing.T) {
	b := newEBVBook(t)
	// alpha and gamma tie at 30.00; Beta is the largest; delta is below zero.
	b.postBill(t, apVendor(t, b.apBook, "gamma"), "2026-10-05", billAmount{b.expense, 3000})
	b.postBill(t, apVendor(t, b.apBook, "Beta"), "2026-10-05", billAmount{b.expense, 7000})
	b.postBill(t, apVendor(t, b.apBook, "alpha"), "2026-10-05", billAmount{b.expense, 3000})
	apVendorCredit(t, b.apBook, apVendor(t, b.apBook, "delta"), "2026-10-06", 500)
	// No vendor, larger than every vendor.
	b.postEntry(t, "2026-10-07", nil, b.rent, 90000)

	byName := b.run(t, map[string]any{"period": ebvOctober, "order": "name"})
	if got, want := cbDepth0(byName), []string{"alpha", "Beta", "delta", "gamma", "No vendor"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = name: vendor rows %q, want %q (name order ignoring case, No vendor last)", got, want)
	}
	if byDefault := b.run(t, map[string]any{"period": ebvOctober}); !reflect.DeepEqual(bsLabels(byDefault), bsLabels(byName)) {
		t.Errorf("no Order param gives %q, want Name's %q", bsLabels(byDefault), bsLabels(byName))
	}
	byAmount := b.run(t, map[string]any{"period": ebvOctober, "order": "amount"})
	if got, want := cbDepth0(byAmount), []string{"Beta", "alpha", "gamma", "delta", "No vendor"}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = amount: vendor rows %q, want %q (largest first, ties by name, No vendor last)", got, want)
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorInactive(t *testing.T) {
	b := newEBVBook(t)
	sleepy := apVendor(t, b.apBook, "Sleepy Supply")
	awake := apVendor(t, b.apBook, "Awake Supply")
	b.postBill(t, sleepy, "2026-10-05", billAmount{b.expense, 10000})
	b.postBill(t, awake, "2026-10-05", billAmount{b.expense, 20000})
	if err := setFields(t, b.app, "books_vendors", sleepy.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Sleepy Supply inactive: %v", err)
	}

	res := b.run(t, map[string]any{"period": ebvOctober})
	sleepyRow := ebvVendorRow(t, res, sleepy)
	if !sleepyRow.Muted || sleepyRow.Label != "Sleepy Supply (inactive)" {
		t.Errorf("the inactive vendor = label %q muted %v, want \"Sleepy Supply (inactive)\" muted", sleepyRow.Label, sleepyRow.Muted)
	}
	if got := amt(t, sleepyRow, "amount"); got != 10000 {
		t.Errorf("Sleepy Supply = %d, want 10000", got)
	}
	awakeRow := ebvVendorRow(t, res, awake)
	if awakeRow.Muted || strings.HasSuffix(awakeRow.Label, " (inactive)") {
		t.Errorf("the active vendor = label %q muted %v, want \"Awake Supply\" not muted", awakeRow.Label, awakeRow.Muted)
	}
	if totalOf(t, res).Muted {
		t.Errorf("the Total row is muted, want never")
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorOneLevel(t *testing.T) {
	b := newEBVBook(t)
	b.postBill(t, apVendor(t, b.apBook, "One Co"), "2026-10-05", billAmount{b.expense, 1000})
	b.postBill(t, apVendor(t, b.apBook, "Two Co"), "2026-10-05", billAmount{b.office, 2000})
	b.postExpense(t, nil, "2026-10-09", billAmount{b.office, 500})

	spec, _, err := reports.Load(expensesByVendorShipped().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(spec.Groups) != 1 {
		t.Errorf("the spec has %d group levels, want 1 (the vendor)", len(spec.Groups))
	}

	res := b.run(t, map[string]any{"period": ebvOctober})
	totals := 0
	for i, r := range res.Rows {
		switch r.Kind {
		case reports.KindGroup:
			if r.Level != 1 || r.Depth != 0 {
				t.Errorf("group row %q at level %d depth %d, want level 1 depth 0", r.Label, r.Level, r.Depth)
			}
		case reports.KindTotal:
			totals++
			if i != len(res.Rows)-1 {
				t.Errorf("the Total row is row %d of %d, want the last", i+1, len(res.Rows))
			}
		default:
			t.Errorf("row %q is a %s row, want only vendor rows and the Total", r.Label, r.Kind)
		}
	}
	if totals != 1 {
		t.Errorf("the report has %d Total rows, want exactly 1", totals)
	}
	if got := len(ebvVendorRows(res)); got != 3 {
		t.Errorf("%d vendor rows (%q), want One Co, Two Co and No vendor", got, bsLabels(res))
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorEmpty(t *testing.T) {
	b := newEBVBook(t)
	v := apVendor(t, b.apBook, "October Co")
	b.postBill(t, v, "2026-10-05", billAmount{b.expense, 10000})
	if !ebvHasVendor(b.run(t, map[string]any{"period": ebvOctober}), v) {
		t.Fatal("October has no row for October Co: the book must hold a posted expense line")
	}
	file := readEBVSpecFile(t)
	res := b.run(t, map[string]any{"period": ebvPeriod(file.EmptyFrom, file.EmptyTo)})
	// Core always emits the Total row; the report view shows the empty text
	// when no other row is there. Its sum over no lines is blank (SQL NULL).
	if len(res.Rows) != 1 || res.Rows[0].Kind != reports.KindTotal {
		t.Fatalf("%s to %s: the report has the rows %q, want the Total row only", file.EmptyFrom, file.EmptyTo, bsLabels(res))
	}
	if got, ok := moneyCell(t, res.Rows[0], "amount"); ok && got != 0 {
		t.Errorf("%s to %s: the Total is %d, want 0 or blank", file.EmptyFrom, file.EmptyTo, got)
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorNoAccess(t *testing.T) {
	b := newEBVBook(t)
	v := apVendor(t, b.apBook, "Seen Co")
	b.postBill(t, v, "2026-10-05", billAmount{b.expense, 10000})
	if !ebvHasVendor(b.run(t, map[string]any{"period": ebvOctober}), v) {
		t.Fatal("the Books reader does not see Seen Co")
	}
	res, err := runEBVErr(t, b.app, b.none, map[string]any{"period": ebvOctober}, reports.Options{})
	if err != nil {
		t.Fatalf("the run of a user with Books level none was refused (%v); core runs it with the rule's rows", err)
	}
	if rows := ebvVendorRows(res); len(rows) != 0 {
		t.Errorf("a user with Books level none sees vendor rows %q", labelsOf(rows))
	}
	requireNoDrift(t, b.app)
}

// Register ships the Expenses by Vendor; core creates it unpublished, and
// Books shares it with every Books reader.
func TestExpensesByVendorShippedShared(t *testing.T) {
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
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": "books.expenses_by_vendor"})
	if err != nil {
		t.Fatalf("no reports row with shipped_key books.expenses_by_vendor: %v", err)
	}
	if row.GetBool("published") || row.GetString("published_by") != "" {
		t.Errorf("published = %v (by %q), want unpublished", row.GetBool("published"), row.GetString("published_by"))
	}
	if row.GetString("title") != "Expenses by Vendor" || row.GetInt("shipped_revision") != 2 || row.GetString("source") != "books.basis_lines" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a guest with Books readonly access")
	requireNoShare(t, app, row, outsider, "a guest without Books access")
	requireNoDrift(t, app)
}

// Checkpoint 2: an opened vendor's lines, the cash-basis rows on Method =
// Cash, the path a line opens, the run's topics and the CSV (spec §3 Opening
// a vendor, Opening a transaction, Live, Export; plan D3, D4, D9). The wanted
// Cash labels were written from a dumped Cash run (a bill of 700.00 and
// 300.00 with a payment of 400.00, a vendor credit applied, a vendor credit
// refunded, a void bill, an expense) and from D3.

const (
	ebvOfficeLabel   = "6150 Office Expenses"
	ebvSoftwareLabel = "6200 Software Subscriptions"
)

// ebvRunOpen runs the shipped Expenses by Vendor as b's reader on ebvToday
// with the vendor rows keyed by keys opened, as the view asks when a reader
// presses rows.
func ebvRunOpen(t *testing.T, b ebvBook, params map[string]any, keys ...[]any) *reports.Result {
	t.Helper()
	return runEBVOpenAs(t, b.app, b.reader, params, keys...)
}

func runEBVOpenAs(t *testing.T, app core.App, reader *core.Record, params map[string]any, keys ...[]any) *reports.Result {
	t.Helper()
	res, err := runEBVErr(t, app, reader, params, reports.Options{Expand: keys, Collapse: [][]any{}})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// ebvLinesUnder are the detail rows right after row, in result order.
func ebvLinesUnder(t *testing.T, res *reports.Result, row reports.Row) []reports.Row {
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

// ebvLine is what a test reads of an opened line: its label and its Total.
type ebvLine struct {
	Label  string
	Amount int64
}

// ebvLinesOf reads opened lines, and fails a line whose % of expenses is not
// blank.
func ebvLinesOf(t *testing.T, rows []reports.Row) []ebvLine {
	t.Helper()
	out := make([]ebvLine, len(rows))
	for i, r := range rows {
		requireEBVBlankShare(t, r, "an opened line")
		out[i] = ebvLine{Label: r.Label, Amount: amt(t, r, "amount")}
	}
	return out
}

func ebvLinesSum(lines []ebvLine) int64 {
	var sum int64
	for _, l := range lines {
		sum += l.Amount
	}
	return sum
}

// ebvRowOf is vendor's row, or the No vendor row when vendor is nil.
func ebvRowOf(t *testing.T, res *reports.Result, vendor *core.Record) reports.Row {
	t.Helper()
	if vendor == nil {
		r, ok := cbGroupRow(res, 1, "")
		if !ok {
			t.Fatalf("no No vendor row; rows %q", bsLabels(res))
		}
		return r
	}
	return ebvVendorRow(t, res, vendor)
}

// ebvOpenVendor runs params with every row closed, then with vendor's row
// opened (nil: the No vendor row), and gives the opened run's row and lines.
func ebvOpenVendor(t *testing.T, b ebvBook, params map[string]any, vendor *core.Record) (reports.Row, []reports.Row) {
	t.Helper()
	closed := b.run(t, params)
	res := ebvRunOpen(t, b, params, ebvRowOf(t, closed, vendor).GroupKey)
	row := ebvRowOf(t, res, vendor)
	return row, ebvLinesUnder(t, res, row)
}

// ebvAccountText is Books accountLabel() written by hand: "<number> <full
// name>", the full name alone when the account has no number.
func ebvAccountText(t *testing.T, app core.App, accountID string) string {
	t.Helper()
	account := reload(t, app, "books_accounts", accountID)
	if number := account.GetString("number"); number != "" {
		return number + " " + account.GetString("full_name")
	}
	return account.GetString("full_name")
}

// ebvLedgerLabel is the label the spec gives a posted line: "<date> · <type
// and number> · <account> · <the line's memo, else the entry's memo>", the
// description left out with its " · " when blank.
func ebvLedgerLabel(t *testing.T, app core.App, line *core.Record, typeNumber string) string {
	t.Helper()
	line = reload(t, app, "books_journal_lines", line.Id)
	label := line.GetString("date") + " · " + typeNumber + " · " + ebvAccountText(t, app, line.GetString("account"))
	if desc := balanceLineDesc(t, app, line); desc != "" {
		label += " · " + desc
	}
	return label
}

// ebvLedgerLine is a posted line as an opened row: its label and debit less
// credit.
func ebvLedgerLine(t *testing.T, app core.App, line *core.Record, typeNumber string) ebvLine {
	t.Helper()
	line = reload(t, app, "books_journal_lines", line.Id)
	return ebvLine{Label: ebvLedgerLabel(t, app, line, typeNumber), Amount: int64(line.GetInt("debit") - line.GetInt("credit"))}
}

func ebvEntryNumber(t *testing.T, app core.App, entryID string) string {
	t.Helper()
	return reload(t, app, "books_journal_entries", entryID).GetString("number")
}

func requireEBVLines(t *testing.T, what string, got, want []ebvLine) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("%s opens into\n%+v\nwant\n%+v", what, got, want)
	}
}

func TestExpensesByVendorDetailLabels(t *testing.T) {
	b := newEBVBook(t)
	v := apVendor(t, b.apBook, "Label Co")
	draft := mkBill(t, b.app, v, map[string]any{"date": "2026-10-05", "due_date": "2026-10-05", "memo": "Spring supplies"})
	mkBillLine(t, b.app, draft, 0, accountLine(b.office, 70000))
	mkBillLine(t, b.app, draft, 1, accountLine(b.expense, 30000))
	bill := mustPostBill(t, b.app, draft.Id, b.users.bookkeeper.Id)
	exp := b.postExpense(t, v, "2026-10-06", billAmount{b.office, 2500})
	credit := apVendorCredit(t, b.apBook, v, "2026-10-07", 5000)
	manual := b.postEntry(t, "2026-10-08", v, b.expense, 1200)

	billNo := apNo(t, b.apBook, bill)
	want := []ebvLine{
		ebvLedgerLine(t, b.app, entryLineOn(t, b.app, bill.GetString("entry"), b.office), "Bill "+billNo),
		ebvLedgerLine(t, b.app, entryLineOn(t, b.app, bill.GetString("entry"), b.expense), "Bill "+billNo),
		ebvLedgerLine(t, b.app, entryLineOn(t, b.app, exp.GetString("entry"), b.office), "Expense "+apNo(t, b.apBook, exp)),
		ebvLedgerLine(t, b.app, entryLineOn(t, b.app, credit.GetString("entry"), b.expense), "Vendor credit "+apNo(t, b.apBook, credit)),
		ebvLedgerLine(t, b.app, entryLineOn(t, b.app, manual.Id, b.expense), "Journal entry "+ebvEntryNumber(t, b.app, manual.Id)),
	}
	// The wanted labels name each line's account by hand, so a helper that
	// read the label from the run could not pass this test.
	for i, prefix := range []string{
		"2026-10-05 · Bill " + billNo + " · " + ebvOfficeLabel + " · Spring supplies",
		"2026-10-05 · Bill " + billNo + " · " + ebvSoftwareLabel + " · Spring supplies",
		"2026-10-06 · Expense " + apNo(t, b.apBook, exp) + " · " + ebvOfficeLabel,
		"2026-10-07 · Vendor credit " + apNo(t, b.apBook, credit) + " · " + ebvSoftwareLabel,
		"2026-10-08 · Journal entry " + ebvEntryNumber(t, b.app, manual.Id) + " · " + ebvSoftwareLabel + " · Expense adjustment",
	} {
		if !strings.HasPrefix(want[i].Label, prefix) {
			t.Fatalf("wanted line %d = %q, want it to start %q", i, want[i].Label, prefix)
		}
	}
	for i, cents := range []int64{70000, 30000, 2500, -5000, 1200} {
		if want[i].Amount != cents {
			t.Fatalf("wanted line %d = %d, want debit less credit %d", i, want[i].Amount, cents)
		}
	}

	row, rows := ebvOpenVendor(t, b, map[string]any{"period": ebvOctober}, v)
	got := ebvLinesOf(t, rows)
	requireEBVLines(t, "Label Co", got, want)
	if sum, total := ebvLinesSum(got), amt(t, row, "amount"); sum != total || total != 98700 {
		t.Errorf("Label Co's lines add up to %d, its Total is %d; want both 98700", sum, total)
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorDetailLabelParts(t *testing.T) {
	b := newEBVBook(t)
	v := apVendor(t, b.apBook, "Parts Co")
	plain := mkAccount(t, b.app, "Unnumbered Supplies", "expense", "office_general")
	child := saveRecord(t, b.app, "books_accounts", map[string]any{
		"name": "Postage", "number": "6151", "type": "expense", "detail_type": "office_general",
		"parent": b.office.Id, "currency": "USD",
	})
	if got := reload(t, b.app, "books_accounts", child.Id).GetString("full_name"); got != "Office Expenses:Postage" {
		t.Fatalf("the child account's full name is %q, want Office Expenses:Postage", got)
	}
	entry := postJournal(t, b.app, "", "2026-10-05", "",
		jnLine{account: plain, debit: 1000, position: 0, vendor: v.Id, memo: "Paper"},
		jnLine{account: child, debit: 2000, position: 1, vendor: v.Id},
		jnLine{account: b.bank, credit: 3000, position: 2})
	entryNo := ebvEntryNumber(t, b.app, entry.Id)
	plainLine := entryLineOn(t, b.app, entry.Id, plain)
	childLine := entryLineOn(t, b.app, entry.Id, child)
	if desc := balanceLineDesc(t, b.app, childLine); desc != "" {
		t.Fatalf("the child account's line has the description %q; the test needs a blank one", desc)
	}

	draft := mkBill(t, b.app, v, map[string]any{"date": "2026-10-06", "due_date": "2026-10-06", "memo": "Office chairs"})
	mkBillLine(t, b.app, draft, 0, accountLine(b.expense, 30000))
	bill := mustPostBill(t, b.app, draft.Id, b.users.bookkeeper.Id)
	number := apNo(t, b.apBook, bill)
	if err := voidBillAs(b.app, bill.Id, b.users.admin.Id); err != nil {
		t.Fatalf("void the bill: %v", err)
	}
	rev, err := b.app.FindFirstRecordByFilter("books_journal_entries", "reverses = {:e} && origin = 'void_reversal'",
		dbx.Params{"e": bill.GetString("entry")})
	if err != nil {
		t.Fatalf("no void reversal of the bill's entry: %v", err)
	}
	original := entryLineOn(t, b.app, bill.GetString("entry"), b.expense)
	reversal := entryLineOn(t, b.app, rev.Id, b.expense)

	_, rows := ebvOpenVendor(t, b, map[string]any{"period": ebvOctober, "rows": "activity"}, v)
	labels := map[string]string{}
	for _, r := range rows {
		labels[r.ID] = r.Label
	}
	want := map[string]string{
		"d:" + plainLine.Id: "2026-10-05 · Journal entry " + entryNo + " · Unnumbered Supplies · Paper",
		"d:" + childLine.Id: "2026-10-05 · Journal entry " + entryNo + " · 6151 Office Expenses:Postage",
		"d:" + original.Id:  "2026-10-06 · Bill " + number + " · " + ebvSoftwareLabel + " · " + balanceLineDesc(t, b.app, original),
		"d:" + reversal.Id:  "2026-10-06 · Void reversal of " + number + " · " + ebvSoftwareLabel + " · Void of " + number,
	}
	if !reflect.DeepEqual(labels, want) {
		t.Errorf("Parts Co opens into\n%q\nwant (an unnumbered account by its full name, a child by its full name, no trailing \" · \" on a blank description, the reversal's number once)\n%q", labels, want)
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorDetailOrder(t *testing.T) {
	b := newEBVBook(t)
	v := apVendor(t, b.apBook, "Order Co")
	line := func(id string, cents, position int) jnLine {
		return jnLine{id: id, account: b.expense, debit: cents, position: position, vendor: v.Id}
	}
	bank := func(cents, position int) jnLine { return jnLine{account: b.bank, credit: cents, position: position} }

	// The last day, posted earliest: the date decides before the posting time.
	late := postJournal(t, b.app, "", "2026-10-07", "Late day", line("ebvord000000001", 100, 0), bank(100, 1))
	setPostedAt(t, b.app, late.Id, "2026-11-12 08:00:00.000Z")
	// Two entries on one day: posting order decides (the ids sort the other way).
	madeFirst := postJournal(t, b.app, "", "2026-10-05", "Same day, made first", line("ebvsame00000001", 200, 0), bank(200, 1))
	madeSecond := postJournal(t, b.app, "", "2026-10-05", "Same day, made second", line("ebvsame99999999", 300, 0), bank(300, 1))
	setPostedAt(t, b.app, madeFirst.Id, "2026-11-12 11:00:00.000Z")
	setPostedAt(t, b.app, madeSecond.Id, "2026-11-12 10:00:00.000Z")
	// Two lines of one entry: position decides (the ids sort the other way).
	split := postJournal(t, b.app, "", "2026-10-03", "Split",
		line("ebvpos000000001", 400, 1), line("ebvpos999999999", 500, 0), bank(900, 2))
	setPostedAt(t, b.app, split.Id, "2026-11-12 12:00:00.000Z")

	ids := func() []string {
		t.Helper()
		_, rows := ebvOpenVendor(t, b, map[string]any{"period": ebvOctober}, v)
		out := make([]string, len(rows))
		for i, r := range rows {
			out[i] = r.ID
		}
		return out
	}
	want := []string{"d:ebvpos999999999", "d:ebvpos000000001", "d:ebvsame99999999", "d:ebvsame00000001", "d:ebvord000000001"}
	if got := ids(); !reflect.DeepEqual(got, want) {
		t.Errorf("Order Co's lines = %q, want %q (date, then posting time, then position)", got, want)
	}

	setPostedAt(t, b.app, madeFirst.Id, "2026-11-12 09:00:00.000Z")
	want = []string{"d:ebvpos999999999", "d:ebvpos000000001", "d:ebvsame00000001", "d:ebvsame99999999", "d:ebvord000000001"}
	if got := ids(); !reflect.DeepEqual(got, want) {
		t.Errorf("after the posting order flips, Order Co's lines = %q, want %q", got, want)
	}
	requireNoDrift(t, b.app)
}

// D3: a cash-basis row carries its source line's vendor and account; a
// take-out row names the bill's entry, a share row the payment's.
func TestExpensesByVendorCashRowsCarryVendorAndAccount(t *testing.T) {
	b := newEBVBook(t)
	v := apVendor(t, b.apBook, "Cash Rows Co")
	bill := b.postBill(t, v, "2026-10-05", billAmount{b.office, 70000}, billAmount{b.expense, 30000})
	pay := b.payOn(t, v, "2026-11-03", payLine{bill, 40000})
	billNo := apNo(t, b.apBook, bill)

	stored, err := b.app.FindRecordsByFilter("books_cash_basis_lines", "account = {:o} || account = {:e}", "", 0, 0,
		dbx.Params{"o": b.office.Id, "e": b.expense.Id})
	if err != nil {
		t.Fatalf("read the cash-basis rows: %v", err)
	}
	type cashShape struct {
		Entry, PaymentEntry, Account, Vendor, Memo string
		Debit, Credit                              int
	}
	got := make([]cashShape, len(stored))
	for i, r := range stored {
		got[i] = cashShape{
			Entry: r.GetString("entry"), PaymentEntry: r.GetString("payment_entry"), Account: r.GetString("account"),
			Vendor: r.GetString("vendor"), Memo: r.GetString("memo"), Debit: r.GetInt("debit"), Credit: r.GetInt("credit"),
		}
	}
	billEntry, payEntry := bill.GetString("entry"), pay.GetString("entry")
	unpaid, paid := "Unpaid bill (cash basis)", "Bill "+billNo+" paid (cash basis)"
	want := []cashShape{
		{Entry: billEntry, Account: b.office.Id, Vendor: v.Id, Memo: unpaid, Credit: 70000},
		{Entry: billEntry, Account: b.expense.Id, Vendor: v.Id, Memo: unpaid, Credit: 30000},
		{Entry: payEntry, PaymentEntry: payEntry, Account: b.office.Id, Vendor: v.Id, Memo: paid, Debit: 28000},
		{Entry: payEntry, PaymentEntry: payEntry, Account: b.expense.Id, Vendor: v.Id, Memo: paid, Debit: 12000},
	}
	order := func(x, y cashShape) int {
		return strings.Compare(fmt.Sprint(x), fmt.Sprint(y))
	}
	slices.SortFunc(got, order)
	slices.SortFunc(want, order)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("the cash-basis rows on the expense accounts =\n%+v\nwant\n%+v", got, want)
	}
	requireNoDrift(t, b.app)
}

// D3, D4: the cash-basis rows of an opened vendor, step by step.
func TestExpensesByVendorCashDetail(t *testing.T) {
	b := newEBVBook(t)
	v := apVendor(t, b.apBook, "Cash Detail Co")
	cash := map[string]any{"period": ebvPeriod("2026-10-01", "2026-11-30"), "method": "cash"}

	// open opens the vendor on params and checks that its lines add up to its
	// Total, and that the Total is the Cash Profit and Loss's three expense
	// sections (the vendor holds every expense line of the book).
	open := func(step string, params map[string]any) []ebvLine {
		t.Helper()
		row, rows := ebvOpenVendor(t, b, params, v)
		lines := ebvLinesOf(t, rows)
		total := amt(t, row, "amount")
		if sum := ebvLinesSum(lines); sum != total {
			t.Errorf("%s: the lines add up to %d, want the vendor's Total %d", step, sum, total)
		}
		pl := runPL(t, b.app, profitAndLossShipped(), b.reader, params, reports.Options{Today: ebvToday})
		if want := plExpenseSections(t, pl); total != want {
			t.Errorf("%s: the vendor's Total %d, want the Profit and Loss's expense sections %d", step, total, want)
		}
		return lines
	}
	requireHas := func(step string, lines []ebvLine, want ...ebvLine) {
		t.Helper()
		for _, w := range want {
			if !slices.Contains(lines, w) {
				t.Errorf("%s: no line %q %d; lines\n%+v", step, w.Label, w.Amount, lines)
			}
		}
	}

	// A bill of 1,000.00 (700.00, 300.00) with a payment of 400.00.
	bill := b.postBill(t, v, "2026-10-05", billAmount{b.office, 70000}, billAmount{b.expense, 30000})
	pay := b.payOn(t, v, "2026-11-03", payLine{bill, 40000})
	billNo, payNo := apNo(t, b.apBook, bill), apNo(t, b.apBook, pay)
	billOn := "2026-10-05 · Bill " + billNo + " · "
	paidOn := "2026-11-03 · Bill payment " + payNo + " · "
	paid := " · Bill " + billNo + " paid (cash basis)"
	lines := open("the part-paid bill", cash)
	requireEBVLines(t, "the part-paid bill", lines, []ebvLine{
		{billOn + ebvOfficeLabel, 70000},
		{billOn + ebvOfficeLabel + " · Unpaid bill (cash basis)", -70000},
		{billOn + ebvSoftwareLabel, 30000},
		{billOn + ebvSoftwareLabel + " · Unpaid bill (cash basis)", -30000},
		{paidOn + ebvOfficeLabel + paid, 28000},
		{paidOn + ebvSoftwareLabel + paid, 12000},
	})
	if sum := ebvLinesSum(lines); sum != 40000 {
		t.Errorf("the part-paid bill's lines add up to %d, want the paid 40000", sum)
	}

	// A vendor credit is taken out on its date.
	credit := apVendorCredit(t, b.apBook, v, "2026-10-06", 5000)
	creditNo := apNo(t, b.apBook, credit)
	creditOn := "2026-10-06 · Vendor credit " + creditNo + " · " + ebvSoftwareLabel
	requireHas("the vendor credit", open("the vendor credit", cash),
		ebvLine{creditOn, -5000},
		ebvLine{creditOn + " · Unapplied vendor credit (cash basis)", 5000})

	// A second bill paid in part by the vendor credit.
	bill2 := b.postBill(t, v, "2026-10-07", billAmount{b.expense, 20000})
	apApply(t, b.apBook, credit, reload(t, b.app, "books_bills", bill2.Id), "2026-11-05", 5000)
	appliedOn := "2026-11-05 · Vendor credit " + creditNo + " · " + ebvSoftwareLabel
	requireHas("the application", open("the application", cash),
		ebvLine{appliedOn + " · Bill " + apNo(t, b.apBook, bill2) + " paid by vendor credit (cash basis)", 5000},
		ebvLine{appliedOn + " · Vendor credit " + creditNo + " applied (cash basis)", -5000})

	// A vendor credit refunded.
	refunded := apVendorCredit(t, b.apBook, v, "2026-10-08", 6000)
	refund := apRefund(t, b.apBook, v, "2026-11-06", map[string]int{refunded.Id: 6000})
	requireHas("the refund", open("the refund", cash),
		ebvLine{"2026-11-06 · Vendor refund " + apNo(t, b.apBook, refund) + " · " + ebvSoftwareLabel +
			" · Vendor credit " + apNo(t, b.apBook, refunded) + " refunded (cash basis)", -6000})

	// A void bill: its line, its reversal line and their take-out rows add up
	// to 0 (the set and the sum; D4).
	voided := b.postBill(t, v, "2026-10-09", billAmount{b.expense, 9000})
	voidedNo := apNo(t, b.apBook, voided)
	if err := voidBillAs(b.app, voided.Id, b.users.admin.Id); err != nil {
		t.Fatalf("void the bill: %v", err)
	}
	var onVoidDay []ebvLine
	for _, l := range open("the void", cash) {
		if strings.HasPrefix(l.Label, "2026-10-09 · ") {
			onVoidDay = append(onVoidDay, l)
		}
	}
	wantVoid := []ebvLine{
		{"2026-10-09 · Bill " + voidedNo + " · " + ebvSoftwareLabel, 9000},
		{"2026-10-09 · Bill " + voidedNo + " · " + ebvSoftwareLabel + " · Unpaid bill (cash basis)", -9000},
		{"2026-10-09 · Void reversal of " + voidedNo + " · " + ebvSoftwareLabel + " · Void of " + voidedNo, -9000},
		{"2026-10-09 · Void reversal of " + voidedNo + " · " + ebvSoftwareLabel + " · Unpaid bill (cash basis)", 9000},
	}
	byLabel := func(x, y ebvLine) int { return strings.Compare(fmt.Sprint(x), fmt.Sprint(y)) }
	slices.SortFunc(onVoidDay, byLabel)
	slices.SortFunc(wantVoid, byLabel)
	requireEBVLines(t, "the void bill's day", onVoidDay, wantVoid)
	if sum := ebvLinesSum(onVoidDay); sum != 0 {
		t.Errorf("the void bill's rows add up to %d, want 0", sum)
	}

	// An expense has one row on both Methods.
	exp := b.postExpense(t, v, "2026-10-10", billAmount{b.office, 2500})
	expOn := "2026-10-10 · Expense " + apNo(t, b.apBook, exp)
	for _, method := range []string{"cash", "accrual"} {
		params := map[string]any{"period": cash["period"], "method": method}
		var rows []ebvLine
		for _, l := range open("the expense, "+method, params) {
			if strings.HasPrefix(l.Label, expOn+" · ") {
				rows = append(rows, l)
			}
		}
		requireEBVLines(t, "the expense on "+method, rows, []ebvLine{{expOn + " · " + ebvOfficeLabel, 2500}})
	}
	requireNoDrift(t, b.app)
}

// D9: on Cash a write-off's bad debt line and its take-out row are under No
// vendor and add up to 0.
func TestExpensesByVendorWriteOffCashRows(t *testing.T) {
	we := newWriteOffEnv(t)
	registerBooksSources(t)
	inv := we.postedInvoice(t, 25000)
	we.mkWriteOff(t, inv, nil)
	reader := we.users.readOnly
	params := map[string]any{"period": ebvPeriod("2026-11-01", "2026-11-30"), "method": "cash", "rows": "activity"}

	closed := runEBV(t, we.app, reader, params, reports.Options{})
	res := runEBVOpenAs(t, we.app, reader, params, ebvRowOf(t, closed, nil).GroupKey)
	none := ebvRowOf(t, res, nil)
	lines := ebvLinesOf(t, ebvLinesUnder(t, res, none))
	if len(lines) != 2 {
		t.Fatalf("No vendor opens into %+v, want the bad debt line and its take-out row", lines)
	}
	badDebt := ebvAccountText(t, we.app, we.badDebts.Id)
	if badDebt != "6050 Bad debts" {
		t.Fatalf("the bad debts account reads %q, want 6050 Bad debts", badDebt)
	}
	var line, takeOut ebvLine
	for _, l := range lines {
		if l.Amount > 0 {
			line = l
		} else {
			takeOut = l
		}
	}
	if line.Amount != 25000 || !strings.HasPrefix(line.Label, writeOffDay+" · ") || !strings.Contains(line.Label, " · "+badDebt) {
		t.Errorf("the bad debt line = %q %d, want 25000 dated %s on %s", line.Label, line.Amount, writeOffDay, badDebt)
	}
	if takeOut.Amount != -25000 || !strings.HasPrefix(takeOut.Label, writeOffDay+" · ") ||
		!strings.HasSuffix(takeOut.Label, " · "+badDebt+" · Write-off (cash basis)") {
		t.Errorf("the take-out row = %q %d, want -25000 dated %s ending \" · %s · Write-off (cash basis)\"", takeOut.Label, takeOut.Amount, writeOffDay, badDebt)
	}
	if sum := ebvLinesSum(lines); sum != 0 || amt(t, none, "amount") != 0 {
		t.Errorf("No vendor's lines add up to %d (row %d), want 0", sum, amt(t, none, "amount"))
	}
	requireNoDrift(t, we.app)
}

func TestExpensesByVendorNoVendorOpens(t *testing.T) {
	b := newEBVBook(t)
	b.postBill(t, apVendor(t, b.apBook, "Named Co"), "2026-10-05", billAmount{b.expense, 2000})
	exp := b.postExpense(t, nil, "2026-10-09", billAmount{b.office, 9000})
	manual := b.postEntry(t, "2026-10-10", nil, b.rent, 1000)

	want := []ebvLine{
		ebvLedgerLine(t, b.app, entryLineOn(t, b.app, exp.GetString("entry"), b.office), "Expense "+apNo(t, b.apBook, exp)),
		ebvLedgerLine(t, b.app, entryLineOn(t, b.app, manual.Id, b.rent), "Journal entry "+ebvEntryNumber(t, b.app, manual.Id)),
	}
	if !strings.HasPrefix(want[0].Label, "2026-10-09 · Expense "+apNo(t, b.apBook, exp)+" · "+ebvOfficeLabel) ||
		!strings.HasPrefix(want[1].Label, "2026-10-10 · Journal entry "+ebvEntryNumber(t, b.app, manual.Id)+" · 6100 Rent") {
		t.Fatalf("wanted labels %+v", want)
	}
	row, rows := ebvOpenVendor(t, b, map[string]any{"period": ebvOctober}, nil)
	got := ebvLinesOf(t, rows)
	requireEBVLines(t, "No vendor", got, want)
	if sum, total := ebvLinesSum(got), amt(t, row, "amount"); sum != total || total != 10000 {
		t.Errorf("No vendor's lines add up to %d, its Total is %d; want both 10000", sum, total)
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorDetailOpen(t *testing.T) {
	b := newEBVBook(t)
	v := apVendor(t, b.apBook, "Open Co")
	bill := b.postBill(t, v, "2026-10-05", billAmount{b.office, 10000})
	pay := b.payOn(t, v, "2026-10-20", payLine{bill, 4000})
	exp := b.postExpense(t, v, "2026-10-06", billAmount{b.office, 2500})
	credit := apVendorCredit(t, b.apBook, v, "2026-10-07", 500)
	manual := b.postEntry(t, "2026-10-08", v, b.expense, 1200)

	opens := func(params map[string]any) map[string]string {
		t.Helper()
		_, rows := ebvOpenVendor(t, b, params, v)
		out := map[string]string{}
		for _, r := range rows {
			out[r.ID] = r.Open
		}
		return out
	}
	accrual := opens(map[string]any{"period": ebvOctober})
	want := map[string]string{
		"d:" + entryLineOn(t, b.app, bill.GetString("entry"), b.office).Id:    apRoute(t, b.app, "bill", bill),
		"d:" + entryLineOn(t, b.app, exp.GetString("entry"), b.office).Id:     apRoute(t, b.app, "expense", exp),
		"d:" + entryLineOn(t, b.app, credit.GetString("entry"), b.expense).Id: apRoute(t, b.app, "vendor_credit", credit),
		"d:" + entryLineOn(t, b.app, manual.Id, b.expense).Id:                 "books/entries/" + urlKey(t, b.app, manual),
	}
	if !reflect.DeepEqual(accrual, want) {
		t.Errorf("Accrual: the opened lines open\n%q\nwant\n%q", accrual, want)
	}

	// On Cash a take-out row opens its document and a share row its payment.
	_, rows := ebvOpenVendor(t, b, map[string]any{"period": ebvOctober, "method": "cash"}, v)
	for _, r := range rows {
		wantOpen := ""
		switch {
		case strings.Contains(r.Label, " paid (cash basis)"):
			wantOpen = apRoute(t, b.app, "bill_payment", pay)
		case strings.HasPrefix(r.Label, "2026-10-05 · Bill "):
			wantOpen = apRoute(t, b.app, "bill", bill)
		case strings.HasPrefix(r.Label, "2026-10-07 · Vendor credit "):
			wantOpen = apRoute(t, b.app, "vendor_credit", credit)
		default:
			wantOpen = accrual[r.ID]
		}
		if r.Open != wantOpen || wantOpen == "" {
			t.Errorf("Cash: %q opens %q, want %q", r.Label, r.Open, wantOpen)
		}
	}
	requireNoDrift(t, b.app)
}

func TestExpensesByVendorTopics(t *testing.T) {
	b := newEBVBook(t)
	v := apVendor(t, b.apBook, "Topic Co")
	b.postBill(t, v, "2026-10-05", billAmount{b.expense, 10000})
	// On Cash the unpaid bill nets to 0, so With activity keeps the vendor; the
	// run then reads both layers of books.basis_lines.
	params := map[string]any{"period": ebvOctober, "method": "cash", "rows": "activity"}
	closed := b.run(t, params)
	opened := ebvRunOpen(t, b, params, ebvVendorRow(t, closed, v).GroupKey)
	if lines := ebvLinesUnder(t, opened, ebvVendorRow(t, opened, v)); len(lines) == 0 {
		t.Fatalf("Topic Co did not open; rows %q", bsLabels(opened))
	}
	// Plan D11 (human, 2026-11-21): the report reads books.basis_lines, a source
	// core marks NotLive, and ships with Live false, as the six journal-line
	// reports do: each run is manual and follows no topic; the reader presses
	// Refresh. Core sets Manual and leaves Topics empty (reports/run.go).
	requireManual(t, closed)
	requireManual(t, opened)
	requireManual(t, b.run(t, map[string]any{"period": ebvOctober}))
	requireNoDrift(t, b.app)
}

// exportEBVCSV is the CSV export of the shipped Expenses by Vendor as reader
// (exportShippedCSV).
func exportEBVCSV(t testing.TB, b ebvBook, reader *core.Record, params map[string]any) string {
	t.Helper()
	return exportShippedCSV(t, b.app, expensesByVendorShipped(), expensesByVendorKey, ebvToday, reader, params)
}

func TestExpensesByVendorCSVOpensEveryGroup(t *testing.T) {
	b := newEBVBook(t)
	alpha := apVendor(t, b.apBook, "Csv Alpha")
	alphaBill := b.postBill(t, alpha, "2026-10-01", billAmount{b.office, 20000}, billAmount{b.expense, 5000})
	beta := apVendor(t, b.apBook, "Csv Beta")
	betaExp := b.postExpense(t, beta, "2026-10-02", billAmount{b.expense, 4000})
	none := b.postEntry(t, "2026-10-04", nil, b.rent, 3000)
	params := map[string]any{"period": ebvOctober}

	text := exportEBVCSV(t, b, b.reader, params)
	records, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(text, "\xef\xbb\xbf"))).ReadAll()
	if err != nil {
		t.Fatalf("read the CSV: %v\n%s", err, text)
	}
	if len(records) == 0 {
		t.Fatal("the CSV has no line")
	}
	if want := []string{"Vendor", "Total", "% of expenses"}; !reflect.DeepEqual(records[0], want) {
		t.Errorf("the heading line = %q, want %q", records[0], want)
	}

	type record struct {
		Label      string
		Cents      int64
		ShareBlank bool
	}
	got := make([]record, 0, len(records))
	for _, r := range records[1:] {
		if len(r) < 3 {
			t.Fatalf("CSV record %q has no Total or %% of expenses", r)
		}
		got = append(got, record{r[0], int64(apCSVCents(t, r[1])), r[2] == ""})
	}

	run := b.run(t, params)
	line := func(l ebvLine) record { return record{l.Label, l.Amount, true} }
	alphaNo := apNo(t, b.apBook, alphaBill)
	want := []record{
		{"Csv Alpha", ebvAmount(t, run, alpha), false},
		line(ebvLedgerLine(t, b.app, entryLineOn(t, b.app, alphaBill.GetString("entry"), b.office), "Bill "+alphaNo)),
		line(ebvLedgerLine(t, b.app, entryLineOn(t, b.app, alphaBill.GetString("entry"), b.expense), "Bill "+alphaNo)),
		{"Csv Beta", ebvAmount(t, run, beta), false},
		line(ebvLedgerLine(t, b.app, entryLineOn(t, b.app, betaExp.GetString("entry"), b.expense), "Expense "+apNo(t, b.apBook, betaExp))),
		{"No vendor", amt(t, bsRow(t, run, "No vendor"), "amount"), false},
		line(ebvLedgerLine(t, b.app, entryLineOn(t, b.app, none.Id, b.rent), "Journal entry "+ebvEntryNumber(t, b.app, none.Id))),
		{"Total", ebvTotal(t, run), false},
	}
	if want[0].Cents != 25000 || want[3].Cents != 4000 || want[5].Cents != 3000 || want[7].Cents != 32000 {
		t.Fatalf("the closed run's figures %+v, want Csv Alpha 25000, Csv Beta 4000, No vendor 3000, Total 32000", want)
	}
	if !strings.HasPrefix(want[1].Label, "2026-10-01 · Bill "+alphaNo+" · "+ebvOfficeLabel) {
		t.Fatalf("the wanted first line %q does not name 6150 Office Expenses", want[1].Label)
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("the CSV records =\n%+v\nwant every vendor followed by its lines (a blank %% of expenses on each line), then No vendor with its line, then the Total\n%+v", got, want)
	}
	requireNoDrift(t, b.app)
}
