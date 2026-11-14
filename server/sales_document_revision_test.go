package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/security"
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

// The refusal texts as the client gets them, written out here so a change of
// wording fails this file too.
const (
	wantInvoiceConflict  = "This invoice changed after you opened it. Load it again, then review it before you save or post."
	wantReceiptConflict  = "This sales receipt changed after you opened it. Load it again, then review it before you save or post."
	wantEstimateConflict = "This estimate changed after you opened it. Load it again, then review it before you save."
)

func patchDoc(t *testing.T, app *tests.TestApp, user *core.Record, collection, id, body string, want int, content ...string) {
	t.Helper()
	apiReq{
		method: http.MethodPatch, url: "/api/collections/" + collection + "/records/" + id,
		token: tokenFor(t, user), body: body, want: want, content: content,
	}.run(t, app)
}

func TestDocRequestRevision_ACurrentPostPasses(t *testing.T) {
	pe := newPostingEnv(t)
	inv, _ := pe.oneLineInvoice(t)
	saw := docRevision(t, pe.app, "books_invoices", inv.Id)
	patchDoc(t, pe.app, pe.users.bookkeeper, "books_invoices", inv.Id,
		fmt.Sprintf(`{"status":"posted","revision":%d}`, saw+1), http.StatusOK, `"status":"posted"`)
	if got := docRevision(t, pe.app, "books_invoices", inv.Id); got != saw+1 {
		t.Fatalf("revision = %d, want %d", got, saw+1)
	}
	requireNoDrift(t, pe.app)
}

func TestDocRequestRevision_AStalePostIsRefused(t *testing.T) {
	pe := newPostingEnv(t)
	inv, line := pe.oneLineInvoice(t)
	stale := fmt.Sprintf(`{"status":"posted","revision":%d}`, docRevision(t, pe.app, "books_invoices", inv.Id)+1)
	// Another editor doubles the quantity.
	if err := setFields(t, pe.app, "books_invoice_lines", line.Id, map[string]any{"quantity": 2}); err != nil {
		t.Fatal(err)
	}
	patchDoc(t, pe.app, pe.users.bookkeeper, "books_invoices", inv.Id, stale, http.StatusConflict, wantInvoiceConflict)
	if got := reload(t, pe.app, "books_invoices", inv.Id).GetString("status"); got != statusDraft {
		t.Fatalf("status = %q: a stale post must not post", got)
	}
}

// One revision behind, and only the header is sent: the stated value equals
// the stored one. It is still stale.
func TestDocRequestRevision_OneBehindIsRefused(t *testing.T) {
	pe := newPostingEnv(t)
	inv, _ := pe.oneLineInvoice(t)
	stale := fmt.Sprintf(`{"status":"posted","revision":%d}`, docRevision(t, pe.app, "books_invoices", inv.Id)+1)
	if err := setFields(t, pe.app, "books_invoices", inv.Id, map[string]any{"memo": "another editor's memo"}); err != nil {
		t.Fatal(err)
	}
	patchDoc(t, pe.app, pe.users.bookkeeper, "books_invoices", inv.Id, stale, http.StatusConflict, wantInvoiceConflict)
}

func TestDocRequestRevision_ADraftUpdateWithNoRevisionIsRefused(t *testing.T) {
	t.Run("invoice", func(t *testing.T) {
		pe := newPostingEnv(t)
		inv, _ := pe.oneLineInvoice(t)
		patchDoc(t, pe.app, pe.users.bookkeeper, "books_invoices", inv.Id,
			`{"memo":"no revision stated"}`, http.StatusConflict, wantInvoiceConflict)
	})
	t.Run("sales receipt", func(t *testing.T) {
		re := newReceiptEnv(t)
		rec := re.mkReceipt(t, nil)
		patchDoc(t, re.app, re.users.bookkeeper, "books_sales_receipts", rec.Id,
			`{"memo":"no revision stated"}`, http.StatusConflict, wantReceiptConflict)
	})
	t.Run("estimate", func(t *testing.T) {
		ce := newConversionEnv(t)
		est := ce.mkEstimate(t, nil)
		patchDoc(t, ce.app, ce.users.bookkeeper, "books_estimates", est.Id,
			`{"memo":"no revision stated"}`, http.StatusConflict, wantEstimateConflict)
	})
}

