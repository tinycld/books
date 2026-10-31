package books

import (
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/fts"
)

// newSearchEnv is newLedgerEnv with the search index kept in step. The sync
// hooks are bound before the env's accounts are saved, so those are indexed too.
func newSearchEnv(t *testing.T) *ledgerEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSearchIndex(&pocketbase.PocketBase{App: app})
	return ledgerEnvOn(t, app)
}

// indexed lists, in id order, the record ids an index holds for a term.
func indexed(t testing.TB, app core.App, index, term string) string {
	t.Helper()
	var ids []string
	if err := app.DB().NewQuery("SELECT record_id FROM " + index + " WHERE " + index + " MATCH {:m} ORDER BY record_id").
		Bind(dbx.Params{"m": fts.SanitizeQuery(term)}).Column(&ids); err != nil {
		t.Fatalf("read %s for %q: %v", index, term, err)
	}
	return strings.Join(ids, ",")
}

func setField(t testing.TB, app core.App, r *core.Record, field, value string) {
	t.Helper()
	fresh := reload(t, app, r.Collection().Name, r.Id)
	fresh.Set(field, value)
	if err := app.Save(fresh); err != nil {
		t.Fatalf("set %s of %s: %v", field, r.Id, err)
	}
}

// The migration's tables and the Go configs name the same columns: a column
// the sync writes but the table lacks would fail every insert, silently.
func TestSearchIndex_TablesHoldTheConfiguredColumns(t *testing.T) {
	app := newBooksApp(t)
	for _, cfg := range searchIndexes {
		cols := []string{"record_id"}
		for _, c := range cfg.Columns {
			cols = append(cols, c.FTS)
		}
		var rows int
		if err := app.DB().NewQuery("SELECT COUNT(*) FROM (SELECT " + strings.Join(cols, ", ") + " FROM " + cfg.Table + ")").Row(&rows); err != nil {
			t.Errorf("%s: %v", cfg.Table, err)
		}
		if _, err := app.FindCollectionByNameOrId(cfg.Collection); err != nil {
			t.Errorf("%s indexes %s: %v", cfg.Table, cfg.Collection, err)
		}
	}
	if len(searchIndexes) != 5 {
		t.Fatalf("%d indexes, want one per search source (5)", len(searchIndexes))
	}
}

// A record is found by its text from its first save, by its new text after a
// rename (never by the old), and no longer after a delete.
func TestSearchIndex_FollowsCreateRenameAndDelete(t *testing.T) {
	env := newSearchEnv(t)
	income := mkIncomeAccount(t, env.app)
	kinds := []struct {
		index, field string
		record       *core.Record
	}{
		{customersIndex, "display_name", mkCustomer(t, env.app, "Quillon Studio", "")},
		{vendorsIndex, "display_name", mkVendor(t, env.app, "Quillon Freight")},
		{productsIndex, "name", mkService(t, env.app, "Quillon Review", income)},
	}
	for _, k := range kinds {
		if got := indexed(t, env.app, k.index, "quillon"); got != k.record.Id {
			t.Fatalf("%s: quillon found %q, want %s", k.index, got, k.record.Id)
		}
		setField(t, env.app, k.record, k.field, "Tamsin")
		if got := indexed(t, env.app, k.index, "quillon"); got != "" {
			t.Fatalf("%s: the old name still finds %q", k.index, got)
		}
		if got := indexed(t, env.app, k.index, "tamsin"); got != k.record.Id {
			t.Fatalf("%s: tamsin found %q, want %s", k.index, got, k.record.Id)
		}
		if err := env.app.Delete(reload(t, env.app, k.record.Collection().Name, k.record.Id)); err != nil {
			t.Fatalf("delete %s: %v", k.record.Id, err)
		}
		if got := indexed(t, env.app, k.index, "tamsin"); got != "" {
			t.Fatalf("%s: a deleted record is still found: %q", k.index, got)
		}
	}

	account := mkAccount(t, env.app, "Quillon Reserve", "bank", "checking")
	if got := indexed(t, env.app, accountsIndex, "quillon"); got != account.Id {
		t.Fatalf("accounts: quillon found %q", got)
	}
	setField(t, env.app, account, "name", "Tamsin Reserve")
	if indexed(t, env.app, accountsIndex, "quillon") != "" || indexed(t, env.app, accountsIndex, "tamsin") != account.Id {
		t.Fatal("accounts: the index did not follow the rename")
	}

	// A draft is found by its memo; posting gives it a number, found too.
	draft := env.sale(t, "2026-05-01", 100)
	setField(t, env.app, draft, "memo", "Quillon deposit")
	if got := indexed(t, env.app, entriesIndex, "quillon"); got != draft.Id {
		t.Fatalf("entries: quillon found %q", got)
	}
	posted := mustPost(t, env.app, draft.Id, "")
	if got := indexed(t, env.app, entriesIndex, posted.GetString("number")); got != draft.Id {
		t.Fatalf("entries: number %q found %q", posted.GetString("number"), got)
	}
}
