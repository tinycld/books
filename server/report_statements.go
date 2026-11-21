package books

import "tinycld.org/core/reports"

// The two shipped customer statement reports (statements spec §3.1, §4.3).
// Their keys name them for good; the client's shipped-reports.ts holds the
// same two keys.
const (
	statementBalanceForwardKey = "books.statement_balance_forward"
	statementOpenItemsKey      = "books.statement_open_items"
)

// statementBalanceForwardShipped is the Balance forward statement report. Like
// every Books shipped report it is unpublished, and Books shares it with every
// Books reader (report_shares.go).
func statementBalanceForwardShipped() reports.Shipped {
	return reports.Shipped{
		Key:         statementBalanceForwardKey,
		Title:       "Statement: Balance Forward",
		Description: "Each customer's balance before a period, its Accounts receivable activity in the period, and the amount due at the end.",
		Spec:        mustJSON(statementBalanceForwardSpec()),
		// 1: the first shipped spec. The report is unreleased, so later
		// checkpoints keep 1 (core re-stores a spec only on a higher revision).
		Revision:    1,
		Unpublished: true,
	}
}

// statementOpenItemsShipped is the Open items statement report, unpublished
// and shared as statementBalanceForwardShipped.
func statementOpenItemsShipped() reports.Shipped {
	return reports.Shipped{
		Key:         statementOpenItemsKey,
		Title:       "Statement: Open Items",
		Description: "Each customer's open items on one day, by due date, with the amount due and its aging.",
		Spec:        mustJSON(statementOpenItemsSpec()),
		// 1: as statementBalanceForwardShipped.
		Revision:    1,
		Unpublished: true,
	}
}

// statementBalanceForwardSpec is one open section per picked customer: the
// opening row "Balance forward" (the customer's net before the period), the
// customer's posted Accounts receivable lines in the period in date then
// posting order with each line's amount (debit − credit) and the running
// balance, and the section's balance on the end day, which is the customer's
// Customer Balance figure for that day. A section has the customer's own lines
// only: a sub-customer's lines name the sub-customer. A customer with an
// opening balance and no line keeps its section, as a General Ledger account
// does. Paths start at a journal line.
func statementBalanceForwardSpec() *reports.Spec {
	net := cbNet()
	opening := statementOpening()
	group := customerFamilyGroups()[1]
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.journal_lines",
		Params: []reports.ParamDef{
			{ID: "period", Type: reports.ParamDateRange, Label: "Period", Default: mustJSON(map[string]string{"preset": "thisMonthToDate"})},
			customersParam(),
		},
		Filter: op("and", append(receivableLines(nil)[:2],
			op("between", fld("date"), prm("period")),
			op("in", col("customerKey"), prm("customers")),
		)...),
		Columns: []reports.Column{
			{ID: "date", Label: "Date", Formula: fld("date")},
			{ID: "activity", Label: "Activity", Formula: statementActivity()},
			{ID: "amount", Label: "Amount", Formula: net, Rollup: op("sum", net)},
			{
				ID: "balance", Label: "Balance",
				Formula: op("add", opening, op("runningSum", net)),
				// coalesce: a section with no line in the period has no sum,
				// and its balance is its opening.
				Rollup: op("add", opening, op("coalesce", op("sum", net), lit(0))),
			},
			{ID: "customerKey", Label: "Customer key", Hidden: true, Path: reports.Path{{Link: "customer"}}},
		},
		Groups: []reports.Group{{
			ID:        "byCustomer",
			Col:       "customerKey",
			Open:      true,
			Subtotals: true,
			Label:     group.Label,
			Muted:     group.Muted,
			Fill:      &reports.Fill{Where: op("in", fld("id"), prm("customers"))},
			Having: op("or",
				op("gt", op("count", fld("id")), lit(0)),
				op("ne", opening, lit(0)),
			),
			Opening: &reports.Opening{
				Label: "Balance forward",
				Cells: map[string]*reports.Node{"balance": opening},
			},
		}},
		Sort: []reports.SortKey{
			{Formula: op("lower", rec("byCustomer", "display_name"))},
			// Formula keys that read a line order the lines inside each
			// section and leave the sections alone.
			{Formula: fld("date")},
			{Formula: fld("entry", "posted_at")},
			{Formula: fld("position")},
		},
		Detail:  &reports.Detail{Label: fld("date"), Open: entryOpenPath()},
		Display: statementBalanceForwardDisplay(),
	}
}

// statementActivity is a line's entry type label and its entry's number
// ("Invoice 1042"). A reversal's label already ends "of <reversed number>"
// (entryTypeLabel), so a reversal shows its label alone.
func statementActivity() *reports.Node {
	label := lineEntryTypeLabel()
	return op("if",
		op("in", fld("entry", "origin"), lit(entryTypeLabels.ReversalOrigins)),
		label,
		op("concat", label, lit(" "), fld("entry", "number")),
	)
}

