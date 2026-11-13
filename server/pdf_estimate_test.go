package books

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The estimate PDF (spec §3.9): buildEstimateDocument prints the title
// "Estimate" with its number, the estimate date, the expiration date when set,
// Bill to, every line kind, the subtotal, the tax line, Total and the message
// under Notes. It never prints the status, the acceptance or the memo.

const (
	estimatePDFMessage    = "Prices hold until the expiration date.\nThank you for the chance to quote."
	estimatePDFMemo       = "Quoted after the annex walk-through"
	estimatePDFNote       = "Work at the annex office over two weeks."
	estimatePDFAcceptedBy = "Dr. Lena Ortiz"
	estimatePDFExpiration = "2026-12-04"
)

func estimatePDFKind(t testing.TB) documentKind {
	t.Helper()
	kind, ok := documentKinds["estimate"]
	if !ok {
		t.Fatal(`documentKinds has no "estimate" kind`)
	}
	if kind.Collection != "books_estimates" || kind.Build == nil || kind.FileName == nil {
		t.Fatalf("estimate kind = {Collection %q, Build set %v, FileName set %v}, want books_estimates with both set",
			kind.Collection, kind.Build != nil, kind.FileName != nil)
	}
	return kind
}

// everyKindEstimate saves an Accepted estimate (Accepted by Dr. Lena Ortiz)
// with the Denver group, a Bill to snapshot, a message, a memo, an expiration
// date and one line of each kind, over which fields may write.
func (ee *estimateEnv) everyKindEstimate(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	discount, err := newProduct(ee.app, map[string]any{"type": "service", "name": "Discount", "income_account": ee.revenue.Id})
	if err != nil {
		t.Fatalf("save the Discount product: %v", err)
	}
	all := map[string]any{
		"status": "accepted", "accepted_by": estimatePDFAcceptedBy, "accepted_date": "2026-11-05",
		"expiration_date": estimatePDFExpiration, "tax_rate": ee.denver.Id, "bill_to": invoicePDFBillTo,
		"message": estimatePDFMessage, "memo": estimatePDFMemo,
	}
	for k, v := range fields {
		all[k] = v
	}
	r := ee.mkEstimate(t, all)
	for i, line := range []map[string]any{
		item(ee.service, 1, 50000, true),
		item(ee.accessPoint, 2, 18900, true),
		subtotalLine(),
		percentLine(discount, -100000),
		descriptionLine(estimatePDFNote),
	} {
		mkEstimateLine(t, ee.app, r, i, line)
	}
	return reload(t, ee.app, "books_estimates", r.Id)
}

func buildEstimatePDF(t testing.TB, app core.App, id string) pdfDocument {
	t.Helper()
	doc, err := buildEstimateDocument(app, reload(t, app, "books_estimates", id))
	if err != nil {
		t.Fatalf("build the estimate document: %v", err)
	}
	if err := doc.validate(); err != nil {
		t.Fatalf("the estimate document is invalid: %v", err)
	}
	return doc
}

