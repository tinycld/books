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
	// Each stored row, in its order, takes the new row of its place: every
	// writable field, null for one the row does not name. The header change is
	// last.
	want := `[` +
		`{"method":"PATCH","url":"/api/collections/books_journal_lines/records/linedraft000001","body":{"account":"acctchecking001","credit":130000,"customer":null,"debit":null,"memo":null,"position":0,"vendor":null}},` +
		`{"method":"PATCH","url":"/api/collections/books_journal_lines/records/linedraft000002","body":{"account":"acctincome00001","credit":null,"customer":null,"debit":130000,"memo":null,"position":1,"vendor":null}},` +
		`{"method":"PATCH","url":"/api/collections/books_journal_entries/records/entrydraft00001","body":{"memo":"Rent for July","revision":2}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(out, `"memo": "Rent for July"`) || !strings.Contains(out, `"credit": 130000`) || !strings.Contains(out, `"revision": 2`) {
		t.Errorf("printed:\n%s", out)
	}
	// The cleared fields are empty, as the server stores a null.
	if line := f.find("books_journal_lines", "linedraft000002"); line["credit"] != json.Number("0") || line["memo"] != "" {
		t.Errorf("the second line = %v, want credit 0 and no memo", line)
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

// A journal entry takes 1000 lines, and the server takes 1100 writes in one
// batch. An edit of a full draft changes each stored row in place: 1000 row
// writes and the header, so it fits, as the `add` of the same lines does.
func TestDocumentEditOfA1000LineDraftChangesTheRowsInPlace(t *testing.T) {
	f := journal(t)
	for i := range 998 {
		f.addRow("books_journal_lines", fmt.Sprintf("bigline%08d", i), map[string]any{"entry": "entrydraft00001", "position": cents(i + 2), "account": "acctchecking001", "credit": cents(5)})
	}
	rows := strings.TrimSuffix(strings.Repeat(`{"account": "acctchecking001", "debit": 1},`, 1000), ",")
	if _, _, err := runCmd(t, f.serve(), `{"lines": [`+rows+`]}`, "books", "journal-entries", "edit", "entrydraft00001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	ops := f.batches[0]
	if len(ops) != 1001 {
		t.Fatalf("the edit sent %d writes, want 1001", len(ops))
	}
	for i, op := range ops[:1000] {
		if op.Method != "PATCH" {
			t.Fatalf("write %d is a %s, want a PATCH of a stored row", i, op.Method)
		}
	}
	stored := 0
	for _, line := range f.rows["books_journal_lines"] {
		if line["entry"] != "entrydraft00001" {
			continue
		}
		stored++
		if line["debit"] != json.Number("1") || line["credit"] != json.Number("0") {
			t.Fatalf("line %v: want debit 1 and credit 0", line)
		}
	}
	if stored != 1000 || len(f.deleted) != 0 {
		t.Errorf("the draft has %d lines and %d were removed, want 1000 and none", stored, len(f.deleted))
	}
	add := journal(t)
	if _, _, err := runCmd(t, add.serve(), `{"date": "2026-07-15", "lines": [`+rows+`]}`, "books", "journal-entries", "add", "--input", "-", "--json"); err != nil {
		t.Fatalf("an add of 1000 lines: %v", err)
	}
	if got := len(add.batches[0]); got != 1001 {
		t.Errorf("the add sent %d writes, want 1001", got)
	}
}

// Fewer rows than are stored: the extra stored rows go first, then the kept
// ones change. More rows: the stored rows change, then the new ones are
// created.
func TestDocumentEditOfADraftRemovesOrCreatesTheRowsBeyondTheStoredOnes(t *testing.T) {
	f := journal(t)
	if _, _, err := runCmd(t, f.serve(), `{"lines": [{"account": "acctchecking001", "debit": 3}]}`, "books", "journal-entries", "edit", "entrydraft00001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"DELETE","url":"/api/collections/books_journal_lines/records/linedraft000002"},` +
		`{"method":"PATCH","url":"/api/collections/books_journal_lines/records/linedraft000001","body":{"account":"acctchecking001","credit":null,"customer":null,"debit":3,"memo":null,"position":0,"vendor":null}},` +
		`{"method":"PATCH","url":"/api/collections/books_journal_entries/records/entrydraft00001","body":{"revision":2}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	// A created row has an id of the CLI, so a resend cannot store it twice.
	fixedIDs(t, "linenew00000001")
	rows := `{"account": "acctchecking001", "debit": 4}, {"account": "acctincome00001", "credit": 4}`
	if _, _, err := runCmd(t, f.serve(), `{"lines": [`+rows+`]}`, "books", "journal-entries", "edit", "entrydraft00001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	want = `[` +
		`{"method":"PATCH","url":"/api/collections/books_journal_lines/records/linedraft000001","body":{"account":"acctchecking001","credit":null,"customer":null,"debit":4,"memo":null,"position":0,"vendor":null}},` +
		`{"method":"POST","url":"/api/collections/books_journal_lines/records","body":{"account":"acctincome00001","credit":4,"entry":"entrydraft00001","id":"linenew00000001","position":1}},` +
		`{"method":"PATCH","url":"/api/collections/books_journal_entries/records/entrydraft00001","body":{"revision":3}}]`
	if got := sentBatch(t, f, 1); got != want {
		t.Errorf("the second batch:\n%s\nwant:\n%s", got, want)
	}
}

// The biggest `add` or correction of any type (every table at its most rows,
// the header and the post) fits in one batch, and so does an edit of one
// table of a draft: one write for each row, or two (a remove and a create) for
// a table that refuses an update, and the header. So the refusal over the limit
// can always say to name one table in each call.
func TestEveryDocumentWriteFitsInOneBatch(t *testing.T) {
	for i := range documents {
		doc := &documents[i]
		writes := 2
		for j := range doc.Lines {
			table := &doc.Lines[j]
			if table.ReadOnly || table.Apply {
				continue
			}
			writes += table.maxRows()
			edit := 1 + table.maxRows()
			if table.NoUpdate {
				edit = 1 + 2*table.maxRows()
			}
			if edit > maxBatchWrites {
				t.Errorf("%s.%s: an edit of the table alone is %d writes, and Books takes %d in one batch", doc.Name, table.Key, edit, maxBatchWrites)
			}
		}
		if writes > maxBatchWrites {
			t.Errorf("%s: the biggest add is %d writes, and Books takes %d in one batch", doc.Name, writes, maxBatchWrites)
		}
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
