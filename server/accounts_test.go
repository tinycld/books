package books

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
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

// mkSubAccount saves an account under parent, of the parent's type and detail.
func mkSubAccount(t testing.TB, app core.App, name string, parent *core.Record) *core.Record {
	t.Helper()
	r, err := newAccount(app, map[string]any{
		"name": name, "type": parent.GetString("type"), "detail_type": parent.GetString("detail_type"), "parent": parent.Id,
	})
	if err != nil {
		t.Fatalf("save %s under %s: %v", name, parent.GetString("name"), err)
	}
	return r
}

func requireFullName(t testing.TB, app core.App, id, want string) {
	t.Helper()
	r := reload(t, app, "books_accounts", id)
	if got := r.GetString("full_name"); got != want {
		t.Errorf("%s full_name = %q, want %q", r.GetString("name"), got, want)
	}
}

func TestFullNameStampedOnCreate(t *testing.T) {
	app := newGuardedApp(t)
	top := mkAccount(t, app, "Software Subscriptions", "expense", "utilities")
	child := mkSubAccount(t, app, "Design Tools", top)
	grandchild := mkSubAccount(t, app, "Figma", child)

	requireFullName(t, app, top.Id, "Software Subscriptions")
	requireFullName(t, app, child.Id, "Software Subscriptions:Design Tools")
	requireFullName(t, app, grandchild.Id, "Software Subscriptions:Design Tools:Figma")
}

func TestFullNameFollowsRenameAndMove(t *testing.T) {
	app := newGuardedApp(t)
	top := mkAccount(t, app, "Software", "expense", "utilities")
	child := mkSubAccount(t, app, "Design Tools", top)
	grandchild := mkSubAccount(t, app, "Figma", child)
	office := mkAccount(t, app, "Office", "expense", "utilities")

	if err := setFields(t, app, "books_accounts", top.Id, map[string]any{"name": "Software Subscriptions"}); err != nil {
		t.Fatalf("rename the top account: %v", err)
	}
	requireFullName(t, app, top.Id, "Software Subscriptions")
	requireFullName(t, app, child.Id, "Software Subscriptions:Design Tools")
	requireFullName(t, app, grandchild.Id, "Software Subscriptions:Design Tools:Figma")

	if err := setFields(t, app, "books_accounts", child.Id, map[string]any{"parent": office.Id}); err != nil {
		t.Fatalf("move Design Tools under Office: %v", err)
	}
	moved := map[string]string{
		top.Id:        "Software Subscriptions",
		office.Id:     "Office",
		child.Id:      "Office:Design Tools",
		grandchild.Id: "Office:Design Tools:Figma",
	}
	for id, want := range moved {
		requireFullName(t, app, id, want)
	}

	for _, id := range []string{office.Id, grandchild.Id} {
		if err := setFields(t, app, "books_accounts", id, map[string]any{"description": "Monthly tools"}); err != nil {
			t.Fatalf("edit a description: %v", err)
		}
	}
	for id, want := range moved {
		requireFullName(t, app, id, want)
	}
}

// Each subtest has its own app: apiReq allows one call per app.
func TestFullNameRefusedInBody(t *testing.T) {
	t.Run("create", func(t *testing.T) {
		app := newBooksApp(t)
		users := newLevelUsers(t, app)
		apiReq{
			method: http.MethodPost,
			url:    "/api/collections/books_accounts/records",
			token:  tokenFor(t, users.admin),
			body:   `{"name":"Petty Cash","type":"bank","detail_type":"cash_on_hand","full_name":"Cash:Petty Cash"}`,
			want:   http.StatusBadRequest,
			after: func(t testing.TB, app *tests.TestApp) {
				if n, _ := app.CountRecords("books_accounts", dbx.HashExp{"name": "Petty Cash"}); n != 0 {
					t.Errorf("%d Petty Cash accounts after a create that sent full_name, want 0", n)
				}
			},
		}.run(t, app)
	})
	t.Run("update", func(t *testing.T) {
		app := newBooksApp(t)
		users := newLevelUsers(t, app)
		checking := saveRecord(t, app, "books_accounts", map[string]any{
			"name": "Checking", "type": "bank", "detail_type": "checking", "currency": "USD", "full_name": "Checking",
		})
		apiReq{
			method: http.MethodPatch,
			url:    "/api/collections/books_accounts/records/" + checking.Id,
			token:  tokenFor(t, users.admin),
			body:   `{"full_name":"Savings"}`,
			want:   http.StatusNotFound,
			after: func(t testing.TB, app *tests.TestApp) {
				requireFullName(t, app, checking.Id, "Checking")
			},
		}.run(t, app)
	})
}

