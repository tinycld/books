package books

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The sales receipt PDF (spec §3.8): buildSalesReceiptDocument prints Sold to
// (none with no customer), the number, Date, the payment method and reference
// no., every line kind, the subtotal, the tax line, Total and Amount received,
// and the message under Notes. It never prints Deposit to or the memo.

const (
	receiptPDFMessage = "Thank you for visiting.\nKeep this receipt for your records."
	receiptPDFMemo    = "Lobby install paid by check"
	receiptPDFNote    = "Installed in the front lobby."
)

func salesReceiptPDFKind(t testing.TB) documentKind {
	t.Helper()
	kind, ok := documentKinds["sales_receipt"]
	if !ok {
		t.Fatal(`documentKinds has no "sales_receipt" kind`)
	}
	if kind.Collection != "books_sales_receipts" || kind.Build == nil || kind.FileName == nil {
		t.Fatalf("sales_receipt kind = {Collection %q, Build set %v, FileName set %v}, want books_sales_receipts with both set",
			kind.Collection, kind.Build != nil, kind.FileName != nil)
	}
	return kind
}

// everyKindReceipt saves a draft receipt paid by Check 43567, deposited to
// 1200 Undeposited funds, with the Denver group and one line of each kind.
func (re *receiptEnv) everyKindReceipt(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	discount, err := newProduct(re.app, map[string]any{"type": "service", "name": "Discount", "income_account": re.revenue.Id})
	if err != nil {
		t.Fatalf("save the Discount product: %v", err)
	}
	all := map[string]any{
		"payment_method": "check", "reference_no": "43567", "tax_rate": re.denver.Id,
		"message": receiptPDFMessage, "memo": receiptPDFMemo,
	}
	for k, v := range fields {
		all[k] = v
	}
	r := re.mkReceipt(t, all)
	for i, line := range []map[string]any{
		item(re.service, 1, 50000, true),
		item(re.accessPoint, 2, 18900, true),
		subtotalLine(),
		percentLine(discount, -100000),
		descriptionLine(receiptPDFNote),
	} {
		mkReceiptLine(t, re.app, r, i, line)
	}
	return r
}

func buildSalesReceiptPDF(t testing.TB, app core.App, id string) pdfDocument {
	t.Helper()
	doc, err := buildSalesReceiptDocument(app, reload(t, app, "books_sales_receipts", id))
	if err != nil {
		t.Fatalf("build the sales receipt document: %v", err)
	}
	if err := doc.validate(); err != nil {
		t.Fatalf("the sales receipt document is invalid: %v", err)
	}
	return doc
}

func TestSalesReceiptPDF_PostedPrintsEveryKindAndAmountReceived(t *testing.T) {
	re := newReceiptEnv(t)
	startReceiptsAt(t, re, 1004)
	r := re.everyKindReceipt(t, nil)
	posted := mustPostReceipt(t, re.app, r.Id, re.users.bookkeeper.Id)
	total := int64(posted.GetInt("total"))

	doc := buildSalesReceiptPDF(t, re.app, r.Id)
	if doc.Title != "Sales receipt" || doc.Number != "1004" {
		t.Errorf("title %q number %q, want Sales receipt 1004", doc.Title, doc.Number)
	}
	if got, want := fmt.Sprint(doc.Dates), fmt.Sprint([]pdfDate{{Label: "Date", Day: receiptTestDay}}); got != want {
		t.Errorf("dates = %s, want %s", got, want)
	}
	if doc.Payment != "Check · 43567" {
		t.Errorf("payment = %q, want %q", doc.Payment, "Check · 43567")
	}
	if len(doc.Parties) != 1 || doc.Parties[0].Label != "Sold to" || doc.Parties[0].Name != "Harborview Dental" {
		t.Errorf("parties = %+v, want one Sold to Harborview Dental", doc.Parties)
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
		if l := doc.Lines[4]; l.Description != receiptPDFNote {
			t.Errorf("line 5 = %+v, want the description %q", l, receiptPDFNote)
		}
	}
	if doc.SubtotalCents != int64(posted.GetInt("subtotal")) {
		t.Errorf("subtotal = %d, want the receipt's %d", doc.SubtotalCents, posted.GetInt("subtotal"))
	}
	if len(doc.TaxLines) != 1 || doc.TaxLines[0].Name != "Denver combined" || doc.TaxLines[0].AmountCents != int64(posted.GetInt("tax_total")) {
		t.Errorf("tax lines = %+v, want one Denver combined of %d", doc.TaxLines, posted.GetInt("tax_total"))
	}
	if got, want := fmt.Sprint(doc.Totals), fmt.Sprint([]pdfAmount{
		{Label: "Total", Cents: total}, {Label: "Amount received", Cents: total},
	}); got != want {
		t.Errorf("totals = %s, want %s", got, want)
	}
	if doc.Notes != receiptPDFMessage {
		t.Errorf("notes = %q, want the message %q", doc.Notes, receiptPDFMessage)
	}
	if got := salesReceiptFileName(doc); got != "sales-receipt-1004" {
		t.Errorf("salesReceiptFileName = %q, want sales-receipt-1004", got)
	}
	if got := salesReceiptPDFKind(t).FileName(doc); got != "sales-receipt-1004" {
		t.Errorf("kind file name = %q, want sales-receipt-1004", got)
	}

	pdf, _ := render(t, doc, testOrg())
	_, text := extractPDFText(t, pdf)
	for _, want := range []string{
		"Sales receipt", "1004", "Sold to", "Harborview Dental", "Check", "43567",
		"Monthly bookkeeping", "Wireless access point", "Discount", receiptPDFNote,
		"Denver combined", "Total", "Amount received", "Notes", "Thank you for visiting.",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("the rendered PDF has no %q:\n%s", want, text)
		}
	}
	for _, never := range []string{"Undeposited funds", receiptPDFMemo, "Balance due"} {
		if strings.Contains(text, never) {
			t.Errorf("the rendered PDF prints %q:\n%s", never, text)
		}
	}
}

