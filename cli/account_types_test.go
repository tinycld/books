package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestAccountTypesFileLoads(t *testing.T) {
	types, err := loadAccountTypes()
	if err != nil {
		t.Fatal(err)
	}
	enum := findResource("accounts").field("type").Enum
	if len(types) != len(enum) {
		t.Fatalf("%d account types, and %d values of the type field", len(types), len(enum))
	}
	for i, at := range types {
		if at.Key != enum[i] {
			t.Errorf("type %d = %q, and the type field's value %d = %q", i, at.Key, i, enum[i])
		}
		if len(at.DetailTypes) == 0 {
			t.Errorf("%s has no detail types", at.Key)
		}
	}
}

func TestAccountTypes(t *testing.T) {
	c := newFakeBooks(t).serve()
	out, _, err := runCmd(t, c, "", "books", "accounts", "types", "--json")
	if err != nil {
		t.Fatal(err)
	}
	var types []accountType
	if err := json.Unmarshal([]byte(out), &types); err != nil {
		t.Fatal(err)
	}
	if len(types) != 15 || types[0].Key != "bank" || types[0].DetailTypes[0].Key != "checking" {
		t.Errorf("types = %+v", types)
	}
	table, _, err := runCmd(t, c, "", "books", "accounts", "types")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(table, "DETAIL TYPES") || !strings.Contains(table, "money_market") {
		t.Errorf("table:\n%s", table)
	}
}
