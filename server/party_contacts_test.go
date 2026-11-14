package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// The books_party_contacts guards (spec §4), through the records API as the
// client writes. The refusal texts are written out here, not read from the
// consts, so a change of wording fails this file too.
const (
	wantContactOneParty     = "A contact belongs to exactly one customer or vendor."
	wantContactPartyMissing = "That customer or vendor no longer exists."
	contactsURL             = "/api/collections/books_party_contacts/records"
)

func messageOf(msg string) []string {
	return []string{fmt.Sprintf(`"message":%q`, msg)}
}

func mkContact(t testing.TB, app core.App, fields map[string]any) *core.Record {
	t.Helper()
	return saveRecord(t, app, "books_party_contacts", fields)
}

func contactCount(t testing.TB, app core.App) int64 {
	t.Helper()
	n, err := app.CountRecords("books_party_contacts")
	if err != nil {
		t.Fatalf("count contacts: %v", err)
	}
	return n
}

func isPrimary(t testing.TB, app core.App, id string) bool {
	t.Helper()
	return reload(t, app, "books_party_contacts", id).GetBool("is_primary")
}

func TestPartyContacts_RefusesAContactWithoutExactlyOneParty(t *testing.T) {
	cases := []struct {
		name string
		body func(customer, vendor string) string
		want string
	}{
		{"both a customer and a vendor", func(c, v string) string {
			return fmt.Sprintf(`{"name":"Dana Whitfield","customer":%q,"vendor":%q}`, c, v)
		}, wantContactOneParty},
		{"neither a customer nor a vendor", func(string, string) string {
			return `{"name":"Dana Whitfield"}`
		}, wantContactOneParty},
		{"a customer that does not exist", func(string, string) string {
			return `{"name":"Dana Whitfield","customer":"zzzzzzzzzzzzzzz"}`
		}, wantContactPartyMissing},
		{"a vendor that does not exist", func(string, string) string {
			return `{"name":"Dana Whitfield","vendor":"zzzzzzzzzzzzzzz"}`
		}, wantContactPartyMissing},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newGuardedApp(t)
			users := newLevelUsers(t, app)
			cust := mkCustomer(t, app, "Harborview", "")
			vend := mkVendor(t, app, "Summit IT Services")
			apiReq{
				method:  http.MethodPost,
				url:     contactsURL,
				token:   tokenFor(t, users.bookkeeper),
				body:    tc.body(cust.Id, vend.Id),
				want:    http.StatusBadRequest,
				content: messageOf(tc.want),
				after: func(t testing.TB, app *tests.TestApp) {
					if n := contactCount(t, app); n != 0 {
						t.Errorf("%d contacts after a refused create, want 0", n)
					}
				},
			}.run(t, app)
		})
	}
}

// Creating a primary contact clears the flag on the customer's other contacts,
// and on no other customer's.
func TestPartyContacts_NewPrimaryClearsTheOldOne(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	harbor := mkCustomer(t, app, "Harborview", "")
	northwind := mkCustomer(t, app, "Northwind Traders", "")
	dana := mkContact(t, app, map[string]any{"customer": harbor.Id, "name": "Dana Whitfield", "is_primary": true})
	priya := mkContact(t, app, map[string]any{"customer": northwind.Id, "name": "Priya Raman", "is_primary": true})

	apiReq{
		method:  http.MethodPost,
		url:     contactsURL,
		token:   tokenFor(t, users.bookkeeper),
		body:    fmt.Sprintf(`{"name":"Kim Tran","customer":%q,"is_primary":true}`, harbor.Id),
		want:    http.StatusOK,
		content: []string{`"name":"Kim Tran"`},
		after: func(t testing.TB, app *tests.TestApp) {
			kim, err := app.FindFirstRecordByFilter("books_party_contacts", "name = {:n}", dbx.Params{"n": "Kim Tran"})
			if err != nil {
				t.Fatalf("find the new contact: %v", err)
			}
			if !kim.GetBool("is_primary") {
				t.Errorf("the new contact is not primary")
			}
			if isPrimary(t, app, dana.Id) {
				t.Errorf("the old primary of the same customer is still primary")
			}
			if !isPrimary(t, app, priya.Id) {
				t.Errorf("another customer's primary was cleared")
			}
		},
	}.run(t, app)
}

func TestPartyContacts_UpdateToPrimaryClearsTheOldOne(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	harbor := mkCustomer(t, app, "Harborview", "")
	northwind := mkCustomer(t, app, "Northwind Traders", "")
	dana := mkContact(t, app, map[string]any{"customer": harbor.Id, "name": "Dana Whitfield", "is_primary": true})
	kim := mkContact(t, app, map[string]any{"customer": harbor.Id, "name": "Kim Tran"})
	priya := mkContact(t, app, map[string]any{"customer": northwind.Id, "name": "Priya Raman", "is_primary": true})

	apiReq{
		method:  http.MethodPatch,
		url:     contactsURL + "/" + kim.Id,
		token:   tokenFor(t, users.bookkeeper),
		body:    `{"is_primary":true}`,
		want:    http.StatusOK,
		content: []string{`"is_primary":true`},
		after: func(t testing.TB, app *tests.TestApp) {
			if !isPrimary(t, app, kim.Id) {
				t.Errorf("the updated contact is not primary")
			}
			if isPrimary(t, app, dana.Id) {
				t.Errorf("the old primary of the same customer is still primary")
			}
			if !isPrimary(t, app, priya.Id) {
				t.Errorf("another customer's primary was cleared")
			}
		},
	}.run(t, app)
}

func TestPartyContacts_ReaderCannotCreate(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	harbor := mkCustomer(t, app, "Harborview", "")
	apiReq{
		method: http.MethodPost,
		url:    contactsURL,
		token:  tokenFor(t, users.readOnly),
		body:   fmt.Sprintf(`{"name":"Dana Whitfield","customer":%q}`, harbor.Id),
		want:   http.StatusBadRequest,
		after: func(t testing.TB, app *tests.TestApp) {
			if _, err := app.FindCollectionByNameOrId("books_party_contacts"); err != nil {
				t.Fatalf("find books_party_contacts: %v", err)
			}
			if n := contactCount(t, app); n != 0 {
				t.Errorf("%d contacts after a reader's create, want 0", n)
			}
		},
	}.run(t, app)
}

func TestPartyContacts_DeletingTheCustomerDeletesItsContacts(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	harbor := mkCustomer(t, app, "Harborview", "")
	northwind := mkCustomer(t, app, "Northwind Traders", "")
	mkContact(t, app, map[string]any{"customer": harbor.Id, "name": "Dana Whitfield", "is_primary": true})
	mkContact(t, app, map[string]any{"customer": harbor.Id, "name": "Kim Tran"})
	priya := mkContact(t, app, map[string]any{"customer": northwind.Id, "name": "Priya Raman"})

	apiReq{
		method: http.MethodDelete,
		url:    "/api/collections/books_customers/records/" + harbor.Id,
		token:  tokenFor(t, users.bookkeeper),
		want:   http.StatusNoContent,
		after: func(t testing.TB, app *tests.TestApp) {
			n, err := app.CountRecords("books_party_contacts", dbx.HashExp{"customer": harbor.Id})
			if err != nil {
				t.Fatal(err)
			}
			if n != 0 {
				t.Errorf("%d contacts of the deleted customer remain, want 0", n)
			}
			if _, err := app.FindRecordById("books_party_contacts", priya.Id); err != nil {
				t.Errorf("another customer's contact is gone: %v", err)
			}
		},
	}.run(t, app)
}
