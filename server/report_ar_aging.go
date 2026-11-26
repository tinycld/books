package books

import "tinycld.org/core/reports"

// arAgingKey names the shipped A/R Aging for good.
const arAgingKey = "books.ar_aging"

// arAgingShipped is the A/R Aging Books ships. Like every Books shipped report
// it is unpublished, and Books shares it with every Books reader
// (report_shares.go), because published reports are hidden from guests.
func arAgingShipped() reports.Shipped {
	return reports.Shipped{
		Key:         arAgingKey,
		Title:       "A/R Aging",
		Description: "What each customer owes on one day, by how long each open invoice is past due.",
		Spec:        mustJSON(arAgingSpec()),
		// 1: the first shipped spec. The report is unreleased, so later
		// checkpoints keep 1 (core re-stores a spec only on a higher revision).
		Revision:    2,
		Unpublished: true,
	}
}

// arAgingSpec is the open receivable items on the As of day (spec §3, §4),
// grouped by family and customer as the Customer Balance, then by item. Each
// row of books.receivable_items is part of one item of one customer, and the
// parts of an item add up to its open amount on the day, so a customer row is
// its Customer Balance figure and the Total the Balance Sheet's Accounts
// receivable. Paths start at a receivable item row.
func arAgingSpec() *reports.Spec {
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.receivable_items",
		Params:  arParams(),
		// An unset Customer keeps every row; a set one drops the blank key, so
		// the No customer row does not show.
		// settled after the day: an item whose balance is zero on the day and
		// stays zero adds nothing to any sum, so its rows are not read. The
		// family level does not count these rows: arGroups, Inline.
		Filter: op("and",
			op("gt", fld("settled"), prm("asOf")),
			op("lte", fld("date"), prm("asOf")),
			op("in", col("customerKey"), prm("customers")),
		),
		Columns: arColumns(),
		Groups:  arGroups(),
		Sort:    arSort(),
		Detail:  &reports.Detail{Label: arDetailLabel(), Open: entryOpenPath()},
		Display: arDisplay(),
	}
}

// arNet is a row's debit less its credit: what it adds to an item's open
// amount.
func arNet() *reports.Node { return op("sub", fld("debit"), fld("credit")) }

// arAge is a row's age on the As of day: the days from its item's due date to
// the day (core diffDays(a, b) is b − a).
func arAge() *reports.Node { return agingAge() }

// arParams are As of (Today by default), Customer (unset: every customer) and
// Order (Name by default).
func arParams() []reports.ParamDef { return agingParams(customersParam()) }

// arColumns are the label, the item's due date, the five age columns and
// Total, and the hidden group keys (a group names a spec column): the family
// (the parent, else the customer), the customer and the item, with the item's
// number for the item order. Due date and the number have a value on item
// rows only.
func arColumns() []reports.Column {
	cols := []reports.Column{
		{ID: "name", Label: "Customer", Path: reports.Path{{Link: "customer"}}},
		{ID: "due", Label: "Due date", Formula: op("min", fld("due_date")), BlankAbove: "byItem", Detail: "blank"},
	}
	cols = append(cols, agingColumns(arAge(), arNet())...)
	return append(cols,
		reports.Column{ID: "topKey", Label: "Family", Hidden: true, Formula: op("coalesce", cbParent(), link("customer"))},
		reports.Column{ID: "customerKey", Label: "Customer key", Hidden: true, Path: reports.Path{{Link: "customer"}}},
		reports.Column{ID: "itemKey", Label: "Item", Hidden: true, Path: reports.Path{{Field: "item"}}},
		reports.Column{ID: "itemNo", Label: "Item number", Hidden: true, Formula: op("min", fld("item_seq")), BlankAbove: "byItem", Detail: "blank"},
	)
}

// arGroups are the family and customer levels of customerFamilyGroups, a
// customer shown only with an open item, then the open item: labelled
// "<type> <number>" and shown only when its amount on the day is not zero.
//
// The family level's Inline is replaced (D7). The run reads no row of a
// settled item, so "no row names a sub-customer" would inline a family whose
// sub-customers have only settled items. The family is drawn with its header
// and total when a sub-customer of it, in the Customer pick, has a stored row
// on or before As of, settled or not: a lookup on the level reads the group
// record one time per family, and the spec filter does not apply inside it.
// A blank family key (No customer) is always inline: a link comparison with a
// blank key would match every customer that has no parent.
func arGroups() []reports.Group {
	groups := customerFamilyGroups()
	subCustomers := &reports.Node{
		Op: "lookup", Source: "books.customers", Pick: "count", Value: mustJSON(fld("id")),
		Where: op("and",
			op("eq", link("parent"), rec("byTop", "id")),
			op("in", fld("id"), prm("customers")),
			&reports.Node{Op: "exists", Link: reports.Path{{Link: "receivable_items"}}, Where: op("lte", fld("date"), prm("asOf"))},
		),
	}
	groups[0].Inline = op("or", op("isEmpty", rec("byTop", "id")), op("eq", subCustomers, lit(0)))
	groups[1].HideEmpty = true
	return append(groups, agingItemGroup(arNet(), itemKindLabel(receivableItemsSource())))
}

// arSort is the report's order (D6): customerFamilySort with No customer
// before the balance key (so it stays after every customer under Largest
// balance too) and, as inner keys, the item keys and the line keys. Core
// skips a key that reads a column blank above its level (due and itemNo are
// blank above byItem) and a key that reads a row value on a group level
// (date, posting order), so the item order (due date, then number as an
// integer: itemNo is min(item_seq)) applies on the item level only and the
// line order on the lines; Largest balance orders families and customers,
// never the items.
func arSort() []reports.SortKey {
	return customerFamilySort(arNet(), true,
		reports.SortKey{Formula: col("due")},
		reports.SortKey{Formula: col("itemNo")},
		reports.SortKey{Formula: fld("date")},
		reports.SortKey{Formula: fld("entry", "posted_at")},
	)
}

// arDetailLabel labels an opened line "<date> · <type> <number>".
func arDetailLabel() *reports.Node { return agingDetailLabel() }

// arDisplay is the fixture's AR_AGING_DISPLAY (agingDisplay).
func arDisplay() *reports.Display { return agingDisplay() }
