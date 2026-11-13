package books

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// invoiceDraftFileName names the download of an invoice that has no number yet.
const invoiceDraftFileName = "draft-invoice"

// invoiceFileName is "invoice-1004", or "draft-invoice" while it has no number.
func invoiceFileName(doc pdfDocument) string {
	if doc.Number == "" {
		return invoiceDraftFileName
	}
	return docTypeInvoice + "-" + doc.Number
}

// buildInvoiceDocument prints an invoice as stored: its Bill to snapshot, its
// lines in their order with the amounts Books wrote, its stored totals and the
// message. The memo is internal and never prints. A draft has no number and
// prints "Draft invoice"; a void prints "Invoice 1004 (void)".
func buildInvoiceDocument(app core.App, invoice *core.Record) (pdfDocument, error) {
	settings, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		return pdfDocument{}, fmt.Errorf("books: read settings: %w", err)
	}
	party, err := documentPDFParty(app, invoice, "Bill to")
	if err != nil {
		return pdfDocument{}, err
	}
	lines, err := documentPDFLines(app, invoiceKind.LinesCollection, invoiceKind.ParentField, invoice.Id)
	if err != nil {
		return pdfDocument{}, err
	}
	taxLines, err := documentPDFTaxLines(app, invoiceKind.TaxLinesCollection, invoiceKind.ParentField, invoice)
	if err != nil {
		return pdfDocument{}, err
	}
	total := int64(invoice.GetInt("total"))
	currency := invoice.GetString("currency")
	if currency == "" {
		currency = settings.GetString("currency")
	}
	return pdfDocument{
		Title:    documentPDFTitle(docTypeInvoice, invoice),
		Number:   invoice.GetString("number"),
		Currency: currency,
		Dates: []pdfDate{
			{Label: "Date", Day: invoice.GetString("date")},
			{Label: "Due", Day: invoice.GetString("due_date")},
		},
		Company:       documentPDFCompany(settings),
		Parties:       []pdfParty{party},
		Lines:         lines,
		SubtotalCents: int64(invoice.GetInt("subtotal")),
		TaxLines:      taxLines,
		Totals: []pdfAmount{
			{Label: "Total", Cents: total},
			{Label: "Balance due", Cents: total},
		},
		BigAmount: pdfAmount{Label: "Balance due", Cents: total},
		Notes:     invoice.GetString("message"),
	}, nil
}

// documentPDFTitle is a sales document's printed title: "Invoice" (the number
// prints beside it), "Draft invoice" with no number, "Invoice 1004 (void)".
func documentPDFTitle(docType string, doc *core.Record) string {
	noun, _, draft := entryNouns(docType)
	number := doc.GetString("number")
	switch {
	case number == "":
		return draft
	case doc.GetString("status") == statusVoid:
		return fmt.Sprintf("%s %s (void)", noun, number)
	default:
		return noun
	}
}

// documentPDFCompany is the seller block every sales document prints.
func documentPDFCompany(settings *core.Record) pdfCompany {
	return pdfCompany{
		Name:    settings.GetString("business_name"),
		Address: settings.GetString("address"),
		Phone:   settings.GetString("phone"),
		Email:   settings.GetString("email"),
		Website: settings.GetString("website"),
	}
}

// documentPDFParty is the customer's name and company over the document's own
// bill_to address snapshot, which later customer edits do not change, under
// label ("Bill to", "Sold to"). The caller checks that the document has a
// customer.
func documentPDFParty(app core.App, doc *core.Record, label string) (pdfParty, error) {
	customer, err := app.FindRecordById("books_customers", doc.GetString("customer"))
	if err != nil {
		return pdfParty{}, fmt.Errorf("books: read the document's customer: %w", err)
	}
	party := pdfParty{
		Label:   label,
		Name:    customer.GetString("display_name"),
		Company: customer.GetString("company"),
	}
	raw := strings.TrimSpace(doc.GetString("bill_to"))
	if raw == "" || raw == "null" {
		return party, nil
	}
	var address postalAddress
	if err := json.Unmarshal([]byte(raw), &address); err != nil {
		return pdfParty{}, fmt.Errorf("books: read the document's bill to: %w", err)
	}
	if address != (postalAddress{}) {
		party.Address = &address
	}
	return party, nil
}

