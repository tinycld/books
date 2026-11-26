package cli

import (
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// Books never changes a statement, so the group has no `edit`: resources.json
// says so with noEdit. The case of statements in resourceCases proves add,
// show, list and delete.
func TestStatementsHaveNoEdit(t *testing.T) {
	if !findResource("statements").NoEdit || findResource("customers").NoEdit {
		t.Fatal("statements can be edited, or customers cannot")
	}
	f := newFakeBooks(t)
	f.addRow("books_statements", "stmt00000000001", map[string]any{
		"customer": "custacme0000001", "type": "open_items", "statement_date": "2026-11-20", "number": "ST-1001", "balance": cents(30000),
	})
	_, _, err := runCmd(t, f.serve(), `{"statement_date": "2026-11-21"}`, "books", "statements", "edit", "stmt00000000001", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Errorf("statements edit: exit = %d, err = %v", got, err)
	}
	if len(f.requests) != 0 {
		t.Errorf("a command the group has not sent %v", f.requests)
	}
	out, _, err := runCmd(t, f.serve(), "", "books", "schema", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out, `"tinycld books statements edit"`) || !strings.Contains(out, `"tinycld books statements add"`) || !strings.Contains(out, `"tinycld books customers edit"`) {
		t.Error("the schema has `statements edit`, or no `statements add`")
	}
	out, _, err = runCmd(t, f.serve(), "", "books", "statements", "show", "stmt00000000001", "--json")
	if err != nil || !strings.Contains(out, `"number": "ST-1001"`) || !strings.Contains(out, `"balance": 30000`) || strings.Contains(out, "sent_at") {
		t.Errorf("show (%v):\n%s", err, out)
	}
}

func TestStatementInputIsCheckedBeforeItIsSent(t *testing.T) {
	f := newFakeBooks(t)
	cases := []struct{ input, want string }{
		{`{"type": "open_items", "statement_date": "2026-11-20"}`, `"customer" is required`},
		{`{"customer": "custacme0000001", "type": "monthly", "statement_date": "2026-11-20"}`, `"type"`},
		{`{"customer": "custacme0000001", "type": "open_items", "statement_date": "2026-11-20", "balance": 5}`, `"balance" is set by the server`},
		{`{"customer": "custacme0000001", "type": "open_items", "statement_date": "2026-11-20", "sent_to": "a@b.co"}`, `"sent_to" is set by the server`},
	}
	for _, tc := range cases {
		_, _, err := runCmd(t, f.serve(), tc.input, "books", "statements", "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%.80s: exit = %d, err = %v, want %q", tc.input, got, err, tc.want)
		}
	}
	if len(f.requests) != 0 {
		t.Errorf("a refused input sent %v", f.requests)
	}
}

// noEdit is a rule of a list resource, checked when the definitions load.
func TestLoadChecksNoEdit(t *testing.T) {
	text := string(resourcesJSON)
	at := strings.Index(text, `"name": "statements"`)
	old := `{ "name": "email", "type": "string",`
	i := strings.Index(text[at:], old)
	if at < 0 || i < 0 {
		t.Fatal("resources.json has no statements with an email")
	}
	broken := text[:at+i] + `{ "name": "inactive", "type": "bool",` + text[at+i+len(old):]
	if _, err := loadResources([]byte(broken)); err == nil || !strings.Contains(err.Error(), "a resource with noEdit has no inactive field") {
		t.Errorf("noEdit with inactive: err = %v", err)
	}
	documentsText := strings.Replace(string(documentsJSON), `"lifecycle": "posted",`, `"lifecycle": "posted", "noEdit": true,`, 1)
	if _, err := loadDocuments([]byte(documentsText)); err == nil || !strings.Contains(err.Error(), "noEdit is for a list resource") {
		t.Errorf("noEdit in a document: err = %v", err)
	}
}
