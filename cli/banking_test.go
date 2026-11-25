package cli

import (
	"encoding/json"
	"fmt"
	"testing"
)

// The ids of bankingFake.
const (
	bankConnChecking = "bankconn0000001"
	bankConnCard     = "bankconn0000002"
	bankFileSept     = "bankfile0000001"
	bankTxnDeposit   = "banktxn00000001"
	bankTxnDepot     = "banktxn00000002"
	bankTxnFee       = "banktxn00000003"
	bankTxnTransfer  = "banktxn00000004"
)

// bankRowFields are the columns of the banking collections that no list of
// the group names, so that the fake knows the collections and fills a created
// row as the server does. A json column (the lines of a categorization) has
// the type typeIDs here: the fake stores such a value as it is sent.
var bankRowFields = map[string][]field{
	bankSuggestionsCollection: {
		{Name: "bank_transaction", Type: typeString}, {Name: "connection", Type: typeString},
		{Name: "line", Type: typeString}, {Name: "entry", Type: typeString},
		{Name: "date", Type: typeString}, {Name: "days_apart", Type: typeInteger},
	},
	bankMatchesCollection: {
		{Name: "bank_transaction", Type: typeString}, {Name: "lines", Type: typeIDs},
		{Name: "connection", Type: typeString}, {Name: "created_by", Type: typeString},
	},
	bankCategorizationsCollection: {
		{Name: "bank_transaction", Type: typeString}, {Name: "kind", Type: typeString},
		{Name: "customer", Type: typeString}, {Name: "vendor", Type: typeString},
		{Name: "memo", Type: typeString}, {Name: "lines", Type: typeIDs},
		{Name: "connection", Type: typeString}, {Name: "entry", Type: typeString}, {Name: "created_by", Type: typeString},
	},
}

// bankingFake holds two connections, one imported CSV file and four
// transactions of it: two For review, one Reviewed and one Excluded.
func bankingFake(t *testing.T) *fakeBooks {
	f := newFakeBooks(t)
	f.add(bankConnectionsCollection, bankConnChecking, map[string]any{
		"account": "acctchecking001", "institution": "First Harbor Bank", "account_mask": "4821", "created_by": "userada00000001",
	})
	f.add(bankConnectionsCollection, bankConnCard, map[string]any{
		"account": "acctcard0000001", "institution": "Northwind Card", "account_mask": "", "created_by": "userada00000001",
	})
	f.add(bankFilesCollection, bankFileSept, map[string]any{
		"connection": bankConnChecking, "file": "sept_2026_x1.csv", "name": "sept-2026.csv", "format": "csv",
		"size": json.Number("312"), "content_hash": "c0ffee", "status": "imported", "uploaded_by": "userada00000001",
		"statement_balance": json.Number("0"), "statement_date": "",
	})
	txn := func(id string, line int, date, description string, amount int, status string) {
		f.add(bankTransactionsCollection, id, map[string]any{
			"connection": bankConnChecking, "file": bankFileSept, "bank_import": "bankimport00001",
			"line": json.Number(fmt.Sprint(line)), "date": date, "description": description, "memo": "",
			"amount": json.Number(fmt.Sprint(amount)), "fitid": "", "check_number": "",
			"dedupe_hash": "hash" + id, "status": status,
		})
	}
	txn(bankTxnDeposit, 2, "2026-09-02", "Deposit - Harbor Design client payment", 425000, bankStatusForReview)
	txn(bankTxnDepot, 3, "2026-09-05", "Card purchase - Office Depot", -8647, bankStatusForReview)
	txn(bankTxnFee, 7, "2026-09-30", "Monthly service fee", -1200, "reviewed")
	txn(bankTxnTransfer, 5, "2026-09-15", "Transfer to savings", -50000, bankStatusExcluded)
	return f
}

func itemIDs(l listOut) string {
	ids := []string{}
	for _, item := range l.Items {
		ids = append(ids, fmt.Sprint(item["id"]))
	}
	return fmt.Sprint(ids)
}

