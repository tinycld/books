package books

import "tinycld.org/core/reports"

// openPurchaseOrdersKey names the shipped Open Purchase Orders for good.
const openPurchaseOrdersKey = "books.open_purchase_orders"

// openPurchaseOrdersReport is the Open Purchase Orders Books ships
// (purchase-orders spec §3.10). Like every Books shipped report it is
// unpublished, and Books shares it with every Books reader (report_shares.go),
// because published reports are hidden from guests. It is live: it reads the
// order lines, not the journal lines.
func openPurchaseOrdersReport() reports.Shipped {
	return reports.Shipped{
		Key:         openPurchaseOrdersKey,
		Title:       "Open Purchase Orders",
		Description: "What is ordered and not yet received, by vendor and purchase order.",
		Spec:        mustJSON(openPurchaseOrdersSpec()),
		Revision:    1,
		Unpublished: true,
	}
}

// openPurchaseOrdersSpec is the open lines of the open purchase orders with an
// order date in the period, grouped by vendor, then by order. A line is open
// while its open amount is above zero (refreshPurchaseOrder writes it; a
// product line's open amount is its open quantity at its rate). Paths start at
// a purchase order line.
func openPurchaseOrdersSpec() *reports.Spec {
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.purchase_order_lines",
		Params:  opoParams(),
		// All dates (the Period default) or an unset Period keeps every day; an
		// unset Vendor keeps every line.
		Filter: op("and",
			op("eq", fld("order", "status"), lit("open")),
			op("gt", fld("open_amount"), lit(0)),
			op("between", fld("order", "date"), prm("period")),
			op("in", col("vendorKey"), prm("vendors")),
		),
		Columns: opoColumns(),
		Groups:  []reports.Group{opoVendorGroup(), opoOrderGroup()},
		// Orders by date, then number as an integer; lines by their place on
		// the order.
		Sort: vendorSortBy("open", fld("open_amount"),
			reports.SortKey{Formula: col("orderDate")},
			reports.SortKey{Formula: col("orderNo")},
			reports.SortKey{Formula: fld("position")},
		),
		Detail:    &reports.Detail{Label: opoDetailLabel(), Open: opoDetailOpen()},
		Display:   opoDisplay(),
		EmptyText: "No open purchase orders",
	}
}

// opoDetailOpen is the read view of a line's order, by the order's URL key
// (lib/record-key.ts): its number without the prefix (the sequence) when it
// has one, else its id. Books numbers an order when it is made.
func opoDetailOpen() *reports.Node {
	key := op("case",
		op("gt", fld("order", "sequence"), lit(0)),
		op("concat", fld("order", "sequence")),
		fld("order", "id"),
	)
	return op("concat", lit("books/purchase-orders/"), key)
}

// opoParams are Period on the order date (All dates by default, so its chip
// always shows), Vendor and Order (Name by default), in the order the chips
// show them.
func opoParams() []reports.ParamDef {
	return []reports.ParamDef{
		{ID: "period", Type: reports.ParamDateRange, Label: "Period", Default: mustJSON(map[string]string{"preset": "allDates"})},
		vendorsParam(),
		{
			ID: "order", Type: reports.ParamChoice, Label: "Order",
			Options: []reports.Option{
				{Value: "name", Label: "Name"},
				{Value: "open", Label: "Largest open amount"},
			},
			Default: mustJSON("name"),
		},
	}
}

// opoItemSum is the sum of field over the product lines, blank where there is
// none (an account line, a group with no product line). The count guard keeps
// it blank on a detail row, where the engine writes a plain sum as
// COALESCE(x, 0).
func opoItemSum(field string) *reports.Node {
	isItem := op("eq", fld("kind"), lit("item"))
	return op("if",
		op("eq", op("count", op("if", isItem, lit(1), lit(nil))), lit(0)),
		lit(nil),
		op("sum", op("if", isItem, fld(field), lit(nil))),
	)
}

// opoColumns are the label, Ordered, Received, Open (the product lines'
// quantities, totalled on the vendor and order rows and blank on the Total
// row), Open amount, and the hidden keys: the vendor and the order (a group
// names a spec column), with the order's date and number for the order sort.
func opoColumns() []reports.Column {
	return []reports.Column{
		{ID: "name", Label: "Vendor", Path: reports.Path{{Link: "order"}, {Link: "vendor"}}},
		{ID: "ordered", Label: "Ordered", Formula: opoItemSum("quantity"), BlankAbove: "byVendor"},
		{ID: "received", Label: "Received", Formula: opoItemSum("received"), BlankAbove: "byVendor"},
		{ID: "open", Label: "Open", Formula: opoItemSum("open_quantity"), BlankAbove: "byVendor"},
		{ID: "open_amount", Label: "Open amount", Formula: op("sum", fld("open_amount"))},
		{ID: "vendorKey", Label: "Vendor key", Hidden: true, Path: reports.Path{{Link: "order"}, {Link: "vendor"}}},
		{ID: "orderKey", Label: "Order key", Hidden: true, Path: reports.Path{{Link: "order"}}},
		{ID: "orderDate", Label: "Order date", Hidden: true, Formula: op("min", fld("order", "date")), BlankAbove: "byOrder", Detail: reports.DetailBlank},
		{ID: "orderNo", Label: "Order number", Hidden: true, Formula: op("min", fld("order", "sequence")), BlankAbove: "byOrder", Detail: reports.DetailBlank},
	}
}

// opoVendorGroup is vendorGroup, open when the report opens.
func opoVendorGroup() reports.Group {
	g := vendorGroup()
	g.Open = true
	return g
}

