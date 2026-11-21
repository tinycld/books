package books

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The two shipped statement reports (spec §3.1, §4.3): Balance forward on
// books.journal_lines and Open items on books.receivable_items. Every run is a
// Books reader's, with a fixed day.

const (
	stToday     = "2026-11-18"
	stFrom      = "2026-11-01"
	stStatement = "2026-11-18"
)

// stBook is one ledger with the invoice, credit memo, payment, write-off and
// credit memo application guards (memoApplyEnv) and Books' report sources.
//
// Aspen Co: an invoice of 100.00 before the period (2026-10-15), written off
// in it (2026-11-10); an invoice of 500.00 (2026-11-02) paid in part with
// 200.00 (2026-11-04) and settled by an overpayment of 400.00 (2026-11-06,
// 300.00 applied, 100.00 unapplied); an invoice of 120.00 (2026-11-07); a
// credit memo of 80.00 (2026-11-08) of which 30.00 is applied to it
// (2026-11-09); an invoice of 70.00 (2026-11-12) that is void. Aspen Co's
// sub-customer Aspen Branch has an invoice of 90.00 (2026-11-05).
type stBook struct {
	me                                      *memoApplyEnv
	app                                     core.App
	reader, none                            *core.Record
	aspen, branch                           *core.Record
	before, invoice, partPay, overPay       *core.Record
	second, memo, writeOff, void, branchInv *core.Record
}

// stPay posts a payment of customer dated day of amount into Business
// Checking, applied to inv.
func stPay(t *testing.T, me *memoApplyEnv, customer, inv *core.Record, day string, amount, applied int64) *core.Record {
	t.Helper()
	p, err := saveNew(me.app, "books_payments", map[string]any{
		"customer": customer.Id, "status": "draft", "date": day, "amount": amount, "deposit_to": me.checking.Id,
	})
	if err != nil {
		t.Fatalf("save a draft payment dated %s: %v", day, err)
	}
	mkApplication(t, me.app, p, inv, 0, applied)
	return mustPostPayment(t, me.app, p.Id, me.users.bookkeeper.Id)
}

func newSTBook(t *testing.T) stBook {
	t.Helper()
	me := newMemoApplyEnv(t)
	registerBooksSources(t)
	b := stBook{me: me, app: me.app, reader: me.users.readOnly, none: me.users.none}
	b.aspen = mkCustomer(t, me.app, "Aspen Co", "")
	b.branch = mkCustomer(t, me.app, "Aspen Branch", b.aspen.Id)

	b.before = me.wo.postedInvoiceOn(t, b.aspen, "2026-10-15", 10000)
	b.invoice = me.wo.postedInvoiceOn(t, b.aspen, "2026-11-02", 50000)
	b.partPay = stPay(t, me, b.aspen, b.invoice, "2026-11-04", 20000, 20000)
	b.overPay = stPay(t, me, b.aspen, b.invoice, "2026-11-06", 40000, 30000)
	b.second = me.wo.postedInvoiceOn(t, b.aspen, "2026-11-07", 12000)
	b.memo = me.postedMemo(t, b.aspen, "2026-11-08", 8000)
	me.apply(t, b.memo, b.second, 3000, "2026-11-09")
	b.writeOff = me.wo.mkWriteOff(t, b.before, nil)
	b.void = me.wo.postedInvoiceOn(t, b.aspen, "2026-11-12", 7000)
	if err := voidInvoiceAs(me.app, b.void.Id, me.users.admin.Id); err != nil {
		t.Fatalf("void the invoice of 70.00: %v", err)
	}
	b.void = reload(t, me.app, "books_invoices", b.void.Id)
	b.branchInv = me.wo.postedInvoiceOn(t, b.branch, "2026-11-05", 9000)
	return b
}

