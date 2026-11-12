package books

import (
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/pocketbase/dbx"
	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
)

// newTaxAgency saves an agency through the app, so the guards bound on it run,
// and returns what they said.
func newTaxAgency(app core.App, fields map[string]any) (*core.Record, error) {
	return saveNew(app, "books_tax_agencies", fields)
}

// newTaxRate saves a rate or group through the app, so the guards bound on it
// run, and returns what they said.
func newTaxRate(app core.App, fields map[string]any) (*core.Record, error) {
	return saveNew(app, "books_tax_rates", fields)
}

func mkLiabilityAccount(t testing.TB, app core.App, name string) *core.Record {
	t.Helper()
	return mkAccount(t, app, name, "other_current_liability", "sales_tax_payable")
}

func mkTaxAgency(t testing.TB, app core.App, name string, account *core.Record) *core.Record {
	t.Helper()
	r, err := newTaxAgency(app, map[string]any{"name": name, "account": account.Id})
	if err != nil {
		t.Fatalf("save agency %q: %v", name, err)
	}
	return r
}

func mkTaxRate(t testing.TB, app core.App, name string, ppm int, agency *core.Record) *core.Record {
	t.Helper()
	r, err := newTaxRate(app, map[string]any{"type": "rate", "name": name, "rate_ppm": ppm, "agency": agency.Id})
	if err != nil {
		t.Fatalf("save rate %q: %v", name, err)
	}
	return r
}

func mkTaxGroup(t testing.TB, app core.App, name string, components ...*core.Record) *core.Record {
	t.Helper()
	r, err := newTaxRate(app, map[string]any{"type": "group", "name": name, "components": idsOf(components...)})
	if err != nil {
		t.Fatalf("save group %q: %v", name, err)
	}
	return r
}

func setTaxRate(t testing.TB, app core.App, id string, fields map[string]any) error {
	t.Helper()
	return setFields(t, app, "books_tax_rates", id, fields)
}

func setTaxAgency(t testing.TB, app core.App, id string, fields map[string]any) error {
	t.Helper()
	return setFields(t, app, "books_tax_agencies", id, fields)
}

func requireTaxRowCount(t testing.TB, app core.App, collection string, want int64) {
	t.Helper()
	if n, _ := app.CountRecords(collection); n != want {
		t.Errorf("%d rows in %s, want %d", n, collection, want)
	}
}

// defaultIDs lists the rows that hold is_default, so a test sees both "none"
// and "two" rather than one row's flag.
func defaultIDs(t testing.TB, app core.App) []string {
	t.Helper()
	rows, err := app.FindAllRecords("books_tax_rates", dbx.HashExp{"is_default": true})
	if err != nil {
		t.Fatalf("list the defaults: %v", err)
	}
	return idsOf(rows...)
}

func TestTaxAgency_NameIsTrimmedAndUnique(t *testing.T) {
	app := newGuardedApp(t)
	account := mkLiabilityAccount(t, app, "Sales tax payable")
	agency := mkTaxAgency(t, app, "  Colorado DOR  ", account)
	if got := reload(t, app, "books_tax_agencies", agency.Id).GetString("name"); got != "Colorado DOR" {
		t.Errorf("name = %q, want %q", got, "Colorado DOR")
	}

	_, err := newTaxAgency(app, map[string]any{"name": "colorado dor", "account": account.Id})
	requireFieldRefusal(t, err, "name", "An agency named “colorado dor” already exists.")
	requireTaxRowCount(t, app, "books_tax_agencies", 1)

	// An agency does not collide with itself.
	if err := setTaxAgency(t, app, agency.Id, map[string]any{"name": "COLORADO DOR"}); err != nil {
		t.Fatalf("renaming Colorado DOR to COLORADO DOR was refused: %v", err)
	}
	if got := reload(t, app, "books_tax_agencies", agency.Id).GetString("name"); got != "COLORADO DOR" {
		t.Errorf("name after the rename = %q, want %q", got, "COLORADO DOR")
	}

	requireNameKeyHidden(t, "books_tax_agencies", func(t testing.TB, app core.App) *core.Record {
		return mkTaxAgency(t, app, "Harborview", mkLiabilityAccount(t, app, "Sales tax payable"))
	})
}

