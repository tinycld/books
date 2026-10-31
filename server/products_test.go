package books

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"

	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// newProduct saves a product through the app, so the guards bound on it run,
// and returns what they said.
func newProduct(app core.App, fields map[string]any) (*core.Record, error) {
	return saveNew(app, "books_products", fields)
}

// newBundleItem saves a bundle row through the app, so the guards bound on it
// run, and returns what they said.
func newBundleItem(app core.App, fields map[string]any) (*core.Record, error) {
	return saveNew(app, "books_bundle_items", fields)
}

func mkIncomeAccount(t testing.TB, app core.App) *core.Record {
	t.Helper()
	return mkAccount(t, app, "Service Sales", "income", "service_income")
}

func mkService(t testing.TB, app core.App, name string, income *core.Record) *core.Record {
	t.Helper()
	r, err := newProduct(app, map[string]any{"type": "service", "name": name, "income_account": income.Id})
	if err != nil {
		t.Fatalf("save service %q: %v", name, err)
	}
	return r
}

func mkBundle(t testing.TB, app core.App, name string) *core.Record {
	t.Helper()
	r, err := newProduct(app, map[string]any{"type": "bundle", "name": name})
	if err != nil {
		t.Fatalf("save bundle %q: %v", name, err)
	}
	return r
}

func mkBundleItem(t testing.TB, app core.App, bundle, product *core.Record, position int) *core.Record {
	t.Helper()
	r, err := newBundleItem(app, map[string]any{
		"bundle": bundle.Id, "product": product.Id, "quantity": 1, "position": position,
	})
	if err != nil {
		t.Fatalf("save a row of %s for %s: %v", bundle.GetString("name"), product.GetString("name"), err)
	}
	return r
}

func makeProductInactive(t testing.TB, app core.App, product *core.Record) {
	t.Helper()
	if err := setFields(t, app, "books_products", product.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make %s inactive: %v", product.GetString("name"), err)
	}
}

func requireProductCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, _ := app.CountRecords("books_products"); n != want {
		t.Errorf("%d products, want %d", n, want)
	}
}

func requireBundleItemCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, _ := app.CountRecords("books_bundle_items"); n != want {
		t.Errorf("%d bundle items, want %d", n, want)
	}
}

func TestProduct_MessagesAreTheDecisionsTexts(t *testing.T) {
	cases := []struct{ name, got, want string }{
		{"msgProductDuplicateName", fmt.Sprintf(msgProductDuplicateName, "Acme"), "A product or service named “Acme” already exists."},
		{"msgBundleTypeFixed", msgBundleTypeFixed, "A bundle cannot change type."},
		{"msgBundleOnlyNew", msgBundleOnlyNew, "Only a new product can be a bundle."},
		{"msgIncomeAccountRequired", msgIncomeAccountRequired, "Choose an income account."},
		{"msgIncomeAccountMissing", msgIncomeAccountMissing, "The income account does not exist."},
		{"msgIncomeAccountInactive", msgIncomeAccountInactive, "The income account is inactive."},
		{"msgIncomeAccountType", msgIncomeAccountType, "The income account must be an Income or Other income account."},
		{"msgExpenseAccountRequired", msgExpenseAccountRequired, "Choose an expense account."},
		{"msgProductExpenseAccountLedger", msgProductExpenseAccountLedger, "A product's expense account cannot be Accounts receivable or Accounts payable."},
		{"msgBundleHasNoOwn", msgBundleHasNoOwn, "A bundle has no price, cost or accounts of its own."},
		{"msgItemNeedsBundle", msgItemNeedsBundle, "Items belong to a bundle."},
		{"msgItemStaysInBundle", msgItemStaysInBundle, "An item stays in its bundle."},
		{"msgItemProductMissing", msgItemProductMissing, "The product or service does not exist."},
		{"msgItemIsBundle", msgItemIsBundle, "A bundle cannot contain another bundle."},
		{"msgItemInactive", fmt.Sprintf(msgItemInactive, "Cable ties"), "“Cable ties” is inactive."},
		{"msgItemQuantity", msgItemQuantity, "Enter a quantity above 0 with at most 2 decimals."},
		{"msgBundleItemLimit", msgBundleItemLimit, "A bundle holds at most 50 items."},
		{"msgProductOnOneBundle", msgProductOnOneBundle, "This item is in 1 bundle. Take it out of it first, or make it inactive."},
		{"msgProductOnBundles", fmt.Sprintf(msgProductOnBundles, 2), "This item is in 2 bundles. Take it out of them first, or make it inactive."},
		{"productOnBundlesMessage(1)", productOnBundlesMessage(1), "This item is in 1 bundle. Take it out of it first, or make it inactive."},
		{"productOnBundlesMessage(2)", productOnBundlesMessage(2), "This item is in 2 bundles. Take it out of them first, or make it inactive."},
		{"msgAccountUsedByOneProduct", msgAccountUsedByOneProduct, "This account is used by 1 product or service and cannot be deleted. Make it inactive instead."},
		{"msgAccountUsedByProducts", fmt.Sprintf(msgAccountUsedByProducts, 3), "This account is used by 3 products and services and cannot be deleted. Make it inactive instead."},
	}
	for _, c := range cases {
		if c.got != c.want {
			t.Errorf("%s = %q, want %q", c.name, c.got, c.want)
		}
	}
	if maxBundleItems != 50 {
		t.Errorf("maxBundleItems = %d, want 50", maxBundleItems)
	}
}

