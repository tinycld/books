package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The rules pin a document's Books fields for a person. These hold for Go and
// a superuser too.

const wantBooksFields = "Books sets these fields itself: "

func TestDocFields_ANewDraftCannotCarryABooksField(t *testing.T) {
	t.Run("invoice", func(t *testing.T) {
		ie := newInvoiceEnv(t)
		entry := mustPost(t, ie.app, ie.sale(t, "2026-11-04", 100).Id, "")
		for field, value := range map[string]any{
			"number": "9001", "sequence": 9001, "entry": entry.Id, "posted_by": ie.users.bookkeeper.Id,
			"posted_at": "2026-11-04 10:00:00.000Z", "voided_by": ie.users.bookkeeper.Id,
		} {
			_, err := newInvoice(ie.app, ie.customer, map[string]any{field: value})
			requireRefused(t, err, wantBooksFields+field)
		}
		if n, _ := ie.app.CountRecords("books_invoices"); n != 0 {
			t.Fatalf("%d invoices were created", n)
		}
	})
	t.Run("sales receipt", func(t *testing.T) {
		re := newReceiptEnv(t)
		_, err := re.newReceipt(map[string]any{"number": "9001"})
		requireRefused(t, err, wantBooksFields+"number")
	})
	t.Run("estimate", func(t *testing.T) {
		ee := newEstimateEnv(t)
		invoice := mkInvoiceRow(t, ee.app, ee.customer, nil)
		_, err := ee.newEstimate(map[string]any{"invoice": invoice.Id})
		requireRefused(t, err, wantBooksFields+"invoice")
		// An estimate's number is the sequence's, whatever the record carries.
		made := ee.mkEstimate(t, map[string]any{"number": "77", "sequence": 77})
		if made.GetString("number") == "77" || made.GetInt("sequence") == 77 {
			t.Fatalf("number/sequence = %q/%d: the caller chose them", made.GetString("number"), made.GetInt("sequence"))
		}
	})
}

func TestDocFields_ADraftUpdateCannotChangeABooksField(t *testing.T) {
	t.Run("invoice", func(t *testing.T) {
		ie := newInvoiceEnv(t)
		draft := ie.mkInvoice(t, nil)
		other := ie.mkInvoice(t, nil)
		for field, value := range map[string]any{
			"number": "9001", "sequence": 9001, "currency": "EUR", "replaces": other.Id, "replaced_by": other.Id,
			"voided_at": "2026-11-04 10:00:00.000Z",
		} {
			requireRefused(t, setFields(t, ie.app, "books_invoices", draft.Id, map[string]any{field: value}), wantBooksFields+field)
		}
		// A person's field still saves.
		if err := setFields(t, ie.app, "books_invoices", draft.Id, map[string]any{"memo": "reviewed"}); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("sales receipt", func(t *testing.T) {
		re := newReceiptEnv(t)
		draft := re.mkReceipt(t, nil)
		requireRefused(t, setFields(t, re.app, "books_sales_receipts", draft.Id, map[string]any{"currency": "EUR"}), wantBooksFields+"currency")
	})
	t.Run("estimate", func(t *testing.T) {
		ee := newEstimateEnv(t)
		estimate := ee.mkEstimate(t, nil)
		invoice := mkInvoiceRow(t, ee.app, ee.customer, nil)
		for field, value := range map[string]any{"number": "9001", "sequence": 9001, "currency": "EUR", "invoice": invoice.Id} {
			requireRefused(t, setFields(t, ee.app, "books_estimates", estimate.Id, map[string]any{field: value}), wantBooksFields+field)
		}
		if err := setFields(t, ee.app, "books_estimates", estimate.Id, map[string]any{"status": statusRejected}); err != nil {
			t.Fatal(err)
		}
	})
}

// A superuser's request skips the update rule; the request still states the
// revision, so only the Books field can be what refuses it.
func TestDocFields_ASuperuserRequestAndABatchAreRefused(t *testing.T) {
	ie := newInvoiceEnv(t)
	enableBatch(t, ie.app)
	draft := ie.mkInvoice(t, nil)
	next := reload(t, ie.app, "books_invoices", draft.Id).GetInt("revision") + 1
	op := fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_invoices/records/%s","body":{"number":"9001","memo":"renumbered","revision":%d}}`, draft.Id, next)
	apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, mkSuperuser(t, ie.app)),
		body: batchBody(op), want: http.StatusBadRequest, content: []string{wantBooksFields + "number"},
	}.run(t, ie.app)
	after := reload(t, ie.app, "books_invoices", draft.Id)
	if after.GetString("number") != "" || after.GetString("memo") != "" {
		t.Fatalf("number/memo = %q/%q: the refused batch changed the draft", after.GetString("number"), after.GetString("memo"))
	}
}

// Books' own writes still pass: a post sets the number and the entry, a void
// and a correction set their stamps, an invoice from an estimate closes it.
func TestDocFields_BooksOwnWritesStillPass(t *testing.T) {
	pe := newPostingEnv(t)
	inv := pe.everyKindInvoice(t, nil)
	posted := mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)
	if posted.GetString("number") == "" || posted.GetString("entry") == "" {
		t.Fatalf("posted = %v", posted.PublicExport())
	}
	requireNoDrift(t, pe.app)
}

func taxLinesOf(t testing.TB, app core.App, invoiceID string) []*core.Record {
	t.Helper()
	rows, err := app.FindAllRecords("books_invoice_tax_lines", dbx.HashExp{"invoice": invoiceID})
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

// The tax lines are the posting snapshot: a later write would change what a
// posted document charged.
func TestDocFields_OnlyAPostWritesTaxLines(t *testing.T) {
	pe := newPostingEnv(t)
	inv := pe.everyKindInvoice(t, nil)
	posted := mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)
	lines := taxLinesOf(t, pe.app, posted.Id)
	if len(lines) == 0 {
		t.Fatal("the fixture posted no tax line")
	}
	first := lines[0]

	first.Set("amount", first.GetInt("amount")+1)
	requireRefused(t, pe.app.Save(first), msgTaxLineByBooks)

	col, err := pe.app.FindCollectionByNameOrId("books_invoice_tax_lines")
	if err != nil {
		t.Fatal(err)
	}
	extra := core.NewRecord(col)
	for _, name := range []string{"invoice", "rate", "component", "agency", "rate_ppm", "taxable_amount", "amount"} {
		extra.Set(name, lines[0].Get(name))
	}
	extra.Set("position", len(lines))
	requireRefused(t, pe.app.Save(extra), msgTaxLineByBooks)

	requireRefused(t, pe.app.Delete(reload(t, pe.app, "books_invoice_tax_lines", first.Id)), msgTaxLineByBooks)
	if got := len(taxLinesOf(t, pe.app, posted.Id)); got != len(lines) {
		t.Fatalf("tax lines = %d, want %d", got, len(lines))
	}
}