func TestTaxAgency_AccountChecks(t *testing.T) {
	app := newGuardedApp(t)
	liability := mkLiabilityAccount(t, app, "Sales tax payable")

	t.Run("no account", func(t *testing.T) {
		_, err := newTaxAgency(app, map[string]any{"name": "No account"})
		requireFieldRefusal(t, err, "account", "Choose a liability account.")
	})
	t.Run("a missing account", func(t *testing.T) {
		_, err := newTaxAgency(app, map[string]any{"name": "Missing account", "account": "nosuchaccount01"})
		requireFieldRefusal(t, err, "account", "The liability account does not exist.")
	})
	t.Run("an inactive account", func(t *testing.T) {
		old := mkLiabilityAccount(t, app, "Old sales tax payable")
		makeAccountInactive(t, app, old)
		_, err := newTaxAgency(app, map[string]any{"name": "Inactive account", "account": old.Id})
		requireFieldRefusal(t, err, "account", "The liability account is inactive.")
	})
	t.Run("an expense account", func(t *testing.T) {
		rent := mkAccount(t, app, "Rent", "expense", "rent_lease")
		_, err := newTaxAgency(app, map[string]any{"name": "Expense account", "account": rent.Id})
		requireFieldRefusal(t, err, "account", "The liability account must be an Other current liability account.")
	})
	requireTaxRowCount(t, app, "books_tax_agencies", 0)

	// The account is checked only when it changes: an agency whose account
	// became inactive after it was saved can still be renamed. The agency goes
	// inactive first, so this order also holds once an account an active
	// agency names cannot be made inactive.
	t.Run("an account that became inactive is kept", func(t *testing.T) {
		agency := mkTaxAgency(t, app, "Colorado DOR", liability)
		if err := setTaxAgency(t, app, agency.Id, map[string]any{"inactive": true}); err != nil {
			t.Fatalf("make the agency inactive: %v", err)
		}
		makeAccountInactive(t, app, liability)
		if err := setTaxAgency(t, app, agency.Id, map[string]any{"inactive": false, "name": "Colorado Department of Revenue"}); err != nil {
			t.Fatalf("renaming an agency whose unchanged account is inactive was refused: %v", err)
		}
		stored := reload(t, app, "books_tax_agencies", agency.Id)
		if got := stored.GetString("name"); got != "Colorado Department of Revenue" {
			t.Errorf("name = %q, want %q", got, "Colorado Department of Revenue")
		}
		if got := stored.GetString("account"); got != liability.Id {
			t.Errorf("account = %q, want the kept %q", got, liability.Id)
		}
		if stored.GetBool("inactive") {
			t.Error("the agency stayed inactive")
		}
	})
}

func TestTaxRate_Shapes(t *testing.T) {
	app := newGuardedApp(t)
	agency := mkTaxAgency(t, app, "Colorado DOR", mkLiabilityAccount(t, app, "Sales tax payable"))
	a := mkTaxRate(t, app, "Colorado state", 29000, agency)
	b := mkTaxRate(t, app, "RTD transit", 10000, agency)
	pair := mkTaxGroup(t, app, "State and RTD", a, b)
	saved := int64(3)

	t.Run("a rate with no agency", func(t *testing.T) {
		_, err := newTaxRate(app, map[string]any{"type": "rate", "name": "No agency", "rate_ppm": 10000})
		requireFieldRefusal(t, err, "agency", "Choose an agency.")
	})
	t.Run("a rate of an inactive agency", func(t *testing.T) {
		old := mkTaxAgency(t, app, "Old county agency", mkLiabilityAccount(t, app, "Old county payable"))
		if err := setTaxAgency(t, app, old.Id, map[string]any{"inactive": true}); err != nil {
			t.Fatalf("make the agency inactive: %v", err)
		}
		_, err := newTaxRate(app, map[string]any{"type": "rate", "name": "Inactive agency", "rate_ppm": 10000, "agency": old.Id})
		requireFieldRefusal(t, err, "agency", "The agency is inactive.")
	})
	t.Run("a rate of a missing agency", func(t *testing.T) {
		_, err := newTaxRate(app, map[string]any{"type": "rate", "name": "Missing agency", "rate_ppm": 10000, "agency": "nosuchagency001"})
		requireFieldRefusal(t, err, "agency", "The agency does not exist.")
	})
	t.Run("a rate with components", func(t *testing.T) {
		_, err := newTaxRate(app, map[string]any{
			"type": "rate", "name": "Rate with rates", "rate_ppm": 10000, "agency": agency.Id,
			"components": []string{a.Id, b.Id},
		})
		requireFieldRefusal(t, err, "components", "A tax rate holds no other rates.")
	})
	t.Run("a group with a rate of its own", func(t *testing.T) {
		_, err := newTaxRate(app, map[string]any{
			"type": "group", "name": "Group with a rate", "rate_ppm": 10000, "components": []string{a.Id, b.Id},
		})
		requireMessageOnlyRefusal(t, err, "A group has no rate or agency of its own.")
	})
	t.Run("a group with an agency", func(t *testing.T) {
		_, err := newTaxRate(app, map[string]any{
			"type": "group", "name": "Group with an agency", "agency": agency.Id, "components": []string{a.Id, b.Id},
		})
		requireMessageOnlyRefusal(t, err, "A group has no rate or agency of its own.")
	})
	t.Run("a group of one rate", func(t *testing.T) {
		_, err := newTaxRate(app, map[string]any{"type": "group", "name": "One rate", "components": []string{a.Id}})
		requireFieldRefusal(t, err, "components", "Choose at least two rates.")
	})
	t.Run("a group of eleven rates", func(t *testing.T) {
		eleven := []string{}
		for i := range 11 {
			eleven = append(eleven, mkTaxRate(t, app, fmt.Sprintf("District %d", i+1), 1000, agency).Id)
		}
		saved += 11
		_, err := newTaxRate(app, map[string]any{"type": "group", "name": "Eleven rates", "components": eleven})
		requireFieldRefusal(t, err, "components", "A group holds at most ten rates.")
	})
	t.Run("the same rate twice", func(t *testing.T) {
		// PocketBase drops a repeated id when a relation value is set or loaded
		// (RelationField.PrepareValue), so a REST body never brings one to the
		// guard; a raw value does, and the guard must read what it was given.
		// A, A, B holds two distinct rates, so only the repeat can refuse it.
		col, err := app.FindCollectionByNameOrId("books_tax_rates")
		if err != nil {
			t.Fatal(err)
		}
		r := core.NewRecord(col)
		r.Load(map[string]any{"type": "group", "name": "Twice"})
		r.SetRaw("components", []string{a.Id, a.Id, b.Id})
		requireFieldRefusal(t, app.Save(r), "components", "Each rate can be in a group once.")
	})
	t.Run("a group naming a group", func(t *testing.T) {
		_, err := newTaxRate(app, map[string]any{"type": "group", "name": "Nested", "components": []string{a.Id, pair.Id}})
		requireFieldRefusal(t, err, "components", "A group cannot contain another group.")
	})
	t.Run("a group naming a missing rate", func(t *testing.T) {
		_, err := newTaxRate(app, map[string]any{"type": "group", "name": "Missing rate", "components": []string{a.Id, "nosuchrate00001"}})
		requireFieldRefusal(t, err, "components", "A rate in this group does not exist.")
	})
	t.Run("a group adding an inactive rate", func(t *testing.T) {
		old := mkTaxRate(t, app, "Old rate", 5000, agency)
		saved++
		if err := setTaxRate(t, app, old.Id, map[string]any{"inactive": true}); err != nil {
			t.Fatalf("make Old rate inactive: %v", err)
		}
		_, err := newTaxRate(app, map[string]any{"type": "group", "name": "With old rate", "components": []string{a.Id, old.Id}})
		requireFieldRefusal(t, err, "components", "“Old rate” is inactive.")
	})
	for _, ppm := range []any{1000001, -1, 1.5} {
		t.Run(fmt.Sprintf("rate_ppm %v", ppm), func(t *testing.T) {
			_, err := newTaxRate(app, map[string]any{"type": "rate", "name": fmt.Sprintf("Rate %v", ppm), "rate_ppm": ppm, "agency": agency.Id})
			requireSchemaRefusal(t, err, "rate_ppm")
		})
	}
	t.Run("a rate stays a rate", func(t *testing.T) {
		requireFieldRefusal(t, setTaxRate(t, app, a.Id, map[string]any{"type": "group"}),
			"type", "A tax rate stays a rate and a group stays a group.")
		if got := reload(t, app, "books_tax_rates", a.Id).GetString("type"); got != "rate" {
			t.Errorf("type = %q, want rate", got)
		}
	})
	t.Run("a group stays a group", func(t *testing.T) {
		requireFieldRefusal(t, setTaxRate(t, app, pair.Id, map[string]any{"type": "rate"}),
			"type", "A tax rate stays a rate and a group stays a group.")
		if got := reload(t, app, "books_tax_rates", pair.Id).GetString("type"); got != "group" {
			t.Errorf("type = %q, want group", got)
		}
	})
	requireTaxRowCount(t, app, "books_tax_rates", saved)
}

