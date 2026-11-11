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
		Filter: op("and",
			op("eq", fld("posted"), lit(true)),
			op("between", fld("date"), prm("period")),
			op("in", fld("account", "type"), lit(profitAndLossTypes())),
		),
		Columns: plColumns(),
		Groups:  plGroups(),
		Layout:  plLayout(),
		Sort: []reports.SortKey{
			{Formula: rec("byAccount", "number")},
			{Formula: rec("byAccount", "full_name")},
			// Core applies a formula sort key that reads a row's fields to
			// detail rows only, so these two order an opened account's lines
			// and leave the groups alone. The entry's integer sequence, not its
			// text number, which sorts "10" before "9".
			{Formula: fld("date")},
			{Formula: fld("entry", "sequence")},
		},
		// An opened line reads "<date> · <entry number> · <memo>", with the
		// entry's memo when the line has none.
		Detail: &reports.Detail{Label: op("concat",
			fld("date"), lit(" · "),
			fld("entry", "number"), lit(" · "),
			op("if", op("isEmpty", fld("memo")), fld("entry", "memo"), fld("memo")),
		)},
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
