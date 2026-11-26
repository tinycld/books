package cli

import (
	"fmt"
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
		{"required and generated", `"type":"string"`, `"type":"string","required":true,"generated":true`, "cannot be required"},
		{"read-only and generated", `"type":"string"`, `"type":"string","readOnly":true,"generated":true`, "cannot be read-only"},
		{"enum on a bool", `"type":"string"`, `"type":"bool","enum":["a"]`, "only a string field has an enum"},
		{"no collection", `"collection":"books_things"`, `"collection":""`, "are required"},
		{"sort that is no field", `"sort":"id"`, `"sort":"-title"`, `sort names "-title"`},
		{"sort with an injected term", `"sort":"id"`, `"sort":"id,name;x"`, `sort names "name;x"`},
		{"sort with an empty term", `"sort":"id"`, `"sort":"id,"`, `sort names ""`},
		{"filter with no flag", `"filters":[]`, `"filters":[{"flag":"","field":"name","help":"h"}]`, "needs a flag and a help text"},
		{"filter with no help", `"filters":[]`, `"filters":[{"flag":"kind","field":"name","help":""}]`, "needs a flag and a help text"},
		{"two filters with one flag", `"filters":[]`, `"filters":[{"flag":"kind","field":"name","help":"h"},{"flag":"kind","field":"name","help":"h"}]`, `filter flag "kind" is used twice`},
		{"filter flag of a list flag", `"filters":[]`, `"filters":[{"flag":"limit","field":"name","help":"h"}]`, `filter flag "limit" is taken`},
		{"filter flag of a shell flag", `"filters":[]`, `"filters":[{"flag":"json","field":"name","help":"h"}]`, `filter flag "json" is taken`},
		{"filter default that is no enum value", `"filters":[],"omit":[],"deleteHelp":"","fields":[{"name":"name","type":"string"`, `"filters":[{"flag":"kind","field":"name","help":"h","default":"c"}],"omit":[],"deleteHelp":"","fields":[{"name":"name","type":"string","enum":["a","b"]`, `filter flag "kind" has the default "c"`},
		{"filter default on a field with no enum", `"filters":[]`, `"filters":[{"flag":"kind","field":"name","help":"h","default":"a"}]`, `filter flag "kind" has the default "a"`},
		{"filter default on a select with the value all", `"filters":[],"omit":[],"deleteHelp":"","fields":[{"name":"name","type":"string"`, `"filters":[{"flag":"kind","field":"name","help":"h","default":"a"}],"omit":[],"deleteHelp":"","fields":[{"name":"name","type":"string","enum":["a","all"]`, `reads as every value`},
		{"duplicate column", `"columns":[]`, `"columns":["name","name"]`, `column "name" is listed twice`},
		{"empty enum value", `"type":"string"`, `"type":"string","enum":["a",""]`, "empty enum value"},
		{"search of a non-string", `"search":[],"filters":[],"omit":[],"deleteHelp":"","fields":[{"name":"name","type":"string"`, `"search":["name"],"filters":[],"omit":[],"deleteHelp":"","fields":[{"name":"name","type":"bool"`, `search field "name" is not a string`},
		// list binds every filter value as text.
		{"filter on a bool", `"filters":[],"omit":[],"deleteHelp":"","fields":[{"name":"name","type":"string"`, `"filters":[{"flag":"kind","field":"name","help":"h"}],"omit":[],"deleteHelp":"","fields":[{"name":"name","type":"bool"`, `filter field "name" is not a string or an id`},
		{"filter on an integer", `"filters":[],"omit":[],"deleteHelp":"","fields":[{"name":"name","type":"string"`, `"filters":[{"flag":"kind","field":"name","help":"h"}],"omit":[],"deleteHelp":"","fields":[{"name":"name","type":"integer"`, `filter field "name" is not a string or an id`},
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

// The names are spelled out, not read from listFlags/shellFlags, so a name
// missing from either list fails here. The shell names are the persistent flags
// of the tinycld root command (cli/root.go) plus cobra's help.
func TestLoadResourcesRefusesEveryReservedFlag(t *testing.T) {
	const good = `{"name":"things","singular":"thing","summary":"Things","collection":"books_things","sort":"id","label":"","columns":[],"search":[],"filters":[%s],"omit":[],"deleteHelp":"","fields":[{"name":"name","type":"string","help":"the name"}]}`
	for _, flag := range []string{
		"limit", "page", "search", "inactive", "all",
		"output", "json", "context", "quiet", "no-color", "yes", "help",
	} {
		filter := `{"flag":"` + flag + `","field":"name","help":"h"}`
		_, err := loadResources([]byte(`{"resources":[` + fmt.Sprintf(good, filter) + `]}`))
		if err == nil || !strings.Contains(err.Error(), `filter flag "`+flag+`" is taken`) {
			t.Errorf("flag %q: error = %v, want a refusal", flag, err)
		}
	}
}

func TestLoadResourcesAcceptsSortTerms(t *testing.T) {
	const def = `{"resources":[{"name":"things","singular":"thing","summary":"Things","collection":"books_things","sort":"-name,+created,id","label":"","columns":[],"search":[],"filters":[],"omit":[],"deleteHelp":"","fields":[{"name":"name","type":"string","help":"the name"}]}]}`
	if _, err := loadResources([]byte(def)); err != nil {
		t.Errorf("a sort of declared and system fields must load: %v", err)
	}
}

// A field the CLI leaves out on purpose (sort_key) can still be sorted on.
func TestLoadResourcesAcceptsSortOnAnOmittedField(t *testing.T) {
	const def = `{"resources":[{"name":"things","singular":"thing","summary":"Things","collection":"books_things","sort":"sort_key,id","label":"","columns":[],"search":[],"filters":[],"omit":["sort_key"],"deleteHelp":"","fields":[{"name":"name","type":"string","help":"the name"}]}]}`
	if _, err := loadResources([]byte(def)); err != nil {
		t.Errorf("a sort on an omitted field must load: %v", err)
	}
	bad := strings.Replace(def, `"omit":["sort_key"]`, `"omit":["sort_key","x = 1"]`, 1)
	if _, err := loadResources([]byte(bad)); err == nil || !strings.Contains(err.Error(), `omit names "x = 1"`) {
		t.Errorf("an omit name that is no identifier: error = %v", err)
	}
	other := strings.Replace(def, `"sort":"sort_key,id"`, `"sort":"other,id"`, 1)
	if _, err := loadResources([]byte(other)); err == nil || !strings.Contains(err.Error(), `sort names "other"`) {
		t.Errorf("a sort on a name that is neither field nor omit: error = %v", err)
	}
}

// With two mistakes, the error must name the same one on every run.
func TestLoadResourcesNamesTheSameMistakeEveryTime(t *testing.T) {
	const def = `{"resources":[{"name":"things","singular":"thing","summary":"Things","collection":"books_things","sort":"id","label":"zz","columns":["yy"],"search":["xx"],"filters":[],"omit":[],"deleteHelp":"","fields":[{"name":"name","type":"string","help":"the name"}]}]}`
	_, first := loadResources([]byte(def))
	if first == nil {
		t.Fatal("the definition has mistakes")
	}
	for range 30 {
		if _, err := loadResources([]byte(def)); err == nil || err.Error() != first.Error() {
			t.Fatalf("error = %v, first was %v", err, first)
		}
	}
}

// A caller that edits a schema must not change the next one.
func TestAddressSchemaDoesNotShareTheKeyList(t *testing.T) {
	schema := fieldSchema(&field{Name: "address", Type: typeAddress, Help: "h"})
	schema["required"].([]string)[0] = "changed"
	if addressKeys[0] != "line1" {
		t.Errorf("addressKeys[0] = %q: the schema shares the package slice", addressKeys[0])
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

// An ids field may hold rows of a line table too: its description names the
// document and the table, as an id field's does.
func TestFieldSchemaOfIDsNamesARowRef(t *testing.T) {
	ids := fieldSchema(&field{Name: "lines", Type: typeIDs, Ref: "journal-entries.lines", Help: "h"})
	if got, want := ids["description"], "h (ids of rows of `lines` of `books journal-entries`)"; got != want {
		t.Errorf("description = %q, want %q", got, want)
	}
	one := fieldSchema(&field{Name: "line", Type: typeID, Ref: "journal-entries.lines", Help: "h"})
	if got, want := one["description"], "h (the id of a row of `lines` of `books journal-entries`)"; got != want {
		t.Errorf("description = %q, want %q", got, want)
	}
	records := fieldSchema(&field{Name: "accounts", Type: typeIDs, Ref: "accounts", Help: "h"})
	if got, want := records["description"], "h (ids of records of `books accounts`)"; got != want {
		t.Errorf("description = %q, want %q", got, want)
	}
}