// A number field accepts "revision+": 1, which always resolves to the stored
// value plus one. That states nothing about what the caller saw.
func TestDocRequestRevision_AModifierIsNotAStatement(t *testing.T) {
	pe := newPostingEnv(t)
	inv, _ := pe.oneLineInvoice(t)
	patchDoc(t, pe.app, pe.users.bookkeeper, "books_invoices", inv.Id,
		`{"status":"posted","revision+":1}`, http.StatusConflict, wantInvoiceConflict)
	if got := reload(t, pe.app, "books_invoices", inv.Id).GetString("status"); got != statusDraft {
		t.Fatalf("status = %q: the invoice must not post", got)
	}
}

func TestDocRequestRevision_AVoidNeedsNoneAndCannotMoveIt(t *testing.T) {
	t.Run("a void with no revision passes", func(t *testing.T) {
		pe := newPostingEnv(t)
		inv, _ := pe.oneLineInvoice(t)
		mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)
		patchDoc(t, pe.app, pe.users.bookkeeper, "books_invoices", inv.Id, `{"status":"void"}`, http.StatusOK, `"status":"void"`)
	})
	t.Run("a void that sends a revision is refused", func(t *testing.T) {
		pe := newPostingEnv(t)
		inv, _ := pe.oneLineInvoice(t)
		mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)
		patchDoc(t, pe.app, pe.users.bookkeeper, "books_invoices", inv.Id,
			`{"status":"void","revision":99}`, http.StatusBadRequest, "A posted or void invoice cannot be changed.")
	})
}

func TestDocRequestRevision_AnEstimateSave(t *testing.T) {
	t.Run("a current save with a status change passes", func(t *testing.T) {
		ce := newConversionEnv(t)
		est := ce.mkEstimate(t, nil)
		saw := docRevision(t, ce.app, "books_estimates", est.Id)
		patchDoc(t, ce.app, ce.users.bookkeeper, "books_estimates", est.Id,
			fmt.Sprintf(`{"status":"rejected","memo":"declined by phone","revision":%d}`, saw+1),
			http.StatusOK, `"status":"rejected"`)
		if got := docRevision(t, ce.app, "books_estimates", est.Id); got != saw+1 {
			t.Fatalf("revision = %d, want %d", got, saw+1)
		}
	})
	t.Run("a stale save is refused and changes nothing", func(t *testing.T) {
		ce := newConversionEnv(t)
		est := ce.mkEstimate(t, nil)
		saw := docRevision(t, ce.app, "books_estimates", est.Id)
		// Another editor adds a line.
		mkEstimateLine(t, ce.app, est, 1, item(ce.service, 1, 100, false))
		patchDoc(t, ce.app, ce.users.bookkeeper, "books_estimates", est.Id,
			fmt.Sprintf(`{"status":"accepted","accepted_date":"2026-11-05","revision":%d}`, saw+1),
			http.StatusConflict, wantEstimateConflict)
		if got := reload(t, ce.app, "books_estimates", est.Id).GetString("status"); got != statusPending {
			t.Fatalf("status = %q, want pending", got)
		}
	})
}

// The shape the client sends for a saved draft: line operations first, then
// one header update that states the revision and posts.
func TestDocRequestRevision_ABatchOfLinesThenThePost(t *testing.T) {
	pe := newPostingEnv(t)
	enableBatch(t, pe.app)
	inv, line := pe.oneLineInvoice(t)
	saw := docRevision(t, pe.app, "books_invoices", inv.Id)

	ops := []string{
		fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_invoice_lines/records/%s","body":{"quantity":2}}`, line.Id),
		fmt.Sprintf(`{"method":"POST","url":"/api/collections/books_invoice_lines/records","body":{"invoice":%q,"position":1,"kind":"item","product":%q,"quantity":1,"rate":1000,"taxable":false}}`, inv.Id, pe.service.Id),
		fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_invoices/records/%s","body":{"memo":"reviewed","status":"posted","revision":%d}}`, inv.Id, saw+1),
	}
	apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, pe.users.bookkeeper),
		body: batchBody(ops...), want: http.StatusOK, content: []string{`"status":"posted"`},
	}.run(t, pe.app)

	posted := reload(t, pe.app, "books_invoices", inv.Id)
	if posted.GetInt("total") != 91000 || posted.GetInt("revision") != saw+1 {
		t.Fatalf("total/revision = %d/%d, want 91000/%d", posted.GetInt("total"), posted.GetInt("revision"), saw+1)
	}
	requireNoDrift(t, pe.app)
}

