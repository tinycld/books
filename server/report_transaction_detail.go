package books

import "tinycld.org/core/reports"

// transactionDetailKey names the shipped Transaction Detail by Account for
// good. A statement figure opens it (drill-down).
const transactionDetailKey = "books.transaction_detail"

// transactionDetailShipped is Transaction Detail by Account. Like the Trial
// Balance it is unpublished, and Books shares it with every Books reader
// (report_shares.go), because published reports are hidden from guests.
func transactionDetailShipped() reports.Shipped {
	return reports.Shipped{
		Key:         transactionDetailKey,
		Title:       "Transaction Detail by Account",
		Description: "Posted lines of chosen accounts for a period, grouped by account.",
		Spec:        mustJSON(transactionDetailSpec()),
		// 2: the Method param (Accrual or Cash) over books.basis_lines, so a
		// statement's drill keeps its method.
		Revision:    2,
		Unpublished: true,
	}
}

// transactionDetailSpec is the posted lines of the chosen accounts in a
// period (every account when none is chosen), one open section per account
// in the chart order, each line's Amount by its account's normal side, so a
// section's total is the figure a statement shows for that account and
// period and method (spec §5). Paths start at a line of books.basis_lines.
func transactionDetailSpec() *reports.Spec {
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.basis_lines",
		Params: []reports.ParamDef{
			{ID: "period", Type: reports.ParamDateRange, Label: "Period", Default: mustJSON(map[string]string{"preset": "thisMonthToDate"})},
			methodParam(),
			accountsParam(),
		},
		Filter: op("and",
			basisFilter(),
			op("eq", fld("posted"), lit(true)),
			op("between", fld("date"), prm("period")),
			// An unset accounts param drops this term, so no account chosen
			// lists every account.
			op("in", col("account"), prm("accounts")),
		),
		Columns: []reports.Column{
			{ID: "account", Label: "Account / Date", Path: reports.Path{{Link: "account"}}},
			{ID: "type", Label: "Type", Formula: lineEntryTypeLabel()},
			{ID: "number", Label: "No.", Formula: fld("entry", "number")},
			{ID: "name", Label: "Name", Formula: lineName()},
			{ID: "description", Label: "Description", Formula: lineDescriptionFormula()},
			{ID: "split", Label: "Split", Formula: basisSplitCase()},
			{ID: "amount", Label: "Amount", Formula: tdAmount(), Aggregate: reports.Sum},
		},
		Groups: []reports.Group{{
			ID:        "byAccount",
			Col:       "account",
			Open:      true,
			Subtotals: true,
			Label:     accountLabel(func(n ...string) *reports.Node { return rec("byAccount", n...) }),
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
		Detail:  &reports.Detail{Label: fld("date"), Open: entryOpenPath()},
		Display: transactionDetailDisplay(),
	}
}

// basisSplitCase is the General Ledger's split (splitCase) over
// books.basis_lines: the other line of a two-line entry, "-Split-" for more.
// It counts the rows of the line's own entry and layer, so a ledger line
// reads its entry's lines and a cash row the cash rows of the same entry (a
// payment's share reads its Accounts payable or receivable row).
func basisSplitCase() *reports.Node {
	same := op("and",
		op("eq", link("entry"), &reports.Node{Outer: reports.Path{{Link: "entry"}}}),
		op("eq", fld("layer"), outer("layer")),
	)
	count := &reports.Node{
		Op:     "lookup",
		Source: "books.basis_lines",
		Where:  same,
		Value:  mustJSON(fld("id")),
		Pick:   "count",
	}
	other := &reports.Node{
		Op:     "lookup",
		Source: "books.basis_lines",
		Where:  op("and", same, op("ne", fld("id"), outer("id"))),
		Value:  mustJSON(fld("account", "full_name")),
		Pick:   "min",
	}
	return op("case",
		op("eq", count, lit(2)), other,
		op("gt", count, lit(2)), lit("-Split-"),
		lit(nil),
	)
}

// tdAmount is a line by its account's normal side: credits less debits on a
// credit-normal account, debits less credits otherwise, so an expense reads
// positive and a refund to it negative.
func tdAmount() *reports.Node {
	return op("if",
		op("in", fld("account", "type"), lit(creditNormalTypes())),
		op("sub", fld("credit"), fld("debit")),
		op("sub", fld("debit"), fld("credit")),
	)
}

// transactionDetailDisplay is the fixture's TRANSACTION_DETAIL_DISPLAY
// (tinycld/books/lib/report-drill-down-fixture.ts): the General Ledger's fit
// for the shared columns, Amount kept whole, and one line tried only from a
// 960 px row (measured on the report route at 1280 and 1024, spec D3).
func transactionDetailDisplay() *reports.Display {
	descriptionGrow := 2
	return &reports.Display{
		OneLine: &reports.DisplayOneLine{MinWidth: "960px"},
		Columns: map[string]reports.ColumnFit{
			"type":        {MinWidth: "12ch"},
			"number":      {MinWidth: "max-content"},
			"name":        {MinWidth: "16ch"},
			"split":       {MinWidth: "20ch"},
			"description": {FlexGrow: &descriptionGrow},
			"amount":      {MinWidth: "max-content"},
		},
		Layouts: transactionDetailLayouts(),
	}
}

// transactionDetailLayouts are the narrow layouts (spec §3): a phone row (and
// a row of the 480 px drill panel) wraps onto date · type · number, then name
// and description, then split and amount; a tablet row keeps Amount on the
// date's line and its text on the line below.
func transactionDetailLayouts() []reports.DisplayLayout {
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
				{Col: "split", Line: 3, Span: 2},
				{Col: "amount", Line: 3},
			},
		},
		{
			Width:    "tablet",
			MinWidth: "600px",
			Tracks:   12,
			Cells: []reports.DisplayCell{
				{Col: "account", Line: 1, Span: 3},
				{Col: "type", Line: 1, Span: 3},
				{Col: "number", Line: 1, Span: 2},
				{Col: "amount", Line: 1, Span: 4},
				{Col: "name", Line: 2, Span: 3},
				{Col: "description", Line: 2, Span: 5},
				{Col: "split", Line: 2, Span: 4},
			},
		},
	}
}
