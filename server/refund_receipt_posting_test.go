package books

import (
	"fmt"
	"sort"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/reports"
)

// The plain refund receipt's post, void and correction (spec §4.3 Posting):
// a Credit kind with the credit memo's sides, except that the total leaves the
// Refund from account; a negated tax snapshot; no change to Accounts
// receivable, so no change to the customer's Open figure.

// denverRefund saves a draft refund receipt with the Denver combined rate and
// two taxable Item lines on two income accounts, refunded from 1000 Business
// Checking: Monthly bookkeeping 1 x 60000 on 4000 Consulting Income and
// Wireless access point 2 x 20000 on 4100 Hardware sales. Taxable 100000:
// state 2.9% 2900, RTD 1% 1000, city 4.81% 4810; total 108710.
func (rr *refundReceiptEnv) denverRefund(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{"tax_rate": rr.denver.Id, "memo": "Returned hardware", "payment_method": "check", "reference_no": "20417"}
	for k, v := range fields {
		all[k] = v
	}
	r := rr.mkRefundReceipt(t, all)
	mkRefundReceiptLine(t, rr.app, r, 0, item(rr.service, 1, 60000, true))
	mkRefundReceiptLine(t, rr.app, r, 1, item(rr.accessPoint, 2, 20000, true))
	requireRefundReceiptTotals(t, rr.app, r.Id, 100000, 8710, 108710)
	return r
}

func nextRefundReceiptNumber(t testing.TB, app core.App) int {
	t.Helper()
	return reload(t, app, "books_doc_sequences", refundReceiptSequenceID).GetInt("next_number")
}

// requireRefundReceiptNotPosted checks that a refused post wrote nothing: the
// refund is a draft with no number, entry or stamp, no entry names it, it has
// no tax lines and no credits row, and the sequence did not move.
func requireRefundReceiptNotPosted(t testing.TB, app core.App, refundID string, nextNumber int) {
	t.Helper()
	r := reload(t, app, refundReceiptsCollection, refundID)
	if r.GetString("status") != statusDraft || r.GetString("number") != "" || r.GetString("entry") != "" || r.GetString("posted_at") != "" {
		t.Errorf("refund receipt after a refused post: status %q number %q entry %q posted_at %q, want a draft with none",
			r.GetString("status"), r.GetString("number"), r.GetString("entry"), r.GetString("posted_at"))
	}
	if n, err := app.CountRecords("books_journal_entries", dbx.HashExp{"document": refundID}); err != nil || n != 0 {
		t.Errorf("%d journal entries name the refund receipt (err %v), want 0", n, err)
	}
	if n, err := app.CountRecords("books_refund_receipt_tax_lines", dbx.HashExp{"refund_receipt": refundID}); err != nil || n != 0 {
		t.Errorf("%d tax lines on the refund receipt (err %v), want 0", n, err)
	}
	if n, err := app.CountRecords(refundReceiptCreditsCollection, dbx.HashExp{"refund_receipt": refundID}); err != nil || n != 0 {
		t.Errorf("%d credits rows name the refund receipt (err %v), want 0", n, err)
	}
	if got := nextRefundReceiptNumber(t, app); got != nextNumber {
		t.Errorf("refund receipt sequence next_number = %d after a refused post, want %d", got, nextNumber)
	}
}

// sortedEntryLines compares an entry's lines as a set: the spec names the
// sides and figures, not the order.
func sortedEntryLines(lines []entryLine) []entryLine {
	out := append([]entryLine(nil), lines...)
	sort.Slice(out, func(i, j int) bool { return fmt.Sprint(out[i]) < fmt.Sprint(out[j]) })
	return out
}

func requireEntryLineSet(t testing.TB, what string, got, want []entryLine) {
	t.Helper()
	if fmt.Sprint(sortedEntryLines(got)) != fmt.Sprint(sortedEntryLines(want)) {
		t.Errorf("%s =\n%v\nwant\n%v", what, sortedEntryLines(got), sortedEntryLines(want))
	}
}

