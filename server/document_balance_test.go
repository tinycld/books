package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// A document's balance (receive payment spec §4.1, §4.3; pay-bills spec §4.3)
// is its open amount: the server writes total at posting and subtracts each
// posted payment's line; one helper set (document_balance.go) owns every
// write, for invoices and bills alike.

// setDocumentBalanceRaw writes balance straight to the table, past every hook,
// as a drift the verify must find.
func setDocumentBalanceRaw(t testing.TB, app core.App, table, id string, balance int) {
	t.Helper()
	if _, err := app.DB().NewQuery("UPDATE " + table + " SET balance = {:b} WHERE id = {:id}").
		Bind(dbx.Params{"b": balance, "id": id}).Execute(); err != nil {
		t.Fatalf("set %s %s balance %d: %v", table, id, balance, err)
	}
}

func setInvoiceBalanceRaw(t testing.TB, app core.App, id string, balance int) {
	t.Helper()
	setDocumentBalanceRaw(t, app, "books_invoices", id, balance)
}

func TestInvoiceBalance_PostedIsTheTotalAndADraftIsZero(t *testing.T) {
	pe := newPaymentEnv(t)
	inv, err := newInvoice(pe.app, pe.customer, nil)
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	mkInvoiceLine(t, pe.app, inv, 0, item(pe.service, 1, 45000, false))
	requireInvoiceTotals(t, pe.app, inv.Id, 45000, 0, 45000)
	requireInvoiceBalance(t, pe.app, inv, 0)

	mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)
	requireInvoiceBalance(t, pe.app, inv, 45000)
}

// Only a posted payment's application counts: a draft's does not change the
// balance, and a void payment's was released.
func TestInvoiceBalance_IsTheTotalLessPostedApplications(t *testing.T) {
	pe := newPaymentEnv(t)
	actor := pe.users.bookkeeper.Id
	inv := pe.postedInvoice(t, pe.customer, 40000)

	posted := pe.mkPayment(t, map[string]any{"amount": 10000})
	mkApplication(t, pe.app, posted, inv, 0, 10000)
	mustPostPayment(t, pe.app, posted.Id, actor)

	draft := pe.mkPayment(t, map[string]any{"amount": 5000})
	mkApplication(t, pe.app, draft, inv, 0, 5000)

	voided := pe.mkPayment(t, map[string]any{"amount": 7000})
	mkApplication(t, pe.app, voided, inv, 0, 7000)
	mustPostPayment(t, pe.app, voided.Id, actor)
	if err := voidPaymentAs(pe.app, voided.Id, actor); err != nil {
		t.Fatalf("void the payment: %v", err)
	}

	got, err := documentBalance(pe.app, invoiceBalanceKind, inv.Id)
	if err != nil {
		t.Fatalf("documentBalance: %v", err)
	}
	if got != 30000 {
		t.Errorf("documentBalance = %d, want 30000 (40000 less the posted 10000)", got)
	}
	requireInvoiceBalance(t, pe.app, inv, 30000)
}

// balance is a server field: a person's write of it is refused.
func TestInvoiceBalance_APersonCannotSetIt(t *testing.T) {
	t.Run("an update of a posted invoice", func(t *testing.T) {
		pe := newPaymentEnv(t)
		inv := pe.postedInvoice(t, pe.customer, 45000)
		if err := setFields(t, pe.app, "books_invoices", inv.Id, map[string]any{"balance": 100}); err == nil {
			t.Error("a person's update of a posted invoice's balance was saved")
		}
		requireInvoiceBalance(t, pe.app, inv, 45000)
	})

	t.Run("a create over REST", func(t *testing.T) {
		pe := newPaymentEnv(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_invoices/records",
			token: tokenFor(t, pe.users.bookkeeper),
			body: fmt.Sprintf(`{"customer":%q,"status":"draft","date":"2026-11-04","due_date":"2026-12-04","balance":100}`,
				pe.customer.Id),
			want: http.StatusBadRequest,
			after: func(t testing.TB, app *tests.TestApp) {
				if n, _ := app.CountRecords("books_invoices"); n != 0 {
					t.Errorf("%d invoices after a create that set balance, want 0", n)
				}
			},
		}.run(t, pe.app)
	})
}

