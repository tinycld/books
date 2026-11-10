package books

import (
	"encoding/json"
	"fmt"
	"maps"
	"slices"

	"tinycld.org/core/reports"
)

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
