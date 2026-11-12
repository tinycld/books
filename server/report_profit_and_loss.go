package books

import "tinycld.org/core/reports"

// profitAndLossKey names the shipped Profit and Loss for good.
const profitAndLossKey = "books.profit_and_loss"

// profitAndLossShipped is the Profit and Loss Books ships. It is unpublished:
// published reports are hidden from guests, and Books bookkeepers are guests,
// so Books shares it with every Books reader instead.
func profitAndLossShipped() reports.Shipped {
	return reports.Shipped{
		Key:         profitAndLossKey,
		Title:       "Profit and Loss",
		Description: "Income and expenses for a period, and what is left, on the accrual basis.",
		Spec:        mustJSON(profitAndLossSpec()),
		Revision:    1,
		Unpublished: true,
	}
}

// profitAndLossSpec is the statement for a period: the posted lines of the
// income and expense accounts, one row per account by its normal side, in
// five fixed sections with the four computed rows between them. Paths start
// at a journal line.
func profitAndLossSpec() *reports.Spec {
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.journal_lines",
		Params:  plParams(),
		Filter:  plFilter(),
		Columns: plColumns(),
		Groups:  plGroups(),
		Layout:  plLayout(),
		Sort: append(plRecordSort(),
			// Core applies a formula sort key that reads a row's fields to
			// detail rows only, so these two order an opened account's lines
			// and leave the groups alone. The entry's integer sequence, not its
			// text number, which sorts "10" before "9".
			reports.SortKey{Formula: fld("date")},
			reports.SortKey{Formula: fld("entry", "sequence")},
		),
		// An opened line reads "<date> · <entry number> · <memo>", with the
		// entry's memo when the line has none.
		Detail: &reports.Detail{Label: op("concat",
			fld("date"), lit(" · "),
			fld("entry", "number"), lit(" · "),
			op("if", op("isEmpty", fld("memo")), fld("entry", "memo"), fld("memo")),
		)},
		Display: profitAndLossDisplay(),
	}
}

// profitAndLossDisplay keeps the label first to narrow and the figures whole,
// and wraps a row onto the phone layout below the one-line width. The oneLine
// gate is measured (spec §5, phase 3 pass 2): without it core's fit puts the
// three columns on one line at 390 with the label cut to "4000 Service ...",
// so the phone layout never shows; 600px keeps one line to tablet widths and
// up.
func profitAndLossDisplay() *reports.Display {
	return &reports.Display{
		OneLine: &reports.DisplayOneLine{MinWidth: "600px"},
		Columns: plColumnFit(),
		Layouts: profitAndLossLayouts(),
	}
}

// profitAndLossLayouts is the phone layout: the label on its own line, then
// Total and % of income side by side below it.
func profitAndLossLayouts() []reports.DisplayLayout {
	return []reports.DisplayLayout{
		{
			Width:  "mobile",
			Tracks: 2,
			Cells: []reports.DisplayCell{
				{Col: "account", Line: 1, Span: 2},
				{Col: "amount", Line: 2},
				{Col: "pct", Line: 2},
			},
		},
	}
}

// plColumnFit narrows the label first (never below 12 characters) and keeps
// every figure at its full width.
func plColumnFit() map[string]reports.ColumnFit {
	return map[string]reports.ColumnFit{
		"account": {MinWidth: "12ch"},
		"amount":  {MinWidth: "max-content"},
		"pct":     {MinWidth: "max-content"},
	}
}

// profitAndLossByMonthKey names the shipped Profit and Loss by Month for good.
const profitAndLossByMonthKey = "books.profit_and_loss_by_month"

// profitAndLossByMonthShipped is the Profit and Loss by Month Books ships,
// unpublished and shared with every Books reader as the Profit and Loss is.
func profitAndLossByMonthShipped() reports.Shipped {
	return reports.Shipped{
		Key:         profitAndLossByMonthKey,
		Title:       "Profit and Loss by Month",
		Description: "Income and expenses month by month for a period, on the accrual basis.",
		Spec:        mustJSON(profitAndLossByMonthSpec()),
		Revision:    1,
		Unpublished: true,
	}
}

// profitAndLossByMonthSpec is the Profit and Loss with one column per month
// of the period, then Total and % of income over the whole period. A pivot's
// innermost level never opens, so it has no detail label, no line sort keys
// and no column detail.
func profitAndLossByMonthSpec() *reports.Spec {
	columns := plColumns()
	for i := range columns {
		columns[i].Detail = ""
		if columns[i].ID == "amount" {
			// Core refuses a pivot cell column with no aggregate. A summed
			// cell reads 0 in a month with no line, as coalesce does for the
			// Profit and Loss.
			columns[i].Formula = plSigned()
			columns[i].Aggregate = reports.Sum
		}
	}
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.journal_lines",
		Params:  plParams(),
		Filter:  plFilter(),
		Columns: columns,
		Groups:  plGroups(),
		Layout:  plLayout(),
		Sort:    plRecordSort(),
		// Every month the period touches is a column, lines or not; Total
		// follows the months.
		Pivot: &reports.Pivot{
			Path:       path("date"),
			Bucket:     "month",
			Cell:       "amount",
			Range:      "period",
			Order:      reports.PivotOrderSpec,
			MaxColumns: 36,
		},
		Display: profitAndLossByMonthDisplay(),
	}
}