// The server checks only the rates a change adds: a stored rate that became
// inactive stays in its group through a rename and an added rate. The group
// goes inactive first, so this order also holds once a rate an active group
// holds cannot be made inactive.
func TestTaxRate_KeepsAComponentThatBecameInactive(t *testing.T) {
	app := newGuardedApp(t)
	agency := mkTaxAgency(t, app, "Colorado DOR", mkLiabilityAccount(t, app, "Sales tax payable"))
	a := mkTaxRate(t, app, "Rate A", 10000, agency)
	b := mkTaxRate(t, app, "Rate B", 20000, agency)
	c := mkTaxRate(t, app, "Rate C", 30000, agency)
	d := mkTaxRate(t, app, "Rate D", 40000, agency)
	g := mkTaxGroup(t, app, "Group G", a, b)

	if err := setTaxRate(t, app, g.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make G inactive: %v", err)
	}
	for _, r := range []*core.Record{b, d} {
		if err := setTaxRate(t, app, r.Id, map[string]any{"inactive": true}); err != nil {
			t.Fatalf("make %s inactive: %v", r.GetString("name"), err)
		}
	}
	if err := setTaxRate(t, app, g.Id, map[string]any{"inactive": false}); err != nil {
		t.Fatalf("making G active again, its components unchanged, was refused: %v", err)
	}
	if err := setTaxRate(t, app, g.Id, map[string]any{"name": "Group G renamed"}); err != nil {
		t.Fatalf("renaming G, which keeps the inactive B, was refused: %v", err)
	}
	if err := setTaxRate(t, app, g.Id, map[string]any{"components": []string{a.Id, b.Id, c.Id}}); err != nil {
		t.Fatalf("adding the active C to G, which keeps the inactive B, was refused: %v", err)
	}
	err := setTaxRate(t, app, g.Id, map[string]any{"components": []string{a.Id, b.Id, c.Id, d.Id}})
	requireFieldRefusal(t, err, "components", "“Rate D” is inactive.")

	stored := reload(t, app, "books_tax_rates", g.Id)
	if got, want := stored.GetStringSlice("components"), []string{a.Id, b.Id, c.Id}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("components = %v, want %v", got, want)
	}
	if stored.GetBool("inactive") {
		t.Error("G stayed inactive")
	}
}

