package books

import "tinycld.org/core/reports"

// expensesByVendorKey names the shipped Expenses by Vendor for good.
const expensesByVendorKey = "books.expenses_by_vendor"

// expensesByVendorShipped is the Expenses by Vendor Books ships. Like every
// Books shipped report it is unpublished, and Books shares it with every Books
// reader (report_shares.go), because published reports are hidden from
// guests.
func expensesByVendorShipped() reports.Shipped {
	return reports.Shipped{
		Key:         expensesByVendorKey,
		Title:       "Expenses by Vendor",
		Description: "What you spent with each vendor in a period, from posted transactions on expense accounts.",
		Spec:        mustJSON(expensesByVendorSpec()),
		// 1: the first shipped spec. The report is unreleased, so later
		// checkpoints keep 1 (core re-stores a spec only on a higher revision).
		Revision:    1,
		Unpublished: true,
	}
}

// expensesByVendorSpec is the posted lines on Cost of goods sold, Expense and
// Other expense accounts dated in the period, on the run's basis, grouped by
// vendor (spec §3, §4). Each posted line is on one account and names at most
// one vendor, so it is in exactly one vendor row (or the No vendor row); the
// Total adds every row, No vendor included: the Profit and Loss's three
// expense sections for the same period and basis. Paths start at a row of
// books.basis_lines.
func expensesByVendorSpec() *reports.Spec {
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.basis_lines",
		Params:  ebvParams(),
		// An unset Vendor keeps every line; a set one drops the blank key, so
		// the No vendor row does not show.
		Filter: op("and",
			basisFilter(),
			op("eq", fld("posted"), lit(true)),
			op("between", fld("date"), prm("period")),
			op("in", fld("account", "type"), lit(typesInGroup("expense"))),
			op("in", col("vendorKey"), prm("vendors")),
		),
		Columns: ebvColumns(),
		Groups:  []reports.Group{ebvGroup()},
		Sort:    vendorSortBy("amount", ebvNet(), expenseLineKeys()...),
		Detail:  &reports.Detail{Label: balanceDetailLabel(), Open: entryOpenPath()},
		Display: ebvDisplay(),
	}
}

// ebvParams are Period (This fiscal year to date by default), Method, Rows,
// Vendor and Order (Name by default), in the order the chips show them.
func ebvParams() []reports.ParamDef {
	return []reports.ParamDef{
		{ID: "period", Type: reports.ParamDateRange, Label: "Period", Default: mustJSON(map[string]string{"preset": "thisFiscalYearToDate"})},
		methodParam(),
		rowsParam(),
		vendorsParam(),
		{
			ID: "order", Type: reports.ParamChoice, Label: "Order",
			Options: []reports.Option{
				{Value: "name", Label: "Name"},
				{Value: "amount", Label: "Largest expenses"},
			},
			Default: mustJSON("name"),
		},
	}
}

// ebvNet is a line's debit less its credit: an expense is above zero, a
// vendor credit or a refund below it.
func ebvNet() *reports.Node { return op("sub", fld("debit"), fld("credit")) }

// ebvColumns are the label, Total, % of expenses and the hidden group key (a
// group names a spec column). % of expenses is each row's share of the
// report's Total, 2 places, and blank on an opened line.
func ebvColumns() []reports.Column {
	two := 2
	return []reports.Column{
		{ID: "name", Label: "Vendor", Path: reports.Path{{Link: "vendor"}}},
		{ID: "amount", Label: "Total", Formula: op("sum", ebvNet())},
		{ID: "pct", Label: "% of expenses", Format: "percent", Detail: reports.DetailBlank,
			Formula: &reports.Node{Op: "percentOfTotal", Args: []*reports.Node{col("amount")}, Scale: &two}},
		{ID: "vendorKey", Label: "Vendor key", Hidden: true, Path: reports.Path{{Link: "vendor"}}},
	}
}

// ebvGroup is the vendor level, shown by the Rows choice.
func ebvGroup() reports.Group {
	g := vendorGroup()
	// Core refuses hideEmpty on the last level (reports bind.go: "the last
	// level has no child groups to be empty of"). On this one level a vendor
	// with no line has no group row anyway, and Having hides the rest.
	g.HideEmpty = false
	g.Having = balanceRowsHaving(ebvNet())
	return g
}

// ebvDisplay is the fixture's EXPENSES_BY_VENDOR_DISPLAY (plan D1): the three
// columns on one line where the rows are 640 px wide or wider, a long vendor
// name or line label wraps to three lines, and no figure is cut. Narrower rows
// take the phone arrangement: the name on line 1, Total and % of expenses on
// line 2.
func ebvDisplay() *reports.Display {
	figure := reports.ColumnFit{MinWidth: "max-content"}
	return &reports.Display{
		OneLine: &reports.DisplayOneLine{MinWidth: "640px"},
		Columns: map[string]reports.ColumnFit{
			"name":   {WhiteSpace: "normal", LineClamp: 3},
			"amount": figure,
			"pct":    figure,
		},
		Layouts: []reports.DisplayLayout{
			{
				Width: "mobile", Tracks: 2,
				Cells: []reports.DisplayCell{
					{Col: "name", Line: 1, Span: 2},
					{Col: "amount", Line: 2},
					{Col: "pct", Line: 2},
				},
			},
		},
	}
}
