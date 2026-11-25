package books

import "tinycld.org/core/reports"

// trialBalanceKey names the shipped Trial Balance for good.
const trialBalanceKey = "books.trial_balance"

// trialBalanceBeforeLabel is the first row under an opened account: its
// balance at the start of the as-of day's month. Core puts the month in place
// of the token, in the reader's words ("Balance before Nov 2026").
const trialBalanceBeforeLabel = "Balance before " + reports.LabelValueToken

// trialBalanceShipped is the Trial Balance Books ships. It is unpublished:
// published reports are hidden from guests, and Books bookkeepers are guests,
// so Books shares it with every Books reader instead.
func trialBalanceShipped() reports.Shipped {
	return reports.Shipped{
		Key:         trialBalanceKey,
		Title:       "Trial Balance",
		Description: "Each account's balance on one day, as a debit or a credit.",
		Spec:        mustJSON(trialBalanceSpec()),
		// 2: opened lines open the transaction that posted them (detail.open),
		// and an account's Debit or Credit opens Transaction Detail by Account
		// (drill).
		// 3: the months before the as-of day's month are read from the stored
		// months; an opened account shows them as one row.
		Revision:    4,
		Unpublished: true,
	}
}

// trialBalanceDrill opens Transaction Detail by Account from an account row's
// Debit or Credit: its posted lines from its first one (an income or expense
// account's first in the as-of day's fiscal year) up to the as-of day, so the
// section total is the figure by the account's normal side. sign is the
// comparison ("gte" for Debit, "lt" for Credit) the column's own rollup puts
// on the net to choose its side: core writes a cell's drill whatever the cell
// shows, so the side that draws no figure gets no accounts and opens nothing.
// The retained-earnings row adds earlier years' income and expense of other
// accounts, so it opens nothing.
func trialBalanceDrill(sign string) *reports.Drill {
	asOf := prm("asOf")
	from := op("if",
		op("in", rec("byAccount", "type"), lit(profitAndLossTypes())),
		firstLineFY(asOf),
		firstLine(asOf),
	)
	return tdDrillTarget(map[string]map[string]reports.DrillValue{
		"byAccount": {
			"period": {Range: &reports.DrillRange{From: from, To: asOf}},
			"accounts": {Formula: op("if",
				op("eq", rec("byAccount", "detail_type"), lit("retained_earnings")),
				lit(nil),
				op("if", op(sign, trialBalanceNet(), lit(0)), tdAccount(), lit(nil)),
			)},
		},
	}, nil)
}

// tbStoredWhere picks the stored months of the row's account that count in its
// balance and end before the as-of day's month: every month of a balance-sheet
// account, and of an income or expense account the months of the as-of day's
// fiscal year. A fiscal year starts on the first day of a month, so every day
// of a month is in the fiscal year of the month's first day.
func tbStoredWhere() []*reports.Node {
	asOf := prm("asOf")
	return []*reports.Node{
		op("eq", link("account"), rec("byAccount", "id")),
		op("lt", fld("month_start"), op("startOfMonth", asOf)),
		op("or",
			op("not", op("in", fld("account", "type"), lit(profitAndLossTypes()))),
			op("gte", op("fiscalYear", fld("month_start")), op("fiscalYear", asOf)),
		),
	}
}

// tbEarlierPLWhere picks the stored income and expense months of the fiscal
// years before the as-of day's: they count on the retained-earnings account.
func tbEarlierPLWhere() []*reports.Node {
	return []*reports.Node{
		op("in", fld("account", "type"), lit(profitAndLossTypes())),
		op("lt", op("fiscalYear", fld("month_start")), op("fiscalYear", prm("asOf"))),
	}
}

// onRetainedEarnings is x on the retained-earnings account's row, 0 on every
// other row.
func onRetainedEarnings(x *reports.Node) *reports.Node {
	return op("if", op("eq", rec("byAccount", "detail_type"), lit("retained_earnings")), x, lit(0))
}

// trialBalanceBefore is the row's account's net at the start of the as-of
// day's month, from the stored months (books_account_balances) alone, so its
// cost does not grow with the account's history.
func trialBalanceBefore() *reports.Node {
	return op("add",
		glSum("books.account_balances", glStoredNet(), tbStoredWhere()...),
		onRetainedEarnings(glSum("books.account_balances", glStoredNet(), tbEarlierPLWhere()...)),
	)
}