func TestProduct_TypeLabels(t *testing.T) {
	want := map[string]string{"service": "Service", "non_inventory": "Non-inventory", "bundle": "Bundle", "inventory": ""}
	for key, label := range want {
		if got := productTypeLabel(key); got != label {
			t.Errorf("productTypeLabel(%q) = %q, want %q", key, got, label)
		}
	}
}

func TestProduct_ServiceIsStoredTrimmedWithTheBooksCurrency(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	r := mkService(t, app, "  Wireless AP  ", income)
	stored := reload(t, app, "books_products", r.Id)
	if got := stored.GetString("name"); got != "Wireless AP" {
		t.Errorf("name = %q, want %q", got, "Wireless AP")
	}
	if got := stored.GetString("currency"); got != "USD" {
		t.Errorf("currency = %q, want %q", got, "USD")
	}
}

func TestProduct_DuplicateNameIsRefused(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	mkService(t, app, "Wireless AP", income)
	_, err := newProduct(app, map[string]any{"type": "non_inventory", "name": "wireless AP", "income_account": income.Id})
	requireFieldRefusal(t, err, "name", "A product or service named “wireless AP” already exists.")
	requireProductCount(t, app, 1)
}

// A product does not collide with itself.
func TestProduct_RenameThatChangesOnlyTheCaseIsAccepted(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	p := mkService(t, app, "Wireless AP", income)
	if err := setFields(t, app, "books_products", p.Id, map[string]any{"name": "WIRELESS AP"}); err != nil {
		t.Fatalf("renaming Wireless AP to WIRELESS AP was refused: %v", err)
	}
	if got := reload(t, app, "books_products", p.Id).GetString("name"); got != "WIRELESS AP" {
		t.Errorf("name = %q, want %q", got, "WIRELESS AP")
	}
}

// name_key belongs to the guard: whatever a write sends for it, the stored
// key is the folded name.
func TestProduct_GuardOverwritesNameKey(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	r, err := newProduct(app, map[string]any{
		"type": "service", "name": "Harborview", "income_account": income.Id, "name_key": "bogus",
	})
	if err != nil {
		t.Fatalf("save a product that sent a name_key: %v", err)
	}
	if got := reload(t, app, "books_products", r.Id).GetString("name_key"); got != "harborview" {
		t.Errorf("name_key after create = %q, want %q", got, "harborview")
	}
	if err := setFields(t, app, "books_products", r.Id, map[string]any{"name": "Harborview", "name_key": "bogus"}); err != nil {
		t.Fatalf("update a product that sent a name_key: %v", err)
	}
	if got := reload(t, app, "books_products", r.Id).GetString("name_key"); got != "harborview" {
		t.Errorf("name_key after update = %q, want %q", got, "harborview")
	}
}

// The unique index on name_key is the backstop for the guard: a duplicate
// key saved with no hook and no validation still cannot land.
func TestProductSchema_NameKeyIsUniqueWithoutTheGuard(t *testing.T) {
	app := newBooksApp(t)
	first := map[string]any{"type": "service", "name": "Harborview", "currency": "USD", "name_key": "harborview"}
	if err := rawSave(t, app, "books_products", first); err != nil {
		t.Fatalf("save the first product: %v", err)
	}
	second := map[string]any{"type": "service", "name": "Harbor View", "currency": "USD", "name_key": "harborview"}
	err := rawSave(t, app, "books_products", second)
	if err == nil {
		t.Fatal("a second product with name_key harborview was stored")
	}
	var errs validation.Errors
	if !errors.As(err, &errs) {
		t.Fatalf("the duplicate key was refused by %v (%T), not by a unique index", err, err)
	}
	keyErr, ok := errs["name_key"].(validation.Error)
	if !ok || keyErr.Code() != "validation_not_unique" {
		t.Fatalf("the duplicate key was refused by %v, not by a unique index on name_key", err)
	}
}

func TestProduct_SKUMayRepeat(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	for _, name := range []string{"Patch cable", "Patch cord"} {
		if _, err := newProduct(app, map[string]any{
			"type": "non_inventory", "name": name, "sku": "HW-CAT6", "income_account": income.Id,
		}); err != nil {
			t.Fatalf("%s with SKU HW-CAT6 was refused: %v", name, err)
		}
	}
	requireProductCount(t, app, 2)
}