func refundTaxSnapOf(t testing.TB, app core.App, refundID string) []creditMemoTaxSnap {
	t.Helper()
	rows, err := app.FindRecordsByFilter("books_refund_receipt_tax_lines", "refund_receipt = {:id}", "position", 0, 0, dbx.Params{"id": refundID})
	if err != nil {
		t.Fatalf("read the refund receipt's tax lines: %v", err)
	}
	out := make([]creditMemoTaxSnap, len(rows))
	for i, r := range rows {
		out[i] = creditMemoTaxSnap{
			r.GetString("rate"), r.GetString("component"), r.GetString("agency"), dayOf(r.GetString("date")),
			r.GetInt("rate_ppm"), r.GetInt("gross_amount"), r.GetInt("taxable_amount"), r.GetInt("amount"), r.GetInt("position"),
		}
	}
	return out
}

func TestRefundReceiptPost_WritesTheEntry(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	actor := rr.users.bookkeeper.Id
	r := rr.denverRefund(t, nil)
	balanceBefore := partyBalances(t, rr.app)[rr.customer.Id]

	posted := mustPostRefundReceipt(t, rr.app, r.Id, actor)
	if posted.GetString("status") != statusPosted || posted.GetString("number") != "1001" || posted.GetInt("sequence") != 1001 {
		t.Errorf("refund receipt status %q number %q sequence %d, want posted, 1001, 1001",
			posted.GetString("status"), posted.GetString("number"), posted.GetInt("sequence"))
	}
	if posted.GetString("posted_by") != actor || posted.GetString("posted_at") == "" {
		t.Errorf("refund receipt posted_by %q posted_at %q, want the poster and a time", posted.GetString("posted_by"), posted.GetString("posted_at"))
	}
	entryID := posted.GetString("entry")
	if entryID == "" {
		t.Fatal("the posted refund receipt names no entry")
	}
	entry := reload(t, rr.app, "books_journal_entries", entryID)
	if got, want := [6]string{
		entry.GetString("status"), entry.GetString("doc_type"), entry.GetString("origin"),
		entry.GetString("document"), entry.GetString("number"), entry.GetString("date"),
	}, [6]string{statusPosted, "refund_receipt", "document", r.Id, "1001", refundReceiptDay}; got != want {
		t.Errorf("entry status/doc_type/origin/document/number/date = %v, want %v", got, want)
	}
	if docTypeRefundReceipt != "refund_receipt" {
		t.Errorf("docTypeRefundReceipt = %q, want refund_receipt", docTypeRefundReceipt)
	}

	// Refund from credited with the total; each income account debited with
	// its lines' sum; each tax component debited to its agency's liability.
	c := rr.customer.Id
	got := entryLinesOf(t, rr.app, entryID)
	requireEntryLineSet(t, "entry lines", got, []entryLine{
		{account: rr.checking.Id, credit: 108710, customer: c},
		{account: rr.revenue.Id, debit: 60000, customer: c},
		{account: rr.hardware.Id, debit: 40000, customer: c},
		{account: rr.stateTax.Id, debit: 2900, customer: c},
		{account: rr.rtdTax.Id, debit: 1000, customer: c},
		{account: rr.cityTax.Id, debit: 4810, customer: c},
	})
	debits, credits := 0, 0
	for _, l := range got {
		debits += l.debit
		credits += l.credit
	}
	if debits != credits || debits != 108710 || entry.GetInt("total") != 108710 {
		t.Errorf("debits %d credits %d entry total %d, want 108710 each", debits, credits, entry.GetInt("total"))
	}

	// The negated tax snapshot, dated the refund's day.
	snap := refundTaxSnapOf(t, rr.app, r.Id)
	wantSnap := []creditMemoTaxSnap{
		{rr.denver.Id, rr.state.Id, rr.stateDOR.Id, refundReceiptDay, 29000, -100000, -100000, -2900, 0},
		{rr.denver.Id, rr.rtd.Id, rr.rtdAgency.Id, refundReceiptDay, 10000, -100000, -100000, -1000, 1},
		{rr.denver.Id, rr.city.Id, rr.cityDept.Id, refundReceiptDay, 48100, -100000, -100000, -4810, 2},
	}
	if fmt.Sprint(snap) != fmt.Sprint(wantSnap) {
		t.Errorf("refund receipt tax lines =\n%+v\nwant\n%+v", snap, wantSnap)
	}

	// A plain refund touches no Accounts receivable: the customer's Open
	// figure does not move.
	if after := partyBalances(t, rr.app)[rr.customer.Id]; after != balanceBefore {
		t.Errorf("Harborview Dental party balance = %d after a plain refund, want %d (unchanged)", after, balanceBefore)
	}
	if n, err := rr.app.CountRecords(refundReceiptCreditsCollection); err != nil || n != 0 {
		t.Errorf("%d credits rows after a plain refund (err %v), want 0", n, err)
	}
	requireNoDrift(t, rr.app)
	requireNoDocumentDrift(t, rr.app)

	t.Run("the next post gets 1002", func(t *testing.T) {
		second := rr.mkRefundReceipt(t, nil)
		mkRefundReceiptLine(t, rr.app, second, 0, item(rr.service, 1, 5000, false))
		if got := mustPostRefundReceipt(t, rr.app, second.Id, actor); got.GetString("number") != "1002" || got.GetInt("sequence") != 1002 {
			t.Errorf("second refund receipt number %q sequence %d, want 1002", got.GetString("number"), got.GetInt("sequence"))
		}
	})
}

