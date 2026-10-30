package books

import (
	"errors"
	"fmt"
	"strings"
	"testing"

	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
)

// newVendor saves a vendor through the app, so the guards bound on it run,
// and returns what they said.
func newVendor(app core.App, fields map[string]any) (*core.Record, error) {
	return saveNew(app, "books_vendors", fields)
}

func mkVendor(t testing.TB, app core.App, name string) *core.Record {
	t.Helper()
	r, err := newVendor(app, map[string]any{"display_name": name})
	if err != nil {
		t.Fatalf("save vendor %q: %v", name, err)
	}
	return r
}

// requireSchemaRefusal asserts that PocketBase's own field validation refused
// the write on field. A schema rule runs after the guard, in app.Save's
// validation, so it comes back as validation errors keyed by field (the REST
// handler turns them into a 400 whose data names the field).
func requireSchemaRefusal(t testing.TB, err error, field string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected a refusal on %q, got none", field)
	}
	var errs validation.Errors
	if !errors.As(err, &errs) {
		t.Fatalf("refusal %v (%T) is not a field validation error", err, err)
	}
	if _, ok := errs[field]; !ok {
		t.Fatalf("refusal %v names no field %q", err, field)
	}
}

func makeAccountInactive(t testing.TB, app core.App, account *core.Record) {
	t.Helper()
	if err := setFields(t, app, "books_accounts", account.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make %s inactive: %v", account.GetString("name"), err)
	}
}

func TestVendor_MessagesAreTheDecisionsTexts(t *testing.T) {
	want := map[string]string{
		fmt.Sprintf(msgVendorDuplicateName, "Acme"): "A vendor named “Acme” already exists.",
		msgExpenseAccountMissing:                    "The expense account does not exist.",
		msgExpenseAccountInactive:                   "The expense account is inactive.",
		msgExpenseAccountLedger:                     "A vendor's default expense account cannot be Accounts receivable or Accounts payable.",
	}
	for got, text := range want {
		if got != text {
			t.Errorf("message = %q, want %q", got, text)
		}
	}
}

func TestVendor_DisplayNameIsStoredTrimmed(t *testing.T) {
	app := newGuardedApp(t)
	r := mkVendor(t, app, "  Acme  ")
	if got := reload(t, app, "books_vendors", r.Id).GetString("display_name"); got != "Acme" {
		t.Fatalf("display_name = %q, want %q", got, "Acme")
	}
}

func TestVendor_DuplicateNameIsRefused(t *testing.T) {
	app := newGuardedApp(t)
	mkVendor(t, app, "  Acme  ")
	_, err := newVendor(app, map[string]any{"display_name": "acme"})
	requireFieldRefusal(t, err, "display_name", "A vendor named “acme” already exists.")
	if n, _ := app.CountRecords("books_vendors"); n != 1 {
		t.Errorf("%d vendors after the refusal, want 1", n)
	}
}

// SQLite's NOCASE folds ASCII letters only; the guard folds every letter.
func TestVendor_DuplicateNameFoldsNonASCIILetters(t *testing.T) {
	app := newGuardedApp(t)
	mkVendor(t, app, "Ärzte")
	_, err := newVendor(app, map[string]any{"display_name": "ärzte"})
	requireFieldRefusal(t, err, "display_name", "A vendor named “ärzte” already exists.")
}

// A vendor does not collide with itself.
func TestVendor_RenameThatChangesOnlyTheCaseIsAccepted(t *testing.T) {
	app := newGuardedApp(t)
	acme := mkVendor(t, app, "Acme")
	if err := setFields(t, app, "books_vendors", acme.Id, map[string]any{"display_name": "ACME"}); err != nil {
		t.Fatalf("renaming Acme to ACME was refused: %v", err)
	}
	if got := reload(t, app, "books_vendors", acme.Id).GetString("display_name"); got != "ACME" {
		t.Errorf("display_name = %q, want %q", got, "ACME")
	}
}