// opoOrderGroup is the order level, open when the report opens, labelled
// "<number> · <order date>" ("1004 · 2026-11-03").
func opoOrderGroup() reports.Group {
	return reports.Group{
		ID: "byOrder", Col: "orderKey", Open: true,
		Label: op("concat", rec("byOrder", "number"), lit(" · "), rec("byOrder", "date")),
	}
}

// opoDetailLabel labels an open line "<product or account> · <description>":
// the product's name on a product line, the account as accountLabel gives it
// on an account line, and no trailing " · " when the line has no description.
func opoDetailLabel() *reports.Node {
	account := accountLabel(func(n ...string) *reports.Node { return fld(append([]string{"account"}, n...)...) })
	name := op("if", op("eq", fld("kind"), lit("item")), fld("product", "name"), account)
	return op("concat",
		name,
		op("if", op("isEmpty", fld("description")), lit(""), op("concat", lit(" · "), fld("description"))),
	)
}

// opoDisplay is the fixture's OPEN_PURCHASE_ORDERS_DISPLAY
// (open-purchase-orders-fixture.ts), measured in phase 3 pass 2: the five
// columns on one line where the rows are 700 px wide or wider, a long label
// wraps to three lines, and Open amount is never cut. Narrower rows take the
// phone arrangement: the label and Open amount on line 1, so every row has a
// figure there (an account line has no quantity), and Ordered, Received and
// Open on line 2.
func opoDisplay() *reports.Display {
	return &reports.Display{
		OneLine: &reports.DisplayOneLine{MinWidth: "700px"},
		Columns: map[string]reports.ColumnFit{
			"name":        {WhiteSpace: "normal", LineClamp: 3},
			"open_amount": {MinWidth: "max-content"},
		},
		Layouts: []reports.DisplayLayout{
			{
				Width: "mobile", Tracks: 3,
				Cells: []reports.DisplayCell{
					{Col: "name", Line: 1, Span: 2},
					{Col: "open_amount", Line: 1},
					{Col: "ordered", Line: 2},
					{Col: "received", Line: 2},
					{Col: "open", Line: 2},
				},
			},
		},
	}
}

// purchaseOrdersSource is books_purchase_orders, the order headers. Left out:
// the address, email, ship to and message texts, the closing user and time,
// the revision, the form columns (form, fields) and the sort key.
func purchaseOrdersSource() reports.Source {
	return reports.Source{
		Key: "books.purchase_orders", Collection: "books_purchase_orders", Label: "Purchase orders",
		Fields: []reports.Field{
			{Key: "date", Label: "Date", Type: reports.Date, TextDay: true, Aggregates: reports.MinMax},
			{Key: "status", Label: "Status", Type: reports.Select, Options: []reports.Option{
				{Value: "open", Label: "Open"},
				{Value: "closed", Label: "Closed"},
			}},
			{Key: "closed_reason", Label: "Closed reason", Type: reports.Select, Options: []reports.Option{
				{Value: "manual", Label: "Manual"},
				{Value: "received", Label: "Received"},
			}},
			{Key: "number", Label: "Number", Type: reports.Text, Aggregates: reports.MinMax},
			// The order behind number, which sorts as text.
			{Key: "sequence", Label: "Sequence", Type: reports.Number, Aggregates: reports.MinMax},
			{Key: "memo", Label: "Memo", Type: reports.Text},
			{Key: "subtotal", Label: "Subtotal", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "total", Label: "Total", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "open_amount", Label: "Open amount", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "currency", Label: "Currency", Type: reports.Text},
		},
		Links: []reports.Link{
			{Key: "vendor", Label: "Vendor", Target: "books.vendors", Cardinality: reports.ToOne, Field: "vendor"},
			// The back link of books.purchase_order_lines' order, for the builder.
			{Key: "lines", Label: "Lines", Target: "books.purchase_order_lines", Cardinality: reports.ToMany, BackField: "purchase_order"},
		},
	}
}

// purchaseOrderLinesSource is books_purchase_order_lines, the account and
// product lines of the orders, with the open values refreshPurchaseOrder
// writes. The lines have no currency column, so the money fields name none
// and read the source's Currency (the Books currency, which every order
// carries).
func purchaseOrderLinesSource() reports.Source {
	return reports.Source{
		Key: "books.purchase_order_lines", Collection: "books_purchase_order_lines", Label: "Purchase order lines",
		Fields: []reports.Field{
			{Key: "kind", Label: "Kind", Type: reports.Select, Options: []reports.Option{
				{Value: "account", Label: "Account"},
				{Value: "item", Label: "Item"},
			}},
			{Key: "description", Label: "Description", Type: reports.Text},
			{Key: "quantity", Label: "Quantity", Type: reports.Number, Aggregates: reports.SumAll},
			{Key: "rate", Label: "Rate", Type: reports.Money},
			{Key: "amount", Label: "Amount", Type: reports.Money, Aggregates: reports.SumAll},
			{Key: "received", Label: "Received", Type: reports.Number, Aggregates: reports.SumAll},
			{Key: "billed", Label: "Billed", Type: reports.Money, Aggregates: reports.SumAll},
			{Key: "open_quantity", Label: "Open quantity", Type: reports.Number, Aggregates: reports.SumAll},
			{Key: "open_amount", Label: "Open amount", Type: reports.Money, Aggregates: reports.SumAll},
			// The line's order on its purchase order.
			{Key: "position", Label: "Position", Type: reports.Number},
		},
		Links: []reports.Link{
			{Key: "order", Label: "Purchase order", Target: "books.purchase_orders", Cardinality: reports.ToOne, Field: "purchase_order"},
			{Key: "product", Label: "Product/Service", Target: "books.products", Cardinality: reports.ToOne, Field: "product"},
			{Key: "account", Label: "Account", Target: "books.accounts", Cardinality: reports.ToOne, Field: "account"},
		},
	}
}
