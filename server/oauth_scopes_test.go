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
