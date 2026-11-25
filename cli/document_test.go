package cli

import (
	"encoding/json"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

func TestDocumentsLoad(t *testing.T) {
	doc := findDocument("journal-entries")
	if doc == nil {
		t.Fatal("documents.json has no journal-entries")
	}
	if doc.Collection != "books_journal_entries" || doc.Lifecycle != lifecyclePosting {
		t.Errorf("journal-entries = %s, %s", doc.Collection, doc.Lifecycle)
	}
	lines := doc.table("lines")
	if lines == nil || lines.Collection != "books_journal_lines" || lines.Parent != "entry" {
		t.Fatalf("the lines table = %+v", lines)
	}
	if doc.table("date") != nil || findDocument("accounts") != nil {
		t.Error("a field is not a line table, and a list resource is not a document")
	}
	// A document and a list resource share the `books` group, so no name is used twice.
	for i := range documents {
		if findResource(documents[i].Name) != nil {
			t.Errorf("%q is a document and a list resource", documents[i].Name)
		}
	}
}

// minimalDocument is a definition loadDocuments accepts. A case of
// TestLoadDocumentsRefusesAMistake changes one part of it.
const minimalDocument = `{"documents":[{
	"name":"notes","singular":"note","summary":"Notes","collection":"books_notes","lifecycle":"posting",
	"fixed":{"kind":"plain"},"sort":"id","label":"","columns":[],"search":[],"filters":[],"omit":[],"deleteHelp":"",
	"fields":[
		{"name":"title","type":"string","help":"the title"},
		{"name":"kind","type":"string","readOnly":true,"enum":["plain","other"],"help":"the kind"},
		{"name":"status","type":"string","readOnly":true,"enum":["draft","posted","void"],"help":"the status"},
		{"name":"revision","type":"integer","readOnly":true,"help":"the revision"},
		{"name":"replaces","type":"id","ref":"notes","readOnly":true,"help":"the note this one corrects"}],
	"lines":[{"key":"lines","singular":"line","collection":"books_note_lines","parent":"note","sort":"position,id",
		"omit":["note","position"],
		"fields":[{"name":"text","type":"string","help":"the text"}]}]}]}`

func TestLoadDocumentsRefusesAMistake(t *testing.T) {
	if _, err := loadDocuments([]byte(minimalDocument)); err != nil {
		t.Fatalf("the minimal document: %v", err)
	}
	cases := []struct{ name, old, new, want string }{
		{"an unknown key", `"lifecycle":"posting",`, `"lifecycle":"posting","colour":"red",`, "unknown field"},
		{"a list resource's name", `"name":"notes"`, `"name":"accounts"`, "is a list resource"},
		{"an unknown lifecycle", `"lifecycle":"posting"`, `"lifecycle":"quote"`, `unknown lifecycle "quote"`},
		{"a status a caller can set", `"name":"status","type":"string","readOnly":true`, `"name":"status","type":"string"`, "read-only status"},
		{"no revision", `{"name":"revision","type":"integer","readOnly":true,"help":"the revision"},`, ``, "read-only integer revision"},
		{"replaces of another type", `"ref":"notes"`, `"ref":"accounts"`, "read-only replaces"},
		{"a fixed field a caller can set", `"fixed":{"kind":"plain"}`, `"fixed":{"title":"x"}`, `fixed names "title"`},
		{"a fixed value outside the select", `"fixed":{"kind":"plain"}`, `"fixed":{"kind":"odd"}`, `"odd" is not a value`},
		{"a line key that is a field", `"key":"lines"`, `"key":"title"`, `line table key "title"`},
		{"a parent the caller could send", `"omit":["note","position"]`, `"omit":["position"]`, `omit must name "note"`},
		{"a position the caller could send", `"omit":["note","position"]`, `"omit":["note"]`, `omit must name "position"`},
		{"a line field with no help", `{"name":"text","type":"string","help":"the text"}`, `{"name":"text","type":"string","help":""}`, "no help text"},
		{"a line sort on an unknown field", `"sort":"position,id"`, `"sort":"rank"`, `sort names "rank"`},
		{"a line table with no fields", `"fields":[{"name":"text","type":"string","help":"the text"}]`, `"fields":[]`, "no fields"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if strings.Count(minimalDocument, tc.old) != 1 {
				t.Fatalf("the case does not change one place of the definition: %q", tc.old)
			}
			_, err := loadDocuments([]byte(strings.Replace(minimalDocument, tc.old, tc.new, 1)))
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %v, want one that says %q", err, tc.want)
			}
		})
	}
}

