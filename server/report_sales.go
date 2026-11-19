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
// memo|Refund receipt|Sales receipt> <number> · <last>", the document's date
// and number; a line whose last is empty ends after the number.
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

// salesByProductKey names the shipped Sales by Product/Service for good.
const salesByProductKey = "books.sales_by_product"

// salesByProductShipped is the Sales by Product/Service Books ships,
// unpublished and shared with every Books reader, as Sales by Customer.
func salesByProductShipped() reports.Shipped {
	return reports.Shipped{
		Key:         salesByProductKey,
		Title:       "Sales by Product/Service",
		Description: "What you sold of each product and service in a period, from posted invoices and sales receipts, less posted credit memos, before sales tax.",
		Spec:        mustJSON(salesByProductSpec()),
		// 1: the first shipped spec. The report is unreleased, so later
		// checkpoints keep 1 (core re-stores a spec only on a higher revision).
		Revision:    1,
		Unpublished: true,
	}
}

// salesByProductSpec is the sale lines of the period (postedSaleLines),
// one flat row per product (sales-reports spec §5). It reads the same lines
// as Sales by Customer, and a sale line names one product, so each line is in
// exactly one product row and the two Totals are equal for the same period
// and filters. A percent line counts on its own product's row. Paths start
// at a sale line.
func salesByProductSpec() *reports.Spec {
	products := productsParam()
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.sales_lines",
		Params:  salesParams(&products),
		Filter: op("and", append(postedSaleLines(prm("period")),
			op("in", col("productKey"), prm("products")),
			op("in", col("customerKey"), prm("customers")),
		)...),
		Columns: sbpColumns(),
		Groups:  sbpGroups(),
		Sort:    sbpSort(),
		Detail:  &reports.Detail{Label: salesDetailLabel(fld("document", "customer", "display_name")), Open: stlDetailOpen()},
		Display: sbpDisplay(),
	}
}

// sbpProduct is the line's product.
func sbpProduct() reports.Path { return reports.Path{{Link: "product"}} }

// sbpColumns are the label, Quantity, Amount, % of sales, Avg price and the
// two hidden filter keys (D7). The engine's sum of no rows and its division
// by zero are 0, so Quantity and Avg price are blank (nil) when the signed
// quantity sums to 0: a discount's row, and a product sold and fully
// credited (D13). Both are blank on the Total too (blankAbove): units of
// different products do not add up.
func sbpColumns() []reports.Column {
	zero, two := 0, 2
	qty := func() *reports.Node { return op("sum", saleQuantity()) }
	noQty := func() *reports.Node { return op("eq", qty(), lit(0)) }
	return []reports.Column{
		{ID: "name", Label: "Product/Service", Path: sbpProduct()},
		{ID: "quantity", Label: "Quantity", BlankAbove: "byProduct", Formula: op("if", noQty(), lit(nil),
			&reports.Node{Op: "round", Args: []*reports.Node{qty()}, Scale: &two},
		)},
		{ID: "amount", Label: "Amount", Formula: op("sum", saleAmount())},
		{ID: "pct", Label: "% of sales", Format: "percent", Detail: reports.DetailBlank,
			Formula: &reports.Node{Op: "percentOfTotal", Args: []*reports.Node{col("amount")}, Scale: &two}},
		{ID: "avg", Label: "Avg price", BlankAbove: "byProduct", Formula: op("if", noQty(), lit(nil),
			&reports.Node{Op: "div", Args: []*reports.Node{op("sum", saleAmount()), qty()}, Scale: &zero},
		)},
		{ID: "productKey", Label: "Product key", Hidden: true, Path: sbpProduct()},
		{ID: "customerKey", Label: "Customer key", Hidden: true, Path: sbcCustomer()},
	}
}

// sbpGroups is the one level, a product, closed when the report opens and
// muted when inactive.
func sbpGroups() []reports.Group {
	inactive := op("eq", rec("byProduct", "inactive"), lit(true))
	return []reports.Group{{
		ID: "byProduct", Col: "productKey",
		// The suffix keeps the mark in exports and screen readers, which do
		// not read the muted tone.
		Label: op("concat", rec("byProduct", "name"), op("if", inactive, lit(" (inactive)"), lit(""))),
		Muted: inactive,
	}}
}

// sbpSort is the report's order: the line keys (the document's date, its
// posting order, the line's position) order a product's opened rows, and core
// skips them on the product level because they read a line; then under
// Largest sales the product's Amount, largest first; then the name, ignoring
// case.
func sbpSort() []reports.SortKey {
	return []reports.SortKey{
		{Formula: fld("document", "date")},
		{Formula: fld("document", "sequence")},
		{Formula: fld("position")},
		{Formula: op("if", op("eq", prm("order"), lit("sales")), op("sum", saleAmount()), lit(0)), Dir: "desc"},
		{Formula: op("lower", rec("byProduct", "name"))},
	}
}

// sbpDisplay is the fixture's SALES_BY_PRODUCT_DISPLAY: one line from
// 720 px; a long product name or sale line label wraps to three lines, and
// the figures are never cut; on a phone the name on its own line, then
// Quantity and Amount, then % of sales and Avg price.
func sbpDisplay() *reports.Display {
	return &reports.Display{
		OneLine: &reports.DisplayOneLine{MinWidth: "720px"},
		Columns: map[string]reports.ColumnFit{
			"name":     {WhiteSpace: "normal", LineClamp: 3},
			"quantity": {MinWidth: "max-content"},
			"amount":   {MinWidth: "max-content"},
			"pct":      {MinWidth: "max-content"},
			"avg":      {MinWidth: "max-content"},
		},
		Layouts: []reports.DisplayLayout{{
			Width:  "mobile",
			Tracks: 2,
			Cells: []reports.DisplayCell{
				{Col: "name", Line: 1, Span: 2},
				{Col: "quantity", Line: 2},
				{Col: "amount", Line: 2},
				{Col: "pct", Line: 3},
				{Col: "avg", Line: 3},
			},
		}},
	}
}
