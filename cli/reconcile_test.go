package cli

import (
	"encoding/json"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

const (
	reconSept = "recon0000000009"
	reconAug  = "recon0000000008"
)

// reconcileFake is bankingFake with two reconciliations of checking: August is
// finished and September is in progress.
func reconcileFake(t *testing.T) *fakeBooks {
	f := bankingFake(t)
	f.add(reconciliationsCollection, reconAug, map[string]any{
		"account": "acctchecking001", "statement_date": "2026-08-31", "statement_balance": json.Number("120000"),
		"status": reconcileFinished, "beginning_balance": json.Number("0"), "currency": "USD",
	})
	f.add(reconciliationsCollection, reconSept, map[string]any{
		"account": "acctchecking001", "statement_date": "2026-09-30", "statement_balance": json.Number("162000"),
		"status": reconcileInProgress, "beginning_balance": json.Number("120000"), "currency": "USD",
	})
	return f
}

func TestReconcileResourceIsALegalDefinition(t *testing.T) {
	res := reconciliationsResource
	if err := checkResource(&res, map[string]bool{"accounts": true}); err != nil {
		t.Fatal(err)
	}
}

func TestReconcileList(t *testing.T) {
	f := reconcileFake(t)
	if got := itemIDs(listJSON(t, f, "books", "reconcile", "list")); got != "["+reconSept+" "+reconAug+"]" {
		t.Errorf("list = %s, want the newest statement first", got)
	}
	if got := itemIDs(listJSON(t, f, "books", "reconcile", "list", "--account", "acctchecking001", "--status", "finished")); got != "["+reconAug+"]" {
		t.Errorf("list --status finished = %s", got)
	}
}

// `reconcile start` is one create: the caller's fields, the id and the first
// status (TestCLIReconcile_ATokenStartsEditsAndDiscards sends the same body).
func TestReconcileStart(t *testing.T) {
	f := newFakeBooks(t)
	f.stamps = map[string]map[string]any{reconciliationsCollection: {"beginning_balance": json.Number("120000"), "currency": "USD"}}
	out, stderr, err := runCmd(t, f.serve(), `{"account": "acctchecking001", "statement_date": "2026-09-30", "statement_balance": 42000}`,
		"books", "reconcile", "start", "--input", "-", "--id", "clirecon0000001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `{"account":"acctchecking001","id":"clirecon0000001","statement_balance":42000,"statement_date":"2026-09-30","status":"in_progress"}`
	if got := sentJSON(f.lastCreate); got != want {
		t.Errorf("sent\n  %s\nwant\n  %s", got, want)
	}
	if !strings.Contains(out, `"beginning_balance": 120000`) || !strings.Contains(out, `"status": "in_progress"`) {
		t.Errorf("printed %s", out)
	}
	if !strings.Contains(stderr, "started reconciliation clirecon0000001") {
		t.Errorf("stderr = %s", stderr)
	}
}

func TestReconcileStartRefusesBeforeItSends(t *testing.T) {
	for _, tc := range []struct {
		name, input, want string
	}{
		{"no account", `{"statement_date": "2026-09-30", "statement_balance": 1}`, `"account" is required`},
		{"no balance", `{"account": "acctchecking001", "statement_date": "2026-09-30"}`, `"statement_balance" is required`},
		{"a field Books sets", `{"account": "acctchecking001", "statement_date": "2026-09-30", "statement_balance": 1, "status": "finished"}`, `"status"`},
	} {
		f := newFakeBooks(t)
		_, _, err := runCmd(t, f.serve(), tc.input, "books", "reconcile", "start", "--input", "-")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: exit = %d, err = %v; want 2 and %q", tc.name, got, err, tc.want)
		}
		if len(f.requests) != 0 {
			t.Errorf("%s: requests = %v, want none", tc.name, f.requests)
		}
	}
}

func TestReconcileStartShowsTheRefusalOfBooks(t *testing.T) {
	f := reconcileFake(t)
	f.refuse("POST", 400, `{"data":{},"message":"1000 Business Checking has a reconciliation in progress. Resume it or discard it.","status":400}`)
	_, _, err := runCmd(t, f.serve(), `{"account": "acctchecking001", "statement_date": "2026-10-31", "statement_balance": 1}`,
		"books", "reconcile", "start", "--input", "-")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "has a reconciliation in progress") {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
}

// A resend after a lost answer gets the refusal "in progress" from Books. The
// read of the chosen id says that the first send was stored.
func TestReconcileStartAfterALostAnswer(t *testing.T) {
	f := newFakeBooks(t)
	f.rows[reconciliationsCollection] = []rawRecord{}
	f.loseAnswers(fakeSilence{stored: true, status: 502})
	out, _, err := runCmd(t, f.serve(), `{"account": "acctchecking001", "statement_date": "2026-09-30", "statement_balance": 42000}`,
		"books", "reconcile", "start", "--input", "-", "--id", "clirecon0000001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if n := len(f.rows[reconciliationsCollection]); n != 1 || !strings.Contains(out, `"id": "clirecon0000001"`) {
		t.Errorf("stored %d reconciliations; printed %s", n, out)
	}
}
