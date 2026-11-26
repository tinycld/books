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

// inputCase is one input a command of a transaction type reads: the schema
// `books schema` shows for it, the type whose fields and rows the input holds
// (nil for the row of `apply`, whose fields are those of res), and the check
// the command makes before it sends anything.
type inputCase struct {
	name   string
	schema map[string]any
	target *document
	res    *resource
	check  func(body map[string]any) error
}

func inputCases(doc *document) []inputCase {
	group := "tinycld books " + doc.Name
	documentCheck := func(create bool) func(map[string]any) error {
		return func(body map[string]any) error {
			_, err := checkDocumentInput(doc, group, body, create)
			return err
		}
	}
	cases := []inputCase{
		{name: "add", schema: documentInputSchema(doc, true), target: doc, res: &doc.resource, check: documentCheck(true)},
		{name: "edit", schema: documentInputSchema(doc, false), target: doc, res: &doc.resource, check: documentCheck(false)},
	}
	if doc.Convert != nil {
		to := findDocument(doc.Convert.To)
		// The source holds what the rule copies, so the input need not.
		source := record{values: map[string]any{}}
		for _, name := range doc.Convert.Copy {
			source.values[name] = sampleValue(to.field(name))
		}
		cases = append(cases, inputCase{name: "convert", schema: convertInputSchema(doc, to), target: to, res: &to.resource, check: func(body map[string]any) error {
			given, err := checkConvertBody(to, group, body)
			if err != nil {
				return err
			}
			_, err = checkConvertHeader(doc, to, source, given)
			return err
		}})
	}
	for i := range doc.Lines {
		if table := &doc.Lines[i]; table.Apply {
			res := table.asResource()
			cases = append(cases, inputCase{name: "apply " + table.Key, schema: inputSchema(res, true), res: res, check: func(body map[string]any) error {
				return checkInput(res, body, true)
			}})
		}
	}
	return cases
}

// sampleValue is a value of the field that its check takes.
func sampleValue(f *field) any {
	switch f.Type {
	case typeBool:
		return true
	case typeInteger, typeNumber:
		return json.Number("1")
	case typeIDs:
		return []any{}
	case typeAddress:
		address := map[string]any{}
		for _, key := range addressKeys {
			address[key] = ""
		}
		return address
	}
	if len(f.Enum) > 0 {
		return f.Enum[0]
	}
	return "x"
}

var requiredField = regexp.MustCompile(`^"([a-z_]+)" is required`)

// requiredBy asks the command's own check what an input must have: it adds
// the field each refusal names until the check takes the body.
func requiredBy(t *testing.T, c inputCase) (map[string]any, []string) {
	t.Helper()
	body, names := map[string]any{}, []string{}
	for range 50 {
		err := c.check(body)
		if err == nil {
			slices.Sort(names)
			return body, names
		}
		match := requiredField.FindStringSubmatch(err.Error())
		if match == nil {
			// An edit refuses an empty input: it has nothing required.
			return body, names
		}
		f := c.res.field(match[1])
		if f == nil {
			t.Fatalf("%s: the command requires %q, which is not a field", c.name, match[1])
		}
		body[match[1]] = sampleValue(f)
		names = append(names, match[1])
	}
	t.Fatalf("%s: the command never takes the input %v", c.name, body)
	return nil, nil
}

