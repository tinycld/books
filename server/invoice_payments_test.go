package books

import (
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Invoice void and edit with payments (receive payment spec §3.9, Q5): a
// posted payment's applications hold the invoice; a correction takes them over
// at posting, so its total may not drop below them nor its customer change.
const (
	wantInvoiceVoidWithPayments     = "Payments are applied to this invoice. Void or edit those payments first."
	wantInvoiceCorrectionCustomer   = "Payments are applied to this invoice, so its customer cannot change."
	wantInvoiceCorrectionBelow30000 = "Payments of $300.00 are applied to this invoice. Its total cannot be below that."
)

// paidInvoice posts an invoice of 50000 and a payment that applies 30000 to it.
func (pe *paymentEnv) paidInvoice(t testing.TB) (invoice, payment *core.Record) {
	t.Helper()
	invoice = pe.postedInvoice(t, pe.customer, 50000)
	payment = pe.mkPayment(t, map[string]any{"amount": 30000})
	mkApplication(t, pe.app, payment, invoice, 0, 30000)
	mustPostPayment(t, pe.app, payment.Id, pe.users.bookkeeper.Id)
	requireInvoiceBalance(t, pe.app, invoice, 20000)
	return invoice, payment
}

// correctionOf saves a draft correction of original for customer with one line
// of total.
func (pe *paymentEnv) correctionOf(t testing.TB, original, customer *core.Record, total int64) *core.Record {
	t.Helper()
	draft, err := newInvoice(pe.app, customer, map[string]any{"replaces": original.Id})
	if err != nil {
		t.Fatalf("save the correction draft: %v", err)
	}
	mkInvoiceLine(t, pe.app, draft, 0, item(pe.service, 1, total, false))
	return draft
}

func requireApplicationsName(t testing.TB, app core.App, payment, invoice *core.Record) {
	t.Helper()
	rows, err := app.FindAllRecords("books_payment_applications", dbx.HashExp{"payment": payment.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) == 0 {
		t.Fatal("the payment has no applications")
	}
	for _, r := range rows {
		if got := r.GetString("invoice"); got != invoice.Id {
			t.Errorf("application %s names invoice %q, want %q", r.Id, got, invoice.Id)
		}
	}
}

func TestInvoiceVoid_RefusedWhileAPostedPaymentApplies(t *testing.T) {
	pe := newPaymentEnv(t)
	actor := pe.users.bookkeeper.Id
	inv, payment := pe.paidInvoice(t)

	requireRefusalText(t, voidInvoiceAs(pe.app, inv.Id, actor), wantInvoiceVoidWithPayments)
	if s := reload(t, pe.app, "books_invoices", inv.Id).GetString("status"); s != statusPosted {
		t.Errorf("invoice status %q after the refusal, want posted", s)
	}

	if err := voidPaymentAs(pe.app, payment.Id, actor); err != nil {
		t.Fatalf("void the payment: %v", err)
	}
	if err := voidInvoiceAs(pe.app, inv.Id, actor); err != nil {
		t.Fatalf("void the invoice after its payment was voided: %v", err)
	}
	if s := reload(t, pe.app, "books_invoices", inv.Id).GetString("status"); s != statusVoid {
		t.Errorf("invoice status %q, want void", s)
	}
}

func TestInvoiceCorrection_TakesOverTheApplications(t *testing.T) {
	pe := newPaymentEnv(t)
	inv, payment := pe.paidInvoice(t)
	draft := pe.correctionOf(t, inv, pe.customer, 45000)

	corrected := mustPostInvoice(t, pe.app, draft.Id, pe.users.bookkeeper.Id)
	if corrected.GetString("status") != statusPosted || corrected.GetString("number") != inv.GetString("number") {
		t.Errorf("correction status %q number %q, want posted with the original's number %q",
			corrected.GetString("status"), corrected.GetString("number"), inv.GetString("number"))
	}
	if s := reload(t, pe.app, "books_invoices", inv.Id).GetString("status"); s != statusVoid {
		t.Errorf("original status %q, want void", s)
	}
	requireApplicationsName(t, pe.app, payment, draft)
	requireInvoiceBalance(t, pe.app, corrected, 15000)
	if got, err := documentBalance(pe.app, invoiceBalanceKind, draft.Id); err != nil || got != 15000 {
		t.Errorf("documentBalance of the correction = %d, err %v; want 15000", got, err)
	}
	requireNoDrift(t, pe.app)
}

// A void payment's application stays on the original invoice: the correction
// takes over only what still pays the sale, so a void payment never names an
// invoice of another customer (cp3 item 1; the bill side is
// TestBillCorrection_LeavesAVoidPaymentOnTheOriginal).
func TestInvoiceCorrection_LeavesAVoidPaymentOnTheOriginal(t *testing.T) {
	pe := newPaymentEnv(t)
	inv, payment := pe.paidInvoice(t)
	if err := voidPaymentAs(pe.app, payment.Id, pe.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the payment: %v", err)
	}
	requireInvoiceBalance(t, pe.app, inv, 50000)
	northwind := mkCustomer(t, pe.app, "Northwind Traders", "")
	draft := pe.correctionOf(t, inv, northwind, 45000)

	corrected := mustPostInvoice(t, pe.app, draft.Id, pe.users.bookkeeper.Id)
	if corrected.GetString("customer") != northwind.Id {
		t.Errorf("correction customer %q, want Northwind Traders %q", corrected.GetString("customer"), northwind.Id)
	}
	requireApplicationsName(t, pe.app, payment, inv)
	requireInvoiceBalance(t, pe.app, corrected, 45000)
	requireNoDrift(t, pe.app)
}

// With a void, a posted and a draft payment on the original, the posted and
// the draft payments' applications move to the correction and the void one's
// stays on the original.
func TestInvoiceCorrection_MovesLivePaymentsAndLeavesAVoidOne(t *testing.T) {
	pe := newPaymentEnv(t)
	actor := pe.users.bookkeeper.Id
	inv, voided := pe.paidInvoice(t)
	if err := voidPaymentAs(pe.app, voided.Id, actor); err != nil {
		t.Fatalf("void the payment: %v", err)
	}
	posted := pe.mkPayment(t, map[string]any{"amount": 10000})
	mkApplication(t, pe.app, posted, inv, 0, 10000)
	mustPostPayment(t, pe.app, posted.Id, actor)
	draftPayment := pe.mkPayment(t, map[string]any{"amount": 5000})
	mkApplication(t, pe.app, draftPayment, inv, 0, 5000)
	requireInvoiceBalance(t, pe.app, inv, 40000)
	draft := pe.correctionOf(t, inv, pe.customer, 45000)

	corrected := mustPostInvoice(t, pe.app, draft.Id, actor)
	requireApplicationsName(t, pe.app, voided, inv)
	requireApplicationsName(t, pe.app, posted, draft)
	requireApplicationsName(t, pe.app, draftPayment, draft)
	requireInvoiceBalance(t, pe.app, corrected, 35000)
	requireNoDrift(t, pe.app)
}

func TestInvoiceCorrection_RefusedBelowTheApplications(t *testing.T) {
	pe := newPaymentEnv(t)
	inv, payment := pe.paidInvoice(t)
	draft := pe.correctionOf(t, inv, pe.customer, 20000)
	next := nextInvoiceNumber(t, pe.app)

	requireRefusalText(t, postInvoiceAs(pe.app, draft.Id, pe.users.bookkeeper.Id), wantInvoiceCorrectionBelow30000)
	requireInvoiceNotPosted(t, pe.app, draft.Id, next)
	if s := reload(t, pe.app, "books_invoices", inv.Id).GetString("status"); s != statusPosted {
		t.Errorf("original status %q after the refusal, want posted", s)
	}
	requireApplicationsName(t, pe.app, payment, inv)
	requireInvoiceBalance(t, pe.app, inv, 20000)
}

func TestInvoiceCorrection_RefusesAnotherCustomer(t *testing.T) {
	pe := newPaymentEnv(t)
	inv, payment := pe.paidInvoice(t)
	northwind := mkCustomer(t, pe.app, "Northwind Traders", "")
	draft := pe.correctionOf(t, inv, northwind, 50000)
	next := nextInvoiceNumber(t, pe.app)

	requireRefusalText(t, postInvoiceAs(pe.app, draft.Id, pe.users.bookkeeper.Id), wantInvoiceCorrectionCustomer)
	requireInvoiceNotPosted(t, pe.app, draft.Id, next)
	if s := reload(t, pe.app, "books_invoices", inv.Id).GetString("status"); s != statusPosted {
		t.Errorf("original status %q after the refusal, want posted", s)
	}
	requireApplicationsName(t, pe.app, payment, inv)
}
