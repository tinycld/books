package books

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"maps"
	"slices"

	"tinycld.org/core/reports"
)

// entry_routes.json is the one table of the screens that show a document's
// entry: doc type → the Books route of that document. entryOpenPath builds the
// report lines' open path from it, and tinycld/books/lib/entry-route.ts reads
// it for DOCUMENT_ROUTES (tests/entry-route.test.ts checks entryHref against
// it), so a new document type adds one row here.
//
//go:embed entry_routes.json
var entryRoutesJSON []byte

var entryRoutes = mustParseEntryRoutes(entryRoutesJSON)

func mustParseEntryRoutes(raw []byte) map[string]string {
	var out map[string]string
	if err := json.Unmarshal(raw, &out); err != nil {
		panic("books: entry_routes.json: " + err.Error())
	}
	if len(out) == 0 {
		panic("books: entry_routes.json holds no route")
	}
	return out
}

// entryOpenPath is the path a journal line opens: the screen of the
// transaction that posted it (entryHref in lib/entry-route.ts). A document
// entry with a document id and a doc type entry_routes.json names opens that
// document, a manual transfer opens the transfer, and any other entry (a
// reversal of a document included) opens the entry's read view. Paths start
// at a journal line.
func entryOpenPath() *reports.Node {
	var args []*reports.Node
	// Sorted, so the spec's JSON does not move with map order.
	for _, docType := range slices.Sorted(maps.Keys(entryRoutes)) {
		args = append(args,
			op("and",
				op("eq", fld("entry", "origin"), lit("document")),
				op("eq", fld("entry", "doc_type"), lit(docType)),
				op("not", op("isEmpty", fld("entry", "document"))),
			),
			op("concat", lit("books/"+entryRoutes[docType]+"/"), fld("entry", "document")),
		)
	}
	args = append(args,
		op("and",
			op("eq", fld("entry", "doc_type"), lit("transfer")),
			op("eq", fld("entry", "origin"), lit("manual")),
		),
		op("concat", lit("books/transfers/"), fld("entry", "id")),
	)
	return op("case", append(args, op("concat", lit("books/entries/"), fld("entry", "id")))...)
}

// tdDrillTarget is a statement column's drill into Transaction Detail by
// Account: the target's params per drilled group level, and on a pivot report
// the values each month cell lays over them (nil on any other report).
func tdDrillTarget(levels map[string]map[string]reports.DrillValue, pivotCells map[string]reports.DrillValue) *reports.Drill {
	return &reports.Drill{Report: transactionDetailKey, Levels: levels, PivotCells: pivotCells}
}

// tdAccount is the account of a statement's account row: the id of the
// byAccount group's record, the one item of Transaction Detail's Accounts.
func tdAccount() *reports.Node { return rec("byAccount", "id") }

// tdAccountOf is tdAccount as a drill value.
func tdAccountOf() reports.DrillValue { return reports.DrillValue{Formula: tdAccount()} }

// firstLine is the day of the account row's first posted journal line on or
// before day d: where a Trial Balance drill's range starts, so it holds every
// line a balance on d sums. No value when the account has no such line.
func firstLine(d *reports.Node) *reports.Node {
	return firstLineWhere("books.journal_lines", d)
}

// firstBasisLine is the day of the account row's first posted line on or
// before day d on the run's method (books.basis_lines under basisFilter):
// where a Balance Sheet drill's range starts, so it holds every line a
// balance on d sums. No value when the account has no such line.
func firstBasisLine(d *reports.Node) *reports.Node {
	return firstLineWhere("books.basis_lines", d, basisFilter())
}

// firstLineFY is the day of the account row's first posted journal line on or
// before day d inside the fiscal year that holds d: an income or expense
// balance sums that fiscal year's lines only.
func firstLineFY(d *reports.Node) *reports.Node {
	return firstLineWhere("books.journal_lines", d, op("eq", op("fiscalYear", fld("date")), op("fiscalYear", d)))
}

func firstLineWhere(source string, d *reports.Node, more ...*reports.Node) *reports.Node {
	where := append([]*reports.Node{
		op("eq", link("account"), tdAccount()),
		op("eq", fld("posted"), lit(true)),
		op("lte", fld("date"), d),
	}, more...)
	return &reports.Node{
		Op:     "lookup",
		Source: source,
		Where:  op("and", where...),
		Value:  mustJSON(fld("date")),
		Pick:   "min",
	}
}

