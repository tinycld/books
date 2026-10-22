package books

import (
	"fmt"
	"strings"
	"testing"

	"tinycld.org/core/search"
)

func setMemo(t testing.TB, env *ledgerEnv, entryID, memo string) {
	t.Helper()
	e := reload(t, env.app, "books_journal_entries", entryID)
	e.Set("memo", memo)
	if err := env.app.Save(e); err != nil {
		t.Fatal(err)
	}
}

func rowIDs(rows []search.Row) string {
	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	return strings.Join(ids, ",")
}

func TestSearch_FindsAccountsAndEntries(t *testing.T) {
	env := newLedgerEnv(t)
	acct := mkAccount(t, env.app, "Office Supplies", "expense", "office_general")
	draft := env.sale(t, "2026-05-01", 100)
	setMemo(t, env, draft.Id, "Office party deposit")
	res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"office"}, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if res.Total != 2 || rowIDs(res.Rows) != "account:"+acct.Id+",entry:"+draft.Id {
		t.Fatalf("rows %s total %d", rowIDs(res.Rows), res.Total)
	}
	if res.Rows[0].Subtitle != "Expense" || res.Rows[1].Title != "Draft journal entry" || res.Rows[1].Meta != "2026-05-01" {
		t.Fatalf("row shapes: %+v", res.Rows)
	}
}

func TestSearch_NoAccessFindsNothing(t *testing.T) {
	env := newLedgerEnv(t)
	res, err := searchBooks(env.app, env.users.none.Id, search.Query{Include: []string{"checking"}, Limit: 10})
	if err != nil || len(res.Rows) != 0 || res.Total != 0 {
		t.Fatalf("none level saw %s (total %d), err %v", rowIDs(res.Rows), res.Total, err)
	}
}

func TestSearch_ExcludesAndEscapesWildcards(t *testing.T) {
	env := newLedgerEnv(t)
	club := mkAccount(t, env.app, "100% Club", "expense", "other_business_expenses")
	mkAccount(t, env.app, "1000 Widgets", "cost_of_goods_sold", "supplies_materials")
	res, _ := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"100%"}, Limit: 10})
	if rowIDs(res.Rows) != "account:"+club.Id {
		t.Fatalf("100%% matched %s", rowIDs(res.Rows))
	}
	res, _ = searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"income"}, Exclude: []string{"consulting"}, Limit: 10})
	if len(res.Rows) != 0 {
		t.Fatalf("exclude kept %s", rowIDs(res.Rows))
	}
	res, _ = searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"income"}, Limit: 10})
	if len(res.Rows) != 1 {
		t.Fatalf("without the exclude, income matched %s", rowIDs(res.Rows))
	}
}

func TestSearch_HidesVoidReversals(t *testing.T) {
	env := newLedgerEnv(t)
	sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	if err := setStatus(env.app, sale.Id, statusVoid, ""); err != nil {
		t.Fatal(err)
	}
	res, _ := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"1"}, Limit: 10})
	if rowIDs(res.Rows) != "entry:"+sale.Id || res.Rows[0].Title != "Journal entry 1 (void)" {
		t.Fatalf("rows %s %+v", rowIDs(res.Rows), res.Rows)
	}
}

// A query that matches many accounts still shows entries on its first page:
// accounts and entries take turns, so neither kind starves the other.
func TestSearch_AccountsDoNotCrowdOutEntries(t *testing.T) {
	env := newLedgerEnv(t)
	var accounts []string
	for _, n := range []string{"101", "102", "103"} {
		a := saveRecord(t, env.app, "books_accounts", map[string]any{
			"name": "Account " + n, "number": n, "type": "expense", "detail_type": "office_general", "currency": "USD",
		})
		accounts = append(accounts, "account:"+a.Id)
	}
	draft := env.sale(t, "2026-05-01", 100)
	setMemo(t, env, draft.Id, "Invoice 1")
	res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"1"}, Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if want := accounts[0] + ",entry:" + draft.Id; rowIDs(res.Rows) != want || res.Total != 4 {
		t.Fatalf("rows %s total %d, want %s total 4", rowIDs(res.Rows), res.Total, want)
	}
	res, _ = searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"1"}, Limit: 10, Offset: 2})
	if want := accounts[1] + "," + accounts[2]; rowIDs(res.Rows) != want {
		t.Fatalf("second page %s, want %s", rowIDs(res.Rows), want)
	}
}

func TestSearch_LimitOffsetAndTheDefaultLimit(t *testing.T) {
	env := newLedgerEnv(t)
	var ids []string
	for i := range defaultSearchLimit + 5 {
		a := mkAccount(t, env.app, fmt.Sprintf("Fund %02d", i), "bank", "checking")
		ids = append(ids, "account:"+a.Id)
	}
	query := func(limit, offset int) search.Result {
		t.Helper()
		res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"fund"}, Limit: limit, Offset: offset})
		if err != nil {
			t.Fatal(err)
		}
		return res
	}
	if res := query(0, 0); rowIDs(res.Rows) != strings.Join(ids[:defaultSearchLimit], ",") || res.Total != len(ids) {
		t.Fatalf("default limit: %d rows, total %d", len(res.Rows), res.Total)
	}
	if res := query(5, 3); rowIDs(res.Rows) != strings.Join(ids[3:8], ",") {
		t.Fatalf("limit 5 offset 3: %s", rowIDs(res.Rows))
	}
	if res := query(5, len(ids)); len(res.Rows) != 0 {
		t.Fatalf("offset past the end: %s", rowIDs(res.Rows))
	}
	// The aggregator clamps a negative offset; a source called directly
	// must not panic on one either.
	if res := query(5, -3); rowIDs(res.Rows) != strings.Join(ids[:5], ",") {
		t.Fatalf("negative offset: %s", rowIDs(res.Rows))
	}
}
