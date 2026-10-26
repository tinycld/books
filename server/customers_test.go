package books

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/router"
)

// newCustomer saves a customer through the app, so the guards bound on it
// run, and returns what they said.
func newCustomer(app core.App, fields map[string]any) (*core.Record, error) {
	col, err := app.FindCollectionByNameOrId("books_customers")
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	r.Load(fields)
	return r, app.Save(r)
}

func mkCustomer(t testing.TB, app core.App, name, parent string) *core.Record {
	t.Helper()
	r, err := newCustomer(app, map[string]any{"display_name": name, "parent": parent})
	if err != nil {
		t.Fatalf("save customer %q: %v", name, err)
	}
	return r
}

func setCustomer(t testing.TB, app core.App, id string, fields map[string]any) error {
	t.Helper()
	r := reload(t, app, "books_customers", id)
	for k, v := range fields {
		r.Set(k, v)
	}
	return app.Save(r)
}

func apiErrorOf(t testing.TB, err error) *router.ApiError {
	t.Helper()
	if err == nil {
		t.Fatal("expected a refusal, got none")
	}
	var apiErr *router.ApiError
	if !errors.As(err, &apiErr) {
		t.Fatalf("refusal %v (%T) is not an ApiError", err, err)
	}
	return apiErr
}

// sameText compares two refusal texts exactly. PocketBase sentenizes an
// ApiError's message and each field message (a final period is added), so a
// message constant without its period does not match what the client gets.
func sameText(got, want string) bool {
	return got == want
}

// requireFieldRefusal asserts a 400 whose data names field, with the message
// on both the refusal and the field, so the client maps it to that field.
func requireFieldRefusal(t testing.TB, err error, field, want string) {
	t.Helper()
	apiErr := apiErrorOf(t, err)
	if apiErr.Status != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", apiErr.Status)
	}
	if !sameText(apiErr.Message, want) {
		t.Errorf("message = %q, want %q", apiErr.Message, want)
	}
	item, ok := apiErr.Data[field].(map[string]any)
	if !ok {
		t.Fatalf("refusal data %v names no field %q", apiErr.Data, field)
	}
	if msg, _ := item["message"].(string); !sameText(msg, want) {
		t.Errorf("field %q message = %q, want %q", field, msg, want)
	}
}

// requireMessageOnlyRefusal asserts a 400 with the message and no field, so
// the client shows it as a form-level error.
func requireMessageOnlyRefusal(t testing.TB, err error, want string) {
	t.Helper()
	apiErr := apiErrorOf(t, err)
	if !sameText(apiErr.Message, want) {
		t.Errorf("message = %q, want %q", apiErr.Message, want)
	}
	if len(apiErr.Data) != 0 {
		t.Errorf("refusal data = %v, want no field", apiErr.Data)
	}
}

func validAddress() map[string]any {
	return map[string]any{
		"line1": "1450 Waterfront Avenue", "line2": "Suite 300", "city": "Seattle",
		"region": "WA", "postal_code": "98101", "country": "United States",
	}
}

func TestCustomer_DisplayNameIsStoredTrimmed(t *testing.T) {
	app := newGuardedApp(t)
	r := mkCustomer(t, app, "  Acme  ", "")
	if got := reload(t, app, "books_customers", r.Id).GetString("display_name"); got != "Acme" {
		t.Fatalf("display_name = %q, want %q", got, "Acme")
	}
}

func TestCustomer_DuplicateTopLevelNameIsRefused(t *testing.T) {
	app := newGuardedApp(t)
	mkCustomer(t, app, "  Acme  ", "")
	_, err := newCustomer(app, map[string]any{"display_name": "acme"})
	requireFieldRefusal(t, err, "display_name", "A customer named “acme” already exists here.")
	if got := fmt.Sprintf(msgDuplicateName, "acme"); got != "A customer named “acme” already exists here." {
		t.Errorf("msgDuplicateName gives %q", got)
	}
}