func TestTaxRate_NameIsUniqueAcrossRatesAndGroups(t *testing.T) {
	app := newGuardedApp(t)
	agency := mkTaxAgency(t, app, "Colorado DOR", mkLiabilityAccount(t, app, "Sales tax payable"))
	a := mkTaxRate(t, app, "Denver city", 48100, agency)
	b := mkTaxRate(t, app, "RTD transit", 10000, agency)
	mkTaxGroup(t, app, "Denver combined", a, b)

	_, err := newTaxRate(app, map[string]any{"type": "group", "name": "DENVER CITY", "components": []string{a.Id, b.Id}})
	requireFieldRefusal(t, err, "name", "A tax rate or group named “DENVER CITY” already exists.")

	_, err = newTaxRate(app, map[string]any{"type": "rate", "name": "denver combined", "rate_ppm": 1000, "agency": agency.Id})
	requireFieldRefusal(t, err, "name", "A tax rate or group named “denver combined” already exists.")

	requireTaxRowCount(t, app, "books_tax_rates", 3)
}

func TestTaxRate_DefaultSwap(t *testing.T) {
	app := newGuardedApp(t)
	agency := mkTaxAgency(t, app, "Colorado DOR", mkLiabilityAccount(t, app, "Sales tax payable"))
	a := mkTaxRate(t, app, "Rate A", 10000, agency)
	b := mkTaxRate(t, app, "Rate B", 20000, agency)
	g := mkTaxGroup(t, app, "Group G", a, b)
	retired := mkTaxRate(t, app, "Retired rate", 35000, agency)
	if err := setTaxRate(t, app, retired.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Retired rate inactive: %v", err)
	}

	if err := setTaxRate(t, app, a.Id, map[string]any{"is_default": true}); err != nil {
		t.Fatalf("make A the default: %v", err)
	}
	if got := defaultIDs(t, app); fmt.Sprint(got) != fmt.Sprint([]string{a.Id}) {
		t.Fatalf("defaults after A = %v, want [%s]", got, a.Id)
	}

	if err := setTaxRate(t, app, g.Id, map[string]any{"is_default": true}); err != nil {
		t.Fatalf("make G the default while A is: %v", err)
	}
	if reload(t, app, "books_tax_rates", a.Id).GetBool("is_default") {
		t.Error("A kept is_default after G became the default")
	}
	if got := defaultIDs(t, app); fmt.Sprint(got) != fmt.Sprint([]string{g.Id}) {
		t.Errorf("defaults after G = %v, want [%s]", got, g.Id)
	}

	err := setTaxRate(t, app, retired.Id, map[string]any{"is_default": true})
	requireMessageOnlyRefusal(t, err, "Only an active rate or group can be the default.")
	if got := defaultIDs(t, app); fmt.Sprint(got) != fmt.Sprint([]string{g.Id}) {
		t.Errorf("defaults after the refused inactive default = %v, want G [%s]", got, g.Id)
	}

	if err := setTaxRate(t, app, g.Id, map[string]any{"is_default": false}); err != nil {
		t.Fatalf("clear G's default: %v", err)
	}
	if got := defaultIDs(t, app); len(got) != 0 {
		t.Errorf("defaults after Remove default = %v, want none", got)
	}

	// The partial unique index is the backstop of the guard's swap: with no
	// hook and no validation, a second default still cannot land, while any
	// number of rows that are not the default can.
	t.Run("a second raw default is refused by the index", func(t *testing.T) {
		raw := newBooksApp(t)
		rows := []map[string]any{
			{"type": "rate", "name": "One", "name_key": "one", "sort_key": "one", "is_default": true},
			{"type": "rate", "name": "Two", "name_key": "two", "sort_key": "two"},
			{"type": "rate", "name": "Three", "name_key": "three", "sort_key": "three"},
		}
		for _, row := range rows {
			if err := rawSave(t, raw, "books_tax_rates", row); err != nil {
				t.Fatalf("save %s: %v", row["name"], err)
			}
		}
		err := rawSave(t, raw, "books_tax_rates", map[string]any{
			"type": "rate", "name": "Four", "name_key": "four", "sort_key": "four", "is_default": true,
		})
		if err == nil {
			t.Fatal("a second row with is_default was stored")
		}
		var errs validation.Errors
		if !errors.As(err, &errs) {
			t.Fatalf("the second default was refused by %v (%T), not by a unique index", err, err)
		}
		if keyErr, ok := errs["is_default"].(validation.Error); !ok || keyErr.Code() != "validation_not_unique" {
			t.Fatalf("the second default was refused by %v, not by a unique index on is_default", err)
		}
	})
}