// A stale batch changes nothing: the line writes roll back with the refusal.
func TestDocRequestRevision_AStaleBatchChangesNothing(t *testing.T) {
	pe := newPostingEnv(t)
	enableBatch(t, pe.app)
	inv, line := pe.oneLineInvoice(t)
	saw := docRevision(t, pe.app, "books_invoices", inv.Id)
	mkInvoiceLine(t, pe.app, inv, 1, item(pe.service, 1, 500, false)) // another editor

	ops := []string{
		fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_invoice_lines/records/%s","body":{"quantity":9}}`, line.Id),
		fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_invoices/records/%s","body":{"memo":"stale","revision":%d}}`, inv.Id, saw+1),
	}
	apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, pe.users.bookkeeper),
		body: batchBody(ops...), want: http.StatusBadRequest, content: []string{wantInvoiceConflict},
	}.run(t, pe.app)

	if got := reload(t, pe.app, "books_invoice_lines", line.Id).GetFloat("quantity"); got != 1 {
		t.Fatalf("quantity = %v: the stale batch's line write was kept", got)
	}
	if got := docRevision(t, pe.app, "books_invoices", inv.Id); got != saw+1 {
		t.Fatalf("revision = %d, want %d (the other editor's one change)", got, saw+1)
	}
}

// A save that changes the tax rate the lines need (plan Decision D2). Stored:
// one line of 100.00, not taxable, under the Denver group (8.71%). The save
// adds a taxable credit of -95.00 and removes the tax. With the stored tax the
// credit's own tax takes the total below zero; with no tax the total is 5.00.
type taxChangeSave struct {
	pe          *postingEnv
	inv         *core.Record
	saw         int
	token       string
	header, add string
}

func newTaxChangeSave(t *testing.T) taxChangeSave {
	t.Helper()
	pe := newPostingEnv(t)
	enableBatch(t, pe.app)
	inv := pe.mkInvoice(t, map[string]any{"tax_rate": pe.denverByAgency.Id})
	mkInvoiceLine(t, pe.app, inv, 0, item(pe.service, 1, 10000, false))
	saw := docRevision(t, pe.app, "books_invoices", inv.Id)
	return taxChangeSave{
		pe: pe, inv: inv, saw: saw, token: tokenFor(t, pe.users.bookkeeper),
		header: fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_invoices/records/%s","body":{"tax_rate":"","revision":%d}}`, inv.Id, saw+1),
		add: fmt.Sprintf(`{"method":"POST","url":"/api/collections/books_invoice_lines/records","body":{"invoice":%q,"position":1,"kind":"item","product":%q,"quantity":1,"rate":-9500,"taxable":true}}`,
			inv.Id, pe.service.Id),
	}
}

func (s taxChangeSave) batch(ops ...string) apiReq {
	return apiReq{
		method: http.MethodPost, url: "/api/batch", token: s.token,
		body: batchBody(ops...),
	}
}

func (s taxChangeSave) post(revision int) apiReq {
	return apiReq{
		method: http.MethodPatch, url: "/api/collections/books_invoices/records/" + s.inv.Id,
		token: s.token,
		body:  fmt.Sprintf(`{"status":"posted","revision":%d}`, revision),
	}
}