func TestProduct_IncomeAccountIsRequired(t *testing.T) {
	for _, kind := range []string{"service", "non_inventory"} {
		t.Run(kind, func(t *testing.T) {
			app := newGuardedApp(t)
			_, err := newProduct(app, map[string]any{"type": kind, "name": "Wireless AP"})
			requireFieldRefusal(t, err, "income_account", "Choose an income account.")
			requireProductCount(t, app, 0)
		})
	}
}

func TestProduct_IncomeAccountRules(t *testing.T) {
	cases := map[string]struct {
		account func(t testing.TB, app core.App) string
		want    string
	}{
		"a missing account": {
			account: func(testing.TB, core.App) string { return "noaccount000001" },
			want:    "The income account does not exist.",
		},
		"an inactive account": {
			account: func(t testing.TB, app core.App) string {
				income := mkIncomeAccount(t, app)
				makeAccountInactive(t, app, income)
				return income.Id
			},
			want: "The income account is inactive.",
		},
		"an expense account": {
			account: func(t testing.TB, app core.App) string {
				return mkAccount(t, app, "Rent", "expense", "rent_lease").Id
			},
			want: "The income account must be an Income or Other income account.",
		},
	}
	for name, tc := range cases {
		for _, kind := range []string{"service", "non_inventory"} {
			t.Run(name+"/"+kind, func(t *testing.T) {
				app := newGuardedApp(t)
				_, err := newProduct(app, map[string]any{"type": kind, "name": "Wireless AP", "income_account": tc.account(t, app)})
				requireFieldRefusal(t, err, "income_account", tc.want)
				requireProductCount(t, app, 0)
			})
		}
	}
}

func TestProduct_OtherIncomeAccountIsAccepted(t *testing.T) {
	app := newGuardedApp(t)
	interest := mkAccount(t, app, "Interest Earned", "other_income", "interest_earned")
	r, err := newProduct(app, map[string]any{"type": "service", "name": "Late fee", "income_account": interest.Id})
	if err != nil {
		t.Fatalf("an Other income account was refused: %v", err)
	}
	if got := reload(t, app, "books_products", r.Id).GetString("income_account"); got != interest.Id {
		t.Errorf("income_account = %q, want %q", got, interest.Id)
	}
}

// The account rules run only when the field changes: a product keeps an
// income account that became inactive after it was saved.
func TestProduct_IncomeAccountThatBecameInactiveIsKeptOnAnotherChange(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	p := mkService(t, app, "Payroll setup", income)
	makeAccountInactive(t, app, income)
	if err := setFields(t, app, "books_products", p.Id, map[string]any{"sku": "SVC-PAY"}); err != nil {
		t.Fatalf("a SKU change on a product whose income account became inactive was refused: %v", err)
	}
	stored := reload(t, app, "books_products", p.Id)
	if stored.GetString("sku") != "SVC-PAY" || stored.GetString("income_account") != income.Id {
		t.Fatalf("stored product = %v", stored.PublicExport())
	}
}

func TestProduct_PurchasingNeedsAnExpenseAccount(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	_, err := newProduct(app, map[string]any{
		"type": "non_inventory", "name": "Wireless AP", "income_account": income.Id, "purchases": true,
	})
	requireFieldRefusal(t, err, "expense_account", "Choose an expense account.")
	requireProductCount(t, app, 0)
}

func TestProduct_PayableExpenseAccountIsRefused(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	payable := mkAccount(t, app, "Accounts payable", "accounts_payable", "accounts_payable")
	_, err := newProduct(app, map[string]any{
		"type": "non_inventory", "name": "Wireless AP", "income_account": income.Id,
		"purchases": true, "expense_account": payable.Id,
	})
	requireFieldRefusal(t, err, "expense_account",
		"A product's expense account cannot be Accounts receivable or Accounts payable.")
	requireProductCount(t, app, 0)
}

func TestProduct_InactiveExpenseAccountIsRefusedWhilePurchasing(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	closed := mkAccount(t, app, "Old Petty Cash", "other_expense", "other_misc_expense")
	makeAccountInactive(t, app, closed)
	_, err := newProduct(app, map[string]any{
		"type": "non_inventory", "name": "Wireless AP", "income_account": income.Id,
		"purchases": true, "expense_account": closed.Id,
	})
	requireFieldRefusal(t, err, "expense_account", "The expense account is inactive.")
	requireProductCount(t, app, 0)
}

