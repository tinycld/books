package cli

import (
	"encoding/json"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

const newEntry = `{"date": "2026-07-15", "memo": "Owner investment", "lines": [
	{"account": "acctchecking001", "debit": 50000},
	{"account": "acctincome00001", "credit": 50000, "memo": "Paid in"}]}`

// sentBatch is the writes of the batch a command sent, as the JSON of the
// request, so a test asserts the bytes on the wire.
func sentBatch(t *testing.T, f *fakeBooks, index int) string {
	t.Helper()
	if index >= len(f.batches) {
		t.Fatalf("the command sent %d batches, want more than %d", len(f.batches), index)
	}
	data, err := json.Marshal(f.batches[index])
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestDocumentAddSendsTheHeaderAndTheLinesInOneBatch(t *testing.T) {
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	out, errOut, err := runCmd(t, f.serve(), newEntry, "books", "journal-entries", "add", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_journal_entries/records","body":{"date":"2026-07-15","doc_type":"journal","id":"entrynew0000001","memo":"Owner investment","origin":"manual","status":"draft"}},` +
		`{"method":"POST","url":"/api/collections/books_journal_lines/records","body":{"account":"acctchecking001","debit":50000,"entry":"entrynew0000001","position":0}},` +
		`{"method":"POST","url":"/api/collections/books_journal_lines/records","body":{"account":"acctincome00001","credit":50000,"entry":"entrynew0000001","memo":"Paid in","position":1}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if len(f.batches) != 1 || strings.Join(f.requests[:1], "") != "POST /api/batch" {
		t.Errorf("requests = %v", f.requests)
	}
	var got struct {
		ID, Status string
		Lines      []struct{ Account string }
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("stdout is not one JSON document: %v\n%s", err, out)
	}
	if got.ID != "entrynew0000001" || got.Status != "draft" || len(got.Lines) != 2 || got.Lines[1].Account != "acctincome00001" {
		t.Errorf("printed = %+v", got)
	}
	if !strings.Contains(errOut, "added journal entry entrynew0000001 (entrynew0000001)") {
		t.Errorf("stderr = %q", errOut)
	}
}

// The document is read after the batch, so the totals printed are the ones the
// server stored, not the ones the header had when it was created.
func TestDocumentAddPrintsWhatTheServerStored(t *testing.T) {
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	out, _, err := runCmd(t, f.serve(), newEntry, "books", "journal-entries", "add", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	last := f.requests[len(f.requests)-2:]
	if last[0] != "GET /api/collections/books_journal_entries/records/entrynew0000001" || last[1] != "GET /api/collections/books_journal_lines/records" {
		t.Errorf("after the batch the command sent %v, want a read of the entry and of its lines", last)
	}
	if !strings.Contains(out, `"revision": 1`) {
		t.Errorf("the printed document has no stored revision:\n%s", out)
	}
}

func TestDocumentAddWithPostPostsInTheSameBatch(t *testing.T) {
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	out, errOut, err := runCmd(t, f.serve(), newEntry, "books", "journal-entries", "add", "--input", "-", "--post", "--json")
	if err != nil {
		t.Fatal(err)
	}
	ops := f.batches[0]
	last, _ := json.Marshal(ops[len(ops)-1])
	if len(ops) != 4 || string(last) != `{"method":"PATCH","url":"/api/collections/books_journal_entries/records/entrynew0000001","body":{"revision":1,"status":"posted"}}` {
		t.Errorf("the last write of %d = %s", len(ops), last)
	}
	if !strings.Contains(out, `"status": "posted"`) || !strings.Contains(errOut, "added and posted journal entry") {
		t.Errorf("stdout:\n%s\nstderr: %q", out, errOut)
	}
}

func TestDocumentAddThatIsRefusedStoresNothing(t *testing.T) {
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	f.refuse("PATCH", 400, `{"data":{},"message":"Debits (5.00) do not equal credits (4.00). The entry is out of balance by 1.00.","status":400}`)
	out, _, err := runCmd(t, f.serve(), newEntry, "books", "journal-entries", "add", "--input", "-", "--post", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused {
		t.Fatalf("exit = %d, want %d (%v)", got, exitcode.Refused, err)
	}
	var doc errorDoc
	if err := json.Unmarshal([]byte(out), &doc); err != nil {
		t.Fatalf("stdout is not the error document: %v\n%s", err, out)
	}
	if doc.Error.Code != "refused" || doc.Error.Status != 400 || doc.Error.Message != "post: Debits (5.00) do not equal credits (4.00). The entry is out of balance by 1.00." {
		t.Errorf("error = %+v", doc.Error)
	}
	if f.find("books_journal_entries", "entrynew0000001") != nil {
		t.Error("the entry of a refused batch was stored")
	}
	if len(f.requests) != 1 {
		t.Errorf("requests = %v, want the batch alone", f.requests)
	}
}

// A refusal names its write by the label of the write: the document for the
// header, and the key of the table with the index of the row for a line.
func TestCreateOpsLabelEachWrite(t *testing.T) {
	doc := findDocument("journal-entries")
	body, err := parseObject([]byte(newEntry))
	if err != nil {
		t.Fatal(err)
	}
	in, err := checkDocumentInput(doc, body, true)
	if err != nil {
		t.Fatal(err)
	}
	ops := append(createOps(doc, "entrynew0000001", in, ""), postOp(doc, "entrynew0000001", 1))
	labels := []string{}
	for _, op := range ops {
		labels = append(labels, op.Label)
	}
	if got, want := strings.Join(labels, ","), "journal entry,lines[0],lines[1],post"; got != want {
		t.Errorf("labels = %s, want %s", got, want)
	}
}

func TestDocumentAddNamesTheRefusedWriteAndItsFields(t *testing.T) {
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	// The header is the first POST of the batch; this refuses it as the server
	// refuses a record for a field.
	f.refuse("POST", 400, `{"data":{"date":{"code":"validation_required","message":"Cannot be blank."}},"message":"Failed to create record.","status":400}`)
	out, _, err := runCmd(t, f.serve(), newEntry, "books", "journal-entries", "add", "--input", "-", "--json")
	if err == nil || !strings.Contains(err.Error(), "journal entry: Failed to create record. (date: Cannot be blank.)") {
		t.Errorf("err = %v", err)
	}
	var doc errorDoc
	if json.Unmarshal([]byte(out), &doc) != nil || doc.Error.Fields["date"].Code != "validation_required" {
		t.Errorf("error document:\n%s", out)
	}
}

func TestDocumentAddOfATokenThatMayNotBatchIsExit4(t *testing.T) {
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	f.refuse("BATCH", 403, `{"data":{},"message":"Operation 1 of the batch requires the books:write scope","status":403}`)
	_, _, err := runCmd(t, f.serve(), newEntry, "books", "journal-entries", "add", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Forbidden {
		t.Errorf("exit = %d, want %d (%v)", got, exitcode.Forbidden, err)
	}
}

func TestDocumentAddChecksTheInputBeforeItSendsAnything(t *testing.T) {
	f := journal(t)
	bad := `{"date": "2026-07-15", "lines": [{"account": "acctchecking001", "debit": 500}, {"debit": 500}]}`
	_, _, err := runCmd(t, f.serve(), bad, "books", "journal-entries", "add", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Errorf("exit = %d, want %d", got, exitcode.Usage)
	}
	if err == nil || !strings.Contains(err.Error(), `lines[1]: "account" is required`) {
		t.Errorf("err = %v", err)
	}
	if len(f.requests) != 0 {
		t.Errorf("the command sent %v", f.requests)
	}
}

// The write was stored, so a failed read after it must not read as a failed add.
func TestDocumentAddSaysWhenTheReadAfterItFails(t *testing.T) {
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	f.refuse("GET", 503, `{"data":{},"message":"Busy.","status":503}`)
	_, _, err := runCmd(t, f.serve(), newEntry, "books", "journal-entries", "add", "--input", "-", "--json")
	if err == nil || !strings.Contains(err.Error(), "journal entry entrynew0000001 was added, and then it could not be read") {
		t.Errorf("err = %v", err)
	}
	if f.find("books_journal_entries", "entrynew0000001") == nil {
		t.Error("the entry was not stored")
	}
}

// A script that reads stdout must learn the id and that it was added, whatever
// the read answers.
func TestDocumentAddJSONErrorOfAFailedReadNamesTheIDAndSaysAdded(t *testing.T) {
	cases := []struct {
		name   string
		status int
		body   string
		exit   int
	}{
		{"404", 404, `{"data":{},"message":"The requested resource wasn't found.","status":404}`, exitcode.Failed},
		{"503", 503, `{"data":{},"message":"Busy.","status":503}`, exitcode.Unavailable},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := journal(t)
			fixedIDs(t, "entrynew0000001")
			f.refuse("GET", tc.status, tc.body)
			out, _, err := runCmd(t, f.serve(), newEntry, "books", "journal-entries", "add", "--input", "-", "--json")
			if got := exitcode.Of(err); got != tc.exit {
				t.Errorf("exit = %d, want %d (%v)", got, tc.exit, err)
			}
			var doc errorDoc
			if json.Unmarshal([]byte(out), &doc) != nil {
				t.Fatalf("stdout is not one JSON document:\n%s", out)
			}
			if !strings.Contains(doc.Error.Message, "journal entry entrynew0000001 was added") {
				t.Errorf("message = %q", doc.Error.Message)
			}
			if doc.Error.Exit != tc.exit || doc.Error.Status != tc.status {
				t.Errorf("exit = %d, status = %d, want %d, %d", doc.Error.Exit, doc.Error.Status, tc.exit, tc.status)
			}
		})
	}
}

// A script reads exit 5 as "no such document" and would send the add again.
func TestDocumentAddExitsFailedWhenTheReadAfterItAnswers404(t *testing.T) {
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	f.refuse("GET", 404, `{"data":{},"message":"The requested resource wasn't found.","status":404}`)
	_, _, err := runCmd(t, f.serve(), newEntry, "books", "journal-entries", "add", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Failed {
		t.Errorf("exit = %d, want %d (%v)", got, exitcode.Failed, err)
	}
	if err == nil || !strings.Contains(err.Error(), "journal entry entrynew0000001 was added, and then it could not be read") {
		t.Errorf("err = %v", err)
	}
	if f.find("books_journal_entries", "entrynew0000001") == nil {
		t.Error("the entry was not stored")
	}
}
