package books

import (
	"net/http"
	"reflect"
	"testing"

	"tinycld.org/core/oauth"
)

// Spec §4.3: the Books scopes treat a sales receipt as an invoice: a token
// reads and writes the receipts and their lines, and only reads the tax lines,
// which posting writes as its snapshot.
func TestOAuth_SalesReceiptsAreScopedAsInvoices(t *testing.T) {
	collections := oauthPackage().Collections
	rw := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	want := map[string]oauth.Access{
		"books_invoices":                rw,
		"books_invoice_lines":           rw,
		"books_invoice_tax_lines":       {Read: []string{scopeRead}},
		"books_sales_receipts":          rw,
		"books_sales_receipt_lines":     rw,
		"books_sales_receipt_tax_lines": {Read: []string{scopeRead}},
	}
	for c, access := range want {
		got, ok := collections[c]
		if !ok {
			t.Errorf("%s has no OAuth entry", c)
			continue
		}
		if !reflect.DeepEqual(got.Read, access.Read) || len(got.Write) != len(access.Write) ||
			(len(access.Write) > 0 && !reflect.DeepEqual(got.Write, access.Write)) {
			t.Errorf("%s OAuth access = %+v, want Read %v and Write %v", c, got, access.Read, access.Write)
		}
	}

	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	for _, c := range []string{"books_sales_receipts", "books_sales_receipt_lines"} {
		path := "/api/collections/" + c + "/records"
		if !oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeWrite}) {
			t.Errorf("POST %s: books:write must write", path)
		}
		if oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("POST %s: books:read alone must not write", path)
		}
	}
	taxLines := "/api/collections/books_sales_receipt_tax_lines/records"
	if !oauth.ScopeForRoute(http.MethodGet, taxLines).SatisfiedBy([]string{scopeRead}) {
		t.Errorf("GET %s: books:read must read", taxLines)
	}
	if oauth.ScopeForRoute(http.MethodPost, taxLines).SatisfiedBy([]string{scopeRead, scopeWrite}) {
		t.Errorf("POST %s: no Books scope may write", taxLines)
	}
}

// Receive payment spec §4.3: a token reads and writes payments and their
// applications.
func TestOAuth_PaymentsAreReadWrite(t *testing.T) {
	collections := oauthPackage().Collections
	rw := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	for _, c := range []string{"books_payments", "books_payment_applications"} {
		got, ok := collections[c]
		if !ok {
			t.Errorf("%s has no OAuth entry", c)
			continue
		}
		if !reflect.DeepEqual(got.Read, rw.Read) || !reflect.DeepEqual(got.Write, rw.Write) {
			t.Errorf("%s OAuth access = %+v, want Read %v and Write %v", c, got, rw.Read, rw.Write)
		}
	}

	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	for _, c := range []string{"books_payments", "books_payment_applications"} {
		path := "/api/collections/" + c + "/records"
		if !oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeWrite}) {
			t.Errorf("POST %s: books:write must write", path)
		}
		if oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("POST %s: books:read alone must not write", path)
		}
		if !oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("GET %s: books:read must read", path)
		}
	}
}

// Spec §4 (customer pages): a token reads and writes a customer's contact
// people, and only reads the balances view, which has no write path.
func TestOAuth_PartyContactsAndBalances(t *testing.T) {
	collections := oauthPackage().Collections
	want := map[string]oauth.Access{
		"books_party_contacts": {Read: []string{scopeRead}, Write: []string{scopeWrite}},
		"books_party_balances": {Read: []string{scopeRead}},
	}
	for c, access := range want {
		got, ok := collections[c]
		if !ok {
			t.Errorf("%s has no OAuth entry", c)
			continue
		}
		if !reflect.DeepEqual(got.Read, access.Read) || len(got.Write) != len(access.Write) ||
			(len(access.Write) > 0 && !reflect.DeepEqual(got.Write, access.Write)) {
			t.Errorf("%s OAuth access = %+v, want Read %v and Write %v", c, got, access.Read, access.Write)
		}
	}

	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	contacts := "/api/collections/books_party_contacts/records"
	if !oauth.ScopeForRoute(http.MethodGet, contacts).SatisfiedBy([]string{scopeRead}) {
		t.Errorf("GET %s: books:read must read", contacts)
	}
	if !oauth.ScopeForRoute(http.MethodPost, contacts).SatisfiedBy([]string{scopeWrite}) {
		t.Errorf("POST %s: books:write must write", contacts)
	}
	if oauth.ScopeForRoute(http.MethodPost, contacts).SatisfiedBy([]string{scopeRead}) {
		t.Errorf("POST %s: books:read alone must not write", contacts)
	}
	balances := "/api/collections/books_party_balances/records"
	if !oauth.ScopeForRoute(http.MethodGet, balances).SatisfiedBy([]string{scopeRead}) {
		t.Errorf("GET %s: books:read must read", balances)
	}
}

