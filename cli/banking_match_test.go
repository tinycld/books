package cli

import (
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

const bankMatchID = "bankmatch000009"

// `banking match` is one create: the bank transaction and the journal lines.
func TestBankingMatch(t *testing.T) {
	f := bankingFake(t)
	out, stderr, err := runCmd(t, f.serve(), `{"lines": ["jline0000000001", "jline0000000002"]}`,
		"books", "banking", "match", bankTxnDepot, "--input", "-", "--id", bankMatchID, "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `{"bank_transaction":"` + bankTxnDepot + `","id":"` + bankMatchID + `","lines":["jline0000000001","jline0000000002"]}`
	if got := sentJSON(f.lastCreate); got != want {
		t.Errorf("sent\n  %s\nwant\n  %s", got, want)
	}
	if !strings.Contains(out, `"id": "`+bankMatchID+`"`) || !strings.Contains(out, `"jline0000000002"`) {
		t.Errorf("printed %s", out)
	}
	if !strings.Contains(stderr, "banking unmatch "+bankTxnDepot) {
		t.Errorf("stderr does not name unmatch: %s", stderr)
	}
}

func TestBankingMatchRefusesBeforeItSends(t *testing.T) {
	for _, tc := range []struct {
		name, input, want string
	}{
		{"no lines", `{}`, `"lines" is required`},
		{"an empty lines", `{"lines": []}`, `"lines" is required`},
		{"lines that are no ids", `{"lines": [1]}`, `"lines" must be an array of ids`},
		{"another field", `{"lines": ["jline0000000001"], "entry": "x"}`, `no field "entry"`},
	} {
		f := bankingFake(t)
		_, _, err := runCmd(t, f.serve(), tc.input, "books", "banking", "match", bankTxnDepot, "--input", "-")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: exit = %d, err = %v; want 2 and %q", tc.name, got, err, tc.want)
		}
		if len(f.requests) != 0 {
			t.Errorf("%s: requests = %v, want none", tc.name, f.requests)
		}
	}
}

func TestBankingMatchShowsTheRefusalOfBooks(t *testing.T) {
	f := bankingFake(t)
	f.refuse("POST", 400, `{"data":{"lines":{"code":"validation_books","message":"The chosen Books transactions total $80.00. The bank transaction is $86.47."}},"message":"Failed to create record.","status":400}`)
	_, _, err := runCmd(t, f.serve(), `{"lines": ["jline0000000001"]}`, "books", "banking", "match", bankTxnDepot, "--input", "-")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "The chosen Books transactions total $80.00.") || !strings.Contains(err.Error(), "bank transaction "+bankTxnDepot) {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
}

// `banking unmatch` deletes the match of the transaction, not its entry.
func TestBankingUnmatch(t *testing.T) {
	f := bankingFake(t)
	f.add(bankMatchesCollection, "bankmatch000001", map[string]any{
		"bank_transaction": bankTxnFee, "lines": []any{"jline0000000005"}, "connection": bankConnChecking,
	})
	out, _, err := runCmd(t, f.serve(), "", "books", "banking", "unmatch", bankTxnFee, "--json")
	if err != nil {
		t.Fatal(err)
	}
	if len(f.deleted) != 1 || f.deleted[0] != "bankmatch000001" {
		t.Errorf("deleted %v, want the match", f.deleted)
	}
	if !strings.Contains(out, `"match": null`) {
		t.Errorf("printed %s", out)
	}
	_, _, err = runCmd(t, f.serve(), "", "books", "banking", "unmatch", bankTxnDepot)
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "is not matched") {
		t.Errorf("a transaction with no match: exit = %d, err = %v", got, err)
	}
}

// `exclude` and `restore` are one change of status each.
func TestBankingExcludeAndRestore(t *testing.T) {
	f := bankingFake(t)
	out, stderr, err := runCmd(t, f.serve(), "", "books", "banking", "exclude", bankTxnDepot, "--json")
	if err != nil {
		t.Fatal(err)
	}
	if got := sentJSON(f.lastPatch); got != `{"status":"excluded"}` {
		t.Errorf("exclude sent %s", got)
	}
	if !strings.Contains(out, `"status": "excluded"`) || !strings.Contains(stderr, "excluded bank transaction "+bankTxnDepot) {
		t.Errorf("out:\n%s\nstderr: %s", out, stderr)
	}
	out, _, err = runCmd(t, f.serve(), "", "books", "banking", "restore", bankTxnTransfer, "--json")
	if err != nil {
		t.Fatal(err)
	}
	if got := sentJSON(f.lastPatch); got != `{"status":"for_review"}` {
		t.Errorf("restore sent %s", got)
	}
	if !strings.Contains(out, `"status": "for_review"`) {
		t.Errorf("printed %s", out)
	}
}

