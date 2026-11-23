package books

import "tinycld.org/core/reports"

// reconciliationReportKey names the shipped Reconciliation Report for good; the
// client's shipped-reports.ts holds the same key.
const reconciliationReportKey = "books.reconciliation_report"

// reconciliationReportShipped is the Reconciliation Report (reconciliation
// report spec §3 "The Reconciliation Report"). Like every Books shipped report
// it is unpublished, and Books shares it with every Books reader
// (report_shares.go).
func reconciliationReportShipped() reports.Shipped {
	return reports.Shipped{
		Key:         reconciliationReportKey,
		Title:       "Reconciliation Report",
		Description: "Each finished reconciliation of a bank or credit card account: its beginning balance, the transactions it cleared, and its statement ending balance.",
		Spec:        mustJSON(reconciliationReportSpec()),
		// 1: the first shipped spec. The report is unreleased, so later
		// checkpoints keep 1 (core re-stores a spec only on a higher revision).
		Revision:    1,
		Unpublished: true,
		// It reads the cleared rows of finished reconciliations, about a
		// month of one account's lines for each statement.
		Live: true,
	}
}

// reconciliationReportSpec is one open section for each finished
// reconciliation, by account number, then statement date, newest first. The
// section row names the account and who reconciled it, with the statement
// date and the finish time in columns only section rows fill; under it the
// opening row "Beginning balance", one row for each cleared line in date then
// posting order with a running balance in the account's own sense, and the
// section total, whose Balance is the statement ending balance. A
// reconciliation that cleared no line keeps its section (Fill). The Total adds
// Debit and Credit only. Paths start at a reconciled line.
func reconciliationReportSpec() *reports.Spec {
	opening := reconciliationBeginning()
	net := reconciledNet()
	finished := op("eq", fld("status"), lit("finished"))
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.reconciled_lines",
		Params: []reports.ParamDef{
			{
				ID: "accounts", Type: reports.ParamChoice, Label: "Account", Multiple: true,
				OptionsFrom: &reports.OptionsFrom{
					Source: "books.accounts",
					Value:  path("id"),
					// Spec §3 names and orders the accounts by number; an
					// account with no number comes last, by its full name.
					LabelFormula: accountLabel(fld),
					Order:        path("number"),
					Where:        op("in", fld("type"), lit([]string{"bank", "credit_card"})),
				},
			},
			{
				ID: "statement", Type: reports.ParamChoice, Label: "Statement",
				OptionsFrom: &reports.OptionsFrom{
					Source: "books.reconciliations",
					Value:  path("id"),
					Label:  path("statement_date"),
					Group:  path("account", "full_name"),
					// Spec §3 orders accounts by number, not by name.
					GroupOrder: &reports.GroupOrder{By: reports.GroupOrderPath, Path: path("account", "number")},
					Where:      finished,
				},
			},
		},
		// An unset param matches every row.
		Filter: op("and",
			op("in", link("account"), prm("accounts")),
			op("eq", link("reconciliation"), prm("statement")),
		),
		Columns: []reports.Column{
			{ID: "date", Label: "Date", Formula: fld("date")},
			{ID: "transaction", Label: "Transaction", Formula: statementActivity()},
			{ID: "payee", Label: "Payee", Formula: fld("payee")},
			{ID: "memo", Label: "Memo", Formula: fld("memo")},
			// Read from the section's reconciliation, on its row only.
			{ID: "statement", Label: "Statement ending", Formula: rec("byStatement", "statement_date"), Detail: reports.DetailBlank},
			{ID: "reconciled", Label: "Reconciled on", Formula: rec("byStatement", "finished_at"), Detail: reports.DetailBlank},
			// A zero side is blank on a line; section and total rows add the side.
			{ID: "debit", Label: "Debit", Formula: blankZero(fld("debit")), Rollup: op("sum", fld("debit"))},
			{ID: "credit", Label: "Credit", Formula: blankZero(fld("credit")), Rollup: op("sum", fld("credit"))},
			{
				ID: "balance", Label: "Balance",
				Formula: op("add", opening, op("runningSum", net)),
				// coalesce: a section with no cleared line has no sum, and its
				// ending balance is its beginning balance.
				Rollup: op("add", opening, op("coalesce", op("sum", net), lit(0))),
			},
			{ID: "reconciliation", Label: "Reconciliation", Hidden: true, Path: reports.Path{{Link: "reconciliation"}}},
		},
		Groups: []reports.Group{{
			ID:        "byStatement",
			Col:       "reconciliation",
			Open:      true,
			Subtotals: true,
			// Read from the reconciliation's account, not the lines, so a
			// section with no cleared line is labelled too.
			Label: op("concat",
				accountLabel(func(n ...string) *reports.Node { return rec("byStatement", append([]string{"account"}, n...)...) }),
				lit(" · reconciled by "),
				rec("byStatement", "finished_by_name"),
			),
			// The finished reconciliations the two params admit.
			Fill: &reports.Fill{Where: op("and",
				finished,
				op("in", link("account"), prm("accounts")),
				op("eq", fld("id"), prm("statement")),
			)},
			Opening: &reports.Opening{
				Label: "Beginning balance",
				Cells: map[string]*reports.Node{"balance": opening},
			},
		}},
		Sort: []reports.SortKey{
			{Formula: rec("byStatement", "account", "number")},
			{Formula: rec("byStatement", "statement_date"), Dir: "desc"},
			// Formula keys that read a line order the lines inside each
			// section and leave the sections alone.
			{Formula: fld("date")},
			{Formula: fld("entry", "posted_at")},
			{Formula: fld("position")},
		},
		Detail:  &reports.Detail{Label: fld("date"), Open: entryOpenPath()},
		Display: reconciliationReportDisplay(),
	}
}

