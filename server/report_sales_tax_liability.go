package books

import "tinycld.org/core/reports"

// salesTaxLiabilityKey names the shipped Sales Tax Liability for good.
const salesTaxLiabilityKey = "books.sales_tax_liability"

// salesTaxLiabilityShipped is the Sales Tax Liability Books ships. Like every
// Books shipped report it is unpublished, and Books shares it with every
// Books reader (report_shares.go), because published reports are hidden from
// guests.
func salesTaxLiabilityShipped() reports.Shipped {
	return reports.Shipped{
		Key:         salesTaxLiabilityKey,
		Title:       "Sales Tax Liability",
		Description: "The sales tax you charged on posted invoices and sales receipts, less the tax on posted credit memos, by agency and rate.",
		Spec:        mustJSON(salesTaxLiabilitySpec()),
		// Revision 2: the Method param (pay-bills spec §3.10, Q3).
		// Revision 3: credit memos (credit memo spec §3.11, Q17).
		Revision:    4,
		Unpublished: true,
	}
}

// salesTaxLiabilitySpec is the tax lines of the posted invoices, credit memos
// and sales receipts whose own date is in the period, grouped by the agency
// stored on each line, then by its component rate, both in name order (spec
// §5); a credit memo's lines are below zero and lower its rate's figures. On
// Accrual it reads the ledger tax lines alone; on Cash also the invoices'
// cash-basis tax rows, which take an invoice's tax out at the invoice date and
// bring back each payment's share at the payment date (pay-bills spec §3.10),
// and leaves out an unapplied credit memo (cashCreditMemoFilter).
// Each tax line is one document and one component, so a rate row adds each
// of its documents once; the agency total and the Total add the rate rows'
// tax and leave the sales figures blank, because a document taxed by two
// rates of one agency would count its sales twice there. Paths start at a tax
// line.
func salesTaxLiabilitySpec() *reports.Spec {
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.sales_tax_lines",
		Params:  stlParams(),
		Filter: op("and",
			// A required link: a line whose document the reader cannot read
			// drops out.
			op("eq", &reports.Node{Path: reports.Path{{Link: "document", With: "required"}, {Field: "status"}}}, lit(statusPosted)),
			// The line's own date: a cash-basis row counts on the day it
			// takes out or brings back, not on the document's date.
			op("between", fld("date"), prm("period")),
			basisFilter(),
			cashCreditMemoFilter(),
			// An unset Agency keeps every line.
			op("in", col("agencyKey"), prm("agencies")),
		),
		Columns: stlColumns(),
		Groups:  stlGroups(),
		Sort: []reports.SortKey{
			{Formula: rec("byAgency", "name")},
			{Formula: rec("byRate", "name")},
			// Keys that read a line order the document rows of an opened
			// rate and leave the groups in name order.
			{Formula: fld("date")},
			{Formula: fld("document", "sequence")},
		},
		Detail:  &reports.Detail{Label: stlDetailLabel(), Open: stlDetailOpen()},
		Display: stlDisplay(),
	}
}

// stlDocumentKinds are the kinds of a tax line's or a sale line's document
// with the words of its row; the last one is the formula's fallback. A payout
// refund receipt has no tax lines and no sale lines, so only a plain refund's
// rows read "Refund receipt".
var stlDocumentKinds = []struct{ kind, noun string }{
	{"invoice", "Invoice"},
	{"credit_memo", "Credit memo"},
	{"refund_receipt", "Refund receipt"},
	{"sales_receipt", "Sales receipt"},
}

// byDocumentKind is the value of the document's kind among stlDocumentKinds:
// an if per kind, the last kind the fallback.
func byDocumentKind(value func(kind, noun string) *reports.Node) *reports.Node {
	last := stlDocumentKinds[len(stlDocumentKinds)-1]
	out := value(last.kind, last.noun)
	for i := len(stlDocumentKinds) - 2; i >= 0; i-- {
		k := stlDocumentKinds[i]
		out = op("if", op("eq", fld("document", "kind"), lit(k.kind)), value(k.kind, k.noun), out)
	}
	return out
}

// stlDetailOpen is the read view of a document row's invoice, credit memo,
// refund receipt or sales receipt, by the document's kind and id. Only detail
// rows carry it: rate, agency and total rows open nothing. The route segments
// come from entry_routes.json, the one list of document screens.
func stlDetailOpen() *reports.Node {
	// The document's URL key (lib/record-key.ts): its number without the prefix
	// when it is posted, else its id. A document a correction replaced is void,
	// and shares its number with the correction.
	key := op("case",
		op("and",
			op("eq", fld("document", "status"), lit(statusPosted)),
			op("gt", fld("document", "sequence"), lit(0)),
		),
		op("concat", fld("document", "sequence")),
		fld("document", "id"),
	)
	return byDocumentKind(func(kind, _ string) *reports.Node {
		return op("concat", lit("books/"+entryRoutes[kind]+"/"), key)
	})
}

