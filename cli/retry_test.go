package cli

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"tinycld.org/cli/exitcode"
)

// quickResends takes the pauses out of the resends, for the length of a test.
func quickResends(t *testing.T) {
	t.Helper()
	orig := resendWaits
	resendWaits = make([]time.Duration, len(orig))
	t.Cleanup(func() { resendWaits = orig })
}

// sends counts the writes the command sent with this request line
// ("POST /api/batch").
func sends(f *fakeBooks, line string) int {
	n := 0
	for _, request := range f.requests {
		if request == line {
			n++
		}
	}
	return n
}

// rowsOf counts the stored rows of a collection whose field holds id.
func rowsOf(f *fakeBooks, collection, field, id string) int {
	n := 0
	for _, row := range f.rows[collection] {
		if row[field] == id {
			n++
		}
	}
	return n
}

const batchLine = "POST " + batchPath

// The first send was stored and its answer was lost. The resend is the same
// batch with the same ids, so the server refuses it; the command reads the
// entry and reports it added, and nothing is stored twice.
func TestDocumentAddResendsAfterTheAnswerOfAStoredBatchIsLost(t *testing.T) {
	cases := []struct {
		name   string
		status int
		post   bool
	}{
		{"a proxy answers 502", 502, false},
		{"the connection closes", 0, false},
		{"with --post, a proxy answers 504", 504, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			quickResends(t)
			f := journal(t)
			fixedIDs(t, "entrynew0000001")
			f.loseAnswers(fakeSilence{stored: true, status: tc.status})
			args := []string{"books", "journal-entries", "add", "--input", "-", "--json"}
			done := "added journal entry"
			if tc.post {
				args = append(args, "--post")
				done = "added and posted journal entry"
			}
			out, errOut, err := runCmd(t, f.serve(), newEntry, args...)
			if err != nil {
				t.Fatalf("exit %d: %v", exitcode.Of(err), err)
			}
			if got := sends(f, batchLine); got != 2 {
				t.Errorf("the command sent %d batches, want 2", got)
			}
			first, _ := json.Marshal(f.batches[0])
			if len(f.batches) != 2 || sentBatch(t, f, 1) != string(first) {
				t.Errorf("the resend is not the same batch:\n%s\nfirst:\n%s", sentBatch(t, f, 1), first)
			}
			if rowsOf(f, "books_journal_entries", "id", "entrynew0000001") != 1 || rowsOf(f, "books_journal_lines", "entry", "entrynew0000001") != 2 {
				t.Errorf("stored: entries %v", f.rows["books_journal_entries"])
			}
			if !strings.Contains(out, `"id": "entrynew0000001"`) || !strings.Contains(errOut, done+" entrynew0000001") {
				t.Errorf("stdout:\n%s\nstderr: %q", out, errOut)
			}
		})
	}
}

