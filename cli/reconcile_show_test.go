package cli

import (
	"encoding/json"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// reconcileRowFields are the columns of the two collections that no list
// names, so that the fake knows the collections.
var reconcileRowFields = map[string][]field{
	reconcileLinesCollection: {
		{Name: "line", Type: typeString}, {Name: "account", Type: typeString}, {Name: "entry", Type: typeString},
		{Name: "date", Type: typeString}, {Name: "debit", Type: typeInteger}, {Name: "credit", Type: typeInteger},
		{Name: "memo", Type: typeString}, {Name: "number", Type: typeString}, {Name: "doc_type", Type: typeString},
		{Name: "document", Type: typeString}, {Name: "payee", Type: typeString}, {Name: "reconciliation", Type: typeString},
		{Name: "bank_matched", Type: typeBool},
	},
	clearedRowsCollection: {
		{Name: "reconciliation", Type: typeString}, {Name: "line", Type: typeString},
	},
}

const (
	reconLineIn   = "jline0000000001"
	reconLineOut  = "jline0000000002"
	reconLineLate = "jline0000000003"
	reconLineAug  = "jline0000000004"
)

// reconcileLinesFake is reconcileFake with four journal lines on checking: one
// cleared in August, one cleared in September, one open, and one dated after
// the September statement. The view does not follow the cleared rows in the
// fake: a test of a write asserts what was sent.
func reconcileLinesFake(t *testing.T) *fakeBooks {
	f := reconcileFake(t)
	for _, l := range []struct {
		id, date, recon string
		debit, credit   string
	}{
		{reconLineAug, "2026-08-20", reconAug, "120000", "0"},
		{reconLineIn, "2026-09-03", reconSept, "50000", "0"},
		{reconLineOut, "2026-09-10", "", "0", "8000"},
		{reconLineLate, "2026-10-02", "", "0", "100"},
	} {
		f.add(reconcileLinesCollection, l.id, map[string]any{
			"line": l.id, "account": "acctchecking001", "entry": "entry" + l.id[5:], "date": l.date,
			"debit": json.Number(l.debit), "credit": json.Number(l.credit), "reconciliation": l.recon,
			"doc_type": "journal", "bank_matched": false,
		})
	}
	f.add(clearedRowsCollection, "cleared00000001", map[string]any{"reconciliation": reconSept, "line": reconLineIn})
	return f
}

type reconShown struct {
	Status  string `json:"status"`
	Cleared []struct {
		Line  string `json:"line"`
		Debit int    `json:"debit"`
	} `json:"cleared"`
	Open []struct {
		Line   string `json:"line"`
		Credit int    `json:"credit"`
	} `json:"open"`
}

func shownRecon(t *testing.T, out string) reconShown {
	t.Helper()
	var got reconShown
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("stdout is not one JSON document: %v\n%s", err, out)
	}
	return got
}

func TestReconcileShow(t *testing.T) {
	f := reconcileLinesFake(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "reconcile", "show", reconSept, "--json")
	if err != nil {
		t.Fatal(err)
	}
	got := shownRecon(t, out)
	if len(got.Cleared) != 1 || got.Cleared[0].Line != reconLineIn || got.Cleared[0].Debit != 50000 {
		t.Errorf("cleared = %+v", got.Cleared)
	}
	// Not the August line (cleared there) and not the October line (after the
	// statement date).
	if len(got.Open) != 1 || got.Open[0].Line != reconLineOut || got.Open[0].Credit != 8000 {
		t.Errorf("open = %+v", got.Open)
	}
	queries := f.listed[reconcileLinesCollection]
	if len(queries) != 2 || queries[0].Get("filter") != `reconciliation = "`+reconSept+`"` || queries[0].Get("sort") != "date,id" ||
		queries[1].Get("filter") != `account = "acctchecking001" && reconciliation = "" && date <= "2026-09-30"` {
		t.Errorf("the reads of the view = %v", queries)
	}
}

func TestReconcileShowOfAFinishedOneHasNoOpenLines(t *testing.T) {
	f := reconcileLinesFake(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "reconcile", "show", reconAug, "--json")
	if err != nil {
		t.Fatal(err)
	}
	if got := shownRecon(t, out); len(got.Cleared) != 1 || len(got.Open) != 0 || !strings.Contains(out, `"open": []`) {
		t.Errorf("printed %s", out)
	}
	if n := len(f.listed[reconcileLinesCollection]); n != 1 {
		t.Errorf("%d reads of the view, want 1", n)
	}
}

// `reconcile clear` is one batch with a cleared row for each line that is not
// cleared yet (TestCLIReconcile_ATokenClearsAndUnclears sends the same writes).
func TestReconcileClear(t *testing.T) {
	f := reconcileLinesFake(t)
	fixedIDs(t, "clicleared00002")
	_, stderr, err := runCmd(t, f.serve(), `{"lines": ["`+reconLineIn+`", "`+reconLineOut+`"]}`,
		"books", "reconcile", "clear", reconSept, "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[{"method":"POST","url":"/api/collections/books_reconciliation_lines/records","body":{"id":"clicleared00002","line":"` + reconLineOut + `","reconciliation":"` + reconSept + `"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("sent\n  %s\nwant\n  %s", got, want)
	}
	if !strings.Contains(stderr, "cleared 1 of 2 lines") {
		t.Errorf("stderr = %s", stderr)
	}
}

