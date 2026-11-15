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

// Posting a payment (receive payment spec §4.3): draft → posted writes a
// numbered journal entry through postDocument with doc type payment: a debit
// to Deposit to and a credit to Accounts receivable for the amount, both
// naming the customer, and subtracts each application from its invoice's
// balance. Void and correction release the applications again.

// postPaymentAs posts a draft payment as actor, as the client's PATCH
// {"status":"posted"} does once the request hook has stamped the poster.
func postPaymentAs(app core.App, paymentID, actor string) error {
	r, err := app.FindRecordById("books_payments", paymentID)
	if err != nil {
		return err
	}
	r.Set("status", statusPosted)
	r.Set("posted_by", actor)
	return app.Save(r)
}

func mustPostPayment(t testing.TB, app core.App, paymentID, actor string) *core.Record {
	t.Helper()
	if err := postPaymentAs(app, paymentID, actor); err != nil {
		t.Fatalf("post payment %s: %v", paymentID, err)
	}
	return reload(t, app, "books_payments", paymentID)
}

func voidPaymentAs(app core.App, paymentID, actor string) error {
	r, err := app.FindRecordById("books_payments", paymentID)
	if err != nil {
		return err
	}
	r.Set("status", statusVoid)
	r.Set("voided_by", actor)
	return app.Save(r)
}

func nextPaymentNumber(t testing.TB, app core.App) int {
	t.Helper()
	return reload(t, app, "books_doc_sequences", paymentSequenceID).GetInt("next_number")
}

func requireInvoiceBalance(t testing.TB, app core.App, invoice *core.Record, want int) {
	t.Helper()
	if got := reload(t, app, "books_invoices", invoice.Id).GetInt("balance"); got != want {
		t.Errorf("invoice %s balance = %d, want %d", invoice.GetString("number"), got, want)
	}
}

// requirePaymentNotPosted checks that a refused post wrote nothing.
func requirePaymentNotPosted(t testing.TB, app core.App, paymentID string, nextNumber int) {
	t.Helper()
	r := reload(t, app, "books_payments", paymentID)
	if r.GetString("status") != statusDraft || r.GetString("number") != "" || r.GetString("entry") != "" ||
		r.GetString("posted_at") != "" || r.GetInt("applied") != 0 || r.GetInt("credited") != 0 {
		t.Errorf("payment after a refused post: status %q number %q entry %q posted_at %q applied %d credited %d, want a draft with none",
			r.GetString("status"), r.GetString("number"), r.GetString("entry"), r.GetString("posted_at"),
			r.GetInt("applied"), r.GetInt("credited"))
	}
	if n, err := app.CountRecords("books_journal_entries", dbx.HashExp{"document": paymentID}); err != nil || n != 0 {
		t.Errorf("%d journal entries name the payment (err %v), want 0", n, err)
	}
	if got := nextPaymentNumber(t, app); got != nextNumber {
		t.Errorf("payment sequence next_number = %d after a refused post, want %d", got, nextNumber)
	}
}