func retainedAccounts(t testing.TB, app core.App) []*core.Record {
	t.Helper()
	rows, err := app.FindAllRecords("books_accounts", dbx.HashExp{"detail_type": "retained_earnings"})
	if err != nil {
		t.Fatalf("read retained-earnings accounts: %v", err)
	}
	return rows
}

func mkRetainedEarnings(t testing.TB, app core.App, number string) *core.Record {
	t.Helper()
	return saveRecord(t, app, "books_accounts", map[string]any{
		"name": "Retained earnings", "number": number, "type": "equity", "detail_type": "retained_earnings", "currency": "USD",
	})
}

// requireCreatedRetainedEarnings asserts the chart holds exactly one
// retained-earnings account: the one Books made, numbered wantNumber.
func requireCreatedRetainedEarnings(t testing.TB, app core.App, wantNumber string) {
	t.Helper()
	rows := retainedAccounts(t, app)
	if len(rows) != 1 {
		t.Fatalf("%d retained-earnings accounts, want 1", len(rows))
	}
	r := rows[0]
	if r.GetString("name") != "Retained earnings" || r.GetString("type") != "equity" || r.GetString("number") != wantNumber {
		t.Errorf("retained-earnings account = %q %q (%s), want %q \"Retained earnings\" (equity)",
			r.GetString("number"), r.GetString("name"), r.GetString("type"), wantNumber)
	}
}

// requireRetainedEarningsNamed asserts the chart holds exactly one
// retained-earnings account, a top-level equity account named wantName.
func requireRetainedEarningsNamed(t testing.TB, app core.App, wantName string) {
	t.Helper()
	rows := retainedAccounts(t, app)
	if len(rows) != 1 {
		t.Fatalf("%d retained-earnings accounts, want 1", len(rows))
	}
	r := rows[0]
	if r.GetString("name") != wantName || r.GetString("type") != "equity" || r.GetString("parent") != "" {
		t.Errorf("retained-earnings account = %q (%s, parent %q), want %q (equity, top level)",
			r.GetString("name"), r.GetString("type"), r.GetString("parent"), wantName)
	}
}

