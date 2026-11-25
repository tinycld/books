package cli

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

const bankCatID = "bankcat00000009"

// reviewFake is bankingFake where a created categorization gets the entry
// Books posts for it.
func reviewFake(t *testing.T) *fakeBooks {
	f := bankingFake(t)
	f.stamps = map[string]map[string]any{
		bankCategorizationsCollection: {"connection": bankConnChecking, "entry": "jentry000000042", "created_by": "userada00000001"},
	}
	return f
}

// `banking categorize` is one create: the account, with the bank amount
// without its sign, as the one line. The command prints the transaction with
// the categorization Books stored.
func TestBankingCategorize(t *testing.T) {
	f := reviewFake(t)
	out, stderr, err := runCmd(t, f.serve(), `{"account": "acctsupplies001", "vendor": "vendordepot0001", "memo": "Paper"}`,
		"books", "banking", "categorize", bankTxnDepot, "--input", "-", "--id", bankCatID, "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `{"bank_transaction":"` + bankTxnDepot + `","id":"` + bankCatID + `","kind":"categorize","lines":[{"account":"acctsupplies001","amount":8647}],"memo":"Paper","vendor":"vendordepot0001"}`
	if got := sentJSON(f.lastCreate); got != want {
		t.Errorf("sent\n  %s\nwant\n  %s", got, want)
	}
	var printed map[string]any
	if err := json.Unmarshal([]byte(out), &printed); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	cat, _ := printed["categorization"].(map[string]any)
	if printed["id"] != bankTxnDepot || cat["id"] != bankCatID || cat["entry"] != "jentry000000042" || cat["kind"] != "categorize" {
		t.Errorf("printed %v", printed)
	}
	if !strings.Contains(stderr, "banking undo "+bankTxnDepot) {
		t.Errorf("stderr does not name undo: %s", stderr)
	}
}

// Money in has no sign to take away, and a transfer keeps its kind.
func TestBankingCategorizeATransferOfMoneyIn(t *testing.T) {
	f := reviewFake(t)
	if _, _, err := runCmd(t, f.serve(), `{"account": "acctsavings0001", "kind": "transfer"}`,
		"books", "banking", "categorize", bankTxnDeposit, "--input", "-", "--id", bankCatID); err != nil {
		t.Fatal(err)
	}
	want := `{"bank_transaction":"` + bankTxnDeposit + `","id":"` + bankCatID + `","kind":"transfer","lines":[{"account":"acctsavings0001","amount":425000}]}`
	if got := sentJSON(f.lastCreate); got != want {
		t.Errorf("sent\n  %s\nwant\n  %s", got, want)
	}
}

// `banking split` sends the lines as the caller wrote them: it adds nothing up.
func TestBankingSplit(t *testing.T) {
	f := reviewFake(t)
	input := `{"memo": "Supplies and a fee", "lines": [{"account": "acctsupplies001", "amount": 6000, "memo": "Paper"}, {"account": "acctfees0000001", "amount": 2000}]}`
	if _, _, err := runCmd(t, f.serve(), input, "books", "banking", "split", bankTxnDepot, "--input", "-", "--id", bankCatID); err != nil {
		t.Fatal(err)
	}
	want := `{"bank_transaction":"` + bankTxnDepot + `","id":"` + bankCatID + `","kind":"categorize","lines":[{"account":"acctsupplies001","amount":6000,"memo":"Paper"},{"account":"acctfees0000001","amount":2000}],"memo":"Supplies and a fee"}`
	if got := sentJSON(f.lastCreate); got != want {
		t.Errorf("sent\n  %s\nwant\n  %s", got, want)
	}
	// It needs no amount of the bank transaction, so it reads none before the create.
	create := slices.Index(f.requests, "POST /api/collections/"+bankCategorizationsCollection+"/records")
	read := slices.Index(f.requests, "GET /api/collections/"+bankTransactionsCollection+"/records/"+bankTxnDepot)
	if create < 0 || read < create {
		t.Errorf("split read the transaction before it sent: %v", f.requests)
	}
}

func TestBankingCategorizeAndSplitRefuseBeforeTheySend(t *testing.T) {
	for _, tc := range []struct {
		name, word, input, want string
	}{
		{"categorize with no account", "categorize", `{"memo": "x"}`, `"account" is required`},
		{"categorize with an amount", "categorize", `{"account": "acctsupplies001", "amount": 8647}`, `no field "amount"`},
		{"categorize with lines", "categorize", `{"account": "acctsupplies001", "lines": []}`, `no field "lines"`},
		{"categorize with another kind", "categorize", `{"account": "acctsupplies001", "kind": "match"}`, `"kind" must be one of`},
		{"split with no lines", "split", `{"memo": "x"}`, `"lines" is required`},
		{"split with an empty lines", "split", `{"lines": []}`, `"lines" is required`},
		{"split with a kind", "split", `{"kind": "transfer", "lines": [{"account": "a", "amount": 1}]}`, `no field "kind"`},
		{"split line with no account", "split", `{"lines": [{"amount": 1}]}`, `lines[0]: "account" is required`},
		{"split line with no amount", "split", `{"lines": [{"account": "a", "amount": 1}, {"account": "b"}]}`, `lines[1]: "amount" is required`},
		{"split line with a fraction", "split", `{"lines": [{"account": "a", "amount": 1.5}]}`, `lines[0]: "amount" must be a whole number of cents`},
		{"split line with another key", "split", `{"lines": [{"account": "a", "amount": 1, "debit": 1}]}`, `lines[0] has no key "debit"`},
	} {
		f := reviewFake(t)
		_, _, err := runCmd(t, f.serve(), tc.input, "books", "banking", tc.word, bankTxnDepot, "--input", "-")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: exit = %d, err = %v; want 2 and %q", tc.name, got, err, tc.want)
		}
		if len(f.requests) != 0 {
			t.Errorf("%s: requests = %v, want none", tc.name, f.requests)
		}
	}
}

