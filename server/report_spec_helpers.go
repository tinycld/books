package books

import (
	"encoding/json"
	"fmt"

	"tinycld.org/core/reports"
)

// The builders the shipped Books report specs (Trial Balance, General Ledger,
// Balance Sheet) are written with, so a spec reads close to its JSON.

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

// accountRowLabel labels a record group of accounts "<number> <full name>",
// or the full name alone when the account has no number.
func accountRowLabel(group string) *reports.Node {
	return op("if",
		op("isEmpty", rec(group, "number")),
		rec(group, "full_name"),
		op("concat", rec(group, "number"), lit(" "), rec(group, "full_name")),
	)
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

// rec reads a field of the group's linked record.
func rec(group, field string) *reports.Node {
	return &reports.Node{Record: group, Path: reports.Path{{Field: field}}}
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