// accountsParam is the Accounts param of the Trial Balance, the General
// Ledger and Transaction Detail by Account: any number of accounts, picked
// one by one or a whole type at a time, with no default, so a report with no
// account chosen lists every account.
func accountsParam() reports.ParamDef {
	return reports.ParamDef{
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
	}
}

// customersParam is the Customer param of the Customer Balance: any number
// of customers, inactive ones included, a sub-customer listed under its
// parent's name with a pick of all the sub-customers of a parent; the
// parent's own row is not in it. The document header names the picks under
// the period ("Customer: Aspen Ridge Dental, All Harborview Hospitality
// Group sub-customers"). The A/R aging report (p5-ar-aging) and customer
// statements (p2-statements) use it too.
func customersParam() reports.ParamDef {
	return reports.ParamDef{
		ID: "customers", Type: reports.ParamChoice, Label: "Customer", Multiple: true,
		Header: "Customer: {label}",
		OptionsFrom: &reports.OptionsFrom{
			Source:     "books.customers",
			Value:      path("id"),
			Label:      path("display_name"),
			Group:      path("parent", "display_name"),
			GroupLabel: "All {group} sub-customers",
		},
	}
}

// receivableLines are the filter terms of the posted Accounts receivable
// lines on or before asOf. The Customer Balance reads them; the A/R aging
// report (p5-ar-aging) and customer statements (p2-statements) read the same
// lines.
func receivableLines(asOf *reports.Node) []*reports.Node {
	return []*reports.Node{
		op("eq", fld("posted"), lit(true)),
		op("eq", fld("account", "type"), lit("accounts_receivable")),
		op("lte", fld("date"), asOf),
	}
}

// postedSaleLines are the filter terms of the sale lines in period (spec §3
// What counts): the item and percent lines of a posted document dated in the
// period. Description and subtotal lines never count: a subtotal line repeats
// the lines above it. The document link is required, so a line whose
// document the reader cannot read drops out. Paths start at a sale line.
func postedSaleLines(period *reports.Node) []*reports.Node {
	return []*reports.Node{
		op("in", fld("kind"), lit([]string{"item", "percent"})),
		op("eq", &reports.Node{Path: reports.Path{{Link: "document", With: "required"}, {Field: "status"}}}, lit(statusPosted)),
		op("between", fld("document", "date"), period),
	}
}

// saleAmount is a sale line's amount times its sign: below zero on a credit
// memo.
func saleAmount() *reports.Node { return op("mul", fld("sign"), fld("amount")) }

// saleQuantity is a sale line's quantity times its sign.
func saleQuantity() *reports.Node { return op("mul", fld("sign"), fld("quantity")) }

// methodParam is the Method param of the statements on books.basis_lines
// (pay-bills spec §3.10): Accrual (the default) or Cash, printed in the
// document header as "Accrual basis" or "Cash basis".
func methodParam() reports.ParamDef {
	return reports.ParamDef{
		ID: "method", Type: reports.ParamChoice, Label: "Method",
		Options: []reports.Option{{Value: "accrual", Label: "Accrual"}, {Value: "cash", Label: "Cash"}},
		Default: mustJSON("accrual"),
		Header:  "{label} basis",
	}
}

// basisFilter keeps the rows of books.basis_lines the run's method reads: the
// ledger part always, the cash part only on Cash.
func basisFilter() *reports.Node {
	return op("or",
		op("eq", fld("layer"), lit("ledger")),
		op("eq", prm("method"), lit("cash")),
	)
}

// methodDrill copies the run's method to the drilled report.
func methodDrill() reports.DrillValue { return reports.DrillValue{Param: "method"} }

// lineName is a line's customer or vendor.
func lineName() *reports.Node {
	return op("coalesce", fld("customer", "display_name"), fld("vendor", "display_name"))
}

// lineDescriptionFormula is a line's memo, else its entry's memo.
func lineDescriptionFormula() *reports.Node {
	return op("if", op("isEmpty", fld("memo")), fld("entry", "memo"), fld("memo"))
}

// lineEntryTypeLabel is entryTypeLabel over a line's entry.
func lineEntryTypeLabel() *reports.Node {
	return entryTypeLabel(func(n ...string) *reports.Node { return fld(append([]string{"entry"}, n...)...) })
}

// The builders the shipped Books report specs (Trial Balance, General Ledger,
// Balance Sheet, Journal) are written with, so a spec reads close to its JSON.

