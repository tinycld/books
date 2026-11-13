package books

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// estimateFileName is "estimate-1001". An estimate is numbered when it is
// created, so it has no draft name.
func estimateFileName(doc pdfDocument) string {
	return docTypeEstimate + "-" + doc.Number
}

// buildEstimateDocument prints an estimate as stored (spec §3.9): the title
// "Estimate" with its number, the estimate date, the expiration date when
// set, Bill to with its address snapshot, its lines in their order, the
// subtotal, the tax line at today's rates (an estimate has no tax snapshot),
// Total, and the message under Notes. The status, the acceptance and the
// memo never print, and there is no Balance due: an estimate asks for no
// payment.
func buildEstimateDocument(app core.App, estimate *core.Record) (pdfDocument, error) {
	settings, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		return pdfDocument{}, fmt.Errorf("books: read settings: %w", err)
	}
	party, err := documentPDFParty(app, estimate, "Bill to")
	if err != nil {
		return pdfDocument{}, err
	}
	kind := estimateKind
	lines, err := documentPDFLines(app, kind.LinesCollection, kind.ParentField, estimate.Id)
	if err != nil {
		return pdfDocument{}, err
	}
	taxLines, err := documentPDFTaxLines(app, kind.TaxLinesCollection, kind.ParentField, estimate)
	if err != nil {
		return pdfDocument{}, err
	}
	total := int64(estimate.GetInt("total"))
	currency := estimate.GetString("currency")
	if currency == "" {
		currency = settings.GetString("currency")
	}
	return pdfDocument{
		Title:         documentPDFTitle(docTypeEstimate, estimate),
		Number:        estimate.GetString("number"),
		Currency:      currency,
		Dates:         []pdfDate{{Label: "Date", Day: estimate.GetString("date")}},
		Expiration:    estimate.GetString("expiration_date"),
		Company:       documentPDFCompany(settings),
		Parties:       []pdfParty{party},
		Lines:         lines,
		SubtotalCents: int64(estimate.GetInt("subtotal")),
		TaxLines:      taxLines,
		Totals:        []pdfAmount{{Label: "Total", Cents: total}},
		BigAmount:     pdfAmount{Label: "Total", Cents: total},
		Notes:         estimate.GetString("message"),
	}, nil
}
