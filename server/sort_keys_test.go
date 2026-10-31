package books

import (
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The sort form folds case and accents, so "Émile" sorts among the e's, and
// drops what a PocketBase filter string cannot carry before its closing quote.
func TestSortName_FoldsCaseAndAccentsAndDropsControls(t *testing.T) {
	for in, want := range map[string]string{
		"Émile Café": "emile cafe",
		"ÉMILE":      "emile",
		"Straße":     "strasse",
		"Ångström":   "angstrom",
		`Back\slash`: "back/slash",
		"tab\there":  "tabhere",
		"日本":         "日本",
	} {
		if got := sortName(in); got != want {
			t.Errorf("sortName(%q) = %q, want %q", in, got, want)
		}
	}
}

// customerNamesInListOrder reads every customer in the list's order: by
// sort_key, then id, in SQLite's byte order, as PocketBase sorts them.
func customerNamesInListOrder(t testing.TB, app core.App) string {
	t.Helper()
	var names []string
	if err := app.DB().NewQuery("SELECT display_name FROM books_customers ORDER BY sort_key, id").Column(&names); err != nil {
		t.Fatal(err)
	}
	return strings.Join(names, ",")
}

// Sub-customers follow their parent, before a top-level customer whose name
// only starts with the parent's, and case does not move a name.
func TestSortKey_CustomersSortAsATree(t *testing.T) {
	env := newLedgerEnv(t)
	alder := mkCustomer(t, env.app, "Alder", "")
	mkCustomer(t, env.app, "Alder Farms", "")
	mkCustomer(t, env.app, "Birch Mills", "")
	mkCustomer(t, env.app, "Zeta Annex", alder.Id)
	mkCustomer(t, env.app, "beta annex", alder.Id)
	if got, want := customerNamesInListOrder(t, env.app), "Alder,beta annex,Zeta Annex,Alder Farms,Birch Mills"; got != want {
		t.Fatalf("list order %s, want %s", got, want)
	}
}

// Renaming a top-level customer moves its sub-customers with it: each one's key
// starts again with the parent's new key, in the same transaction.
func TestSortKey_RenamingAParentMovesItsSubCustomers(t *testing.T) {
	env := newLedgerEnv(t)
	alder := mkCustomer(t, env.app, "Alder", "")
	mkCustomer(t, env.app, "Birch Mills", "")
	sub := mkCustomer(t, env.app, "Annex", alder.Id)
	renamed := reload(t, env.app, "books_customers", alder.Id)
	renamed.Set("display_name", "Zinc Holdings")
	if err := env.app.Save(renamed); err != nil {
		t.Fatal(err)
	}
	if got, want := customerNamesInListOrder(t, env.app), "Birch Mills,Zinc Holdings,Annex"; got != want {
		t.Fatalf("list order after the rename %s, want %s", got, want)
	}
	parentKey := reload(t, env.app, "books_customers", alder.Id).GetString("sort_key")
	if key := reload(t, env.app, "books_customers", sub.Id).GetString("sort_key"); !strings.HasPrefix(key, parentKey+sortChildSep) {
		t.Fatalf("sub-customer key %q does not start with the parent's %q", key, parentKey)
	}
}

// A customer saved without an id gets one in the guard, so its key can name it.
func TestSortKey_ANewCustomerKeyNamesItsID(t *testing.T) {
	env := newLedgerEnv(t)
	c := mkCustomer(t, env.app, "Émile Supply", "")
	if got, want := reload(t, env.app, "books_customers", c.Id).GetString("sort_key"), "emile supply"+sortIDSep+c.Id; got != want {
		t.Fatalf("sort_key %q, want %q", got, want)
	}
}

func TestSortKey_VendorsAndProductsSortByName(t *testing.T) {
	env := newLedgerEnv(t)
	vendor := mkVendor(t, env.app, "Émile Supply")
	if got := reload(t, env.app, "books_vendors", vendor.Id).GetString("sort_key"); got != "emile supply" {
		t.Fatalf("vendor sort_key %q", got)
	}
	renamed := reload(t, env.app, "books_vendors", vendor.Id)
	renamed.Set("display_name", "Zeta Freight")
	if err := env.app.Save(renamed); err != nil {
		t.Fatal(err)
	}
	if got := reload(t, env.app, "books_vendors", vendor.Id).GetString("sort_key"); got != "zeta freight" {
		t.Fatalf("renamed vendor sort_key %q", got)
	}
	product := mkService(t, env.app, "Ångström Tuning", mkIncomeAccount(t, env.app))
	if got := reload(t, env.app, "books_products", product.Id).GetString("sort_key"); got != "angstrom tuning" {
		t.Fatalf("product sort_key %q", got)
	}
}

// A reader sees sort_key and pages by it, as a list's cursor request does: it
// is not hidden, so a non-superuser may sort and filter on it.
func TestSortKey_AReaderSortsAndPagesByIt(t *testing.T) {
	env := newLedgerEnv(t)
	mkVendor(t, env.app, "Alpha Freight")
	mkVendor(t, env.app, "Beta Freight")
	filter := url.QueryEscape(`inactive = false && sort_key > "alpha freight"`)
	apiReq{
		method:  http.MethodGet,
		url:     "/api/collections/books_vendors/records?sort=sort_key,id&perPage=51&filter=" + filter,
		token:   tokenFor(t, env.users.readOnly),
		want:    http.StatusOK,
		content: []string{`"totalItems":1`, `"display_name":"Beta Freight"`, `"sort_key":"beta freight"`},
	}.run(t, env.app)
}
