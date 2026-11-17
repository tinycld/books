package books

import "tinycld.org/core/reports"

// salesByCustomerKey names the shipped Sales by Customer for good.
const salesByCustomerKey = "books.sales_by_customer"

// salesByCustomerShipped is the Sales by Customer Books ships. Like every
// Books shipped report it is unpublished, and Books shares it with every
// Books reader (report_shares.go), because published reports are hidden from
// guests.
func salesByCustomerShipped() reports.Shipped {
	return reports.Shipped{
		Key:         salesByCustomerKey,
		Title:       "Sales by Customer",
		Description: "What each customer bought in a period, from posted invoices and sales receipts, less posted credit memos, before sales tax.",
		Spec:        mustJSON(salesByCustomerSpec()),
		// 1: the first shipped spec. The report is unreleased, so later
		// checkpoints keep 1 (core re-stores a spec only on a higher revision).
		Revision:    1,
		Unpublished: true,
	}
}

// salesByCustomerSpec is the sale lines of the period (postedSaleLines),
// grouped by family (the customer's parent, or the customer when it has no
// parent), then by customer (sales-reports spec §5). A sale line is in one
// document, and its document names at most one customer, so it is in exactly
// one customer row; a family total adds its customer rows, and the Total adds
// every row, No customer included: the posted invoices' and sales receipts'
// Subtotals of the period less the posted credit memos'. Paths start at a
// sale line.
func salesByCustomerSpec() *reports.Spec {
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.sales_lines",
		Params:  salesParams(nil),
		// An unset Customer keeps every line; a set one drops the blank key,
		// so the No customer row does not show.
		Filter:  op("and", append(postedSaleLines(prm("period")), op("in", col("customerKey"), prm("customers")))...),
		Columns: sbcColumns(),
		Groups:  sbcGroups(),
		Sort:    sbcSort(),
		Detail:  &reports.Detail{Label: salesDetailLabel(fld("product", "name")), Open: stlDetailOpen()},
		Display: sbcDisplay(),
	}
}

// salesParams are the params both sales reports share: the Period (This
// fiscal year to date by default), then products when it is not nil, the
// Customer (unset: every sale) and the Order (Name by default). The reports
// are on the accrual basis, so there is no Method.
func salesParams(products *reports.ParamDef) []reports.ParamDef {
	out := []reports.ParamDef{
		{ID: "period", Type: reports.ParamDateRange, Label: "Period", Default: mustJSON(map[string]string{"preset": "thisFiscalYearToDate"})},
	}
	if products != nil {
		out = append(out, *products)
	}
	return append(out,
		customersParam(),
		reports.ParamDef{
			ID: "order", Type: reports.ParamChoice, Label: "Order",
			Options: []reports.Option{
				{Value: "name", Label: "Name"},
				{Value: "sales", Label: "Largest sales"},
			},
			Default: mustJSON("name"),
		},
	)
}

// salesDetailLabel labels an opened sale line "<date> · <Invoice|Credit
// memo|Sales receipt> <number> · <last>", the document's date and number; a
// line whose last is empty ends after the number.
func salesDetailLabel(last *reports.Node) *reports.Node {
	return op("concat",
		fld("document", "date"),
		lit(" · "),
		byDocumentKind(func(_, noun string) *reports.Node { return lit(noun) }),
		lit(" "),
		fld("document", "number"),
		op("if", op("isEmpty", last), lit(""), op("concat", lit(" · "), last)),
	)
}

// sbcCustomer is the line's document's customer.
func sbcCustomer() reports.Path { return reports.Path{{Link: "document"}, {Link: "customer"}} }

