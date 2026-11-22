package books

import (
	"strings"

	"tinycld.org/core/reports"
)

// form1099Key names the shipped 1099 Summary and Detail for good.
const form1099Key = "books.form_1099"

// form1099Shipped is the 1099 Summary and Detail Books ships. Like every Books
// shipped report it is unpublished, and Books shares it with every Books
// reader (report_shares.go). It is not live: it reads books.basis_lines, which
// core marks NotLive, so the open report shows Refresh.
func form1099Shipped() reports.Shipped {
	return reports.Shipped{
		Key:         form1099Key,
		Title:       "1099 Summary and Detail",
		Description: "Payments to each 1099 vendor by box for a calendar year, without card payments, against your 1099 threshold.",
		Spec:        mustJSON(form1099Spec()),
		// 1: the first shipped spec. The report is unreleased, so later
		// checkpoints keep 1 (core re-stores a spec only on a higher revision).
		Revision:    1,
		Unpublished: true,
	}
}

// f1099Net is a payment row's figure: its debit less its credit.
func f1099Net() *reports.Node { return op("sub", fld("debit"), fld("credit")) }

// f1099Card is true on a row of a card payment's entry (posting sets
// card_payment on the entry of an expense, a bill payment and a vendor refund).
func f1099Card() *reports.Node { return op("eq", fld("entry", "card_payment"), lit(true)) }

// f1099Box is the 1099 box of a row's account as it is now, blank for none.
func f1099Box() *reports.Node { return fld("account", "form_1099_box") }

// f1099Reportable is a row's reportable figure: net on an account with a box
// when the payment is not a card payment, else 0 (spec §3 Columns).
func f1099Reportable() *reports.Node {
	return op("if", op("and", op("not", op("isEmpty", f1099Box())), op("not", f1099Card())), f1099Net(), lit(0))
}

// deferredDocTypes are the doc types whose own ledger lines the cash layer
// defers (a bill, a vendor credit, an invoice, a credit memo, a write-off),
// read from cashDeferrals so there is one list.
func deferredDocTypes() []string {
	out := make([]string, 0, len(cashDeferrals))
	for _, d := range cashDeferrals {
		out = append(out, d.DocType)
	}
	return out
}

// paymentRowFilter keeps the payment rows of books.basis_lines (spec §3 What
// counts): a ledger line of an entry that is not a deferred document, or a
// cash-basis share row that a payment wrote (payment_entry set). The ledger
// part does not map payment_entry, so it reads blank there.
func paymentRowFilter() *reports.Node {
	return op("or",
		op("and", op("eq", fld("layer"), lit("ledger")), op("not", op("in", fld("entry", "doc_type"), lit(deferredDocTypes())))),
		op("and", op("eq", fld("layer"), lit("cash")), op("not", op("isEmpty", fld("payment_entry", "id")))),
	)
}

// thresholdLookup is the 1099 threshold setting, read when the report runs.
// books_settings has one row, so min picks it.
func thresholdLookup() *reports.Node {
	return &reports.Node{Op: "lookup", Source: "books.settings", Pick: "min", Value: mustJSON(fld("threshold_1099"))}
}

// box1099LabelCase labels a box key with box1099Labels, and a blank key (an
// account with no box) "Not reported".
func box1099LabelCase(box *reports.Node) *reports.Node {
	args := make([]*reports.Node, 0, 2*len(boxes1099)+1)
	for _, k := range boxes1099 {
		args = append(args, op("eq", box, lit(k)), lit(box1099Labels[k]))
	}
	return op("case", append(args, lit("Not reported"))...)
}

// miscBoxes1099 is the 1099-MISC boxes of boxes1099, picked by their key and
// not by their place in the list.
func miscBoxes1099() []string {
	misc := make([]string, 0, len(boxes1099))
	for _, k := range boxes1099 {
		if strings.HasPrefix(k, misc1099Prefix) {
			misc = append(misc, k)
		}
	}
	return misc
}

// box1099RankCase is a box key's place in boxes1099, and a blank key after
// every box, so the box rows of a vendor follow the box list and Not reported
// is last (not the keys' text order: "misc_10" < "misc_2").
func box1099RankCase(box *reports.Node) *reports.Node {
	args := make([]*reports.Node, 0, 2*len(boxes1099)+1)
	for i, k := range boxes1099 {
		args = append(args, op("eq", box, lit(k)), lit(i))
	}
	return op("case", append(args, lit(len(boxes1099)))...)
}

