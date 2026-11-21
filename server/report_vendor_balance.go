package books

import "tinycld.org/core/reports"

// vendorBalanceKey names the shipped Vendor Balance for good.
const vendorBalanceKey = "books.vendor_balance"

// vendorBalanceShipped is the Vendor Balance Books ships. Like every Books
// shipped report it is unpublished, and Books shares it with every Books
// reader (report_shares.go), because published reports are hidden from
// guests.
func vendorBalanceShipped() reports.Shipped {
	return reports.Shipped{
		Key:         vendorBalanceKey,
		Title:       "Vendor Balance",
		Description: "What you owe each vendor on one day, from posted transactions on Accounts payable accounts.",
		Spec:        mustJSON(vendorBalanceSpec()),
		// 1: the first shipped spec. The report is unreleased, so later
		// checkpoints keep 1 (core re-stores a spec only on a higher revision).
		Revision:    1,
		Unpublished: true,
	}
}

// vendorBalanceSpec is the posted Accounts payable lines on or before the As
// of day, grouped by vendor (spec §3, §4). Each posted line is on one account
// and names at most one vendor, so it is in exactly one vendor row (or the No
// vendor row); the Total adds every row, No vendor included: every posted
// Accounts payable line on or before the day, the Balance Sheet's Accounts
// payable. books_party_balances sums the same lines per vendor, so a row is
// the vendor page's Open balance. Paths start at a journal line.
func vendorBalanceSpec() *reports.Spec {
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.journal_lines",
		Params:  balanceParams(vendorsParam()),
		// An unset Vendor keeps every line; a set one drops the blank key,
		// so the No vendor row does not show.
		Filter:  op("and", append(payableLines(prm("asOf")), op("in", col("vendorKey"), prm("vendors")))...),
		Columns: vbColumns(),
		Groups:  []reports.Group{vbGroup()},
		Sort:    vendorSort(vbNet(), balanceLineKeys()...),
		Detail:  &reports.Detail{Label: balanceDetailLabel(), Open: entryOpenPath()},
		Display: balanceDisplay(),
	}
}

// vbNet is a line's credit less its debit: what it adds to what the business owes.
func vbNet() *reports.Node { return op("sub", fld("credit"), fld("debit")) }

// vbColumns are the label, the balance and the hidden group key (a group
// names a spec column).
func vbColumns() []reports.Column {
	return []reports.Column{
		{ID: "name", Label: "Vendor", Path: reports.Path{{Link: "vendor"}}},
		{ID: "balance", Label: "Balance", Formula: op("sum", vbNet())},
		{ID: "vendorKey", Label: "Vendor key", Hidden: true, Path: reports.Path{{Link: "vendor"}}},
	}
}

// vbGroup is the vendor level, shown by the Rows choice.
func vbGroup() reports.Group {
	g := vendorGroup()
	// Core refuses hideEmpty on the last level (reports bind.go: "the last
	// level has no child groups to be empty of"). On this one level a vendor
	// with no line has no group row anyway, and Having hides the rest.
	g.HideEmpty = false
	g.Having = balanceRowsHaving(vbNet())
	return g
}