func TestReconcileClearOfClearedLinesSendsNothing(t *testing.T) {
	f := reconcileLinesFake(t)
	_, _, err := runCmd(t, f.serve(), `{"lines": ["`+reconLineIn+`"]}`, "books", "reconcile", "clear", reconSept, "--input", "-")
	if err != nil {
		t.Fatal(err)
	}
	if len(f.batches) != 0 {
		t.Errorf("batches = %v, want none", f.batches)
	}
}

func TestReconcileUnclear(t *testing.T) {
	f := reconcileLinesFake(t)
	_, _, err := runCmd(t, f.serve(), `{"lines": ["`+reconLineIn+`", "`+reconLineOut+`"]}`,
		"books", "reconcile", "unclear", reconSept, "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if len(f.deleted) != 1 || f.deleted[0] != "cleared00000001" || len(f.batches) != 1 || len(f.batches[0]) != 1 {
		t.Errorf("deleted %v in %v, want the one cleared row", f.deleted, f.batches)
	}
}

func TestReconcileClearRefusesBeforeItSends(t *testing.T) {
	finished := "is finished: a Books admin opens it again with `tinycld books reconcile undo " + reconAug + "`"
	for _, tc := range []struct {
		name, command, id, input string
		exit                     int
		want                     string
	}{
		{"no lines", "clear", reconSept, `{}`, exitcode.Usage, `"lines" is required`},
		{"an empty lines", "clear", reconSept, `{"lines": []}`, exitcode.Usage, `"lines" is required`},
		{"another field", "clear", reconSept, `{"lines": ["` + reconLineOut + `"], "date": "x"}`, exitcode.Usage, `no field "date"`},
		{"a finished reconciliation", "clear", reconAug, `{"lines": ["` + reconLineOut + `"]}`, exitcode.Refused, finished},
		// Books answers "not found" to the delete of a cleared row of a
		// finished reconciliation: the command reads the status first.
		{"unclear of a finished reconciliation", "unclear", reconAug, `{"lines": ["` + reconLineAug + `"]}`, exitcode.Refused, finished},
	} {
		f := reconcileLinesFake(t)
		_, _, err := runCmd(t, f.serve(), tc.input, "books", "reconcile", tc.command, tc.id, "--input", "-")
		if got := exitcode.Of(err); got != tc.exit || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: exit = %d, err = %v; want %d and %q", tc.name, got, err, tc.exit, tc.want)
		}
		if len(f.batches) != 0 {
			t.Errorf("%s: batches = %v, want none", tc.name, f.batches)
		}
	}
}

func TestReconcileClearShowsTheRefusalOfBooks(t *testing.T) {
	f := reconcileLinesFake(t)
	f.refuse("BATCH", 400, `{"data":{"requests":{"0":{"code":"batch_request_failed","message":"Batch request failed.","response":{"data":{},"message":"Journal entry 3 is dated after Sep 30, 2026.","status":400}}}},"message":"Batch transaction failed.","status":400}`)
	_, _, err := runCmd(t, f.serve(), `{"lines": ["`+reconLineLate+`"]}`, "books", "reconcile", "clear", reconSept, "--input", "-")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "lines[0]: Journal entry 3 is dated after Sep 30, 2026.") {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
}

// The answer of the batch is lost and the rows are stored: the resend is
// refused (the ids are stored), and the read of the cleared rows says that
// nothing is left to send.
func TestReconcileClearAfterALostAnswer(t *testing.T) {
	f := reconcileLinesFake(t)
	f.loseAnswers(fakeSilence{stored: true, status: 502})
	_, _, err := runCmd(t, f.serve(), `{"lines": ["`+reconLineOut+`"]}`, "books", "reconcile", "clear", reconSept, "--input", "-")
	if err != nil {
		t.Fatal(err)
	}
	if n := rowsOf(f, clearedRowsCollection, "reconciliation", reconSept); n != 2 {
		t.Errorf("%d cleared rows, want 2", n)
	}
}

// The answer of the batch of `unclear` is lost and the row is deleted: the
// resend is refused (the row is not found), and the read of the cleared rows
// says that nothing is left to send.
func TestReconcileUnclearAfterALostAnswer(t *testing.T) {
	f := reconcileLinesFake(t)
	f.loseAnswers(fakeSilence{stored: true, status: 502})
	_, stderr, err := runCmd(t, f.serve(), `{"lines": ["`+reconLineIn+`"]}`, "books", "reconcile", "unclear", reconSept, "--input", "-")
	if err != nil {
		t.Fatal(err)
	}
	if n := rowsOf(f, clearedRowsCollection, "reconciliation", reconSept); n != 0 {
		t.Errorf("%d cleared rows, want 0", n)
	}
	if !strings.Contains(stderr, "uncleared 1 lines") {
		t.Errorf("stderr = %s", stderr)
	}
}
