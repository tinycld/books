package cli

import (
	"strings"
	"testing"
)

func TestResourcesFileLoads(t *testing.T) {
	loaded, err := loadResources(resourcesJSON)
	if err != nil {
		t.Fatal(err)
	}
	accounts := findResource("accounts")
	if accounts == nil || len(loaded) == 0 {
		t.Fatal("resources.json has no accounts resource")
	}
	if accounts.Collection != "books_accounts" || !accounts.hasInactive() {
		t.Errorf("accounts = %+v", accounts)
	}
	if f := accounts.field("full_name"); f == nil || !f.ReadOnly {
		t.Error("full_name is set by the server: it must be readOnly")
	}
	if findResource("nope") != nil || accounts.field("nope") != nil {
		t.Error("an unknown name must not be found")
	}
}

func TestLoadResourcesRefusesAMistake(t *testing.T) {
	const good = `{"name":"things","singular":"thing","summary":"Things","collection":"books_things","sort":"id","label":"","columns":[],"search":[],"filters":[],"omit":[],"deleteHelp":"","fields":[{"name":"name","type":"string","help":"the name"}]}`
	wrap := func(resource string) []byte { return []byte(`{"resources":[` + resource + `]}`) }
	if _, err := loadResources(wrap(good)); err != nil {
		t.Fatalf("the base definition must load: %v", err)
	}
	for _, tc := range []struct {
		name, from, to, want string
	}{
		{"unknown key", `"sort":"id"`, `"sort":"id","colour":"red"`, "unknown field"},
		{"unknown type", `"type":"string"`, `"type":"text"`, `unknown type "text"`},
		{"no help", `"help":"the name"`, `"help":""`, "no help text"},
		{"column that is no field", `"columns":[]`, `"columns":["title"]`, `columns names "title"`},
		{"search that is no field", `"search":[]`, `"search":["title"]`, `search names "title"`},
		{"label that is no field", `"label":""`, `"label":"title"`, `label names "title"`},
		{"filter that is no field", `"filters":[]`, `"filters":[{"flag":"kind","field":"kind","help":"h"}]`, `filters names "kind"`},
		{"omit that is a field", `"omit":[]`, `"omit":["name"]`, `omit names "name"`},
		{"ref to no resource", `"type":"string"`, `"type":"id","ref":"people"`, `ref "people" is not a resource`},
		{"name that is not an identifier", `"name":"name","type"`, `"name":"name = 1 || id","type"`, "lower-case letters"},
		{"system field", `"name":"name","type"`, `"name":"id","type"`, "system field"},
		{"required and read-only", `"type":"string"`, `"type":"string","required":true,"readOnly":true`, "cannot be required"},
		{"enum on a bool", `"type":"string"`, `"type":"bool","enum":["a"]`, "only a string field has an enum"},
		{"no collection", `"collection":"books_things"`, `"collection":""`, "are required"},
	} {
		if !strings.Contains(good, tc.from) {
			t.Fatalf("%s: the base definition has no %s", tc.name, tc.from)
		}
		_, err := loadResources(wrap(strings.Replace(good, tc.from, tc.to, 1)))
		if err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: error = %v, want one that contains %q", tc.name, err, tc.want)
		}
	}
	if _, err := loadResources(wrap(good + "," + good)); err == nil || !strings.Contains(err.Error(), "defined twice") {
		t.Errorf("a resource defined twice: error = %v", err)
	}
}

func TestRecordSchemaListsEveryKey(t *testing.T) {
	res := findResource("accounts")
	schema := recordSchema(res)
	props := schema["properties"].(map[string]any)
	required := schema["required"].([]string)
	if len(props) != len(res.Fields)+3 || len(required) != len(props) {
		t.Fatalf("schema has %d properties and %d required keys for %d fields", len(props), len(required), len(res.Fields))
	}
	if required[0] != "id" || required[len(required)-1] != "updated" {
		t.Errorf("key order = %v", required)
	}
	accountType := props["type"].(map[string]any)
	if accountType["type"] != "string" || len(accountType["enum"].([]string)) != 15 {
		t.Errorf("type schema = %v", accountType)
	}
	parent := props["parent"].(map[string]any)
	if !strings.Contains(parent["description"].(string), "`books accounts`") {
		t.Errorf("an id field must say which records it points to: %v", parent)
	}
}

// The server takes an address only with all six keys, and stores "" for a
// select with no value: the schema of each must say so.
func TestFieldSchemaOfAnAddressAndASelect(t *testing.T) {
	address := fieldSchema(&field{Name: "address", Type: typeAddress, Help: "h"})
	if got := strings.Join(address["required"].([]string), " "); got != "line1 line2 city region postal_code country" {
		t.Errorf("an address must require every key, got %q", got)
	}
	if address["additionalProperties"] != false || strings.Join(address["type"].([]string), " ") != "object null" {
		t.Errorf("address schema = %v", address)
	}
	optional := fieldSchema(&field{Name: "terms", Type: typeString, Enum: []string{"net_30"}, Help: "h"})
	if got := strings.Join(optional["enum"].([]string), "|"); got != "net_30|" {
		t.Errorf("a select that is not required can be empty: enum = %q", got)
	}
	required := fieldSchema(&field{Name: "type", Type: typeString, Required: true, Enum: []string{"rate", "group"}, Help: "h"})
	if got := strings.Join(required["enum"].([]string), "|"); got != "rate|group" {
		t.Errorf("a required select cannot be empty: enum = %q", got)
	}
}