// The shape the client sends when the lines hold only with the new tax: one
// batch with the header first, stating the revision, then the line writes;
// then the post as its own request, stating the next revision.
func TestDocRequestRevision_AHeaderFirstBatchThenThePost(t *testing.T) {
	// A batch is checked on the lines it leaves (sales_document_deferral.go),
	// so the refusal under the stored tax is the single request's.
	t.Run("as a single request, the line is refused under the stored tax", func(t *testing.T) {
		s := newTaxChangeSave(t)
		add := apiReq{
			method: http.MethodPost, url: "/api/collections/books_invoice_lines/records", token: s.token,
			body: fmt.Sprintf(`{"invoice":%q,"position":1,"kind":"item","product":%q,"quantity":1,"rate":-9500,"taxable":true}`,
				s.inv.Id, s.pe.service.Id),
			want: http.StatusBadRequest, content: []string{wantTotalNegative},
		}
		add.run(t, s.pe.app)
		if got := docRevision(t, s.pe.app, "books_invoices", s.inv.Id); got != s.saw {
			t.Fatalf("revision = %d, want %d: the refused batch changed it", got, s.saw)
		}
	})

	t.Run("the header first, then the post with the next revision", func(t *testing.T) {
		s := newTaxChangeSave(t)
		batch := s.batch(s.header, s.add)
		batch.want = http.StatusOK
		post := s.post(s.saw + 2)
		post.want, post.content = http.StatusOK, []string{`"status":"posted"`}
		apiSeq(t, s.pe.app, batch, post)

		posted := reload(t, s.pe.app, "books_invoices", s.inv.Id)
		if got := posted.GetInt("revision"); got != s.saw+2 {
			t.Fatalf("revision = %d, want %d (the batch's one, then the post's one)", got, s.saw+2)
		}
		requireInvoiceTotals(t, s.pe.app, s.inv.Id, 500, 0, 500)
		requireNoDrift(t, s.pe.app)
	})

	// The batch left the draft at saw+1. A post that states saw+1 again says
	// the person saw the draft from before the batch.
	t.Run("a post that states the batch's revision is refused", func(t *testing.T) {
		s := newTaxChangeSave(t)
		batch := s.batch(s.header, s.add)
		batch.want = http.StatusOK
		post := s.post(s.saw + 1)
		post.want, post.content = http.StatusConflict, []string{wantInvoiceConflict}
		apiSeq(t, s.pe.app, batch, post)

		draft := reload(t, s.pe.app, "books_invoices", s.inv.Id)
		if got := draft.GetString("status"); got != statusDraft {
			t.Fatalf("status = %q: the refused post must not post", got)
		}
		if got := draft.GetInt("revision"); got != s.saw+1 {
			t.Fatalf("revision = %d, want %d (the batch's one change)", got, s.saw+1)
		}
		requireInvoiceTotals(t, s.pe.app, s.inv.Id, 500, 0, 500)
	})
}

// The shape the client sends for a new document: the header, then its lines,
// in one batch. The lines are part of the create: the revision stays 1.
func TestDocRequestRevision_ANewDocumentBatchLeavesRevisionOne(t *testing.T) {
	pe := newPostingEnv(t)
	enableBatch(t, pe.app)
	id := security.RandomStringWithAlphabet(15, "abcdefghijklmnopqrstuvwxyz0123456789")
	line := func(position, rate int) string {
		return fmt.Sprintf(`{"method":"POST","url":"/api/collections/books_invoice_lines/records","body":{"invoice":%q,"position":%d,"kind":"item","product":%q,"quantity":1,"rate":%d,"taxable":false}}`,
			id, position, pe.service.Id, rate)
	}
	ops := []string{
		fmt.Sprintf(`{"method":"POST","url":"/api/collections/books_invoices/records","body":{"id":%q,"customer":%q,"status":"draft","date":"2026-11-04","due_date":"2026-12-04"}}`, id, pe.customer.Id),
		line(0, 45000),
		line(1, 1000),
	}
	apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, pe.users.bookkeeper),
		body: batchBody(ops...), want: http.StatusOK, content: []string{id},
	}.run(t, pe.app)

	if got := docRevision(t, pe.app, "books_invoices", id); got != 1 {
		t.Fatalf("revision = %d, want 1", got)
	}
	requireInvoiceTotals(t, pe.app, id, 46000, 0, 46000)
}

// A batch that saves an estimate: a line, then the header with its status.
func TestDocRequestRevision_AnEstimateBatch(t *testing.T) {
	ce := newConversionEnv(t)
	enableBatch(t, ce.app)
	est := ce.mkEstimate(t, nil)
	saw := docRevision(t, ce.app, "books_estimates", est.Id)
	ops := []string{
		fmt.Sprintf(`{"method":"POST","url":"/api/collections/books_estimate_lines/records","body":{"estimate":%q,"position":1,"kind":"item","product":%q,"quantity":1,"rate":1000,"taxable":false}}`, est.Id, ce.service.Id),
		fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_estimates/records/%s","body":{"status":"accepted","accepted_date":"2026-11-05","revision":%d}}`, est.Id, saw+1),
	}
	apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, ce.users.bookkeeper),
		body: batchBody(ops...), want: http.StatusOK, content: []string{`"status":"accepted"`},
	}.run(t, ce.app)
	if got := docRevision(t, ce.app, "books_estimates", est.Id); got != saw+1 {
		t.Fatalf("revision = %d, want %d", got, saw+1)
	}
	requireEstimateTotals(t, ce.app, est.Id, 46000, 0, 46000)
}