// A Reviewed transaction is refused from what the command read: Books would
// answer "not found" to the change.
func TestBankingExcludeOfAReviewedTransaction(t *testing.T) {
	f := bankingFake(t)
	_, _, err := runCmd(t, f.serve(), "", "books", "banking", "exclude", bankTxnFee)
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "is Reviewed") || !strings.Contains(err.Error(), "`undo`") {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
	if f.lastPatch != nil {
		t.Errorf("the command sent %v", f.lastPatch)
	}
}

// `undo` and `unmatch` already make the transaction For review, so the
// refusal must not say they come before a `restore`.
func TestBankingRestoreOfAReviewedTransaction(t *testing.T) {
	f := bankingFake(t)
	_, _, err := runCmd(t, f.serve(), "", "books", "banking", "restore", bankTxnFee)
	if got := exitcode.Of(err); got != exitcode.Refused || err == nil {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
	for _, want := range []string{"is Reviewed", "`undo`", "`unmatch`", "makes it For review", "`restore` is not needed"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("err = %v, want %q", err, want)
		}
	}
	if strings.Contains(err.Error(), "first") {
		t.Errorf("err = %v, must not say \"first\"", err)
	}
	if f.lastPatch != nil {
		t.Errorf("the command sent %v", f.lastPatch)
	}
}

// Books answers "not found" to a change its update rule refuses (a caller with
// read-only access): the error names the transaction.
func TestBankingExcludeThatBooksRefuses(t *testing.T) {
	f := bankingFake(t)
	f.refuse("PATCH", 404, `{"data":{},"message":"The requested resource wasn't found.","status":404}`)
	_, _, err := runCmd(t, f.serve(), "", "books", "banking", "exclude", bankTxnDepot)
	if got := exitcode.Of(err); got != exitcode.NotFound || !strings.Contains(err.Error(), "bank transaction "+bankTxnDepot) {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
}

// The status the command asks for is the one the transaction has: nothing is
// sent (Books would answer "not found"), and the transaction is printed.
func TestBankingExcludeAndRestoreChangeNothingTwice(t *testing.T) {
	for _, tc := range []struct{ word, id, status, state string }{
		{"exclude", bankTxnTransfer, "excluded", "Excluded"},
		{"restore", bankTxnDepot, "for_review", "For review"},
	} {
		f := bankingFake(t)
		out, stderr, err := runCmd(t, f.serve(), "", "books", "banking", tc.word, tc.id, "--json")
		if err != nil {
			t.Fatalf("%s: %v", tc.word, err)
		}
		if f.lastPatch != nil {
			t.Errorf("%s sent %v, want no change", tc.word, f.lastPatch)
		}
		if !strings.Contains(out, `"status": "`+tc.status+`"`) || !strings.Contains(stderr, "is "+tc.state+" already: nothing was changed") {
			t.Errorf("%s: out:\n%s\nstderr: %s", tc.word, out, stderr)
		}
	}
}

// A second run with the id of a stored match writes nothing, and the message
// names the bank transaction of that match.
func TestBankingMatchWithAStoredID(t *testing.T) {
	f := bankingFake(t)
	f.add(bankMatchesCollection, bankMatchID, map[string]any{"bank_transaction": bankTxnFee, "lines": []any{"jline0000000009"}})
	_, _, err := runCmd(t, f.serve(), `{"lines": ["jline0000000001"]}`, "books", "banking", "match", bankTxnDepot, "--input", "-", "--id", bankMatchID)
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "match "+bankMatchID+" already exists, for bank transaction "+bankTxnFee) {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
	if n := sends(f, "POST /api/collections/"+bankMatchesCollection+"/records"); n != 0 {
		t.Errorf("the command sent %d creates, want none", n)
	}
}