// The verify part recomputes every posted invoice's balance from its posted
// applications; the rebuild writes it back and counts what it fixed.
func TestVerifyDocumentBalances_FindsAndRebuildFixesAnInvoiceDrift(t *testing.T) {
	pe := newPaymentEnv(t)
	inv := pe.postedInvoice(t, pe.customer, 45000)
	untouched := pe.postedInvoice(t, pe.customer, 20000)
	p := pe.mkPayment(t, map[string]any{"amount": 10000})
	mkApplication(t, pe.app, p, inv, 0, 10000)
	mustPostPayment(t, pe.app, p.Id, pe.users.bookkeeper.Id)
	requireInvoiceBalance(t, pe.app, inv, 35000)

	if drifts, err := verifyDocumentBalances(pe.app); err != nil || len(drifts) != 0 {
		t.Fatalf("verifyDocumentBalances on a clean book = %+v, err %v; want none", drifts, err)
	}

	setInvoiceBalanceRaw(t, pe.app, inv.Id, 45000)
	drifts, err := verifyDocumentBalances(pe.app)
	if err != nil {
		t.Fatalf("verifyDocumentBalances: %v", err)
	}
	if len(drifts) != 1 || !strings.Contains(fmt.Sprintf("%+v", drifts[0]), inv.Id) {
		t.Fatalf("drifts = %+v, want one that names invoice %s", drifts, inv.Id)
	}

	fixed, err := rebuildDocumentBalances(pe.app)
	if err != nil || fixed != 1 {
		t.Fatalf("rebuildDocumentBalances fixed %d, err %v; want 1", fixed, err)
	}
	requireInvoiceBalance(t, pe.app, inv, 35000)
	requireInvoiceBalance(t, pe.app, untouched, 20000)
	if fixed, err := rebuildDocumentBalances(pe.app); err != nil || fixed != 0 {
		t.Fatalf("a second rebuildDocumentBalances fixed %d, err %v; want 0", fixed, err)
	}
	if drifts, err := verifyDocumentBalances(pe.app); err != nil || len(drifts) != 0 {
		t.Fatalf("after the rebuild: %+v, err %v; want none", drifts, err)
	}

	// The ledger rebuild runs it too: the month rows are clean, so it fixes 1.
	setInvoiceBalanceRaw(t, pe.app, inv.Id, 1)
	if fixed, err := rebuildBalances(pe.app); err != nil || fixed != 1 {
		t.Fatalf("rebuildBalances fixed %d, err %v; want 1 (the invoice balance)", fixed, err)
	}
	requireInvoiceBalance(t, pe.app, inv, 35000)
	if fixed, err := rebuildBalances(pe.app); err != nil || fixed != 0 {
		t.Fatalf("a second rebuildBalances fixed %d, err %v; want 0", fixed, err)
	}
}

