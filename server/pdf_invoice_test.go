package books

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The invoice PDF (spec §3.7, §4.3): buildInvoiceDocument prints the fixture's
// every-kind invoice with the Denver combined group (subtotal 206970, tax
// 4207, total 211177), a Bill to snapshot that differs from the customer's own
// record, a message that prints and a memo that never does.

const (
	invoicePDFMessage = "Thank you for your business.\nPay within 30 days."
	invoicePDFMemo    = "October network work"
)

var invoicePDFBillTo = map[string]any{
	"line1": "1450 Larimer St", "line2": "Suite 300", "city": "Denver",
	"region": "CO", "postal_code": "80202", "country": "USA",
}

// pdfInvoice saves the every-kind invoice as a draft with the printed fields.
func (pe *postingEnv) pdfInvoice(t testing.TB) *core.Record {
	t.Helper()
	return pe.everyKindInvoice(t, map[string]any{
		"tax_rate": pe.denver.Id,
		"message":  invoicePDFMessage,
		"memo":     invoicePDFMemo,
		"bill_to":  invoicePDFBillTo,
	})
}

func invoiceKind(t testing.TB) documentKind {
	t.Helper()
	kind, ok := documentKinds["invoice"]
	if !ok {
		t.Fatal(`documentKinds has no "invoice" kind`)
	}
	if kind.Collection != "books_invoices" || kind.Build == nil || kind.FileName == nil {
		t.Fatalf("invoice kind = {Collection %q, Build set %v, FileName set %v}, want books_invoices with both set",
			kind.Collection, kind.Build != nil, kind.FileName != nil)
	}
	return kind
}

func buildInvoicePDF(t testing.TB, app core.App, id string) pdfDocument {
	t.Helper()
	doc, err := buildInvoiceDocument(app, reload(t, app, "books_invoices", id))
	if err != nil {
		t.Fatalf("build the invoice document: %v", err)
	}
	if err := doc.validate(); err != nil {
		t.Fatalf("the invoice document is invalid: %v", err)
	}
	return doc
}

