package cli

import (
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

func TestReconcileEdit(t *testing.T) {
	f := reconcileLinesFake(t)
	out, _, err := runCmd(t, f.serve(), `{"has_statement_totals": true, "statement_in": 50000, "statement_out": 8000}`,
		"books", "reconcile", "edit", reconSept, "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if got, want := sentJSON(f.lastPatch), `{"has_statement_totals":true,"statement_in":50000,"statement_out":8000}`; got != want {
		t.Errorf("sent\n  %s\nwant\n  %s", got, want)
	}
	if !strings.Contains(out, `"statement_in": 50000`) || !strings.Contains(out, `"open": [`) {
		t.Errorf("printed %s", out)
	}
}

func TestReconcileEditRefusesBeforeItSends(t *testing.T) {
	for _, tc := range []struct {
		name, id, input string
		exit            int
		want            string
	}{
		{"the account", reconSept, `{"account": "acctsavings0001"}`, exitcode.Usage, `no field "account"`},
		{"no field", reconSept, `{}`, exitcode.Usage, "nothing to change"},
		{"a finished reconciliation", reconAug, `{"statement_balance": 1}`, exitcode.Refused, "is finished"},
	} {
		f := reconcileLinesFake(t)
		_, _, err := runCmd(t, f.serve(), tc.input, "books", "reconcile", "edit", tc.id, "--input", "-")
		if got := exitcode.Of(err); got != tc.exit || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: exit = %d, err = %v; want %d and %q", tc.name, got, err, tc.exit, tc.want)
		}
		if f.lastPatch != nil {
			t.Errorf("%s: sent %v, want nothing", tc.name, f.lastPatch)
		}
	}
}

// `finish` and `undo` are one change of the status
// (TestCLIReconcile_ATokenFinishesAndAnAdminUndoes sends the same bodies).
func TestReconcileFinishAndUndo(t *testing.T) {
	for _, tc := range []struct {
		word, id, sent, stderr string
	}{
		{"finish", reconSept, `{"status":"finished"}`, "finished reconciliation " + reconSept},
		{"undo", reconAug, `{"status":"in_progress"}`, "opened reconciliation " + reconAug + " again"},
	} {
		f := reconcileLinesFake(t)
		out, stderr, err := runCmd(t, f.serve(), "", "books", "reconcile", tc.word, tc.id, "--json")
		if err != nil {
			t.Fatalf("%s: %v", tc.word, err)
		}
		if got := sentJSON(f.lastPatch); got != tc.sent {
			t.Errorf("%s: sent %s, want %s", tc.word, got, tc.sent)
		}
		if !strings.Contains(stderr, tc.stderr) || !strings.Contains(out, `"cleared": [`) {
			t.Errorf("%s: stderr = %s; printed %s", tc.word, stderr, out)
		}
	}
}

// Books answers 404 to a change to the status the reconciliation has: the
// command reads the status and sends nothing.
func TestReconcileFinishOfAFinishedOneSendsNothing(t *testing.T) {
	for _, tc := range []struct{ word, id, state string }{
		{"finish", reconAug, "finished"},
		{"undo", reconSept, "in progress"},
	} {
		f := reconcileLinesFake(t)
		out, stderr, err := runCmd(t, f.serve(), "", "books", "reconcile", tc.word, tc.id, "--json")
		if err != nil {
			t.Fatalf("%s: %v", tc.word, err)
		}
		want := "reconciliation " + tc.id + " is " + tc.state + " already: nothing was changed"
		if f.lastPatch != nil || !strings.Contains(stderr, want) {
			t.Errorf("%s: sent %v; stderr = %s, want %q", tc.word, f.lastPatch, stderr, want)
		}
		if !strings.Contains(out, `"cleared": [`) || !strings.Contains(out, tc.id) {
			t.Errorf("%s: printed %s, want the reconciliation", tc.word, out)
		}
	}
}

// The refusal of Books is the only place that states the difference.
func TestReconcileFinishShowsTheDifferenceBooksStates(t *testing.T) {
	f := reconcileLinesFake(t)
	f.refuse("PATCH", 400, `{"data":{},"message":"The difference is $420.00. It must be $0.00 to finish.","status":400}`)
	_, _, err := runCmd(t, f.serve(), "", "books", "reconcile", "finish", reconSept)
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.HasPrefix(err.Error(), "reconciliation "+reconSept+": ") || !strings.Contains(err.Error(), "The difference is $420.00. It must be $0.00 to finish.") {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
}

func TestReconcileUndoShowsTheRefusalOfBooks(t *testing.T) {
	f := reconcileLinesFake(t)
	f.refuse("PATCH", 400, `{"data":{},"message":"Only a Books admin can undo a reconciliation.","status":400}`)
	_, _, err := runCmd(t, f.serve(), "", "books", "reconcile", "undo", reconAug)
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.HasPrefix(err.Error(), "reconciliation "+reconAug+": ") || !strings.Contains(err.Error(), "Only a Books admin can undo a reconciliation.") {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
}

func TestReconcileDelete(t *testing.T) {
	f := reconcileLinesFake(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "reconcile", "discard", reconSept, "--yes", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if len(f.deleted) != 1 || f.deleted[0] != reconSept || !strings.Contains(out, `"deleted": true`) {
		t.Errorf("deleted %v; printed %s", f.deleted, out)
	}
	_, _, err = runCmd(t, f.serve(), "", "books", "reconcile", "delete", reconAug, "--yes")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "is finished: it cannot be deleted") {
		t.Errorf("a finished one: exit = %d, err = %v", got, err)
	}
	if len(f.deleted) != 1 {
		t.Errorf("deleted %v, want only the one in progress", f.deleted)
	}
}
