package books

import (
	_ "embed"
	"encoding/json"
)

// entry_type_labels.json is the one table of entry type labels: the label of
// each origin, the label of a manual transfer, and the origins whose label
// names the entry they reverse ("Reversal of JE-12"). The General Ledger's
// Type column is built from it (typeLabelCase), and the register's
// entryTypeLabel in tinycld/books/lib/register.ts copies it
// (tests/register.test.ts fails when the two differ).
//
//go:embed entry_type_labels.json
var entryTypeLabelsJSON []byte

type entryTypeLabelSet struct {
	Origins         map[string]string `json:"origins"`
	Transfer        string            `json:"transfer"`
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