// form1099DetailLabel labels a payment row as an opened line of the Expenses
// by Vendor (expenseDetailLabel), then " · paid by card" on a card payment
// (spec §3 Opening a payment, Q17).
func form1099DetailLabel() *reports.Node {
	return op("concat", expenseDetailLabel(), op("if", f1099Card(), lit(" · paid by card"), lit("")))
}

// f1099DebitFirstKey puts a row above zero before a row below it when the
// date, the posting time and the position tie: an application of a vendor
// credit writes two share rows from the credit's entry at one position, and
// the bill's share (a debit) reads above the credit's applied share (a
// credit), as the probe gave them (plan D2), not in record-id order.
func f1099DebitFirstKey() reports.SortKey {
	return reports.SortKey{Formula: op("if", op("gt", fld("debit"), fld("credit")), lit(0), lit(1))}
}

// form1099VendorGroup is the vendor level: vendorGroup's label and mute, then
// " (legal name: <legal name>)" when the legal name is set and differs from
// the name ignoring case (spec §3 Rows, Q10). It is open when the report
// opens. Having keeps the vendors of the Show choice: every vendor under All
// 1099 vendors and Not tracked for 1099 (the filter picks the tracking), and
// the vendor's Reportable against the threshold under the other two.
func form1099VendorGroup(reportable *reports.Node) reports.Group {
	g := vendorGroup()
	legal := rec("byVendor", "legal_name")
	sameName := op("eq", op("lower", legal), op("lower", rec("byVendor", "display_name")))
	g.Label = op("concat", g.Label,
		op("if", op("or", op("isEmpty", legal), sameName),
			lit(""), op("concat", lit(" (legal name: "), legal, lit(")"))))
	// Spec §4 sets hideEmpty off: a vendor with no payment row has no group
	// row (Q19), so there is no empty vendor row to hide.
	g.HideEmpty = false
	g.Open = true
	g.Having = op("or",
		op("in", prm("show"), lit([]string{"tracked", "untracked"})),
		op("and", op("eq", prm("show"), lit("meets")), op("gte", reportable, thresholdLookup())),
		op("and", op("eq", prm("show"), lit("below")), op("lt", reportable, thresholdLookup())),
	)
	return g
}

// form1099Params are Period (This calendar year), Show, Form, Vendor and
// Order, in the order the chips show them.
func form1099Params() []reports.ParamDef {
	return []reports.ParamDef{
		{ID: "period", Type: reports.ParamDateRange, Label: "Period", Default: mustJSON(map[string]string{"preset": "thisCalendarYear"})},
		{
			ID: "show", Type: reports.ParamChoice, Label: "Show", Header: "Vendors: {label}",
			Options: []reports.Option{
				{Value: "meets", Label: "At or above the threshold"},
				{Value: "below", Label: "Below the threshold"},
				{Value: "tracked", Label: "All 1099 vendors"},
				{Value: "untracked", Label: "Not tracked for 1099"},
			},
			Default: mustJSON("meets"),
		},
		{
			ID: "form", Type: reports.ParamChoice, Label: "Form", Header: "Form: {label}",
			Options: []reports.Option{
				{Value: "all", Label: "NEC and MISC"},
				{Value: "nec", Label: "1099-NEC"},
				{Value: "misc", Label: "1099-MISC"},
			},
			Default: mustJSON("all"),
		},
		vendorsParam(),
		{
			ID: "order", Type: reports.ParamChoice, Label: "Order",
			Options: []reports.Option{
				{Value: "name", Label: "Name"},
				{Value: "amount", Label: "Largest reportable"},
			},
			Default: mustJSON("name"),
		},
	}
}