// SQLite's NOCASE folds ASCII letters only; the guard folds every letter.
func TestCustomer_DuplicateNameFoldsNonASCIILetters(t *testing.T) {
	app := newGuardedApp(t)
	mkCustomer(t, app, "Ärzte", "")
	_, err := newCustomer(app, map[string]any{"display_name": "ärzte"})
	requireFieldRefusal(t, err, "display_name", "A customer named “ärzte” already exists here.")
}

func TestCustomer_SameNameUnderADifferentParentIsAllowed(t *testing.T) {
	app := newGuardedApp(t)
	harbor := mkCustomer(t, app, "Harborview", "")
	north := mkCustomer(t, app, "Northwind", "")
	mkCustomer(t, app, "Kitchen", harbor.Id)
	if _, err := newCustomer(app, map[string]any{"display_name": "kitchen", "parent": north.Id}); err != nil {
		t.Fatalf("a Kitchen under another parent was refused: %v", err)
	}
	_, err := newCustomer(app, map[string]any{"display_name": "KITCHEN", "parent": harbor.Id})
	requireFieldRefusal(t, err, "display_name", "A customer named “KITCHEN” already exists here.")
}

// The name is unique among siblings only: a top-level customer and a
// sub-customer of another customer may share it.
func TestCustomer_NameIsCheckedAmongSiblingsOnly(t *testing.T) {
	app := newGuardedApp(t)
	mkCustomer(t, app, "Acme", "")
	harbor := mkCustomer(t, app, "Harborview", "")
	if _, err := newCustomer(app, map[string]any{"display_name": "Acme", "parent": harbor.Id}); err != nil {
		t.Fatalf("a sub-customer named like a top-level customer was refused: %v", err)
	}
}

func TestCustomer_MissingParentIsRefused(t *testing.T) {
	app := newGuardedApp(t)
	_, err := newCustomer(app, map[string]any{"display_name": "Orphan", "parent": "noparent0000001"})
	requireFieldRefusal(t, err, "parent", msgParentMissing)
}

func TestCustomer_ParentMustBeTopLevel(t *testing.T) {
	app := newGuardedApp(t)
	top := mkCustomer(t, app, "Harborview", "")
	sub := mkCustomer(t, app, "Kitchen", top.Id)
	_, err := newCustomer(app, map[string]any{"display_name": "Pantry", "parent": sub.Id})
	requireFieldRefusal(t, err, "parent", msgParentNotTopLevel)
}

func TestCustomer_CannotBeItsOwnParent(t *testing.T) {
	app := newGuardedApp(t)
	r := mkCustomer(t, app, "Harborview", "")
	requireFieldRefusal(t, setCustomer(t, app, r.Id, map[string]any{"parent": r.Id}), "parent", msgParentSelf)
}

func TestCustomer_ACustomerWithSubCustomersGetsNoParent(t *testing.T) {
	app := newGuardedApp(t)
	top := mkCustomer(t, app, "Harborview", "")
	mkCustomer(t, app, "Kitchen", top.Id)
	other := mkCustomer(t, app, "Northwind", "")
	requireFieldRefusal(t, setCustomer(t, app, top.Id, map[string]any{"parent": other.Id}), "parent", msgParentLocked)
}

// mkInactiveCustomer saves a top-level customer, then makes it inactive.
func mkInactiveCustomer(t testing.TB, app core.App, name string) *core.Record {
	t.Helper()
	r := mkCustomer(t, app, name, "")
	if err := setCustomer(t, app, r.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make %q inactive: %v", name, err)
	}
	return r
}

func TestCustomer_ActiveCustomerCannotBeCreatedUnderAnInactiveParent(t *testing.T) {
	app := newGuardedApp(t)
	closed := mkInactiveCustomer(t, app, "Harborview")
	_, err := newCustomer(app, map[string]any{"display_name": "Kitchen", "parent": closed.Id})
	requireFieldRefusal(t, err, "parent", msgParentInactive)
	if msgParentInactive != "The parent customer is inactive." {
		t.Errorf("msgParentInactive = %q", msgParentInactive)
	}
	if n, _ := app.CountRecords("books_customers"); n != 1 {
		t.Errorf("%d customers after the refusal, want 1", n)
	}
}