// documentPDFLines prints each stored line of a sales document by its kind,
// read from linesCollection by its parentField. An item or percent line prints
// its product's name; a percent line prints its percent in the Qty column
// ("−10%") and no rate.
func documentPDFLines(app core.App, linesCollection, parentField, docID string) ([]pdfLine, error) {
	records, err := docLineRecords(app, linesCollection, parentField, docID)
	if err != nil {
		return nil, err
	}
	names, err := productNames(app, records)
	if err != nil {
		return nil, err
	}
	out := make([]pdfLine, len(records))
	for i, r := range records {
		amount := int64(r.GetInt("amount"))
		description := r.GetString("description")
		product := names[r.GetString("product")]
		switch r.GetString("kind") {
		case lineKindSubtotal:
			out[i] = pdfLine{Kind: lineSubtotal, AmountCents: amount}
		case lineKindDescription:
			out[i] = pdfLine{Kind: lineDescription, Description: description}
		case lineKindPercent:
			out[i] = pdfLine{
				Kind: linePercent, Item: product, Description: description,
				Quantity: percentQuantityText(int64(r.GetInt("percent_ppm"))), AmountCents: amount,
			}
		default:
			out[i] = pdfLine{
				Kind: lineItem, Item: product, Description: description,
				Quantity:  strconv.FormatFloat(r.GetFloat("quantity"), 'f', -1, 64),
				RateCents: int64(r.GetInt("rate")), AmountCents: amount,
			}
		}
	}
	return out, nil
}

// percentQuantityText prints a percent line's percent with a true minus sign,
// as the form shows it: -100000 ppm → "−10%".
func percentQuantityText(ppm int64) string {
	text := ratePercentText(ppm)
	if rest, negative := strings.CutPrefix(text, "-"); negative {
		return "−" + rest
	}
	return text
}

func productNames(app core.App, lines []*core.Record) (map[string]string, error) {
	var ids []string
	for _, l := range lines {
		if id := l.GetString("product"); id != "" {
			ids = append(ids, id)
		}
	}
	names := map[string]string{}
	if len(ids) == 0 {
		return names, nil
	}
	products, err := app.FindRecordsByIds("books_products", ids)
	if err != nil {
		return nil, fmt.Errorf("books: read the document's products: %w", err)
	}
	for _, p := range products {
		names[p.Id] = p.GetString("name")
	}
	return names, nil
}

// documentPDFTaxLines is the one tax line of the header rate or group: its
// name, its percent (a group's is the sum of its components) and the stored
// tax. A posted or void document prints the percents of its tax snapshot (the
// rows of taxLinesCollection that name it in parentField), so a later change
// to a rate never changes what it charged; a draft prints today's rates, and
// so does a kind with no snapshot (taxLinesCollection "": an estimate never
// posts, and the server keeps its tax_total live).
func documentPDFTaxLines(app core.App, taxLinesCollection, parentField string, doc *core.Record) ([]pdfTaxLine, error) {
	rateID := doc.GetString("tax_rate")
	if rateID == "" {
		return nil, nil
	}
	rate, err := app.FindRecordById("books_tax_rates", rateID)
	if err != nil {
		return nil, fmt.Errorf("books: read the document's tax rate: %w", err)
	}
	var ppms []int64
	if taxLinesCollection == "" || doc.GetString("status") == statusDraft {
		ppms, _, err = taxComponents(app, rateID)
		if err != nil {
			return nil, err
		}
	} else {
		snapshot, err := app.FindRecordsByFilter(taxLinesCollection, parentField+" = {:id}", "position,id", 0, 0,
			dbx.Params{"id": doc.Id})
		if err != nil {
			return nil, fmt.Errorf("books: read the document's tax lines: %w", err)
		}
		for _, s := range snapshot {
			ppms = append(ppms, int64(s.GetInt("rate_ppm")))
		}
	}
	var ppm int64
	for _, p := range ppms {
		ppm += p
	}
	return []pdfTaxLine{{
		Name:        rate.GetString("name"),
		RatePpm:     ppm,
		AmountCents: int64(doc.GetInt("tax_total")),
	}}, nil
}
