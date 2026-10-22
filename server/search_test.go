package books

import (
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