func TestPaymentPost_WritesTheEntryAndTheBalances(t *testing.T) {
	pe := newPaymentEnv(t)
	actor := pe.users.bookkeeper.Id
	first := pe.postedInvoice(t, pe.customer, 30000)
	second := pe.postedInvoice(t, pe.customer, 40000)
	invoiceNext := nextInvoiceNumber(t, pe.app)
	p := pe.mkPayment(t, map[string]any{
		"amount": 70000, "deposit_to": pe.checking.Id, "payment_method": "check", "reference_no": "10442",
		"memo": "Two invoices, one check",
	})
	mkApplication(t, pe.app, p, first, 0, 30000)
	mkApplication(t, pe.app, p, second, 1, 25000)

	posted := mustPostPayment(t, pe.app, p.Id, actor)
	if got, want := [3]any{posted.GetString("status"), posted.GetString("number"), posted.GetInt("sequence")},
		[3]any{statusPosted, "1001", 1001}; got != want {
		t.Errorf("payment status/number/sequence = %v, want %v", got, want)
	}
	if posted.GetInt("applied") != 55000 || posted.GetInt("credited") != 15000 {
		t.Errorf("payment applied %d credited %d, want 55000 and 15000", posted.GetInt("applied"), posted.GetInt("credited"))
	}
	if posted.GetString("posted_by") != actor || posted.GetString("posted_at") == "" {
		t.Errorf("payment posted_by %q posted_at %q, want the poster and a time", posted.GetString("posted_by"), posted.GetString("posted_at"))
	}
	if got := nextPaymentNumber(t, pe.app); got != 1002 {
		t.Errorf("payment sequence next_number = %d after the post, want 1002", got)
	}
	if got := nextInvoiceNumber(t, pe.app); got != invoiceNext {
		t.Errorf("invoice sequence next_number = %d after a payment post, want %d (untouched)", got, invoiceNext)
	}

	entryID := posted.GetString("entry")
	if entryID == "" {
		t.Fatal("the posted payment names no entry")
	}
	if n, err := pe.app.CountRecords("books_journal_entries", dbx.HashExp{"document": p.Id}); err != nil || n != 1 {
		t.Errorf("%d entries name the payment (err %v), want 1", n, err)
	}
	entry := reload(t, pe.app, "books_journal_entries", entryID)
	if got, want := [7]string{
		entry.GetString("status"), entry.GetString("doc_type"), entry.GetString("origin"),
		entry.GetString("document"), entry.GetString("number"), entry.GetString("date"), entry.GetString("memo"),
	}, [7]string{statusPosted, "payment", "document", p.Id, "1001", paymentTestDay, "Two invoices, one check"}; got != want {
		t.Errorf("entry status/doc_type/origin/document/number/date/memo = %v, want %v", got, want)
	}
	c := pe.customer.Id
	want := []entryLine{
		{account: pe.checking.Id, debit: 70000, customer: c},
		{account: pe.receivable.Id, credit: 70000, customer: c},
	}
	if got := entryLinesOf(t, pe.app, entryID); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("entry lines =\n%v\nwant\n%v", got, want)
	}

	requireInvoiceBalance(t, pe.app, first, 0)
	requireInvoiceBalance(t, pe.app, second, 15000)
	requireNoDrift(t, pe.app)
}

func TestPaymentPost_FillsAnEmptyDepositToWithUndepositedFunds(t *testing.T) {
	t.Run("a chart with 1200 Undeposited funds", func(t *testing.T) {
		pe := newPaymentEnv(t)
		p := pe.mkPayment(t, map[string]any{"amount": 25000})
		posted := mustPostPayment(t, pe.app, p.Id, pe.users.bookkeeper.Id)
		if got := posted.GetString("deposit_to"); got != pe.undeposited.Id {
			t.Errorf("deposit_to = %q, want 1200 Undeposited funds", got)
		}
		lines := entryLinesOf(t, pe.app, posted.GetString("entry"))
		if len(lines) == 0 || lines[0].account != pe.undeposited.Id || lines[0].debit != 25000 {
			t.Errorf("entry lines %v, want line 1 a 25000 debit to 1200 Undeposited funds", lines)
		}
	})

	t.Run("a chart with none creates it", func(t *testing.T) {
		pe := newPaymentEnv(t)
		if err := pe.app.Delete(reload(t, pe.app, "books_accounts", pe.undeposited.Id)); err != nil {
			t.Fatalf("delete 1200 Undeposited funds from the test chart: %v", err)
		}
		p := pe.mkPayment(t, map[string]any{"amount": 25000})
		posted := mustPostPayment(t, pe.app, p.Id, pe.users.bookkeeper.Id)

		created, err := pe.app.FindRecordsByFilter("books_accounts", "detail_type = 'undeposited_funds'", "", 0, 0)
		if err != nil {
			t.Fatal(err)
		}
		if len(created) != 1 {
			t.Fatalf("%d Undeposited funds accounts after the post, want 1", len(created))
		}
		if got, want := [2]string{created[0].GetString("name"), created[0].GetString("number")}, [2]string{"Undeposited funds", "1200"}; got != want {
			t.Errorf("created account name/number = %v, want %v", got, want)
		}
		if got := posted.GetString("deposit_to"); got != created[0].Id {
			t.Errorf("deposit_to = %q, want the created account %s", got, created[0].Id)
		}
		lines := entryLinesOf(t, pe.app, posted.GetString("entry"))
		if len(lines) == 0 || lines[0].account != created[0].Id || lines[0].debit != 25000 {
			t.Errorf("entry lines %v, want line 1 a 25000 debit to the created account", lines)
		}
	})
}

