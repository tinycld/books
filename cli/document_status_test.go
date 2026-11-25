package cli

import (
	"encoding/json"
	"io"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

func TestDocumentPostStatesTheNextRevision(t *testing.T) {
	f := journal(t)
	out, errOut, err := runCmd(t, f.serve(), "", "books", "journal-entries", "post", "entrydraft00001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	sent, _ := json.Marshal(f.lastPatch)
	if string(sent) != `{"revision":2,"status":"posted"}` {
		t.Errorf("the change sent = %s", sent)
	}
	if !strings.Contains(out, `"status": "posted"`) || !strings.Contains(out, `"lines": [`) {
		t.Errorf("post must print the document with its lines:\n%s", out)
	}
	if !strings.Contains(errOut, "posted journal entry") {
		t.Errorf("stderr = %q", errOut)
	}
}

func TestDocumentPostOfWhatIsNoDraftSendsNothing(t *testing.T) {
	f := journal(t)
	cases := []struct{ id, want string }{
		{"entryposted0001", "journal entry entryposted0001 is posted: only a draft can be posted"},
		{"entryinvoice001", `has the doc_type "invoice", not "journal"`},
	}
	for _, tc := range cases {
		_, _, err := runCmd(t, f.serve(), "", "books", "journal-entries", "post", tc.id, "--json")
		if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: exit = %d, err = %v", tc.id, got, err)
		}
	}
	if f.lastPatch != nil {
		t.Errorf("a refused post sent %v", f.lastPatch)
	}
}

func TestDocumentPostShowsTheServersRefusal(t *testing.T) {
	f := journal(t)
	f.refuse("PATCH", 400, `{"data":{},"message":"A journal entry needs at least two lines.","status":400}`)
	_, _, err := runCmd(t, f.serve(), "", "books", "journal-entries", "post", "entrydraft00001", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "A journal entry needs at least two lines.") {
		t.Errorf("exit = %d, err = %v", got, err)
	}
}

func TestDocumentVoidWithYes(t *testing.T) {
	f := journal(t)
	out, errOut, err := runCmd(t, f.serve(), "", "books", "journal-entries", "void", "entryposted0001", "--yes", "--json")
	if err != nil {
		t.Fatal(err)
	}
	sent, _ := json.Marshal(f.lastPatch)
	if string(sent) != `{"status":"void"}` {
		t.Errorf("the change sent = %s", sent)
	}
	if !strings.Contains(out, `"status": "void"`) || !strings.Contains(errOut, "voided journal entry 7 (entryposted0001)") {
		t.Errorf("stdout:\n%s\nstderr: %q", out, errOut)
	}
}

func TestDocumentVoidWithoutYesAndTerminalSendsNothing(t *testing.T) {
	f := journal(t)
	orig := canPrompt
	canPrompt = func(output.Options) bool { return false }
	t.Cleanup(func() { canPrompt = orig })
	_, _, err := runCmd(t, f.serve(), "", "books", "journal-entries", "void", "entryposted0001", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Errorf("exit = %d, want %d", got, exitcode.Usage)
	}
	if len(f.requests) != 0 {
		t.Errorf("the command sent %v", f.requests)
	}
}

func TestDocumentVoidAnsweredNoVoidsNothing(t *testing.T) {
	f := journal(t)
	origPrompt, origConfirm := canPrompt, confirm
	canPrompt = func(output.Options) bool { return true }
	var asked string
	confirm = func(_ output.Options, _ bool, _ io.Reader, _ io.Writer, question string) (bool, error) {
		asked = question
		return false, nil
	}
	t.Cleanup(func() { canPrompt, confirm = origPrompt, origConfirm })
	out, errOut, err := runCmd(t, f.serve(), "", "books", "journal-entries", "void", "entryposted0001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if asked != `Void journal entry "7"? This cannot be undone.` {
		t.Errorf("question = %q", asked)
	}
	if f.lastPatch != nil || !strings.Contains(out, `"status": "posted"`) || !strings.Contains(errOut, "not voided") {
		t.Errorf("patch %v\nstdout:\n%s\nstderr: %q", f.lastPatch, out, errOut)
	}
}

func TestDocumentVoidOfWhatIsNotPostedSendsNothing(t *testing.T) {
	f := journal(t)
	cases := []struct{ id, want string }{
		{"entrydraft00001", "journal entry entrydraft00001 is draft: only a posted one can be voided; delete a draft with `tinycld books journal-entries delete`"},
		{"entryinvoice001", `has the doc_type "invoice", not "journal"`},
	}
	for _, tc := range cases {
		_, _, err := runCmd(t, f.serve(), "", "books", "journal-entries", "void", tc.id, "--yes", "--json")
		if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: exit = %d, err = %v", tc.id, got, err)
		}
	}
	if f.lastPatch != nil {
		t.Errorf("a refused void sent %v", f.lastPatch)
	}
}

func TestDocumentDeleteOfADraft(t *testing.T) {
	f := journal(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "journal-entries", "delete", "entrydraft00001", "--yes", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(f.deleted, ",") != "entrydraft00001" || !strings.Contains(out, `"deleted": true`) {
		t.Errorf("deleted %v, printed:\n%s", f.deleted, out)
	}
}

// The server answers the delete of a posted document with 404. The command
// reads the status first and says what to do.
func TestDocumentDeleteOfWhatIsNoDraftSendsNoDelete(t *testing.T) {
	f := journal(t)
	cases := []struct{ id, want string }{
		{"entryposted0001", "journal entry entryposted0001 is posted: only a draft can be deleted; void a posted one with `tinycld books journal-entries void`"},
		{"entryinvoice001", `has the doc_type "invoice", not "journal"`},
	}
	for _, tc := range cases {
		_, _, err := runCmd(t, f.serve(), "", "books", "journal-entries", "delete", tc.id, "--yes", "--json")
		if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: exit = %d, err = %v", tc.id, got, err)
		}
	}
	if len(f.deleted) != 0 {
		t.Errorf("a refused delete removed %v", f.deleted)
	}
}

func TestDocumentGroupCommands(t *testing.T) {
	root := newTestRoot(nil)
	group, _, err := root.Find([]string{"books", "journal-entries"})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(subcommandNames(group), ","); got != "add,delete,edit,list,post,show,void" {
		t.Errorf("commands = %s", got)
	}
}
