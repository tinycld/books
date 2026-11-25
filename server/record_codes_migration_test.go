package books

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/rlstest"
)

const recordCodesMigration = "2100000046_add_books_record_codes.js"

// appBeforeMigration is a Books database migrated up to, not including, the migration
// file named stop, and the directory that holds stop and the files after it.
func appBeforeMigration(t *testing.T, stop string) (*tests.TestApp, string) {
	t.Helper()
	src := rlstest.MigrationsDir(t, "../pb-migrations")
	before, after := t.TempDir(), t.TempDir()
	entries, err := os.ReadDir(src)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".js") {
			continue
		}
		dst := before
		if e.Name() >= stop {
			dst = after
		}
		raw, err := os.ReadFile(filepath.Join(src, e.Name()))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dst, e.Name()), raw, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return rlstest.NewAssembledApp(t, before), after
}

// vectorID is a record id that sorts by the vector's index.
func vectorID(prefix string, i int) string {
	return prefix + strings.Repeat("0", 9) + string(rune('a'+i/10)) + string(rune('0'+i%10))
}

func TestRecordCodes_Backfill(t *testing.T) {
	app, after := appBeforeMigration(t, recordCodesMigration)
	// No guards are bound: name_key is set by hand so the (parent, name_key) and
	// name_key unique indexes take the rows. Ids order the walk when created ties.
	for i, v := range deriveVectors {
		id := vectorID("cust", i)
		saveRecord(t, app, "books_customers", map[string]any{
			"id": id, "display_name": v.name + " " + id, "name_key": id,
		})
	}
	saveRecord(t, app, "books_vendors", map[string]any{"id": "vend00000000001", "display_name": "Aspen Ridge Dental", "name_key": "a"})
	saveRecord(t, app, "books_vendors", map[string]any{"id": "vend00000000002", "display_name": "Acme Rental Depot", "name_key": "b"})
	saveRecord(t, app, "books_products", map[string]any{"id": "prod00000000001", "name": "李明", "name_key": "a", "type": "service", "currency": "USD"})
	saveRecord(t, app, "books_products", map[string]any{"id": "prod00000000002", "name": "X", "name_key": "b", "type": "service", "currency": "USD"})

	rlstest.Apply(t, app, after)

	vendorCodes := []string{
		reload(t, app, "books_vendors", "vend00000000001").GetString("code"),
		reload(t, app, "books_vendors", "vend00000000002").GetString("code"),
	}
	if vendorCodes[0] != "ARD" || vendorCodes[1] != "ARD-2" {
		t.Fatalf("vendor codes = %v, want [ARD ARD-2]", vendorCodes)
	}
	productCodes := []string{
		reload(t, app, "books_products", "prod00000000001").GetString("code"),
		reload(t, app, "books_products", "prod00000000002").GetString("code"),
	}
	if productCodes[0] != "ITEM" || productCodes[1] != "ITEM-2" {
		t.Fatalf("product codes = %v, want [ITEM ITEM-2]", productCodes)
	}

	// Every customer has a code matching the pattern, and none repeats.
	var codes []string
	if err := app.DB().Select("code").From("books_customers").Column(&codes); err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, c := range codes {
		if !recordCodePattern.MatchString(c) || seen[c] {
			t.Fatalf("bad or repeated customer code %q in %v", c, codes)
		}
		seen[c] = true
	}

	// The unique index refuses a second ARD.
	_, err := app.DB().NewQuery("UPDATE books_vendors SET code = {:code} WHERE id = {:id}").
		Bind(dbx.Params{"code": "ARD", "id": "vend00000000002"}).Execute()
	if err == nil {
		t.Fatal("the unique code index must refuse a repeated code")
	}

	// The search index holds the code.
	var hits []string
	if err := app.DB().NewQuery("SELECT record_id FROM fts_books_vendors WHERE fts_books_vendors MATCH {:q}").
		Bind(dbx.Params{"q": "code:ARD"}).Column(&hits); err != nil {
		t.Fatal(err)
	}
	if len(hits) != 2 { // ARD and ARD-2 both hold the token ard
		t.Fatalf("fts code hits = %v, want 2", hits)
	}
}

// The migration's JS copy of the rule gives each vector's code: one customer per
// vector, named exactly by it, walked in id order (the ids rise with the index).
func TestRecordCodes_BackfillMatchesTheGoRule(t *testing.T) {
	app, after := appBeforeMigration(t, recordCodesMigration)
	ids := make([]string, len(deriveVectors))
	for i, v := range deriveVectors {
		if v.name == "" { // display_name is required
			continue
		}
		ids[i] = vectorID("cust", i)
		saveRecord(t, app, "books_customers", map[string]any{"id": ids[i], "display_name": v.name, "name_key": ids[i]})
	}
	rlstest.Apply(t, app, after)
	taken := map[string]bool{}
	for i, v := range deriveVectors {
		if ids[i] == "" {
			continue
		}
		base := v.code
		if base == "" {
			base = "CUST"
		}
		want := nextFreeCode(base, taken, recordCodeMax)
		taken[want] = true
		if got := reload(t, app, "books_customers", ids[i]).GetString("code"); got != want {
			t.Errorf("%q: code = %q, want %q", v.name, got, want)
		}
	}
}