// form1099Columns are the label, Reportable, Excluded and All payments, then
// the hidden columns (plan D7). Reportable, All payments and the hidden
// excludedSum have total "rows", so the Total adds the vendors that Having
// shows. Excluded reads excludedSum on each level and blanks a zero: on a
// vendor row and the Total row excludedSum adds the cells under it, so the
// blank holds there too, and Excluded is never a recompute sum of its own (a
// recompute Total would add the vendors Having hides).
func form1099Columns(reportable *reports.Node) []reports.Column {
	return []reports.Column{
		{ID: "name", Label: "Vendor", Path: reports.Path{{Link: "vendor"}}},
		{ID: "reportable", Label: "Reportable", Formula: reportable, Total: reports.TotalRows},
		{ID: "excluded", Label: "Excluded", Formula: blankZero(col("excludedSum"))},
		{ID: "all", Label: "All payments", Formula: op("sum", f1099Net()), Total: reports.TotalRows},
		{
			ID: "excludedSum", Label: "Excluded amount", Hidden: true, Total: reports.TotalRows,
			Formula: op("sum", op("sub", f1099Net(), f1099Reportable())),
		},
		{ID: "vendorKey", Label: "Vendor key", Hidden: true, Path: reports.Path{{Link: "vendor"}}},
		{ID: "boxKey", Label: "1099 box", Hidden: true, Path: path("account", "form_1099_box")},
	}
}

// form1099Display is the fixture's REPORT_1099_DISPLAY (plan D1): the four
// columns on one line where the rows are 760 px wide or wider, a long label
// wraps to three lines, and no figure is cut. Narrower rows take the phone
// arrangement: the label on line 1, the three figures on line 2.
func form1099Display() *reports.Display {
	figure := reports.ColumnFit{MinWidth: "max-content"}
	return &reports.Display{
		OneLine: &reports.DisplayOneLine{MinWidth: "760px"},
		Columns: map[string]reports.ColumnFit{
			"name":       {WhiteSpace: "normal", LineClamp: 3},
			"reportable": figure,
			"excluded":   figure,
			"all":        figure,
		},
		Layouts: []reports.DisplayLayout{
			{
				Width: "mobile", Tracks: 3,
				Cells: []reports.DisplayCell{
					{Col: "name", Line: 1, Span: 3},
					{Col: "reportable", Line: 2},
					{Col: "excluded", Line: 2},
					{Col: "all", Line: 2},
				},
			},
		},
	}
}

// form1099Spec is the payment rows of 1099 vendors (or, under Not tracked for
// 1099, of the other vendors) on Cost of goods sold, Expense and Other expense
// accounts, dated in the period, grouped by vendor and then by box (spec §3,
// §4). Paths start at a row of books.basis_lines.
func form1099Spec() *reports.Spec {
	reportable := op("sum", f1099Reportable())
	// The box level's group key. Above the box level it has no one value, so
	// core skips the rank key there and the vendors keep the vendor order.
	boxOfLevel := col("boxKey")
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.basis_lines",
		Params:  form1099Params(),
		// With a Form picked, the other form's boxes and the accounts with no
		// box are left out, so Having compares that form's Reportable.
		Filter: op("and",
			op("eq", fld("posted"), lit(true)),
			op("between", fld("date"), prm("period")),
			op("in", fld("account", "type"), lit(typesInGroup("expense"))),
			paymentRowFilter(),
			op("not", op("isEmpty", fld("vendor", "id"))),
			op("eq", fld("vendor", "track_1099"), op("ne", prm("show"), lit("untracked"))),
			op("in", col("vendorKey"), prm("vendors")),
			op("or",
				op("eq", prm("form"), lit("all")),
				op("and", op("eq", prm("form"), lit("nec")), op("eq", f1099Box(), lit(necBox1099))),
				op("and", op("eq", prm("form"), lit("misc")), op("in", f1099Box(), lit(miscBoxes1099()))),
			),
		),
		Columns: form1099Columns(reportable),
		Groups: []reports.Group{
			form1099VendorGroup(reportable),
			{ID: "byBox", Col: "boxKey", Label: box1099LabelCase(boxOfLevel)},
		},
		Header: []reports.HeaderLine{{Text: "1099 threshold: {value}", Value: thresholdLookup()}},
		Sort: vendorSortBy("amount", f1099Reportable(),
			append(append([]reports.SortKey{{Formula: box1099RankCase(boxOfLevel)}}, balanceLineKeys()...), f1099DebitFirstKey())...),
		Detail:  &reports.Detail{Label: form1099DetailLabel(), Open: entryOpenPath()},
		Display: form1099Display(),
	}
}