// Readers read the agencies, rates and groups; writers write them.
func TestTaxRules_ByLevel(t *testing.T) {
	t.Run("agencies", func(t *testing.T) {
		runLevelCases(t, "books_tax_agencies", func(t testing.TB, app core.App) levelFixture {
			account := mkLiabilityAccount(t, app, "Sales tax payable")
			harbor := mkTaxAgency(t, app, "Harborview", account)
			return levelFixture{
				rowID:         harbor.Id,
				viewContent:   `"name":"Harborview"`,
				createBody:    fmt.Sprintf(`{"name":"Acme","account":%q}`, account.Id),
				createContent: `"name":"Acme"`,
				updateBody:    `{"inactive":true}`,
				unchanged: func(t testing.TB, app core.App) {
					if reload(t, app, "books_tax_agencies", harbor.Id).GetBool("inactive") {
						t.Error("a read-only user made the agency inactive")
					}
					requireTaxRowCount(t, app, "books_tax_agencies", 1)
				},
			}
		})
	})
	t.Run("rates", func(t *testing.T) {
		runLevelCases(t, "books_tax_rates", func(t testing.TB, app core.App) levelFixture {
			agency := mkTaxAgency(t, app, "Colorado DOR", mkLiabilityAccount(t, app, "Sales tax payable"))
			harbor := mkTaxRate(t, app, "Harborview", 10000, agency)
			return levelFixture{
				rowID:         harbor.Id,
				viewContent:   `"name":"Harborview"`,
				createBody:    fmt.Sprintf(`{"type":"rate","name":"Acme","rate_ppm":20000,"agency":%q}`, agency.Id),
				createContent: `"name":"Acme"`,
				updateBody:    `{"rate_ppm":5}`,
				unchanged: func(t testing.TB, app core.App) {
					if got := reload(t, app, "books_tax_rates", harbor.Id).GetInt("rate_ppm"); got != 10000 {
						t.Errorf("a read-only user changed the rate to %d ppm", got)
					}
					requireTaxRowCount(t, app, "books_tax_rates", 1)
				},
			}
		})
	})
}

// requireStillThere asserts a refused delete left the row in place.
func requireStillThere(t testing.TB, app core.App, collection string, r *core.Record) {
	t.Helper()
	if _, err := app.FindRecordById(collection, r.Id); err != nil {
		t.Errorf("%s %q is gone after a refused delete: %v", collection, r.GetString("name"), err)
	}
}

func deleteTaxRate(t testing.TB, app core.App, r *core.Record) error {
	t.Helper()
	return app.Delete(reload(t, app, "books_tax_rates", r.Id))
}

func deleteTaxAgency(t testing.TB, app core.App, r *core.Record) error {
	t.Helper()
	return app.Delete(reload(t, app, "books_tax_agencies", r.Id))
}

// Every rate counts, active or not. Without this refusal PocketBase's own
// cleanup clears the agency off its rates, which the rate guard refuses with
// "Choose an agency.": the agency's own message must come first.
func TestTaxAgency_DeleteRefusedWhileRatesNameIt(t *testing.T) {
	app := newGuardedApp(t)
	account := mkLiabilityAccount(t, app, "Sales tax payable")
	county := mkTaxAgency(t, app, "Adams County", account)
	state := mkTaxAgency(t, app, "Colorado DOR", account)
	adams := mkTaxRate(t, app, "Adams County", 7500, county)
	stateRates := []*core.Record{
		mkTaxRate(t, app, "Colorado state", 29000, state),
		mkTaxRate(t, app, "RTD transit", 10000, state),
		mkTaxRate(t, app, "Retired rate", 35000, state),
	}
	if err := setTaxRate(t, app, stateRates[2].Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Retired rate inactive: %v", err)
	}

	requireMessageOnlyRefusal(t, deleteTaxAgency(t, app, county),
		"This agency has 1 tax rate. Delete it or move it to another agency first.")
	requireMessageOnlyRefusal(t, deleteTaxAgency(t, app, state),
		"This agency has 3 tax rates. Delete them or move them to another agency first.")
	requireStillThere(t, app, "books_tax_agencies", county)
	requireStillThere(t, app, "books_tax_agencies", state)
	for _, r := range append([]*core.Record{adams}, stateRates...) {
		if got, want := reload(t, app, "books_tax_rates", r.Id).GetString("agency"), r.GetString("agency"); got != want {
			t.Errorf("%s agency = %q after the refused delete, want %q", r.GetString("name"), got, want)
		}
	}

	for _, r := range append([]*core.Record{adams}, stateRates...) {
		if err := deleteTaxRate(t, app, r); err != nil {
			t.Fatalf("delete %s: %v", r.GetString("name"), err)
		}
	}
	for _, agency := range []*core.Record{county, state} {
		if err := deleteTaxAgency(t, app, agency); err != nil {
			t.Fatalf("deleting %s with no rates was refused: %v", agency.GetString("name"), err)
		}
	}
	requireTaxRowCount(t, app, "books_tax_agencies", 0)
}

