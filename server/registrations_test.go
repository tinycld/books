package books

import (
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/changesignal"
	"tinycld.org/core/oauth"
	"tinycld.org/core/offboard"
	"tinycld.org/core/quota"
	"tinycld.org/core/rlstest"
	"tinycld.org/core/search"
)

// serverOnly are the collections only Go writes. The balance rows are derived
// from the ledger; a bank file's parsed rows are written by the upload hook, and
// the import row that made the transactions is audited. A writer changes a
// transaction's status, so the transactions are audited, not server-only. An
// invoice's or a sales receipt's tax lines are its posting snapshot, written with
// the audited document.
var serverOnly = map[string]bool{
	"books_account_balances":        true,
	"books_bank_file_contents":      true,
	"books_invoice_tax_lines":       true,
	"books_sales_receipt_tax_lines": true,
}

func booksCollections(t testing.TB, app core.App, kinds ...string) []*core.Collection {
	t.Helper()
	cols, err := app.FindAllCollections(kinds...)
	if err != nil {
		t.Fatal(err)
	}
	var out []*core.Collection
	for _, c := range cols {
		if strings.HasPrefix(c.Name, "books_") {
			out = append(out, c)
		}
	}
	return out
}

// resetRegistries clears what Register adds to core's process-wide
// registries, so one test's registration does not leak into the next.
func resetRegistries(t testing.TB) {
	t.Helper()
	t.Cleanup(oauth.ResetRegistry)
	t.Cleanup(search.ResetSources)
	t.Cleanup(offboard.ResetHandlersForTesting)
	t.Cleanup(quota.ResetSourcesForTesting)
	t.Cleanup(changesignal.ResetForTesting)
}

// newRegisteredApp is a migrated app wired by Register, as production wires
// it, instead of by the parts a unit test binds one by one.
func newRegisteredApp(t testing.TB) (*tests.TestApp, *pocketbase.PocketBase) {
	t.Helper()
	resetRegistries(t)
	app := newBooksApp(t)
	pb := &pocketbase.PocketBase{App: app}
	Register(pb)
	return app, pb
}

func TestAudit_CoversEveryCollectionPeopleWrite(t *testing.T) {
	app := newBooksApp(t)
	audited := auditedCollections(app)
	for _, c := range booksCollections(t, app, core.CollectionTypeBase) {
		if _, ok := audited[c.Name]; !ok && !serverOnly[c.Name] {
			t.Errorf("%s is neither audited nor listed as server-only", c.Name)
		}
	}
	for name := range audited {
		if _, err := app.FindCollectionByNameOrId(name); err != nil {
			t.Errorf("audited collection %s does not exist", name)
		}
	}
}

// An audit row's label is what a person reads in the log, so it must name the
// thing: the granted user rather than their id, and a line's account and
// amount rather than its memo, which is usually empty.
func TestAudit_LabelsNameWhatChanged(t *testing.T) {
	env := newLedgerEnv(t)
	audited := auditedCollections(env.app)
	label := func(collection string, r *core.Record) string {
		t.Helper()
		return audited[collection].ExtractLabel(r)
	}

	grantee := mkUser(t, env.app, "member")
	grant := saveRecord(t, env.app, "books_admins", map[string]any{"user": grantee.Id})
	if got, want := label("books_admins", grant), "Books member <"+grantee.Email()+">"; got != want {
		t.Errorf("admin grant label = %q, want %q", got, want)
	}

	numbered := mkAccount(t, env.app, "Petty Cash", "bank", "cash_on_hand")
	numbered.Set("number", "1010")
	if err := env.app.Save(numbered); err != nil {
		t.Fatal(err)
	}
	entry := mkDraft(t, env.app, "2026-05-10", ln{numbered, 2550, 0}, ln{env.revenue, 0, 2550})
	lines, err := entryLines(env.app, entry.Id)
	if err != nil || len(lines) != 2 {
		t.Fatalf("lines %v, err %v", lines, err)
	}
	if got, want := label("books_journal_lines", lines[0]), "1010:Petty Cash debit 25.50"; got != want {
		t.Errorf("debit line label = %q, want %q", got, want)
	}
	if got, want := label("books_journal_lines", lines[1]), "Consulting Income credit 25.50"; got != want {
		t.Errorf("credit line label = %q, want %q", got, want)
	}
}

// A customer's audit row names it as people know it: by its display name.
func TestAudit_LabelsACustomerByDisplayName(t *testing.T) {
	app := newBooksApp(t)
	config, ok := auditedCollections(app)["books_customers"]
	if !ok {
		t.Fatal("books_customers is not audited")
	}
	customer := saveRecord(t, app, "books_customers", map[string]any{
		"display_name": "Harborview Hospitality Group", "company": "Harborview Hospitality Group LLC",
	})
	if got, want := config.ExtractLabel(customer), "Harborview Hospitality Group"; got != want {
		t.Errorf("customer label = %q, want %q", got, want)
	}
}

