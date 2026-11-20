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

// Refund receipt spec §4.3: a token reads and writes the refund receipts and
// their lines, and only reads the tax lines, the credits rows and the
// sale-lines view, which the server writes or derives.
func TestOAuth_RefundReceiptsAreScopedAsSalesReceipts(t *testing.T) {
	collections := oauthPackage().Collections
	rw := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	ro := oauth.Access{Read: []string{scopeRead}}
	want := map[string]oauth.Access{
		"books_refund_receipts":           rw,
		"books_refund_receipt_lines":      rw,
		"books_refund_receipt_tax_lines":  ro,
		"books_refund_receipt_credits":    ro,
		"books_refund_receipt_sale_lines": ro,
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
	for _, c := range []string{"books_refund_receipts", "books_refund_receipt_lines"} {
		path := "/api/collections/" + c + "/records"
		if !oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeWrite}) {
			t.Errorf("POST %s: books:write must write", path)
		}
	}
	for _, c := range []string{"books_refund_receipt_tax_lines", "books_refund_receipt_credits", "books_refund_receipt_sale_lines"} {
		path := "/api/collections/" + c + "/records"
		if !oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("GET %s: books:read must read", path)
		}
		if oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeRead, scopeWrite}) {
			t.Errorf("POST %s: no Books scope may write", path)
		}
	}
}

