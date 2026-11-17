package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// creditMemoDraftFileName names the download of a credit memo that has no
// number yet.
const creditMemoDraftFileName = "draft-credit-memo"

// creditMemoFileName is "credit-memo-1001", or "draft-credit-memo" while it
// has no number.
func creditMemoFileName(doc pdfDocument) string {
	if doc.Number == "" {
		return creditMemoDraftFileName
	}
	return "credit-memo-" + doc.Number
}

// buildCreditMemoDocument prints a credit memo as stored (spec §3.8): Credit
// to with the Bill to snapshot, the date, "For invoice 1004" when it names an
// invoice ("For invoice 1004 (void)" when that invoice is void), its lines in
// their order, its stored totals ending with "Credit amount", and the message
// under Notes. The memo is internal and never prints; a credit memo has no
// terms and no due date. A draft has no number and prints "Draft credit
// memo"; a void prints "Credit memo 1001 (void)".
func buildCreditMemoDocument(app core.App, memo *core.Record) (pdfDocument, error) {
	settings, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		return pdfDocument{}, fmt.Errorf("books: read settings: %w", err)
	}
	party, err := documentPDFParty(app, memo, "Credit to")
	if err != nil {
		return pdfDocument{}, err
	}
	kind := creditMemoKind
	lines, err := documentPDFLines(app, kind.LinesCollection, kind.ParentField, memo.Id)
	if err != nil {
		return pdfDocument{}, err
	}
	taxLines, err := documentPDFTaxLines(app, kind.TaxLinesCollection, kind.ParentField, memo)
	if err != nil {
		return pdfDocument{}, err
	}
	source, err := creditMemoSourceText(app, memo)
	if err != nil {
		return pdfDocument{}, err
	}
	total := int64(memo.GetInt("total"))
	currency := memo.GetString("currency")
	if currency == "" {
		currency = settings.GetString("currency")
	}
	return pdfDocument{
		Title:         documentPDFTitle(docTypeCreditMemo, memo),
		Number:        memo.GetString("number"),
		Currency:      currency,
		Dates:         []pdfDate{{Label: "Date", Day: memo.GetString("date")}},
		Source:        source,
		Company:       documentPDFCompany(settings),
		Parties:       []pdfParty{party},
		Lines:         lines,
		SubtotalCents: int64(memo.GetInt("subtotal")),
		TaxLines:      taxLines,
		Totals: []pdfAmount{
			{Label: "Total", Cents: total},
			{Label: "Credit amount", Cents: total},
		},
		BigAmount: pdfAmount{Label: "Credit amount", Cents: total},
		Notes:     memo.GetString("message"),
	}, nil
}

// creditMemoSourceText is the text of the memo's invoice link, as the read
// view shows it: "For invoice 1004", "For invoice 1004 (void)" when that
// invoice is void, "" when the memo names no invoice.
func creditMemoSourceText(app core.App, memo *core.Record) (string, error) {
	invoiceID := memo.GetString("invoice")
	if invoiceID == "" {
		return "", nil
	}
	invoice, err := app.FindRecordById("books_invoices", invoiceID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("books: read the credit memo's invoice: %w", err)
	}
	text := "For invoice " + invoice.GetString("number")
	if invoice.GetString("status") == statusVoid {
		text += " (void)"
	}
	return text, nil
}
