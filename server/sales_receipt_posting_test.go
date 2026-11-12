package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/reports"
)

// Posting a sales receipt (spec §4.3): draft → posted writes a numbered
// journal entry through postDocument with doc type sales_receipt: a debit to
// Deposit to for the total, a credit per income account, a credit per tax
// component's agency liability, and every line names the customer (empty when
// none). Correction, void and the tax snapshot are the invoice's.

// postReceiptAs posts a draft receipt as actor, as the client's PATCH
// {"status":"posted"} does once the request hook has stamped the poster.
func postReceiptAs(app core.App, receiptID, actor string) error {
	r, err := app.FindRecordById("books_sales_receipts", receiptID)
	if err != nil {
		return err
	}
	r.Set("status", statusPosted)
	r.Set("posted_by", actor)
	return app.Save(r)
}

func mustPostReceipt(t testing.TB, app core.App, receiptID, actor string) *core.Record {
	t.Helper()
	if err := postReceiptAs(app, receiptID, actor); err != nil {
		t.Fatalf("post sales receipt %s: %v", receiptID, err)
	}
	return reload(t, app, "books_sales_receipts", receiptID)
}

func voidReceiptAs(app core.App, receiptID, actor string) error {
	r, err := app.FindRecordById("books_sales_receipts", receiptID)
	if err != nil {
		return err
	}
	r.Set("status", statusVoid)
	r.Set("voided_by", actor)
	return app.Save(r)
}

func nextReceiptNumber(t testing.TB, app core.App) int {
	t.Helper()
	return reload(t, app, "books_doc_sequences", receiptSequenceID).GetInt("next_number")
}

// harborviewSale saves the Check receipt of spec §4.3's posting bullet:
// Harborview Dental, deposited to 1200 Undeposited funds, the Denver group,
// two taxable items on two income accounts. Taxable 87 800: state 2 546, RTD
// 878, city 4 223; total 95 447.
func (re *receiptEnv) harborviewSale(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{
		"payment_method": "check", "reference_no": "43567", "tax_rate": re.denver.Id, "memo": "Paid at the office",
	}
	for k, v := range fields {
		all[k] = v
	}
	r := re.mkReceipt(t, all)
	mkReceiptLine(t, re.app, r, 0, item(re.service, 1, 50000, true))
	mkReceiptLine(t, re.app, r, 1, item(re.accessPoint, 2, 18900, true))
	requireReceiptTotals(t, re.app, r.Id, 87800, 7647, 95447)
	return r
}

// requireReceiptNotPosted checks that a refused post wrote nothing.
func requireReceiptNotPosted(t testing.TB, app core.App, receiptID string, nextNumber int) {
	t.Helper()
	r := reload(t, app, "books_sales_receipts", receiptID)
	if r.GetString("status") != statusDraft || r.GetString("number") != "" || r.GetString("entry") != "" ||
		r.GetString("posted_at") != "" {
		t.Errorf("receipt after a refused post: status %q number %q entry %q posted_at %q, want a draft with none",
			r.GetString("status"), r.GetString("number"), r.GetString("entry"), r.GetString("posted_at"))
	}
	if n, err := app.CountRecords("books_journal_entries", dbx.HashExp{"document": receiptID}); err != nil || n != 0 {
		t.Errorf("%d journal entries name the receipt (err %v), want 0", n, err)
	}
	if n, err := app.CountRecords("books_sales_receipt_tax_lines", dbx.HashExp{"sales_receipt": receiptID}); err != nil || n != 0 {
		t.Errorf("%d tax lines on the receipt (err %v), want 0", n, err)
	}
	if got := nextReceiptNumber(t, app); got != nextNumber {
		t.Errorf("sales receipt sequence next_number = %d after a refused post, want %d", got, nextNumber)
	}
}