func TestRetainedEarningsRules(t *testing.T) {
	t.Run("a chart with none accepts the first", func(t *testing.T) {
		app := newGuardedApp(t)
		if _, err := newAccount(app, map[string]any{
			"name": "Retained earnings", "number": "3900", "type": "equity", "detail_type": "retained_earnings",
		}); err != nil {
			t.Fatalf("the first retained-earnings account was refused: %v", err)
		}
		if n := len(retainedAccounts(t, app)); n != 1 {
			t.Errorf("%d retained-earnings accounts, want 1", n)
		}
	})

	t.Run("a second one is refused on create", func(t *testing.T) {
		app := newGuardedApp(t)
		mkRetainedEarnings(t, app, "3900")
		_, err := newAccount(app, map[string]any{
			"name": "Prior-year earnings", "number": "3950", "type": "equity", "detail_type": "retained_earnings",
		})
		requireMessageOnlyRefusal(t, err, msgSecondRetainedEarnings)
		if n := len(retainedAccounts(t, app)); n != 1 {
			t.Errorf("%d retained-earnings accounts after the refusal, want 1", n)
		}
	})

	t.Run("re-typing another equity account to retained earnings is refused", func(t *testing.T) {
		app := newGuardedApp(t)
		mkRetainedEarnings(t, app, "3900")
		owners := mkAccount(t, app, "Owner's equity", "equity", "owners_equity")
		err := setFields(t, app, "books_accounts", owners.Id, map[string]any{"detail_type": "retained_earnings"})
		requireMessageOnlyRefusal(t, err, msgSecondRetainedEarnings)
		if got := reload(t, app, "books_accounts", owners.Id).GetString("detail_type"); got != "owners_equity" {
			t.Errorf("Owner's equity detail_type = %q after the refusal, want owners_equity", got)
		}
	})

	// An account created inactive is a deactivated only one.
	t.Run("creating an inactive one is refused", func(t *testing.T) {
		app := newGuardedApp(t)
		_, err := newAccount(app, map[string]any{
			"name": "Retained earnings", "number": "3900", "type": "equity", "detail_type": "retained_earnings", "inactive": true,
		})
		requireMessageOnlyRefusal(t, err, msgNeedsRetainedEarnings)
		if n := len(retainedAccounts(t, app)); n != 0 {
			t.Errorf("%d retained-earnings accounts after the refusal, want 0", n)
		}
	})

	refusals := []struct {
		name   string
		change func(t *testing.T, app core.App, re *core.Record) error
	}{
		{"deleting the only one", func(t *testing.T, app core.App, re *core.Record) error {
			return app.Delete(reload(t, app, "books_accounts", re.Id))
		}},
		{"making the only one inactive", func(t *testing.T, app core.App, re *core.Record) error {
			return setFields(t, app, "books_accounts", re.Id, map[string]any{"inactive": true})
		}},
		{"changing the only one's detail type", func(t *testing.T, app core.App, re *core.Record) error {
			return setFields(t, app, "books_accounts", re.Id, map[string]any{"detail_type": "owners_equity"})
		}},
		{"changing the only one's type", func(t *testing.T, app core.App, re *core.Record) error {
			return setFields(t, app, "books_accounts", re.Id, map[string]any{"type": "long_term_liability", "detail_type": "notes_payable"})
		}},
	}
	for _, tc := range refusals {
		t.Run(tc.name+" is refused", func(t *testing.T) {
			app := newGuardedApp(t)
			re := mkRetainedEarnings(t, app, "3900")
			requireMessageOnlyRefusal(t, tc.change(t, app, re), msgNeedsRetainedEarnings)
			stored := reload(t, app, "books_accounts", re.Id)
			if stored.GetString("type") != "equity" || stored.GetString("detail_type") != "retained_earnings" || stored.GetBool("inactive") {
				t.Errorf("after the refusal: type %q, detail %q, inactive %v; want equity, retained_earnings, false",
					stored.GetString("type"), stored.GetString("detail_type"), stored.GetBool("inactive"))
			}
		})
	}

	t.Run("renaming it and changing its number pass", func(t *testing.T) {
		app := newGuardedApp(t)
		re := mkRetainedEarnings(t, app, "3900")
		if err := setFields(t, app, "books_accounts", re.Id, map[string]any{"name": "Accumulated earnings"}); err != nil {
			t.Fatalf("rename the retained-earnings account: %v", err)
		}
		if err := setFields(t, app, "books_accounts", re.Id, map[string]any{"number": "3950"}); err != nil {
			t.Fatalf("renumber the retained-earnings account: %v", err)
		}
		stored := reload(t, app, "books_accounts", re.Id)
		if stored.GetString("name") != "Accumulated earnings" || stored.GetString("number") != "3950" {
			t.Errorf("stored = %q %q, want 3950 Accumulated earnings", stored.GetString("number"), stored.GetString("name"))
		}
	})
}

