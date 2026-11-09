package books

import "tinycld.org/core/reports"

// generalLedgerKey names the shipped General Ledger for good.
const generalLedgerKey = "books.general_ledger"

// generalLedgerShipped is the General Ledger Books ships. Like the Trial
// Balance it is unpublished, and Books shares it with every Books reader
// (report_shares.go), because published reports are hidden from guests.
func generalLedgerShipped() reports.Shipped {
	return reports.Shipped{
		Key:         generalLedgerKey,
		Title:       "General Ledger",
		Description: "Every posted line, grouped by account, for a period.",
		Spec:        mustJSON(generalLedgerSpec()),
		Revision:    1,
		Unpublished: true,
	}
}

// generalLedgerSpec is every posted line of a period, one open section per
// account in the chart order. Each section starts with the account's
// beginning balance, runs a balance after each line and ends with its ending
// balance, all by the account's normal side (spec §5). Paths start at a
// journal line.
func generalLedgerSpec() *reports.Spec {
	net := glNet()
	opening := generalLedgerOpening()
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.journal_lines",
		Params: []reports.ParamDef{
			{ID: "period", Type: reports.ParamDateRange, Label: "Period", Default: mustJSON(map[string]string{"preset": "thisMonthToDate"})},
			{
				ID: "rows", Type: reports.ParamChoice, Label: "Rows",
				Options: []reports.Option{
					{Value: "active", Label: "With activity"},
					{Value: "all", Label: "All"},
				},
				Default: mustJSON("active"),
			},
			{
				ID: "accounts", Type: reports.ParamChoice, Label: "Accounts", Multiple: true,
				OptionsFrom: &reports.OptionsFrom{
					Source:     "books.accounts",
					Value:      path("id"),
					Label:      path("full_name"),
					Group:      path("type"),
					GroupLabel: "All {group} accounts",
					GroupOrder: &reports.GroupOrder{By: reports.GroupOrderDeclared},
				},
			},
		},
		Filter: op("and",
			op("eq", fld("posted"), lit(true)),
			op("between", fld("date"), prm("period")),
			op("in", col("account"), prm("accounts")),
		),
		Columns: []reports.Column{
			{ID: "account", Label: "Account / Date", Path: reports.Path{{Link: "account"}}},
			{ID: "type", Label: "Type", Formula: entryTypeLabel(func(n ...string) *reports.Node { return fld(append([]string{"entry"}, n...)...) })},
			{ID: "number", Label: "No.", Formula: fld("entry", "number")},
			{ID: "name", Label: "Name", Formula: op("coalesce", fld("customer", "display_name"), fld("vendor", "display_name"))},
			{ID: "description", Label: "Description", Formula: op("if", op("isEmpty", fld("memo")), fld("entry", "memo"), fld("memo"))},
			{ID: "split", Label: "Split", Formula: splitCase()},
			// A zero side is blank on a line; group and total rows add the side.
			{ID: "debit", Label: "Debit", Formula: blankZero(fld("debit")), Rollup: op("sum", fld("debit"))},
			{ID: "credit", Label: "Credit", Formula: blankZero(fld("credit")), Rollup: op("sum", fld("credit"))},
			{
				ID: "balance", Label: "Balance",
				Formula: byNormal(op("add", opening, op("runningSum", net))),
				// coalesce: a section with no line in the period has no sum,
				// and its ending balance is its beginning balance.
				Rollup: byNormal(op("add", opening, op("coalesce", op("sum", net), lit(0)))),
			},
		},
		Groups: []reports.Group{{
			ID:        "byAccount",
			Col:       "account",
			Open:      true,
			Subtotals: true,
			Label:     accountLabel(func(n ...string) *reports.Node { return rec("byAccount", n...) }),
			Fill:      &reports.Fill{Where: op("in", fld("id"), prm("accounts"))},
			Having: op("or",
				op("gt", op("count", fld("id")), lit(0)),
				op("ne", opening, lit(0)),
				op("and", op("eq", prm("rows"), lit("all")), op("eq", rec("byAccount", "inactive"), lit(false))),
			),
			Opening: &reports.Opening{
				Label: "Beginning balance",
				Cells: map[string]*reports.Node{"balance": byNormal(opening)},
			},
		}},
		Sort: []reports.SortKey{
			{Formula: typeRankCase(rec("byAccount", "type"))},
			{Formula: rec("byAccount", "number")},
			{Formula: rec("byAccount", "full_name")},
			// Formula keys that read a line order the lines inside each
			// section and leave the sections alone.
			{Formula: fld("date")},
			{Formula: fld("entry", "posted_at")},
			{Formula: fld("position")},
		},
		Detail:  &reports.Detail{Label: fld("date")},
		Display: generalLedgerDisplay(),
	}
}

