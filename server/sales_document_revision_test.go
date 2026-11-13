package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func docRevision(t testing.TB, app core.App, collection, id string) int {
	t.Helper()
	return reload(t, app, collection, id).GetInt("revision")
}

func TestDocRevision_ANewDocumentStartsAtOne(t *testing.T) {
	t.Run("invoice and estimate", func(t *testing.T) {
		ce := newConversionEnv(t)
		inv := ce.mkInvoice(t, nil)
		if got := docRevision(t, ce.app, "books_invoices", inv.Id); got != 1 {
			t.Errorf("invoice revision = %d, want 1", got)
		}
		est, err := saveNew(ce.app, "books_estimates", map[string]any{
			"customer": ce.customer.Id, "status": statusPending, "date": estimateTestDay,
		})
		if err != nil {
			t.Fatal(err)
		}
		if got := docRevision(t, ce.app, "books_estimates", est.Id); got != 1 {
			t.Errorf("estimate revision = %d, want 1", got)
		}
	})
	t.Run("sales receipt", func(t *testing.T) {
		re := newReceiptEnv(t)
		rec := re.mkReceipt(t, nil)
		if got := docRevision(t, re.app, "books_sales_receipts", rec.Id); got != 1 {
			t.Errorf("sales receipt revision = %d, want 1", got)
		}
	})
}

// A Go caller cannot choose the revision of a new document: Books sets 1.
func TestDocRevision_ACreateCarriesNoValueOfItsOwn(t *testing.T) {
	ce := newConversionEnv(t)
	inv := ce.mkInvoice(t, map[string]any{"revision": 7})
	if got := docRevision(t, ce.app, "books_invoices", inv.Id); got != 1 {
		t.Fatalf("revision = %d, want 1", got)
	}
}

// The create rule pins the field for REST. Each subtest has its own app:
// apiReq allows one call per app.
func TestDocRevision_ARequestCannotSetItOnCreate(t *testing.T) {
	t.Run("invoice", func(t *testing.T) {
		ie := newInvoiceEnv(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_invoices/records",
			token: tokenFor(t, ie.users.bookkeeper), want: http.StatusBadRequest,
			body: fmt.Sprintf(`{"customer":%q,"status":"draft","date":"2026-11-04","due_date":"2026-12-04","revision":5}`, ie.customer.Id),
			after: func(t testing.TB, app *tests.TestApp) {
				if n, _ := app.CountRecords("books_invoices"); n != 0 {
					t.Errorf("%d invoices after a create that set revision, want 0", n)
				}
			},
		}.run(t, ie.app)
	})
	t.Run("sales receipt", func(t *testing.T) {
		re := newReceiptEnv(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_sales_receipts/records",
			token: tokenFor(t, re.users.bookkeeper), want: http.StatusBadRequest,
			body: fmt.Sprintf(`{"customer":%q,"status":"draft","date":%q,"deposit_to":%q,"revision":5}`,
				re.customer.Id, receiptTestDay, re.undeposited.Id),
		}.run(t, re.app)
	})
	t.Run("estimate", func(t *testing.T) {
		ee := newEstimateEnv(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_estimates/records",
			token: tokenFor(t, ee.users.bookkeeper), want: http.StatusBadRequest,
			body: fmt.Sprintf(`{"customer":%q,"status":"pending","date":%q,"revision":5}`, ee.customer.Id, estimateTestDay),
		}.run(t, ee.app)
	})
}