// PocketBase refuses to delete an account a required relation names with a
// generic message; the guard says what to do instead. An inactive agency still
// names its account, so it blocks the delete and the type change, but not
// making the account inactive.
func TestAccount_TaxAgencyRefusals(t *testing.T) {
	app := newGuardedApp(t)
	state := mkLiabilityAccount(t, app, "Sales tax payable")
	city := mkLiabilityAccount(t, app, "City sales tax payable")
	county := mkLiabilityAccount(t, app, "Old county payable")
	mkTaxAgency(t, app, "Colorado DOR", state)
	mkTaxAgency(t, app, "City and County of Denver", city)
	mkTaxAgency(t, app, "Denver airport district", city)
	old := mkTaxAgency(t, app, "Old county agency", county)
	if err := setTaxAgency(t, app, old.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Old county agency inactive: %v", err)
	}

	const oneAgency = "This account is the liability account of 1 tax agency and cannot be deleted. Choose another account for the agency first."
	requireMessageOnlyRefusal(t, app.Delete(reload(t, app, "books_accounts", state.Id)), oneAgency)
	requireMessageOnlyRefusal(t, app.Delete(reload(t, app, "books_accounts", city.Id)),
		"This account is the liability account of 2 tax agencies and cannot be deleted. Choose another account for them first.")
	requireMessageOnlyRefusal(t, app.Delete(reload(t, app, "books_accounts", county.Id)), oneAgency)
	for _, account := range []*core.Record{state, city, county} {
		if _, err := app.FindRecordById("books_accounts", account.Id); err != nil {
			t.Errorf("%s is gone after a refused delete: %v", account.GetString("name"), err)
		}
	}

	requireMessageOnlyRefusal(t, setFields(t, app, "books_accounts", state.Id, map[string]any{"inactive": true}),
		"This account is the liability account of an active tax agency. Choose another account for the agency or make the agency inactive first.")
	if reload(t, app, "books_accounts", state.Id).GetBool("inactive") {
		t.Error("Sales tax payable is inactive after the refusal")
	}
	makeAccountInactive(t, app, county)

	const keepsType = "This account is the liability account of a tax agency, so it stays an Other current liability account."
	for _, account := range []*core.Record{state, county} {
		err := setFields(t, app, "books_accounts", account.Id, map[string]any{"type": "expense", "detail_type": "rent_lease"})
		requireMessageOnlyRefusal(t, err, keepsType)
		if got := reload(t, app, "books_accounts", account.Id).GetString("type"); got != "other_current_liability" {
			t.Errorf("%s type = %q after the refusal, want other_current_liability", account.GetString("name"), got)
		}
	}
	// A detail type change keeps the type, so it is not refused.
	if err := setFields(t, app, "books_accounts", state.Id, map[string]any{"detail_type": "accrued_liabilities"}); err != nil {
		t.Errorf("changing only the detail type of an agency's account was refused: %v", err)
	}
}

// mkReceiptRow saves a sales receipt with saveRecord on an app whose sales
// receipt guards may not be bound (the delete-guard tests of accounts,
// customers, products and tax rates), with the fields given over a valid draft
// deposited to depositTo.
func mkReceiptRow(t testing.TB, app core.App, depositTo *core.Record, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{
		"status": "draft", "date": "2026-11-04", "deposit_to": depositTo.Id, "currency": "USD",
	}
	for k, v := range fields {
		all[k] = v
	}
	return saveRecord(t, app, "books_sales_receipts", all)
}

const wantSetDepositAccount = "This account is where sales are deposited (Settings → Sales). Choose another account or Ask there first."

