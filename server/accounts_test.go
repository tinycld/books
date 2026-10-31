package books

import (
	"database/sql"
	"errors"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
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

// PocketBase would clear a non-required relation when its account is
// deleted, so the account would silently drop off the product: the delete is
// refused instead, and making the account inactive is the way out.
func TestAccount_DeleteRefusedWhileAProductUsesIt(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	rent := mkAccount(t, app, "Rent", "expense", "rent_lease")
	payroll := mkService(t, app, "Payroll setup", income)
	var buyers []*core.Record
	for _, name := range []string{"Wireless AP", "Patch cable"} {
		p, err := newProduct(app, map[string]any{
			"type": "non_inventory", "name": name, "income_account": income.Id,
			"purchases": true, "expense_account": rent.Id,
		})
		if err != nil {
			t.Fatalf("save %s: %v", name, err)
		}
		buyers = append(buyers, p)
	}

	consulting := mkAccount(t, app, "Consulting Income", "income", "service_income")
	lessons := mkService(t, app, "Lessons", consulting)
	err := app.Delete(reload(t, app, "books_accounts", consulting.Id))
	requireMessageOnlyRefusal(t, err,
		"This account is used by 1 product or service and cannot be deleted. Make it inactive instead.")

	err = app.Delete(reload(t, app, "books_accounts", rent.Id))
	requireMessageOnlyRefusal(t, err,
		"This account is used by 2 products and services and cannot be deleted. Make it inactive instead.")

	err = app.Delete(reload(t, app, "books_accounts", income.Id))
	requireMessageOnlyRefusal(t, err,
		"This account is used by 3 products and services and cannot be deleted. Make it inactive instead.")

	for _, account := range []*core.Record{consulting, rent, income} {
		makeAccountInactive(t, app, account)
	}
	if got := reload(t, app, "books_products", lessons.Id).GetString("income_account"); got != consulting.Id {
		t.Errorf("Lessons income_account = %q after its account was made inactive, want %q", got, consulting.Id)
	}
	if got := reload(t, app, "books_products", payroll.Id).GetString("income_account"); got != income.Id {
		t.Errorf("Payroll setup income_account = %q after its account was made inactive, want %q", got, income.Id)
	}
	for _, p := range buyers {
		if got := reload(t, app, "books_products", p.Id).GetString("expense_account"); got != rent.Id {
			t.Errorf("%s expense_account = %q after its account was made inactive, want %q", p.GetString("name"), got, rent.Id)
		}
	}
	for _, account := range []*core.Record{consulting, rent, income} {
		if !reload(t, app, "books_accounts", account.Id).GetBool("inactive") {
			t.Errorf("%s is not inactive", account.GetString("name"))
		}
	}
}

const boxNeedsExpenseTypeText = "Only expense accounts can be reported on a 1099. Set this account to Not reported in Settings → 1099s first."

func TestAccount_MessagesAreTheDecisionsTexts(t *testing.T) {
	if msgBoxNeedsExpenseType != boxNeedsExpenseTypeText {
		t.Errorf("msgBoxNeedsExpenseType = %q, want %q", msgBoxNeedsExpenseType, boxNeedsExpenseTypeText)
	}
}

func TestAccount1099_BoxNeedsAnExpenseGroupType(t *testing.T) {
	refused := []struct{ name, accountType, detail, box string }{
		{"Checking", "bank", "checking", "nec_1"},
		{"Consulting Income", "income", "service_income", "misc_1"},
	}
	for _, tc := range refused {
		t.Run("refused "+tc.accountType, func(t *testing.T) {
			app := newGuardedApp(t)
			_, err := newAccount(app, map[string]any{
				"name": tc.name, "type": tc.accountType, "detail_type": tc.detail, "form_1099_box": tc.box,
			})
			requireMessageOnlyRefusal(t, err, boxNeedsExpenseTypeText)
			if n, _ := app.CountRecords("books_accounts", dbx.HashExp{"name": tc.name}); n != 0 {
				t.Errorf("%d %s accounts after the refusal, want 0", n, tc.name)
			}
		})
	}
	accepted := []struct{ name, accountType, detail, box string }{
		{"Materials", "cost_of_goods_sold", "supplies_materials", "nec_1"},
		{"Advertising", "expense", "advertising_marketing", "misc_1"},
		{"Depreciation", "other_expense", "depreciation", "misc_10"},
	}
	for _, tc := range accepted {
		t.Run("accepted "+tc.accountType, func(t *testing.T) {
			app := newGuardedApp(t)
			r, err := newAccount(app, map[string]any{
				"name": tc.name, "type": tc.accountType, "detail_type": tc.detail, "form_1099_box": tc.box,
			})
			if err != nil {
				t.Fatalf("a %s account with box %s was refused: %v", tc.accountType, tc.box, err)
			}
			if got := reload(t, app, "books_accounts", r.Id).GetString("form_1099_box"); got != tc.box {
				t.Errorf("form_1099_box = %q, want %q", got, tc.box)
			}
		})
	}
}

func TestAccount1099_UpdateRefusals(t *testing.T) {
	app := newGuardedApp(t)

	income := mkAccount(t, app, "Consulting Income", "income", "service_income")
	err := setFields(t, app, "books_accounts", income.Id, map[string]any{"form_1099_box": "misc_1"})
	requireMessageOnlyRefusal(t, err, boxNeedsExpenseTypeText)
	if got := reload(t, app, "books_accounts", income.Id).GetString("form_1099_box"); got != "" {
		t.Errorf("income account form_1099_box after the refusal = %q, want empty", got)
	}

	mapped, err := newAccount(app, map[string]any{
		"name": "Legal Fees", "type": "expense", "detail_type": "advertising_marketing", "form_1099_box": "misc_10",
	})
	if err != nil {
		t.Fatalf("save a mapped expense account: %v", err)
	}

	err = setFields(t, app, "books_accounts", mapped.Id, map[string]any{"type": "income", "detail_type": "service_income"})
	requireMessageOnlyRefusal(t, err, boxNeedsExpenseTypeText)
	stored := reload(t, app, "books_accounts", mapped.Id)
	if stored.GetString("type") != "expense" || stored.GetString("form_1099_box") != "misc_10" {
		t.Errorf("after the refused type change: type %q, box %q; want expense, misc_10",
			stored.GetString("type"), stored.GetString("form_1099_box"))
	}

	if err := setFields(t, app, "books_accounts", mapped.Id, map[string]any{"type": "other_expense", "detail_type": "depreciation"}); err != nil {
		t.Fatalf("a mapped account's change to other_expense was refused: %v", err)
	}
	stored = reload(t, app, "books_accounts", mapped.Id)
	if stored.GetString("type") != "other_expense" || stored.GetString("form_1099_box") != "misc_10" {
		t.Errorf("after the change to other_expense: type %q, box %q; want other_expense, misc_10",
			stored.GetString("type"), stored.GetString("form_1099_box"))
	}

	if err := setFields(t, app, "books_accounts", mapped.Id, map[string]any{
		"type": "income", "detail_type": "service_income", "form_1099_box": "",
	}); err != nil {
		t.Fatalf("a change to income that also clears the box was refused: %v", err)
	}
	stored = reload(t, app, "books_accounts", mapped.Id)
	if stored.GetString("type") != "income" || stored.GetString("form_1099_box") != "" {
		t.Errorf("after the change to income with no box: type %q, box %q; want income, empty",
			stored.GetString("type"), stored.GetString("form_1099_box"))
	}
}

func TestAccount1099_InactiveKeepsTheBox(t *testing.T) {
	app := newGuardedApp(t)
	r, err := newAccount(app, map[string]any{
		"name": "Rent", "type": "expense", "detail_type": "rent_lease", "form_1099_box": "misc_1",
	})
	if err != nil {
		t.Fatalf("save a mapped account: %v", err)
	}
	makeAccountInactive(t, app, r)
	stored := reload(t, app, "books_accounts", r.Id)
	if !stored.GetBool("inactive") || stored.GetString("form_1099_box") != "misc_1" {
		t.Errorf("inactive %v, box %q; want true, misc_1", stored.GetBool("inactive"), stored.GetString("form_1099_box"))
	}
}

func TestAccount1099_DeleteRemovesTheBox(t *testing.T) {
	app := newGuardedApp(t)
	r, err := newAccount(app, map[string]any{
		"name": "Rent", "type": "expense", "detail_type": "rent_lease", "form_1099_box": "misc_1",
	})
	if err != nil {
		t.Fatalf("save a mapped account: %v", err)
	}
	if err := app.Delete(reload(t, app, "books_accounts", r.Id)); err != nil {
		t.Fatalf("delete a mapped account with no lines: %v", err)
	}
	if _, err := app.FindRecordById("books_accounts", r.Id); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("find the deleted account = %v, want no row", err)
	}
}

