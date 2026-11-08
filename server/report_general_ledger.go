package books

import (
	"maps"
	"slices"

	"tinycld.org/core/reports"
)

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
			{ID: "type", Label: "Type", Formula: typeLabelCase()},
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
			Label: op("if",
				op("isEmpty", rec("byAccount", "number")),
				rec("byAccount", "full_name"),
				op("concat", rec("byAccount", "number"), lit(" "), rec("byAccount", "full_name")),
			),
			Fill: &reports.Fill{Where: op("in", fld("id"), prm("accounts"))},
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
		Detail: &reports.Detail{Label: fld("date")},
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

// blankZero leaves a zero amount blank.
func blankZero(x *reports.Node) *reports.Node {
	return op("if", op("eq", x, lit(0)), lit(nil), x)
}

// typeLabelCase is the register's entry type label (entryTypeLabel in
// lib/register.ts) from entry_type_labels.json: "Transfer" for a manual
// transfer, "<label> of <number>" for a reversal origin whose reversed entry
// has a number, the origin's label otherwise, and the manual label for an
// origin the table does not name.
func typeLabelCase() *reports.Node {
	origin := fld("entry", "origin")
	reversed := fld("entry", "reverses", "number")
	args := []*reports.Node{
		op("and", op("eq", fld("entry", "doc_type"), lit(docTypeTransfer)), op("eq", origin, lit("manual"))),
		lit(entryTypeLabels.Transfer),
	}
	for _, o := range entryTypeLabels.ReversalOrigins {
		label := lit(entryTypeLabels.Origins[o])
		args = append(args,
			op("eq", origin, lit(o)),
			op("if", op("isEmpty", reversed), label, op("concat", label, lit(" of "), reversed)),
		)
	}
	// Sorted, so the spec's JSON does not move with map order.
	for _, o := range slices.Sorted(maps.Keys(entryTypeLabels.Origins)) {
		if slices.Contains(entryTypeLabels.ReversalOrigins, o) {
			continue
		}
		args = append(args, op("eq", origin, lit(o)), lit(entryTypeLabels.Origins[o]))
	}
	return op("case", append(args, lit(entryTypeLabels.Origins["manual"]))...)
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