// The first send was not stored: the resend stores the entry once.
func TestDocumentAddResendsABatchThatWasNotStored(t *testing.T) {
	quickResends(t)
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	f.loseAnswers(fakeSilence{stored: false, status: 503}, fakeSilence{stored: false, status: 0})
	if _, _, err := runCmd(t, f.serve(), newEntry, "books", "journal-entries", "add", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	if got := sends(f, batchLine); got != 3 {
		t.Errorf("the command sent %d batches, want 3", got)
	}
	if rowsOf(f, "books_journal_entries", "id", "entrynew0000001") != 1 || rowsOf(f, "books_journal_lines", "entry", "entrynew0000001") != 2 {
		t.Errorf("the entry is not stored once: %v", f.rows["books_journal_entries"])
	}
}

// A server error is not a lost answer: the server answered, so the batch is
// not sent again.
func TestDocumentAddDoesNotResendAfterAServerError(t *testing.T) {
	quickResends(t)
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	f.loseAnswers(fakeSilence{stored: false, status: 500})
	_, _, err := runCmd(t, f.serve(), newEntry, "books", "journal-entries", "add", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Unavailable {
		t.Errorf("exit = %d, want %d (%v)", got, exitcode.Unavailable, err)
	}
	if got := sends(f, batchLine); got != 1 {
		t.Errorf("the command sent %d batches, want 1", got)
	}
}

// No answer to any send: exit 7, and the message names the id, how to check
// it, and how to send it again safely.
func TestDocumentAddWhenNoSendIsAnsweredNamesTheIDAndHowToCheck(t *testing.T) {
	quickResends(t)
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	for range len(resendWaits) + 1 {
		f.loseAnswers(fakeSilence{stored: false, status: 504})
	}
	out, _, err := runCmd(t, f.serve(), newEntry, "books", "journal-entries", "add", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Unavailable {
		t.Fatalf("exit = %d, want %d (%v)", got, exitcode.Unavailable, err)
	}
	if got := sends(f, batchLine); got != len(resendWaits)+1 {
		t.Errorf("the command sent %d batches, want %d", got, len(resendWaits)+1)
	}
	if f.find("books_journal_entries", "entrynew0000001") != nil {
		t.Error("the entry was stored")
	}
	var doc errorDoc
	if err := json.Unmarshal([]byte(out), &doc); err != nil {
		t.Fatalf("stdout is not the error document: %v\n%s", err, out)
	}
	for _, message := range []string{err.Error(), doc.Error.Message} {
		for _, want := range []string{"journal entry entrynew0000001", "`tinycld books journal-entries show entrynew0000001`", "--id entrynew0000001"} {
			if !strings.Contains(message, want) {
				t.Errorf("the message has no %q: %s", want, message)
			}
		}
	}
	if doc.Error.Exit != exitcode.Unavailable || doc.Error.Code != "unavailable" || doc.Error.Status != 504 {
		t.Errorf("error = %+v", doc.Error)
	}
}

// --id: the caller names the id. A second run with an id that is stored writes
// nothing and says how to show the document.
func TestDocumentAddWithAStoredIDIsRefused(t *testing.T) {
	f := journal(t)
	fixedIDs(t)
	c := f.serve()
	if _, _, err := runCmd(t, c, newEntry, "books", "journal-entries", "add", "--id", "myentry00000001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	if f.find("books_journal_entries", "myentry00000001") == nil {
		t.Fatal("the entry was not stored with the given id")
	}
	_, _, err := runCmd(t, c, newEntry, "books", "journal-entries", "add", "--id", "myentry00000001", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused {
		t.Fatalf("exit = %d, want %d (%v)", got, exitcode.Refused, err)
	}
	for _, want := range []string{"journal entry myentry00000001 already exists", "`tinycld books journal-entries show myentry00000001`"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("err has no %q: %v", want, err)
		}
	}
	if got := sends(f, batchLine); got != 1 {
		t.Errorf("the command sent %d batches, want 1", got)
	}
}

func TestEveryCreateCommandRefusesABadID(t *testing.T) {
	commands := [][]string{
		{"books", "journal-entries", "add"},
		{"books", "payments", "add"},
		{"books", "write-offs", "add"},
		{"books", "estimates", "convert", "estpending00001"},
		{"books", "journal-entries", "edit", "entryposted0001"},
	}
	for _, bad := range []string{"short", "abcdefghijklmnop", "ABCDEFGHIJKLMNO", "abc-defghijklmn", ""} {
		for _, command := range commands {
			f := journal(t)
			args := append(append([]string{}, command...), "--id", bad, "--input", "-", "--json")
			_, _, err := runCmd(t, f.serve(), `{"date": "2026-07-15"}`, args...)
			if got := exitcode.Of(err); got != exitcode.Usage {
				t.Errorf("%v: exit = %d, want %d (%v)", args, got, exitcode.Usage, err)
			}
			if err == nil || !strings.Contains(err.Error(), "--id") {
				t.Errorf("%v: err = %v", args, err)
			}
			if len(f.requests) != 0 {
				t.Errorf("%v: the command sent %v", args, f.requests)
			}
		}
	}
}

// Every command that creates a document takes --id: add, convert, and edit,
// whose correction of a posted document is a new one.
func TestEveryCreateCommandTakesID(t *testing.T) {
	root := newTestRoot(nil)
	for i := range documents {
		doc := &documents[i]
		names := []string{"add"}
		if doc.Convert != nil {
			names = append(names, "convert")
		}
		if doc.corrects() {
			names = append(names, "edit")
		}
		if doc.applyTable() != nil {
			names = append(names, "apply")
		}
		for _, name := range names {
			cmd, _, err := root.Find([]string{"books", doc.Name, name})
			if err != nil {
				t.Fatal(err)
			}
			if cmd.Flags().Lookup("id") == nil {
				t.Errorf("%s %s has no --id", doc.Name, name)
			}
		}
	}
}

func TestConvertResendsAfterTheAnswerOfAStoredBatchIsLost(t *testing.T) {
	quickResends(t)
	f := quotes(t)
	fixedIDs(t, "invfromest00001")
	f.loseAnswers(fakeSilence{stored: true, status: 0})
	_, errOut, err := runCmd(t, f.serve(), `{"date": "2026-11-06", "due_date": "2026-12-06"}`, "books", "estimates", "convert", "estpending00001", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if rowsOf(f, "books_invoices", "estimate", "estpending00001") != 1 || rowsOf(f, "books_invoice_lines", "invoice", "invfromest00001") != 2 {
		t.Errorf("invoices: %v", f.rows["books_invoices"])
	}
	if !strings.Contains(errOut, "added invoice invfromest00001 from estimate") {
		t.Errorf("stderr = %q", errOut)
	}
}

func TestConvertWithAStoredIDIsRefused(t *testing.T) {
	f := quotes(t)
	fixedIDs(t)
	_, _, err := runCmd(t, f.serve(), `{"date": "2026-11-06", "due_date": "2026-12-06"}`, "books", "estimates", "convert", "estpending00001", "--id", "invposted000001", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused {
		t.Fatalf("exit = %d, want %d (%v)", got, exitcode.Refused, err)
	}
	if !strings.Contains(err.Error(), "invoice invposted000001 already exists") || !strings.Contains(err.Error(), "`tinycld books invoices show invposted000001`") {
		t.Errorf("err = %v", err)
	}
	if sends(f, batchLine) != 0 {
		t.Errorf("the command sent %v", f.requests)
	}
}

// The correction of a posted entry creates a new one: its resend is reported
// as the correction.
func TestCorrectionResendsAfterTheAnswerOfAStoredBatchIsLost(t *testing.T) {
	quickResends(t)
	f := journal(t)
	fixedIDs(t, "entrynew0000001")
	f.loseAnswers(fakeSilence{stored: true, status: 502})
	_, errOut, err := runCmd(t, f.serve(), `{"memo": "Corrected"}`, "books", "journal-entries", "edit", "entryposted0001", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if rowsOf(f, "books_journal_entries", "replaces", "entryposted0001") != 1 {
		t.Errorf("entries: %v", f.rows["books_journal_entries"])
	}
	if !strings.Contains(errOut, "corrected journal entry") || !strings.Contains(errOut, "(entrynew0000001) is posted in its place") {
		t.Errorf("stderr = %q", errOut)
	}
}

func TestCorrectionWithAStoredIDIsRefused(t *testing.T) {
	f := journal(t)
	fixedIDs(t)
	c := f.serve()
	if _, _, err := runCmd(t, c, `{"memo": "Corrected"}`, "books", "journal-entries", "edit", "entryposted0001", "--id", "myentry00000001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	if row := f.find("books_journal_entries", "myentry00000001"); row == nil || row["replaces"] != "entryposted0001" {
		t.Fatalf("the correction = %v", row)
	}
	_, _, err := runCmd(t, c, `{"memo": "Corrected"}`, "books", "journal-entries", "edit", "entryposted0001", "--id", "myentry00000001", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "journal entry myentry00000001 already exists") {
		t.Fatalf("exit = %d, want %d (%v)", got, exitcode.Refused, err)
	}
	if got := sends(f, batchLine); got != 1 {
		t.Errorf("the command sent %d batches, want 1", got)
	}
}

// The first send of a draft edit was stored. The resend states the revision
// the first one made, so the server refuses it; the draft holds the edit, so
// the command reports it updated.
func TestDraftEditWhoseFirstSendWasStoredIsReportedUpdated(t *testing.T) {
	quickResends(t)
	f := journal(t)
	f.loseAnswers(fakeSilence{stored: true, status: 502})
	changes := `{"memo": "Rent for July", "lines": [
		{"account": "acctchecking001", "credit": 130000},
		{"account": "acctincome00001", "debit": 130000}]}`
	_, errOut, err := runCmd(t, f.serve(), changes, "books", "journal-entries", "edit", "entrydraft00001", "--input", "-", "--json")
	if err != nil {
		t.Fatalf("exit %d: %v", exitcode.Of(err), err)
	}
	if got := sends(f, batchLine); got != 2 {
		t.Errorf("the command sent %d batches, want 2", got)
	}
	if row := f.find("books_journal_entries", "entrydraft00001"); row["revision"] != json.Number("2") || row["memo"] != "Rent for July" {
		t.Errorf("the draft = %v", row)
	}
	if !strings.Contains(errOut, "updated journal entry entrydraft00001") {
		t.Errorf("stderr = %q", errOut)
	}
}

// A payment has no revision. Its edit gives a new row an id of the CLI, so
// the resend of a stored edit is refused and the row is not stored twice.
func TestDraftEditOfATypeWithNoRevisionIsNotStoredTwice(t *testing.T) {
	quickResends(t)
	f := received(t)
	fixedIDs(t, "payapplynew0001")
	f.loseAnswers(fakeSilence{stored: true, status: 0})
	changes := `{"applications": [{"invoice": "invposted000001", "amount": 3000}, {"invoice": "invdraft0000001", "amount": 1000}]}`
	_, errOut, err := runCmd(t, f.serve(), changes, "books", "payments", "edit", "paydraft0000001", "--input", "-", "--json")
	if err != nil {
		t.Fatalf("exit %d: %v", exitcode.Of(err), err)
	}
	if got := rowsOf(f, "books_payment_applications", "payment", "paydraft0000001"); got != 2 {
		t.Errorf("the draft has %d applications, want 2: %v", got, f.rows["books_payment_applications"])
	}
	if f.find("books_payment_applications", "payapplynew0001") == nil {
		t.Error("the new application does not have the CLI's id")
	}
	if !strings.Contains(errOut, "updated payment") {
		t.Errorf("stderr = %q", errOut)
	}
}

// A resend that is refused, of a draft that does not hold the edit: another
// caller changed it, and the refusal is the answer.
func TestDraftHoldsEdit(t *testing.T) {
	doc := findDocument("journal-entries")
	f := journal(t)
	c := f.serve()
	current, err := fetchDocument(t.Context(), c, doc, "entrydraft00001")
	if err != nil {
		t.Fatal(err)
	}
	body, err := parseObject([]byte(`{"memo": "", "lines": [{"account": "acctchecking001", "debit": 120000}, {"account": "acctincome00001", "credit": 120000, "memo": "July"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	in, err := checkDocumentInput(doc, "tinycld books journal-entries", body, false)
	if err != nil {
		t.Fatal(err)
	}
	if !holdsEdit(doc, current, in) {
		t.Errorf("the stored draft holds the edit: %v", current.values)
	}
	in.header["memo"] = "Other"
	if holdsEdit(doc, current, in) {
		t.Error("a draft with another memo holds the edit")
	}
	in.header["memo"] = nil
	in.lines["lines"] = in.lines["lines"][:1]
	if holdsEdit(doc, current, in) {
		t.Error("a draft with another number of lines holds the edit")
	}
}

func TestApplyResendsAfterTheAnswerOfAStoredWriteIsLost(t *testing.T) {
	quickResends(t)
	f := credited(t)
	fixedIDs(t, "applynew0000001")
	f.loseAnswers(fakeSilence{stored: true, status: 503})
	_, errOut, err := runCmd(t, f.serve(), `{"invoice": "invposted000001", "amount": 100, "date": "2026-11-09"}`, "books", "credit-memos", "apply", "memoposted00001", "--input", "-", "--json")
	if err != nil {
		t.Fatalf("exit %d: %v", exitcode.Of(err), err)
	}
	if got := sends(f, "POST /api/collections/books_credit_memo_applications/records"); got != 2 {
		t.Errorf("the command sent %d creates, want 2", got)
	}
	if rowsOf(f, "books_credit_memo_applications", "id", "applynew0000001") != 1 {
		t.Errorf("applications: %v", f.rows["books_credit_memo_applications"])
	}
	if !strings.Contains(errOut, "applied credit memo") {
		t.Errorf("stderr = %q", errOut)
	}
}
