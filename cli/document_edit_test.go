package cli

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

func TestDocumentEditOfADraftReplacesTheLinesAndStatesTheNextRevision(t *testing.T) {
	f := journal(t)
	changes := `{"memo": "Rent for July", "lines": [
		{"account": "acctchecking001", "credit": 130000},
		{"account": "acctincome00001", "debit": 130000}]}`
	out, errOut, err := runCmd(t, f.serve(), changes, "books", "journal-entries", "edit", "entrydraft00001", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	// The removes name the lines in their order, the header change is last.
	want := `[` +
		`{"method":"DELETE","url":"/api/collections/books_journal_lines/records/linedraft000001"},` +
		`{"method":"DELETE","url":"/api/collections/books_journal_lines/records/linedraft000002"},` +
		`{"method":"POST","url":"/api/collections/books_journal_lines/records","body":{"account":"acctchecking001","credit":130000,"entry":"entrydraft00001","position":0}},` +
		`{"method":"POST","url":"/api/collections/books_journal_lines/records","body":{"account":"acctincome00001","debit":130000,"entry":"entrydraft00001","position":1}},` +
		`{"method":"PATCH","url":"/api/collections/books_journal_entries/records/entrydraft00001","body":{"memo":"Rent for July","revision":2}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(out, `"memo": "Rent for July"`) || !strings.Contains(out, `"credit": 130000`) || !strings.Contains(out, `"revision": 2`) {
		t.Errorf("printed:\n%s", out)
	}
	if !strings.Contains(errOut, "updated journal entry entrydraft00001") {
		t.Errorf("stderr = %q", errOut)
	}
}

func TestDocumentEditOfADraftHeaderKeepsTheLines(t *testing.T) {
	f := journal(t)
	_, _, err := runCmd(t, f.serve(), `{"memo": null}`, "books", "journal-entries", "edit", "entrydraft00001", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if got := sentBatch(t, f, 0); got != `[{"method":"PATCH","url":"/api/collections/books_journal_entries/records/entrydraft00001","body":{"memo":null,"revision":2}}]` {
		t.Errorf("the batch = %s", got)
	}
	if f.find("books_journal_lines", "linedraft000001") == nil {
		t.Error("an edit that names no lines removed a line")
	}
}

// Lines alone: the header change still goes last, with the revision and
// nothing else, so the server restates the totals and checks the revision.
func TestDocumentEditOfLinesAloneStillStatesTheRevision(t *testing.T) {
	f := journal(t)
	_, _, err := runCmd(t, f.serve(), `{"lines": []}`, "books", "journal-entries", "edit", "entrydraft00001", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	ops := f.batches[0]
	last, _ := json.Marshal(ops[len(ops)-1])
	if len(ops) != 3 || string(last) != `{"method":"PATCH","url":"/api/collections/books_journal_entries/records/entrydraft00001","body":{"revision":2}}` {
		t.Errorf("the batch = %s", sentBatch(t, f, 0))
	}
}

// A journal entry takes 1000 lines, and an edit of a draft removes the old
// rows and creates the new ones: 2000 writes, and the server takes 1100 in one
// batch. The command sends nothing and says what to do: `add` of the same
// lines is one write for each line and fits.
func TestDocumentEditOfAFullDraftSaysWhatToDo(t *testing.T) {
	f := journal(t)
	for i := range 998 {
		f.addRow("books_journal_lines", fmt.Sprintf("bigline%08d", i), map[string]any{"entry": "entrydraft00001", "position": cents(i + 2), "account": "acctchecking001"})
	}
	rows := strings.TrimSuffix(strings.Repeat(`{"account": "acctchecking001", "debit": 1},`, 1000), ",")
	_, _, err := runCmd(t, f.serve(), `{"lines": [`+rows+`]}`, "books", "journal-entries", "edit", "entrydraft00001", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
	for _, want := range []string{"this change is 2001 writes, and Books takes 1100 in one step", "delete", "add"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("the message %q does not say %q", err, want)
		}
	}
	for _, request := range f.requests {
		if !strings.HasPrefix(request, "GET ") {
			t.Errorf("the refused edit sent %s", request)
		}
	}
	add := journal(t)
	if _, _, err := runCmd(t, add.serve(), `{"date": "2026-07-15", "lines": [`+rows+`]}`, "books", "journal-entries", "add", "--input", "-", "--json"); err != nil {
		t.Fatalf("an add of 1000 lines: %v", err)
	}
	if got := len(add.batches[0]); got != 1001 {
		t.Errorf("the add sent %d writes, want 1001", got)
	}
}

func TestDocumentEditThatAnotherCallerWasFirstForChangesNothing(t *testing.T) {
	f := journal(t)
	// The entry was saved by another caller after this fixture's revision 1.
	f.find("books_journal_entries", "entrydraft00001")["revision"] = json.Number("4")
	client := f.serve()
	// The command reads revision 4 and states 5: accepted. To be stale, the
	// other save must land between the read and the write.
	f.refuse("PATCH", 409, `{"data":{},"message":"`+msgStaleRevision+`","status":409}`)
	out, _, err := runCmd(t, client, `{"memo": "mine", "lines": []}`, "books", "journal-entries", "edit", "entrydraft00001", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused {
		t.Fatalf("exit = %d, want %d (%v)", got, exitcode.Refused, err)
	}
	var doc errorDoc
	if json.Unmarshal([]byte(out), &doc) != nil || doc.Error.Status != 409 || !strings.Contains(doc.Error.Message, "changed after you opened it") {
		t.Errorf("error document:\n%s", out)
	}
	if f.find("books_journal_lines", "linedraft000001") == nil {
		t.Error("a refused edit removed a line")
	}
	if !strings.Contains(sentBatch(t, f, 0), `"revision":5`) {
		t.Errorf("the batch did not state the stored revision plus one: %s", sentBatch(t, f, 0))
	}
}

func TestDocumentEditOfAPostedDocumentPostsACorrection(t *testing.T) {
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	out, errOut, err := runCmd(t, f.serve(), `{"memo": "Corrected"}`, "books", "journal-entries", "edit", "entryposted0001", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	// A new document that names the posted one in `replaces`, with the posted
	// document's own values and lines under the change, posted in the same batch.
	// The server voids the posted one (server/entries.go); the fake does not.
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_journal_entries/records","body":{"auto_reverse_on":"","date":"2026-07-10","doc_type":"journal","id":"entrynew0000001","memo":"Corrected","origin":"manual","replaces":"entryposted0001","status":"draft"}},` +
		`{"method":"POST","url":"/api/collections/books_journal_lines/records","body":{"account":"acctchecking001","credit":0,"customer":"","debit":50000,"entry":"entrynew0000001","memo":"","position":0,"vendor":""}},` +
		`{"method":"POST","url":"/api/collections/books_journal_lines/records","body":{"account":"acctsavings0001","credit":50000,"customer":"","debit":0,"entry":"entrynew0000001","memo":"","position":1,"vendor":""}},` +
		`{"method":"PATCH","url":"/api/collections/books_journal_entries/records/entrynew0000001","body":{"revision":1,"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(out, `"id": "entrynew0000001"`) || !strings.Contains(out, `"replaces": "entryposted0001"`) {
		t.Errorf("the command must print the new document:\n%s", out)
	}
	if !strings.Contains(errOut, "corrected journal entry 7: it is void, and entrynew0000001 (entrynew0000001) is posted in its place") {
		t.Errorf("stderr = %q", errOut)
	}
}

// The correction is stored: the message names the new id as added and posted,
// and the original as the one it replaces.
func TestDocumentEditSaysWhenTheReadAfterACorrectionFails(t *testing.T) {
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	handler := f.handler()
	stored := false
	failing := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if stored && r.Method == http.MethodGet {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(404)
			w.Write([]byte(`{"data":{},"message":"The requested resource wasn't found.","status":404}`))
			return
		}
		handler.ServeHTTP(w, r)
		stored = stored || r.Method == http.MethodPost
	})
	_, _, err := runCmd(t, clientFor(t, failing), `{"memo": "Corrected"}`, "books", "journal-entries", "edit", "entryposted0001", "--input", "-", "--json")
	want := "journal entry entrynew0000001 was added and posted to replace entryposted0001, and then it could not be read"
	if err == nil || !strings.Contains(err.Error(), want) {
		t.Errorf("err = %v, want %q", err, want)
	}
	if got := exitcode.Of(err); got != exitcode.Failed {
		t.Errorf("exit = %d, want %d", got, exitcode.Failed)
	}
}

func TestDocumentEditOfAPostedDocumentWithNewLines(t *testing.T) {
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	changes := `{"lines": [{"account": "acctchecking001", "debit": 700}, {"account": "acctincome00001", "credit": 700}]}`
	if _, _, err := runCmd(t, f.serve(), changes, "books", "journal-entries", "edit", "entryposted0001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	got := sentBatch(t, f, 0)
	if strings.Contains(got, "acctsavings0001") || !strings.Contains(got, `"body":{"account":"acctincome00001","credit":700,"entry":"entrynew0000001","position":1}`) {
		t.Errorf("the correction must have the lines of the input only:\n%s", got)
	}
}

func TestDocumentEditRefusesWhatItMustNotChange(t *testing.T) {
	f := journal(t)
	f.find("books_journal_entries", "entryposted0001")["status"] = "void"
	cases := []struct{ id, want string }{
		{"entryposted0001", "journal entry entryposted0001 is void: it cannot be changed; add a new journal entry with `tinycld books journal-entries add`"},
		{"entryinvoice001", `journal entry entryinvoice001 has the doc_type "invoice", not "journal"`},
	}
	for _, tc := range cases {
		_, _, err := runCmd(t, f.serve(), `{"memo": "x"}`, "books", "journal-entries", "edit", tc.id, "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Refused {
			t.Errorf("%s: exit = %d, want %d", tc.id, got, exitcode.Refused)
		}
		if err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: err = %v", tc.id, err)
		}
	}
	if len(f.batches) != 0 {
		t.Errorf("a refused edit sent %v", f.batches)
	}
}