func TestRefundReceiptPost_NoCustomer(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.mkRefundReceipt(t, map[string]any{"customer": "", "tax_rate": rr.denver.Id})
	mkRefundReceiptLine(t, rr.app, r, 0, item(rr.service, 1, 60000, true))
	mkRefundReceiptLine(t, rr.app, r, 1, item(rr.accessPoint, 2, 20000, true))

	posted := mustPostRefundReceipt(t, rr.app, r.Id, rr.users.bookkeeper.Id)
	requireEntryLineSet(t, "entry lines of a refund with no customer", entryLinesOf(t, rr.app, posted.GetString("entry")), []entryLine{
		{account: rr.checking.Id, credit: 108710},
		{account: rr.revenue.Id, debit: 60000},
		{account: rr.hardware.Id, debit: 40000},
		{account: rr.stateTax.Id, debit: 2900},
		{account: rr.rtdTax.Id, debit: 1000},
		{account: rr.cityTax.Id, debit: 4810},
	})
	requireNoDrift(t, rr.app)
}

func TestRefundReceiptPost_RefusesZeroTotal(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.mkRefundReceipt(t, nil)
	mkRefundReceiptLine(t, rr.app, r, 0, item(rr.service, 1, 0, false))
	requireRefundReceiptTotals(t, rr.app, r.Id, 0, 0, 0)

	err := postRefundReceiptAs(rr.app, r.Id, rr.users.bookkeeper.Id)
	requireRefusalText(t, err, wantRefundZeroTotal)
	requireRefundReceiptNotPosted(t, rr.app, r.Id, 1001)
}

func TestRefundReceiptPost_RefusesInactiveCustomer(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.denverRefund(t, nil)
	if err := setCustomer(t, rr.app, rr.customer.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make the customer inactive: %v", err)
	}
	err := postRefundReceiptAs(rr.app, r.Id, rr.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "customer", wantCustomerInactive("Harborview Dental"))
	requireRefundReceiptNotPosted(t, rr.app, r.Id, 1001)
}

// Q3: the Refund from account is checked again at Post; a draft whose account
// went inactive after it was saved still saves, and its post is refused.
func TestRefundReceiptPost_RefusesAnInactiveRefundFrom(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	operating := mkNumberedAccount(t, rr.app, "Operating Checking", "1030", "bank", "checking")
	r := rr.denverRefund(t, map[string]any{"refund_from": operating.Id})
	makeAccountInactive(t, rr.app, operating)

	if err := setFields(t, rr.app, refundReceiptsCollection, r.Id, map[string]any{"memo": "Saved after the account closed"}); err != nil {
		t.Fatalf("a memo edit of a draft whose Refund from went inactive was refused: %v", err)
	}
	err := postRefundReceiptAs(rr.app, r.Id, rr.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "refund_from", wantRefundFromInvalid)
	requireRefundReceiptNotPosted(t, rr.app, r.Id, 1001)
}

func TestRefundReceiptPost_HonorsCloseDate(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.denverRefund(t, nil)
	setCloseDate(t, rr.app, refundReceiptDay)

	err := postRefundReceiptAs(rr.app, r.Id, rr.users.bookkeeper.Id)
	requireRefusalText(t, err,
		"The books are closed through 2026-11-12. Ask a Books admin for a close-date override to post on 2026-11-12.")
	requireRefundReceiptNotPosted(t, rr.app, r.Id, 1001)
}

