package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// refundReceiptDraftFileName names the download of a refund receipt that has
// no number yet.
const refundReceiptDraftFileName = "draft-refund-receipt"

// refundReceiptFileName is "refund-receipt-1001", or "draft-refund-receipt"
// while it has no number.
func refundReceiptFileName(doc pdfDocument) string {
	if doc.Number == "" {
		return refundReceiptDraftFileName
	}
	return "refund-receipt-" + doc.Number
}

// buildRefundReceiptDocument prints a refund receipt as stored (spec §3.9):
// Refund to with its address snapshot (none with no customer), the date, the
// payment method and reference no. when set, the source line ("Refund of
// sales receipt 1004" or "Refund of credit memo 1001", " (void)" after a void
// source), its lines in their order, its stored totals ending with "Amount
// refunded", and the message under Notes. Refund from and the memo are
// internal and never print. A draft has no number and prints "Draft refund
// receipt"; a void prints "Refund receipt 1001 (void)".
func buildRefundReceiptDocument(app core.App, refund *core.Record) (pdfDocument, error) {
	settings, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		return pdfDocument{}, fmt.Errorf("books: read settings: %w", err)
	}
	var parties []pdfParty
	if refund.GetString("customer") != "" {
		party, err := documentPDFParty(app, refund, "Refund to")
		if err != nil {
			return pdfDocument{}, err
		}
		parties = append(parties, party)
	}
	kind := refundReceiptKind
	lines, err := documentPDFLines(app, kind.LinesCollection, kind.ParentField, refund.Id)
	if err != nil {
		return pdfDocument{}, err
	}
	taxLines, err := documentPDFTaxLines(app, kind.TaxLinesCollection, kind.ParentField, refund)
	if err != nil {
		return pdfDocument{}, err
	}
	source, err := refundReceiptSourceText(app, refund)
	if err != nil {
		return pdfDocument{}, err
	}
	total := int64(refund.GetInt("total"))
	currency := refund.GetString("currency")
	if currency == "" {
		currency = settings.GetString("currency")
	}
	return pdfDocument{
		Title:         documentPDFTitle(docTypeRefundReceipt, refund),
		Number:        refund.GetString("number"),
		Currency:      currency,
		Dates:         []pdfDate{{Label: "Date", Day: refund.GetString("date")}},
		Payment:       salesReceiptPaymentText(refund),
		Source:        source,
		Company:       documentPDFCompany(settings),
		Parties:       parties,
		Lines:         lines,
		SubtotalCents: int64(refund.GetInt("subtotal")),
		TaxLines:      taxLines,
		Totals: []pdfAmount{
			{Label: "Total", Cents: total},
			{Label: "Amount refunded", Cents: total},
		},
		BigAmount: pdfAmount{Label: "Amount refunded", Cents: total},
		Notes:     refund.GetString("message"),
	}, nil
}

// refundReceiptSourceText is the text of the refund's source link: "Refund of
// sales receipt 1004" or "Refund of credit memo 1001", with " (void)" when the
// source is void; "" when the refund names no source or its source no longer
// exists.
func refundReceiptSourceText(app core.App, refund *core.Record) (string, error) {
	collection, noun, id := "books_sales_receipts", "sales receipt", refund.GetString("sales_receipt")
	if memoID := refund.GetString("credit_memo"); memoID != "" {
		collection, noun, id = "books_credit_memos", "credit memo", memoID
	}
	if id == "" {
		return "", nil
	}
	source, err := app.FindRecordById(collection, id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("books: read the refund receipt's %s: %w", noun, err)
	}
	text := "Refund of " + noun + " " + source.GetString("number")
	if source.GetString("status") == statusVoid {
		text += " (void)"
	}
	return text, nil
}