// Spec §3.10: while "Sales deposited to" names an account, that account stays
// a usable deposit account: it cannot be made inactive, deleted, or moved off
// bank / Undeposited funds. A rename is not a deposit change, so it saves.
func TestAccount_SetDepositAccountRefusals(t *testing.T) {
	app := newGuardedApp(t)
	undeposited := mkNumberedAccount(t, app, "Undeposited funds", "1200", "other_current_asset", "undeposited_funds")
	setSalesDepositAccount(t, app, undeposited.Id)

	refused := []struct {
		name   string
		fields map[string]any
	}{
		{"made inactive", map[string]any{"inactive": true}},
		{"detail type prepaid_expenses", map[string]any{"detail_type": "prepaid_expenses"}},
		{"type other_asset", map[string]any{"type": "other_asset", "detail_type": "other_long_term_asset"}},
	}
	for _, tc := range refused {
		t.Run(tc.name, func(t *testing.T) {
			err := setFields(t, app, "books_accounts", undeposited.Id, tc.fields)
			requireMessageOnlyRefusal(t, err, wantSetDepositAccount)
			stored := reload(t, app, "books_accounts", undeposited.Id)
			if stored.GetBool("inactive") || stored.GetString("type") != "other_current_asset" ||
				stored.GetString("detail_type") != "undeposited_funds" {
				t.Errorf("1200 after the refusal: inactive %v type %q detail %q, want it unchanged",
					stored.GetBool("inactive"), stored.GetString("type"), stored.GetString("detail_type"))
			}
		})
	}

	t.Run("deleted", func(t *testing.T) {
		requireMessageOnlyRefusal(t, app.Delete(reload(t, app, "books_accounts", undeposited.Id)), wantSetDepositAccount)
		reload(t, app, "books_accounts", undeposited.Id)
		requireSalesDepositSettingIs(t, app, undeposited.Id)
	})

	// The normal case: the set account already has postings, and the set
	// account refusal must still be the one the user sees, not the journal
	// lines one that says to make it inactive (which is refused too).
	t.Run("deleted with journal lines", func(t *testing.T) {
		re := newReceiptEnv(t)
		setSalesDepositAccount(t, re.app, re.undeposited.Id)
		r := re.harborviewSale(t, nil)
		mustPostReceipt(t, re.app, r.Id, re.users.bookkeeper.Id)
		if n, err := re.app.CountRecords("books_journal_lines", dbx.HashExp{"account": re.undeposited.Id}); err != nil || n == 0 {
			t.Fatalf("%d journal lines on 1200 after the post (err %v), want at least 1", n, err)
		}
		requireMessageOnlyRefusal(t, re.app.Delete(reload(t, re.app, "books_accounts", re.undeposited.Id)), wantSetDepositAccount)
		reload(t, re.app, "books_accounts", re.undeposited.Id)
		requireSalesDepositSettingIs(t, re.app, re.undeposited.Id)
	})

	t.Run("renamed", func(t *testing.T) {
		if err := setFields(t, app, "books_accounts", undeposited.Id, map[string]any{"name": "Cash on hand to deposit"}); err != nil {
			t.Fatalf("renaming the set deposit account was refused: %v", err)
		}
		if got := reload(t, app, "books_accounts", undeposited.Id).GetString("name"); got != "Cash on hand to deposit" {
			t.Errorf("name = %q, want the new name", got)
		}
	})
}

func requireSalesDepositSettingIs(t testing.TB, app core.App, want string) {
	t.Helper()
	if got := reload(t, app, "books_settings", settingsID).GetString("sales_deposit_account"); got != want {
		t.Errorf("sales_deposit_account = %q, want %q", got, want)
	}
}

// Spec §3.10: with Ask, an account that is the Deposit to of any sales
// receipt, draft or posted, cannot be deleted; making it inactive is allowed
// (Post then refuses it), and making an account active needs no receipt check.
func TestAccount_DeleteRefusedWhileReceiptsDepositToIt(t *testing.T) {
	app := newGuardedApp(t)
	savings := mkNumberedAccount(t, app, "Business Savings", "1010", "bank", "savings")

	mkReceiptRow(t, app, savings, nil)
	requireMessageOnlyRefusal(t, app.Delete(reload(t, app, "books_accounts", savings.Id)),
		"This account is the deposit account of 1 sales receipt and cannot be deleted. Make it inactive instead.")
	reload(t, app, "books_accounts", savings.Id)

	mkReceiptRow(t, app, savings, map[string]any{"status": "posted", "number": "1001"})
	requireMessageOnlyRefusal(t, app.Delete(reload(t, app, "books_accounts", savings.Id)),
		"This account is the deposit account of 2 sales receipts and cannot be deleted. Make it inactive instead.")
	reload(t, app, "books_accounts", savings.Id)

	makeAccountInactive(t, app, savings)
	if !reload(t, app, "books_accounts", savings.Id).GetBool("inactive") {
		t.Fatal("Business Savings is not inactive")
	}
	if err := setFields(t, app, "books_accounts", savings.Id, map[string]any{"inactive": false}); err != nil {
		t.Fatalf("making an inactive deposit account active was refused: %v", err)
	}
	if reload(t, app, "books_accounts", savings.Id).GetBool("inactive") {
		t.Error("Business Savings is still inactive")
	}
}
