package books

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// sampleTaxPpm is the sample's one tax line, 6.25%.
const sampleTaxPpm = 62500

// buildSampleDocument is the "Preview PDF" invoice in Settings: fixed lines and
// customer, printed with the real company details (books_settings) and, through
// the renderer, the real organization branding.
func buildSampleDocument(app core.App, _ *core.Record) (pdfDocument, error) {
	s, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		return pdfDocument{}, fmt.Errorf("books: read settings: %w", err)
	}
	lines := []pdfLine{
		{Kind: lineItem, Item: "Bookkeeping", Description: "Monthly bookkeeping, October", Quantity: "1", RateCents: 45000, AmountCents: 45000},
		{Kind: lineItem, Item: "Consulting", Description: "Year-end planning session", Quantity: "3", RateCents: 12500, AmountCents: 37500},
		{Kind: lineDescription, Description: "Hours billed at the standard rate."},
		{Kind: lineSubtotal, AmountCents: 82500},
		{Kind: lineItem, Item: "Filing fee", Description: "State annual report filing", Quantity: "1", RateCents: 5000, AmountCents: 5000},
	}
	var subtotal int64
	for _, l := range lines {
		if l.Kind == lineItem {
			subtotal += l.AmountCents
		}
	}
	tax := taxOn(subtotal, sampleTaxPpm)
	total := subtotal + tax
	return pdfDocument{
		Title:    "Invoice",
		Number:   "SAMPLE",
		Currency: s.GetString("currency"),
		Dates:    []pdfDate{{Label: "Date", Day: "2026-11-05"}, {Label: "Due", Day: "2026-12-05"}},
		Company: pdfCompany{
			Name:    s.GetString("business_name"),
			Address: s.GetString("address"),
			Phone:   s.GetString("phone"),
			Email:   s.GetString("email"),
			Website: s.GetString("website"),
		},
		Parties: []pdfParty{{
			Label: "Bill to", Name: "Jordan Lee", Company: "Northwind Traders",
			Address: &postalAddress{Line1: "500 Market St", Line2: "Suite 210", City: "San Francisco", Region: "CA", PostalCode: "94105", Country: "USA"},
		}},
		Lines:         lines,
		SubtotalCents: subtotal,
		TaxLines:      []pdfTaxLine{{Name: "State sales tax", RatePpm: sampleTaxPpm, AmountCents: tax}},
		Totals:        []pdfAmount{{Label: "Total", Cents: total}},
		BigAmount:     pdfAmount{Label: "Balance due", Cents: total},
		Notes:         "This is a sample invoice.\nIt shows how your documents print with your company details, logo and brand color.",
	}, nil
}
