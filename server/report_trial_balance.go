package books

import "tinycld.org/core/reports"

// trialBalanceKey names the shipped Trial Balance for good.
const trialBalanceKey = "books.trial_balance"

// trialBalanceShipped is the Trial Balance Books ships. It is unpublished:
// published reports are hidden from guests, and Books bookkeepers are guests,
// so Books shares it with every Books reader instead.
func trialBalanceShipped() reports.Shipped {
	return reports.Shipped{
		Key:         trialBalanceKey,
		Title:       "Trial Balance",
		Description: "Each account's balance on one day, as a debit or a credit.",
		Spec:        mustJSON(trialBalanceSpec()),
		Revision:    1,
		Unpublished: true,
	}
}

// trialBalanceSpec is one row per account: its net of the posted lines on or
// before the as-of day, by sign in Debit or Credit, in the chart order. Income
// and expense lines of earlier fiscal years count on the retained-earnings
// account. Paths start at a journal line.
func trialBalanceSpec() *reports.Spec {
	net := op("sub", fld("debit"), fld("credit"))
	priorPL := op("and",
		op("in", fld("account", "type"), lit(profitAndLossTypes())),
		op("lt", op("fiscalYear", fld("date")), op("fiscalYear", prm("asOf"))),
	)
	reAccount := &reports.Node{
		Op:     "lookup",
		Source: "books.accounts",
		Where:  op("eq", fld("detail_type"), lit("retained_earnings")),
		Value:  mustJSON(fld("id")),
		Pick:   "min",
	}
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.journal_lines",
		Params: []reports.ParamDef{
			{ID: "asOf", Type: reports.ParamAsOf, Label: "As of", Default: mustJSON(map[string]string{"preset": "endOfLastMonth"})},
			{
				ID: "rows", Type: reports.ParamChoice, Label: "Rows",
				Options: []reports.Option{
					{Value: "nonzero", Label: "Non-zero"},
					{Value: "active", Label: "Active"},
					{Value: "all", Label: "All"},
				},
				Default: mustJSON("nonzero"),
			},
			{
				ID: "accounts", Type: reports.ParamChoice, Label: "Accounts", Multiple: true,
				OptionsFrom: &reports.OptionsFrom{
					Source:     "books.accounts",
					Value:      path("id"),
					Label:      path("full_name"),
					Group:      path("type"),
					GroupLabel: "All {group} accounts",
					// Chart order (the type select's declared order), not
					// alphabetical, so the picker reads like the chart.
					GroupOrder: &reports.GroupOrder{By: reports.GroupOrderDeclared},
				},
			},
		},
		Filter: op("and",
			op("eq", fld("posted"), lit(true)),
			op("lte", fld("date"), prm("asOf")),
			op("in", col("account"), prm("accounts")),
		),
		Columns: []reports.Column{
			{ID: "account", Label: "Account", Formula: op("if", priorPL, reAccount, link("account"))},
			// An opened line would repeat its account's number; leave it blank.
			{ID: "number", Label: "No.", Formula: rec("byAccount", "number"), Detail: reports.DetailBlank},
			{
				ID: "debit", Label: "Debit", Total: reports.TotalRows,
				Formula: op("if",
					op("eq", op("count", fld("id")), lit(0)),
					lit(nil),
					op("if", op("gte", op("sum", net), lit(0)), op("sum", net), lit(nil)),
				),
			},
			{
				ID: "credit", Label: "Credit", Total: reports.TotalRows,
				Formula: op("if", op("lt", op("sum", net), lit(0)), op("sub", lit(0), op("sum", net)), lit(nil)),
			},
		},
		Groups: []reports.Group{{
			ID:    "byAccount",
			Col:   "account",
			Label: rec("byAccount", "full_name"),
			Fill: &reports.Fill{Where: op("and",
				op("eq", fld("inactive"), lit(false)),
				op("in", fld("id"), prm("accounts")),
			)},
			Having: op("or",
				op("eq", prm("rows"), lit("all")),
				op("and", op("eq", prm("rows"), lit("active")), op("gt", op("count", fld("id")), lit(0))),
				op("ne", op("sum", net), lit(0)),
			),
		}},
		Sort: []reports.SortKey{
			{Formula: typeRankCase(rec("byAccount", "type"))},
			{Col: "number"},
			{Formula: rec("byAccount", "full_name")},
			// Core applies a formula sort key that reads a row's fields to
			// detail rows only, so these two order the opened lines and leave
			// the groups alone. The entry's integer sequence, not its text
			// number, which sorts "10" before "9".
			{Formula: fld("date")},
			{Formula: fld("entry", "sequence")},
		},
		Detail: &reports.Detail{Label: op("concat",
			fld("date"), lit(" · "),
			fld("entry", "number"), lit(" · "),
			op("if", op("isEmpty", fld("memo")), fld("entry", "memo"), fld("memo")),
		)},
		// A long account name wraps onto up to three lines on a phone rather
		// than losing its end to an ellipsis (column-fit decision 3; three
		// lines fit "Software Subscriptions:Design Tools" at 390 px).
		Display: &reports.Display{Columns: map[string]reports.ColumnFit{
			"account": {MinWidth: "5ch", WhiteSpace: "normal", LineClamp: 3},
			"number":  {MinWidth: "max-content"},
			"debit":   {MinWidth: "max-content"},
			"credit":  {MinWidth: "max-content"},
		}},
	}
}