func TestEstimatePDF_PrintsTheQuoteAndNoStatus(t *testing.T) {
	ee := newEstimateEnv(t)
	r := ee.everyKindEstimate(t, nil)
	total := int64(r.GetInt("total"))

	doc := buildEstimatePDF(t, ee.app, r.Id)
	if doc.Title != "Estimate" || doc.Number != "1001" {
		t.Errorf("title %q number %q, want Estimate 1001", doc.Title, doc.Number)
	}
	dated := false
	for _, d := range doc.Dates {
		dated = dated || d.Day == estimateTestDay
	}
	if !dated {
		t.Errorf("dates = %+v, want the estimate date %s", doc.Dates, estimateTestDay)
	}
	if doc.Expiration != estimatePDFExpiration {
		t.Errorf("expiration = %q, want %s", doc.Expiration, estimatePDFExpiration)
	}

	wantAddress := postalAddress{
		Line1: "1450 Larimer St", Line2: "Suite 300", City: "Denver",
		Region: "CO", PostalCode: "80202", Country: "USA",
	}
	if len(doc.Parties) != 1 {
		t.Fatalf("parties = %+v, want one Bill to", doc.Parties)
	}
	if bill := doc.Parties[0]; bill.Label != "Bill to" || bill.Name != "Harborview Dental" || bill.Address == nil || *bill.Address != wantAddress {
		t.Errorf("bill to = {%q %q %+v}, want Bill to, Harborview Dental, the snapshot address %+v",
			bill.Label, bill.Name, bill.Address, wantAddress)
	}

	kinds := make([]pdfLineKind, len(doc.Lines))
	for i, l := range doc.Lines {
		kinds[i] = l.Kind
	}
	if got, want := fmt.Sprint(kinds), fmt.Sprint([]pdfLineKind{lineItem, lineItem, lineSubtotal, linePercent, lineDescription}); got != want {
		t.Errorf("line kinds = %s, want %s", got, want)
	}
	if len(doc.Lines) == 5 {
		if l := doc.Lines[0]; l.Item != "Monthly bookkeeping" || l.AmountCents != 50000 {
			t.Errorf("line 1 = %+v, want Monthly bookkeeping 50000", l)
		}
		if l := doc.Lines[3]; l.Item != "Discount" || l.Quantity != "\u221210%" {
			t.Errorf("line 4 = %+v, want Discount, Qty %q", l, "\u221210%")
		}
		if l := doc.Lines[4]; l.Description != estimatePDFNote {
			t.Errorf("line 5 = %+v, want the description %q", l, estimatePDFNote)
		}
	}
	if doc.SubtotalCents != int64(r.GetInt("subtotal")) {
		t.Errorf("subtotal = %d, want the estimate's %d", doc.SubtotalCents, r.GetInt("subtotal"))
	}
	if len(doc.TaxLines) != 1 || doc.TaxLines[0].Name != "Denver combined" || doc.TaxLines[0].AmountCents != int64(r.GetInt("tax_total")) {
		t.Errorf("tax lines = %+v, want one Denver combined of %d", doc.TaxLines, r.GetInt("tax_total"))
	}
	// An estimate has no last row: no Balance due, no Amount received.
	if got, want := fmt.Sprint(doc.Totals), fmt.Sprint([]pdfAmount{{Label: "Total", Cents: total}}); got != want {
		t.Errorf("totals = %s, want %s", got, want)
	}
	if doc.Notes != estimatePDFMessage {
		t.Errorf("notes = %q, want the message %q", doc.Notes, estimatePDFMessage)
	}
	for _, never := range []string{estimatePDFMemo, estimatePDFAcceptedBy} {
		if strings.Contains(fmt.Sprintf("%+v", doc), never) {
			t.Errorf("%q is in the document: %+v", never, doc)
		}
	}
	if got := estimateFileName(doc); got != "estimate-1001" {
		t.Errorf("estimateFileName = %q, want estimate-1001", got)
	}
	if got := estimatePDFKind(t).FileName(doc); got != "estimate-1001" {
		t.Errorf("kind file name = %q, want estimate-1001", got)
	}

	pdf, _ := render(t, doc, testOrg())
	_, text := extractPDFText(t, pdf)
	for _, want := range []string{
		"Estimate", "1001", formatDay(estimateTestDay), "Expiration date", formatDay(estimatePDFExpiration),
		"Bill to", "Harborview Dental", "1450 Larimer St",
		"Monthly bookkeeping", "Wireless access point", "Discount", estimatePDFNote,
		"Subtotal", "Denver combined", "Total", "Notes", "Prices hold until the expiration date.",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("the rendered PDF has no %q:\n%s", want, text)
		}
	}
	for _, never := range []string{
		"Pending", "Accepted", "Accepted by", estimatePDFAcceptedBy, estimatePDFMemo, "Balance due", "Amount received",
	} {
		if strings.Contains(text, never) {
			t.Errorf("the rendered PDF prints %q:\n%s", never, text)
		}
	}
}

// With no expiration date the PDF prints no Expiration date; with no message it
// prints no Notes; a Pending estimate prints no status word either.
func TestEstimatePDF_NoExpirationAndNoMessagePrintNeither(t *testing.T) {
	ee := newEstimateEnv(t)
	r := ee.everyKindEstimate(t, map[string]any{
		"status": "pending", "accepted_by": "", "accepted_date": "", "expiration_date": "", "message": "",
	})
	doc := buildEstimatePDF(t, ee.app, r.Id)
	if doc.Expiration != "" {
		t.Errorf("expiration = %q, want none", doc.Expiration)
	}
	if doc.Notes != "" {
		t.Errorf("notes = %q, want none", doc.Notes)
	}
	pdf, _ := render(t, doc, testOrg())
	_, text := extractPDFText(t, pdf)
	for _, never := range []string{"Expiration", "Notes", "Pending"} {
		if strings.Contains(text, never) {
			t.Errorf("the rendered PDF prints %q:\n%s", never, text)
		}
	}
}