func TestSalesReceiptPDF_NoCustomerPrintsNoSoldTo(t *testing.T) {
	re := newReceiptEnv(t)
	r := re.everyKindReceipt(t, map[string]any{"customer": ""})
	doc := buildSalesReceiptPDF(t, re.app, r.Id)
	for _, p := range doc.Parties {
		if p.Label == "Sold to" {
			t.Errorf("parties = %+v, want no Sold to", doc.Parties)
		}
	}
	pdf, _ := render(t, doc, testOrg())
	if _, text := extractPDFText(t, pdf); strings.Contains(text, "Sold to") {
		t.Errorf("the rendered PDF prints Sold to with no customer:\n%s", text)
	}
}

func TestSalesReceiptPDF_EmptyMessagePrintsNoNotes(t *testing.T) {
	re := newReceiptEnv(t)
	r := re.everyKindReceipt(t, map[string]any{"message": ""})
	doc := buildSalesReceiptPDF(t, re.app, r.Id)
	if doc.Notes != "" {
		t.Errorf("notes = %q, want none", doc.Notes)
	}
	pdf, _ := render(t, doc, testOrg())
	if _, text := extractPDFText(t, pdf); strings.Contains(text, "Notes") {
		t.Errorf("the rendered PDF prints Notes with an empty message:\n%s", text)
	}
}

func TestSalesReceiptPDF_DraftHasNoNumber(t *testing.T) {
	re := newReceiptEnv(t)
	r := re.everyKindReceipt(t, nil)
	doc := buildSalesReceiptPDF(t, re.app, r.Id)
	if doc.Title != "Draft sales receipt" || doc.Number != "" {
		t.Errorf("title %q number %q, want Draft sales receipt and no number", doc.Title, doc.Number)
	}
	if got := salesReceiptFileName(doc); got != "draft-sales-receipt" {
		t.Errorf("salesReceiptFileName = %q, want draft-sales-receipt", got)
	}
}

func TestSalesReceiptPDF_VoidSaysVoidInTheTitle(t *testing.T) {
	re := newReceiptEnv(t)
	actor := re.users.bookkeeper.Id
	startReceiptsAt(t, re, 1004)
	r := re.everyKindReceipt(t, nil)
	mustPostReceipt(t, re.app, r.Id, actor)
	if err := voidReceiptAs(re.app, r.Id, actor); err != nil {
		t.Fatalf("void the sales receipt: %v", err)
	}
	doc := buildSalesReceiptPDF(t, re.app, r.Id)
	if doc.Title != "Sales receipt 1004 (void)" {
		t.Errorf("title = %q, want Sales receipt 1004 (void)", doc.Title)
	}
}
