package cli

import (
	"encoding/json"
	"io"
	"net/http"
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
	f.find("books_journal_entries", "entryposted0001")["status"] = "void"
	cases := []struct{ id, want, notWant string }{
		{"entrydraft00001", "journal entry entrydraft00001 is draft: only a posted one can be voided; delete a draft with `tinycld books journal-entries delete`", ""},
		{"entryposted0001", "journal entry entryposted0001 is void: only a posted one can be voided; it is already void", "delete a draft"},
		{"entryinvoice001", `has the doc_type "invoice", not "journal"`, ""},
	}
	for _, tc := range cases {
		_, _, err := runCmd(t, f.serve(), "", "books", "journal-entries", "void", tc.id, "--yes", "--json")
		if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: exit = %d, err = %v", tc.id, got, err)
		}
		if tc.notWant != "" && err != nil && strings.Contains(err.Error(), tc.notWant) {
			t.Errorf("%s: err = %v, must not say %q", tc.id, err, tc.notWant)
		}
	}
	if f.lastPatch != nil {
		t.Errorf("a refused void sent %v", f.lastPatch)
	}
}

// The change is stored, so a read after it that answers 404 must not exit 5
// ("no such document"): a script would take the document for gone.
func TestDocumentStatusChangeExitsFailedWhenTheReadAfterItAnswers404(t *testing.T) {
	cases := []struct {
		verb, id, want string
		args           []string
	}{
		{"post", "entrydraft00001", "journal entry entrydraft00001 was posted, and then it could not be read", nil},
		{"void", "entryposted0001", "journal entry entryposted0001 was voided, and then it could not be read", []string{"--yes"}},
	}
	for _, tc := range cases {
		t.Run(tc.verb, func(t *testing.T) {
			f := journal(t)
			inner := f.handler()
			// Arm the refusal once the change is stored, so the read before it works.
			c := clientFor(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				inner.ServeHTTP(w, r)
				if r.Method == http.MethodPatch {
					f.refuse("GET", 404, `{"data":{},"message":"The requested resource wasn't found.","status":404}`)
				}
			}))
			args := append([]string{"books", "journal-entries", tc.verb, tc.id, "--json"}, tc.args...)
			_, _, err := runCmd(t, c, "", args...)
			if got := exitcode.Of(err); got != exitcode.Failed {
				t.Errorf("exit = %d, want %d (%v)", got, exitcode.Failed, err)
			}
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %v, want %q", err, tc.want)
			}
			if f.lastPatch == nil {
				t.Error("the change was not sent")
			}
		})
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