// profitAndLossTypes are the account types whose group is income or expense,
// in account_types.json order.
func profitAndLossTypes() []string {
	var out []string
	for _, t := range accountTypes {
		if t.Group == "income" || t.Group == "expense" {
			out = append(out, t.Key)
		}
	}
	return out
}

// creditNormalTypes are the account types whose normal side is credit, in
// account_types.json order: their balance reads credits less debits.
func creditNormalTypes() []string {
	var out []string
	for _, t := range accountTypes {
		if t.Normal == "credit" {
			out = append(out, t.Key)
		}
	}
	return out
}

// typesInGroup are the account types whose group is group ("asset",
// "liability", "equity", "income", "expense"), in account_types.json order.
func typesInGroup(group string) []string {
	var out []string
	for _, t := range accountTypes {
		if t.Group == group {
			out = append(out, t.Key)
		}
	}
	return out
}

// typeRankCase ranks an account type by its place in account_types.json, so
// the chart order follows the file, not the type keys.
func typeRankCase(n *reports.Node) *reports.Node {
	args := make([]*reports.Node, 0, 2*len(accountTypes)+1)
	for i, t := range accountTypes {
		args = append(args, op("eq", n, lit(t.Key)), lit(i+1))
	}
	return op("case", append(args, lit(len(accountTypes)+1))...)
}

// path is links, then the field.
func path(names ...string) reports.Path {
	p := reports.Path{}
	for _, l := range names[:len(names)-1] {
		p = append(p, reports.Hop{Link: l})
	}
	return append(p, reports.Hop{Field: names[len(names)-1]})
}

func fld(names ...string) *reports.Node { return &reports.Node{Path: path(names...)} }

func link(name string) *reports.Node { return &reports.Node{Path: reports.Path{{Link: name}}} }

func op(name string, args ...*reports.Node) *reports.Node {
	return &reports.Node{Op: name, Args: args}
}

func lit(v any) *reports.Node { return &reports.Node{Value: mustJSON(v)} }

func prm(id string) *reports.Node { return &reports.Node{Param: id} }

func col(id string) *reports.Node { return &reports.Node{Col: id} }

// rec reads a field of the group's linked record: to-one links, then the
// field (core binds a record path through the record's links).
func rec(group string, names ...string) *reports.Node {
	return &reports.Node{Record: group, Path: path(names...)}
}

// entryTypeLabel is the register's entry type label (entryTypeLabel in
// lib/register.ts) from entry_type_labels.json: the doc type's label for an
// entry whose doc type the table names and whose origin is not a reversal
// ("Transfer", "Invoice"), "<label> of <number>" for a reversal origin whose
// reversed entry has a number, the origin's label otherwise, and the manual
// label for an origin the table does not name. read reads a field of the entry (a line's
// path, or a group's record).
func entryTypeLabel(read func(names ...string) *reports.Node) *reports.Node {
	origin := read("origin")
	reversed := read("reverses", "number")
	notReversal := op("not", op("in", origin, lit(entryTypeLabels.ReversalOrigins)))
	var args []*reports.Node
	// Sorted, so the spec's JSON does not move with map order.
	for _, docType := range slices.Sorted(maps.Keys(entryTypeLabels.DocTypes)) {
		args = append(args,
			op("and", op("eq", read("doc_type"), lit(docType)), notReversal),
			lit(entryTypeLabels.DocTypes[docType]),
		)
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

// accountLabel is "<number> <full name>", the full name alone when the account
// has no number. read reads a field of the account.
func accountLabel(read func(names ...string) *reports.Node) *reports.Node {
	return op("if",
		op("isEmpty", read("number")),
		read("full_name"),
		op("concat", read("number"), lit(" "), read("full_name")),
	)
}

// blankZero leaves a zero amount blank.
func blankZero(x *reports.Node) *reports.Node {
	return op("if", op("eq", x, lit(0)), lit(nil), x)
}

// outer reads the report's row from inside a lookup (links, then the field),
// which correlates the lookup with that row.
func outer(names ...string) *reports.Node { return &reports.Node{Outer: path(names...)} }

// bound is a date range param's first ("from") or last ("to") day; no value
// when that end of the range is open.
func bound(param, side string) *reports.Node { return &reports.Node{Param: param, Bound: side} }

func mustJSON(v any) json.RawMessage {
	raw, err := json.Marshal(v)
	if err != nil {
		panic(fmt.Sprintf("books: report spec: %v", err))
	}
	return raw
}
