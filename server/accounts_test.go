package books

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func newAccount(app core.App, fields map[string]any) (*core.Record, error) {
	col, err := app.FindCollectionByNameOrId("books_accounts")
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	r.Load(fields)
	return r, app.Save(r)
}

func TestAccount_DetailTypeMustBelongToTheType(t *testing.T) {
	app := newGuardedApp(t)
	_, err := newAccount(app, map[string]any{"name": "Checking", "type": "bank", "detail_type": "rent_lease"})
	requireRefused(t, err, "is not a detail type of Bank accounts")
}

func TestAccount_CurrencyIsStamped(t *testing.T) {
	app := newGuardedApp(t)
	r, err := newAccount(app, map[string]any{"name": "Checking", "type": "bank", "detail_type": "checking"})
	if err != nil || r.GetString("currency") != "USD" {
		t.Fatalf("currency %q, err %v", r.GetString("currency"), err)
	}
}

func TestAccount_SubAccountSharesTheParentType(t *testing.T) {
	app := newGuardedApp(t)
	parent := mkAccount(t, app, "Utilities", "expense", "utilities")
	_, err := newAccount(app, map[string]any{"name": "Deposit", "type": "other_asset", "detail_type": "security_deposits", "parent": parent.Id})
	requireRefused(t, err, "same type as its parent (Expense)")
}

func TestAccount_NoCycles(t *testing.T) {
	app := newGuardedApp(t)
	a := mkAccount(t, app, "A", "expense", "utilities")
	b, err := newAccount(app, map[string]any{"name": "B", "type": "expense", "detail_type": "utilities", "parent": a.Id})
	if err != nil {
		t.Fatal(err)
	}
	a = reload(t, app, "books_accounts", a.Id)
	a.Set("parent", b.Id)
	requireRefused(t, app.Save(a), "inside its own sub-account")
	a.Set("parent", a.Id)
	requireRefused(t, app.Save(a), "inside its own sub-account")
}

func TestAccount_AtMostFiveLevels(t *testing.T) {
	app := newGuardedApp(t)
	parent := mkAccount(t, app, "L1", "expense", "utilities")
	for _, name := range []string{"L2", "L3", "L4", "L5"} {
		next, err := newAccount(app, map[string]any{"name": name, "type": "expense", "detail_type": "utilities", "parent": parent.Id})
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		parent = next
	}
	_, err := newAccount(app, map[string]any{"name": "L6", "type": "expense", "detail_type": "utilities", "parent": parent.Id})
	requireRefused(t, err, "at most 5 levels")

	// Moving a two-level subtree under level 4 would make it six deep.
	top := mkAccount(t, app, "Other", "expense", "utilities")
	if _, err := newAccount(app, map[string]any{"name": "Other child", "type": "expense", "detail_type": "utilities", "parent": top.Id}); err != nil {
		t.Fatal(err)
	}
	level4, _ := app.FindFirstRecordByFilter("books_accounts", "name = 'L4'")
	top = reload(t, app, "books_accounts", top.Id)
	top.Set("parent", level4.Id)
	requireRefused(t, app.Save(top), "at most 5 levels")
}

func TestAccount_TypeIsFixedOnceUsed(t *testing.T) {
	app := newGuardedApp(t)
	rent := mkAccount(t, app, "Rent", "expense", "rent_lease")
	cash := mkAccount(t, app, "Cash", "bank", "cash_on_hand")
	mkDraft(t, app, "2026-05-01", ln{rent, 100, 0}, ln{cash, 0, 100})
	rent = reload(t, app, "books_accounts", rent.Id)
	rent.Set("type", "other_expense")
	rent.Set("detail_type", "other_misc_expense")
	requireRefused(t, app.Save(rent), "used on 1 journal lines")
}

func TestAccount_InactivateChildrenFirst(t *testing.T) {
	app := newGuardedApp(t)
	parent := mkAccount(t, app, "Utilities", "expense", "utilities")
	if _, err := newAccount(app, map[string]any{"name": "Power", "type": "expense", "detail_type": "utilities", "parent": parent.Id}); err != nil {
		t.Fatal(err)
	}
	parent = reload(t, app, "books_accounts", parent.Id)
	parent.Set("inactive", true)
	requireRefused(t, app.Save(parent), "Make the 1 active sub-accounts inactive first")
}

func TestAccount_DeleteExplainsWhatBlocksIt(t *testing.T) {
	app := newGuardedApp(t)
	rent := mkAccount(t, app, "Rent", "expense", "rent_lease")
	cash := mkAccount(t, app, "Cash", "bank", "cash_on_hand")
	mkDraft(t, app, "2026-05-01", ln{rent, 100, 0}, ln{cash, 0, 100})
	requireRefused(t, app.Delete(reload(t, app, "books_accounts", rent.Id)), "Make it inactive instead")

	parent := mkAccount(t, app, "Utilities", "expense", "utilities")
	if _, err := newAccount(app, map[string]any{"name": "Power", "type": "expense", "detail_type": "utilities", "parent": parent.Id}); err != nil {
		t.Fatal(err)
	}
	requireRefused(t, app.Delete(reload(t, app, "books_accounts", parent.Id)), "has 1 sub-accounts")

	unused := mkAccount(t, app, "Unused", "expense", "travel")
	if err := app.Delete(unused); err != nil {
		t.Fatalf("delete unused: %v", err)
	}
}