// profitAndLossByMonthDisplay has no layouts: below the one-line width core's
// automatic lines wrap the month figures.
func profitAndLossByMonthDisplay() *reports.Display {
	return &reports.Display{Columns: plColumnFit()}
}

// plFilter keeps the posted lines of the income and expense accounts dated
// in the period.
func plFilter() *reports.Node {
	return op("and",
		op("eq", fld("posted"), lit(true)),
		op("between", fld("date"), prm("period")),
		op("in", fld("account", "type"), lit(profitAndLossTypes())),
	)
}

// plRecordSort orders the accounts inside a section in chart order.
func plRecordSort() []reports.SortKey {
	return []reports.SortKey{
		{Formula: rec("byAccount", "number")},
		{Formula: rec("byAccount", "full_name")},
	}
}

// plSigned is a line's amount by its account's normal side, so normal amounts
// read positive and a contra account reads negative.
func plSigned() *reports.Node {
	return op("if",
		op("in", fld("account", "type"), lit(creditNormalTypes())),
		op("sub", fld("credit"), fld("debit")),
		op("sub", fld("debit"), fld("credit")),
	)
}

func plParams() []reports.ParamDef {
	return []reports.ParamDef{
		{
			ID: "period", Type: reports.ParamDateRange, Label: "Period",
			Default: mustJSON(map[string]string{"preset": "thisFiscalYearToDate"}),
		},
		{
			ID: "rows", Type: reports.ParamChoice, Label: "Rows",
			Options: []reports.Option{
				{Value: "nonzero", Label: "Non-zero"},
				{Value: "active", Label: "Active"},
			},
			Default: mustJSON("nonzero"),
		},
	}
}

func plColumns() []reports.Column {
	scale := 1
	return []reports.Column{
		{ID: "account", Label: "Account", Path: reports.Path{{Link: "account"}}},
		{ID: "amount", Label: "Total", Formula: op("coalesce", op("sum", plSigned()), lit(0))},
		{
			ID: "pct", Label: "% of income", Format: "percent",
			// An opened line shows no percent; only rows of the statement do.
			Detail: reports.DetailBlank,
			// Total Income alone is the denominator, not Other income.
			Formula: &reports.Node{Op: "percentOfSection", Args: []*reports.Node{col("amount")}, Subtotal: "income", Scale: &scale},
		},
		// The section key: the layout places each account by its type.
		{ID: "sec", Hidden: true, Formula: fld("account", "type")},
	}
}

func plGroups() []reports.Group {
	return []reports.Group{
		{ID: "section", Col: "sec", Open: true, Subtotals: true},
		{
			ID:    "byAccount",
			Col:   "account",
			Label: accountLabel(func(n ...string) *reports.Node { return rec("byAccount", n...) }),
			// Active keeps an account with a posted line in the period, also
			// when its lines net to zero.
			Having: op("or", op("eq", prm("rows"), lit("active")), op("ne", col("amount"), lit(0))),
		},
	}
}

func plLayout() []reports.LayoutItem {
	sub := func(id string) *reports.Node { return &reports.Node{Subtotal: id} }
	return []reports.LayoutItem{
		{Section: "income", Title: "Income", Key: mustJSON("income")},
		{Section: "cogs", Title: "Cost of goods sold", Key: mustJSON("cost_of_goods_sold")},
		{Row: "grossProfit", Label: "Gross profit", Formula: op("sub", sub("income"), sub("cogs"))},
		{Section: "expenses", Title: "Expenses", Key: mustJSON("expense")},
		{Row: "netOperatingIncome", Label: "Net operating income", Formula: op("sub", sub("grossProfit"), sub("expenses"))},
		{Section: "otherIncome", Title: "Other income", Key: mustJSON("other_income")},
		{Section: "otherExpenses", Title: "Other expenses", Key: mustJSON("other_expense")},
		{Row: "netOtherIncome", Label: "Net other income", Formula: op("sub", sub("otherIncome"), sub("otherExpenses"))},
		{Row: "netIncome", Label: "Net income", Formula: op("add", sub("netOperatingIncome"), sub("netOtherIncome"))},
	}
}