// generalLedgerDisplay tries one line only from 1040 px (below that the nine
// columns cut the text), keeps entry numbers and figures whole, keeps an
// ordinary account name in Split and a customer name in Name whole, and gives
// the description the most of the spare room.
func generalLedgerDisplay() *reports.Display {
	descriptionGrow := 2
	return &reports.Display{
		OneLine: &reports.DisplayOneLine{MinWidth: "1040px"},
		Columns: map[string]reports.ColumnFit{
			// "Journal entry" shows whole; a longer type ends in an ellipsis.
			"type":   {MinWidth: "12ch"},
			"number": {MinWidth: "max-content"},
			// Core shares a line's spare room by what each column lacks of its
			// natural width, so a long description takes the room and the
			// default 8ch floor cuts "Accounts receivable" to "Accounts r…".
			// These floors keep about 20 characters of Split and 16 of Name.
			"name":        {MinWidth: "16ch"},
			"split":       {MinWidth: "20ch"},
			"description": {FlexGrow: &descriptionGrow},
			"debit":       {MinWidth: "max-content"},
			"credit":      {MinWidth: "max-content"},
			"balance":     {MinWidth: "max-content"},
		},
		Layouts: generalLedgerLayouts(),
	}
}

// generalLedgerLayouts are the authored narrow layouts (spec §3 Phone, §5). A
// phone row wraps onto four lines; a tablet row keeps its figures on the
// date's line and its long text on the line below. No. spans two tracks so a
// whole entry number ("JE-41") shows. No desktop layout: core fits the one
// line to the view, and wraps to the tablet layout when it does not fit.
func generalLedgerLayouts() []reports.DisplayLayout {
	return []reports.DisplayLayout{
		{
			Width:  "mobile",
			Tracks: 3,
			Cells: []reports.DisplayCell{
				{Col: "account", Line: 1},
				{Col: "type", Line: 1},
				{Col: "number", Line: 1},
				{Col: "name", Line: 2},
				{Col: "description", Line: 2, Span: 2},
				{Col: "split", Line: 3, Span: 3},
				{Col: "debit", Line: 4},
				{Col: "credit", Line: 4},
				{Col: "balance", Line: 4},
			},
		},
		{
			Width:    "tablet",
			MinWidth: "600px",
			Tracks:   12,
			Cells: []reports.DisplayCell{
				{Col: "account", Line: 1, Span: 2},
				{Col: "type", Line: 1, Span: 2},
				{Col: "number", Line: 1, Span: 2},
				{Col: "debit", Line: 1, Span: 2},
				{Col: "credit", Line: 1, Span: 2},
				{Col: "balance", Line: 1, Span: 2},
				{Col: "name", Line: 2, Span: 3},
				{Col: "description", Line: 2, Span: 5},
				{Col: "split", Line: 2, Span: 4},
			},
		},
	}
}

// generalLedgerOpening is the section's account's net before the period, the
// Trial Balance's rules as of the day before it: a balance-sheet account
// counts every earlier posted line, an income or expense account only the
// lines of the period's fiscal year, and the retained-earnings account adds
// every income and expense line of earlier fiscal years. With All dates the
// period has no first day, no line is before it, and the net is 0.
func generalLedgerOpening() *reports.Node {
	net := glNet()
	from := bound("period", "from")
	pl := lit(profitAndLossTypes())
	own := &reports.Node{
		Op:     "lookup",
		Source: "books.journal_lines",
		Where: op("and",
			op("eq", link("account"), rec("byAccount", "id")),
			op("eq", fld("posted"), lit(true)),
			op("lt", fld("date"), from),
			op("or",
				op("not", op("in", fld("account", "type"), pl)),
				op("gte", op("fiscalYear", fld("date")), op("fiscalYear", from)),
			),
		),
		Value: mustJSON(net),
		Pick:  "sum",
	}
	earlierPL := &reports.Node{
		Op:     "lookup",
		Source: "books.journal_lines",
		Where: op("and",
			op("eq", fld("posted"), lit(true)),
			op("in", fld("account", "type"), pl),
			op("lt", op("fiscalYear", fld("date")), op("fiscalYear", from)),
		),
		Value: mustJSON(net),
		Pick:  "sum",
	}
	return op("add",
		op("coalesce", own, lit(0)),
		op("if",
			op("eq", rec("byAccount", "detail_type"), lit("retained_earnings")),
			op("coalesce", earlierPL, lit(0)),
			lit(0),
		),
	)
}

// glNet is a line's debit less its credit. The balance column and the
// beginning-balance lookups both add it, so they share this one definition.
func glNet() *reports.Node {
	return op("sub", fld("debit"), fld("credit"))
}

// byNormal turns a debit-less-credit amount into the section's account's
// balance by its normal side: a credit-normal account reads credits less
// debits, so a liability's balance reads positive as in the register.
func byNormal(x *reports.Node) *reports.Node {
	return op("if",
		op("in", rec("byAccount", "type"), lit(creditNormalTypes())),
		op("sub", lit(0), x),
		x,
	)
}

// splitCase is the register's Split: the other line's account of a 2-line
// entry, "-Split-" for an entry with more lines.
func splitCase() *reports.Node {
	sameEntry := op("eq", link("entry"), &reports.Node{Outer: reports.Path{{Link: "entry"}}})
	count := &reports.Node{
		Op:     "lookup",
		Source: "books.journal_lines",
		Where:  sameEntry,
		Value:  mustJSON(fld("id")),
		Pick:   "count",
	}
	other := &reports.Node{
		Op:     "lookup",
		Source: "books.journal_lines",
		Where:  op("and", sameEntry, op("ne", fld("id"), outer("id"))),
		Value:  mustJSON(fld("account", "full_name")),
		Pick:   "min",
	}
	return op("case",
		op("eq", count, lit(2)), other,
		op("gt", count, lit(2)), lit("-Split-"),
		lit(nil),
	)
}
