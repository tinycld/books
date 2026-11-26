package books

import "tinycld.org/core/reports"

// apAgingKey names the shipped A/P Aging for good.
const apAgingKey = "books.ap_aging"

// apAgingShipped is the A/P Aging Books ships. Like every Books shipped report
// it is unpublished, and Books shares it with every Books reader
// (report_shares.go), because published reports are hidden from guests.
func apAgingShipped() reports.Shipped {
	return reports.Shipped{
		Key:         apAgingKey,
		Title:       "A/P Aging",
		Description: "What you owe each vendor on one day, by how long each open bill is past due.",
		Spec:        mustJSON(apAgingSpec()),
		// 1: the first shipped spec. The report is unreleased, so later
		// checkpoints keep 1 (core re-stores a spec only on a higher revision).
		Revision:    2,
		Unpublished: true,
	}
}

// apAgingSpec is the open payable items on the As of day (spec §3, §4.4),
// grouped by vendor, then by item. Each row of books.payable_items is part of
// one item of one vendor, and the parts of an item add up to its open amount
// on the day, so a vendor row is its Open balance and the Total the Balance
// Sheet's Accounts payable. Paths start at a payable item row.
func apAgingSpec() *reports.Spec {
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.payable_items",
		Params:  agingParams(vendorsParam()),
		// settled after the day: an item whose balance is zero on the day and
		// stays zero adds nothing to any sum, so its rows are not read. An
		// unset Vendor keeps every row; a set one drops the blank key, so the
		// No vendor row does not show.
		Filter: op("and",
			op("gt", fld("settled"), prm("asOf")),
			op("lte", fld("date"), prm("asOf")),
			op("in", col("vendorKey"), prm("vendors")),
		),
		Columns: apColumns(),
		Groups:  []reports.Group{vendorGroup(), agingItemGroup(apNet(), itemKindLabel(payableItemsSource()))},
		// Items by due date, then number as an integer (itemNo is
		// min(item_seq)); lines by date, then posting order.
		Sort: vendorSort(apNet(),
			reports.SortKey{Formula: col("due")},
			reports.SortKey{Formula: col("itemNo")},
			reports.SortKey{Formula: fld("date")},
			reports.SortKey{Formula: fld("entry", "posted_at")},
		),
		Detail:  &reports.Detail{Label: agingDetailLabel(), Open: entryOpenPath()},
		Display: apDisplay(),
	}
}

// apNet is a row's credit less its debit: what the business owes.
func apNet() *reports.Node { return op("sub", fld("credit"), fld("debit")) }

// apColumns are the label, the item's due date, the five age columns and
// Total, and the hidden group keys (a group names a spec column): the vendor
// and the item, with the item's number for the item order. Due date and the
// number have a value on item rows only.
func apColumns() []reports.Column {
	cols := []reports.Column{
		{ID: "name", Label: "Vendor", Path: reports.Path{{Link: "vendor"}}},
		{ID: "due", Label: "Due date", Formula: op("min", fld("due_date")), BlankAbove: "byItem", Detail: "blank"},
	}
	cols = append(cols, agingColumns(agingAge(), apNet())...)
	return append(cols,
		reports.Column{ID: "vendorKey", Label: "Vendor key", Hidden: true, Path: reports.Path{{Link: "vendor"}}},
		reports.Column{ID: "itemKey", Label: "Item", Hidden: true, Path: reports.Path{{Field: "item"}}},
		reports.Column{ID: "itemNo", Label: "Item number", Hidden: true, Formula: op("min", fld("item_seq")), BlankAbove: "byItem", Detail: "blank"},
	)
}

// apDisplay is the A/R Aging's block: phase 3 pass 2 measured that this
// report's fixture fits it with no change (ledger, phase 3 pass 2).
func apDisplay() *reports.Display { return agingDisplay() }
