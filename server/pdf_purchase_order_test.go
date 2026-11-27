package books

import (
	"fmt"
	"regexp"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The purchase order PDF (spec §3.6 "PDF"): buildPurchaseOrderDocument prints
// the title "Purchase order" with its number, the order date, the business
// block, the Vendor block (name and mailing address), the Ship to block, the
// lines of both tables in form order with a "Vendor part no." column after
// the product or account, Total and the message. It never prints the memo,
// the received quantities or the status. The other kinds keep five columns.

const (
	poPDFBusiness = "Hartwell Supply Co."
	poPDFMessage  = "Deliver to the rear dock.\nCall before delivery."
	poPDFMemo     = "Back-office network refresh, phase 1"
	poPDFShipTo   = "Hartwell Supply Co., Receiving\nDock 4, rear entrance\n3540 E Broad St"
	poPDFPartNo   = "AP-6E-410"
	poPDFAccount  = "Rear dock shelving install"
)

// The line table headings of the template, in print order.
var (
	fiveLineHeadings = []string{"Item", "Description", "Qty", "Price", "Amount"}
	sixLineHeadings  = []string{"Item", "Vendor part no.", "Description", "Qty", "Price", "Amount"}
)

var (
	htmlLinesTable = regexp.MustCompile(`(?s)<table class="lines[^"]*">(.*?)</table>`)
	htmlHeading    = regexp.MustCompile(`(?s)<th[^>]*>(.*?)</th>`)
	htmlBody       = regexp.MustCompile(`(?s)<tbody>(.*?)</tbody>`)
	htmlRow        = regexp.MustCompile(`(?s)<tr[^>]*>(.*?)</tr>`)
	htmlCell       = regexp.MustCompile(`(?s)<td[^>]*>(.*?)</td>`)
	htmlTag        = regexp.MustCompile(`<[^>]+>`)
)

// printedLineTable is the line table of doc as the template prints it: its
// headings and, for each row, the text of each cell (tags taken out, a
// description's lines joined by a space).
func printedLineTable(t testing.TB, doc pdfDocument) (headings []string, rows [][]string) {
	t.Helper()
	html, err := renderPDFHTML(pdfViewOf(doc, testOrg()))
	if err != nil {
		t.Fatalf("render the document's HTML: %v", err)
	}
	table := htmlLinesTable.FindStringSubmatch(string(html))
	if table == nil {
		t.Fatalf("the document's HTML has no line table:\n%s", html)
	}
	for _, m := range htmlHeading.FindAllStringSubmatch(table[1], -1) {
		headings = append(headings, strings.TrimSpace(htmlTag.ReplaceAllString(m[1], "")))
	}
	body := htmlBody.FindStringSubmatch(table[1])
	if body == nil {
		t.Fatalf("the line table has no body:\n%s", table[1])
	}
	for _, r := range htmlRow.FindAllStringSubmatch(body[1], -1) {
		var cells []string
		for _, c := range htmlCell.FindAllStringSubmatch(r[1], -1) {
			cells = append(cells, strings.Join(strings.Fields(htmlTag.ReplaceAllString(c[1], " ")), " "))
		}
		rows = append(rows, cells)
	}
	return headings, rows
}

func purchaseOrderPDFKind(t testing.TB) documentKind {
	t.Helper()
	kind, ok := documentKinds["purchase_order"]
	if !ok {
		t.Fatal(`documentKinds has no "purchase_order" kind`)
	}
	if kind.Collection != "books_purchase_orders" || kind.Build == nil || kind.FileName == nil {
		t.Fatalf("purchase order kind = {Collection %q, Build set %v, FileName set %v}, want books_purchase_orders with both set",
			kind.Collection, kind.Build != nil, kind.FileName != nil)
	}
	return kind
}

// pdfOrder saves order 1004 for Office Supply World with a mailing address,
// a Ship to, a message and a memo, and in form order: an account line of
// 180.00 on 6210 Design Tools with a description, an account line of 45.00 on
// 6200 Software Subscriptions with none, 4 Wireless access points (Vendor part
// no. AP-6E-410) at 121.40 and 12 Cat6 patch cables (none) at 3.10. Total
// 180.00 + 45.00 + 485.60 + 37.20 = 747.80.
func (pe *poEnv) pdfOrder(t testing.TB) *core.Record {
	t.Helper()
	if _, err := pe.app.DB().NewQuery("UPDATE books_doc_sequences SET next_number = 1004 WHERE id = {:id}").
		Bind(dbx.Params{"id": poSequenceID}).Execute(); err != nil {
		t.Fatalf("move the purchase order sequence to 1004: %v", err)
	}
	if err := setFields(t, pe.app, "books_settings", settingsID, map[string]any{"business_name": poPDFBusiness}); err != nil {
		t.Fatalf("name the business: %v", err)
	}
	if err := setFields(t, pe.app, "books_products", pe.accessPoint.Id, map[string]any{"vendor_part_no": poPDFPartNo}); err != nil {
		t.Fatalf("give the access point a Vendor part no.: %v", err)
	}
	order := mkPO(t, pe.app, pe.officeSupply, map[string]any{
		"mailing_address": invoicePDFBillTo, "ship_to": poPDFShipTo, "message": poPDFMessage, "memo": poPDFMemo,
	})
	mkPOLine(t, pe.app, order, 0, billLineWith(accountLine(pe.designTools, 18000), map[string]any{"description": poPDFAccount}))
	mkPOLine(t, pe.app, order, 1, accountLine(pe.software, 4500))
	mkPOLine(t, pe.app, order, 2, productLine(pe.accessPoint, 4, 12140))
	mkPOLine(t, pe.app, order, 3, productLine(pe.patchCable, 12, 310))
	stored := reload(t, pe.app, "books_purchase_orders", order.Id)
	if stored.GetString("number") != "1004" || stored.GetInt("total") != 74780 {
		t.Fatalf("order number %q total %d, want 1004 and 74780", stored.GetString("number"), stored.GetInt("total"))
	}
	return stored
}

func buildPurchaseOrderPDF(t testing.TB, app core.App, id string) pdfDocument {
	t.Helper()
	doc, err := buildPurchaseOrderDocument(app, reload(t, app, "books_purchase_orders", id))
	if err != nil {
		t.Fatalf("build the purchase order document: %v", err)
	}
	if err := doc.validate(); err != nil {
		t.Fatalf("the purchase order document is invalid: %v", err)
	}
	return doc
}

func blockLabeled(blocks []pdfBlock, label string) (pdfBlock, bool) {
	for _, b := range blocks {
		if b.Label == label {
			return b, true
		}
	}
	return pdfBlock{}, false
}

func TestPurchaseOrderPDF_PrintsTheOrderWithTheVendorPartNoColumn(t *testing.T) {
	pe := newPOEnv(t)
	order := pe.pdfOrder(t)
	doc := buildPurchaseOrderPDF(t, pe.app, order.Id)

	if doc.Title != "Purchase order" || doc.Number != "1004" {
		t.Errorf("title %q number %q, want Purchase order 1004", doc.Title, doc.Number)
	}
	dated := false
	for _, d := range doc.Dates {
		dated = dated || d.Day == poDay
	}
	if !dated {
		t.Errorf("dates = %+v, want the order date %s", doc.Dates, poDay)
	}

	view := pdfViewOf(doc, testOrg())
	if view.Company.Name != poPDFBusiness {
		t.Errorf("business block name = %q, want %q", view.Company.Name, poPDFBusiness)
	}
	labels := make([]string, len(view.Parties))
	for i, p := range view.Parties {
		labels[i] = p.Label
	}
	if got, want := fmt.Sprint(labels), fmt.Sprint([]string{"Vendor", "Ship to"}); got != want {
		t.Errorf("party blocks = %s, want %s", got, want)
	}
	if vendor, ok := blockLabeled(view.Parties, "Vendor"); ok {
		address := formatAddressLines(&postalAddress{
			Line1: "1450 Larimer St", Line2: "Suite 300", City: "Denver",
			Region: "CO", PostalCode: "80202", Country: "USA",
		})
		if len(vendor.Lines) == 0 || vendor.Lines[0] != "Office Supply World" {
			t.Errorf("Vendor block lines = %q, want the vendor's name first", vendor.Lines)
		}
		joined := strings.Join(vendor.Lines, "\n")
		for _, line := range address {
			if !strings.Contains(joined, line) {
				t.Errorf("Vendor block lines = %q, want the mailing address line %q", vendor.Lines, line)
			}
		}
	}
	if shipTo, ok := blockLabeled(view.Parties, "Ship to"); ok {
		joined := strings.Join(shipTo.Lines, "\n")
		for _, line := range strings.Split(poPDFShipTo, "\n") {
			if !strings.Contains(joined, line) {
				t.Errorf("Ship to block lines = %q, want the line %q", shipTo.Lines, line)
			}
		}
	}

	headings, rows := printedLineTable(t, doc)
	if got, want := fmt.Sprintf("%q", headings), fmt.Sprintf("%q", sixLineHeadings); got != want {
		t.Errorf("line table headings = %s, want %s", got, want)
	}
	if len(rows) != 4 {
		t.Fatalf("line table rows = %q, want the four lines in form order", rows)
	}
	for i, row := range rows {
		if len(row) != 6 {
			t.Fatalf("row %d cells = %q, want six", i+1, row)
		}
	}
	// An account line prints its description, or its account's name without
	// the number; it has no part no., Qty or Price.
	money := func(cents int64) string { return formatMoney(cents, doc.Currency) }
	accountRows := []struct {
		text, never, amount string
	}{{poPDFAccount, "6210", money(18000)}, {"Software Subscriptions", "6200", money(4500)}}
	for i, want := range accountRows {
		row := rows[i]
		joined := strings.Join(row, " | ")
		if !strings.Contains(joined, want.text) || strings.Contains(joined, want.never) {
			t.Errorf("account row %d = %q, want %q and not the number %s", i+1, row, want.text, want.never)
		}
		if row[1] != "" || row[3] != "" || row[4] != "" || row[5] != want.amount {
			t.Errorf("account row %d part no. %q Qty %q Price %q Amount %q, want blank, blank, blank, %s",
				i+1, row[1], row[3], row[4], row[5], want.amount)
		}
	}
	productRows := []struct {
		item, partNo, qty, price, amount string
	}{
		{"Wireless access point", poPDFPartNo, "4", money(12140), money(48560)},
		{"Cat6 patch cable, 10 ft", "", "12", money(310), money(3720)},
	}
	for i, want := range productRows {
		row := rows[i+2]
		if row[0] != want.item || row[1] != want.partNo || row[3] != want.qty || row[4] != want.price || row[5] != want.amount {
			t.Errorf("product row %d = %q, want item %q, part no. %q, Qty %q, Price %q, Amount %q",
				i+1, row, want.item, want.partNo, want.qty, want.price, want.amount)
		}
	}

	if got, want := fmt.Sprint(doc.Totals), fmt.Sprint([]pdfAmount{{Label: "Total", Cents: 74780}}); got != want {
		t.Errorf("totals = %s, want %s", got, want)
	}
	if doc.Notes != poPDFMessage {
		t.Errorf("notes = %q, want the message %q", doc.Notes, poPDFMessage)
	}
	if strings.Contains(fmt.Sprintf("%+v", doc), poPDFMemo) {
		t.Errorf("the memo is in the document: %+v", doc)
	}

	if got := purchaseOrderFileName(doc); got != "purchase-order-1004" {
		t.Errorf("purchaseOrderFileName = %q, want purchase-order-1004", got)
	}
	if got := purchaseOrderPDFKind(t).FileName(doc); got != "purchase-order-1004" {
		t.Errorf("kind file name = %q, want purchase-order-1004", got)
	}

	// No memo, no received quantities, no status on the printed page.
	html, err := renderPDFHTML(view)
	if err != nil {
		t.Fatalf("render the document's HTML: %v", err)
	}
	for _, never := range []string{poPDFMemo, "Received", "Billed", "Open", "Closed", "Partly received"} {
		if strings.Contains(string(html), never) {
			t.Errorf("the printed page holds %q:\n%s", never, html)
		}
	}
}

// Spec §3.6 "PDF": Ship to is optional; an order with no Ship to (blank, or
// spaces only) prints the Vendor block alone, with no Ship to heading.
func TestPurchaseOrderPDF_NoShipToPrintsTheVendorBlockAlone(t *testing.T) {
	for name, shipTo := range map[string]string{"blank": "", "spaces only": "   \n  "} {
		t.Run(name, func(t *testing.T) {
			pe := newPOEnv(t)
			order := mkPO(t, pe.app, pe.officeSupply, map[string]any{"mailing_address": invoicePDFBillTo, "ship_to": shipTo})
			mkPOLine(t, pe.app, order, 0, accountLine(pe.software, 4500))
			doc := buildPurchaseOrderPDF(t, pe.app, order.Id)

			view := pdfViewOf(doc, testOrg())
			labels := make([]string, len(view.Parties))
			for i, p := range view.Parties {
				labels[i] = p.Label
			}
			if got, want := fmt.Sprint(labels), fmt.Sprint([]string{"Vendor"}); got != want {
				t.Errorf("party blocks = %s, want %s", got, want)
			}
			html, err := renderPDFHTML(view)
			if err != nil {
				t.Fatalf("render the document's HTML: %v", err)
			}
			if strings.Contains(string(html), "Ship to") {
				t.Errorf("the printed page holds a Ship to heading:\n%s", html)
			}
		})
	}
}

// The other kinds' PDFs keep the template's five columns.
func TestDocumentPDF_AnInvoiceAndAnEstimateKeepFiveHeadings(t *testing.T) {
	t.Run("invoice", func(t *testing.T) {
		pe := newPostingEnv(t)
		inv := pe.pdfInvoice(t)
		headings, rows := printedLineTable(t, buildInvoicePDF(t, pe.app, inv.Id))
		if got, want := fmt.Sprintf("%q", headings), fmt.Sprintf("%q", fiveLineHeadings); got != want {
			t.Errorf("invoice line table headings = %s, want %s", got, want)
		}
		for i, row := range rows {
			if len(row) != 5 {
				t.Errorf("invoice row %d cells = %q, want five", i+1, row)
			}
		}
	})
	t.Run("estimate", func(t *testing.T) {
		ee := newEstimateEnv(t)
		r := ee.everyKindEstimate(t, nil)
		headings, rows := printedLineTable(t, buildEstimatePDF(t, ee.app, r.Id))
		if got, want := fmt.Sprintf("%q", headings), fmt.Sprintf("%q", fiveLineHeadings); got != want {
			t.Errorf("estimate line table headings = %s, want %s", got, want)
		}
		for i, row := range rows {
			if len(row) != 5 {
				t.Errorf("estimate row %d cells = %q, want five", i+1, row)
			}
		}
	})
}