func TestCustomer_ActiveCustomerCannotMoveUnderAnInactiveParent(t *testing.T) {
	app := newGuardedApp(t)
	closed := mkInactiveCustomer(t, app, "Harborview")
	kitchen := mkCustomer(t, app, "Kitchen", "")
	err := setCustomer(t, app, kitchen.Id, map[string]any{"parent": closed.Id})
	requireFieldRefusal(t, err, "parent", msgParentInactive)
	if got := reload(t, app, "books_customers", kitchen.Id).GetString("parent"); got != "" {
		t.Errorf("parent = %q after the refusal, want none", got)
	}
}

func TestCustomer_InactiveCustomerMayBeCreatedUnderAnInactiveParent(t *testing.T) {
	app := newGuardedApp(t)
	closed := mkInactiveCustomer(t, app, "Harborview")
	if _, err := newCustomer(app, map[string]any{
		"display_name": "Kitchen", "parent": closed.Id, "inactive": true,
	}); err != nil {
		t.Fatalf("an inactive sub-customer under an inactive parent was refused: %v", err)
	}
}

func TestCustomer_MakeActiveWaitsForAnActiveParent(t *testing.T) {
	app := newGuardedApp(t)
	top := mkCustomer(t, app, "Harborview", "")
	kitchen := mkCustomer(t, app, "Kitchen", top.Id)
	if err := setCustomer(t, app, kitchen.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Kitchen inactive: %v", err)
	}
	if err := setCustomer(t, app, top.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Harborview inactive: %v", err)
	}

	err := setCustomer(t, app, kitchen.Id, map[string]any{"inactive": false})
	requireMessageOnlyRefusal(t, err, msgParentActiveFirst)
	if msgParentActiveFirst != "Make the parent customer active first." {
		t.Errorf("msgParentActiveFirst = %q", msgParentActiveFirst)
	}
	if !reload(t, app, "books_customers", kitchen.Id).GetBool("inactive") {
		t.Fatal("Kitchen was made active under an inactive parent")
	}

	if err := setCustomer(t, app, top.Id, map[string]any{"inactive": false}); err != nil {
		t.Fatalf("make Harborview active: %v", err)
	}
	if err := setCustomer(t, app, kitchen.Id, map[string]any{"inactive": false}); err != nil {
		t.Fatalf("make Kitchen active under an active parent: %v", err)
	}
	if reload(t, app, "books_customers", kitchen.Id).GetBool("inactive") {
		t.Fatal("Kitchen is still inactive")
	}
}

