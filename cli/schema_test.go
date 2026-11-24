package cli

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"tinycld.org/cli/exitcode"
)

type schemaOut struct {
	Conventions struct {
		Output      string         `json:"output"`
		Input       string         `json:"input"`
		Errors      string         `json:"errors"`
		GlobalFlags []flagSpec     `json:"globalFlags"`
		ExitCodes   []exitSpec     `json:"exitCodes"`
		ErrorSchema map[string]any `json:"errorSchema"`
	} `json:"conventions"`
	Commands []specOut `json:"commands"`
}

type specOut struct {
	Command string         `json:"command"`
	Summary string         `json:"summary"`
	Args    []argSpec      `json:"args"`
	Flags   []flagSpec     `json:"flags"`
	Input   map[string]any `json:"input"`
	Output  map[string]any `json:"output"`
}

func flagNames(flags []flagSpec) string {
	names := make([]string, len(flags))
	for i, f := range flags {
		names[i] = f.Name
	}
	return strings.Join(names, " ")
}

func stringsOf(v any) []string {
	list, _ := v.([]any)
	out := make([]string, len(list))
	for i, item := range list {
		out[i], _ = item.(string)
	}
	return out
}

// Every command that does work has a schema. A command a later unit adds
// without newCommand, or without a schema, fails here.
func TestEveryCommandHasASchema(t *testing.T) {
	root := newTestRoot(nil)
	books, _, _ := root.Find([]string{"books"})
	leaves := 0
	var walk func(cmd *cobra.Command)
	walk = func(cmd *cobra.Command) {
		if cmd.HasSubCommands() {
			for _, sub := range cmd.Commands() {
				walk(sub)
			}
			return
		}
		leaves++
		spec, ok := specOf(cmd)
		if !ok {
			t.Errorf("%q has no schema: build it with newCommand", cmd.CommandPath())
			return
		}
		if spec.Summary == "" {
			t.Errorf("%q has no summary", cmd.CommandPath())
		}
		var out map[string]any
		if err := json.Unmarshal(spec.Output, &out); err != nil || out["type"] == nil {
			t.Errorf("%q: the output schema has no type: %s", cmd.CommandPath(), spec.Output)
		}
		for _, f := range spec.Flags {
			if f.Help == "" {
				t.Errorf("%q: flag %s has no help text", cmd.CommandPath(), f.Name)
			}
		}
	}
	walk(books)
	// Every group refuses an unknown word. A group built without newGroup
	// prints the help and exits 0 for a typing mistake.
	var groups func(cmd *cobra.Command)
	groups = func(cmd *cobra.Command) {
		if !cmd.HasSubCommands() {
			return
		}
		words := append(strings.Fields(strings.TrimPrefix(cmd.CommandPath(), "tinycld ")), "no-such-word")
		_, _, err := runCmd(t, nil, "", words...)
		if got := exitcode.Of(err); got != exitcode.Usage {
			t.Errorf("%q with an unknown word: exit = %d, want 2: build the group with newGroup", cmd.CommandPath(), got)
		}
		for _, sub := range cmd.Commands() {
			groups(sub)
		}
	}
	groups(books)
	if leaves != len(allSpecs(books)) {
		t.Errorf("%d commands, %d schemas", leaves, len(allSpecs(books)))
	}
	if leaves < 9 {
		t.Errorf("only %d commands were found: the walk is wrong", leaves)
	}
}

func TestSchemaOfEverything(t *testing.T) {
	out, _, err := runCmd(t, nil, "", "books", "schema")
	if err != nil {
		t.Fatal(err)
	}
	var doc schemaOut
	if err := json.Unmarshal([]byte(out), &doc); err != nil {
		t.Fatalf("`books schema` must print JSON without --json: %v\n%s", err, out)
	}
	codes := []string{}
	for _, e := range doc.Conventions.ExitCodes {
		codes = append(codes, fmt.Sprintf("%d=%s", e.Code, e.Name))
		if e.Meaning == "" {
			t.Errorf("exit code %d has no meaning", e.Code)
		}
	}
	if got := strings.Join(codes, " "); got != "0=ok 1=failed 2=usage 3=auth 4=forbidden 5=not_found 6=refused 7=unavailable" {
		t.Errorf("exit codes = %s", got)
	}
	if got := flagNames(doc.Conventions.GlobalFlags); got != "--context --json --no-color --output --quiet --yes" {
		t.Errorf("global flags = %s", got)
	}
	for _, f := range doc.Conventions.GlobalFlags {
		if f.Help == "" {
			t.Errorf("global flag %s has no help text", f.Name)
		}
	}
	if doc.Conventions.Output == "" || doc.Conventions.Input == "" || doc.Conventions.Errors == "" {
		t.Error("a convention text is empty")
	}
	if doc.Conventions.ErrorSchema["type"] != "object" {
		t.Errorf("error schema = %v", doc.Conventions.ErrorSchema)
	}
	commands := []string{}
	for _, c := range doc.Commands {
		commands = append(commands, strings.TrimPrefix(c.Command, "tinycld books "))
	}
	for _, want := range []string{"accounts list", "accounts show", "accounts add", "accounts edit",
		"accounts activate", "accounts deactivate", "accounts delete", "accounts types", "schema"} {
		found := false
		for _, have := range commands {
			found = found || have == want
		}
		if !found {
			t.Errorf("no schema for %q; have: %v", want, commands)
		}
	}
}