func TestVendor_RenameToAnotherVendorsNameIsRefused(t *testing.T) {
	app := newGuardedApp(t)
	mkVendor(t, app, "Acme")
	harbor := mkVendor(t, app, "Harborview")
	err := setFields(t, app, "books_vendors", harbor.Id, map[string]any{"display_name": "ACME"})
	requireFieldRefusal(t, err, "display_name", "A vendor named “ACME” already exists.")
	if got := reload(t, app, "books_vendors", harbor.Id).GetString("display_name"); got != "Harborview" {
		t.Errorf("display_name = %q after the refusal, want %q", got, "Harborview")
	}
}

// name_key belongs to the guard: whatever a write sends for it, the stored
// key is the folded display name.
func TestVendor_GuardOverwritesNameKey(t *testing.T) {
	app := newGuardedApp(t)
	r, err := newVendor(app, map[string]any{"display_name": "Harborview", "name_key": "bogus"})
	if err != nil {
		t.Fatalf("save a vendor that sent a name_key: %v", err)
	}
	if got := reload(t, app, "books_vendors", r.Id).GetString("name_key"); got != "harborview" {
		t.Errorf("name_key after create = %q, want %q", got, "harborview")
	}
	if err := setFields(t, app, "books_vendors", r.Id, map[string]any{"display_name": "Harborview", "name_key": "bogus"}); err != nil {
		t.Fatalf("update a vendor that sent a name_key: %v", err)
	}
	if got := reload(t, app, "books_vendors", r.Id).GetString("name_key"); got != "harborview" {
		t.Errorf("name_key after update = %q, want %q", got, "harborview")
	}
}

func TestVendor_MayShareANameWithACustomer(t *testing.T) {
	app := newGuardedApp(t)
	mkCustomer(t, app, "Acme", "")
	if _, err := newVendor(app, map[string]any{"display_name": "Acme"}); err != nil {
		t.Fatalf("a vendor named like a customer was refused: %v", err)
	}
	if n, _ := app.CountRecords("books_vendors"); n != 1 {
		t.Errorf("%d vendors stored, want 1", n)
	}
}

