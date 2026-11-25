package cli

import (
	"encoding/json"
	"os"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"tinycld.org/cli/exitcode"
)

// What the input schema of a transaction says, checkDocumentInput enforces,
// for every type of documents.json: the test of the list resources
// (TestInputSchemaAgreesWithCheckInput) for a document and its rows.
func TestDocumentInputSchemaAgreesWithCheckDocumentInput(t *testing.T) {
	if len(documents) < 15 {
		t.Fatalf("only %d transaction types: documents.json lost one", len(documents))
	}
	for i := range documents {
		doc := &documents[i]
		group := "tinycld books " + doc.Name
		var schema struct {
			Properties map[string]struct {
				Type     any   `json:"type"`
				Enum     []any `json:"enum"`
				MaxItems int   `json:"maxItems"`
				Items    struct {
					Properties map[string]any `json:"properties"`
				} `json:"items"`
			} `json:"properties"`
		}
		if err := json.Unmarshal([]byte(mustJSON(documentInputSchema(doc, false))), &schema); err != nil {
			t.Fatal(err)
		}
		for name, prop := range schema.Properties {
			if table := doc.table(name); table != nil {
				if table.ReadOnly || prop.Type != "array" || prop.MaxItems != table.maxRows() {
					t.Errorf("%s.%s: the schema has %+v for a table with readOnly = %v and at most %d rows", doc.Name, name, prop, table.ReadOnly, table.maxRows())
				}
				want := writableNames(table.asResource())
				got := make([]string, 0, len(prop.Items.Properties))
				for field := range prop.Items.Properties {
					got = append(got, field)
				}
				slices.Sort(got)
				slices.Sort(want)
				if strings.Join(got, ",") != strings.Join(want, ",") {
					t.Errorf("%s.%s: a row of the schema has %v, and the command takes %v", doc.Name, name, got, want)
				}
				_, err := checkDocumentInput(doc, group, map[string]any{name: []any{map[string]any{"no_such_field": 1}}}, false)
				if exitcode.Of(err) != exitcode.Usage || !strings.Contains(err.Error(), name+"[0]") {
					t.Errorf("%s.%s: an unknown field of a row: err = %v", doc.Name, name, err)
				}
				continue
			}
			_, err := checkDocumentInput(doc, group, map[string]any{name: nil}, false)
			takesNull := err == nil
			if holds(prop.Type, "null") != takesNull {
				t.Errorf("%s.%s: the schema type is %v, and the command takes null = %v", doc.Name, name, prop.Type, takesNull)
			}
			if prop.Enum == nil {
				continue
			}
			_, err = checkDocumentInput(doc, group, map[string]any{name: ""}, false)
			if takesEmpty := err == nil; holds(prop.Enum, "") != takesEmpty || holds(prop.Enum, nil) != takesNull {
				t.Errorf("%s.%s: the schema values are %v; the command takes \"\" = %v, null = %v", doc.Name, name, prop.Enum, takesEmpty, takesNull)
			}
		}
		// What is not in the schema is refused: an unknown name, a field the
		// server sets, a table the server fills.
		refused := []string{"no_such_field", "status"}
		for j := range doc.Lines {
			if doc.Lines[j].ReadOnly {
				refused = append(refused, doc.Lines[j].Key)
			}
		}
		for _, name := range refused {
			if _, has := schema.Properties[name]; has {
				t.Errorf("%s: the input schema has %q", doc.Name, name)
			}
			if _, err := checkDocumentInput(doc, group, map[string]any{name: []any{}}, false); exitcode.Of(err) != exitcode.Usage {
				t.Errorf("%s: %q in an input: err = %v", doc.Name, name, err)
			}
		}
	}
}

// A command reads --input exactly when `books schema` gives it an input
// schema, and every command of every transaction type is in `books schema`.
func TestEveryDocumentCommandIsInTheSchema(t *testing.T) {
	books, _, err := newTestRoot(nil).Find([]string{"books"})
	if err != nil {
		t.Fatal(err)
	}
	var walk func(cmd *cobra.Command)
	walk = func(cmd *cobra.Command) {
		for _, sub := range cmd.Commands() {
			walk(sub)
		}
		if cmd.HasSubCommands() {
			return
		}
		spec, ok := specOf(cmd)
		if !ok {
			t.Errorf("%q has no schema", cmd.CommandPath())
			return
		}
		hasInput := len(spec.Input) > 0 && string(spec.Input) != "null"
		if reads := cmd.Flags().Lookup("input") != nil; reads != hasInput {
			t.Errorf("%q: reads --input = %v, has an input schema = %v", cmd.CommandPath(), reads, hasInput)
		}
	}
	walk(books)
	out, _, err := runCmd(t, nil, "", "books", "schema", "--json")
	if err != nil {
		t.Fatal(err)
	}
	for i := range documents {
		group, _, err := books.Find([]string{documents[i].Name})
		if err != nil || group.Name() != documents[i].Name {
			t.Errorf("%s has no command group", documents[i].Name)
			continue
		}
		for _, word := range subcommandNames(group) {
			if !strings.Contains(out, `"tinycld books `+documents[i].Name+` `+word+`"`) {
				t.Errorf("`books schema` has no `%s %s`", documents[i].Name, word)
			}
		}
	}
	deposits, _, err := books.Find([]string{"deposits"})
	if err != nil || !slices.Contains(subcommandNames(deposits), "undeposited") {
		t.Errorf("deposits has no undeposited command: err = %v", err)
	}
}

// A link of the help topic names a topic that the package has.
func TestHelpTopicLinksNameATopic(t *testing.T) {
	links := regexp.MustCompile(`help://books:([a-z0-9-]+)`).FindAllStringSubmatch(readDoc(t, helpPage), -1)
	if len(links) < 15 {
		t.Fatalf("only %d links were found", len(links))
	}
	for _, link := range links {
		if _, err := os.Stat("../help/" + link[1] + ".md"); err != nil {
			t.Errorf("the help topic links to %s, and help/%s.md is not there", link[0], link[1])
		}
	}
}
