package books

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// purchaseOrderFileName is "purchase-order-1004": an order takes its number
// at its first save, so it always has one.
func purchaseOrderFileName(doc pdfDocument) string {
	return "purchase-order-" + doc.Number
}

// buildPurchaseOrderDocument prints a purchase order as stored (purchase
// order spec §3.6 "PDF"): the title "Purchase order" with its number, the
// order date, the business block, the Vendor block (the vendor's name over
// the order's mailing address snapshot), the Ship to block (only when Ship to
// holds text; Ship to is optional), the lines of both
// tables in form order with the "Vendor part no." column, Total and the
// message under Notes. The memo is internal, and the received quantities and
// the status are the book's, so none of them prints.
func buildPurchaseOrderDocument(app core.App, order *core.Record) (pdfDocument, error) {
	settings, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		return pdfDocument{}, fmt.Errorf("books: read settings: %w", err)
	}
	vendor, err := app.FindRecordById("books_vendors", order.GetString("vendor"))
	if err != nil {
		return pdfDocument{}, fmt.Errorf("books: read the purchase order's vendor: %w", err)
	}
	party, err := customerPDFParty(vendor, "Vendor", order.GetString("mailing_address"), "the purchase order's mailing address")
	if err != nil {
		return pdfDocument{}, err
	}
	lines, err := purchaseOrderPDFLines(app, order.Id)
	if err != nil {
		return pdfDocument{}, err
	}
	currency, err := orderCurrency(app, order.Id)
	if err != nil {
		return pdfDocument{}, err
	}
	total := int64(order.GetInt("total"))
	parties := []pdfParty{party}
	if shipTo := order.GetString("ship_to"); strings.TrimSpace(shipTo) != "" {
		parties = append(parties, pdfParty{Label: "Ship to", Text: shipTo})
	}
	return pdfDocument{
		Title:         documentPDFTitle(docTypePurchaseOrder, order),
		Number:        order.GetString("number"),
		Currency:      currency,
		Dates:         []pdfDate{{Label: "Date", Day: order.GetString("date")}},
		Company:       documentPDFCompany(settings),
		Parties:       parties,
		Lines:         lines,
		SubtotalCents: int64(order.GetInt("subtotal")),
		Totals:        []pdfAmount{{Label: "Total", Cents: total}},
		BigAmount:     pdfAmount{Label: "Total", Cents: total},
		Notes:         order.GetString("message"),
		PartNoColumn:  true,
		NoSubtotal:    true,
	}, nil
}

// purchaseOrderPDFLines prints the order's lines in form order: a product
// line its product's name and Vendor part no., its description, quantity,
// rate and amount; an account line its description, or its account's name
// (without the number) when it has none, and its amount.
func purchaseOrderPDFLines(app core.App, orderID string) ([]pdfLine, error) {
	records, err := docLineRecords(app, purchaseOrderLinesCollection, purchaseOrderKind.ParentField, orderID)
	if err != nil {
		return nil, err
	}
	products, err := lineProducts(app, records)
	if err != nil {
		return nil, err
	}
	accounts, err := recordsByID(app, "books_accounts", lineAccountIDs(records))
	if err != nil {
		return nil, err
	}
	out := make([]pdfLine, len(records))
	for i, r := range records {
		amount := int64(r.GetInt("amount"))
		description := r.GetString("description")
		if r.GetString("kind") == lineKindAccount {
			if account, ok := accounts[r.GetString("account")]; ok && description == "" {
				description = account.GetString("name")
			}
			out[i] = pdfLine{Kind: lineAccount, Description: description, AmountCents: amount}
			continue
		}
		var name, partNo string
		if product, ok := products[r.GetString("product")]; ok {
			name, partNo = product.GetString("name"), product.GetString("vendor_part_no")
		}
		out[i] = pdfLine{
			Kind: lineItem, Item: name, PartNo: partNo, Description: description,
			Quantity:  strconv.FormatFloat(r.GetFloat("quantity"), 'f', -1, 64),
			RateCents: int64(r.GetInt("rate")), AmountCents: amount,
		}
	}
	return out, nil
}