// A void writes a reversal of the same doc_type and keeps the number; the
// General Ledger reads "Refund receipt" on the refund's entry and "Void
// reversal of 1001" on its reversal.
func TestRefundReceiptVoid_ReversesAndKeepsTheNumber(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	registerBooksSources(t)
	r := rr.denverRefund(t, nil)
	entryID := mustPostRefundReceipt(t, rr.app, r.Id, rr.users.bookkeeper.Id).GetString("entry")

	if err := voidRefundReceiptAs(rr.app, r.Id, rr.users.admin.Id); err != nil {
		t.Fatalf("void the refund receipt: %v", err)
	}
	voided := reload(t, rr.app, refundReceiptsCollection, r.Id)
	if voided.GetString("status") != statusVoid || voided.GetString("number") != "1001" ||
		voided.GetString("voided_by") != rr.users.admin.Id || voided.GetString("voided_at") == "" {
		t.Errorf("refund receipt status %q number %q voided_by %q voided_at %q, want void, 1001, the voider and a time",
			voided.GetString("status"), voided.GetString("number"), voided.GetString("voided_by"), voided.GetString("voided_at"))
	}
	rev := findReversal(t, rr.app, entryID)
	if got, want := [3]string{rev.GetString("origin"), rev.GetString("doc_type"), rev.GetString("number")},
		[3]string{originVoidReversal, "refund_receipt", "1001"}; got != want {
		t.Errorf("reversal origin/doc_type/number = %v, want %v", got, want)
	}
	requireNoDrift(t, rr.app)

	res := runGL(t, rr.app, rr.users.readOnly, map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")}, reports.Options{Today: glToday})
	type cols struct{ typ, number, name string }
	read := func(row reports.Row) cols {
		return cols{typ: textCell(t, row, "type"), number: textCell(t, row, "number"), name: textCell(t, row, "name")}
	}
	for _, w := range []struct {
		what  string
		entry string
		want  cols
	}{
		{"the refund's Refund from line", entryID, cols{"Refund receipt", "1001", "Harborview Dental"}},
		{"the void reversal's Refund from line", rev.Id, cols{"Void reversal of 1001", "1001", "Harborview Dental"}},
	} {
		if got := read(lineRow(t, res, entryLineOn(t, rr.app, w.entry, rr.checking))); got != w.want {
			t.Errorf("%s = %+v, want %+v", w.what, got, w.want)
		}
	}
}

// A correction keeps the original's number, voids the original with
// replaced_by, and posts its own tax lines.
func TestRefundReceiptCorrection_KeepsTheNumberAndReplacesTheTaxLines(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	actor := rr.users.bookkeeper.Id
	original := rr.denverRefund(t, nil)
	mustPostRefundReceipt(t, rr.app, original.Id, actor)

	draft := rr.mkRefundReceipt(t, map[string]any{"replaces": original.Id, "tax_rate": rr.denver.Id, "memo": "Corrected"})
	mkRefundReceiptLine(t, rr.app, draft, 0, item(rr.service, 1, 50000, true))
	corrected := mustPostRefundReceipt(t, rr.app, draft.Id, actor)
	if corrected.GetString("number") != "1001" || corrected.GetInt("sequence") != 1001 || corrected.GetString("status") != statusPosted {
		t.Errorf("correction number %q sequence %d status %q, want 1001, 1001, posted",
			corrected.GetString("number"), corrected.GetInt("sequence"), corrected.GetString("status"))
	}
	if got := nextRefundReceiptNumber(t, rr.app); got != 1002 {
		t.Errorf("refund receipt sequence next_number = %d after a correction, want 1002 (no new number)", got)
	}
	after := reload(t, rr.app, refundReceiptsCollection, original.Id)
	if after.GetString("status") != statusVoid || after.GetString("replaced_by") != draft.Id || after.GetString("voided_at") == "" {
		t.Errorf("original status %q replaced_by %q voided_at %q, want void, the correction, a time",
			after.GetString("status"), after.GetString("replaced_by"), after.GetString("voided_at"))
	}
	// 50000 taxable: state 1450, RTD 500, city 2405.
	wantSnap := []creditMemoTaxSnap{
		{rr.denver.Id, rr.state.Id, rr.stateDOR.Id, refundReceiptDay, 29000, -50000, -50000, -1450, 0},
		{rr.denver.Id, rr.rtd.Id, rr.rtdAgency.Id, refundReceiptDay, 10000, -50000, -50000, -500, 1},
		{rr.denver.Id, rr.city.Id, rr.cityDept.Id, refundReceiptDay, 48100, -50000, -50000, -2405, 2},
	}
	if got := refundTaxSnapOf(t, rr.app, draft.Id); fmt.Sprint(got) != fmt.Sprint(wantSnap) {
		t.Errorf("the correction's tax lines =\n%+v\nwant\n%+v", got, wantSnap)
	}
	requireNoDrift(t, rr.app)
}

// The new hooks are nil for every other kind: a sales receipt with the
// refund's amounts posts its old sides and a positive tax snapshot.
func TestRefundReceiptPost_ASalesReceiptOfTheSameAmountsKeepsItsSides(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	receipt := rr.mkReceipt(t, map[string]any{"tax_rate": rr.denver.Id, "deposit_to": rr.checking.Id})
	mkReceiptLine(t, rr.app, receipt, 0, item(rr.service, 1, 60000, true))
	mkReceiptLine(t, rr.app, receipt, 1, item(rr.accessPoint, 2, 20000, true))
	posted := mustPostReceipt(t, rr.app, receipt.Id, rr.users.bookkeeper.Id)

	c := rr.customer.Id
	requireEntryLineSet(t, "sales receipt entry lines", entryLinesOf(t, rr.app, posted.GetString("entry")), []entryLine{
		{account: rr.checking.Id, debit: 108710, customer: c},
		{account: rr.revenue.Id, credit: 60000, customer: c},
		{account: rr.hardware.Id, credit: 40000, customer: c},
		{account: rr.stateTax.Id, credit: 2900, customer: c},
		{account: rr.rtdTax.Id, credit: 1000, customer: c},
		{account: rr.cityTax.Id, credit: 4810, customer: c},
	})
	rows, err := rr.app.FindRecordsByFilter("books_sales_receipt_tax_lines", "sales_receipt = {:id}", "position", 0, 0, dbx.Params{"id": receipt.Id})
	if err != nil {
		t.Fatalf("read the sales receipt tax lines: %v", err)
	}
	got := make([][3]int, len(rows))
	for i, r := range rows {
		got[i] = [3]int{r.GetInt("gross_amount"), r.GetInt("taxable_amount"), r.GetInt("amount")}
	}
	if want := [][3]int{{100000, 100000, 2900}, {100000, 100000, 1000}, {100000, 100000, 4810}}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("sales receipt tax lines gross/taxable/amount = %v, want %v", got, want)
	}
}