// The unique index on name_key is the backstop for the guard: a duplicate
// key saved with no hook and no validation still cannot land.
func TestVendorSchema_NameKeyIsUniqueWithoutTheGuard(t *testing.T) {
	app := newBooksApp(t)
	if err := rawSave(t, app, "books_vendors", map[string]any{"display_name": "Harborview", "name_key": "harborview"}); err != nil {
		t.Fatalf("save the first vendor: %v", err)
	}
	err := rawSave(t, app, "books_vendors", map[string]any{"display_name": "Harbor View", "name_key": "harborview"})
	if err == nil {
		t.Fatal("a second vendor with name_key harborview was stored")
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

func TestVendor_AddressShapeIsChecked(t *testing.T) {
	bad := map[string]func() map[string]any{
		"an unknown key": func() map[string]any {
			a := validAddress()
			a["county"] = "King"
			return a
		},
		"a number value": func() map[string]any {
			a := validAddress()
			a["postal_code"] = 98101
			return a
		},
		"a 201-character city": func() map[string]any {
			a := validAddress()
			a["city"] = strings.Repeat("x", 201)
			return a
		},
	}
	for name, address := range bad {
		t.Run(name, func(t *testing.T) {
			app := newGuardedApp(t)
			_, err := newVendor(app, map[string]any{"display_name": "Acme", "address": address()})
			requireFieldRefusal(t, err, "address", msgAddressShape)
		})
	}
}

func TestVendor_NullAndWellFormedAddressesAreAccepted(t *testing.T) {
	app := newGuardedApp(t)
	if _, err := newVendor(app, map[string]any{"display_name": "Acme", "address": nil}); err != nil {
		t.Fatalf("a null address was refused: %v", err)
	}
	if _, err := newVendor(app, map[string]any{"display_name": "Harborview", "address": validAddress()}); err != nil {
		t.Fatalf("a well-formed address was refused: %v", err)
	}
}

// An address part is counted in characters, not bytes: 200 four-byte
// characters fit.
func TestVendor_AddressPartsAreCountedInCharacters(t *testing.T) {
	app := newGuardedApp(t)
	emoji := strings.Repeat("😀", 200)
	a := map[string]any{}
	for _, key := range addressParts {
		a[key] = emoji
	}
	r, err := newVendor(app, map[string]any{"display_name": "Acme", "address": a})
	if err != nil {
		t.Fatalf("parts of 200 emoji were refused: %v", err)
	}
	var got map[string]string
	if err := reload(t, app, "books_vendors", r.Id).UnmarshalJSONField("address", &got); err != nil {
		t.Fatalf("read address: %v", err)
	}
	if got["city"] != emoji {
		t.Error("the city was not stored whole")
	}
}

func TestVendor_MissingExpenseAccountIsRefused(t *testing.T) {
	app := newGuardedApp(t)
	_, err := newVendor(app, map[string]any{"display_name": "Acme", "expense_account": "noaccount000001"})
	requireFieldRefusal(t, err, "expense_account", "The expense account does not exist.")
}

func TestVendor_InactiveExpenseAccountIsRefused(t *testing.T) {
	app := newGuardedApp(t)
	closed := mkAccount(t, app, "Old Petty Cash", "other_expense", "other_misc_expense")
	makeAccountInactive(t, app, closed)
	_, err := newVendor(app, map[string]any{"display_name": "Acme", "expense_account": closed.Id})
	requireFieldRefusal(t, err, "expense_account", "The expense account is inactive.")
	if n, _ := app.CountRecords("books_vendors"); n != 0 {
		t.Errorf("%d vendors after the refusal, want 0", n)
	}
}

func TestVendor_ReceivableAndPayableAccountsAreRefused(t *testing.T) {
	for _, kind := range []string{"accounts_receivable", "accounts_payable"} {
		t.Run(kind, func(t *testing.T) {
			app := newGuardedApp(t)
			account := mkAccount(t, app, "Ledger "+kind, kind, kind)
			_, err := newVendor(app, map[string]any{"display_name": "Acme", "expense_account": account.Id})
			requireFieldRefusal(t, err, "expense_account",
				"A vendor's default expense account cannot be Accounts receivable or Accounts payable.")
		})
	}
}

func TestVendor_ActiveExpenseAndFixedAssetAccountsAreAccepted(t *testing.T) {
	app := newGuardedApp(t)
	rent := mkAccount(t, app, "Rent", "expense", "rent_lease")
	equipment := mkAccount(t, app, "Office Equipment", "fixed_asset", "machinery_equipment")
	for i, account := range []*core.Record{rent, equipment} {
		r, err := newVendor(app, map[string]any{"display_name": fmt.Sprintf("Vendor %d", i), "expense_account": account.Id})
		if err != nil {
			t.Fatalf("%s was refused as a default expense account: %v", account.GetString("name"), err)
		}
		if got := reload(t, app, "books_vendors", r.Id).GetString("expense_account"); got != account.Id {
			t.Errorf("expense_account = %q, want %q", got, account.Id)
		}
	}
}

func TestVendor_TermsAreTheSelectValues(t *testing.T) {
	app := newGuardedApp(t)
	for _, terms := range []string{"", "net_30"} {
		r, err := newVendor(app, map[string]any{"display_name": "Vendor " + terms, "terms": terms})
		if err != nil {
			t.Fatalf("terms %q was refused: %v", terms, err)
		}
		if got := reload(t, app, "books_vendors", r.Id).GetString("terms"); got != terms {
			t.Errorf("terms = %q, want %q", got, terms)
		}
	}
	_, err := newVendor(app, map[string]any{"display_name": "Acme", "terms": "net_90"})
	requireSchemaRefusal(t, err, "terms")
}

// Lengths and formats are schema rules, each refused on its own field.
func TestVendor_LengthAndFormatRulesAreRefusedOnTheirField(t *testing.T) {
	cases := map[string]map[string]any{
		"display_name":   {"display_name": strings.Repeat("x", 201)},
		"account_number": {"display_name": "Acme", "account_number": strings.Repeat("1", 101)},
		"email":          {"display_name": "Acme", "email": "x"},
		"website":        {"display_name": "Acme", "website": "not a url"},
	}
	for field, fields := range cases {
		t.Run(field, func(t *testing.T) {
			app := newGuardedApp(t)
			_, err := newVendor(app, fields)
			requireSchemaRefusal(t, err, field)
			if n, _ := app.CountRecords("books_vendors"); n != 0 {
				t.Errorf("%d vendors after the refusal, want 0", n)
			}
		})
	}
}

// The account rules run only when the field changes: a vendor keeps an
// account that became inactive after it was saved.
func TestVendor_AccountThatBecameInactiveIsKeptOnAnotherChange(t *testing.T) {
	app := newGuardedApp(t)
	rent := mkAccount(t, app, "Rent", "expense", "rent_lease")
	v, err := newVendor(app, map[string]any{"display_name": "Acme", "expense_account": rent.Id})
	if err != nil {
		t.Fatalf("save the vendor: %v", err)
	}
	makeAccountInactive(t, app, rent)

	if err := setFields(t, app, "books_vendors", v.Id, map[string]any{"notes": "Paid by check."}); err != nil {
		t.Fatalf("a notes change on a vendor whose account became inactive was refused: %v", err)
	}
	stored := reload(t, app, "books_vendors", v.Id)
	if stored.GetString("notes") != "Paid by check." || stored.GetString("expense_account") != rent.Id {
		t.Fatalf("stored vendor = %v", stored.PublicExport())
	}

	other := mkAccount(t, app, "Old Petty Cash", "other_expense", "other_misc_expense")
	makeAccountInactive(t, app, other)
	err = setFields(t, app, "books_vendors", v.Id, map[string]any{"expense_account": other.Id})
	requireFieldRefusal(t, err, "expense_account", "The expense account is inactive.")
	if got := reload(t, app, "books_vendors", v.Id).GetString("expense_account"); got != rent.Id {
		t.Errorf("expense_account = %q after the refusal, want %q", got, rent.Id)
	}
}

func TestVendor_DeleteIsAllowed(t *testing.T) {
	app := newGuardedApp(t)
	v := mkVendor(t, app, "Acme")
	if err := app.Delete(reload(t, app, "books_vendors", v.Id)); err != nil {
		t.Fatalf("delete a vendor: %v", err)
	}
	if n, _ := app.CountRecords("books_vendors"); n != 0 {
		t.Errorf("%d vendors after the delete, want 0", n)
	}
}

func TestVendor_DeletingItsAccountClearsTheExpenseAccount(t *testing.T) {
	app := newGuardedApp(t)
	rent := mkAccount(t, app, "Rent", "expense", "rent_lease")
	v, err := newVendor(app, map[string]any{"display_name": "Acme", "expense_account": rent.Id})
	if err != nil {
		t.Fatalf("save the vendor: %v", err)
	}
	if err := app.Delete(reload(t, app, "books_accounts", rent.Id)); err != nil {
		t.Fatalf("delete an account with no lines that a vendor names: %v", err)
	}
	if got := reload(t, app, "books_vendors", v.Id).GetString("expense_account"); got != "" {
		t.Errorf("expense_account = %q after its account was deleted, want empty", got)
	}
}

func TestVendorRules_ByLevel(t *testing.T) {
	runRulesByLevel(t, "books_vendors", "vendor")
}

func TestVendorRules_NameKeyIsHidden(t *testing.T) {
	requireNameKeyHidden(t, "books_vendors", func(t testing.TB, app core.App) *core.Record {
		return mkVendor(t, app, "Harborview")
	})
}