// While purchasing is off the purchase fields are kept and not checked.
func TestProduct_PurchasingOffKeepsTheExpenseAccountAndCostUnchecked(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	closed := mkAccount(t, app, "Old Petty Cash", "other_expense", "other_misc_expense")
	makeAccountInactive(t, app, closed)
	r, err := newProduct(app, map[string]any{
		"type": "non_inventory", "name": "Printer paper, case", "income_account": income.Id,
		"purchases": false, "expense_account": closed.Id, "cost": 3100,
	})
	if err != nil {
		t.Fatalf("an inactive expense account with purchasing off was refused: %v", err)
	}
	stored := reload(t, app, "books_products", r.Id)
	if stored.GetString("expense_account") != closed.Id || stored.GetInt("cost") != 3100 {
		t.Fatalf("stored product = %v, want the expense account and cost kept", stored.PublicExport())
	}
}

// The expense account is checked when purchasing turns on, even when the
// account itself does not change: it was saved unchecked while purchasing was off.
func TestProduct_TurningPurchasingOnChecksTheStoredExpenseAccount(t *testing.T) {
	cases := map[string]struct {
		account func(t testing.TB, app core.App) *core.Record
		message string
	}{
		"accounts payable": {
			account: func(t testing.TB, app core.App) *core.Record {
				return mkAccount(t, app, "Accounts payable", "accounts_payable", "accounts_payable")
			},
			message: "A product's expense account cannot be Accounts receivable or Accounts payable.",
		},
		"inactive": {
			account: func(t testing.TB, app core.App) *core.Record {
				closed := mkAccount(t, app, "Old Petty Cash", "other_expense", "other_misc_expense")
				makeAccountInactive(t, app, closed)
				return closed
			},
			message: "The expense account is inactive.",
		},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			app := newGuardedApp(t)
			income := mkIncomeAccount(t, app)
			expense := c.account(t, app)
			r, err := newProduct(app, map[string]any{
				"type": "non_inventory", "name": "Wireless AP", "income_account": income.Id,
				"purchases": false, "expense_account": expense.Id,
			})
			if err != nil {
				t.Fatalf("the expense account with purchasing off was refused: %v", err)
			}
			err = setFields(t, app, "books_products", r.Id, map[string]any{"purchases": true})
			requireFieldRefusal(t, err, "expense_account", c.message)
			if reload(t, app, "books_products", r.Id).GetBool("purchases") {
				t.Errorf("purchases is on after the refusal, want it kept off")
			}
		})
	}
}

func TestProduct_BundleHasNoPriceCostOrAccounts(t *testing.T) {
	cases := map[string]func(t testing.TB, app core.App) map[string]any{
		"a price": func(testing.TB, core.App) map[string]any { return map[string]any{"price": 100} },
		"a cost":  func(testing.TB, core.App) map[string]any { return map[string]any{"cost": 1} },
		"an income account": func(t testing.TB, app core.App) map[string]any {
			return map[string]any{"income_account": mkIncomeAccount(t, app).Id}
		},
		"an expense account": func(t testing.TB, app core.App) map[string]any {
			return map[string]any{"expense_account": mkAccount(t, app, "Rent", "expense", "rent_lease").Id}
		},
		"a purchase description": func(testing.TB, core.App) map[string]any {
			return map[string]any{"purchase_description": "Bought as a kit."}
		},
		"purchasing on": func(testing.TB, core.App) map[string]any { return map[string]any{"purchases": true} },
	}
	for name, own := range cases {
		t.Run(name, func(t *testing.T) {
			app := newGuardedApp(t)
			fields := own(t, app)
			fields["type"] = "bundle"
			fields["name"] = "Home office setup kit"
			_, err := newProduct(app, fields)
			requireMessageOnlyRefusal(t, err, "A bundle has no price, cost or accounts of its own.")
			requireProductCount(t, app, 0)
		})
	}
}

func TestProduct_BundleCannotChangeType(t *testing.T) {
	app := newGuardedApp(t)
	kit := mkBundle(t, app, "Home office setup kit")
	err := setFields(t, app, "books_products", kit.Id, map[string]any{"type": "service"})
	requireFieldRefusal(t, err, "type", "A bundle cannot change type.")
	if got := reload(t, app, "books_products", kit.Id).GetString("type"); got != "bundle" {
		t.Errorf("type = %q after the refusal, want bundle", got)
	}
}

func TestProduct_OnlyANewProductCanBeABundle(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	p := mkService(t, app, "Payroll setup", income)
	err := setFields(t, app, "books_products", p.Id, map[string]any{"type": "bundle"})
	requireFieldRefusal(t, err, "type", "Only a new product can be a bundle.")
	if got := reload(t, app, "books_products", p.Id).GetString("type"); got != "service" {
		t.Errorf("type = %q after the refusal, want service", got)
	}
}