// sbcColumns are the label, Sales, % of sales and the two hidden group keys
// (D7: a group names a spec column): the family (the parent, else the
// customer) and the customer. % of sales is each row's share of the report's
// Total, 2 places, and blank on a sale line row.
func sbcColumns() []reports.Column {
	two := 2
	return []reports.Column{
		{ID: "name", Label: "Customer", Path: sbcCustomer()},
		{ID: "sales", Label: "Sales", Formula: op("sum", saleAmount())},
		{ID: "pct", Label: "% of sales", Formula: &reports.Node{Op: "percentOfTotal", Args: []*reports.Node{col("sales")}, Scale: &two}, Detail: "blank"},
		{ID: "topKey", Label: "Family", Hidden: true, Formula: op("coalesce",
			&reports.Node{Path: append(sbcCustomer(), reports.Hop{Link: "parent"})},
			&reports.Node{Path: sbcCustomer()},
		)},
		{ID: "customerKey", Label: "Customer key", Hidden: true, Path: sbcCustomer()},
	}
}

// sbcGroups are the family, open when the report opens and drawn only when a
// line names a sub-customer, and the customer, muted when inactive. A blank
// key (a sales receipt with no customer) labels "No customer".
func sbcGroups() []reports.Group {
	inactive := op("eq", rec("byCustomer", "inactive"), lit(true))
	return []reports.Group{
		{
			ID: "byTop", Col: "topKey", Open: true, Subtotals: true, HideEmpty: true,
			Label: op("coalesce", rec("byTop", "display_name"), lit("No customer")),
			// No line of the family names a sub-customer.
			Inline: op("eq", op("sum", op("if", op("isEmpty", fld("document", "customer", "parent", "id")), lit(0), lit(1))), lit(0)),
		},
		{
			ID: "byCustomer", Col: "customerKey",
			// The suffix keeps the mark in exports and screen readers, which
			// do not read the muted tone.
			Label: op("concat",
				op("coalesce", rec("byCustomer", "display_name"), lit("No customer")),
				op("if", inactive, lit(" (inactive)"), lit("")),
			),
			Muted: inactive,
		},
	}
}

// sbcSort is the report's order (D6): inside a family the parent's own row
// first (read on customer rows only); No customer last, under both orders;
// under Largest sales the level's sales, largest first (on every level); then
// families and customers by name, ignoring case. Core applies a key on each
// group level where it has a value, and on detail rows it applies every key
// (there `sum(x)` is x). The line keys (the document's date, its posting
// order, the line's position) therefore come before the sales key: they order
// the opened rows of one customer, and core skips them on group levels
// because they read a line.
func sbcSort() []reports.SortKey {
	return []reports.SortKey{
		{Formula: op("if", op("eq", rec("byCustomer", "id"), rec("byTop", "id")), lit(0), lit(1))},
		{Formula: fld("document", "date")},
		{Formula: fld("document", "sequence")},
		{Formula: fld("position")},
		{Formula: op("if", op("isEmpty", rec("byTop", "id")), lit(1), lit(0))},
		{Formula: op("if", op("eq", prm("order"), lit("sales")), op("sum", saleAmount()), lit(0)), Dir: "desc"},
		{Formula: op("lower", rec("byTop", "display_name"))},
		{Formula: op("lower", rec("byCustomer", "display_name"))},
	}
}

// sbcDisplay is the fixture's SALES_BY_CUSTOMER_DISPLAY: one line from
// 520 px; a long customer name or sale line label wraps to three lines, and
// the figures are never cut; on a phone the name on its own line, then Sales
// and % of sales.
func sbcDisplay() *reports.Display {
	return &reports.Display{
		OneLine: &reports.DisplayOneLine{MinWidth: "520px"},
		Columns: map[string]reports.ColumnFit{
			"name":  {WhiteSpace: "normal", LineClamp: 3},
			"sales": {MinWidth: "max-content"},
			"pct":   {MinWidth: "max-content"},
		},
		Layouts: []reports.DisplayLayout{{
			Width:  "mobile",
			Tracks: 2,
			Cells: []reports.DisplayCell{
				{Col: "name", Line: 1, Span: 2},
				{Col: "sales", Line: 2},
				{Col: "pct", Line: 2},
			},
		}},
	}
}
