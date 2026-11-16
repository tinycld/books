package books

import "tinycld.org/core/reports"

// customerBalanceKey names the shipped Customer Balance for good.
const customerBalanceKey = "books.customer_balance"

// customerBalanceShipped is the Customer Balance Books ships. Like every
// Books shipped report it is unpublished, and Books shares it with every
// Books reader (report_shares.go), because published reports are hidden from
// guests.
func customerBalanceShipped() reports.Shipped {
	return reports.Shipped{
		Key:         customerBalanceKey,
		Title:       "Customer Balance",
		Description: "What each customer owes on one day, from posted transactions on Accounts receivable accounts.",
		Spec:        mustJSON(customerBalanceSpec()),
		// 1: the first shipped spec. The report is unreleased, so later
		// checkpoints keep 1 (core re-stores a spec only on a higher revision).
		Revision:    1,
		Unpublished: true,
	}
}

// customerBalanceSpec is the posted Accounts receivable lines on or before
// the As of day, grouped by family (the customer's parent, or the customer
// when it has no parent), then by customer (spec §5). Each posted line is on
// one account and names at most one customer, so it is in exactly one
// customer row; a family total adds its customer rows, and the Total adds
// every row, No customer included: every posted Accounts receivable line on
// or before the day, the Balance Sheet's Accounts receivable. Paths start at
// a journal line.
func customerBalanceSpec() *reports.Spec {
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.journal_lines",
		Params:  cbParams(),
		// An unset Customer keeps every line; a set one drops the blank key,
		// so the No customer row does not show.
		Filter:  op("and", append(receivableLines(prm("asOf")), op("in", col("customerKey"), prm("customers")))...),
		Columns: cbColumns(),
		Groups:  cbGroups(),
		Sort:    cbSort(),
		Detail:  &reports.Detail{Label: cbDetailLabel(), Open: entryOpenPath()},
		Display: cbDisplay(),
	}
}

// cbDetailLabel labels an opened line "<date> · <type> <number> ·
// <description>".
func cbDetailLabel() *reports.Node {
	return op("concat",
		fld("date"), lit(" · "),
		lineEntryTypeLabel(), lit(" "), fld("entry", "number"),
		lit(" · "), lineDescriptionFormula(),
	)
}

// cbNet is a line's debit less its credit: what it adds to a customer's
// balance.
func cbNet() *reports.Node { return op("sub", fld("debit"), fld("credit")) }

// cbParent is the parent of the line's customer.
func cbParent() *reports.Node {
	return &reports.Node{Path: reports.Path{{Link: "customer"}, {Link: "parent"}}}
}

// cbParams are As of (Today by default), Rows (Non-zero by default),
// Customer (unset: every customer) and Order (Name by default).
func cbParams() []reports.ParamDef {
	return []reports.ParamDef{
		{ID: "asOf", Type: reports.ParamAsOf, Label: "As of", Default: mustJSON(map[string]string{"preset": "today"})},
		{
			ID: "rows", Type: reports.ParamChoice, Label: "Rows",
			Options: []reports.Option{
				{Value: "nonzero", Label: "Non-zero"},
				{Value: "activity", Label: "With activity"},
			},
			Default: mustJSON("nonzero"),
		},
		customersParam(),
		{
			ID: "order", Type: reports.ParamChoice, Label: "Order",
			Options: []reports.Option{
				{Value: "name", Label: "Name"},
				{Value: "balance", Label: "Largest balance"},
			},
			Default: mustJSON("name"),
		},
	}
}

// cbColumns are the label, the balance and the two hidden group keys (D6: a
// group names a spec column): the family (the parent, else the customer) and
// the customer.
func cbColumns() []reports.Column {
	return []reports.Column{
		{ID: "name", Label: "Customer", Path: reports.Path{{Link: "customer"}}},
		{ID: "balance", Label: "Balance", Formula: op("sum", cbNet())},
		{ID: "topKey", Label: "Family", Hidden: true, Formula: op("coalesce", cbParent(), link("customer"))},
		{ID: "customerKey", Label: "Customer key", Hidden: true, Path: reports.Path{{Link: "customer"}}},
	}
}

// cbGroups are the family, open when the report opens and drawn only when a
// line names a sub-customer, and the customer, shown by the Rows choice and
// muted when inactive. A blank key (no customer) labels "No customer".
func cbGroups() []reports.Group {
	inactive := op("eq", rec("byCustomer", "inactive"), lit(true))
	return []reports.Group{
		{
			ID: "byTop", Col: "topKey", Open: true, Subtotals: true, HideEmpty: true,
			Label: op("coalesce", rec("byTop", "display_name"), lit("No customer")),
			// No line of the family names a sub-customer (D1).
			Inline: op("eq", op("sum", op("if", op("isEmpty", fld("customer", "parent", "id")), lit(0), lit(1))), lit(0)),
		},
		{
			ID: "byCustomer", Col: "customerKey",
			// The suffix keeps the mark in exports and screen readers, which
			// do not read the muted tone.
			Label: op("concat",
				op("coalesce", rec("byCustomer", "display_name"), lit("No customer")),
				op("if", inactive, lit(" (inactive)"), lit("")),
			),
			Having: op("or", op("eq", prm("rows"), lit("activity")), op("ne", op("sum", cbNet()), lit(0))),
			Muted:  inactive,
		},
	}
}

// cbSort is the report's order (D5): inside a family the parent's own row
// first (read on customer rows only); under Largest balance the level's
// balance, largest first (on every level); No customer last; then families
// and customers by name, ignoring case. Core applies a key on each group
// level where it has a value, and on detail rows it applies every key (there
// `sum(x)` is x). The line keys (date, then posting order) therefore come
// before the balance key: they order the opened rows of one customer, and core
// skips them on group levels because they read a line.
func cbSort() []reports.SortKey {
	return []reports.SortKey{
		{Formula: op("if", op("eq", rec("byCustomer", "id"), rec("byTop", "id")), lit(0), lit(1))},
		{Formula: fld("date")},
		{Formula: fld("entry", "posted_at")},
		{Formula: fld("position")},
		{Formula: op("if", op("eq", prm("order"), lit("balance")), op("sum", cbNet()), lit(0)), Dir: "desc"},
		{Formula: op("if", op("isEmpty", rec("byTop", "id")), lit(1), lit(0))},
		{Formula: op("lower", rec("byTop", "display_name"))},
		{Formula: op("lower", rec("byCustomer", "display_name"))},
	}
}

// cbDisplay is the fixture's CUSTOMER_BALANCE_DISPLAY: a long customer name
// wraps to three lines, and Balance is never cut.
func cbDisplay() *reports.Display {
	return &reports.Display{
		Columns: map[string]reports.ColumnFit{
			"name":    {WhiteSpace: "normal", LineClamp: 3},
			"balance": {MinWidth: "max-content"},
		},
	}
}