func TestInvoicePDF_PostedPrintsEveryKindAndTheTotals(t *testing.T) {
	pe := newPostingEnv(t)
	inv := pe.pdfInvoice(t)
	mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)

	doc := buildInvoicePDF(t, pe.app, inv.Id)
	if doc.Title != "Invoice" || doc.Number != "1001" {
		t.Errorf("title %q number %q, want Invoice 1001", doc.Title, doc.Number)
	}
	if got, want := fmt.Sprint(doc.Dates), fmt.Sprint([]pdfDate{
		{Label: "Date", Day: "2026-11-04"}, {Label: "Due", Day: "2026-12-04"},
	}); got != want {
		t.Errorf("dates = %s, want %s", got, want)
	}

	if len(doc.Parties) != 1 {
		t.Fatalf("parties = %+v, want one Bill to", doc.Parties)
	}
	bill := doc.Parties[0]
	wantAddress := postalAddress{
		Line1: "1450 Larimer St", Line2: "Suite 300", City: "Denver",
		Region: "CO", PostalCode: "80202", Country: "USA",
	}
	if bill.Label != "Bill to" || bill.Name != "Harborview Dental" || bill.Address == nil || *bill.Address != wantAddress {
		t.Errorf("bill to = {%q %q %+v}, want Bill to, Harborview Dental, the snapshot address %+v",
			bill.Label, bill.Name, bill.Address, wantAddress)
	}

	if len(doc.Lines) != 7 {
		t.Fatalf("%d lines, want the 7 of the every-kind invoice: %+v", len(doc.Lines), doc.Lines)
	}
	items := map[int]pdfLine{
		0: {Kind: lineItem, Item: "Monthly bookkeeping", Quantity: "3", RateCents: 45000, AmountCents: 135000},
		1: {Kind: lineItem, Item: "Wireless access point", Quantity: "2", RateCents: 18900, AmountCents: 37800},
		2: {Kind: lineItem, Item: "Patch cable", Quantity: "12", RateCents: 875, AmountCents: 10500},
		6: {Kind: lineItem, Item: "Monthly bookkeeping", Quantity: "1.5", RateCents: 28000, AmountCents: 42000},
	}
	for i, want := range items {
		if got := doc.Lines[i]; got != want {
			t.Errorf("line %d = %+v, want %+v", i+1, got, want)
		}
	}
	if sub := doc.Lines[3]; sub.Kind != lineSubtotal || sub.AmountCents != 183300 {
		t.Errorf("line 4 = %+v, want a subtotal of 183300", sub)
	}
	// A percent line prints its percent in the Qty column, with a minus sign.
	if pct := doc.Lines[4]; pct.Item != "Discount" || pct.Quantity != "\u221210%" || pct.AmountCents != -18330 {
		t.Errorf("line 5 = %+v, want Discount, Qty %q, amount -18330", pct, "\u221210%")
	}
	desc := doc.Lines[5]
	if desc.Kind != lineDescription || desc.Description != "Work done at the annex office, October 6 to 17." ||
		desc.Item != "" || desc.Quantity != "" || desc.RateCents != 0 || desc.AmountCents != 0 {
		t.Errorf("line 6 = %+v, want a description line with no amounts", desc)
	}

	if doc.SubtotalCents != 206970 {
		t.Errorf("subtotal = %d, want 206970", doc.SubtotalCents)
	}
	if got, want := fmt.Sprint(doc.TaxLines), fmt.Sprint([]pdfTaxLine{
		{Name: "Denver combined", RatePpm: 87100, AmountCents: 4207},
	}); got != want {
		t.Errorf("tax lines = %s, want %s", got, want)
	}
	if got, want := fmt.Sprint(doc.Totals), fmt.Sprint([]pdfAmount{
		{Label: "Total", Cents: 211177}, {Label: "Balance due", Cents: 211177},
	}); got != want {
		t.Errorf("totals = %s, want %s", got, want)
	}
	if doc.Notes != invoicePDFMessage {
		t.Errorf("notes = %q, want the message %q", doc.Notes, invoicePDFMessage)
	}
	if strings.Contains(fmt.Sprintf("%+v", doc), invoicePDFMemo) {
		t.Errorf("the memo %q is in the document: %+v", invoicePDFMemo, doc)
	}
	if got := invoiceKind(t).FileName(doc); got != "invoice-1001" {
		t.Errorf("file name = %q, want invoice-1001", got)
	}

	pdf, _ := render(t, doc, testOrg())
	_, text := extractPDFText(t, pdf)
	for _, want := range []string{"Balance due", "Harborview Dental", "Denver combined (8.71%)"} {
		if !strings.Contains(text, want) {
			t.Errorf("the rendered PDF has no %q:\n%s", want, text)
		}
	}
	if strings.Contains(text, invoicePDFMemo) {
		t.Errorf("the rendered PDF prints the memo %q", invoicePDFMemo)
	}
}

func TestInvoicePDF_DraftHasNoNumber(t *testing.T) {
	pe := newPostingEnv(t)
	inv := pe.pdfInvoice(t)

	doc := buildInvoicePDF(t, pe.app, inv.Id)
	if doc.Title != "Draft invoice" || doc.Number != "" {
		t.Errorf("title %q number %q, want Draft invoice and no number", doc.Title, doc.Number)
	}
	if got := invoiceKind(t).FileName(doc); got != "draft-invoice" {
		t.Errorf("file name = %q, want draft-invoice", got)
	}
}

func TestInvoicePDF_VoidSaysVoidInTheTitle(t *testing.T) {
	pe := newPostingEnv(t)
	actor := pe.users.bookkeeper.Id
	inv := pe.pdfInvoice(t)
	mustPostInvoice(t, pe.app, inv.Id, actor)
	if err := voidInvoiceAs(pe.app, inv.Id, actor); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}

	doc := buildInvoicePDF(t, pe.app, inv.Id)
	if doc.Title != "Invoice 1001 (void)" {
		t.Errorf("title = %q, want Invoice 1001 (void)", doc.Title)
	}
}