// Q4: a payment with nothing applied is all credit.
func TestPaymentPost_NoApplicationsIsAllCredit(t *testing.T) {
	pe := newPaymentEnv(t)
	p := pe.mkPayment(t, map[string]any{"amount": 25000, "deposit_to": pe.checking.Id})
	posted := mustPostPayment(t, pe.app, p.Id, pe.users.bookkeeper.Id)
	if posted.GetString("status") != statusPosted || posted.GetInt("applied") != 0 || posted.GetInt("credited") != 25000 {
		t.Errorf("payment status %q applied %d credited %d, want posted, 0, 25000",
			posted.GetString("status"), posted.GetInt("applied"), posted.GetInt("credited"))
	}
	c := pe.customer.Id
	want := []entryLine{
		{account: pe.checking.Id, debit: 25000, customer: c},
		{account: pe.receivable.Id, credit: 25000, customer: c},
	}
	if got := entryLinesOf(t, pe.app, posted.GetString("entry")); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("entry lines =\n%v\nwant\n%v", got, want)
	}
}

// The balance is read again at posting: another payment posted first leaves
// less open than the draft applies.
func TestPaymentPost_RefusesAnApplicationAboveTheBalanceAtPosting(t *testing.T) {
	pe := newPaymentEnv(t)
	actor := pe.users.bookkeeper.Id
	first := pe.postedInvoice(t, pe.customer, 30000)
	second := pe.postedInvoice(t, pe.customer, 40000)
	earlier := pe.mkPayment(t, map[string]any{"amount": 30000})
	mkApplication(t, pe.app, earlier, second, 0, 30000)
	late := pe.mkPayment(t, map[string]any{"amount": 55000})
	mkApplication(t, pe.app, late, first, 0, 30000)
	mkApplication(t, pe.app, late, second, 1, 25000)
	mustPostPayment(t, pe.app, earlier.Id, actor)

	err := postPaymentAs(pe.app, late.Id, actor)
	requireFieldRefusal(t, err, "applications.1",
		fmt.Sprintf("Invoice %s: the payment is more than its open balance of $100.00.", second.GetString("number")))
	requirePaymentNotPosted(t, pe.app, late.Id, 1002)
	requireInvoiceBalance(t, pe.app, first, 30000)
	requireInvoiceBalance(t, pe.app, second, 10000)
	requireNoDrift(t, pe.app)
}

func TestPaymentPost_RefusesApplicationsAboveTheAmount(t *testing.T) {
	pe := newPaymentEnv(t)
	first := pe.postedInvoice(t, pe.customer, 30000)
	second := pe.postedInvoice(t, pe.customer, 40000)
	p := pe.mkPayment(t, map[string]any{"amount": 50000})
	mkApplication(t, pe.app, p, first, 0, 30000)
	mkApplication(t, pe.app, p, second, 1, 25000)

	requireRefusalText(t, postPaymentAs(pe.app, p.Id, pe.users.bookkeeper.Id),
		"The payments add up to $550.00, more than the $500.00 received.")
	requirePaymentNotPosted(t, pe.app, p.Id, 1001)
	requireInvoiceBalance(t, pe.app, first, 30000)
	requireInvoiceBalance(t, pe.app, second, 40000)
}

func TestPaymentPost_RefusesAnInactiveCustomer(t *testing.T) {
	pe := newPaymentEnv(t)
	riverside := mkCustomer(t, pe.app, "Riverside Clinic", "")
	p := pe.mkPayment(t, map[string]any{"customer": riverside.Id, "amount": 25000})
	makeCustomerInactive(t, pe.app, riverside)

	requireFieldRefusal(t, postPaymentAs(pe.app, p.Id, pe.users.bookkeeper.Id), "customer", wantCustomerInactive("Riverside Clinic"))
	requirePaymentNotPosted(t, pe.app, p.Id, 1001)
}

func TestPaymentPost_HonorsCloseDate(t *testing.T) {
	pe := newPaymentEnv(t)
	p := pe.mkPayment(t, map[string]any{"amount": 25000})
	setCloseDate(t, pe.app, paymentTestDay)

	requireRefusalText(t, postPaymentAs(pe.app, p.Id, pe.users.bookkeeper.Id),
		"The books are closed through 2026-11-10. Ask a Books admin for a close-date override to post on 2026-11-10.")
	requirePaymentNotPosted(t, pe.app, p.Id, 1001)
}

