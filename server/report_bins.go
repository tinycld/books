package books

import "tinycld.org/core/reports"

// stockByBinKey names the shipped Stock by Bin Location for good.
const stockByBinKey = "books.stock_by_bin"

// stockByBinReport is the Stock by Bin Location Books ships (inventory-adjust
// spec §3.9). Like every Books shipped report it is unpublished, and Books
// shares it with every Books reader (report_shares.go). It is live: it reads
// the bin stock rows, not the journal lines.
func stockByBinReport() reports.Shipped {
	return reports.Shipped{
		Key:         stockByBinKey,
		Title:       "Stock by Bin Location",
		Description: "Quantity on hand of each item, by the bin it is in.",
		Spec:        mustJSON(stockByBinSpec()),
		Revision:    1,
		Unpublished: true,
	}
}

// stockByBinSpec is the bin stock rows that hold a quantity, grouped by bin,
// with the items of each bin as detail rows. A row of an inactive item stays
// while the item has stock. Paths start at a bin stock row; a blank bin is No
// bin.
func stockByBinSpec() *reports.Spec {
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.bin_stock",
		Params:  stockByBinParams(),
		// An unset Bin keeps every bin, No bin too.
		Filter: op("and",
			op("ne", fld("quantity"), lit(0)),
			op("in", col("binKey"), prm("bins")),
			op("or",
				op("eq", fld("product", "inactive"), lit(false)),
				op("ne", fld("product", "quantity_on_hand"), lit(0)),
			),
		),
		Columns: stockByBinColumns(),
		Groups:  []reports.Group{stockByBinGroup()},
		Sort: []reports.SortKey{
			// No bin last, then bins by name, ignoring case.
			{Formula: op("if", op("isEmpty", rec("byBin", "id")), lit(1), lit(0))},
			{Formula: op("lower", rec("byBin", "name"))},
			// The items of a bin by the Order param, then by name.
			{Formula: op("if",
				op("eq", prm("order"), lit("code")),
				op("lower", fld("product", "code")),
				op("lower", fld("product", "name")),
			)},
			{Formula: op("lower", fld("product", "name"))},
		},
		Detail: &reports.Detail{
			// The code is optional on an item: a blank code gives the name alone.
			Label: op("if",
				op("isEmpty", fld("product", "code")),
				fld("product", "name"),
				op("concat", fld("product", "code"), lit(" · "), fld("product", "name")),
			),
			Open: op("concat", lit("books/products/"), fld("product", "id")),
		},
		Display:   stockByBinDisplay(),
		EmptyText: "No stock in a bin location",
		// Quantities of different items do not add up.
		NoTotal: true,
	}
}

// stockByBinParams are Bin (any number of bins, inactive ones included; the document
// header names the picks) and Order (Item name by default), in the order the
// chips show them.
func stockByBinParams() []reports.ParamDef {
	return []reports.ParamDef{
		{
			ID: "bins", Type: reports.ParamChoice, Label: "Bin", Multiple: true,
			Header:      "Bin: {label}",
			OptionsFrom: &reports.OptionsFrom{Source: "books.bins", Value: path("id"), Label: path("name")},
		},
		{
			ID: "order", Type: reports.ParamChoice, Label: "Order",
			Options: []reports.Option{
				{Value: "name", Label: "Item name"},
				{Value: "code", Label: "Item code"},
			},
			Default: mustJSON("name"),
		},
	}
}

// stockByBinItems is a bin row's "<n> items" ("1 item"): the count of its rows,
// each one item, since a bin holds one row for each item.
func stockByBinItems() *reports.Node {
	n := op("count", fld("id"))
	return op("if", op("eq", n, lit(1)), lit("1 item"), op("concat", n, lit(" items")))
}

// stockByBinColumns are the label, Items (a bin row's count of its items), Quantity
// and Reorder point (an item row's own, blank on a bin row: quantities of
// different items do not add up; a reorder point of 0 is blank), and the hidden
// bin key the group names.
func stockByBinColumns() []reports.Column {
	reorder := fld("product", "reorder_point")
	return []reports.Column{
		{ID: "name", Label: "Bin", Path: reports.Path{{Link: "bin"}}},
		{ID: "items", Label: "Items", Formula: stockByBinItems(), Detail: reports.DetailBlank},
		{ID: "quantity", Label: "Quantity", Formula: op("sum", fld("quantity")), Rollup: lit(nil)},
		{
			ID: "reorder_point", Label: "Reorder point",
			Formula: op("max", op("if", op("gt", reorder, lit(0)), reorder, lit(nil))),
			Rollup:  lit(nil),
		},
		{ID: "binKey", Label: "Bin key", Hidden: true, Path: reports.Path{{Link: "bin"}}},
	}
}

// stockByBinGroup is the bin level, open when the report opens and muted when
// inactive. A blank key (no bin) labels "No bin".
func stockByBinGroup() reports.Group {
	inactive := op("eq", rec("byBin", "inactive"), lit(true))
	return reports.Group{
		ID: "byBin", Col: "binKey", Open: true,
		// The suffix keeps the mark in exports and screen readers, which do not
		// read the muted tone.
		Label: op("concat",
			op("coalesce", rec("byBin", "name"), lit("No bin")),
			op("if", inactive, lit(" (inactive)"), lit("")),
		),
		Muted: inactive,
	}
}

// stockByBinDisplay is the fixture's STOCK_BY_BIN_DISPLAY (inventory-adjust-fixture.ts,
// testdata/stock_by_bin_spec.json): the columns on one line where the rows are
// 420 px wide or wider (label 200 + Quantity 88 + Reorder point 104, with the
// indent and padding). Narrower rows take three tracks: the label alone on
// line 1 over all three, so a long name gets the whole row; a bin's item count,
// Quantity and Reorder point on line 2.
func stockByBinDisplay() *reports.Display {
	return &reports.Display{
		OneLine: &reports.DisplayOneLine{MinWidth: "420px"},
		Columns: map[string]reports.ColumnFit{
			"name": {WhiteSpace: "normal", LineClamp: 3},
		},
		Layouts: []reports.DisplayLayout{
			{
				Width: "mobile", Tracks: 3,
				Cells: []reports.DisplayCell{
					{Col: "name", Line: 1, Span: 3},
					{Col: "items", Line: 2},
					{Col: "quantity", Line: 2},
					{Col: "reorder_point", Line: 2},
				},
			},
		},
	}
}

// binsSource is books_bins, the bin locations. sort_key is left out.
func binsSource() reports.Source {
	return reports.Source{
		Key: "books.bins", Collection: "books_bins", Label: "Bin locations",
		Fields: []reports.Field{
			{Key: "name", Label: "Name", Type: reports.Text, Aggregates: reports.MinMax},
			{Key: "note", Label: "Note", Type: reports.Text},
			{Key: "inactive", Label: "Inactive", Type: reports.Bool},
		},
	}
}

// binStockSource is books_bin_stock, the quantity of each item in each bin as
// the bin stock writers keep it (bin_stock.go). A blank bin is No bin.
func binStockSource() reports.Source {
	return reports.Source{
		Key: "books.bin_stock", Collection: "books_bin_stock", Label: "Bin stock",
		Fields: []reports.Field{
			{Key: "quantity", Label: "Quantity", Type: reports.Number, Aggregates: reports.SumAll},
		},
		Links: []reports.Link{
			{Key: "product", Label: "Product", Target: "books.products", Cardinality: reports.ToOne, Field: "product"},
			{Key: "bin", Label: "Bin location", Target: "books.bins", Cardinality: reports.ToOne, Field: "bin"},
		},
	}
}