// statementOpening is the section's customer's net before the period: the sum
// of debit − credit of its posted Accounts receivable lines dated before the
// period's first day, 0 when it has none. With All dates no line is before
// the period, and the net is 0.
func statementOpening() *reports.Node {
	before := &reports.Node{
		Op:     "lookup",
		Source: "books.journal_lines",
		Where: op("and",
			op("eq", link("customer"), rec("byCustomer", "id")),
			op("eq", fld("posted"), lit(true)),
			op("eq", fld("account", "type"), lit("accounts_receivable")),
			op("lt", fld("date"), bound("period", "from")),
		),
		Value: mustJSON(cbNet()),
		Pick:  "sum",
	}
	return op("coalesce", before, lit(0))
}

// statementBalanceForwardDisplay keeps the figures whole. On a phone a row
// has the date and the activity on its first line, and the amount and the
// balance under the activity on its second.
func statementBalanceForwardDisplay() *reports.Display {
	figure := reports.ColumnFit{MinWidth: "max-content"}
	return &reports.Display{
		Columns: map[string]reports.ColumnFit{
			"amount":  figure,
			"balance": figure,
		},
		Layouts: []reports.DisplayLayout{{
			Width: "mobile", Tracks: 3,
			Cells: []reports.DisplayCell{
				{Col: "date", Line: 1},
				{Col: "activity", Line: 1, Span: 2},
				{Col: "amount", Line: 2, Start: 2},
				{Col: "balance", Line: 2, Start: 3},
			},
		}},
	}
}

// statementOpenItemsSpec is the A/R Aging of the picked customers on the
// statement date with each customer's open items under it: one row for each
// item with an open amount on the day, labelled "<kind> <number>", with its
// first day, its due date, its age cells and its open amount as Total, in due
// date then item number order. The customer row adds them: its Total is the
// amount due, the customer's A/R Aging figure for the day, and its age cells
// are the aging line. A sub-customer is a customer row of its own. Paths start
// at a receivable item row.
func statementOpenItemsSpec() *reports.Spec {
	ar := arAgingSpec()
	byCustomer := customerFamilyGroups()[1]
	byCustomer.HideEmpty = true
	byCustomer.Open = true
	columns := []reports.Column{
		{ID: "name", Label: "Customer", Path: reports.Path{{Link: "customer"}}},
		{ID: "date", Label: "Date", Formula: op("min", fld("date")), BlankAbove: "byItem", Detail: "blank"},
		{ID: "due", Label: "Due date", Formula: op("min", fld("due_date")), BlankAbove: "byItem", Detail: "blank"},
	}
	columns = append(columns, agingColumns(arAge(), arNet())...)
	columns = append(columns,
		reports.Column{ID: "customerKey", Label: "Customer key", Hidden: true, Path: reports.Path{{Link: "customer"}}},
		reports.Column{ID: "itemKey", Label: "Item", Hidden: true, Path: reports.Path{{Field: "item"}}},
		reports.Column{ID: "itemNo", Label: "Item number", Hidden: true, Formula: op("min", fld("item_seq")), BlankAbove: "byItem", Detail: "blank"},
	)
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.receivable_items",
		Params: []reports.ParamDef{
			{ID: "asOf", Type: reports.ParamAsOf, Label: "As of", Default: mustJSON(map[string]string{"preset": "today"})},
			customersParam(),
		},
		Filter:  ar.Filter,
		Columns: columns,
		Groups: []reports.Group{
			byCustomer,
			{
				ID: "byItem", Col: "itemKey",
				Label:  op("concat", itemKindLabel(receivableItemsSource()), lit(" "), op("min", fld("item_number"))),
				Having: op("ne", op("sum", arNet()), lit(0)),
			},
		},
		Sort: []reports.SortKey{
			{Formula: op("lower", rec("byCustomer", "display_name"))},
			// Core skips a key that reads a column blank above its level (due
			// and itemNo are blank above byItem) and a key that reads a row
			// value on a group level, so the item order applies to the items
			// and the line order to the opened lines.
			{Formula: col("due")},
			{Formula: col("itemNo")},
			{Formula: fld("date")},
			{Formula: fld("entry", "posted_at")},
		},
		Detail:  ar.Detail,
		Display: statementOpenItemsDisplay(),
	}
}

// statementOpenItemsDisplay is arDisplay's column fits with the date kept
// whole, on one line from 1040 px (the A/R Aging's 940 px and the date
// column). On a phone the customer or item and its Total are on the first
// line, the date and the due date on the second (an item row's only), and the
// age cells in arDisplay's order on the lines under them.
func statementOpenItemsDisplay() *reports.Display {
	figure := reports.ColumnFit{MinWidth: "max-content"}
	columns := map[string]reports.ColumnFit{"date": figure}
	for id, fit := range arDisplay().Columns {
		columns[id] = fit
	}
	return &reports.Display{
		OneLine: &reports.DisplayOneLine{MinWidth: "1040px"},
		Columns: columns,
		Layouts: []reports.DisplayLayout{{
			Width: "mobile", Tracks: 3,
			Cells: []reports.DisplayCell{
				{Col: "name", Line: 1, Span: 2},
				{Col: "total", Line: 1, Start: 3},
				{Col: "date", Line: 2, Start: 1},
				{Col: "due", Line: 2, Start: 2},
				{Col: "current", Line: 3, Start: 1},
				{Col: "d30", Line: 3, Start: 2},
				{Col: "d60", Line: 4},
				{Col: "d90", Line: 4},
				{Col: "d91", Line: 4},
			},
		}},
	}
}