// Each list of the group is a valid resource of the list engine. The refs are
// the lists a field's id comes from.
func TestBankingResourcesAreValid(t *testing.T) {
	names := map[string]bool{"accounts": true, bankConnectionsRef: true, bankFilesRef: true}
	for word, res := range bankingResources() {
		if err := checkResource(res, names); err != nil {
			t.Errorf("banking %s: %v", word, err)
		}
	}
}

// `banking list` is the For review list: the newest first, and only the
// transactions nobody has handled.
func TestBankingListIsForReview(t *testing.T) {
	f := bankingFake(t)
	got := listJSON(t, f, "books", "banking", "list")
	if ids := itemIDs(got); ids != "["+bankTxnDepot+" "+bankTxnDeposit+"]" {
		t.Errorf("listed %s", ids)
	}
	if filter := f.lastQuery.Get("filter"); filter != `status = "for_review"` {
		t.Errorf("filter = %q", filter)
	}
	if sort := f.lastQuery.Get("sort"); sort != "-date,id" {
		t.Errorf("sort = %q", sort)
	}
	first := got.Items[0]
	if first["amount"] != float64(-8647) || first["description"] != "Card purchase - Office Depot" || first["connection"] != bankConnChecking {
		t.Errorf("first item = %v", first)
	}
	for _, key := range []string{"dedupe_hash", "bank_import"} {
		if _, has := first[key]; has {
			t.Errorf("list prints %s: %v", key, first)
		}
	}
}

func TestBankingListStatusAndConnection(t *testing.T) {
	for _, tc := range []struct {
		args   []string
		filter string
		ids    string
	}{
		{[]string{"--status", "excluded"}, `status = "excluded"`, "[" + bankTxnTransfer + "]"},
		{[]string{"--status", "all"}, ``, "[" + bankTxnFee + " " + bankTxnTransfer + " " + bankTxnDepot + " " + bankTxnDeposit + "]"},
		{[]string{"--connection", bankConnCard}, `status = "for_review" && connection = "` + bankConnCard + `"`, "[]"},
		{[]string{"--search", "depot"}, `status = "for_review" && (description ~ "depot" || memo ~ "depot")`, "[" + bankTxnDepot + "]"},
	} {
		f := bankingFake(t)
		got := listJSON(t, f, append([]string{"books", "banking", "list"}, tc.args...)...)
		if filter := f.lastQuery.Get("filter"); filter != tc.filter {
			t.Errorf("%v: filter = %q, want %q", tc.args, filter, tc.filter)
		}
		if ids := itemIDs(got); ids != tc.ids {
			t.Errorf("%v: listed %s, want %s", tc.args, ids, tc.ids)
		}
	}
}

func TestBankingConnectionsAndFiles(t *testing.T) {
	f := bankingFake(t)
	connections := listJSON(t, f, "books", "banking", "connections")
	if ids := itemIDs(connections); ids != "["+bankConnChecking+" "+bankConnCard+"]" {
		t.Errorf("connections listed %s", ids)
	}
	if got := connections.Items[0]; got["institution"] != "First Harbor Bank" || got["account_mask"] != "4821" || got["account"] != "acctchecking001" {
		t.Errorf("connection = %v", got)
	}
	listJSON(t, f, "books", "banking", "connections", "--account", "acctchecking001")
	if filter := f.lastQuery.Get("filter"); filter != `account = "acctchecking001"` {
		t.Errorf("connections filter = %q", filter)
	}
	files := listJSON(t, f, "books", "banking", "files", "--connection", bankConnChecking, "--status", "imported")
	if ids := itemIDs(files); ids != "["+bankFileSept+"]" {
		t.Errorf("files listed %s", ids)
	}
	if filter := f.lastQuery.Get("filter"); filter != `connection = "`+bankConnChecking+`" && status = "imported"` {
		t.Errorf("files filter = %q", filter)
	}
	if got := files.Items[0]; got["name"] != "sept-2026.csv" || got["format"] != "csv" || got["size"] != float64(312) {
		t.Errorf("file = %v", got)
	}
}