func TestAccount1099_BoxesPerAccount(t *testing.T) {
	app := newGuardedApp(t)

	// Several accounts may share a box.
	for _, name := range []string{"Contract Labor", "Freelance Design"} {
		r, err := newAccount(app, map[string]any{
			"name": name, "type": "expense", "detail_type": "advertising_marketing", "form_1099_box": "nec_1",
		})
		if err != nil {
			t.Fatalf("%s with box nec_1 was refused: %v", name, err)
		}
		if got := reload(t, app, "books_accounts", r.Id).GetString("form_1099_box"); got != "nec_1" {
			t.Errorf("%s form_1099_box = %q, want nec_1", name, got)
		}
	}

	// A sub-account has its own box; it does not take its parent's.
	parent := mkAccount(t, app, "Software Subscriptions", "expense", "utilities")
	child, err := newAccount(app, map[string]any{
		"name": "Design Tools", "type": "expense", "detail_type": "utilities", "parent": parent.Id, "form_1099_box": "misc_1",
	})
	if err != nil {
		t.Fatalf("a sub-account with its own box was refused: %v", err)
	}
	if got := reload(t, app, "books_accounts", child.Id).GetString("form_1099_box"); got != "misc_1" {
		t.Errorf("sub-account form_1099_box = %q, want misc_1", got)
	}
	if got := reload(t, app, "books_accounts", parent.Id).GetString("form_1099_box"); got != "" {
		t.Errorf("parent form_1099_box = %q, want empty", got)
	}

	// PocketBase keeps the last value of a single select, so a two-box write
	// stores exactly one box.
	two, err := newAccount(app, map[string]any{
		"name": "Two Boxes", "type": "expense", "detail_type": "advertising_marketing", "form_1099_box": []string{"nec_1", "misc_1"},
	})
	if err != nil {
		t.Fatalf("a two-box write was refused: %v", err)
	}
	if got := reload(t, app, "books_accounts", two.Id).GetString("form_1099_box"); got != "misc_1" {
		t.Errorf("a two-box write stored form_1099_box = %q, want misc_1", got)
	}

	_, err = newAccount(app, map[string]any{
		"name": "Fish", "type": "expense", "detail_type": "advertising_marketing", "form_1099_box": "misc_7",
	})
	requireSchemaRefusal(t, err, "form_1099_box")
}

// Only a parent that is not there reads as "does not exist". A failed read is
// returned as the error it is, not shown to a person as a missing parent.
func TestAccount_AFailedParentReadIsNotAMissingParent(t *testing.T) {
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId("books_accounts")
	if err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(col)
	r.Load(map[string]any{"name": "Sub", "type": "bank", "detail_type": "checking", "parent": "noparent0000001"})
	requireRefused(t, validateParent(app, r), "The parent account does not exist.")
	db, ok := app.ConcurrentDB().(*dbx.DB)
	if !ok {
		t.Fatalf("concurrent db is %T", app.ConcurrentDB())
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	err = validateParent(app, r)
	if err == nil || strings.Contains(err.Error(), "does not exist") {
		t.Fatalf("a failed read = %v, want the read error", err)
	}
}