// Each balance kind lists what lowers its balance (spec §4, Q20): a payer with
// a payment collection is a payment's lines, of which only a posted payment's
// count; a payer without one is a credit application, of which every row
// counts.
func TestBalanceKinds_ListTheirPayers(t *testing.T) {
	invoicePayer := balancePayer{
		LinesCollection: applicationsCollection, LineField: "invoice",
		PaymentCollection: paymentsCollection, PaymentField: "payment",
	}
	billPayment := balancePayer{
		LinesCollection: billPaymentLinesCollection, LineField: "bill",
		PaymentCollection: billPaymentsCollection, PaymentField: "payment",
	}
	billCredit := balancePayer{
		LinesCollection: vendorCreditApplicationsCollection, LineField: "bill",
		EntryField: "vendor_credit", EntryCollection: vendorCreditsCollection,
		CashMemo: "Bill %s paid by vendor credit (cash basis)",
	}
	creditApplied := balancePayer{
		LinesCollection: vendorCreditApplicationsCollection, LineField: "vendor_credit",
		EntryField: "vendor_credit", EntryCollection: vendorCreditsCollection,
	}
	// A posted vendor refund's line lowers the credit (vendor refund spec §4).
	creditRefund := balancePayer{
		LinesCollection: "books_vendor_refund_lines", LineField: "vendor_credit",
		PaymentCollection: "books_vendor_refunds", PaymentField: "refund",
		CashMemo: "Vendor credit %s refunded (cash basis)",
	}
	// A posted refund receipt that pays out a credit memo lowers the memo
	// (refund receipt spec §4.3).
	memoRefund := balancePayer{
		LinesCollection: "books_refund_receipt_credits", LineField: "credit_memo",
		PaymentCollection: "books_refund_receipts", PaymentField: "refund_receipt",
		CashMemo: "Credit memo %s refunded (cash basis)",
	}
	// A posted write-off lowers the invoice by its own status, and is no
	// payment on the cash basis (write-off spec §3.6).
	writeOff := balancePayer{
		LinesCollection: "books_write_offs", LineField: "invoice",
		OwnStatus: true, NoCash: true,
	}
	// A credit memo applied to an invoice lowers both, as a payment does, at
	// the apply date; the memo's rows take the deferral's PaidMemo (apply credit
	// spec §4.3).
	invoiceCredit := balancePayer{
		LinesCollection: "books_credit_memo_applications", LineField: "invoice",
		EntryField: "credit_memo", EntryCollection: "books_credit_memos",
		CashMemo: "Invoice %s paid by credit memo (cash basis)",
	}
	memoApplied := balancePayer{
		LinesCollection: "books_credit_memo_applications", LineField: "credit_memo",
		EntryField: "credit_memo", EntryCollection: "books_credit_memos",
	}
	for _, c := range []struct {
		kind balanceKind
		want []balancePayer
	}{
		{invoiceBalanceKind, []balancePayer{invoicePayer, writeOff, invoiceCredit}},
		{billBalanceKind, []balancePayer{billPayment, billCredit}},
		{vendorCreditBalanceKind, []balancePayer{creditApplied, creditRefund}},
		{creditMemoBalanceKind, []balancePayer{memoRefund, memoApplied}},
	} {
		if len(c.kind.Payers) != len(c.want) {
			t.Errorf("%s has %d payers %+v, want %d", c.kind.Noun, len(c.kind.Payers), c.kind.Payers, len(c.want))
			continue
		}
		for i := range c.want {
			if c.kind.Payers[i] != c.want[i] {
				t.Errorf("%s payer %d = %+v, want %+v", c.kind.Noun, i, c.kind.Payers[i], c.want[i])
			}
		}
	}

	for _, c := range []struct {
		kind balanceKind
		want balancePayer
		ok   bool
	}{
		{invoiceBalanceKind, invoicePayer, true},
		{billBalanceKind, billPayment, true},
		{vendorCreditBalanceKind, creditRefund, true},
		{creditMemoBalanceKind, memoRefund, true},
	} {
		got, ok := c.kind.paymentPayer()
		if ok != c.ok || (ok && got != c.want) {
			t.Errorf("%s paymentPayer() = %+v, %v; want %+v, %v", c.kind.Noun, got, ok, c.want, c.ok)
		}
	}
}