// reconciliationBeginning is the section's beginning balance, looked up on its
// reconciliation. Not rec("byStatement", "beginning_balance"): core gives a
// group record's amount the record's own currency, which never combines with
// the lines' amounts, while a looked-up row's amount carries its currency
// field, which books.reconciliations declares the same as the lines'
// (SameCurrencyAs). On the Total, outside every section, it has no value, so
// the Total has no Balance: a sum of the balances of several statements means
// nothing.
func reconciliationBeginning() *reports.Node {
	return &reports.Node{
		Op:     "lookup",
		Source: "books.reconciliations",
		Where:  op("eq", fld("id"), rec("byStatement", "id")),
		Value:  mustJSON(fld("beginning_balance")),
		Pick:   "min",
	}
}

// reconciledNet is what a line adds to its account's balance in the account's
// own sense: debit − credit on a bank account, credit − debit on a credit card
// (a charge raises the amount owed).
func reconciledNet() *reports.Node {
	return op("if",
		op("eq", fld("account", "type"), lit("credit_card")),
		op("sub", fld("credit"), fld("debit")),
		op("sub", fld("debit"), fld("credit")),
	)
}

// reconciliationReportDisplay is the fixture's RECONCILIATION_REPORT_DISPLAY
// (reconciliation-report-fixture.ts): the nine columns on one line where the
// rows are 1360 px wide or wider, payee and memo wrapping to two lines, no
// figure cut. Narrower rows take the tablet arrangement (rows of 600 px and
// wider) or the phone one. Each arrangement puts the section columns on a line
// the cleared rows use, so no cleared row has an empty line; the phone shows
// no Reconciled on (the section label names who reconciled).
func reconciliationReportDisplay() *reports.Display {
	figure := reports.ColumnFit{MinWidth: "max-content"}
	wrap := reports.ColumnFit{WhiteSpace: "normal", LineClamp: 2}
	return &reports.Display{
		OneLine: &reports.DisplayOneLine{MinWidth: "1360px"},
		Columns: map[string]reports.ColumnFit{
			"payee":   wrap,
			"memo":    wrap,
			"debit":   figure,
			"credit":  figure,
			"balance": figure,
		},
		Layouts: []reports.DisplayLayout{
			{
				Width: "mobile", Tracks: 12,
				Cells: []reports.DisplayCell{
					{Col: "date", Line: 1, Span: 4},
					{Col: "transaction", Line: 1, Span: 8},
					{Col: "payee", Line: 2, Span: 7},
					{Col: "statement", Line: 2, Span: 5},
					{Col: "memo", Line: 3, Span: 12},
					{Col: "debit", Line: 4, Span: 4},
					{Col: "credit", Line: 4, Span: 4},
					{Col: "balance", Line: 4, Span: 4},
				},
			},
			{
				Width: "tablet", MinWidth: "600px", Tracks: 12,
				Cells: []reports.DisplayCell{
					{Col: "date", Line: 1, Span: 2},
					{Col: "transaction", Line: 1, Span: 4},
					{Col: "debit", Line: 1, Span: 2},
					{Col: "credit", Line: 1, Span: 2},
					{Col: "balance", Line: 1, Span: 2},
					{Col: "payee", Line: 2, Span: 3},
					{Col: "memo", Line: 2, Span: 3},
					{Col: "statement", Line: 2, Span: 3},
					{Col: "reconciled", Line: 2, Span: 3},
				},
			},
		},
	}
}