// Spec §4.3: a token only reads the public view (nothing writes a view), and
// reads and writes the customers' responses. The public PDF route is not in
// the registration.
func TestOAuth_EstimatePublicLinkCollections(t *testing.T) {
	collections := oauthPackage().Collections
	want := map[string]oauth.Access{
		"books_estimate_public":    {Read: []string{scopeRead}},
		"books_estimate_responses": {Read: []string{scopeRead}, Write: []string{scopeWrite}},
	}
	for c, access := range want {
		got, ok := collections[c]
		if !ok {
			t.Errorf("%s has no OAuth entry", c)
			continue
		}
		if !reflect.DeepEqual(got.Read, access.Read) || len(got.Write) != len(access.Write) ||
			(len(access.Write) > 0 && !reflect.DeepEqual(got.Write, access.Write)) {
			t.Errorf("%s OAuth access = %+v, want Read %v and Write %v", c, got, access.Read, access.Write)
		}
	}

	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	both := []string{scopeRead, scopeWrite}
	view := "/api/collections/books_estimate_public/records"
	if !oauth.ScopeForRoute(http.MethodGet, view).SatisfiedBy([]string{scopeRead}) {
		t.Errorf("GET %s: books:read must read", view)
	}
	if oauth.ScopeForRoute(http.MethodPost, view).SatisfiedBy(both) {
		t.Errorf("POST %s: no Books scope may write the view", view)
	}
	responses := "/api/collections/books_estimate_responses/records"
	if !oauth.ScopeForRoute(http.MethodPost, responses).SatisfiedBy([]string{scopeWrite}) {
		t.Errorf("POST %s: books:write must write", responses)
	}
	if oauth.ScopeForRoute(http.MethodPost, responses).SatisfiedBy([]string{scopeRead}) {
		t.Errorf("POST %s: books:read alone must not write", responses)
	}
	if oauth.ScopeForRoute(http.MethodGet, "/api/books/public/estimates/abc/pdf").SatisfiedBy(both) {
		t.Error("the public PDF route must not be in the OAuth registration")
	}

	// TestOAuth_CoversEveryBooksCollection walks what exists; this pins that
	// both collections exist for it to cover.
	app := newBooksApp(t)
	for c := range want {
		if _, err := app.FindCollectionByNameOrId(c); err != nil {
			t.Errorf("collection %s does not exist: %v", c, err)
		}
	}
}

// Spec §3.10: the Books scopes read and write the bills and their lines, as
// the invoice's.
func TestOAuth_BillsAreReadWrite(t *testing.T) {
	collections := oauthPackage().Collections
	rw := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	for _, c := range []string{"books_bills", "books_bill_lines"} {
		got, ok := collections[c]
		if !ok {
			t.Errorf("%s has no OAuth entry", c)
			continue
		}
		if !reflect.DeepEqual(got.Read, rw.Read) || !reflect.DeepEqual(got.Write, rw.Write) {
			t.Errorf("%s OAuth access = %+v, want Read %v and Write %v", c, got, rw.Read, rw.Write)
		}
	}

	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	for _, c := range []string{"books_bills", "books_bill_lines"} {
		path := "/api/collections/" + c + "/records"
		if !oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("GET %s: books:read must read", path)
		}
		if !oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeWrite}) {
			t.Errorf("POST %s: books:write must write", path)
		}
		if oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("POST %s: books:read alone must not write", path)
		}
	}
}

// Spec §3.11: the Books scopes read and write the expenses and their lines,
// as the bill's.
func TestOAuth_ExpensesAreReadWrite(t *testing.T) {
	collections := oauthPackage().Collections
	rw := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	for _, c := range []string{"books_expenses", "books_expense_lines"} {
		got, ok := collections[c]
		if !ok {
			t.Errorf("%s has no OAuth entry", c)
			continue
		}
		if !reflect.DeepEqual(got.Read, rw.Read) || !reflect.DeepEqual(got.Write, rw.Write) {
			t.Errorf("%s OAuth access = %+v, want Read %v and Write %v", c, got, rw.Read, rw.Write)
		}
	}

	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	for _, c := range []string{"books_expenses", "books_expense_lines"} {
		path := "/api/collections/" + c + "/records"
		if !oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("GET %s: books:read must read", path)
		}
		if !oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeWrite}) {
			t.Errorf("POST %s: books:write must write", path)
		}
		if oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("POST %s: books:read alone must not write", path)
		}
	}
}

// Spec §3.9: books_attachments joins the Books scope, read for read, write
// for write.
func TestOAuth_AttachmentsAreReadWrite(t *testing.T) {
	got, ok := oauthPackage().Collections["books_attachments"]
	if !ok {
		t.Fatal("books_attachments has no OAuth entry")
	}
	if !reflect.DeepEqual(got.Read, []string{scopeRead}) || !reflect.DeepEqual(got.Write, []string{scopeWrite}) {
		t.Errorf("books_attachments OAuth access = %+v, want Read [%s] and Write [%s]", got, scopeRead, scopeWrite)
	}

	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	path := "/api/collections/books_attachments/records"
	if !oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy([]string{scopeRead}) {
		t.Errorf("GET %s: books:read must read", path)
	}
	for _, method := range []string{http.MethodPost, http.MethodDelete} {
		p := path
		if method == http.MethodDelete {
			p += "/abc123"
		}
		if !oauth.ScopeForRoute(method, p).SatisfiedBy([]string{scopeWrite}) {
			t.Errorf("%s %s: books:write must write", method, p)
		}
		if oauth.ScopeForRoute(method, p).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("%s %s: books:read alone must not write", method, p)
		}
	}
}

// Spec §3.11: the Books scopes read and write the estimates and their lines.
func TestOAuth_EstimatesAreReadWrite(t *testing.T) {
	collections := oauthPackage().Collections
	rw := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	for _, c := range []string{"books_estimates", "books_estimate_lines"} {
		got, ok := collections[c]
		if !ok {
			t.Errorf("%s has no OAuth entry", c)
			continue
		}
		if !reflect.DeepEqual(got.Read, rw.Read) || !reflect.DeepEqual(got.Write, rw.Write) {
			t.Errorf("%s OAuth access = %+v, want Read %v and Write %v", c, got, rw.Read, rw.Write)
		}
	}

	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	for _, c := range []string{"books_estimates", "books_estimate_lines"} {
		path := "/api/collections/" + c + "/records"
		if !oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("GET %s: books:read must read", path)
		}
		if !oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeWrite}) {
			t.Errorf("POST %s: books:write must write", path)
		}
		if oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("POST %s: books:read alone must not write", path)
		}
	}
}
