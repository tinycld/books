package cli

import (
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// writtenOff is the sales book with one posted write-off and one void one.
func writtenOff(t *testing.T) *fakeBooks {
	t.Helper()
	f := sales(t)
	f.addRow("books_write_offs", "woposted0000001", map[string]any{
		"invoice": "invposted000001", "customer": "custacme0000001", "date": "2026-11-20", "account": "acctsoftware001",
		"amount": cents(39274), "memo": "Customer closed", "status": "posted", "number": "1001", "entry": "entryinvoice001",
	})
	f.addRow("books_write_offs", "wovoid000000001", map[string]any{
		"invoice": "invposted000001", "customer": "custacme0000001", "date": "2026-11-19", "account": "acctsoftware001",
		"amount": cents(39274), "status": "void", "number": "1000",
	})
	return f
}

// `write-offs add` is one write: the record is created posted, and the type
// has no rows. server/cli_write_offs_test.go sends a copy.
func TestWriteOffAddIsOneWrite(t *testing.T) {
	f := writtenOff(t)
	fixedIDs(t, "wonew0000000001")
	input := `{"invoice": "invposted000001", "date": "2026-11-20", "account": "acctsoftware001", "amount": 39274, "memo": "Customer closed"}`
	out, errOut, err := runCmd(t, f.serve(), input, "books", "write-offs", "add", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[{"method":"POST","url":"/api/collections/books_write_offs/records","body":{"account":"acctsoftware001","amount":39274,"date":"2026-11-20","id":"wonew0000000001","invoice":"invposted000001","memo":"Customer closed","status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(out, `"status": "posted"`) || strings.Contains(out, `"lines"`) {
		t.Errorf("the printed write-off:\n%s", out)
	}
	if !strings.Contains(errOut, "added and posted write-off") {
		t.Errorf("stderr = %q", errOut)
	}
}

// A write-off has no draft and no `replaces`: it is added, read and voided.
func TestWriteOffHasNoEditPostOrDelete(t *testing.T) {
	root := newTestRoot(nil)
	group, _, err := root.Find([]string{"books", "write-offs"})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(subcommandNames(group), ","); got != "add,entry,list,show,void" {
		t.Errorf("commands = %s", got)
	}
	add, _, err := root.Find([]string{"books", "write-offs", "add"})
	if err != nil {
		t.Fatal(err)
	}
	if add.Flags().Lookup("post") != nil || strings.Contains(add.Short+add.Long, "lines") {
		t.Errorf("`write-offs add` has --post, or its help names lines:\n%s\n%s", add.Short, add.Long)
	}
	// The help says that `add` changes the books at once.
	if !strings.Contains(add.Long, "It has no draft: Books posts and numbers it at once") {
		t.Errorf("the help of `write-offs add` does not say that it posts:\n%s", add.Long)
	}
	if doc := findDocument("write-offs"); doc.corrects() || doc.hasRows() || !findDocument("bill-payments").hasRows() {
		t.Error("write-offs corrects or has rows, or bill-payments has none")
	}
}

func TestWriteOffShowEntryVoidAndFilters(t *testing.T) {
	f := writtenOff(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "write-offs", "show", "woposted0000001", "--json")
	if err != nil || !strings.Contains(out, `"amount": 39274,`) || !strings.Contains(out, `"customer": "custacme0000001"`) || strings.Contains(out, "close_override") {
		t.Errorf("show (%v):\n%s", err, out)
	}
	entry, _, err := runCmd(t, f.serve(), "", "books", "write-offs", "entry", "woposted0000001", "--json")
	if err != nil || !strings.Contains(entry, `"id": "entryinvoice001"`) {
		t.Errorf("entry (%v):\n%s", err, entry)
	}
	list, _, err := runCmd(t, f.serve(), "", "books", "write-offs", "list", "--status", "void", "--invoice", "invposted000001", "--json")
	if err != nil || !strings.Contains(list, "wovoid000000001") || strings.Contains(list, "woposted0000001") {
		t.Errorf("list --status void (%v):\n%s", err, list)
	}
	if _, _, err := runCmd(t, f.serve(), "", "books", "write-offs", "void", "woposted0000001", "--yes", "--json"); err != nil {
		t.Fatal(err)
	}
	if got, want := mustJSON(f.lastPatch), `{"status":"void"}`; got != want {
		t.Errorf("void sent %s, want %s", got, want)
	}
	_, _, err = runCmd(t, f.serve(), "", "books", "write-offs", "void", "wovoid000000001", "--yes", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused {
		t.Errorf("void of a void one: exit = %d, err = %v", got, err)
	}
}

func TestWriteOffInputIsCheckedBeforeItIsSent(t *testing.T) {
	f := writtenOff(t)
	const header = `"invoice": "invposted000001", "date": "2026-11-20", "account": "acctsoftware001"`
	cases := []struct{ input, want string }{
		{`{` + header + `}`, `"amount" is required`},
		{`{"date": "2026-11-20", "account": "acctsoftware001", "amount": 1}`, `"invoice" is required`},
		{`{` + header + `, "amount": 1, "customer": "custacme0000001"}`, `"customer" is set by the server`},
		{`{` + header + `, "amount": 1.5}`, `"amount" must be a whole number, without a fraction or an exponent`},
		{`{` + header + `, "amount": 1, "lines": []}`, `write-offs has no field "lines"`},
	}
	for _, tc := range cases {
		_, _, err := runCmd(t, f.serve(), tc.input, "books", "write-offs", "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%.80s: exit = %d, err = %v, want %q", tc.input, got, err, tc.want)
		}
	}
	if len(f.requests) != 0 {
		t.Errorf("a refused input sent %v", f.requests)
	}
}