func TestProduct_ServiceBecomesNonInventoryKeepingEveryValue(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	rent := mkAccount(t, app, "Rent", "expense", "rent_lease")
	p, err := newProduct(app, map[string]any{
		"type": "service", "name": "Workstation setup", "sku": "SVC-WS", "sales_description": "Set up one workstation.",
		"price": 15000, "income_account": income.Id, "purchases": true, "purchase_description": "Imaging license.",
		"cost": 2500, "expense_account": rent.Id,
	})
	if err != nil {
		t.Fatalf("save the service: %v", err)
	}
	if err := setFields(t, app, "books_products", p.Id, map[string]any{"type": "non_inventory"}); err != nil {
		t.Fatalf("Service to Non-inventory was refused: %v", err)
	}
	stored := reload(t, app, "books_products", p.Id)
	want := map[string]any{
		"type": "non_inventory", "name": "Workstation setup", "sku": "SVC-WS", "sales_description": "Set up one workstation.",
		"price": 15000, "income_account": income.Id, "purchases": true, "purchase_description": "Imaging license.",
		"cost": 2500, "expense_account": rent.Id, "currency": "USD",
	}
	for field, value := range want {
		if got := fmt.Sprint(stored.Get(field)); got != fmt.Sprint(value) {
			t.Errorf("%s = %s, want %v", field, got, value)
		}
	}
}

// The guard has no price rule for a Service: PocketBase's own field rules
// (min 0, whole cents) refuse these.
func TestProduct_NegativePriceAndFractionalCostAreSchemaRefusals(t *testing.T) {
	cases := map[string]map[string]any{
		"price": {"price": -1},
		"cost":  {"cost": 1.5},
	}
	for field, value := range cases {
		t.Run(field, func(t *testing.T) {
			app := newGuardedApp(t)
			fields := map[string]any{"type": "service", "name": "Payroll setup", "income_account": mkIncomeAccount(t, app).Id}
			for k, v := range value {
				fields[k] = v
			}
			_, err := newProduct(app, fields)
			requireSchemaRefusal(t, err, field)
			requireProductCount(t, app, 0)
		})
	}
}

func TestProduct_LengthsAreRefusedOnTheirField(t *testing.T) {
	cases := map[string]map[string]any{
		"name": {"name": strings.Repeat("x", 201)},
		"sku":  {"name": "Payroll setup", "sku": strings.Repeat("1", 101)},
	}
	for field, value := range cases {
		t.Run(field, func(t *testing.T) {
			app := newGuardedApp(t)
			fields := map[string]any{"type": "service", "income_account": mkIncomeAccount(t, app).Id}
			for k, v := range value {
				fields[k] = v
			}
			_, err := newProduct(app, fields)
			requireSchemaRefusal(t, err, field)
			requireProductCount(t, app, 0)
		})
	}
}

func TestBundleItem_BundleMustBeABundle(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	visit := mkService(t, app, "Network visit", income)
	cable := mkService(t, app, "Patch cable", income)
	_, err := newBundleItem(app, map[string]any{"bundle": visit.Id, "product": cable.Id, "quantity": 1, "position": 0})
	requireFieldRefusal(t, err, "bundle", "Items belong to a bundle.")
	requireBundleItemCount(t, app, 0)
}

func TestBundleItem_StaysInItsBundle(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	cable := mkService(t, app, "Patch cable", income)
	home := mkBundle(t, app, "Home office setup kit")
	office := mkBundle(t, app, "Small office network")
	row := mkBundleItem(t, app, home, cable, 0)
	err := setFields(t, app, "books_bundle_items", row.Id, map[string]any{"bundle": office.Id})
	requireFieldRefusal(t, err, "bundle", "An item stays in its bundle.")
	if got := reload(t, app, "books_bundle_items", row.Id).GetString("bundle"); got != home.Id {
		t.Errorf("bundle = %q after the refusal, want %q", got, home.Id)
	}
}

func TestBundleItem_ProductCannotBeABundle(t *testing.T) {
	app := newGuardedApp(t)
	home := mkBundle(t, app, "Home office setup kit")
	office := mkBundle(t, app, "Small office network")
	_, err := newBundleItem(app, map[string]any{"bundle": home.Id, "product": office.Id, "quantity": 1, "position": 0})
	requireFieldRefusal(t, err, "product", "A bundle cannot contain another bundle.")
	requireBundleItemCount(t, app, 0)
}

func TestBundleItem_MissingProductIsRefused(t *testing.T) {
	app := newGuardedApp(t)
	home := mkBundle(t, app, "Home office setup kit")
	_, err := newBundleItem(app, map[string]any{"bundle": home.Id, "product": "noproduct000001", "quantity": 1, "position": 0})
	requireFieldRefusal(t, err, "product", "The product or service does not exist.")
	requireBundleItemCount(t, app, 0)
}