// Only active rates keep an agency active; an inactive agency whose rates are
// all inactive can be made active again.
func TestTaxAgency_InactiveRefusedWhileActiveRatesNameIt(t *testing.T) {
	app := newGuardedApp(t)
	agency := mkTaxAgency(t, app, "Colorado DOR", mkLiabilityAccount(t, app, "Sales tax payable"))
	state := mkTaxRate(t, app, "Colorado state", 29000, agency)
	rtd := mkTaxRate(t, app, "RTD transit", 10000, agency)

	requireMessageOnlyRefusal(t, setTaxAgency(t, app, agency.Id, map[string]any{"inactive": true}),
		"Make its 2 active rates inactive first.")
	if err := setTaxRate(t, app, state.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Colorado state inactive: %v", err)
	}
	requireMessageOnlyRefusal(t, setTaxAgency(t, app, agency.Id, map[string]any{"inactive": true}),
		"Make its 1 active rate inactive first.")
	if reload(t, app, "books_tax_agencies", agency.Id).GetBool("inactive") {
		t.Fatal("the agency is inactive after two refusals")
	}

	if err := setTaxRate(t, app, rtd.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make RTD transit inactive: %v", err)
	}
	if err := setTaxAgency(t, app, agency.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("making the agency inactive with every rate inactive was refused: %v", err)
	}
	if !reload(t, app, "books_tax_agencies", agency.Id).GetBool("inactive") {
		t.Fatal("the agency is still active")
	}
	if err := setTaxAgency(t, app, agency.Id, map[string]any{"inactive": false}); err != nil {
		t.Fatalf("making the agency active again was refused: %v", err)
	}
	if reload(t, app, "books_tax_agencies", agency.Id).GetBool("inactive") {
		t.Fatal("the agency stayed inactive")
	}
}

// A group names a rate whether the group is active or not. Without this
// refusal PocketBase's own cleanup drops the rate from each group: a group of
// three silently loses it, and a group of two fails "Choose at least two
// rates.". The default goes first; a customer's default is cleared.
func TestTaxRate_DeleteRefusals(t *testing.T) {
	app := newGuardedApp(t)
	agency := mkTaxAgency(t, app, "Colorado DOR", mkLiabilityAccount(t, app, "Sales tax payable"))
	state := mkTaxRate(t, app, "Colorado state", 29000, agency)
	city := mkTaxRate(t, app, "Denver city", 48100, agency)
	rtd := mkTaxRate(t, app, "RTD transit", 10000, agency)
	adams := mkTaxRate(t, app, "Adams County", 7500, agency)
	old := mkTaxRate(t, app, "Old county", 5000, agency)
	oldCity := mkTaxRate(t, app, "Old city", 6000, agency)
	metro := mkTaxGroup(t, app, "Metro", state, city, rtd)
	valley := mkTaxGroup(t, app, "Valley", city, adams)
	retired := mkTaxGroup(t, app, "Retired group", old, oldCity)
	if err := setTaxRate(t, app, retired.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Retired group inactive: %v", err)
	}

	t.Run("a rate in a group of three", func(t *testing.T) {
		requireMessageOnlyRefusal(t, deleteTaxRate(t, app, state),
			"This rate is in the group “Metro”. Remove it from the group first.")
		requireStillThere(t, app, "books_tax_rates", state)
		got := reload(t, app, "books_tax_rates", metro.Id).GetStringSlice("components")
		if want := idsOf(state, city, rtd); fmt.Sprint(got) != fmt.Sprint(want) {
			t.Errorf("Metro components = %v after the refused delete, want %v", got, want)
		}
	})
	t.Run("a rate in two groups", func(t *testing.T) {
		requireMessageOnlyRefusal(t, deleteTaxRate(t, app, city),
			"This rate is in 2 groups. Remove it from them first.")
		requireStillThere(t, app, "books_tax_rates", city)
		got := reload(t, app, "books_tax_rates", valley.Id).GetStringSlice("components")
		if want := idsOf(city, adams); fmt.Sprint(got) != fmt.Sprint(want) {
			t.Errorf("Valley components = %v after the refused delete, want %v", got, want)
		}
	})
	t.Run("a rate in an inactive group", func(t *testing.T) {
		requireMessageOnlyRefusal(t, deleteTaxRate(t, app, old),
			"This rate is in the group “Retired group”. Remove it from the group first.")
		requireStillThere(t, app, "books_tax_rates", old)
	})
	t.Run("the default rate", func(t *testing.T) {
		single := mkTaxRate(t, app, "Single rate", 20000, agency)
		if err := setTaxRate(t, app, single.Id, map[string]any{"is_default": true}); err != nil {
			t.Fatalf("make Single rate the default: %v", err)
		}
		requireMessageOnlyRefusal(t, deleteTaxRate(t, app, single),
			"This is the default for new sales. Choose another default first.")
		requireStillThere(t, app, "books_tax_rates", single)
		if got := defaultIDs(t, app); fmt.Sprint(got) != fmt.Sprint([]string{single.Id}) {
			t.Errorf("defaults after the refused delete = %v, want [%s]", got, single.Id)
		}
	})
	t.Run("the default group", func(t *testing.T) {
		if err := setTaxRate(t, app, valley.Id, map[string]any{"is_default": true}); err != nil {
			t.Fatalf("make Valley the default: %v", err)
		}
		requireMessageOnlyRefusal(t, deleteTaxRate(t, app, valley),
			"This is the default for new sales. Choose another default first.")
		requireStillThere(t, app, "books_tax_rates", valley)
		if got := defaultIDs(t, app); fmt.Sprint(got) != fmt.Sprint([]string{valley.Id}) {
			t.Errorf("defaults after the refused delete = %v, want [%s]", got, valley.Id)
		}
	})
	t.Run("a customer's default", func(t *testing.T) {
		boulder := mkTaxRate(t, app, "Boulder city", 38600, agency)
		customer, err := newCustomer(app, map[string]any{"display_name": "Harborview", "default_tax_rate": boulder.Id})
		if err != nil {
			t.Fatalf("save a customer whose default is Boulder city: %v", err)
		}
		if err := deleteTaxRate(t, app, boulder); err != nil {
			t.Fatalf("deleting a customer's default rate was refused: %v", err)
		}
		if got := reload(t, app, "books_customers", customer.Id).GetString("default_tax_rate"); got != "" {
			t.Errorf("customer default_tax_rate = %q after its rate was deleted, want empty", got)
		}
	})
}

