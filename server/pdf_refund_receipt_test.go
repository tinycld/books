package books

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The refund receipt PDF (spec §3.9): the refund_receipt kind prints Refund to
// (the Bill to snapshot; none with no customer), the number, Date, the payment
// method and reference no., the source line ("Refund of sales receipt 1004",
// "Refund of credit memo 1001", " (void)" after a void source), every line
// kind, the subtotal, the tax line, Total and Amount refunded, and the message
// under Notes. It never prints the Refund from account or the memo.
//
// The tests reach the builder through documentKinds["refund_receipt"], so the
// package compiles before buildRefundReceiptDocument and refundReceiptFileName
// exist; the kind's Build and FileName are those two.

const (
	refundPDFMessage = "We are sorry the install did not work out.\nThe refund reaches your account in five days."
	refundPDFMemo    = "Internal: refunded at the owner's request"
	refundPDFNote    = "Removed from the front lobby."
)

func refundReceiptPDFKind(t testing.TB) documentKind {
	t.Helper()
	kind, ok := documentKinds["refund_receipt"]
	if !ok {
		t.Fatal(`documentKinds has no "refund_receipt" kind`)
	}
	if kind.Collection != refundReceiptsCollection || kind.Build == nil || kind.FileName == nil {
		t.Fatalf("refund_receipt kind = {Collection %q, Build set %v, FileName set %v}, want books_refund_receipts with both set",
			kind.Collection, kind.Build != nil, kind.FileName != nil)
	}
	return kind
}

func buildRefundReceiptPDF(t testing.TB, app core.App, id string) pdfDocument {
	t.Helper()
	doc, err := refundReceiptPDFKind(t).Build(app, reload(t, app, refundReceiptsCollection, id))
	if err != nil {
		t.Fatalf("build the refund receipt document: %v", err)
	}
	if err := doc.validate(); err != nil {
		t.Fatalf("the refund receipt document is invalid: %v", err)
	}
	return doc
}

func refundPDFText(t *testing.T, doc pdfDocument) string {
	t.Helper()
	pdf, _ := render(t, doc, testOrg())
	_, text := extractPDFText(t, pdf)
	return text
}

// receipt1004 posts a one-line sales receipt numbered 1004 for Harborview
// Dental.
func (rr *refundReceiptEnv) receipt1004(t testing.TB) *core.Record {
	t.Helper()
	startReceiptsAt(t, rr.receiptEnv, 1004)
	receipt := rr.postedReceiptFor(t, rr.customer, 200000)
	if receipt.GetString("number") != "1004" {
		t.Fatalf("the sales receipt is numbered %q, want 1004", receipt.GetString("number"))
	}
	return receipt
}

// everyKindRefund saves a draft refund paid back by Check 20417 from 1000
// Business Checking, with the Denver group, the printed fields, the memo and
// one line of each kind.
func (rr *refundReceiptEnv) everyKindRefund(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{
		"payment_method": "check", "reference_no": "20417", "tax_rate": rr.denver.Id,
		"message": refundPDFMessage, "memo": refundPDFMemo, "bill_to": creditMemoPDFBillTo,
	}
	for k, v := range fields {
		all[k] = v
	}
	r := rr.mkRefundReceipt(t, all)
	for i, line := range []map[string]any{
		item(rr.service, 1, 50000, true),
		item(rr.accessPoint, 2, 18900, true),
		subtotalLine(),
		percentLine(rr.discount, -100000),
		descriptionLine(refundPDFNote),
	} {
		mkRefundReceiptLine(t, rr.app, r, i, line)
	}
	return r
}

// requireRefundNeverPrinted holds what no refund receipt PDF prints: the Refund
// from account and the memo.
func requireRefundNeverPrinted(t *testing.T, text string) {
	t.Helper()
	for _, never := range []string{"Business Checking", refundPDFMemo, "Refund from"} {
		if strings.Contains(text, never) {
			t.Errorf("the rendered PDF prints %q:\n%s", never, text)
		}
	}
}