func TestBundleItem_InactiveProductIsRefusedOnCreateAndOnAProductChange(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	ties := mkService(t, app, "Cable ties", income)
	cable := mkService(t, app, "Patch cable", income)
	home := mkBundle(t, app, "Home office setup kit")
	makeProductInactive(t, app, ties)

	_, err := newBundleItem(app, map[string]any{"bundle": home.Id, "product": ties.Id, "quantity": 1, "position": 0})
	requireFieldRefusal(t, err, "product", "“Cable ties” is inactive.")
	requireBundleItemCount(t, app, 0)

	row := mkBundleItem(t, app, home, cable, 0)
	err = setFields(t, app, "books_bundle_items", row.Id, map[string]any{"product": ties.Id})
	requireFieldRefusal(t, err, "product", "“Cable ties” is inactive.")
	if got := reload(t, app, "books_bundle_items", row.Id).GetString("product"); got != cable.Id {
		t.Errorf("product = %q after the refusal, want %q", got, cable.Id)
	}
}

// A bundle keeps a row whose product became inactive after it was added.
func TestBundleItem_ProductThatBecameInactiveIsKeptOnAQuantityChange(t *testing.T) {
	app := newGuardedApp(t)
	income := mkIncomeAccount(t, app)
	ties := mkService(t, app, "Cable ties", income)
	home := mkBundle(t, app, "Home office setup kit")
	row := mkBundleItem(t, app, home, ties, 0)
	makeProductInactive(t, app, ties)
	if err := setFields(t, app, "books_bundle_items", row.Id, map[string]any{"quantity": 3}); err != nil {
		t.Fatalf("a quantity change on a row whose product became inactive was refused: %v", err)
	}
	stored := reload(t, app, "books_bundle_items", row.Id)
	if stored.GetFloat("quantity") != 3 || stored.GetString("product") != ties.Id {
		t.Fatalf("stored row = %v", stored.PublicExport())
	}
}

func TestBundleItem_QuantityRules(t *testing.T) {
	for _, q := range []float64{0, 1000000.01, 1.234} {
		t.Run(fmt.Sprintf("refuses %v", q), func(t *testing.T) {
			app := newGuardedApp(t)
			cable := mkService(t, app, "Patch cable", mkIncomeAccount(t, app))
			home := mkBundle(t, app, "Home office setup kit")
			_, err := newBundleItem(app, map[string]any{"bundle": home.Id, "product": cable.Id, "quantity": q, "position": 0})
			requireFieldRefusal(t, err, "quantity", "Enter a quantity above 0 with at most 2 decimals.")
			requireBundleItemCount(t, app, 0)
		})
	}
	// Above 131072 the float64 error of q*100 is larger than 1e-9, so these
	// two-decimal quantities prove the guard does not use that tolerance.
	for _, q := range []float64{0.01, 2.5, 1000000, 131072.02, 150000.10, 999999.99} {
		t.Run(fmt.Sprintf("accepts %v", q), func(t *testing.T) {
			app := newGuardedApp(t)
			cable := mkService(t, app, "Patch cable", mkIncomeAccount(t, app))
			home := mkBundle(t, app, "Home office setup kit")
			r, err := newBundleItem(app, map[string]any{"bundle": home.Id, "product": cable.Id, "quantity": q, "position": 0})
			if err != nil {
				t.Fatalf("quantity %v was refused: %v", q, err)
			}
			if got := reload(t, app, "books_bundle_items", r.Id).GetFloat("quantity"); got != q {
				t.Errorf("quantity = %v, want %v", got, q)
			}
		})
	}
}

func TestBundleItem_ABundleHoldsAtMostFiftyItems(t *testing.T) {
	app := newGuardedApp(t)
	cable := mkService(t, app, "Patch cable", mkIncomeAccount(t, app))
	home := mkBundle(t, app, "Home office setup kit")
	for i := range 50 {
		mkBundleItem(t, app, home, cable, i)
	}
	_, err := newBundleItem(app, map[string]any{"bundle": home.Id, "product": cable.Id, "quantity": 1, "position": 50})
	requireMessageOnlyRefusal(t, err, "A bundle holds at most 50 items.")
	requireBundleItemCount(t, app, 50)
}

func TestBundleItem_OneProductOnTwoRowsOfABundleIsAccepted(t *testing.T) {
	app := newGuardedApp(t)
	cable := mkService(t, app, "Patch cable", mkIncomeAccount(t, app))
	home := mkBundle(t, app, "Home office setup kit")
	mkBundleItem(t, app, home, cable, 0)
	mkBundleItem(t, app, home, cable, 1)
	requireBundleItemCount(t, app, 2)
}

func TestProduct_DeleteRefusedWhileOnOneBundle(t *testing.T) {
	app := newGuardedApp(t)
	cable := mkService(t, app, "Patch cable", mkIncomeAccount(t, app))
	home := mkBundle(t, app, "Home office setup kit")
	mkBundleItem(t, app, home, cable, 0)
	mkBundleItem(t, app, home, cable, 1)
	err := app.Delete(reload(t, app, "books_products", cable.Id))
	requireMessageOnlyRefusal(t, err, "This item is in 1 bundle. Take it out of it first, or make it inactive.")
	requireProductCount(t, app, 2)
	requireBundleItemCount(t, app, 2)
}