// Credit memo spec §4.3: a token reads and writes the credit memos and their
// lines, and only reads the tax lines, which posting writes as its snapshot.
func TestOAuth_CreditMemosAreScopedAsInvoices(t *testing.T) {
	collections := oauthPackage().Collections
	rw := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	want := map[string]oauth.Access{
		"books_credit_memos":          rw,
		"books_credit_memo_lines":     rw,
		"books_credit_memo_tax_lines": {Read: []string{scopeRead}},
		// Apply credit spec §4.3: the applications are read and written as the
		// vendor credit's are.
		"books_credit_memo_applications": rw,
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
	for _, c := range []string{"books_credit_memos", "books_credit_memo_lines", "books_credit_memo_applications"} {
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
	taxLines := "/api/collections/books_credit_memo_tax_lines/records"
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

// Pay-bills spec §4.1: a token reads and writes bill payments and their lines,
// and only reads the cash-basis rows, which Books alone writes.
func TestOAuth_BillPaymentsAreReadWriteAndCashBasisIsReadOnly(t *testing.T) {
	collections := oauthPackage().Collections
	rw := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	for _, c := range []string{"books_bill_payments", "books_bill_payment_lines"} {
		got, ok := collections[c]
		if !ok {
			t.Errorf("%s has no OAuth entry", c)
			continue
		}
		if !reflect.DeepEqual(got.Read, rw.Read) || !reflect.DeepEqual(got.Write, rw.Write) {
			t.Errorf("%s OAuth access = %+v, want Read %v and Write %v", c, got, rw.Read, rw.Write)
		}
	}
	for _, c := range []string{"books_cash_basis_lines", "books_cash_basis_tax_lines"} {
		got, ok := collections[c]
		if !ok {
			t.Errorf("%s has no OAuth entry", c)
			continue
		}
		if !reflect.DeepEqual(got.Read, []string{scopeRead}) || len(got.Write) != 0 {
			t.Errorf("%s OAuth access = %+v, want Read [%s] and no Write", c, got, scopeRead)
		}
	}

	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	for _, c := range []string{"books_bill_payments", "books_bill_payment_lines"} {
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
	for _, c := range []string{"books_cash_basis_lines", "books_cash_basis_tax_lines"} {
		path := "/api/collections/" + c + "/records"
		if !oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("GET %s: books:read must read", path)
		}
		if oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeRead, scopeWrite}) {
			t.Errorf("POST %s: no Books scope may write", path)
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

// Bank-match spec §4: a token makes and undoes a match (books_bank_matches),
// and only reads the match lines, which the match hook writes, and the
// suggestion view.
func TestOAuth_BankMatchCollections(t *testing.T) {
	collections := oauthPackage().Collections
	rw := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	ro := oauth.Access{Read: []string{scopeRead}}
	want := map[string]oauth.Access{
		"books_bank_matches":           rw,
		"books_bank_match_lines":       ro,
		"books_bank_match_suggestions": ro,
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
	matches := "/api/collections/books_bank_matches/records"
	for _, method := range []string{http.MethodPost, http.MethodDelete} {
		p := matches
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
	for _, c := range []string{"books_bank_match_lines", "books_bank_match_suggestions"} {
		path := "/api/collections/" + c + "/records"
		if !oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("GET %s: books:read must read", path)
		}
		if oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeRead, scopeWrite}) {
			t.Errorf("POST %s: no Books scope may write", path)
		}
	}
}

// A/R Aging spec §4: a token only reads the stored receivable items, which
// only Books writes. The two views they replaced have no entry.
func TestOAuth_ReceivableItems(t *testing.T) {
	collections := oauthPackage().Collections
	got, ok := collections[receivableItemsCollection]
	if !ok {
		t.Fatalf("%s has no OAuth entry", receivableItemsCollection)
	}
	if !reflect.DeepEqual(got.Read, []string{scopeRead}) || len(got.Write) != 0 {
		t.Errorf("%s OAuth access = %+v, want Read [%s] and no Write", receivableItemsCollection, got, scopeRead)
	}
	for _, gone := range []string{"books_receivable_lines", "books_receivable_applications"} {
		if _, ok := collections[gone]; ok {
			t.Errorf("%s still has an OAuth entry; the view is gone", gone)
		}
	}

	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	path := "/api/collections/" + receivableItemsCollection + "/records"
	if !oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy([]string{scopeRead}) {
		t.Errorf("GET %s: books:read must read", path)
	}
	if oauth.ScopeForRoute(http.MethodPatch, path+"/x").SatisfiedBy([]string{scopeRead}) {
		t.Errorf("PATCH %s/x: books:read must not write", path)
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

// Spec §5: a token reads the audit log view under the Books read scope, and no
// Books scope writes it.
func TestOAuth_AuditLogIsReadOnly(t *testing.T) {
	got, ok := oauthPackage().Collections["books_audit_log"]
	if !ok {
		t.Fatal("books_audit_log has no OAuth entry")
	}
	if !reflect.DeepEqual(got.Read, []string{scopeRead}) || len(got.Write) != 0 {
		t.Errorf("books_audit_log OAuth access = %+v, want Read [%s] and no Write", got, scopeRead)
	}

	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	path := "/api/collections/books_audit_log/records"
	if !oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy([]string{scopeRead}) {
		t.Errorf("GET %s: books:read must read", path)
	}
	for method, route := range map[string]string{
		http.MethodPost:   path,
		http.MethodPatch:  path + "/auditlog0000001",
		http.MethodDelete: path + "/auditlog0000001",
	} {
		if oauth.ScopeForRoute(method, route).SatisfiedBy([]string{scopeRead, scopeWrite}) {
			t.Errorf("%s %s: no Books scope may write the view", method, route)
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

// Vendor credit spec §4: the Books scopes read and write the vendor credits,
// their lines and their applications, as the bill's.
func TestOAuth_VendorCreditsAreReadWrite(t *testing.T) {
	collections := oauthPackage().Collections
	rw := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	// Vendor refund spec §3.11: the vendor refunds and their lines, the same way.
	vendorCredits := []string{
		"books_vendor_credits", "books_vendor_credit_lines", "books_vendor_credit_applications",
		"books_vendor_refunds", "books_vendor_refund_lines",
	}
	for _, c := range vendorCredits {
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
	for _, c := range vendorCredits {
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

// Write-off spec §4.3: a token reads the write-offs with books:read and makes
// or voids one with books:write.
func TestOAuth_WriteOffsAreReadWrite(t *testing.T) {
	got, ok := oauthPackage().Collections["books_write_offs"]
	if !ok {
		t.Fatal("books_write_offs has no OAuth entry")
	}
	if !reflect.DeepEqual(got.Read, []string{scopeRead}) || !reflect.DeepEqual(got.Write, []string{scopeWrite}) {
		t.Errorf("books_write_offs OAuth access = %+v, want Read %v and Write %v", got, []string{scopeRead}, []string{scopeWrite})
	}

	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	path := "/api/collections/books_write_offs/records"
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

// Statements spec §4.2: a token reads the statements with books:read and
// creates or deletes one with books:write.
func TestOAuth_StatementsAreReadWrite(t *testing.T) {
	got, ok := oauthPackage().Collections[statementsCollection]
	if !ok {
		t.Fatalf("%s has no OAuth entry", statementsCollection)
	}
	if !reflect.DeepEqual(got.Read, []string{scopeRead}) || !reflect.DeepEqual(got.Write, []string{scopeWrite}) {
		t.Errorf("%s OAuth access = %+v, want Read [%s] and Write [%s]", statementsCollection, got, scopeRead, scopeWrite)
	}

	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	path := "/api/collections/" + statementsCollection + "/records"
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
