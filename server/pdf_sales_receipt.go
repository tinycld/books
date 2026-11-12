package books

import (
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// salesReceiptDraftFileName names the download of a sales receipt that has no
// number yet.
const salesReceiptDraftFileName = "draft-sales-receipt"

// salesReceiptFileName is "sales-receipt-1004", or "draft-sales-receipt"
// while it has no number.
func salesReceiptFileName(doc pdfDocument) string {
	if doc.Number == "" {
		return salesReceiptDraftFileName
	}
	return "sales-receipt-" + doc.Number
}

// buildSalesReceiptDocument prints a sales receipt as stored (spec §3.8): Sold
// to with its address snapshot (none with no customer), the date, the payment
// method and reference no. when set, its lines in their order, its stored
// totals ending with "Amount received", and the message under Notes. Deposit
// to and the memo are internal and never print. A draft has no number and
// prints "Draft sales receipt"; a void prints "Sales receipt 1004 (void)".
func buildSalesReceiptDocument(app core.App, receipt *core.Record) (pdfDocument, error) {
	settings, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		return pdfDocument{}, fmt.Errorf("books: read settings: %w", err)
	}
	var parties []pdfParty
	if receipt.GetString("customer") != "" {
		party, err := documentPDFParty(app, receipt, "Sold to")
		if err != nil {
			return pdfDocument{}, err
		}
		parties = append(parties, party)
	}
	kind := salesReceiptKind
	lines, err := documentPDFLines(app, kind.LinesCollection, kind.ParentField, receipt.Id)
	if err != nil {
		return pdfDocument{}, err
	}
	taxLines, err := documentPDFTaxLines(app, kind.TaxLinesCollection, kind.ParentField, receipt)
	if err != nil {
		return pdfDocument{}, err
	}
	total := int64(receipt.GetInt("total"))
	currency := receipt.GetString("currency")
	if currency == "" {
		currency = settings.GetString("currency")
	}
	return pdfDocument{
		Title:         documentPDFTitle(docTypeSalesReceipt, receipt),
		Number:        receipt.GetString("number"),
		Currency:      currency,
		Dates:         []pdfDate{{Label: "Date", Day: receipt.GetString("date")}},
		Payment:       salesReceiptPaymentText(receipt),
		Company:       documentPDFCompany(settings),
		Parties:       parties,
		Lines:         lines,
		SubtotalCents: int64(receipt.GetInt("subtotal")),
		TaxLines:      taxLines,
		Totals: []pdfAmount{
			{Label: "Total", Cents: total},
			{Label: "Amount received", Cents: total},
		},
		BigAmount: pdfAmount{Label: "Amount received", Cents: total},
		Notes:     receipt.GetString("message"),
	}, nil
}

// salesReceiptPaymentText is "Check · 43567": the payment method's label and
// the reference no., each left out when empty; "" with neither.
func salesReceiptPaymentText(receipt *core.Record) string {
	parts := nonEmpty(paymentMethodLabel(receipt.GetString("payment_method")), strings.TrimSpace(receipt.GetString("reference_no")))
	return strings.Join(parts, " · ")
}