func TestSalesReceiptPost_WritesTheEntry(t *testing.T) {
	re := newReceiptEnv(t)
	actor := re.users.bookkeeper.Id
	r := re.harborviewSale(t, nil)
	accountsBefore, err := re.app.CountRecords("books_accounts")
	if err != nil {
		t.Fatal(err)
	}
	invoiceNext := reload(t, re.app, "books_doc_sequences", "booksseqinvoice").GetInt("next_number")

	posted := mustPostReceipt(t, re.app, r.Id, actor)
	if posted.GetString("status") != statusPosted || posted.GetString("number") != "1001" || posted.GetInt("sequence") != 1001 {
		t.Errorf("receipt status %q number %q sequence %d, want posted, 1001, 1001",
			posted.GetString("status"), posted.GetString("number"), posted.GetInt("sequence"))
	}
	if posted.GetString("posted_by") != actor || posted.GetString("posted_at") == "" {
		t.Errorf("receipt posted_by %q posted_at %q, want the poster and a time", posted.GetString("posted_by"), posted.GetString("posted_at"))
	}
	if got := nextReceiptNumber(t, re.app); got != 1002 {
		t.Errorf("sales receipt sequence next_number = %d after the post, want 1002", got)
	}
	if got := reload(t, re.app, "books_doc_sequences", "booksseqinvoice").GetInt("next_number"); got != invoiceNext {
		t.Errorf("invoice sequence next_number = %d after a receipt post, want %d (untouched)", got, invoiceNext)
	}

	entryID := posted.GetString("entry")
	if entryID == "" {
		t.Fatal("the posted receipt names no entry")
	}
	entry := reload(t, re.app, "books_journal_entries", entryID)
	if got, want := [6]string{
		entry.GetString("status"), entry.GetString("doc_type"), entry.GetString("origin"),
		entry.GetString("document"), entry.GetString("number"), entry.GetString("date"),
	}, [6]string{statusPosted, "sales_receipt", "document", r.Id, "1001", receiptTestDay}; got != want {
		t.Errorf("entry status/doc_type/origin/document/number/date = %v, want %v", got, want)
	}

	// Deposit to first; income by account number; the tax components in the
	// group's order, each to its agency's liability account.
	c := re.customer.Id
	want := []entryLine{
		{account: re.undeposited.Id, debit: 95447, customer: c},
		{account: re.revenue.Id, credit: 50000, customer: c},
		{account: re.hardware.Id, credit: 37800, customer: c},
		{account: re.stateTax.Id, credit: 2546, customer: c},
		{account: re.rtdTax.Id, credit: 878, customer: c},
		{account: re.cityTax.Id, credit: 4223, customer: c},
	}
	if got := entryLinesOf(t, re.app, entryID); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("entry lines =\n%v\nwant\n%v", got, want)
	}
	if entry.GetInt("total") != 95447 {
		t.Errorf("entry total %d, want 95447", entry.GetInt("total"))
	}

	rows, err := re.app.FindRecordsByFilter("books_sales_receipt_tax_lines", "sales_receipt = {:id}", "position", 0, 0, dbx.Params{"id": r.Id})
	if err != nil {
		t.Fatalf("read the tax lines: %v", err)
	}
	type snap struct {
		rate, component, agency string
		ppm, taxable, amount    int
	}
	wantSnap := []snap{
		{re.denver.Id, re.state.Id, re.stateDOR.Id, 29000, 87800, 2546},
		{re.denver.Id, re.rtd.Id, re.rtdAgency.Id, 10000, 87800, 878},
		{re.denver.Id, re.city.Id, re.cityDept.Id, 48100, 87800, 4223},
	}
	gotSnap := make([]snap, len(rows))
	for i, row := range rows {
		gotSnap[i] = snap{
			row.GetString("rate"), row.GetString("component"), row.GetString("agency"),
			row.GetInt("rate_ppm"), row.GetInt("taxable_amount"), row.GetInt("amount"),
		}
	}
	if fmt.Sprint(gotSnap) != fmt.Sprint(wantSnap) {
		t.Errorf("tax snapshot =\n%v\nwant\n%v", gotSnap, wantSnap)
	}

	if after, _ := re.app.CountRecords("books_accounts"); after != accountsBefore {
		t.Errorf("%d accounts after the post, want %d: posting a sales receipt creates no account", after, accountsBefore)
	}
	requireNoDrift(t, re.app)
}

func TestSalesReceiptPost_NoCustomer(t *testing.T) {
	re := newReceiptEnv(t)
	r := re.mkReceipt(t, map[string]any{"customer": "", "payment_method": "cash", "deposit_to": re.checking.Id})
	mkReceiptLine(t, re.app, r, 0, item(re.service, 1, 3500, false))
	posted := mustPostReceipt(t, re.app, r.Id, re.users.bookkeeper.Id)

	want := []entryLine{
		{account: re.checking.Id, debit: 3500},
		{account: re.revenue.Id, credit: 3500},
	}
	if got := entryLinesOf(t, re.app, posted.GetString("entry")); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("entry lines =\n%v\nwant (no customer on any line)\n%v", got, want)
	}
}

