package books

import (
	_ "embed"
	"encoding/json"
)

// entry_type_labels.json is the one table of entry type labels: the label of
// each origin, the label of each doc type that names its entries (a transfer,
// an invoice's entry) unless the entry is a reversal, and the origins whose
// label names the entry they reverse ("Reversal of JE-12"). Origin document
// has no label of its own: every document entry has a doc type the table
// names. The General Ledger's Type column and the Journal's block heading are
// built from it (entryTypeLabel, report_spec_helpers.go), the report sources'
// doc type options read its doc type labels, and the register's
// entryTypeLabel in tinycld/books/lib/register.ts copies it
// (tests/register.test.ts fails when the two differ).
//
//go:embed entry_type_labels.json
var entryTypeLabelsJSON []byte

type entryTypeLabelSet struct {
	Origins         map[string]string `json:"origins"`
	DocTypes        map[string]string `json:"docTypes"`
	ReversalOrigins []string          `json:"reversalOrigins"`
}

var entryTypeLabels = mustParseEntryTypeLabels(entryTypeLabelsJSON)

func mustParseEntryTypeLabels(raw []byte) entryTypeLabelSet {
	var out entryTypeLabelSet
	if err := json.Unmarshal(raw, &out); err != nil {
		panic("books: entry_type_labels.json: " + err.Error())
	}
	return out
}