// trialBalanceNet is the row's account's net on the as-of day: the stored
// months before the day's month and the posted lines of that month up to the
// day, which are the report's own rows.
func trialBalanceNet() *reports.Node {
	return op("add", trialBalanceBefore(), op("coalesce", op("sum", glNet()), lit(0)))
}

// tbStoredCount counts the stored months that pass where, 0 when none does.
func tbStoredCount(where ...*reports.Node) *reports.Node {
	return op("coalesce", &reports.Node{
		Op:     "lookup",
		Source: "books.account_balances",
		Where:  op("and", where...),
		Value:  mustJSON(fld("id")),
		Pick:   "count",
	}, lit(0))
}

// trialBalanceActivity is above 0 when the row's figure adds a posted line: a
// stored month exists only for a month with a posted line.
func trialBalanceActivity() *reports.Node {
	return op("add",
		op("add", tbStoredCount(tbStoredWhere()...), op("count", fld("id"))),
		onRetainedEarnings(tbStoredCount(tbEarlierPLWhere()...)),
	)
}

// debitSide is x when it is 0 or more; creditSide is x as a positive amount
// when it is below 0. Each is blank on the other side.
func debitSide(x *reports.Node) *reports.Node {
	return op("if", op("gte", x, lit(0)), x, lit(nil))
}

func creditSide(x *reports.Node) *reports.Node {
	return op("if", op("lt", x, lit(0)), op("sub", lit(0), x), lit(nil))
}

// trialBalanceSpec is one row per account: its net of the posted lines on or
// before the as-of day, by sign in Debit or Credit, in the chart order. Income
// and expense of earlier fiscal years count on the retained-earnings account.
// The report's rows are the posted lines of the as-of day's month only; the
// months before it come from the stored months. Paths start at a journal line.
func trialBalanceSpec() *reports.Spec {
	asOf := prm("asOf")
	net := trialBalanceNet()
	before := trialBalanceBefore()
	activity := trialBalanceActivity()
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
			accountsParam(),
		},
		Filter: op("and",
			op("eq", fld("posted"), lit(true)),
			op("gte", fld("date"), op("startOfMonth", asOf)),
			op("lte", fld("date"), asOf),
			op("in", col("account"), prm("accounts")),
		),
		Columns: []reports.Column{
			{ID: "account", Label: "Account", Path: reports.Path{{Link: "account"}}},
			// An opened line would repeat its account's number; leave it blank.
			{ID: "number", Label: "No.", Formula: rec("byAccount", "number"), Detail: reports.DetailBlank},
			// A line shows its own amount. The account's row shows the rollup,
			// and the Total adds the account rows shown. The stored months stay
			// out of Formula: core refuses a rows total over a looked-up amount.
			{
				ID: "debit", Label: "Debit", Total: reports.TotalRows,
				Formula: debitSide(glNet()),
				// An account with no posted line shows no amount.
				Rollup: op("if", op("eq", activity, lit(0)), lit(nil), debitSide(net)),
				Drill:  trialBalanceDrill("gte"),
			},
			{
				ID: "credit", Label: "Credit", Total: reports.TotalRows,
				Formula: creditSide(glNet()),
				Rollup:  creditSide(net),
				Drill:   trialBalanceDrill("lt"),
			},
		},
		Groups: []reports.Group{{
			ID:    "byAccount",
			Col:   "account",
			Label: rec("byAccount", "full_name"),
			// Every account may get a row: one with stored months and no line
			// in the as-of day's month has no row of its own to start from.
			Fill: &reports.Fill{Where: op("in", fld("id"), prm("accounts"))},
			Having: op("or",
				op("and",
					op("eq", prm("rows"), lit("all")),
					op("or", op("eq", rec("byAccount", "inactive"), lit(false)), op("gt", activity, lit(0))),
				),
				op("and", op("eq", prm("rows"), lit("active")), op("gt", activity, lit(0))),
				op("ne", net, lit(0)),
			),
			Opening: &reports.Opening{
				Label:       trialBalanceBeforeLabel,
				LabelValue:  asOf,
				LabelBucket: "month",
				Cells:       map[string]*reports.Node{"debit": debitSide(before), "credit": creditSide(before)},
			},
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
		Detail: &reports.Detail{
			Label: op("concat",
				fld("date"), lit(" · "),
				fld("entry", "number"), lit(" · "),
				lineDescriptionFormula(),
			),
			Open: entryOpenPath(),
		},
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
