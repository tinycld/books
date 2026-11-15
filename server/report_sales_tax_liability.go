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
		Description: "The sales tax you charged on posted invoices and sales receipts, by agency and rate (accrual basis).",
		Spec:        mustJSON(salesTaxLiabilitySpec()),
		Revision:    1,
		Unpublished: true,
	}
}

// salesTaxLiabilitySpec is the tax lines of the posted invoices and sales
// receipts dated in the period (accrual basis), grouped by the agency stored
// on each line, then by its component rate, both in name order (spec §5).
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
			op("between", fld("document", "date"), prm("period")),
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
			{Formula: fld("document", "date")},
			{Formula: fld("document", "sequence")},
		},
		Detail:  &reports.Detail{Label: stlDetailLabel()},
		Display: stlDisplay(),
	}
}

// stlDetailLabel is "<date> · <Invoice|Sales receipt> <number> · <customer>";
// a document with no customer ends after its number. The kind is a constant
// select, and a formula reads its value, so the words are written here (D6).
func stlDetailLabel() *reports.Node {
	customer := fld("document", "customer", "display_name")
	return op("concat",
		fld("document", "date"),
		lit(" · "),
		op("if", op("eq", fld("document", "kind"), lit("invoice")), lit("Invoice"), lit("Sales receipt")),
		lit(" "),
		fld("document", "number"),
		op("if", op("isEmpty", customer), lit(""), op("concat", lit(" · "), customer)),
	)
}

// stlParams are the Period (Last month by default) and the Agency filter,
// whose options are every agency, inactive ones included.
func stlParams() []reports.ParamDef {
	return []reports.ParamDef{
		{ID: "period", Type: reports.ParamDateRange, Label: "Period", Default: mustJSON(map[string]string{"preset": "lastMonth"})},
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