// An inactive group does not keep its rates active. The default goes first,
// for a rate and for a group: a stored default must never become inactive.
func TestTaxRate_InactiveRefusals(t *testing.T) {
	app := newGuardedApp(t)
	agency := mkTaxAgency(t, app, "Colorado DOR", mkLiabilityAccount(t, app, "Sales tax payable"))
	state := mkTaxRate(t, app, "Colorado state", 29000, agency)
	city := mkTaxRate(t, app, "Denver city", 48100, agency)
	rtd := mkTaxRate(t, app, "RTD transit", 10000, agency)
	old := mkTaxRate(t, app, "Old county", 5000, agency)
	single := mkTaxRate(t, app, "Single rate", 20000, agency)
	metro := mkTaxGroup(t, app, "Metro", state, city)
	mkTaxGroup(t, app, "Valley", city, rtd)
	retired := mkTaxGroup(t, app, "Retired group", rtd, old)
	if err := setTaxRate(t, app, retired.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Retired group inactive: %v", err)
	}

	requireStillActive := func(t *testing.T, r *core.Record) {
		t.Helper()
		if reload(t, app, "books_tax_rates", r.Id).GetBool("inactive") {
			t.Errorf("%s is inactive after a refusal", r.GetString("name"))
		}
	}

	t.Run("a rate in one active group", func(t *testing.T) {
		requireMessageOnlyRefusal(t, setTaxRate(t, app, state.Id, map[string]any{"inactive": true}),
			"Remove it from the group “Metro” or make the group inactive first.")
		requireStillActive(t, state)
	})
	t.Run("a rate in two active groups", func(t *testing.T) {
		requireMessageOnlyRefusal(t, setTaxRate(t, app, city.Id, map[string]any{"inactive": true}),
			"Remove it from its 2 active groups or make them inactive first.")
		requireStillActive(t, city)
	})
	t.Run("a rate in an active and an inactive group", func(t *testing.T) {
		requireMessageOnlyRefusal(t, setTaxRate(t, app, rtd.Id, map[string]any{"inactive": true}),
			"Remove it from the group “Valley” or make the group inactive first.")
		requireStillActive(t, rtd)
	})
	t.Run("a rate in an inactive group only", func(t *testing.T) {
		if err := setTaxRate(t, app, old.Id, map[string]any{"inactive": true}); err != nil {
			t.Fatalf("making a rate of an inactive group inactive was refused: %v", err)
		}
		if !reload(t, app, "books_tax_rates", old.Id).GetBool("inactive") {
			t.Error("Old county is still active")
		}
	})
	t.Run("the default rate", func(t *testing.T) {
		if err := setTaxRate(t, app, single.Id, map[string]any{"is_default": true}); err != nil {
			t.Fatalf("make Single rate the default: %v", err)
		}
		requireMessageOnlyRefusal(t, setTaxRate(t, app, single.Id, map[string]any{"inactive": true}),
			"This is the default for new sales. Choose another default first.")
		requireStillActive(t, single)
		if got := defaultIDs(t, app); fmt.Sprint(got) != fmt.Sprint([]string{single.Id}) {
			t.Errorf("defaults after the refusal = %v, want [%s]", got, single.Id)
		}
	})
	t.Run("the default group", func(t *testing.T) {
		if err := setTaxRate(t, app, metro.Id, map[string]any{"is_default": true}); err != nil {
			t.Fatalf("make Metro the default: %v", err)
		}
		requireMessageOnlyRefusal(t, setTaxRate(t, app, metro.Id, map[string]any{"inactive": true}),
			"This is the default for new sales. Choose another default first.")
		requireStillActive(t, metro)
		if got := defaultIDs(t, app); fmt.Sprint(got) != fmt.Sprint([]string{metro.Id}) {
			t.Errorf("defaults after the refusal = %v, want [%s]", got, metro.Id)
		}
	})
}