func TestCheckDocumentInputSplitsHeaderAndLines(t *testing.T) {
	doc := findDocument("journal-entries")
	body, err := parseObject([]byte(`{"date":"2026-07-15","memo":"Rent","lines":[
		{"account":"acctchecking001","credit":120000},
		{"account":"acctincome00001","debit":120000,"memo":"July"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	in, err := checkDocumentInput(doc, body, true)
	if err != nil {
		t.Fatal(err)
	}
	header, _ := json.Marshal(in.header)
	lines, _ := json.Marshal(in.lines)
	if string(header) != `{"date":"2026-07-15","memo":"Rent"}` {
		t.Errorf("header = %s", header)
	}
	if string(lines) != `{"lines":[{"account":"acctchecking001","credit":120000},{"account":"acctincome00001","debit":120000,"memo":"July"}]}` {
		t.Errorf("lines = %s", lines)
	}
}

func TestCheckDocumentInputRefusals(t *testing.T) {
	doc := findDocument("journal-entries")
	manyLines := `{"date":"2026-07-15","lines":[` + strings.Repeat(`{"account":"a"},`, maxDocumentLines) + `{"account":"a"}]}`
	cases := []struct {
		name, input string
		create      bool
		want        string
	}{
		{"an unknown field names the lines too", `{"date":"2026-07-15","line":[]}`, true, `journal-entries has no field "line"; fields: date, memo, auto_reverse_on, lines`},
		{"a field the server sets", `{"date":"2026-07-15","status":"posted"}`, true, `"status" is set by the server`},
		{"a fixed field", `{"date":"2026-07-15","doc_type":"transfer"}`, true, `"doc_type" is set by the server`},
		{"the id", `{"date":"2026-07-15","id":"entry0000000001"}`, true, `"id" is set by the server`},
		{"no date on add", `{"memo":"x"}`, true, `"date" is required`},
		{"lines that are no array", `{"date":"2026-07-15","lines":{}}`, true, `"lines" must be an array of objects, one for each line`},
		{"a line that is no object", `{"date":"2026-07-15","lines":[1]}`, true, `lines[0] must be an object`},
		{"a line with no account", `{"date":"2026-07-15","lines":[{"account":"a"},{"debit":5}]}`, true, `lines[1]: "account" is required`},
		{"a line amount with a fraction", `{"date":"2026-07-15","lines":[{"account":"a","debit":1.5}]}`, true, `lines[0]: "debit" must be a whole number`},
		{"a line field the CLI sets", `{"date":"2026-07-15","lines":[{"account":"a","position":3}]}`, true, `lines[0]: lines has no field "position"`},
		{"too many lines", manyLines, true, `"lines" has 251 rows: the most is 250`},
		{"an empty edit", `{}`, false, "nothing to change"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body, err := parseObject([]byte(tc.input))
			if err != nil {
				t.Fatal(err)
			}
			_, err = checkDocumentInput(doc, body, tc.create)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want one that says %q", err, tc.want)
			}
			if got := exitcode.Of(err); got != exitcode.Usage {
				t.Errorf("exit = %d, want %d", got, exitcode.Usage)
			}
		})
	}
	// An edit may name only the lines, or only a header field.
	for _, ok := range []string{`{"lines":[]}`, `{"memo":null}`} {
		body, _ := parseObject([]byte(ok))
		if _, err := checkDocumentInput(doc, body, false); err != nil {
			t.Errorf("edit %s: %v", ok, err)
		}
	}
}

// An agent builds the input from the schema, so the schema states what
// checkDocumentInput enforces.
func TestDocumentSchemas(t *testing.T) {
	doc := findDocument("journal-entries")
	var add, edit, out struct {
		Required   []string `json:"required"`
		MinProps   int      `json:"minProperties"`
		Additional *bool    `json:"additionalProperties"`
		Properties map[string]struct {
			Type     any `json:"type"`
			MaxItems int `json:"maxItems"`
			Items    struct {
				Required   []string       `json:"required"`
				Additional *bool          `json:"additionalProperties"`
				Properties map[string]any `json:"properties"`
			} `json:"items"`
		} `json:"properties"`
	}
	for schema, into := range map[string]any{
		mustJSON(documentInputSchema(doc, true)):  &add,
		mustJSON(documentInputSchema(doc, false)): &edit,
		mustJSON(documentSchema(doc)):             &out,
	} {
		if err := json.Unmarshal([]byte(schema), into); err != nil {
			t.Fatal(err)
		}
	}
	if strings.Join(add.Required, ",") != "date" || add.Additional == nil || *add.Additional {
		t.Errorf("add: required %v, additionalProperties %v", add.Required, add.Additional)
	}
	lines := add.Properties["lines"]
	if lines.Type != "array" || lines.MaxItems != maxDocumentLines || strings.Join(lines.Items.Required, ",") != "account" ||
		lines.Items.Additional == nil || *lines.Items.Additional {
		t.Errorf("add: lines = %+v", lines)
	}
	for _, name := range []string{"status", "doc_type", "total", "revision", "replaces", "id"} {
		if _, has := add.Properties[name]; has {
			t.Errorf("add: the input schema has %q, which the server sets", name)
		}
	}
	for _, name := range []string{"entry", "position"} {
		if _, has := lines.Items.Properties[name]; has {
			t.Errorf("add: a line of the input schema has %q, which the CLI sets", name)
		}
	}
	if edit.MinProps != 1 || len(edit.Required) != 0 || edit.Properties["lines"].MaxItems != maxDocumentLines {
		t.Errorf("edit: minProperties %d, required %v", edit.MinProps, edit.Required)
	}
	want := "id,date,memo,auto_reverse_on,status,doc_type,origin,document,number,total,revision,currency,reverses,replaces,created,updated,lines"
	if strings.Join(out.Required, ",") != want || strings.Join(documentKeys(doc), ",") != want {
		t.Errorf("output keys = %v", out.Required)
	}
	if got := strings.Join(out.Properties["lines"].Items.Required, ","); got != "id,account,debit,credit,memo,customer,vendor,created,updated" {
		t.Errorf("output line keys = %s", got)
	}
}