// stlDetailLabel is "<date> · <Invoice|Credit memo|Refund receipt|Sales
// receipt> <number> · <customer>", the date the line's own (the day it counts
// on); a document with no customer ends after its number. The kind is a
// constant select, and a formula reads its value, so the words are written
// here (D6).
func stlDetailLabel() *reports.Node {
	customer := fld("document", "customer", "display_name")
	return op("concat",
		fld("date"),
		lit(" · "),
		byDocumentKind(func(_, noun string) *reports.Node { return lit(noun) }),
		lit(" "),
		fld("document", "number"),
		op("if", op("isEmpty", customer), lit(""), op("concat", lit(" · "), customer)),
	)
}

// cashCreditMemoFilter leaves out, on Cash, a credit memo's ledger tax lines
// and the cash rows that take them out (credit memo spec §3.11, Q17). Both lie
// on the memo's date and cancel, so the figures stay; without them an
// unapplied memo shows no row. A taken-out row has no payment entry; a row
// that brings a memo back (when something applies or refunds it) names the
// entry that did it and stays. The rows' signs decide nothing: a memo's
// subtotal can be zero or below zero.
func cashCreditMemoFilter() *reports.Node {
	return op("not", op("and",
		op("eq", prm("method"), lit("cash")),
		op("eq", fld("document", "kind"), lit("credit_memo")),
		op("or",
			op("eq", fld("layer"), lit("ledger")),
			op("isEmpty", fld("payment_entry", "id")),
		),
	))
}

// stlParams are the Period (Last month by default), the Method (Accrual by
// default) and the Agency filter, whose options are every agency, inactive
// ones included.
func stlParams() []reports.ParamDef {
	return []reports.ParamDef{
		{ID: "period", Type: reports.ParamDateRange, Label: "Period", Default: mustJSON(map[string]string{"preset": "lastMonth"})},
		methodParam(),
		{
			ID: "agencies", Type: reports.ParamChoice, Label: "Agency", Multiple: true,
			OptionsFrom: &reports.OptionsFrom{
				Source: "books.tax_agencies",
				Value:  path("id"),
				Label:  path("name"),
			},
		},
	}
}

// stlColumns are the label, the four figures and the two hidden group keys
// (D10: a group names a spec column). The three sales figures total on the
// rate level only (blankAbove).
func stlColumns() []reports.Column {
	return []reports.Column{
		{ID: "name", Label: "Tax name", Path: reports.Path{{Link: "component"}}},
		{ID: "gross", Label: "Gross total", Formula: op("sum", fld("gross_amount")), BlankAbove: "byRate"},
		{ID: "nontaxable", Label: "Non-taxable", Formula: op("sum", op("sub", fld("gross_amount"), fld("taxable_amount"))), BlankAbove: "byRate"},
		{ID: "taxable", Label: "Taxable amount", Formula: op("sum", fld("taxable_amount")), BlankAbove: "byRate"},
		{ID: "tax", Label: "Tax amount", Formula: op("sum", fld("amount"))},
		{ID: "agencyKey", Label: "Agency", Hidden: true, Path: reports.Path{{Link: "agency"}}},
		{ID: "rateKey", Label: "Rate", Hidden: true, Path: reports.Path{{Link: "component"}}},
	}
}

// stlGroups are the agency, open when the report opens, and its rates,
// closed; each ends in its total.
func stlGroups() []reports.Group {
	return []reports.Group{
		{ID: "byAgency", Col: "agencyKey", Open: true, Subtotals: true, Label: rec("byAgency", "name")},
		{ID: "byRate", Col: "rateKey", Subtotals: true, Label: rec("byRate", "name")},
	}
}

// stlDisplay is the fixture's SALES_TAX_LIABILITY_DISPLAY: one line from
// 600 px; on a phone the label on its own line, then the figures two by two,
// because four figures do not fit one line of a 390 px phone.
func stlDisplay() *reports.Display {
	return &reports.Display{
		OneLine: &reports.DisplayOneLine{MinWidth: "600px"},
		Columns: map[string]reports.ColumnFit{"name": {MinWidth: "12ch"}},
		Layouts: []reports.DisplayLayout{{
			Width:  "mobile",
			Tracks: 2,
			Cells: []reports.DisplayCell{
				{Col: "name", Line: 1, Span: 2},
				{Col: "gross", Line: 2},
				{Col: "nontaxable", Line: 2},
				{Col: "taxable", Line: 3},
				{Col: "tax", Line: 3},
			},
		}},
	}
}