// Later units append their document tax columns; the list starts with the
// groups' rates, then each sales document's header rate and its tax lines'
// components (invoice, sales receipt).
func TestTaxRateReferences_StartWithGroupComponents(t *testing.T) {
	if len(taxRateReferences) != 5 {
		t.Fatalf("taxRateReferences has %d entries, want 5", len(taxRateReferences))
	}
	for _, want := range [][2]string{
		{"books_invoices", "tax_rate"}, {"books_invoice_tax_lines", "component"},
		{"books_sales_receipts", "tax_rate"}, {"books_sales_receipt_tax_lines", "component"},
	} {
		found := false
		for _, ref := range taxRateReferences[1:] {
			if ref.collection == want[0] && ref.field == want[1] && !ref.multiple && ref.message != nil {
				found = true
			}
		}
		if !found {
			t.Errorf("taxRateReferences has no single-rate reference %s.%s with a message", want[0], want[1])
		}
	}
	ref := taxRateReferences[0]
	if ref.collection != "books_tax_rates" || ref.field != "components" || !ref.multiple {
		t.Errorf("taxRateReferences[0] = {%q, %q, multiple %v}, want {books_tax_rates, components, multiple true}",
			ref.collection, ref.field, ref.multiple)
	}
	if ref.message == nil || reflect.ValueOf(ref.message).Pointer() != reflect.ValueOf(rateInGroupsMessage).Pointer() {
		t.Error("taxRateReferences[0].message is not rateInGroupsMessage")
	}
}

// A rate or group on an invoice, or a component rate named only by a posted
// invoice's tax line, cannot be deleted.
func TestTaxRate_DeleteRefusedWhileOnInvoices(t *testing.T) {
	const wantOnInvoices = "This tax rate is on invoices. Make it inactive instead."
	app := newGuardedApp(t)
	agency := mkTaxAgency(t, app, "Colorado DOR", mkLiabilityAccount(t, app, "Sales tax payable"))
	customer := mkCustomer(t, app, "Harborview Dental", "")

	t.Run("a rate on an invoice", func(t *testing.T) {
		boulder := mkTaxRate(t, app, "Boulder city", 38600, agency)
		mkInvoiceRow(t, app, customer, map[string]any{"tax_rate": boulder.Id})
		requireMessageOnlyRefusal(t, deleteTaxRate(t, app, boulder), wantOnInvoices)
		requireStillThere(t, app, "books_tax_rates", boulder)
	})

	t.Run("a group on an invoice", func(t *testing.T) {
		metro := mkTaxGroup(t, app, "Metro",
			mkTaxRate(t, app, "Metro state", 29000, agency), mkTaxRate(t, app, "Metro city", 48100, agency))
		mkInvoiceRow(t, app, customer, map[string]any{"tax_rate": metro.Id})
		requireMessageOnlyRefusal(t, deleteTaxRate(t, app, metro), wantOnInvoices)
		requireStillThere(t, app, "books_tax_rates", metro)
	})

	t.Run("a component named only by an invoice tax line", func(t *testing.T) {
		header := mkTaxRate(t, app, "Aurora city", 37500, agency)
		component := mkTaxRate(t, app, "Old county", 5000, agency)
		inv := mkInvoiceRow(t, app, customer, map[string]any{"status": "posted", "tax_rate": header.Id})
		saveRecord(t, app, "books_invoice_tax_lines", map[string]any{
			"invoice": inv.Id, "rate": header.Id, "component": component.Id, "agency": agency.Id,
			"rate_ppm": 5000, "taxable_amount": 10000, "amount": 50, "position": 0,
		})
		requireMessageOnlyRefusal(t, deleteTaxRate(t, app, component), wantOnInvoices)
		requireStillThere(t, app, "books_tax_rates", component)
	})

	t.Run("a rate on no invoice deletes", func(t *testing.T) {
		unused := mkTaxRate(t, app, "Unused rate", 1000, agency)
		if err := deleteTaxRate(t, app, unused); err != nil {
			t.Fatalf("delete a rate on no invoice: %v", err)
		}
	})
}

// Spec §3.10: a rate on a sales receipt, or a component rate named only by a
// posted sales receipt's tax line, cannot be deleted.
func TestTaxRate_DeleteRefusedWhileOnSalesReceipts(t *testing.T) {
	const wantOnReceipts = "This tax rate is on sales receipts. Make it inactive instead."
	app := newGuardedApp(t)
	agency := mkTaxAgency(t, app, "Colorado DOR", mkLiabilityAccount(t, app, "Sales tax payable"))
	undeposited := mkNumberedAccount(t, app, "Undeposited funds", "1200", "other_current_asset", "undeposited_funds")

	t.Run("a rate on a draft sales receipt", func(t *testing.T) {
		boulder := mkTaxRate(t, app, "Boulder city", 38600, agency)
		mkReceiptRow(t, app, undeposited, map[string]any{"tax_rate": boulder.Id})
		requireMessageOnlyRefusal(t, deleteTaxRate(t, app, boulder), wantOnReceipts)
		requireStillThere(t, app, "books_tax_rates", boulder)
	})

	t.Run("a component named only by a posted sales receipt's tax line", func(t *testing.T) {
		header := mkTaxRate(t, app, "Aurora city", 37500, agency)
		component := mkTaxRate(t, app, "Old county", 5000, agency)
		r := mkReceiptRow(t, app, undeposited, map[string]any{"status": "posted", "number": "1001", "tax_rate": header.Id})
		saveRecord(t, app, "books_sales_receipt_tax_lines", map[string]any{
			"sales_receipt": r.Id, "rate": header.Id, "component": component.Id, "agency": agency.Id,
			"rate_ppm": 5000, "taxable_amount": 10000, "amount": 50, "position": 0,
		})
		requireMessageOnlyRefusal(t, deleteTaxRate(t, app, component), wantOnReceipts)
		requireStillThere(t, app, "books_tax_rates", component)
	})
}
