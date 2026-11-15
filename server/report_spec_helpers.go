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