// A vendor credit's balance is its total less its applications and less the
// lines of posted vendor refunds; a draft refund's line and a void refund's
// line do not count (vendor refund spec §3.9).
func TestDocumentBalance_AVendorCreditLessApplicationsAndPostedRefunds(t *testing.T) {
	re := newRefundEnv(t)
	actor := re.users.bookkeeper.Id
	credit := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 42500})
	bill := re.postedBill(t, re.pacificPower, 20000)
	re.apply(t, credit, bill, 10000, applyDay)
	re.refund(t, nil, refundLine{credit, 15000})
	voided := re.refund(t, nil, refundLine{credit, 10000})
	if err := voidRefundAs(re.app, voided.Id, actor); err != nil {
		t.Fatalf("void the 100.00 refund: %v", err)
	}
	draft := re.mkRefund(t, map[string]any{"amount": 5000})
	mkRefundLine(t, re.app, draft, credit, 0, 5000)

	if got, err := postedAppliedTo(re.app, vendorCreditBalanceKind, credit.Id); err != nil || got != 25000 {
		t.Errorf("postedAppliedTo of the credit = %d, err %v; want 25000 (the 10000 application and the posted 15000 refund)", got, err)
	}
	if got, err := documentBalance(re.app, vendorCreditBalanceKind, credit.Id); err != nil || got != 17500 {
		t.Errorf("documentBalance of the 42500 credit = %d, err %v; want 17500", got, err)
	}
	requireVendorCreditBalance(t, re.app, credit.Id, 17500)
	requireNoDocumentDrift(t, re.app)

	// A hand change is found and the rebuild puts 17500 back.
	setDocumentBalanceRaw(t, re.app, "books_vendor_credits", credit.Id, 42500)
	drifts, err := verifyDocumentBalances(re.app)
	if err != nil {
		t.Fatalf("verifyDocumentBalances: %v", err)
	}
	if len(drifts) != 1 || !strings.Contains(fmt.Sprintf("%+v", drifts[0]), credit.Id) {
		t.Fatalf("drifts = %+v, want one that names vendor credit %s", drifts, credit.Id)
	}
	if fixed, err := rebuildDocumentBalances(re.app); err != nil || fixed != 1 {
		t.Fatalf("rebuildDocumentBalances fixed %d, err %v; want 1", fixed, err)
	}
	requireVendorCreditBalance(t, re.app, credit.Id, 17500)
	requireNoDocumentDrift(t, re.app)
}

// A bill's balance is its total less posted bill payments and less credit
// applications. A bill payment has no draft (its status is posted or void), so
// the payment that does not count here is a void one, whose lines were
// released.
func TestDocumentBalance_ABillLessPostedPaymentsAndCredits(t *testing.T) {
	ae := newApplyEnv(t)
	actor := ae.users.bookkeeper.Id
	ae.pay(t, ae.pacificPower, nil, payLine{ae.large, 4000})
	voided := ae.pay(t, ae.pacificPower, nil, payLine{ae.large, 1000})
	if err := voidBillPaymentAs(ae.app, voided.Id, actor); err != nil {
		t.Fatalf("void the 10.00 payment: %v", err)
	}
	ae.apply(t, ae.credit, ae.large, 3000, applyDay)

	if got, err := postedAppliedTo(ae.app, billBalanceKind, ae.large.Id); err != nil || got != 7000 {
		t.Errorf("postedAppliedTo of the bill = %d, err %v; want 7000 (the posted 4000 and the credit's 3000)", got, err)
	}
	if got, err := documentBalance(ae.app, billBalanceKind, ae.large.Id); err != nil || got != 3000 {
		t.Errorf("documentBalance of the 10000 bill = %d, err %v; want 3000", got, err)
	}
	if got, err := postedAppliedTo(ae.app, vendorCreditBalanceKind, ae.credit.Id); err != nil || got != 3000 {
		t.Errorf("postedAppliedTo of the credit = %d, err %v; want 3000", got, err)
	}
	requireBillBalance(t, ae.app, ae.large, 3000)
	requireVendorCreditBalance(t, ae.app, ae.credit.Id, 2000)
	if drifts, err := verifyDocumentBalances(ae.app); err != nil || len(drifts) != 0 {
		t.Fatalf("verifyDocumentBalances = %+v, err %v; want none", drifts, err)
	}

	setDocumentBalanceRaw(t, ae.app, "books_bills", ae.large.Id, 10000)
	drifts, err := verifyDocumentBalances(ae.app)
	if err != nil {
		t.Fatalf("verifyDocumentBalances: %v", err)
	}
	if len(drifts) != 1 || drifts[0].Document != ae.large.Id || drifts[0].Want != 3000 {
		t.Fatalf("drifts = %+v, want one that names bill %s and wants 3000", drifts, ae.large.Id)
	}

	setDocumentBalanceRaw(t, ae.app, vendorCreditsCollection, ae.credit.Id, 5000)
	drifts, err = verifyDocumentBalances(ae.app)
	if err != nil {
		t.Fatalf("verifyDocumentBalances: %v", err)
	}
	wants := map[string]int64{}
	for _, d := range drifts {
		wants[d.Document] = d.Want
	}
	if len(drifts) != 2 || wants[ae.large.Id] != 3000 || wants[ae.credit.Id] != 2000 {
		t.Fatalf("drifts = %+v, want the bill (3000) and the credit (2000)", drifts)
	}

	if fixed, err := rebuildDocumentBalances(ae.app); err != nil || fixed != 2 {
		t.Fatalf("rebuildDocumentBalances fixed %d, err %v; want 2", fixed, err)
	}
	requireBillBalance(t, ae.app, ae.large, 3000)
	requireVendorCreditBalance(t, ae.app, ae.credit.Id, 2000)
	if drifts, err := verifyDocumentBalances(ae.app); err != nil || len(drifts) != 0 {
		t.Fatalf("after the rebuild: %+v, err %v; want none", drifts, err)
	}
}

