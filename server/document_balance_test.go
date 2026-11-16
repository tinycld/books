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