func TestRefundReceiptPDF_PostedFromASalesReceiptPrintsEveryKindAndAmountRefunded(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	receipt := rr.receipt1004(t)
	r := rr.everyKindRefund(t, map[string]any{"sales_receipt": receipt.Id})
	posted := mustPostRefundReceipt(t, rr.app, r.Id, rr.users.bookkeeper.Id)
	total := int64(posted.GetInt("total"))
	if posted.GetString("number") != "1001" {
		t.Fatalf("the refund is numbered %q, want 1001", posted.GetString("number"))
	}

	doc := buildRefundReceiptPDF(t, rr.app, r.Id)
	if doc.Title != "Refund receipt" || doc.Number != "1001" {
		t.Errorf("title %q number %q, want Refund receipt and 1001", doc.Title, doc.Number)
	}
	if got, want := fmt.Sprint(doc.Dates), fmt.Sprint([]pdfDate{{Label: "Date", Day: refundReceiptDay}}); got != want {
		t.Errorf("dates = %s, want %s", got, want)
	}
	if doc.Payment != "Check · 20417" {
		t.Errorf("payment = %q, want %q", doc.Payment, "Check · 20417")
	}
	if doc.Source != "Refund of sales receipt 1004" {
		t.Errorf("source = %q, want %q", doc.Source, "Refund of sales receipt 1004")
	}
	if len(doc.Parties) != 1 {
		t.Fatalf("parties = %+v, want one Refund to", doc.Parties)
	}
	party := doc.Parties[0]
	wantAddress := postalAddress{
		Line1: "1450 Larimer St", Line2: "Suite 300", City: "Denver",
		Region: "CO", PostalCode: "80202", Country: "USA",
	}
	if party.Label != "Refund to" || party.Name != "Harborview Dental" || party.Address == nil || *party.Address != wantAddress {
		t.Errorf("party = {%q %q %+v}, want Refund to, Harborview Dental, the snapshot address %+v",
			party.Label, party.Name, party.Address, wantAddress)
	}
	kinds := make([]pdfLineKind, len(doc.Lines))
	for i, l := range doc.Lines {
		kinds[i] = l.Kind
	}
	if got, want := fmt.Sprint(kinds), fmt.Sprint([]pdfLineKind{lineItem, lineItem, lineSubtotal, linePercent, lineDescription}); got != want {
		t.Errorf("line kinds = %s, want %s", got, want)
	}
	if doc.SubtotalCents != int64(posted.GetInt("subtotal")) {
		t.Errorf("subtotal = %d, want the refund's %d", doc.SubtotalCents, posted.GetInt("subtotal"))
	}
	if len(doc.TaxLines) != 1 || doc.TaxLines[0].Name != "Denver combined" || doc.TaxLines[0].AmountCents != int64(posted.GetInt("tax_total")) {
		t.Errorf("tax lines = %+v, want one Denver combined of %d", doc.TaxLines, posted.GetInt("tax_total"))
	}
	if got, want := fmt.Sprint(doc.Totals), fmt.Sprint([]pdfAmount{
		{Label: "Total", Cents: total}, {Label: "Amount refunded", Cents: total},
	}); got != want {
		t.Errorf("totals = %s, want %s", got, want)
	}
	if doc.Notes != refundPDFMessage {
		t.Errorf("notes = %q, want the message %q", doc.Notes, refundPDFMessage)
	}
	if got := refundReceiptPDFKind(t).FileName(doc); got != "refund-receipt-1001" {
		t.Errorf("file name = %q, want refund-receipt-1001 (the route adds .pdf)", got)
	}

	text := refundPDFText(t, doc)
	for _, want := range []string{
		"Refund receipt", "1001", "Refund to", "Harborview Dental", "1450 Larimer St", "Denver",
		"Date", "Nov 12, 2026", "Check", "20417", "Refund of sales receipt 1004",
		"Monthly bookkeeping", "Wireless access point", "Discount", refundPDFNote,
		"Subtotal", "Denver combined", "Total", "Amount refunded", "Notes", "We are sorry the install did not work out.",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("the rendered PDF has no %q:\n%s", want, text)
		}
	}
	if strings.Contains(text, "(void)") {
		t.Errorf("the rendered PDF says something is void:\n%s", text)
	}
	requireRefundNeverPrinted(t, text)
}

func TestRefundReceiptPDF_WalkInPrintsNoRefundTo(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.everyKindRefund(t, map[string]any{"customer": "", "bill_to": nil})
	doc := buildRefundReceiptPDF(t, rr.app, r.Id)
	if len(doc.Parties) != 0 {
		t.Errorf("parties = %+v, want none with no customer", doc.Parties)
	}
	text := refundPDFText(t, doc)
	if strings.Contains(text, "Refund to") {
		t.Errorf("the rendered PDF of a walk-in refund prints Refund to:\n%s", text)
	}
	requireRefundNeverPrinted(t, text)
}

