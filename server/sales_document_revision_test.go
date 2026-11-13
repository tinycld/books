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

// oneLineInvoice is a draft invoice with one Monthly bookkeeping line of
// 450.00, and that line.
func (pe *postingEnv) oneLineInvoice(t testing.TB) (*core.Record, *core.Record) {
	t.Helper()
	inv := pe.mkInvoice(t, nil)
	line := mkInvoiceLine(t, pe.app, inv, 0, item(pe.service, 1, 45000, false))
	return inv, line
}

func TestDocRevision_EachLineWriteInItsOwnTransactionAddsOne(t *testing.T) {
	pe := newPostingEnv(t)
	inv, line := pe.oneLineInvoice(t) // the create, then one line: two transactions
	if got := docRevision(t, pe.app, "books_invoices", inv.Id); got != 2 {
		t.Fatalf("revision after the create and one line = %d, want 2", got)
	}
	if err := setFields(t, pe.app, "books_invoice_lines", line.Id, map[string]any{"quantity": 2}); err != nil {
		t.Fatal(err)
	}
	if got := docRevision(t, pe.app, "books_invoices", inv.Id); got != 3 {
		t.Fatalf("revision after a line update = %d, want 3", got)
	}
	// A change that leaves every total as it is still counts.
	if err := setFields(t, pe.app, "books_invoice_lines", line.Id, map[string]any{"description": "October"}); err != nil {
		t.Fatal(err)
	}
	if got := docRevision(t, pe.app, "books_invoices", inv.Id); got != 4 {
		t.Fatalf("revision after a description change = %d, want 4", got)
	}
	if err := pe.app.Delete(reload(t, pe.app, "books_invoice_lines", line.Id)); err != nil {
		t.Fatal(err)
	}
	if got := docRevision(t, pe.app, "books_invoices", inv.Id); got != 5 {
		t.Fatalf("revision after a line delete = %d, want 5", got)
	}
}

func TestDocRevision_ManyWritesInOneTransactionAddOne(t *testing.T) {
	pe := newPostingEnv(t)
	inv, _ := pe.oneLineInvoice(t)
	before := docRevision(t, pe.app, "books_invoices", inv.Id)

	err := pe.app.RunInTransaction(func(tx core.App) error {
		for i := 1; i <= 3; i++ {
			if _, err := newInvoiceLine(tx, inv, i, item(pe.service, 1, 100, false)); err != nil {
				return err
			}
		}
		fresh, err := tx.FindRecordById("books_invoices", inv.Id)
		if err != nil {
			return err
		}
		fresh.Set("memo", "changed in the same transaction")
		return tx.Save(fresh)
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := docRevision(t, pe.app, "books_invoices", inv.Id); got != before+1 {
		t.Fatalf("revision = %d, want %d: one transaction is one change", got, before+1)
	}
}

func TestDocRevision_AHeaderEditAddsOne(t *testing.T) {
	pe := newPostingEnv(t)
	inv, _ := pe.oneLineInvoice(t)
	before := docRevision(t, pe.app, "books_invoices", inv.Id)
	if err := setFields(t, pe.app, "books_invoices", inv.Id, map[string]any{"memo": "new memo"}); err != nil {
		t.Fatal(err)
	}
	if got := docRevision(t, pe.app, "books_invoices", inv.Id); got != before+1 {
		t.Fatalf("revision = %d, want %d", got, before+1)
	}
}

// A Go caller states no revision. Whatever its record carries is replaced: the
// count cannot jump, and a record kept from before a line write is not refused.
func TestDocRevision_AGoCallersValueIsReplaced(t *testing.T) {
	pe := newPostingEnv(t)
	inv, _ := pe.oneLineInvoice(t) // inv is held from the create: it carries 1, stored is 2
	before := docRevision(t, pe.app, "books_invoices", inv.Id)

	inv.Set("memo", "saved from a record held since the create")
	if err := pe.app.Save(inv); err != nil {
		t.Fatalf("save a held record: %v", err)
	}
	if got := docRevision(t, pe.app, "books_invoices", inv.Id); got != before+1 {
		t.Fatalf("revision = %d, want %d", got, before+1)
	}
	requireInvoiceTotals(t, pe.app, inv.Id, 45000, 0, 45000)

	fresh := reload(t, pe.app, "books_invoices", inv.Id)
	fresh.Set("revision", fresh.GetInt("revision")+5)
	if err := pe.app.Save(fresh); err != nil {
		t.Fatalf("save with a jumped revision: %v", err)
	}
	if got := docRevision(t, pe.app, "books_invoices", inv.Id); got != before+2 {
		t.Fatalf("revision = %d, want %d: the count cannot jump", got, before+2)
	}
}

// The post is the last change to the draft: it takes the transaction's one
// increase, as an entry's post does. A void changes a posted document, whose
// revision does not move.
func TestDocRevision_APostAddsOneAndAVoidAddsNone(t *testing.T) {
	pe := newPostingEnv(t)
	inv, _ := pe.oneLineInvoice(t)
	before := docRevision(t, pe.app, "books_invoices", inv.Id)
	actor := pe.users.bookkeeper.Id

	posted := mustPostInvoice(t, pe.app, inv.Id, actor)
	if got := posted.GetInt("revision"); got != before+1 {
		t.Fatalf("revision after the post = %d, want %d", got, before+1)
	}
	if err := voidInvoiceAs(pe.app, inv.Id, actor); err != nil {
		t.Fatal(err)
	}
	if got := docRevision(t, pe.app, "books_invoices", inv.Id); got != before+1 {
		t.Fatalf("revision after the void = %d, want %d", got, before+1)
	}
	requireNoDrift(t, pe.app)
}

// An invoice's create closes its estimate: the last change to the open
// estimate, so it adds one. The reopen of the closed estimate (its invoice's
// draft is deleted) changes an estimate nobody edits, and adds none.
func TestDocRevision_AnEstimateClosedAddsOneAndReopenedAddsNone(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkEstimate(t, nil)
	before := docRevision(t, ce.app, "books_estimates", est.Id)

	inv := ce.convert(t, est, nil)
	requireEstimateState(t, ce.app, est.Id, estimateState{status: statusClosed, invoice: inv.Id})
	if got := docRevision(t, ce.app, "books_estimates", est.Id); got != before+1 {
		t.Fatalf("revision after the close = %d, want %d", got, before+1)
	}

	if err := ce.app.Delete(reload(t, ce.app, "books_invoices", inv.Id)); err != nil {
		t.Fatal(err)
	}
	requireEstimateState(t, ce.app, est.Id, estimateState{status: statusPending})
	if got := docRevision(t, ce.app, "books_estimates", est.Id); got != before+1 {
		t.Fatalf("revision after the reopen = %d, want %d", got, before+1)
	}
}

func TestDocRevision_AnEstimateLineAndAStatusChangeEachAddOne(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkEstimate(t, nil) // the create and one line
	if got := docRevision(t, ce.app, "books_estimates", est.Id); got != 2 {
		t.Fatalf("revision after the create and one line = %d, want 2", got)
	}
	if err := setFields(t, ce.app, "books_estimates", est.Id, map[string]any{"status": statusRejected}); err != nil {
		t.Fatal(err)
	}
	if got := docRevision(t, ce.app, "books_estimates", est.Id); got != 3 {
		t.Fatalf("revision after a status change = %d, want 3", got)
	}
}