func TestCustomer_AddressShapeIsChecked(t *testing.T) {
	bad := map[string]func() map[string]any{
		"an unknown key": func() map[string]any {
			a := validAddress()
			a["county"] = "King"
			return a
		},
		"a non-string value": func() map[string]any {
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
	for _, field := range []string{"billing_address", "shipping_address"} {
		for name, address := range bad {
			t.Run(field+"/"+name, func(t *testing.T) {
				app := newGuardedApp(t)
				_, err := newCustomer(app, map[string]any{"display_name": "Acme", field: address()})
				requireFieldRefusal(t, err, field, msgAddressShape)
			})
		}
	}
}

func TestCustomer_NullAndWellFormedAddressesAreAccepted(t *testing.T) {
	app := newGuardedApp(t)
	if _, err := newCustomer(app, map[string]any{
		"display_name": "Acme", "billing_address": nil, "shipping_address": nil,
	}); err != nil {
		t.Fatalf("null addresses were refused: %v", err)
	}
	if _, err := newCustomer(app, map[string]any{
		"display_name": "Harborview", "billing_address": validAddress(), "shipping_address": validAddress(),
	}); err != nil {
		t.Fatalf("well-formed addresses were refused: %v", err)
	}
}

// An address part is counted in characters (code points), not bytes: 200
// four-byte characters fit, in all six parts of both addresses at once.
func TestCustomer_AddressPartsAreCountedInCharacters(t *testing.T) {
	emoji := func(n int) string { return strings.Repeat("😀", n) }
	full := func() map[string]any {
		a := map[string]any{}
		for _, key := range addressParts {
			a[key] = emoji(200)
		}
		return a
	}
	t.Run("200 in every part is accepted", func(t *testing.T) {
		app := newGuardedApp(t)
		r, err := newCustomer(app, map[string]any{
			"display_name": "Acme", "billing_address": full(), "shipping_address": full(),
		})
		if err != nil {
			t.Fatalf("six parts of 200 emoji were refused: %v", err)
		}
		stored := reload(t, app, "books_customers", r.Id)
		for _, field := range []string{"billing_address", "shipping_address"} {
			var got map[string]string
			if err := stored.UnmarshalJSONField(field, &got); err != nil {
				t.Fatalf("read %s: %v", field, err)
			}
			if got["country"] != emoji(200) {
				t.Errorf("%s country was not stored whole", field)
			}
		}
	})
	for _, field := range []string{"billing_address", "shipping_address"} {
		t.Run(field+"/201 is refused", func(t *testing.T) {
			app := newGuardedApp(t)
			a := validAddress()
			a["city"] = emoji(201)
			_, err := newCustomer(app, map[string]any{"display_name": "Acme", field: a})
			requireFieldRefusal(t, err, field, msgAddressShape)
		})
	}
}

// A sub-customer blocks the delete whether it is active or not; the parent
// deletes once it has none.
func TestCustomer_DeleteIsRefusedWhileSubCustomersExist(t *testing.T) {
	app := newGuardedApp(t)
	top := mkCustomer(t, app, "Harborview", "")
	sub := mkCustomer(t, app, "Kitchen", top.Id)
	requireMessageOnlyRefusal(t, app.Delete(reload(t, app, "books_customers", top.Id)), msgDeleteHasSubs)

	if err := setCustomer(t, app, sub.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make the sub-customer inactive: %v", err)
	}
	requireMessageOnlyRefusal(t, app.Delete(reload(t, app, "books_customers", top.Id)), msgDeleteHasSubs)

	if err := app.Delete(reload(t, app, "books_customers", sub.Id)); err != nil {
		t.Fatalf("delete the sub-customer: %v", err)
	}
	if err := app.Delete(reload(t, app, "books_customers", top.Id)); err != nil {
		t.Fatalf("delete a customer with no sub-customers: %v", err)
	}
}

func TestCustomer_MakeInactiveWaitsForActiveSubCustomers(t *testing.T) {
	app := newGuardedApp(t)
	top := mkCustomer(t, app, "Harborview", "")
	kitchen := mkCustomer(t, app, "Kitchen", top.Id)
	events := mkCustomer(t, app, "Events", top.Id)

	err := setCustomer(t, app, top.Id, map[string]any{"inactive": true})
	requireMessageOnlyRefusal(t, err, "This customer has 2 active sub-customers.")
	if got := activeSubCustomersMessage(2); got != "This customer has 2 active sub-customers." {
		t.Errorf("activeSubCustomersMessage(2) = %q", got)
	}

	if err := setCustomer(t, app, kitchen.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Kitchen inactive: %v", err)
	}
	err = setCustomer(t, app, top.Id, map[string]any{"inactive": true})
	requireMessageOnlyRefusal(t, err, "This customer has 1 active sub-customer.")
	if got := activeSubCustomersMessage(1); got != "This customer has 1 active sub-customer." {
		t.Errorf("activeSubCustomersMessage(1) = %q", got)
	}

	if err := setCustomer(t, app, events.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Events inactive: %v", err)
	}
	if err := setCustomer(t, app, top.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make inactive with every sub-customer inactive: %v", err)
	}
	if !reload(t, app, "books_customers", top.Id).GetBool("inactive") {
		t.Fatal("the customer is still active")
	}
}

// A read-only Books member reads customers and writes none; a user with no
// Books level does not see them. The bookkeeper's create is the positive
// control: the refusals below are the rules, not a broken request.
func TestCustomerRules_ByLevel(t *testing.T) {
	const list = "/api/collections/books_customers/records"
	cases := []struct {
		name    string
		level   Level
		method  string
		url     func(id string) string
		body    string
		want    int
		content []string
	}{
		{"read lists", LevelReadOnly, http.MethodGet, func(string) string { return list }, "", http.StatusOK, []string{`"totalItems":1`}},
		{"read views", LevelReadOnly, http.MethodGet, func(id string) string { return list + "/" + id }, "", http.StatusOK, []string{`"display_name":"Harborview"`}},
		{"read cannot create", LevelReadOnly, http.MethodPost, func(string) string { return list }, `{"display_name":"Acme"}`, http.StatusBadRequest, nil},
		{"read cannot update", LevelReadOnly, http.MethodPatch, func(id string) string { return list + "/" + id }, `{"notes":"x"}`, http.StatusNotFound, nil},
		{"read cannot delete", LevelReadOnly, http.MethodDelete, func(id string) string { return list + "/" + id }, "", http.StatusNotFound, nil},
		{"none cannot list", LevelNone, http.MethodGet, func(string) string { return list }, "", http.StatusOK, []string{`"totalItems":0`}},
		{"bookkeeper creates", LevelBookkeeper, http.MethodPost, func(string) string { return list }, `{"display_name":"Acme"}`, http.StatusOK, []string{`"display_name":"Acme"`}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// The guard bound, as in production: it gives every saved row its
			// name_key, so rows do not collide on the (parent, name_key) index.
			app := newGuardedApp(t)
			users := newLevelUsers(t, app)
			harbor := saveRecord(t, app, "books_customers", map[string]any{"display_name": "Harborview"})
			apiReq{
				method:  tc.method,
				url:     tc.url(harbor.Id),
				token:   tokenFor(t, users.byLevel(tc.level)),
				body:    tc.body,
				want:    tc.want,
				content: tc.content,
				after: func(t testing.TB, app *tests.TestApp) {
					if tc.level != LevelReadOnly {
						return
					}
					after := reload(t, app, "books_customers", harbor.Id)
					if after.GetString("notes") != "" {
						t.Errorf("a read-only user changed the customer: %v", after.PublicExport())
					}
					if n, _ := app.CountRecords("books_customers"); n != 1 {
						t.Errorf("%d customers after a read-only request, want 1", n)
					}
				},
			}.run(t, app)
		})
	}
}

// rawCustomer saves a customer with no hook and no validation, so only the
// schema (the unique index) can refuse it.
func rawCustomer(t testing.TB, app core.App, fields map[string]any) error {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("books_customers")
	if err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(col)
	for k, v := range fields {
		r.Set(k, v)
	}
	return app.SaveNoValidate(r)
}

// The unique index on (parent, name_key) is the backstop for the guard: a
// duplicate key saved with no hook and no validation still cannot land. The
// index is on the key, not the display name, so it is the key that collides.
func TestCustomerSchema_SiblingNameKeysAreUniqueWithoutTheGuard(t *testing.T) {
	t.Run("the same name_key under one parent is refused", func(t *testing.T) {
		app := newBooksApp(t)
		parent := map[string]any{"id": "harborview00001", "display_name": "Harborview", "name_key": "harborview"}
		if err := rawCustomer(t, app, parent); err != nil {
			t.Fatalf("save the parent: %v", err)
		}
		if err := rawCustomer(t, app, map[string]any{
			"display_name": "Kitchen", "parent": "harborview00001", "name_key": "kitchen",
		}); err != nil {
			t.Fatalf("save the first sub-customer: %v", err)
		}
		err := rawCustomer(t, app, map[string]any{
			"display_name": "Pantry", "parent": "harborview00001", "name_key": "kitchen",
		})
		if err == nil {
			t.Fatal("a second sub-customer with name_key kitchen was stored")
		}
		// PocketBase turns a unique index failure into validation errors on the
		// index's columns (validators.NormalizeUniqueIndexError), SaveNoValidate
		// included, so the index shows as name_key coded validation_not_unique.
		var errs validation.Errors
		if !errors.As(err, &errs) {
			t.Fatalf("the duplicate key was refused by %v (%T), not by a unique index", err, err)
		}
		keyErr, ok := errs["name_key"].(validation.Error)
		if !ok || keyErr.Code() != "validation_not_unique" {
			t.Fatalf("the duplicate key was refused by %v, not by a unique index on name_key", err)
		}
	})
	t.Run("the same display name with different keys is accepted", func(t *testing.T) {
		app := newBooksApp(t)
		parent := map[string]any{"id": "harborview00001", "display_name": "Harborview", "name_key": "harborview"}
		if err := rawCustomer(t, app, parent); err != nil {
			t.Fatalf("save the parent: %v", err)
		}
		for _, key := range []string{"kitchen-1", "kitchen-2"} {
			if err := rawCustomer(t, app, map[string]any{
				"display_name": "Kitchen", "parent": "harborview00001", "name_key": key,
			}); err != nil {
				t.Fatalf("a Kitchen with name_key %q was refused: %v", key, err)
			}
		}
		if n, _ := app.CountRecords("books_customers", dbx.HashExp{"parent": "harborview00001"}); n != 2 {
			t.Fatalf("%d sub-customers stored, want 2", n)
		}
	})
}

// "Ärzte" composed (NFC, one U+00C4) and decomposed (NFD, "A" + U+0308) is
// the same name: the guard compares NFC-normalized keys.
func TestCustomer_DuplicateNameIsTheSameHoweverItIsComposed(t *testing.T) {
	app := newGuardedApp(t)
	mkCustomer(t, app, "Ärzte", "")
	_, err := newCustomer(app, map[string]any{"display_name": "  Ärzte "})
	requireFieldRefusal(t, err, "display_name", "A customer named “Ärzte” already exists here.")
	if n, _ := app.CountRecords("books_customers"); n != 1 {
		t.Errorf("%d customers after the refusal, want 1", n)
	}
}

// The stored key is the trimmed name, NFC-normalized and case-folded.
func TestCustomer_NameKeyIsStoredNormalizedAndFolded(t *testing.T) {
	app := newGuardedApp(t)
	r := mkCustomer(t, app, "  Ärzte  ", "")
	if got, want := reload(t, app, "books_customers", r.Id).GetString("name_key"), "ärzte"; got != want {
		t.Fatalf("name_key = %q (% x), want %q (% x)", got, got, want, want)
	}
}

// A write that both moves a sub-customer to another inactive parent and makes
// it active is a move: it is refused on the parent picked, and nothing changes.
func TestCustomer_MoveAndMakeActiveUnderAnInactiveParentIsRefusedOnParent(t *testing.T) {
	app := newGuardedApp(t)
	p1 := mkCustomer(t, app, "Harborview", "")
	p2 := mkCustomer(t, app, "Northwind", "")
	kitchen := mkCustomer(t, app, "Kitchen", p1.Id)
	for _, r := range []*core.Record{kitchen, p1, p2} {
		if err := setCustomer(t, app, r.Id, map[string]any{"inactive": true}); err != nil {
			t.Fatalf("make %s inactive: %v", r.GetString("display_name"), err)
		}
	}

	err := setCustomer(t, app, kitchen.Id, map[string]any{"parent": p2.Id, "inactive": false})
	requireFieldRefusal(t, err, "parent", msgParentInactive)
	stored := reload(t, app, "books_customers", kitchen.Id)
	if got := stored.GetString("parent"); got != p1.Id {
		t.Errorf("parent = %q after the refusal, want %q", got, p1.Id)
	}
	if !stored.GetBool("inactive") {
		t.Error("Kitchen was made active by the refused write")
	}
}

// name_key is the guard's own column: a reader sees the display name, never
// the key, in a view or a list response.
func TestCustomerRules_NameKeyIsHidden(t *testing.T) {
	const list = "/api/collections/books_customers/records"
	for _, path := range []string{"", "/view"} {
		t.Run("read"+path, func(t *testing.T) {
			app := newGuardedApp(t)
			users := newLevelUsers(t, app)
			harbor := mkCustomer(t, app, "Harborview", "")
			if got := reload(t, app, "books_customers", harbor.Id).GetString("name_key"); got != "harborview" {
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
				ExpectedContent:       []string{`"display_name":"Harborview"`},
				NotExpectedContent:    []string{`"name_key"`, `"harborview"`},
				TestAppFactory:        func(testing.TB) *tests.TestApp { return app },
				DisableTestAppCleanup: true,
			}
			scenario.Test(t)
		})
	}
}

// The key is canonical caseless: NFC(cherokeeUpper(Fold(NFD(name)))). NFD
// splits "ǰ" (U+01F0) into "j" + U+030C and orders the dot below before the
// caron, so the fold sees one order, and NFC after the fold keeps the key
// short. Written as ǰ + dot below, or as J + caron + dot below, the name is
// the same.
func TestCustomer_DuplicateNameUsesCanonicalCaselessMatching(t *testing.T) {
	app := newGuardedApp(t)
	const composed = "ǰ̣"
	const decomposedUpper = "J̣̌"
	mkCustomer(t, app, composed, "")
	_, err := newCustomer(app, map[string]any{"display_name": " " + decomposedUpper + " "})
	requireFieldRefusal(t, err, "display_name", "A customer named “"+decomposedUpper+"” already exists here.")
	if n, _ := app.CountRecords("books_customers"); n != 1 {
		t.Errorf("%d customers after the refusal, want 1", n)
	}
}

// A rename runs the sibling check: a sub-customer renamed to a sibling's name
// in another case is refused, and the stored name does not change.
func TestCustomer_RenameToASiblingNameIsRefused(t *testing.T) {
	app := newGuardedApp(t)
	top := mkCustomer(t, app, "Harborview", "")
	kitchen := mkCustomer(t, app, "Kitchen", top.Id)
	mkCustomer(t, app, "Pantry", top.Id)

	err := setCustomer(t, app, kitchen.Id, map[string]any{"display_name": "PANTRY"})
	requireFieldRefusal(t, err, "display_name", "A customer named “PANTRY” already exists here.")
	if got := reload(t, app, "books_customers", kitchen.Id).GetString("display_name"); got != "Kitchen" {
		t.Errorf("display_name = %q after the refusal, want %q", got, "Kitchen")
	}
}

// A move runs the sibling check under the new parent, even when the name
// itself does not change.
func TestCustomer_MoveUnderAParentWithASiblingOfTheSameNameIsRefused(t *testing.T) {
	for _, from := range []string{"top level", "under P1"} {
		t.Run(from, func(t *testing.T) {
			app := newGuardedApp(t)
			p1 := mkCustomer(t, app, "Harborview", "")
			p2 := mkCustomer(t, app, "Northwind", "")
			mkCustomer(t, app, "kitchen", p2.Id)
			parent := ""
			if from == "under P1" {
				parent = p1.Id
			}
			kitchen := mkCustomer(t, app, "Kitchen", parent)

			err := setCustomer(t, app, kitchen.Id, map[string]any{"parent": p2.Id})
			requireFieldRefusal(t, err, "display_name", "A customer named “Kitchen” already exists here.")
			if got := reload(t, app, "books_customers", kitchen.Id).GetString("parent"); got != parent {
				t.Errorf("parent = %q after the refusal, want %q", got, parent)
			}
		})
	}
}

// A customer does not collide with itself: a rename that changes only the
// case keeps the key and the parent, and is stored.
func TestCustomer_RenameThatChangesOnlyTheCaseIsAccepted(t *testing.T) {
	app := newGuardedApp(t)
	acme := mkCustomer(t, app, "Acme", "")
	if err := setCustomer(t, app, acme.Id, map[string]any{"display_name": "ACME"}); err != nil {
		t.Fatalf("renaming Acme to ACME was refused: %v", err)
	}
	if got := reload(t, app, "books_customers", acme.Id).GetString("display_name"); got != "ACME" {
		t.Errorf("display_name = %q, want %q", got, "ACME")
	}
}

// name_key belongs to the guard: whatever a create or an update sends for
// it, the stored key is the folded display name.
func TestCustomer_GuardAlwaysOverwritesNameKey(t *testing.T) {
	app := newGuardedApp(t)
	r, err := newCustomer(app, map[string]any{"display_name": "Harborview", "name_key": "bogus"})
	if err != nil {
		t.Fatalf("save a customer that sent a name_key: %v", err)
	}
	if got := reload(t, app, "books_customers", r.Id).GetString("name_key"); got != "harborview" {
		t.Errorf("name_key after create = %q, want %q", got, "harborview")
	}

	if err := setCustomer(t, app, r.Id, map[string]any{"display_name": "Harborview", "name_key": "bogus"}); err != nil {
		t.Fatalf("update a customer that sent a name_key: %v", err)
	}
	if got := reload(t, app, "books_customers", r.Id).GetString("name_key"); got != "harborview" {
		t.Errorf("name_key after update = %q, want %q", got, "harborview")
	}
}

// CaseFolding.txt folds Cherokee lowercase to uppercase, so an uppercase
// letter and its lowercase are one name whichever is saved first. x/text's
// Fold swaps Cherokee case instead, which gives the two different keys. The
// pairs hold both ends of each lowercase range: U+AB70-U+ABBF (uppercase
// U+13A0-U+13EF) and U+13F8-U+13FD (uppercase U+13F0-U+13F5).
func TestCustomer_DuplicateNameFoldsCherokee(t *testing.T) {
	pairs := [][2]string{
		{"\u13E3", "\uABB3"},
		{"\u13A0", "\uAB70"},
		{"\u13EF", "\uABBF"},
		{"\u13F0", "\u13F8"},
		{"\u13F5", "\u13FD"},
	}
	for _, pair := range pairs {
		upper, lower := pair[0], pair[1]
		for _, order := range [][2]string{{upper, lower}, {lower, upper}} {
			t.Run(fmt.Sprintf("%U then %U", []rune(order[0])[0], []rune(order[1])[0]), func(t *testing.T) {
				app := newGuardedApp(t)
				mkCustomer(t, app, order[0], "")
				_, err := newCustomer(app, map[string]any{"display_name": order[1]})
				requireFieldRefusal(t, err, "display_name", "A customer named \u201C"+order[1]+"\u201D already exists here.")
				if n, _ := app.CountRecords("books_customers"); n != 1 {
					t.Errorf("%d customers after the refusal, want 1", n)
				}
			})
		}
	}
}

// Unicode D145: U+1FBC U+0308 (capital alpha with prosgegrammeni, then a
// diaeresis) folds to alpha + diaeresis + iota only after NFD moves the
// diaeresis next to the alpha; without NFD the fold gives alpha + U+03CA
// (iota with diaeresis). U+0391 U+0308 U+0399 folds to alpha + diaeresis +
// iota, so only the NFD-first key makes the two the same name.
func TestCustomer_DuplicateNameDecomposesBeforeFolding(t *testing.T) {
	app := newGuardedApp(t)
	const prosgegrammeni = "\u1FBC\u0308"
	const capitalIota = "\u0391\u0308\u0399"
	mkCustomer(t, app, prosgegrammeni, "")
	_, err := newCustomer(app, map[string]any{"display_name": capitalIota})
	requireFieldRefusal(t, err, "display_name", "A customer named \u201C"+capitalIota+"\u201D already exists here.")
	if n, _ := app.CountRecords("books_customers"); n != 1 {
		t.Errorf("%d customers after the refusal, want 1", n)
	}
}
