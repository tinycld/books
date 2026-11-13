package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
)

func invoiceLineCreateOp(invoiceID string, product *core.Record, position, rate int) string {
	return fmt.Sprintf(`{"method":"POST","url":"/api/collections/books_invoice_lines/records","body":{"invoice":%q,"position":%d,"kind":"item","product":%q,"quantity":1,"rate":%d,"taxable":true}}`,
		invoiceID, position, product.Id, rate)
}

// bigInvoice saves a draft invoice with the Denver group and `lines` taxable
// item lines of 1.00 through the hooks, one transaction for each line.
func bigInvoice(t testing.TB, pe *postingEnv, lines int) *core.Record {
	t.Helper()
	inv := pe.mkInvoice(t, map[string]any{"tax_rate": pe.denverByAgency.Id})
	for i := 0; i < lines; i++ {
		mkInvoiceLine(t, pe.app, inv, i, item(pe.service, 1, 100, true))
	}
	return inv
}

// The search index hooks run after the commit, one time for each header save,
// inside the request. The measurement includes them.
func costEnv(t *testing.T) *postingEnv {
	t.Helper()
	pe := newPostingEnv(t)
	enableBatch(t, pe.app)
	registerSearchIndex(&pocketbase.PocketBase{App: pe.app})
	return pe
}

// A new document's save: the header and 250 lines in one batch.
func TestDocBatchCost_Create250LineInvoice(t *testing.T) {
	pe := costEnv(t)
	id := security.RandomStringWithAlphabet(15, "abcdefghijklmnopqrstuvwxyz0123456789")
	ops := []string{fmt.Sprintf(`{"method":"POST","url":"/api/collections/books_invoices/records","body":{"id":%q,"customer":%q,"status":"draft","date":"2026-11-04","due_date":"2026-12-04","tax_rate":%q}}`,
		id, pe.customer.Id, pe.denverByAgency.Id)}
	for i := 0; i < maxDocumentLines; i++ {
		ops = append(ops, invoiceLineCreateOp(id, pe.service, i, 100))
	}

	took := timedRun(t, pe.app, apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, pe.users.bookkeeper),
		body: batchBody(ops...), want: http.StatusOK, content: []string{id},
	})
	t.Logf("create of a 250-line invoice in one batch: %s", took)
	if took > costBound {
		t.Fatalf("took %s, want under %s (the batch timeout is 3s)", took, costBound)
	}
	saved := reload(t, pe.app, "books_invoices", id)
	if saved.GetInt("subtotal") != 25000 || saved.GetInt("revision") != 1 {
		t.Fatalf("subtotal/revision = %d/%d, want 25000/1", saved.GetInt("subtotal"), saved.GetInt("revision"))
	}
	requireLineCount(t, pe.app, saved, maxDocumentLines)
}

// The editor's largest save: every one of 250 lines replaced, then the post,
// in one batch (250 deletes, 250 creates, one header update).
func TestDocBatchCost_ReplaceAndPost250Lines(t *testing.T) {
	pe := costEnv(t)
	inv := bigInvoice(t, pe, maxDocumentLines)
	saw := docRevision(t, pe.app, "books_invoices", inv.Id)
	stored, err := salesDocLines(pe.app, invoiceKind, inv.Id)
	if err != nil {
		t.Fatal(err)
	}

	var ops []string
	// Bottom-up, as the client's planner removes: the document never holds
	// more than 250 lines.
	for i := len(stored) - 1; i >= 0; i-- {
		ops = append(ops, fmt.Sprintf(`{"method":"DELETE","url":"/api/collections/books_invoice_lines/records/%s"}`, stored[i].Id))
	}
	for i := 0; i < maxDocumentLines; i++ {
		ops = append(ops, invoiceLineCreateOp(inv.Id, pe.service, i, 200))
	}
	ops = append(ops, fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_invoices/records/%s","body":{"status":"posted","revision":%d}}`, inv.Id, saw+1))

	took := timedRun(t, pe.app, apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, pe.users.bookkeeper),
		body: batchBody(ops...), want: http.StatusOK, content: []string{`"status":"posted"`},
	})
	t.Logf("replace of 250 lines and the post in one batch: %s", took)
	if took > costBound {
		t.Fatalf("took %s, want under %s (the batch timeout is 3s)", took, costBound)
	}
	posted := reload(t, pe.app, "books_invoices", inv.Id)
	if posted.GetInt("subtotal") != 50000 || posted.GetInt("revision") != saw+1 {
		t.Fatalf("subtotal/revision = %d/%d, want 50000/%d", posted.GetInt("subtotal"), posted.GetInt("revision"), saw+1)
	}
	requireNoDrift(t, pe.app)
}
