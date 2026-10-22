package books

import (
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestAccountTypes_MatchTheMigration(t *testing.T) {
	app := newBooksApp(t)
	col, _ := app.FindCollectionByNameOrId("books_accounts")
	field, ok := col.Fields.GetByName("type").(*core.SelectField)
	if !ok {
		t.Fatal("books_accounts.type is not a select field")
	}
	keys := make([]string, 0, len(accountTypes))
	for _, typ := range accountTypes {
		keys = append(keys, typ.Key)
	}
	if !slices.Equal(field.Values, keys) {
		t.Fatalf("migration types %v != account_types.json keys %v", field.Values, keys)
	}
}

func TestAccountTypes_AreWellFormed(t *testing.T) {
	normal := map[string]string{"asset": "debit", "expense": "debit", "liability": "credit", "equity": "credit", "income": "credit"}
	for _, typ := range accountTypes {
		if normal[typ.Group] != typ.Normal {
			t.Errorf("%s: group %s with normal %s", typ.Key, typ.Group, typ.Normal)
		}
		if len(typ.DetailTypes) == 0 {
			t.Errorf("%s has no detail types", typ.Key)
		}
	}
	bank, ok := accountType("bank")
	if !ok || !bank.hasDetail("checking") || bank.hasDetail("rent_lease") {
		t.Fatal("bank detail lookup")
	}
}