// A bill's balance is verified and rebuilt from its posted bill payment lines
// as an invoice's is from its applications.
func TestVerifyDocumentBalances_FindsAndRebuildFixesABillDrift(t *testing.T) {
	bp := newBillPayEnv(t)
	bill := bp.postedBill(t, bp.summit, 45000)
	untouched := bp.postedBill(t, bp.summit, 20000)
	bp.pay(t, bp.summit, nil, payLine{bill, 10000})
	requireBillBalance(t, bp.app, bill, 35000)

	if drifts, err := verifyDocumentBalances(bp.app); err != nil || len(drifts) != 0 {
		t.Fatalf("verifyDocumentBalances on a clean book = %+v, err %v; want none", drifts, err)
	}

	setDocumentBalanceRaw(t, bp.app, "books_bills", bill.Id, 45000)
	drifts, err := verifyDocumentBalances(bp.app)
	if err != nil {
		t.Fatalf("verifyDocumentBalances: %v", err)
	}
	if len(drifts) != 1 || !strings.Contains(fmt.Sprintf("%+v", drifts[0]), bill.Id) {
		t.Fatalf("drifts = %+v, want one that names bill %s", drifts, bill.Id)
	}

	fixed, err := rebuildDocumentBalances(bp.app)
	if err != nil || fixed != 1 {
		t.Fatalf("rebuildDocumentBalances fixed %d, err %v; want 1", fixed, err)
	}
	requireBillBalance(t, bp.app, bill, 35000)
	requireBillBalance(t, bp.app, untouched, 20000)
	if fixed, err := rebuildDocumentBalances(bp.app); err != nil || fixed != 0 {
		t.Fatalf("a second rebuildDocumentBalances fixed %d, err %v; want 0", fixed, err)
	}

	setDocumentBalanceRaw(t, bp.app, "books_bills", bill.Id, 1)
	if fixed, err := rebuildBalances(bp.app); err != nil || fixed != 1 {
		t.Fatalf("rebuildBalances fixed %d, err %v; want 1 (the bill balance)", fixed, err)
	}
	requireBillBalance(t, bp.app, bill, 35000)
	if fixed, err := rebuildBalances(bp.app); err != nil || fixed != 0 {
		t.Fatalf("a second rebuildBalances fixed %d, err %v; want 0", fixed, err)
	}
}