func TestProduct_DeleteRefusedWhileOnTwoBundles(t *testing.T) {
	app := newGuardedApp(t)
	cable := mkService(t, app, "Patch cable", mkIncomeAccount(t, app))
	home := mkBundle(t, app, "Home office setup kit")
	office := mkBundle(t, app, "Small office network")
	mkBundleItem(t, app, home, cable, 0)
	mkBundleItem(t, app, home, cable, 1)
	mkBundleItem(t, app, office, cable, 0)
	err := app.Delete(reload(t, app, "books_products", cable.Id))
	requireMessageOnlyRefusal(t, err, "This item is in 2 bundles. Take it out of them first, or make it inactive.")
	requireProductCount(t, app, 3)
	requireBundleItemCount(t, app, 3)
}

func TestProduct_DeletingABundleRemovesItsRowsThenTheProductDeletes(t *testing.T) {
	app := newGuardedApp(t)
	cable := mkService(t, app, "Patch cable", mkIncomeAccount(t, app))
	home := mkBundle(t, app, "Home office setup kit")
	mkBundleItem(t, app, home, cable, 0)
	mkBundleItem(t, app, home, cable, 1)
	if err := app.Delete(reload(t, app, "books_products", home.Id)); err != nil {
		t.Fatalf("delete the bundle: %v", err)
	}
	requireBundleItemCount(t, app, 0)
	if err := app.Delete(reload(t, app, "books_products", cable.Id)); err != nil {
		t.Fatalf("delete the product after its bundle was deleted: %v", err)
	}
	requireProductCount(t, app, 0)
}

func TestProduct_OnNoBundleDeletes(t *testing.T) {
	app := newGuardedApp(t)
	cable := mkService(t, app, "Patch cable", mkIncomeAccount(t, app))
	if err := app.Delete(reload(t, app, "books_products", cable.Id)); err != nil {
		t.Fatalf("delete a product on no bundle: %v", err)
	}
	requireProductCount(t, app, 0)
}

func TestValidateExpenseAccount_MessagePerCaller(t *testing.T) {
	app := newGuardedApp(t)
	receivable := mkAccount(t, app, "Accounts receivable", "accounts_receivable", "accounts_receivable")
	income := mkIncomeAccount(t, app)

	_, err := newVendor(app, map[string]any{"display_name": "Acme", "expense_account": receivable.Id})
	requireFieldRefusal(t, err, "expense_account",
		"A vendor's default expense account cannot be Accounts receivable or Accounts payable.")

	_, err = newProduct(app, map[string]any{
		"type": "non_inventory", "name": "Wireless AP", "income_account": income.Id,
		"purchases": true, "expense_account": receivable.Id,
	})
	requireFieldRefusal(t, err, "expense_account",
		"A product's expense account cannot be Accounts receivable or Accounts payable.")

	// The text is the caller's: validateExpenseAccount holds no message of its own.
	col, err := app.FindCollectionByNameOrId("books_products")
	if err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(col)
	r.Load(map[string]any{"type": "non_inventory", "name": "Router", "expense_account": receivable.Id})
	requireFieldRefusal(t, validateExpenseAccount(app, nil, r, "Pick another account."), "expense_account", "Pick another account.")
}

// levelFixture is the row a by-level case reads, the bodies it sends, and
// how it proves a read-only request changed nothing.
type levelFixture struct {
	rowID         string
	viewContent   string
	createBody    string
	createContent string
	updateBody    string
	unchanged     func(t testing.TB, app core.App)
}