// runStatementSpec loads spec as JSON and runs it as reader, as core's run
// endpoint does, and logs every row, so a failure shows the real run.
func runStatementSpec(t *testing.T, app core.App, reader *core.Record, spec any, params map[string]any) *reports.Result {
	t.Helper()
	loaded, info, err := reports.Load(mustJSON(spec))
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
	res, err := reports.Run(context.Background(), app, reports.Request{
		Spec: loaded, Loaded: info, Params: given, Options: reports.Options{Today: stToday}, Auth: reader,
		Headers: readerInfo(reader).Headers,
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	for _, r := range res.Rows {
		t.Logf("row %s kind=%s level=%d depth=%d section=%s key=%v label=%q cells=%v", r.ID, r.Kind, r.Level, r.Depth, r.Section, r.GroupKey, r.Label, r.Cells)
	}
	return res
}

func (b stBook) runForward(t *testing.T, reader *core.Record, from, to string, customers ...*core.Record) *reports.Result {
	t.Helper()
	return runStatementSpec(t, b.app, reader, statementBalanceForwardSpec(), map[string]any{
		"period": map[string]any{"from": from, "to": to}, "customers": stIDs(customers),
	})
}

func (b stBook) runOpenItems(t *testing.T, reader *core.Record, day string, customers ...*core.Record) *reports.Result {
	t.Helper()
	return runStatementSpec(t, b.app, reader, statementOpenItemsSpec(), map[string]any{
		"asOf": day, "customers": stIDs(customers),
	})
}

func stIDs(customers []*core.Record) []string {
	out := make([]string, len(customers))
	for i, c := range customers {
		out[i] = c.Id
	}
	return out
}

// stGroup is one customer's group of a Balance forward run: its group row,
// then the rows that name it as their section.
type stGroup struct {
	head    reports.Row
	kinds   []string
	opening *reports.Row
	lines   []reports.Row
	total   *reports.Row
}

func stGroups(t *testing.T, res *reports.Result) map[string]*stGroup {
	t.Helper()
	out := map[string]*stGroup{}
	byID := map[string]*stGroup{}
	for _, r := range res.Rows {
		switch r.Kind {
		case reports.KindGroup:
			if len(r.GroupKey) == 0 {
				t.Fatalf("group row %s (%q) has no key", r.ID, r.Label)
			}
			id, _ := r.GroupKey[0].(string)
			g := &stGroup{head: r}
			out[id] = g
			byID[r.ID] = g
		case reports.KindOpening, reports.KindDetail, reports.KindSubtotal:
			g, ok := byID[r.Section]
			if !ok {
				t.Fatalf("%s row %s (%q) names section %q, which has no group row before it", r.Kind, r.ID, r.Label, r.Section)
			}
			row := r
			g.kinds = append(g.kinds, r.Kind)
			switch r.Kind {
			case reports.KindOpening:
				g.opening = &row
			case reports.KindDetail:
				g.lines = append(g.lines, row)
			case reports.KindSubtotal:
				g.total = &row
			}
		}
	}
	return out
}

func stGroupOf(t *testing.T, res *reports.Result, customer *core.Record) *stGroup {
	t.Helper()
	g, ok := stGroups(t, res)[customer.Id]
	if !ok {
		t.Fatalf("no group for %s; rows %q", customer.GetString("display_name"), bsLabels(res))
	}
	return g
}

// stLineOf is the journal line a detail row stands for (its id is "d:<line>").
func stLineOf(t *testing.T, app core.App, r reports.Row) *core.Record {
	t.Helper()
	id, ok := strings.CutPrefix(r.ID, "d:")
	if !ok {
		t.Fatalf("detail row id %q is not d:<line id>", r.ID)
	}
	return reload(t, app, "books_journal_lines", id)
}

func stMoney(t *testing.T, r reports.Row, col string) int64 {
	t.Helper()
	v, ok := moneyCell(t, r, col)
	if !ok {
		t.Fatalf("%q (%s) has a blank %s, want a figure", r.Label, r.Kind, col)
	}
	return v
}

func stEntryNumber(t *testing.T, app core.App, doc *core.Record) string {
	t.Helper()
	return reload(t, app, "books_journal_entries", doc.GetString("entry")).GetString("number")
}

func TestStatementReports_SpecsLoad(t *testing.T) {
	b := newSTBook(t)
	if err := reports.CheckSources(b.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	for _, c := range []struct {
		name     string
		shipped  reports.Shipped
		key      string
		wantKey  string
		title    string
		spec     any
		source   string
		paramIDs []string
	}{
		{"balance forward", statementBalanceForwardShipped(), statementBalanceForwardKey, "books.statement_balance_forward",
			"Statement: Balance Forward", statementBalanceForwardSpec(), "books.journal_lines", []string{"period", "customers"}},
		{"open items", statementOpenItemsShipped(), statementOpenItemsKey, "books.statement_open_items",
			"Statement: Open Items", statementOpenItemsSpec(), "books.receivable_items", []string{"asOf", "customers"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			if c.key != c.wantKey || c.shipped.Key != c.key {
				t.Errorf("key = %q (const %q), want %s", c.shipped.Key, c.key, c.wantKey)
			}
			if c.shipped.Title != c.title {
				t.Errorf("title = %q, want %q", c.shipped.Title, c.title)
			}
			if c.shipped.Revision != 1 || !c.shipped.Unpublished {
				t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", c.shipped.Revision, c.shipped.Unpublished)
			}
			if !jsonEqual(t, c.shipped.Spec, string(mustJSON(c.spec))) {
				t.Error("the shipped spec is not the spec function's")
			}
			spec, _, err := reports.Load(c.shipped.Spec)
			if err != nil {
				t.Fatalf("Load: %v", err)
			}
			if spec.Source != c.source {
				t.Errorf("source = %q, want %s", spec.Source, c.source)
			}
			if err := reports.Validate(b.app, spec); err != nil {
				t.Fatalf("Validate: %v", err)
			}
			ids := make([]string, len(spec.Params))
			for i, p := range spec.Params {
				ids[i] = p.ID
			}
			if !reflect.DeepEqual(ids, c.paramIDs) {
				t.Errorf("params = %v, want %v", ids, c.paramIDs)
			}
		})
	}
}

// Spec §3.1 Balance forward: the opening row, the period's lines in date then
// posting order with their activity, amount and running balance, and the
// amount due on the end day.
func TestStatementReports_BalanceForward(t *testing.T) {
	b := newSTBook(t)
	res := b.runForward(t, b.reader, stFrom, stToday, b.aspen, b.branch)
	g := stGroupOf(t, res, b.aspen)

	if g.opening == nil || len(g.kinds) == 0 || g.kinds[0] != reports.KindOpening {
		t.Fatalf("Aspen Co rows %v, want the opening row first", g.kinds)
	}
	if g.opening.Label != "Balance forward" {
		t.Errorf("opening label = %q, want \"Balance forward\"", g.opening.Label)
	}
	opening := stMoney(t, *g.opening, "balance")
	if opening != 10000 {
		t.Errorf("Balance forward = %d, want 10000 (the invoice of 2026-10-15, the net before the start day)", opening)
	}

	// Each line: date then posting order; amount debit − credit; the running
	// balance; the activity "<type label> <entry number>"; Aspen Co's own lines.
	running := opening
	var prevDate, prevPosted string
	activities := []string{}
	for _, r := range g.lines {
		line := stLineOf(t, b.app, r)
		if line.GetString("customer") != b.aspen.Id {
			t.Errorf("row %q is a line of customer %s, want Aspen Co's lines only", r.Label, line.GetString("customer"))
		}
		entry := reload(t, b.app, "books_journal_entries", line.GetString("entry"))
		date, posted := line.GetString("date"), entry.GetString("posted_at")
		if date < prevDate || (date == prevDate && posted < prevPosted) {
			t.Errorf("row %q (%s, posted %s) after %s posted %s, want date then posting order", r.Label, date, posted, prevDate, prevPosted)
		}
		prevDate, prevPosted = date, posted
		if got := fmt.Sprint(r.Cells["date"]); !strings.HasPrefix(got, date) {
			t.Errorf("row %q date = %q, want %s", r.Label, got, date)
		}
		want := int64(line.GetInt("debit") - line.GetInt("credit"))
		if got := stMoney(t, r, "amount"); got != want {
			t.Errorf("row %q amount = %d, want debit − credit %d", r.Label, got, want)
		}
		running += want
		if got := stMoney(t, r, "balance"); got != running {
			t.Errorf("row %q balance = %d, want the opening plus the running sum %d", r.Label, got, running)
		}
		activities = append(activities, textCell(t, r, "activity"))
	}

	n := func(doc *core.Record) string { return stEntryNumber(t, b.app, doc) }
	for _, want := range []string{
		"Invoice " + n(b.invoice), "Payment " + n(b.partPay), "Payment " + n(b.overPay),
		"Invoice " + n(b.second), "Credit memo " + n(b.memo), "Write-off " + n(b.writeOff),
	} {
		if !slices.Contains(activities, want) {
			t.Errorf("activities %q have no %q", activities, want)
		}
	}
	signs := map[string]int64{}
	for _, r := range g.lines {
		signs[textCell(t, r, "activity")] = stMoney(t, r, "amount")
	}
	if v := signs["Payment "+n(b.partPay)]; v != -20000 {
		t.Errorf("the part payment's amount = %d, want -20000 (a payment is negative)", v)
	}
	if v := signs["Credit memo "+n(b.memo)]; v != -8000 {
		t.Errorf("the credit memo's amount = %d, want -8000 (a credit is negative)", v)
	}
	if v := signs["Invoice "+n(b.invoice)]; v != 50000 {
		t.Errorf("the invoice's amount = %d, want 50000 (a charge is positive)", v)
	}

	// The void invoice and its reversal add to zero.
	voidEntries := map[string]bool{b.void.GetString("entry"): true, findReversal(t, b.app, b.void.GetString("entry")).Id: true}
	var voidSum int64
	for _, r := range g.lines {
		if voidEntries[stLineOf(t, b.app, r).GetString("entry")] {
			voidSum += stMoney(t, r, "amount")
		}
	}
	if voidSum != 0 {
		t.Errorf("the void invoice's lines add to %d, want 0", voidSum)
	}
	// A reversal's activity is its one label, which already names the entry it
	// reverses (spec §3.1: one label and one number), with no number after it.
	wantVoid := "Void reversal of " + n(b.void)
	if !slices.Contains(activities, wantVoid) {
		t.Errorf("activities %q have no %q (the void reversal's activity)", activities, wantVoid)
	}

	if g.total == nil {
		t.Fatalf("Aspen Co has no subtotal row; rows %v", g.kinds)
	}
	if len(g.lines) == 0 {
		t.Fatal("Aspen Co has no line in the period")
	}
	last := stMoney(t, g.lines[len(g.lines)-1], "balance")
	if got := stMoney(t, *g.total, "balance"); got != last || got != -6000 {
		t.Errorf("Aspen Co's balance = %d, want the last line's %d and -6000", got, last)
	}

	// Aspen Branch has its own group with its own invoice.
	branch := stGroupOf(t, res, b.branch)
	if len(branch.lines) != 1 || stMoney(t, branch.lines[0], "amount") != 9000 {
		t.Errorf("Aspen Branch lines = %d, want its one invoice of 9000", len(branch.lines))
	}
}

// A customer with an opening balance and no line in the period keeps its
// group; a customer with neither has none.
func TestStatementReports_BalanceForwardOpeningOnly(t *testing.T) {
	b := newSTBook(t)
	quiet := mkCustomer(t, b.app, "Quiet Co", "")
	b.me.wo.postedInvoiceOn(t, quiet, "2026-10-20", 4000)
	empty := mkCustomer(t, b.app, "Empty Co", "")

	res := b.runForward(t, b.reader, stFrom, stToday, quiet, empty)
	g := stGroupOf(t, res, quiet)
	if len(g.lines) != 0 {
		t.Errorf("Quiet Co has %d lines in the period, want none", len(g.lines))
	}
	if g.opening == nil || g.opening.Label != "Balance forward" || stMoney(t, *g.opening, "balance") != 4000 {
		t.Errorf("Quiet Co opening = %+v, want \"Balance forward\" 4000", g.opening)
	}
	if g.total == nil || stMoney(t, *g.total, "balance") != 4000 {
		t.Errorf("Quiet Co balance = %+v, want 4000 (the opening)", g.total)
	}
	if _, ok := stGroups(t, res)[empty.Id]; ok {
		t.Error("Empty Co (no opening, no line) has a group, want none")
	}
}

// stItems are the item rows (level 2) under customer's row (level 1) of an
// Open items run, and the customer row.
func stItems(t *testing.T, res *reports.Result, customer *core.Record) (reports.Row, []reports.Row) {
	t.Helper()
	row, ok := cbGroupRow(res, 1, customer.Id)
	if !ok {
		t.Fatalf("no customer row for %s; rows %q", customer.GetString("display_name"), bsLabels(res))
	}
	items := []reports.Row{}
	for _, r := range arUnder(t, res, row) {
		if r.Kind == reports.KindGroup && r.Level == 2 {
			items = append(items, r)
		}
	}
	return row, items
}

// Spec §3.1 Open items: one row for each open item, in due-date order, its
// open amount as Total; the customer row's age cells and Total are the sums.
func TestStatementReports_OpenItems(t *testing.T) {
	b := newSTBook(t)
	// Birch Co: two open invoices due the same day. The lower number is dated
	// later, so only the item-number tie-break puts it first (date order and
	// posting order would not).
	birch := mkCustomer(t, b.app, "Birch Co", "")
	dueOn := func(day, due string, total int64) *core.Record {
		t.Helper()
		inv, err := newInvoice(b.app, birch, map[string]any{"date": day, "due_date": due})
		if err != nil {
			t.Fatalf("save a draft invoice dated %s: %v", day, err)
		}
		mkInvoiceLine(t, b.app, inv, 0, item(b.me.wo.service, 1, total, false))
		return mustPostInvoice(t, b.app, inv.Id, b.me.wo.actor)
	}
	lower := dueOn("2026-11-10", "2026-11-20", 1500)
	higher := dueOn("2026-11-05", "2026-11-20", 2500)

	res := b.runOpenItems(t, b.reader, stStatement, b.aspen, b.branch, birch)
	row, items := stItems(t, res, b.aspen)

	type itemShape struct {
		Label, Date, Due string
		Total            int64
	}
	got := make([]itemShape, len(items))
	for i, r := range items {
		got[i] = itemShape{r.Label, fmt.Sprint(r.Cells["date"]), dueOf(r), stMoney(t, r, "total")}
	}
	// The part-paid and settled invoices, the written-off invoice and the void
	// invoice have no row.
	want := []itemShape{
		{"Payment " + b.overPay.GetString("number"), "2026-11-06", "2026-11-06", -10000},
		{"Invoice " + b.second.GetString("number"), "2026-11-07", "2026-11-07", 9000},
		{"Credit memo " + b.memo.GetString("number"), "2026-11-08", "2026-11-08", -5000},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Aspen Co's items =\n%+v\nwant\n%+v", got, want)
	}
	if sum, figs := arSumFigs(t, items), arFigs(t, row); !reflect.DeepEqual(sum, figs) {
		t.Errorf("the items add up to %v, want the customer row's %v", sum, figs)
	}
	requireAgesAddUp(t, row)
	if v := stMoney(t, row, "total"); v != -6000 {
		t.Errorf("Aspen Co's Total = %d, want -6000", v)
	}

	_, branchItems := stItems(t, res, b.branch)
	if labels := labelsOf(branchItems); !reflect.DeepEqual(labels, []string{"Invoice " + b.branchInv.GetString("number")}) {
		t.Errorf("Aspen Branch items = %q, want its one invoice", labels)
	}

	// Due-date order, then item number.
	_, birchItems := stItems(t, res, birch)
	wantBirch := []string{"Invoice " + lower.GetString("number"), "Invoice " + higher.GetString("number")}
	if labels := labelsOf(birchItems); !reflect.DeepEqual(labels, wantBirch) {
		t.Errorf("Birch Co items = %q, want %q (one due date, the lower number first)", labels, wantBirch)
	}
}

// The amount due of each type is the customer's figure on the Customer
// Balance for the end day and on the A/R Aging for the statement date.
func TestStatementReports_AmountDueMatchesTheReports(t *testing.T) {
	b := newSTBook(t)
	forward := stGroupOf(t, b.runForward(t, b.reader, stFrom, stToday, b.aspen), b.aspen)
	if forward.total == nil {
		t.Fatal("Aspen Co has no subtotal row in the Balance forward run")
	}
	cb := runCB(t, b.app, b.reader, map[string]any{"asOf": stToday, "customers": []string{b.aspen.Id}}, reports.Options{Today: stToday})
	if got, want := stMoney(t, *forward.total, "balance"), stMoney(t, cbCustomerRow(t, cb, b.aspen), "balance"); got != want {
		t.Errorf("Balance forward amount due = %d, want the Customer Balance's %d", got, want)
	}

	openRow, _ := stItems(t, b.runOpenItems(t, b.reader, stStatement, b.aspen), b.aspen)
	ar := runAR(t, b.app, b.reader, map[string]any{"asOf": stStatement, "customers": []string{b.aspen.Id}}, reports.Options{Today: stToday})
	if got, want := stMoney(t, openRow, "total"), stMoney(t, cbCustomerRow(t, ar, b.aspen), "total"); got != want {
		t.Errorf("Open items amount due = %d, want the A/R Aging's %d", got, want)
	}
}

func TestStatementReports_NoAccess(t *testing.T) {
	b := newSTBook(t)
	if len(stGroups(t, b.runForward(t, b.reader, stFrom, stToday, b.aspen))) == 0 {
		t.Fatal("the Books reader sees no group, so the outsider's empty run proves nothing")
	}
	if groups := cbGroupRows(b.runForward(t, b.none, stFrom, stToday, b.aspen)); len(groups) != 0 {
		t.Errorf("Balance forward: a user with no Books access sees rows %q", labelsOf(groups))
	}
	if groups := cbGroupRows(b.runOpenItems(t, b.none, stStatement, b.aspen)); len(groups) != 0 {
		t.Errorf("Open items: a user with no Books access sees rows %q", labelsOf(groups))
	}
}

// Register ships both statement reports; core stores them and Books shares
// them with every Books reader.
func TestStatementReports_ShippedAndShared(t *testing.T) {
	app, _ := newRegisteredApp(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources on a registered app: %v", err)
	}
	mkUser(t, app, "owner")
	reader := mkUser(t, app, "guest")
	setPkgAccess(t, app, reader, "readonly")
	if err := reports.ReconcileShipped(app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	stored, err := booksReports(app)
	if err != nil {
		t.Fatal(err)
	}
	keys := map[string]*core.Record{}
	for _, r := range stored {
		keys[r.GetString("shipped_key")] = r
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	for _, key := range []string{statementBalanceForwardKey, statementOpenItemsKey} {
		row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": key})
		if err != nil {
			t.Errorf("no reports row with shipped_key %s: %v", key, err)
			continue
		}
		if row.GetBool("published") {
			t.Errorf("%s is published, want unpublished", key)
		}
		if _, ok := keys[key]; !ok {
			t.Errorf("booksReports does not hold %s", key)
		}
		requireViewer(t, app, row, reader, "a guest with Books readonly access")
	}
}