// Posting never creates an account: not A/R (the invoice's debit) and not an
// Undeposited funds account, even on a chart that has neither.
func TestSalesReceiptPost_CreatesNoAccount(t *testing.T) {
	re := newReceiptEnv(t)
	for _, a := range []*core.Record{re.receivable, re.undeposited} {
		if err := re.app.Delete(reload(t, re.app, "books_accounts", a.Id)); err != nil {
			t.Fatalf("delete %s from the test chart: %v", a.GetString("name"), err)
		}
	}
	r := re.mkReceipt(t, map[string]any{"deposit_to": re.checking.Id})
	mkReceiptLine(t, re.app, r, 0, item(re.service, 1, 45000, false))
	before, err := re.app.CountRecords("books_accounts")
	if err != nil {
		t.Fatal(err)
	}
	posted := mustPostReceipt(t, re.app, r.Id, re.users.bookkeeper.Id)
	if after, _ := re.app.CountRecords("books_accounts"); after != before {
		t.Errorf("%d accounts after the post, want %d", after, before)
	}
	lines := entryLinesOf(t, re.app, posted.GetString("entry"))
	if len(lines) == 0 || lines[0].account != re.checking.Id || lines[0].debit != 45000 {
		t.Errorf("entry lines %v, want line 1 a 45000 debit to 1000 Business Checking", lines)
	}
}

func TestSalesReceiptPost_RefusesZeroTotal(t *testing.T) {
	re := newReceiptEnv(t)
	r := re.mkReceipt(t, nil)
	mkReceiptLine(t, re.app, r, 0, item(re.service, 1, 0, false))
	requireReceiptTotals(t, re.app, r.Id, 0, 0, 0)

	requireRefusalText(t, postReceiptAs(re.app, r.Id, re.users.bookkeeper.Id), wantReceiptZeroTotal)
	requireReceiptNotPosted(t, re.app, r.Id, 1001)
}

// A draft keeps a customer made inactive after it was chosen, but Post refuses
// it under customer; a correction keeps its original's inactive customer.
func TestSalesReceiptPost_RefusesInactiveCustomer(t *testing.T) {
	re := newReceiptEnv(t)
	actor := re.users.bookkeeper.Id
	riverside := mkCustomer(t, re.app, "Riverside Clinic", "")
	r := re.mkReceipt(t, map[string]any{"customer": riverside.Id})
	mkReceiptLine(t, re.app, r, 0, item(re.service, 1, 45000, false))
	if err := setCustomer(t, re.app, riverside.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Riverside Clinic inactive: %v", err)
	}

	requireFieldRefusal(t, postReceiptAs(re.app, r.Id, actor), "customer", wantCustomerInactive("Riverside Clinic"))
	requireReceiptNotPosted(t, re.app, r.Id, 1001)

	// A correction did not choose its customer again: it posts with the
	// original's, now inactive.
	original := mustPostReceipt(t, re.app, re.harborviewSale(t, nil).Id, actor)
	if err := setCustomer(t, re.app, re.customer.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Harborview Dental inactive: %v", err)
	}
	draft := re.mkReceipt(t, map[string]any{"replaces": original.Id, "memo": "Corrected"})
	mkReceiptLine(t, re.app, draft, 0, item(re.service, 2, 45000, false))
	corrected := mustPostReceipt(t, re.app, draft.Id, actor)
	if corrected.GetString("status") != statusPosted || corrected.GetString("customer") != re.customer.Id {
		t.Errorf("correction status %q customer %q, want posted with Harborview Dental", corrected.GetString("status"), corrected.GetString("customer"))
	}
}

func TestSalesReceiptCorrection_TakesTheNumber(t *testing.T) {
	re := newReceiptEnv(t)
	actor := re.users.bookkeeper.Id
	original := mustPostReceipt(t, re.app, re.harborviewSale(t, nil).Id, actor)
	originalEntry := original.GetString("entry")

	draft := re.mkReceipt(t, map[string]any{"replaces": original.Id, "memo": "Corrected"})
	mkReceiptLine(t, re.app, draft, 0, item(re.service, 2, 45000, false))
	corrected := mustPostReceipt(t, re.app, draft.Id, actor)

	if corrected.GetString("number") != "1001" || corrected.GetInt("sequence") != 1001 || corrected.GetString("status") != statusPosted {
		t.Errorf("correction number %q sequence %d status %q, want 1001, 1001, posted",
			corrected.GetString("number"), corrected.GetInt("sequence"), corrected.GetString("status"))
	}
	if got := nextReceiptNumber(t, re.app); got != 1002 {
		t.Errorf("sales receipt sequence next_number = %d after a correction, want 1002 (no new number)", got)
	}
	after := reload(t, re.app, "books_sales_receipts", original.Id)
	if after.GetString("status") != statusVoid || after.GetString("replaced_by") != draft.Id || after.GetString("voided_at") == "" {
		t.Errorf("original status %q replaced_by %q voided_at %q, want void, the correction, a time",
			after.GetString("status"), after.GetString("replaced_by"), after.GetString("voided_at"))
	}
	if s := reload(t, re.app, "books_journal_entries", originalEntry).GetString("status"); s != statusVoid {
		t.Errorf("the original's entry status %q, want void", s)
	}
	newEntry := reload(t, re.app, "books_journal_entries", corrected.GetString("entry"))
	if newEntry.GetString("replaces") != originalEntry || newEntry.GetString("number") != "1001" ||
		newEntry.GetString("doc_type") != "sales_receipt" {
		t.Errorf("correction entry replaces %q number %q doc_type %q, want the original's entry, 1001, sales_receipt",
			newEntry.GetString("replaces"), newEntry.GetString("number"), newEntry.GetString("doc_type"))
	}
	requireNoDrift(t, re.app)
}