// Books refuses lines that do not add up; the command passes the message on
// and names the transaction.
func TestBankingSplitShowsTheRefusalOfBooks(t *testing.T) {
	f := reviewFake(t)
	f.refuse("POST", 400, `{"data":{"lines":{"code":"validation_books","message":"The lines total $80.00. The bank transaction is $86.47."}},"message":"Failed to create record.","status":400}`)
	_, _, err := runCmd(t, f.serve(), `{"lines": [{"account": "acctsupplies001", "amount": 8000}]}`, "books", "banking", "split", bankTxnDepot, "--input", "-")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "The lines total $80.00.") || !strings.Contains(err.Error(), "bank transaction "+bankTxnDepot) {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
}

// The first send was stored and its answer was lost: one categorization.
func TestBankingCategorizeResendsAfterALostAnswer(t *testing.T) {
	quickResends(t)
	f := reviewFake(t)
	f.loseAnswers(fakeSilence{stored: true, status: 0})
	out, _, err := runCmd(t, f.serve(), `{"account": "acctsupplies001"}`, "books", "banking", "categorize", bankTxnDepot, "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if n := rowsOf(f, bankCategorizationsCollection, "bank_transaction", bankTxnDepot); n != 1 {
		t.Errorf("%d categorizations are stored, want 1", n)
	}
	if !strings.Contains(out, `"entry": "jentry000000042"`) {
		t.Errorf("printed %s", out)
	}
}

// `banking undo` deletes the categorization of the transaction.
func TestBankingUndo(t *testing.T) {
	f := bankingFake(t)
	f.add(bankCategorizationsCollection, "bankcat00000001", map[string]any{
		"bank_transaction": bankTxnFee, "kind": "categorize", "customer": "", "vendor": "", "memo": "",
		"connection": bankConnChecking, "entry": "jentry000000007", "lines": []any{},
	})
	f.add(bankCategorizationsCollection, "bankcat00000002", map[string]any{
		"bank_transaction": bankTxnDeposit, "kind": "categorize", "customer": "", "vendor": "", "memo": "",
		"connection": bankConnChecking, "entry": "jentry000000008", "lines": []any{},
	})
	out, stderr, err := runCmd(t, f.serve(), "", "books", "banking", "undo", bankTxnFee, "--json")
	if err != nil {
		t.Fatal(err)
	}
	if len(f.deleted) != 1 || f.deleted[0] != "bankcat00000001" {
		t.Errorf("deleted %v, want the categorization of the transaction", f.deleted)
	}
	if !strings.Contains(out, `"categorization": null`) || !strings.Contains(stderr, "For review again") {
		t.Errorf("out:\n%s\nstderr: %s", out, stderr)
	}
}

func TestBankingUndoOfATransactionWithNoEntry(t *testing.T) {
	f := bankingFake(t)
	_, _, err := runCmd(t, f.serve(), "", "books", "banking", "undo", bankTxnDepot)
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "`unmatch` takes back a match") {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
	if len(f.deleted) != 0 {
		t.Errorf("deleted %v", f.deleted)
	}
	_, _, err = runCmd(t, f.serve(), "", "books", "banking", "undo", "nosuchtxn000001")
	if got := exitcode.Of(err); got != exitcode.NotFound {
		t.Errorf("a missing transaction: exit = %d, want 5; err: %v", got, err)
	}
}

// A second run with the id of a stored categorization writes nothing, and the
// message names the bank transaction of that categorization.
func TestBankingCategorizeWithAStoredID(t *testing.T) {
	f := reviewFake(t)
	f.add(bankCategorizationsCollection, bankCatID, map[string]any{"bank_transaction": bankTxnFee, "kind": "categorize"})
	_, _, err := runCmd(t, f.serve(), `{"account": "acctsupplies001"}`, "books", "banking", "categorize", bankTxnDepot, "--input", "-", "--id", bankCatID)
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "categorization "+bankCatID+" already exists, for bank transaction "+bankTxnFee) {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
	if n := sends(f, "POST /api/collections/"+bankCategorizationsCollection+"/records"); n != 0 {
		t.Errorf("the command sent %d creates, want none", n)
	}
}