// A vendor's audit row names it as people know it: by its display name.
func TestAudit_LabelsAVendorByDisplayName(t *testing.T) {
	app := newBooksApp(t)
	config, ok := auditedCollections(app)["books_vendors"]
	if !ok {
		t.Fatal("books_vendors is not audited")
	}
	vendor := saveRecord(t, app, "books_vendors", map[string]any{
		"display_name": "Office Supply World", "company": "Office Supply World Inc.",
	})
	if got, want := config.ExtractLabel(vendor), "Office Supply World"; got != want {
		t.Errorf("vendor label = %q, want %q", got, want)
	}
}

// A product's audit row names it by its name; a bundle row names its bundle
// and its product, since the row itself holds only two ids and a quantity.
func TestAudit_LabelsAProductAndABundleItem(t *testing.T) {
	app := newBooksApp(t)
	audited := auditedCollections(app)
	products, ok := audited["books_products"]
	if !ok {
		t.Fatal("books_products is not audited")
	}
	items, ok := audited["books_bundle_items"]
	if !ok {
		t.Fatal("books_bundle_items is not audited")
	}
	ap := saveRecord(t, app, "books_products", map[string]any{
		"type": "non_inventory", "name": "Wireless access point", "sku": "HW-WAP-6E",
		"currency": "USD", "name_key": "wireless access point",
	})
	kit := saveRecord(t, app, "books_products", map[string]any{
		"type": "bundle", "name": "Home office setup kit", "currency": "USD", "name_key": "home office setup kit",
	})
	row := saveRecord(t, app, "books_bundle_items", map[string]any{
		"bundle": kit.Id, "product": ap.Id, "quantity": 2, "position": 0,
	})
	if got, want := products.ExtractLabel(ap), "Wireless access point"; got != want {
		t.Errorf("product label = %q, want %q", got, want)
	}
	if got, want := items.ExtractLabel(row), "Home office setup kit: Wireless access point"; got != want {
		t.Errorf("bundle item label = %q, want %q", got, want)
	}
}

// A connection's row holds only an account id, so its audit row names the
// account as people know it ("1000 Business Checking"); a bank file is named
// by its file name.
func TestAudit_LabelsBankRecords(t *testing.T) {
	app := newBooksApp(t)
	audited := auditedCollections(app)
	connections, ok := audited["books_bank_connections"]
	if !ok {
		t.Fatal("books_bank_connections is not audited")
	}
	files, ok := audited["books_bank_files"]
	if !ok {
		t.Fatal("books_bank_files is not audited")
	}
	checking := saveRecord(t, app, "books_accounts", map[string]any{
		"name": "Business Checking", "number": "1000", "type": "bank", "detail_type": "checking", "currency": "USD",
	})
	connection := saveRecord(t, app, "books_bank_connections", map[string]any{"account": checking.Id})
	if got, want := connections.ExtractLabel(connection), "1000 Business Checking"; got != want {
		t.Errorf("connection label = %q, want %q", got, want)
	}
	file := mustSaveBankFile(t, app, connection.Id, "checking-2026-09.csv", sha256Hex([]byte(bankCSV)), "uploaded")
	if got, want := files.ExtractLabel(file), "checking-2026-09.csv"; got != want {
		t.Errorf("bank file label = %q, want %q", got, want)
	}
	txns, ok := audited["books_bank_transactions"]
	if !ok {
		t.Fatal("books_bank_transactions is not audited")
	}
	bankImport := saveRecord(t, app, "books_bank_imports", map[string]any{"file": file.Id, "lines": []int{2}})
	txn := saveRecord(t, app, "books_bank_transactions", map[string]any{
		"connection": connection.Id, "file": file.Id, "bank_import": bankImport.Id, "line": 2,
		"date": "2026-10-27", "description": "CHECK 1050", "amount": -36240,
		"dedupe_hash": strings.Repeat("c", 64), "status": "for_review",
	})
	if got, want := txns.ExtractLabel(txn), "2026-10-27 CHECK 1050"; got != want {
		t.Errorf("bank transaction label = %q, want %q", got, want)
	}
}

