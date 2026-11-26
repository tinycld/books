package cli

import (
	"encoding/json"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// showBank runs `banking show <id> --json` and returns the document.
func showBank(t *testing.T, f *fakeBooks, id string) map[string]any {
	t.Helper()
	out, _, err := runCmd(t, f.serve(), "", "books", "banking", "show", id, "--json")
	if err != nil {
		t.Fatalf("show %s: %v", id, err)
	}
	var got map[string]any
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("stdout is not one JSON document: %v\n%s", err, out)
	}
	return got
}

// A For review transaction prints its suggestions, the nearest date first, and
// no match and no categorization.
func TestBankingShowAForReviewTransaction(t *testing.T) {
	f := bankingFake(t)
	f.add(bankSuggestionsCollection, "sug000000000001", map[string]any{
		"bank_transaction": bankTxnDepot, "connection": bankConnChecking, "line": "jline0000000002",
		"entry": "jentry000000002", "date": "2026-09-08", "days_apart": json.Number("3"),
	})
	f.add(bankSuggestionsCollection, "sug000000000002", map[string]any{
		"bank_transaction": bankTxnDepot, "connection": bankConnChecking, "line": "jline0000000001",
		"entry": "jentry000000001", "date": "2026-09-05", "days_apart": json.Number("0"),
	})
	f.add(bankSuggestionsCollection, "sug000000000003", map[string]any{
		"bank_transaction": bankTxnDeposit, "connection": bankConnChecking, "line": "jline0000000009",
		"entry": "jentry000000009", "date": "2026-09-02", "days_apart": json.Number("0"),
	})
	got := showBank(t, f, bankTxnDepot)
	if got["id"] != bankTxnDepot || got["amount"] != float64(-8647) || got["status"] != "for_review" {
		t.Errorf("transaction = %v", got)
	}
	suggestions, _ := got["suggestions"].([]any)
	if len(suggestions) != 2 {
		t.Fatalf("suggestions = %v, want the 2 of this transaction", got["suggestions"])
	}
	first, _ := suggestions[0].(map[string]any)
	if first["line"] != "jline0000000001" || first["entry"] != "jentry000000001" || first["date"] != "2026-09-05" || first["days_apart"] != float64(0) {
		t.Errorf("first suggestion = %v", first)
	}
	if len(first) != 4 {
		t.Errorf("a suggestion has the keys %v, want line, entry, date, days_apart", first)
	}
	if match, has := got["match"]; !has || match != nil {
		t.Errorf("match = %v, want null", match)
	}
	if cat, has := got["categorization"]; !has || cat != nil {
		t.Errorf("categorization = %v, want null", cat)
	}
	query := f.listed[bankSuggestionsCollection][0]
	if query.Get("filter") != `bank_transaction = "`+bankTxnDepot+`"` || query.Get("sort") != "days_apart,date,line" {
		t.Errorf("suggestions query = %v", query)
	}
}

// A Reviewed transaction prints what it was reviewed with.
func TestBankingShowAReviewedTransaction(t *testing.T) {
	f := bankingFake(t)
	f.add(bankCategorizationsCollection, "bankcat00000001", map[string]any{
		"bank_transaction": bankTxnFee, "kind": "categorize", "customer": "", "vendor": "vendorbank00001",
		"memo": "September fee", "connection": bankConnChecking, "entry": "jentry000000007", "created_by": "userada00000001",
		"lines": []any{map[string]any{"account": "acctfees0000001", "amount": json.Number("1200"), "memo": ""}},
	})
	got := showBank(t, f, bankTxnFee)
	cat, _ := got["categorization"].(map[string]any)
	if cat["id"] != "bankcat00000001" || cat["kind"] != "categorize" || cat["entry"] != "jentry000000007" || cat["vendor"] != "vendorbank00001" || cat["memo"] != "September fee" {
		t.Errorf("categorization = %v", cat)
	}
	lines, _ := cat["lines"].([]any)
	if line, _ := lines[0].(map[string]any); len(lines) != 1 || line["account"] != "acctfees0000001" || line["amount"] != float64(1200) {
		t.Errorf("categorization lines = %v", cat["lines"])
	}
	if _, has := cat["created_by"]; has {
		t.Errorf("the categorization prints created_by: %v", cat)
	}
	if got["match"] != nil {
		t.Errorf("match = %v, want null", got["match"])
	}

	f = bankingFake(t)
	f.add(bankMatchesCollection, "bankmatch000001", map[string]any{
		"bank_transaction": bankTxnFee, "lines": []any{"jline0000000005", "jline0000000006"},
		"connection": bankConnChecking, "created_by": "userada00000001",
	})
	got = showBank(t, f, bankTxnFee)
	match, _ := got["match"].(map[string]any)
	if ids, _ := match["lines"].([]any); match["id"] != "bankmatch000001" || len(ids) != 2 || ids[1] != "jline0000000006" || len(match) != 2 {
		t.Errorf("match = %v", match)
	}
	if got["categorization"] != nil {
		t.Errorf("categorization = %v, want null", got["categorization"])
	}
}

func TestBankingShowOfAMissingTransaction(t *testing.T) {
	f := bankingFake(t)
	_, _, err := runCmd(t, f.serve(), "", "books", "banking", "show", "nosuchtxn000001")
	if got := exitcode.Of(err); got != exitcode.NotFound {
		t.Fatalf("exit = %d, want 5; err: %v", got, err)
	}
	if !strings.Contains(err.Error(), "bank transaction nosuchtxn000001") {
		t.Errorf("the error must name the transaction: %v", err)
	}
}

// The table of `show` holds the transaction and the three added rows.
func TestBankingShowTable(t *testing.T) {
	out, _, err := runCmd(t, bankingFake(t).serve(), "", "books", "banking", "show", bankTxnDepot)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Card purchase - Office Depot", "-8647", "suggestions", "match", "categorization"} {
		if !strings.Contains(out, want) {
			t.Errorf("the table has no %q:\n%s", want, out)
		}
	}
}