// What the input schema of a transaction says, the command enforces, for every
// input of every type of documents.json (add, edit, convert and apply): the
// test of the list resources (TestInputSchemaAgreesWithCheckInput) for a
// document and its rows.
func TestDocumentInputSchemaAgreesWithCheckDocumentInput(t *testing.T) {
	if len(documents) < 15 {
		t.Fatalf("only %d transaction types: documents.json lost one", len(documents))
	}
	converts, applies := 0, 0
	for i := range documents {
		for _, c := range inputCases(&documents[i]) {
			label := documents[i].Name + " " + c.name
			if c.name == "convert" {
				converts++
			}
			if strings.HasPrefix(c.name, "apply") {
				applies++
			}
			var schema struct {
				Required      []string `json:"required"`
				MinProperties int      `json:"minProperties"`
				Properties    map[string]struct {
					Type     any   `json:"type"`
					Enum     []any `json:"enum"`
					MaxItems int   `json:"maxItems"`
					Items    struct {
						Properties map[string]any `json:"properties"`
					} `json:"items"`
				} `json:"properties"`
			}
			if err := json.Unmarshal([]byte(mustJSON(c.schema)), &schema); err != nil {
				t.Fatal(err)
			}
			base, required := requiredBy(t, c)
			slices.Sort(schema.Required)
			if strings.Join(required, ",") != strings.Join(schema.Required, ",") {
				t.Errorf("%s: the schema requires %v, and the command requires %v", label, schema.Required, required)
			}
			if err := c.check(map[string]any{}); (schema.MinProperties == 1) != (err != nil && strings.Contains(err.Error(), "nothing to change")) {
				t.Errorf("%s: minProperties = %d, and the command takes {} with err = %v", label, schema.MinProperties, err)
			}
			// with is the input every required field of which is there, and
			// one more field.
			with := func(name string, value any) map[string]any {
				body := map[string]any{}
				for key, have := range base {
					body[key] = have
				}
				body[name] = value
				return body
			}
			for name, prop := range schema.Properties {
				var table *lineTable
				if c.target != nil {
					table = c.target.table(name)
				}
				if table != nil {
					if table.ReadOnly || prop.Type != "array" || prop.MaxItems != table.maxRows() {
						t.Errorf("%s.%s: the schema has %+v for a table with readOnly = %v and at most %d rows", label, name, prop, table.ReadOnly, table.maxRows())
					}
					want := writableNames(table.asResource())
					got := make([]string, 0, len(prop.Items.Properties))
					for field := range prop.Items.Properties {
						got = append(got, field)
					}
					slices.Sort(got)
					slices.Sort(want)
					if strings.Join(got, ",") != strings.Join(want, ",") {
						t.Errorf("%s.%s: a row of the schema has %v, and the command takes %v", label, name, got, want)
					}
					err := c.check(with(name, []any{map[string]any{"no_such_field": 1}}))
					if exitcode.Of(err) != exitcode.Usage || !strings.Contains(err.Error(), name+"[0]") {
						t.Errorf("%s.%s: an unknown field of a row: err = %v", label, name, err)
					}
					continue
				}
				takesNull := c.check(with(name, nil)) == nil
				if holds(prop.Type, "null") != takesNull {
					t.Errorf("%s.%s: the schema type is %v, and the command takes null = %v", label, name, prop.Type, takesNull)
				}
				if prop.Enum == nil {
					continue
				}
				if takesEmpty := c.check(with(name, "")) == nil; holds(prop.Enum, "") != takesEmpty || holds(prop.Enum, nil) != takesNull {
					t.Errorf("%s.%s: the schema values are %v; the command takes \"\" = %v, null = %v", label, name, prop.Enum, takesEmpty, takesNull)
				}
			}
			// What is not in the schema is refused: an unknown name, a field
			// the server sets, a table the server fills.
			refused := []string{"no_such_field", "status"}
			if c.target != nil {
				for j := range c.target.Lines {
					if c.target.Lines[j].ReadOnly {
						refused = append(refused, c.target.Lines[j].Key)
					}
				}
			}
			for _, name := range refused {
				if _, has := schema.Properties[name]; has {
					t.Errorf("%s: the input schema has %q", label, name)
				}
				if err := c.check(with(name, []any{})); exitcode.Of(err) != exitcode.Usage {
					t.Errorf("%s: %q in an input: err = %v", label, name, err)
				}
			}
		}
	}
	if converts == 0 || applies == 0 {
		t.Errorf("the test walked %d convert and %d apply inputs", converts, applies)
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