// A void writes the void reversal and keeps the number; the General Ledger
// reads Type "Sales receipt" on the receipt's entry and "Void reversal of
// <n>" on its reversal (entryNouns and entry_type_labels.json).
func TestSalesReceiptVoid_ReversesAndKeepsNumber(t *testing.T) {
	re := newReceiptEnv(t)
	registerBooksSources(t)
	actor := re.users.bookkeeper.Id
	r := re.harborviewSale(t, nil)
	entryID := mustPostReceipt(t, re.app, r.Id, actor).GetString("entry")

	if err := voidReceiptAs(re.app, r.Id, re.users.admin.Id); err != nil {
		t.Fatalf("void the sales receipt: %v", err)
	}
	voided := reload(t, re.app, "books_sales_receipts", r.Id)
	if voided.GetString("status") != statusVoid || voided.GetString("number") != "1001" || voided.GetString("voided_at") == "" {
		t.Errorf("receipt status %q number %q voided_at %q, want void, 1001 and a time",
			voided.GetString("status"), voided.GetString("number"), voided.GetString("voided_at"))
	}
	rev := findReversal(t, re.app, entryID)
	if got, want := [3]string{rev.GetString("origin"), rev.GetString("doc_type"), rev.GetString("number")},
		[3]string{originVoidReversal, "sales_receipt", "1001"}; got != want {
		t.Errorf("reversal origin/doc_type/number = %v, want %v", got, want)
	}
	revLines := entryLinesOf(t, re.app, rev.Id)
	if len(revLines) == 0 || revLines[0].account != re.undeposited.Id || revLines[0].credit != 95447 {
		t.Errorf("reversal lines %v, want line 1 a 95447 credit to 1200 Undeposited funds", revLines)
	}
	requireNoDrift(t, re.app)

	res := runGL(t, re.app, re.users.readOnly, map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")}, reports.Options{Today: glToday})
	type cols struct{ typ, number, name string }
	read := func(row reports.Row) cols {
		return cols{typ: textCell(t, row, "type"), number: textCell(t, row, "number"), name: textCell(t, row, "name")}
	}
	for _, w := range []struct {
		what  string
		entry string
		want  cols
	}{
		{"the receipt's deposit line", entryID, cols{"Sales receipt", "1001", "Harborview Dental"}},
		{"the void reversal's deposit line", rev.Id, cols{"Void reversal of 1001", "1001", "Harborview Dental"}},
	} {
		if got := read(lineRow(t, res, entryLineOn(t, re.app, w.entry, re.undeposited))); got != w.want {
			t.Errorf("%s = %+v, want %+v", w.what, got, w.want)
		}
	}
}

// A receipt's entry is made only by posting the receipt (origin document) or
// by reversing such an entry. A Go save of a manual or opening-balance one is
// refused with the receipt's own text.
func TestCreate_SalesReceiptEntriesComeOnlyFromDocuments(t *testing.T) {
	for _, origin := range []string{originManual, originOpeningBalance} {
		t.Run(origin, func(t *testing.T) {
			env := newLedgerEnv(t)
			_, err := saveNew(env.app, "books_journal_entries", map[string]any{
				"date": receiptTestDay, "doc_type": "sales_receipt", "status": "draft", "origin": origin, "currency": "USD",
			})
			requireRefusalText(t, err, wantReceiptEntryFromPost)
			if n, _ := env.app.CountRecords("books_journal_entries", dbx.HashExp{"doc_type": "sales_receipt"}); n != 0 {
				t.Errorf("%d sales receipt entries stored, want 0", n)
			}
		})
	}
}

// A person's REST create of a manual sales receipt entry is refused with the
// receipt's text, and nothing is stored.
func TestCreate_SalesReceiptEntryOverRESTIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	apiReq{
		method:  http.MethodPost,
		url:     "/api/collections/books_journal_entries/records",
		token:   tokenFor(t, env.users.bookkeeper),
		body:    `{"date":"2026-11-04","doc_type":"sales_receipt","status":"draft","origin":"manual"}`,
		want:    http.StatusBadRequest,
		content: []string{wantReceiptEntryFromPost},
		after: func(t testing.TB, app *tests.TestApp) {
			if n, _ := app.CountRecords("books_journal_entries", dbx.HashExp{"doc_type": "sales_receipt"}); n != 0 {
				t.Errorf("%d sales receipt entries stored, want 0", n)
			}
		},
	}.run(t, env.app)
}