// waitFor polls an asynchronous write: core writes audit rows off the request
// goroutine, so a row lands just after the response.
func waitFor(t testing.TB, done func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !done() {
		if time.Now().After(deadline) {
			t.Fatal("condition not met within 5s")
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestAudit_LogsAnAccountCreate(t *testing.T) {
	app := newBooksApp(t)
	registerLedger(app)
	registerAudit(&pocketbase.PocketBase{App: app})
	users := newLevelUsers(t, app)
	apiReq{
		method: http.MethodPost,
		url:    "/api/collections/books_accounts/records",
		token:  tokenFor(t, users.bookkeeper),
		body:   `{"name":"Petty Cash","number":"1010","type":"bank","detail_type":"cash_on_hand"}`,
		want:   http.StatusOK,
		after: func(t testing.TB, app *tests.TestApp) {
			waitFor(t, func() bool {
				row, err := app.FindFirstRecordByFilter("audit_logs",
					"resource_type = 'books_accounts' && action = 'created'", dbx.Params{})
				return err == nil && row.GetString("resource_label") == "1010:Petty Cash" && row.GetString("actor") == users.bookkeeper.Id
			})
		},
	}.run(t, app)
}

// newAuditedApp is an app with the ledger guards and the audit hooks bound, as
// production binds them, and one user per level.
func newAuditedApp(t testing.TB) (*tests.TestApp, levelUsers) {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerAudit(&pocketbase.PocketBase{App: app})
	return app, newLevelUsers(t, app)
}

// awaitAuditRow waits for the one audit row of action on a record, since core
// writes it off the request goroutine.
func awaitAuditRow(t testing.TB, app core.App, collection, action, id string) *core.Record {
	t.Helper()
	var row *core.Record
	waitFor(t, func() bool {
		r, err := app.FindFirstRecordByFilter("audit_logs",
			"resource_type = {:c} && action = {:a} && resource_id = {:id}",
			dbx.Params{"c": collection, "a": action, "id": id})
		row = r
		return err == nil
	})
	return row
}

// requireNoLeak fails when the audit row's JSON holds any of the fragments.
func requireNoLeak(t testing.TB, row *core.Record, fragments ...string) {
	t.Helper()
	raw, err := json.Marshal(row)
	if err != nil {
		t.Fatalf("marshal the audit row: %v", err)
	}
	for _, f := range fragments {
		if strings.Contains(string(raw), f) {
			t.Errorf("the audit row holds %q: %s", f, raw)
		}
	}
}

func auditJSONField(t testing.TB, row *core.Record, field string) map[string]any {
	t.Helper()
	var out map[string]any
	if err := row.UnmarshalJSONField(field, &out); err != nil {
		t.Fatalf("audit %s is not JSON: %v (%s)", field, err, row.GetString(field))
	}
	return out
}

var redactedChange = map[string]any{"before": "[redacted]", "after": "[redacted]", "redacted": true}

// A tax ID (an SSN for a sole proprietor) must not stay readable in the audit
// log after it is corrected: the change is logged with the marker for both
// values, while the vendor's other fields keep theirs.
func TestAudit_RedactsAVendorTaxIDChange(t *testing.T) {
	app, users := newAuditedApp(t)
	vendor := saveRecord(t, app, "books_vendors", map[string]any{
		"display_name": "Redact Co", "tax_id_type": "ein", "tax_id": "12-3456789",
	})
	apiReq{
		method: http.MethodPatch,
		url:    "/api/collections/books_vendors/records/" + vendor.Id,
		token:  tokenFor(t, users.bookkeeper),
		body:   `{"tax_id":"987654321","legal_name":"Redact Company LLC"}`,
		want:   http.StatusOK,
		after: func(t testing.TB, app *tests.TestApp) {
			row := awaitAuditRow(t, app, "books_vendors", "updated", vendor.Id)
			changes := auditJSONField(t, row, "changes")
			if !reflect.DeepEqual(changes["tax_id"], redactedChange) {
				t.Errorf("changes.tax_id = %#v, want %#v", changes["tax_id"], redactedChange)
			}
			if want := map[string]any{"before": "", "after": "Redact Company LLC"}; !reflect.DeepEqual(changes["legal_name"], want) {
				t.Errorf("changes.legal_name = %#v, want %#v", changes["legal_name"], want)
			}
			requireNoLeak(t, row, "3456789", "7654321")
		},
	}.run(t, app)
}

// A deleted vendor's snapshot keeps its other fields but not its tax ID.
func TestAudit_RedactsADeletedVendorsTaxID(t *testing.T) {
	app, users := newAuditedApp(t)
	vendor := saveRecord(t, app, "books_vendors", map[string]any{
		"display_name": "Redact Co", "tax_id_type": "ein", "tax_id": "12-3456789",
	})
	apiReq{
		method: http.MethodDelete,
		url:    "/api/collections/books_vendors/records/" + vendor.Id,
		token:  tokenFor(t, users.bookkeeper),
		want:   http.StatusNoContent,
		after: func(t testing.TB, app *tests.TestApp) {
			row := awaitAuditRow(t, app, "books_vendors", "deleted", vendor.Id)
			snapshot := auditJSONField(t, row, "snapshot")
			if snapshot["tax_id"] != "[redacted]" {
				t.Errorf("snapshot.tax_id = %#v, want %q", snapshot["tax_id"], "[redacted]")
			}
			if snapshot["display_name"] != "Redact Co" {
				t.Errorf("snapshot.display_name = %#v, want %q", snapshot["display_name"], "Redact Co")
			}
			requireNoLeak(t, row, "3456789")
		},
	}.run(t, app)
}

// The company's own tax ID in Books settings is logged the same way.
func TestAudit_RedactsTheCompanyTaxID(t *testing.T) {
	app, users := newAuditedApp(t)
	apiReq{
		method: http.MethodPatch,
		url:    "/api/collections/books_settings/records/" + settingsID,
		token:  tokenFor(t, users.admin),
		body:   `{"tax_id":"55-5555555"}`,
		want:   http.StatusOK,
		after: func(t testing.TB, app *tests.TestApp) {
			row := awaitAuditRow(t, app, "books_settings", "updated", settingsID)
			changes := auditJSONField(t, row, "changes")
			if !reflect.DeepEqual(changes["tax_id"], redactedChange) {
				t.Errorf("changes.tax_id = %#v, want %#v", changes["tax_id"], redactedChange)
			}
			requireNoLeak(t, row, "5555555")
		},
	}.run(t, app)
}

func TestOAuth_LedgerIsReadWrite(t *testing.T) {
	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	for _, c := range []string{
		"books_accounts", "books_journal_entries", "books_journal_lines", "books_customers", "books_vendors",
		"books_products", "books_bundle_items", "books_tax_agencies", "books_tax_rates",
	} {
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

// A token that records transactions also connects bank accounts, uploads their statement files and imports them. TestOAuth_CoversEveryBooksCollection checks only that
// a collection is listed, so this pins the access itself.
func TestOAuth_BankCollectionsAreReadWrite(t *testing.T) {
	collections := oauthPackage().Collections
	want := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	for _, c := range []string{"books_bank_connections", "books_bank_files", "books_bank_imports"} {
		got, ok := collections[c]
		if !ok {
			t.Errorf("%s has no OAuth entry", c)
			continue
		}
		if !reflect.DeepEqual(got.Read, want.Read) || !reflect.DeepEqual(got.Write, want.Write) {
			t.Errorf("%s OAuth access = %+v, want Read %v and Write %v", c, got, want.Read, want.Write)
		}
	}
}

// A file's parsed rows are written only by the server, and a person changes a
// transaction only to move its status between For review and Excluded, so a
// token reads them and never writes them.
func TestOAuth_BankRowsAreReadOnly(t *testing.T) {
	collections := oauthPackage().Collections
	for _, c := range []string{"books_bank_file_contents", "books_bank_transactions"} {
		got, ok := collections[c]
		if !ok {
			t.Errorf("%s has no OAuth entry", c)
			continue
		}
		if !reflect.DeepEqual(got.Read, []string{scopeRead}) || len(got.Write) != 0 {
			t.Errorf("%s OAuth access = %+v, want read-only %s", c, got, scopeRead)
		}
	}
}

// An import row holds only a file id, so its audit row names the file.
func TestAudit_LabelsABankImportByItsFile(t *testing.T) {
	env := newBankRulesEnv(t)
	imports, ok := auditedCollections(env.app)["books_bank_imports"]
	if !ok {
		t.Fatal("books_bank_imports is not audited")
	}
	if got, want := imports.ExtractLabel(env.bankImport), "oct-2026.csv"; got != want {
		t.Errorf("import label = %q, want %q", got, want)
	}
}

// Settings, numbering, overrides and admin grants change who may do what in
// the books. A token consented as "record transactions" must not reach them.
func TestOAuth_ConfigurationIsReadOnly(t *testing.T) {
	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	both := []string{scopeRead, scopeWrite}
	for _, c := range []string{"books_account_balances", "books_settings", "books_doc_sequences", "books_close_overrides", "books_admins", "books_access"} {
		path := "/api/collections/" + c + "/records"
		if !oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("GET %s: books:read must read", path)
		}
		for _, method := range []string{http.MethodPost, http.MethodPatch, http.MethodDelete} {
			p := path
			if method != http.MethodPost {
				p += "/abc123"
			}
			if oauth.ScopeForRoute(method, p).SatisfiedBy(both) {
				t.Errorf("%s %s: no Books scope may write", method, p)
			}
		}
	}
	if oauth.ScopeForRoute(http.MethodPost, "/api/books/balances/rebuild").SatisfiedBy(both) {
		t.Error("the rebuild route must stay session-only")
	}
	// Session only: the app's download button is the only caller (plan p2-pdf).
	for _, path := range []string{"/api/books/pdf/sample", "/api/books/pdf/invoice/abc123"} {
		if oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy(both) {
			t.Errorf("GET %s must stay session-only", path)
		}
	}
}

// Register mounts the PDF routes once: the registered app serves the sample.
func TestRegister_ServesTheSamplePDF(t *testing.T) {
	app, _ := newRegisteredApp(t)
	users := newLevelUsers(t, app)
	apiReq{
		method:  http.MethodGet,
		url:     "/api/books/pdf/sample",
		token:   tokenFor(t, users.readOnly),
		want:    http.StatusOK,
		content: []string{"%PDF-"},
		response: func(t testing.TB, res *http.Response) {
			for header, want := range map[string]string{
				"Content-Type":        "application/pdf",
				"Content-Disposition": `attachment; filename="sample-invoice.pdf"`,
				"Cache-Control":       "no-store",
			} {
				if got := res.Header.Get(header); got != want {
					t.Errorf("%s = %q, want %q", header, got, want)
				}
			}
		},
	}.run(t, app)
}

// The sales_receipt kind prints a books_sales_receipts record at
// /api/books/pdf/sales_receipt/<id> under the receipt's view rule: a reader
// downloads sales-receipt-<n>.pdf; a receipt the view rule hides is not found.
func TestPDFRoute_SalesReceiptFollowsTheReceiptViewRule(t *testing.T) {
	postedReceipt := func(t *testing.T) (*receiptEnv, *core.Record) {
		t.Helper()
		re := newReceiptEnv(t)
		r := re.mkReceipt(t, map[string]any{"payment_method": "check", "reference_no": "43567"})
		mkReceiptLine(t, re.app, r, 0, item(re.service, 1, 45000, false))
		return re, mustPostReceipt(t, re.app, r.Id, re.users.bookkeeper.Id)
	}
	t.Run("a reader downloads sales-receipt-<n>.pdf", func(t *testing.T) {
		re, posted := postedReceipt(t)
		apiReq{
			method:  http.MethodGet,
			url:     "/api/books/pdf/sales_receipt/" + posted.Id,
			token:   tokenFor(t, re.users.readOnly),
			want:    http.StatusOK,
			content: []string{"%PDF-"},
			before:  bindPDFRoutes,
			response: func(t testing.TB, res *http.Response) {
				want := `attachment; filename="sales-receipt-` + posted.GetString("number") + `.pdf"`
				if got := res.Header.Get("Content-Disposition"); got != want {
					t.Errorf("Content-Disposition = %q, want %q", got, want)
				}
			},
		}.run(t, re.app)
	})
	t.Run("a receipt the view rule hides is not found", func(t *testing.T) {
		re, posted := postedReceipt(t)
		col, err := re.app.FindCollectionByNameOrId("books_sales_receipts")
		if err != nil {
			t.Fatalf("find: %v", err)
		}
		rule := `id = "never"`
		col.ViewRule = &rule
		if err := re.app.Save(col); err != nil {
			t.Fatalf("save rule: %v", err)
		}
		pdfReq(t, re.app, "/api/books/pdf/sales_receipt/"+posted.Id, tokenFor(t, re.users.readOnly), http.StatusNotFound)
	})
}

// The estimate kind prints a books_estimates record at
// /api/books/pdf/estimate/<id> under the estimate's view rule: a reader
// downloads estimate-<n>.pdf; an estimate the view rule hides is not found.
func TestPDFRoute_EstimateFollowsTheEstimateViewRule(t *testing.T) {
	savedEstimate := func(t *testing.T) (*estimateEnv, *core.Record) {
		t.Helper()
		ee := newEstimateEnv(t)
		r := ee.mkEstimate(t, nil)
		mkEstimateLine(t, ee.app, r, 0, item(ee.service, 1, 45000, false))
		return ee, reload(t, ee.app, "books_estimates", r.Id)
	}
	t.Run("a reader downloads estimate-<n>.pdf", func(t *testing.T) {
		ee, saved := savedEstimate(t)
		apiReq{
			method:  http.MethodGet,
			url:     "/api/books/pdf/estimate/" + saved.Id,
			token:   tokenFor(t, ee.users.readOnly),
			want:    http.StatusOK,
			content: []string{"%PDF-"},
			before:  bindPDFRoutes,
			response: func(t testing.TB, res *http.Response) {
				want := `attachment; filename="estimate-1001.pdf"`
				if got := res.Header.Get("Content-Disposition"); got != want {
					t.Errorf("Content-Disposition = %q, want %q", got, want)
				}
			},
		}.run(t, ee.app)
	})
	t.Run("an estimate the view rule hides is not found", func(t *testing.T) {
		ee, saved := savedEstimate(t)
		col, err := ee.app.FindCollectionByNameOrId("books_estimates")
		if err != nil {
			t.Fatalf("find: %v", err)
		}
		rule := `id = "never"`
		col.ViewRule = &rule
		if err := ee.app.Save(col); err != nil {
			t.Fatalf("save rule: %v", err)
		}
		pdfReq(t, ee.app, "/api/books/pdf/estimate/"+saved.Id, tokenFor(t, ee.users.readOnly), http.StatusNotFound)
	})
}

func TestOAuth_CoversEveryBooksCollection(t *testing.T) {
	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	app := newBooksApp(t)
	for _, c := range booksCollections(t, app) {
		if !oauth.ScopeForRoute(http.MethodGet, "/api/collections/"+c.Name+"/records").SatisfiedBy([]string{scopeRead}) {
			t.Errorf("%s has no OAuth entry and is default-denied to tokens", c.Name)
		}
	}
}

// oauthToken mints an access token for user through core's real grant path,
// on the first-party CLI client the core migrations seed.
func oauthToken(t testing.TB, app core.App, user *core.Record, scopes ...string) string {
	t.Helper()
	client, err := app.FindFirstRecordByData("oauth_clients", "client_id", "tinycld-cli")
	if err != nil {
		t.Fatalf("find the seeded CLI client: %v", err)
	}
	grant, err := oauth.NewGrant(app, user.Id, client.Id, scopes, "active")
	if err != nil {
		t.Fatalf("grant: %v", err)
	}
	token, err := oauth.MintAccessToken(app, user, grant, oauth.AccessTokenTTL)
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	return token
}

// A token with every Books scope, held by a Books admin, still cannot rebuild
// balances: core's grant middleware default-denies a route no package
// classified, and Books classifies none.
func TestOAuth_TokenCannotRebuildBalances(t *testing.T) {
	app, pb := newRegisteredApp(t)
	oauth.Register(pb)
	admin := mkUser(t, app, "member")
	makeBooksAdmin(t, app, admin)
	apiReq{
		method:  http.MethodPost,
		url:     "/api/books/balances/rebuild",
		token:   oauthToken(t, app, admin, scopeRead, scopeWrite),
		want:    http.StatusForbidden,
		content: []string{"not available to API tokens"},
	}.run(t, app)
}

// The positive control for the test above: the same kind of token reaches the
// ledger, so the 403 there is the route's classification, not a broken token.
func TestOAuth_TokenReadsTheLedger(t *testing.T) {
	app, pb := newRegisteredApp(t)
	oauth.Register(pb)
	admin := mkUser(t, app, "member")
	makeBooksAdmin(t, app, admin)
	mkAccount(t, app, "Checking", "bank", "checking")
	apiReq{
		method:  http.MethodGet,
		url:     "/api/collections/books_accounts/records",
		token:   oauthToken(t, app, admin, scopeRead),
		want:    http.StatusOK,
		content: []string{`"totalItems":1`, `"name":"Checking"`},
	}.run(t, app)
}

// A token acts as its user: a read-only user's token cannot write the ledger
// even when it holds books:write, because the collection rules still apply.
func TestOAuth_ReadOnlyUsersTokenCannotWrite(t *testing.T) {
	app, pb := newRegisteredApp(t)
	oauth.Register(pb)
	users := newLevelUsers(t, app)
	apiReq{
		method: http.MethodPost,
		url:    "/api/collections/books_accounts/records",
		token:  oauthToken(t, app, users.readOnly, scopeRead, scopeWrite),
		body:   `{"name":"Petty Cash","type":"bank","detail_type":"cash_on_hand"}`,
		want:   http.StatusBadRequest,
		after: func(t testing.TB, app *tests.TestApp) {
			if n, _ := app.CountRecords("books_accounts"); n != 0 {
				t.Errorf("%d accounts exist after a read-only user's write", n)
			}
		},
	}.run(t, app)
}

// A user with no Books access reads nothing through a token that holds
// books:read.
func TestOAuth_NoAccessUsersTokenReadsNothing(t *testing.T) {
	app, pb := newRegisteredApp(t)
	oauth.Register(pb)
	users := newLevelUsers(t, app)
	mkAccount(t, app, "Checking", "bank", "checking")
	apiReq{
		method:  http.MethodGet,
		url:     "/api/collections/books_accounts/records",
		token:   oauthToken(t, app, users.none, scopeRead, scopeWrite),
		want:    http.StatusOK,
		content: []string{`"totalItems":0`},
	}.run(t, app)
}

// The settings hold the close date. Even a Books admin's token with every
// Books scope cannot change them: no scope writes configuration.
func TestOAuth_AdminsTokenCannotChangeSettings(t *testing.T) {
	app, pb := newRegisteredApp(t)
	oauth.Register(pb)
	users := newLevelUsers(t, app)
	apiReq{
		method:  http.MethodPatch,
		url:     "/api/collections/books_settings/records/" + settingsID,
		token:   oauthToken(t, app, users.admin, scopeRead, scopeWrite),
		body:    `{"close_date":"2026-01-31"}`,
		want:    http.StatusForbidden,
		content: []string{"not available to API tokens"},
		after: func(t testing.TB, app *tests.TestApp) {
			if got := reload(t, app, "books_settings", settingsID).GetString("close_date"); got != "" {
				t.Errorf("close_date = %q after a token's write", got)
			}
		},
	}.run(t, app)
}

// Quota counts stored bytes. One Books collection stores files (the bank
// statement files), so it is the one source; this fails the day another
// collection stores files without a registration.
func TestQuota_EveryFileCollectionIsASource(t *testing.T) {
	app := newBooksApp(t)
	sources := map[string]bool{}
	for _, s := range quotaSources() {
		if err := quota.ValidateSource(s); err != nil {
			t.Errorf("invalid quota source %+v: %v", s, err)
		}
		sources[s.Collection] = true
	}
	for _, c := range booksCollections(t, app) {
		for _, f := range c.Fields {
			if f.Type() == core.FieldTypeFile && !sources[c.Name] {
				t.Errorf("%s stores files in %s but is not a quota source", c.Name, f.GetName())
			}
		}
	}
}

// offboardCase is a leaver and a colleague who stays, each a Books admin with
// an unexpired close-date override, so a test can show that offboarding ends
// the leaver's grants and only theirs.
type offboardCase struct {
	leaver, stayer     *core.Record
	leaverOv, stayerOv *core.Record
}

func newOffboardCase(t testing.TB, app core.App, leaver, stayer *core.Record) offboardCase {
	t.Helper()
	for _, u := range []*core.Record{leaver, stayer} {
		if n, _ := app.CountRecords("books_admins", dbx.HashExp{"user": u.Id}); n == 0 {
			makeBooksAdmin(t, app, u)
		}
	}
	expires := time.Now().Add(24 * time.Hour)
	return offboardCase{
		leaver:   leaver,
		stayer:   stayer,
		leaverOv: grantOverride(t, app, leaver, expires),
		stayerOv: grantOverride(t, app, stayer, expires),
	}
}

func (c offboardCase) requireOnlyTheLeaverLostAccess(t testing.TB, app core.App) {
	t.Helper()
	if n, _ := app.CountRecords("books_admins", dbx.HashExp{"user": c.leaver.Id}); n != 0 {
		t.Error("the leaver is still a Books admin")
	}
	if n, _ := app.CountRecords("books_admins", dbx.HashExp{"user": c.stayer.Id}); n != 1 {
		t.Errorf("the colleague who stays has %d Books admin rows, want 1", n)
	}
	if exp := reload(t, app, "books_close_overrides", c.leaverOv.Id).GetDateTime("expires_at").Time(); exp.After(time.Now().Add(time.Second)) {
		t.Errorf("the leaver's override still expires at %v", exp)
	}
	if exp := reload(t, app, "books_close_overrides", c.stayerOv.Id).GetDateTime("expires_at").Time(); !exp.After(time.Now().Add(time.Hour)) {
		t.Errorf("the colleague's override was cut to %v", exp)
	}
}

func TestOffboard_KeepsTheLedgerAndDropsGrants(t *testing.T) {
	modes := []offboard.Mode{offboard.ModeDeleteMyData, offboard.ModeKeep, offboard.ModeReassign}
	for _, mode := range modes {
		t.Run(string(mode), func(t *testing.T) {
			t.Cleanup(offboard.ResetHandlersForTesting)
			env := newLedgerEnv(t)
			registerOffboard()
			c := newOffboardCase(t, env.app, env.users.admin, env.users.bookkeeper)
			posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, c.leaver.Id)

			plan := offboard.Plan{Mode: mode}
			if mode == offboard.ModeReassign {
				plan.SuccessorUserID = c.stayer.Id
			}
			if _, err := offboard.OffboardUser(env.app, c.leaver.Id, plan, ""); err != nil {
				t.Fatalf("offboard: %v", err)
			}
			after := reload(t, env.app, "books_journal_entries", posted.Id)
			if after.GetString("status") != statusPosted || after.GetString("posted_by") != c.leaver.Id {
				t.Fatalf("ledger changed on offboard: %v", after.PublicExport())
			}
			c.requireOnlyTheLeaverLostAccess(t, env.app)
		})
	}
}

func TestRegister_WiresEverything(t *testing.T) {
	resetRegistries(t)
	app := newBooksApp(t)
	pb := &pocketbase.PocketBase{App: app}
	before := rlstest.HookHandlerCounts(t, pb)
	Register(pb)
	after := rlstest.HookHandlerCounts(t, pb)
	if after["OnServe"] <= before["OnServe"] || after["OnRecordUpdate"] <= before["OnRecordUpdate"] {
		t.Fatal("Register bound no serve or record hooks")
	}
	if got, audited := after["OnRecordCreateRequest"]-before["OnRecordCreateRequest"], len(auditedCollections(app)); got < audited {
		t.Fatalf("Register bound %d create-request hooks, want at least %d for audit", got, audited)
	}
	if len(oauth.PackageScopes("books")) != 2 {
		t.Fatalf("OAuth scopes = %v", oauth.PackageScopes("books"))
	}
	sources := search.RegisteredSources()
	if len(sources) != 1 || sources[0].Slug != "books" || sources[0].Order != 30 {
		t.Fatalf("search sources = %+v, want one books source", sources)
	}
	var booksSources []quota.Source
	for _, s := range quota.RegisteredSources() {
		if strings.HasPrefix(s.Collection, "books_") {
			booksSources = append(booksSources, s)
		}
	}
	// The bank files are the company's records, so they have no owner and
	// count toward the organization total only.
	wantSource := quota.Source{Slug: "books", Collection: "books_bank_files", SizeField: "size", OwnerField: ""}
	if len(booksSources) != 1 || booksSources[0] != wantSource {
		t.Errorf("Books quota sources = %+v, want exactly [%+v]", booksSources, wantSource)
	}
	found := false
	for _, j := range app.Cron().Jobs() {
		found = found || j.Id() == autoReverseJobID
	}
	if !found {
		t.Error("Register did not schedule the auto-reverse sweep")
	}
}

// Register binds each part exactly once: its hook counts equal those of an
// app wired by binding every part a single time by hand. A part bound twice
// (or left out) shows up as the hook whose count differs.
func TestRegister_BindsEachPartOnce(t *testing.T) {
	_, registered := newRegisteredApp(t)

	parts := newBooksApp(t)
	registerLedger(parts)
	registerSalesDocGuards(parts, invoiceKind)
	registerSalesDocGuards(parts, salesReceiptKind)
	registerSalesDocGuards(parts, estimateKind)
	registerSalesDocGuards(parts, billKind)
	registerEstimateResponses(parts)
	registerAudit(&pocketbase.PocketBase{App: parts})
	registerSearchIndex(&pocketbase.PocketBase{App: parts})
	registerAutoReverseSweep(parts)
	registerReportShares(parts)
	parts.OnServe().BindFunc(func(e *core.ServeEvent) error {
		bindBalanceRoutes(e)
		bindPDFRoutes(e)
		return e.Next()
	})

	rlstest.AssertCompositionDiff(t,
		rlstest.HookHandlerCounts(t, registered),
		rlstest.HookHandlerCounts(t, &pocketbase.PocketBase{App: parts}),
		nil)
}

// A post on an app wired by Register takes one number and adds to its balance
// rows once, and the rebuild route answers (a route mounted twice would panic
// when the router starts) and finds nothing to fix.
func TestRegister_PostsOnceAndServesTheRebuild(t *testing.T) {
	app, _ := newRegisteredApp(t)
	users := newLevelUsers(t, app)
	checking := mkAccount(t, app, "Checking", "bank", "checking")
	revenue := mkAccount(t, app, "Consulting Income", "income", "service_income")

	draft := mkDraft(t, app, "2026-05-10", ln{checking, 2500, 0}, ln{revenue, 0, 2500})
	posted := mustPost(t, app, draft.Id, users.bookkeeper.Id)
	if posted.GetString("number") != "1" || posted.GetInt("sequence") != 1 {
		t.Fatalf("posted = %v", posted.PublicExport())
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqjournal").GetInt("next_number"); next != 2 {
		t.Fatalf("next_number = %d after one post, want 2", next)
	}
	if d, c := balanceOf(t, app, checking, "2026-05"); d != 2500 || c != 0 {
		t.Errorf("checking %d/%d, want 2500/0", d, c)
	}
	if d, c := balanceOf(t, app, revenue, "2026-05"); d != 0 || c != 2500 {
		t.Errorf("revenue %d/%d, want 0/2500", d, c)
	}
	requireNoDrift(t, app)

	apiReq{
		method:  http.MethodPost,
		url:     "/api/books/balances/rebuild",
		token:   tokenFor(t, users.admin),
		want:    http.StatusOK,
		content: []string{`"fixed":0`},
	}.run(t, app)
}

// Register puts the offboard handler in core's registry: offboarding through
// core alone removes the leaver's Books admin grant.
func TestRegister_OffboardsThroughCore(t *testing.T) {
	app, _ := newRegisteredApp(t)
	c := newOffboardCase(t, app, mkUser(t, app, "member"), mkUser(t, app, "member"))
	if _, err := offboard.OffboardUser(app, c.leaver.Id, offboard.Plan{Mode: offboard.ModeKeep}, ""); err != nil {
		t.Fatalf("offboard: %v", err)
	}
	c.requireOnlyTheLeaverLostAccess(t, app)
}

// sort_key is the server's list order, not something a person wrote: a rename
// logs it as the hidden name_key is logged, a redacted change, never the raw key.
func TestAudit_RedactsTheSortKey(t *testing.T) {
	app, users := newAuditedApp(t)
	vendor := saveRecord(t, app, "books_vendors", map[string]any{"display_name": "Sorted Co"})
	apiReq{
		method: http.MethodPatch,
		url:    "/api/collections/books_vendors/records/" + vendor.Id,
		token:  tokenFor(t, users.bookkeeper),
		body:   `{"display_name":"Zeta Sorted Co"}`,
		want:   http.StatusOK,
		after: func(t testing.TB, app *tests.TestApp) {
			row := awaitAuditRow(t, app, "books_vendors", "updated", vendor.Id)
			changes := auditJSONField(t, row, "changes")
			if !reflect.DeepEqual(changes["sort_key"], redactedChange) {
				t.Errorf("changes.sort_key = %#v, want %#v", changes["sort_key"], redactedChange)
			}
			requireNoLeak(t, row, "zeta sorted co")
		},
	}.run(t, app)
}

// A tax rate's audit row names it as people know it, by its name, and its
// sort_key (the guard's list order) is logged only as a redacted change.
func TestAudit_LabelsATaxRateByName(t *testing.T) {
	app, users := newAuditedApp(t)
	agency := mkTaxAgency(t, app, "Colorado DOR", mkLiabilityAccount(t, app, "Sales tax payable"))
	rate := mkTaxRate(t, app, "Denver lodging", 88750, agency)
	apiReq{
		method: http.MethodPatch,
		url:    "/api/collections/books_tax_rates/records/" + rate.Id,
		token:  tokenFor(t, users.bookkeeper),
		body:   `{"name":"Zeta lodging"}`,
		want:   http.StatusOK,
		after: func(t testing.TB, app *tests.TestApp) {
			row := awaitAuditRow(t, app, "books_tax_rates", "updated", rate.Id)
			if got := row.GetString("resource_label"); got != "Zeta lodging" {
				t.Errorf("resource_label = %q, want %q", got, "Zeta lodging")
			}
			changes := auditJSONField(t, row, "changes")
			if want := map[string]any{"before": "Denver lodging", "after": "Zeta lodging"}; !reflect.DeepEqual(changes["name"], want) {
				t.Errorf("changes.name = %#v, want %#v", changes["name"], want)
			}
			if !reflect.DeepEqual(changes["sort_key"], redactedChange) {
				t.Errorf("changes.sort_key = %#v, want %#v", changes["sort_key"], redactedChange)
			}
			requireNoLeak(t, row, "zeta lodging", "denver lodging")
		},
	}.run(t, app)
}
