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