func TestRefundReceiptPDF_EmptyMessagePrintsNoNotes(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.everyKindRefund(t, map[string]any{"message": ""})
	doc := buildRefundReceiptPDF(t, rr.app, r.Id)
	if doc.Notes != "" {
		t.Errorf("notes = %q, want none", doc.Notes)
	}
	text := refundPDFText(t, doc)
	if strings.Contains(text, "Notes") {
		t.Errorf("the rendered PDF prints Notes with an empty message:\n%s", text)
	}
	requireRefundNeverPrinted(t, text)
}

func TestRefundReceiptPDF_PayoutPrintsRefundOfCreditMemo(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	memo := rr.payoutMemo(t)
	payout := rr.postedPayout(t, memo, 5000)

	doc := buildRefundReceiptPDF(t, rr.app, payout.Id)
	if doc.Source != "Refund of credit memo 1001" {
		t.Errorf("source = %q, want %q", doc.Source, "Refund of credit memo 1001")
	}
	text := refundPDFText(t, doc)
	if !strings.Contains(text, "Refund of credit memo 1001") || strings.Contains(text, "(void)") {
		t.Errorf("the rendered PDF must print Refund of credit memo 1001 and no (void):\n%s", text)
	}
}

func TestRefundReceiptPDF_VoidSourcePrintsVoid(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	receipt := rr.receipt1004(t)
	r := rr.everyKindRefund(t, map[string]any{"sales_receipt": receipt.Id})
	mustPostRefundReceipt(t, rr.app, r.Id, rr.users.bookkeeper.Id)
	if err := voidReceiptAs(rr.app, receipt.Id, rr.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the sales receipt: %v", err)
	}

	doc := buildRefundReceiptPDF(t, rr.app, r.Id)
	if doc.Source != "Refund of sales receipt 1004 (void)" {
		t.Errorf("source = %q, want %q", doc.Source, "Refund of sales receipt 1004 (void)")
	}
	text := refundPDFText(t, doc)
	if !strings.Contains(text, "Refund of sales receipt 1004 (void)") {
		t.Errorf("the rendered PDF has no %q:\n%s", "Refund of sales receipt 1004 (void)", text)
	}
	requireRefundNeverPrinted(t, text)
}

func TestRefundReceiptPDF_DraftHasNoNumber(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.everyKindRefund(t, nil)
	doc := buildRefundReceiptPDF(t, rr.app, r.Id)
	if doc.Title != "Draft refund receipt" || doc.Number != "" {
		t.Errorf("title %q number %q, want Draft refund receipt and no number", doc.Title, doc.Number)
	}
	if got := refundReceiptPDFKind(t).FileName(doc); got != "draft-refund-receipt" {
		t.Errorf("file name = %q, want draft-refund-receipt (the route adds .pdf)", got)
	}
	text := refundPDFText(t, doc)
	if !strings.Contains(text, "Draft refund receipt") || strings.Contains(text, "No.") {
		t.Errorf("the rendered draft PDF must print Draft refund receipt and no number:\n%s", text)
	}
	requireRefundNeverPrinted(t, text)
}

func TestRefundReceiptPDF_VoidSaysVoidInTheTitle(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	actor := rr.users.bookkeeper.Id
	r := rr.everyKindRefund(t, nil)
	mustPostRefundReceipt(t, rr.app, r.Id, actor)
	if err := voidRefundReceiptAs(rr.app, r.Id, actor); err != nil {
		t.Fatalf("void the refund receipt: %v", err)
	}
	doc := buildRefundReceiptPDF(t, rr.app, r.Id)
	if doc.Title != "Refund receipt 1001 (void)" {
		t.Errorf("title = %q, want Refund receipt 1001 (void)", doc.Title)
	}
	text := refundPDFText(t, doc)
	if !strings.Contains(text, "Refund receipt 1001 (void)") {
		t.Errorf("the rendered PDF has no %q:\n%s", "Refund receipt 1001 (void)", text)
	}
	requireRefundNeverPrinted(t, text)
}