// The view books_refund_receipt_sale_lines is the sales reports' part: it
// lists a plain refund's lines.
func TestRefundReceiptSaleLines_ListsAPlainRefundsLines(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.denverRefund(t, nil)
	mustPostRefundReceipt(t, rr.app, r.Id, rr.users.bookkeeper.Id)

	lines, err := rr.app.FindAllRecords(refundReceiptLinesCol, dbx.HashExp{"refund_receipt": r.Id})
	if err != nil {
		t.Fatalf("read the refund's lines: %v", err)
	}
	viewRows, err := rr.app.FindAllRecords("books_refund_receipt_sale_lines", dbx.HashExp{"refund_receipt": r.Id})
	if err != nil {
		t.Fatalf("read the sale-lines view: %v", err)
	}
	ids := func(recs []*core.Record) []string {
		out := make([]string, len(recs))
		for i, rec := range recs {
			out[i] = rec.Id
		}
		sort.Strings(out)
		return out
	}
	if len(lines) != 2 || fmt.Sprint(ids(viewRows)) != fmt.Sprint(ids(lines)) {
		t.Errorf("the view lists %v, want the refund's two lines %v", ids(viewRows), ids(lines))
	}
	for _, v := range viewRows {
		if v.GetString("product") == "" || v.GetInt("amount") == 0 {
			t.Errorf("view row %s: product %q amount %d, want the line's columns", v.Id, v.GetString("product"), v.GetInt("amount"))
		}
	}
}