// A void writes the void reversal in the original period, keeps the number and
// opens the invoices it paid again; the General Ledger reads Type "Payment" on
// the payment's entry and "Void reversal of <n>" on its reversal.
func TestPaymentVoid_ReversesKeepsTheNumberAndRestoresTheBalances(t *testing.T) {
	pe := newPaymentEnv(t)
	registerBooksSources(t)
	actor := pe.users.bookkeeper.Id
	first := pe.postedInvoice(t, pe.customer, 30000)
	second := pe.postedInvoice(t, pe.customer, 40000)
	p := pe.mkPayment(t, map[string]any{"amount": 70000})
	mkApplication(t, pe.app, p, first, 0, 30000)
	mkApplication(t, pe.app, p, second, 1, 25000)
	entryID := mustPostPayment(t, pe.app, p.Id, actor).GetString("entry")
	requireInvoiceBalance(t, pe.app, first, 0)
	requireInvoiceBalance(t, pe.app, second, 15000)

	if err := voidPaymentAs(pe.app, p.Id, pe.users.admin.Id); err != nil {
		t.Fatalf("void the payment: %v", err)
	}
	voided := reload(t, pe.app, "books_payments", p.Id)
	if voided.GetString("status") != statusVoid || voided.GetString("number") != "1001" || voided.GetString("voided_at") == "" {
		t.Errorf("payment status %q number %q voided_at %q, want void, 1001 and a time",
			voided.GetString("status"), voided.GetString("number"), voided.GetString("voided_at"))
	}
	if s := reload(t, pe.app, "books_journal_entries", entryID).GetString("status"); s != statusVoid {
		t.Errorf("the payment's entry status %q, want void", s)
	}
	rev := findReversal(t, pe.app, entryID)
	if got, want := [4]string{rev.GetString("origin"), rev.GetString("doc_type"), rev.GetString("number"), rev.GetString("date")},
		[4]string{originVoidReversal, "payment", "1001", paymentTestDay}; got != want {
		t.Errorf("reversal origin/doc_type/number/date = %v, want %v", got, want)
	}
	revLines := entryLinesOf(t, pe.app, rev.Id)
	if len(revLines) == 0 || revLines[0].account != pe.undeposited.Id || revLines[0].credit != 70000 {
		t.Errorf("reversal lines %v, want line 1 a 70000 credit to 1200 Undeposited funds", revLines)
	}
	requireInvoiceBalance(t, pe.app, first, 30000)
	requireInvoiceBalance(t, pe.app, second, 40000)
	requireNoDrift(t, pe.app)

	res := runGL(t, pe.app, pe.users.readOnly, map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")}, reports.Options{Today: glToday})
	type cols struct{ typ, number, name string }
	read := func(row reports.Row) cols {
		return cols{typ: textCell(t, row, "type"), number: textCell(t, row, "number"), name: textCell(t, row, "name")}
	}
	for _, w := range []struct {
		what  string
		entry string
		want  cols
	}{
		{"the payment's deposit line", entryID, cols{"Payment", "1001", "Harborview Dental"}},
		{"the void reversal's deposit line", rev.Id, cols{"Void reversal of 1001", "1001", "Harborview Dental"}},
	} {
		if got := read(lineRow(t, res, entryLineOn(t, pe.app, w.entry, pe.undeposited))); got != w.want {
			t.Errorf("%s = %+v, want %+v", w.what, got, w.want)
		}
	}
}

// Q8: a correction posts under the original's number, releases the original's
// applications before it checks its own against the balances, and applies its
// own; the original becomes void with replaced_by.
func TestPaymentCorrection_TakesTheNumberAndMovesTheApplications(t *testing.T) {
	pe := newPaymentEnv(t)
	actor := pe.users.bookkeeper.Id
	first := pe.postedInvoice(t, pe.customer, 30000)
	second := pe.postedInvoice(t, pe.customer, 40000)
	original := pe.mkPayment(t, map[string]any{"amount": 70000})
	mkApplication(t, pe.app, original, first, 0, 30000)
	mkApplication(t, pe.app, original, second, 1, 25000)
	originalEntry := mustPostPayment(t, pe.app, original.Id, actor).GetString("entry")

	// Invoice 1001 is paid in full by the original: only a release first lets
	// the correction pay it again.
	draft := pe.mkPayment(t, map[string]any{"replaces": original.Id, "amount": 70000, "memo": "Corrected"})
	mkApplication(t, pe.app, draft, first, 0, 30000)
	mkApplication(t, pe.app, draft, second, 1, 40000)
	corrected := mustPostPayment(t, pe.app, draft.Id, actor)

	if got, want := [3]any{corrected.GetString("status"), corrected.GetString("number"), corrected.GetInt("sequence")},
		[3]any{statusPosted, "1001", 1001}; got != want {
		t.Errorf("correction status/number/sequence = %v, want %v", got, want)
	}
	if corrected.GetInt("applied") != 70000 || corrected.GetInt("credited") != 0 {
		t.Errorf("correction applied %d credited %d, want 70000 and 0", corrected.GetInt("applied"), corrected.GetInt("credited"))
	}
	if got := nextPaymentNumber(t, pe.app); got != 1002 {
		t.Errorf("payment sequence next_number = %d after a correction, want 1002 (no new number)", got)
	}
	after := reload(t, pe.app, "books_payments", original.Id)
	if after.GetString("status") != statusVoid || after.GetString("replaced_by") != draft.Id || after.GetString("voided_at") == "" {
		t.Errorf("original status %q replaced_by %q voided_at %q, want void, the correction, a time",
			after.GetString("status"), after.GetString("replaced_by"), after.GetString("voided_at"))
	}
	if s := reload(t, pe.app, "books_journal_entries", originalEntry).GetString("status"); s != statusVoid {
		t.Errorf("the original's entry status %q, want void", s)
	}
	newEntry := reload(t, pe.app, "books_journal_entries", corrected.GetString("entry"))
	if got, want := [4]string{newEntry.GetString("replaces"), newEntry.GetString("number"), newEntry.GetString("doc_type"), newEntry.GetString("document")},
		[4]string{originalEntry, "1001", "payment", draft.Id}; got != want {
		t.Errorf("correction entry replaces/number/doc_type/document = %v, want %v", got, want)
	}
	requireInvoiceBalance(t, pe.app, first, 0)
	requireInvoiceBalance(t, pe.app, second, 0)
	requireNoDrift(t, pe.app)
}

// The user did not choose the customer again, so a correction posts with the
// original's customer after it became inactive.
func TestPaymentCorrection_KeepsAnInactiveCustomer(t *testing.T) {
	pe := newPaymentEnv(t)
	actor := pe.users.bookkeeper.Id
	inv := pe.postedInvoice(t, pe.customer, 30000)
	original := pe.mkPayment(t, map[string]any{"amount": 20000})
	mkApplication(t, pe.app, original, inv, 0, 20000)
	mustPostPayment(t, pe.app, original.Id, actor)
	makeCustomerInactive(t, pe.app, pe.customer)

	draft := pe.mkPayment(t, map[string]any{"replaces": original.Id, "amount": 30000})
	mkApplication(t, pe.app, draft, inv, 0, 30000)
	if err := postPaymentAs(pe.app, draft.Id, actor); err != nil {
		t.Fatalf("post the correction of an inactive customer's payment: %v", err)
	}
	corrected := reload(t, pe.app, "books_payments", draft.Id)
	if corrected.GetString("status") != statusPosted || corrected.GetString("customer") != pe.customer.Id {
		t.Errorf("correction status %q customer %q, want posted with Harborview Dental", corrected.GetString("status"), corrected.GetString("customer"))
	}
	requireInvoiceBalance(t, pe.app, inv, 0)
}

// A person's REST create of a payment entry is refused with the payment's
// text, and nothing is stored.
func TestCreate_PaymentEntryOverRESTIsRefused(t *testing.T) {
	pe := newPaymentEnv(t)
	apiReq{
		method:  http.MethodPost,
		url:     "/api/collections/books_journal_entries/records",
		token:   tokenFor(t, pe.users.bookkeeper),
		body:    `{"date":"2026-11-10","doc_type":"payment","status":"draft","origin":"manual"}`,
		want:    http.StatusBadRequest,
		content: []string{wantPaymentEntryFromPost},
		after: func(t testing.TB, app *tests.TestApp) {
			if n, _ := app.CountRecords("books_journal_entries", dbx.HashExp{"doc_type": "payment"}); n != 0 {
				t.Errorf("%d payment entries stored, want 0", n)
			}
		},
	}.run(t, pe.app)
}