// runLevelCases checks a collection's API rules by Books level, as
// runRulesByLevel does for the parties: a read-only Books member reads its
// rows and writes none; a user with no Books level does not see them. The
// bookkeeper's create is the positive control: the refusals are the rules,
// not a broken request.
func runLevelCases(t *testing.T, collection string, setup func(t testing.TB, app core.App) levelFixture) {
	list := "/api/collections/" + collection + "/records"
	cases := []struct {
		name    string
		level   Level
		method  string
		url     func(id string) string
		body    func(f levelFixture) string
		want    int
		content func(f levelFixture) []string
	}{
		{"read lists", LevelReadOnly, http.MethodGet, func(string) string { return list }, nil, http.StatusOK,
			func(levelFixture) []string { return []string{`"totalItems":1`} }},
		{"read views", LevelReadOnly, http.MethodGet, func(id string) string { return list + "/" + id }, nil, http.StatusOK,
			func(f levelFixture) []string { return []string{f.viewContent} }},
		{"read cannot create", LevelReadOnly, http.MethodPost, func(string) string { return list },
			func(f levelFixture) string { return f.createBody }, http.StatusBadRequest, nil},
		{"read cannot update", LevelReadOnly, http.MethodPatch, func(id string) string { return list + "/" + id },
			func(f levelFixture) string { return f.updateBody }, http.StatusNotFound, nil},
		{"read cannot delete", LevelReadOnly, http.MethodDelete, func(id string) string { return list + "/" + id }, nil, http.StatusNotFound, nil},
		{"none cannot list", LevelNone, http.MethodGet, func(string) string { return list }, nil, http.StatusOK,
			func(levelFixture) []string { return []string{`"totalItems":0`} }},
		{"bookkeeper creates", LevelBookkeeper, http.MethodPost, func(string) string { return list },
			func(f levelFixture) string { return f.createBody }, http.StatusOK,
			func(f levelFixture) []string { return []string{f.createContent} }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newGuardedApp(t)
			users := newLevelUsers(t, app)
			f := setup(t, app)
			req := apiReq{
				method: tc.method,
				url:    tc.url(f.rowID),
				token:  tokenFor(t, users.byLevel(tc.level)),
				want:   tc.want,
				after: func(t testing.TB, app *tests.TestApp) {
					if tc.level == LevelReadOnly {
						f.unchanged(t, app)
					}
				},
			}
			if tc.body != nil {
				req.body = tc.body(f)
			}
			if tc.content != nil {
				req.content = tc.content(f)
			}
			req.run(t, app)
		})
	}
}

func TestProductRules_ByLevel(t *testing.T) {
	runLevelCases(t, "books_products", func(t testing.TB, app core.App) levelFixture {
		income := mkIncomeAccount(t, app)
		harbor := mkService(t, app, "Harborview", income)
		return levelFixture{
			rowID:         harbor.Id,
			viewContent:   `"name":"Harborview"`,
			createBody:    fmt.Sprintf(`{"type":"service","name":"Acme","income_account":%q}`, income.Id),
			createContent: `"name":"Acme"`,
			updateBody:    `{"sku":"x"}`,
			unchanged: func(t testing.TB, app core.App) {
				if got := reload(t, app, "books_products", harbor.Id).GetString("sku"); got != "" {
					t.Errorf("a read-only user changed the product's sku to %q", got)
				}
				requireProductCount(t, app, 1)
			},
		}
	})
}

func TestBundleItemRules_ByLevel(t *testing.T) {
	runLevelCases(t, "books_bundle_items", func(t testing.TB, app core.App) levelFixture {
		harbor := mkService(t, app, "Harborview", mkIncomeAccount(t, app))
		kit := mkBundle(t, app, "Home office setup kit")
		row, err := newBundleItem(app, map[string]any{"bundle": kit.Id, "product": harbor.Id, "quantity": 2, "position": 0})
		if err != nil {
			t.Fatalf("save the bundle row: %v", err)
		}
		return levelFixture{
			rowID:         row.Id,
			viewContent:   fmt.Sprintf(`"product":%q`, harbor.Id),
			createBody:    fmt.Sprintf(`{"bundle":%q,"product":%q,"quantity":3,"position":1}`, kit.Id, harbor.Id),
			createContent: `"quantity":3`,
			updateBody:    `{"quantity":5}`,
			unchanged: func(t testing.TB, app core.App) {
				if got := reload(t, app, "books_bundle_items", row.Id).GetFloat("quantity"); got != 2 {
					t.Errorf("a read-only user changed the row's quantity to %v", got)
				}
				requireBundleItemCount(t, app, 1)
			},
		}
	})
}

// name_key is the guard's own column: a reader sees the name, never the key,
// in a view or a list response.
func TestProductRules_NameKeyIsHidden(t *testing.T) {
	list := "/api/collections/books_products/records"
	for _, path := range []string{"", "/view"} {
		t.Run("read"+path, func(t *testing.T) {
			app := newGuardedApp(t)
			users := newLevelUsers(t, app)
			harbor := mkService(t, app, "Harborview", mkIncomeAccount(t, app))
			if got := reload(t, app, "books_products", harbor.Id).GetString("name_key"); got != "harborview" {
				t.Fatalf("stored name_key = %q, want %q", got, "harborview")
			}
			url := list
			if path == "/view" {
				url = list + "/" + harbor.Id
			}
			scenario := &tests.ApiScenario{
				Name:                  "GET " + url,
				Method:                http.MethodGet,
				URL:                   url,
				Headers:               map[string]string{"Authorization": tokenFor(t, users.readOnly)},
				ExpectedStatus:        http.StatusOK,
				ExpectedContent:       []string{`"name":"Harborview"`},
				NotExpectedContent:    []string{`"name_key"`, `"harborview"`},
				TestAppFactory:        func(testing.TB) *tests.TestApp { return app },
				DisableTestAppCleanup: true,
			}
			scenario.Test(t)
		})
	}
}