func TestSchemaOfOneCommand(t *testing.T) {
	out, _, err := runCmd(t, nil, "", "books", "schema", "accounts", "add", "--json")
	if err != nil {
		t.Fatal(err)
	}
	var spec specOut
	if err := json.Unmarshal([]byte(out), &spec); err != nil {
		t.Fatal(err)
	}
	if spec.Command != "tinycld books accounts add" || len(spec.Args) != 0 || flagNames(spec.Flags) != "--input" {
		t.Errorf("spec = %+v", spec)
	}
	if got := strings.Join(stringsOf(spec.Input["required"]), " "); got != "name type detail_type" {
		t.Errorf("required = %q", got)
	}
	if spec.Input["additionalProperties"] != false {
		t.Error("the input schema must refuse unknown fields, as checkInput does")
	}
	props := spec.Input["properties"].(map[string]any)
	if _, ok := props["full_name"]; ok {
		t.Error("a field the server sets must not be in the input schema")
	}
	if _, ok := props["id"]; ok {
		t.Error("id must not be in the input schema")
	}
	outProps := spec.Output["properties"].(map[string]any)
	for _, key := range []string{"id", "full_name", "created"} {
		if _, ok := outProps[key]; !ok {
			t.Errorf("the output schema has no %q", key)
		}
	}
}

func TestSchemaOfEditListAndDelete(t *testing.T) {
	one := func(words ...string) specOut {
		out, _, err := runCmd(t, nil, "", append([]string{"books", "schema"}, words...)...)
		if err != nil {
			t.Fatalf("%v: %v", words, err)
		}
		var spec specOut
		if err := json.Unmarshal([]byte(out), &spec); err != nil {
			t.Fatal(err)
		}
		return spec
	}
	edit := one("accounts", "edit")
	if len(edit.Args) != 1 || edit.Args[0].Name != "id" || edit.Input["minProperties"] != float64(1) {
		t.Errorf("edit = %+v", edit)
	}
	if _, has := edit.Input["required"]; has {
		t.Error("edit must not require fields: the others keep their values")
	}
	list := one("accounts", "list")
	if got := flagNames(list.Flags); got != "--all --inactive --limit --page --parent --search --type" {
		t.Errorf("list flags = %s", got)
	}
	if list.Input != nil {
		t.Errorf("list reads no input, got %v", list.Input)
	}
	if got := strings.Join(stringsOf(list.Output["required"]), " "); got != "items page limit total" {
		t.Errorf("list output keys = %q", got)
	}
	del := one("accounts", "delete")
	if _, ok := del.Output["properties"].(map[string]any)["deleted"]; !ok {
		t.Errorf("delete output = %v", del.Output)
	}
}

func TestSchemaOfAnUnknownCommandIsAUsageError(t *testing.T) {
	out, _, err := runCmd(t, nil, "", "books", "schema", "accounts", "post", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Fatalf("exit = %d, want 2; err: %v", got, err)
	}
	if !strings.Contains(err.Error(), `"tinycld books accounts post" is not a command`) {
		t.Errorf("error = %v", err)
	}
	if !strings.Contains(out, `"code": "usage"`) {
		t.Errorf("no JSON error document:\n%s", out)
	}
}

// holds reports whether a JSON Schema keyword (a value or a list of values,
// as decoded from JSON) has want.
func holds(keyword any, want any) bool {
	if list, ok := keyword.([]any); ok {
		for _, item := range list {
			if item == want {
				return true
			}
		}
		return false
	}
	return keyword == want
}

// What the schema says the input is, checkInput enforces. A program that
// checks its document against the schema first must get the same answer as
// the command: null is in a property's type exactly when checkInput takes
// null, "" and null are in a select's values exactly when checkInput takes
// them, and a name outside the properties is refused.
func TestInputSchemaAgreesWithCheckInput(t *testing.T) {
	for i := range resources {
		res := &resources[i]
		raw, err := json.Marshal(inputSchema(res, false))
		if err != nil {
			t.Fatal(err)
		}
		var schema struct {
			Properties map[string]struct {
				Type any   `json:"type"`
				Enum []any `json:"enum"`
			} `json:"properties"`
		}
		if err := json.Unmarshal(raw, &schema); err != nil {
			t.Fatal(err)
		}
		if len(schema.Properties) == 0 {
			t.Errorf("%s: the input schema has no properties", res.Name)
		}
		for name, prop := range schema.Properties {
			takesNull := checkInput(res, map[string]any{name: nil}, false) == nil
			if holds(prop.Type, "null") != takesNull {
				t.Errorf("%s.%s: the schema type is %v, and checkInput takes null = %v", res.Name, name, prop.Type, takesNull)
			}
			if prop.Enum == nil {
				continue
			}
			takesEmpty := checkInput(res, map[string]any{name: ""}, false) == nil
			if holds(prop.Enum, "") != takesEmpty || holds(prop.Enum, nil) != takesNull {
				t.Errorf("%s.%s: the schema values are %v; checkInput takes \"\" = %v, null = %v", res.Name, name, prop.Enum, takesEmpty, takesNull)
			}
		}
		if err := checkInput(res, map[string]any{"no_such_field": nil}, false); err == nil {
			t.Errorf("%s: an unknown field was accepted", res.Name)
		}
	}
}
