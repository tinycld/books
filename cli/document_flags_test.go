package cli

import (
	"testing"
)

// flaggedTable is a line table with one flag: `given` is true when the row's
// quantity and value are both above 0.
func flaggedTable() *lineTable {
	return &lineTable{
		Key: "lines", Singular: "line", Collection: "books_note_lines", Parent: "note",
		Omit:  []string{"note", "position", "given"},
		Flags: []rowFlag{{Field: "given", Above0: []string{"quantity", "value"}}},
		Fields: []field{
			{Name: "quantity", Type: typeNumber, Help: "the quantity"},
			{Name: "value", Type: typeInteger, Help: "the value"},
		},
	}
}

// The CLI sets a flag of a line table on each row it creates (add, and the new
// rows of an edit) and on each row it updates (edit): true only when every
// field the flag names is above 0. A field that is 0, below 0, left out or
// null makes it false.
func TestLineTableFlagIsSetOnEveryRowWrite(t *testing.T) {
	cases := []struct {
		name string
		row  string
		want bool
	}{
		{"value and quantity above 0", `{"quantity": 5, "value": 300}`, true},
		{"a fraction above 0", `{"quantity": 0.5, "value": 1}`, true},
		{"value 0", `{"quantity": 5, "value": 0}`, false},
		{"value left out", `{"quantity": 5}`, false},
		{"value null", `{"quantity": 5, "value": null}`, false},
		{"quantity below 0", `{"quantity": -2.5, "value": 300}`, false},
		{"quantity 0", `{"quantity": 0, "value": 300}`, false},
		{"quantity left out", `{"value": 300}`, false},
	}
	table := flaggedTable()
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			row, err := parseObject([]byte(tc.row))
			if err != nil {
				t.Fatal(err)
			}
			writes := map[string]map[string]any{
				"create": rowCreateOp(table, "note00000000001", 0, row).Body,
				"edit":   rowUpdate(table, 0, row),
			}
			for write, body := range writes {
				got, ok := body["given"].(bool)
				if !ok || got != tc.want {
					t.Errorf("%s of %s: given = %v (%T), want %v", write, tc.row, body["given"], body["given"], tc.want)
				}
			}
		})
	}
}

// A line table with no flags sends no flag field.
func TestLineTableWithNoFlagsSendsNone(t *testing.T) {
	table := flaggedTable()
	table.Flags = nil
	row, err := parseObject([]byte(`{"quantity": 5, "value": 300}`))
	if err != nil {
		t.Fatal(err)
	}
	for write, body := range map[string]map[string]any{
		"create": rowCreateOp(table, "note00000000001", 0, row).Body,
		"edit":   rowUpdate(table, 0, row),
	} {
		if value, sent := body["given"]; sent {
			t.Errorf("%s sent given = %v, want no such field", write, value)
		}
	}
}
