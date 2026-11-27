package books

import (
	"bytes"
	"encoding/json"
	"net/url"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The Books CLI (cli/) is a separate Go module that only speaks HTTP. Its
// tests run against a fake server, which has no schema, no rule and no scope
// table. These tests are the other half: they read the CLI's own definitions
// (cli/resources.json) and hold them to the migrated collections, the OAuth
// registration and the real PocketBase API, so a renamed column, a new column the CLI
// does not know, or a collection a token cannot reach fails here.

type cliField struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Required bool   `json:"required"`
	ReadOnly bool   `json:"readOnly"`
	// Generated: required by the schema, made by the server when left out.
	Generated bool     `json:"generated"`
	Enum      []string `json:"enum"`
	Ref       string   `json:"ref"`
}

type cliResource struct {
	Name string `json:"name"`
	// Word is the command word of a view of a transaction type.
	Word       string   `json:"word"`
	Collection string   `json:"collection"`
	Sort       string   `json:"sort"`
	Search     []string `json:"search"`
	Omit       []string `json:"omit"`
	// Timestamps: the stamps the CLI prints and describes; absent means both.
	Timestamps []string `json:"timestamps"`
	Filters    []struct {
		Field string `json:"field"`
	} `json:"filters"`
	Fields []cliField `json:"fields"`
}

func (r cliResource) field(name string) *cliField {
	for i := range r.Fields {
		if r.Fields[i].Name == name {
			return &r.Fields[i]
		}
	}
	return nil
}

func loadCLIResources(t testing.TB) []cliResource {
	t.Helper()
	data, err := os.ReadFile("../cli/resources.json")
	if err != nil {
		t.Fatalf("read the CLI's resource definitions: %v", err)
	}
	var file struct {
		Resources []cliResource `json:"resources"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatalf("cli/resources.json: %v", err)
	}
	if len(file.Resources) == 0 {
		t.Fatal("cli/resources.json has no resources")
	}
	return file.Resources
}

// cliTypeOf is the resources.json type a collection field must be declared
// as, with the field's required flag and select values.
func cliTypeOf(collection string, f core.Field) (cliType string, required bool, values []string) {
	switch field := f.(type) {
	case *core.TextField:
		return "string", field.Required, nil
	case *core.EmailField:
		return "string", field.Required, nil
	case *core.URLField:
		return "string", field.Required, nil
	case *core.SelectField:
		if field.MaxSelect > 1 {
			return "unsupported multi-select", field.Required, nil
		}
		return "string", field.Required, field.Values
	case *core.BoolField:
		return "bool", field.Required, nil
	case *core.NumberField:
		if field.OnlyInt {
			return "integer", field.Required, nil
		}
		return "number", field.Required, nil
	case *core.RelationField:
		if field.MaxSelect > 1 {
			return "ids", field.Required, nil
		}
		return "id", field.Required, nil
	case *core.JSONField:
		// Only a column the server checks with isAddress is an address: the
		// CLI applies the six-key check to every field it types so.
		if slices.Contains(addressFields()[collection], field.Name) {
			return "address", field.Required, nil
		}
		return "unsupported json", field.Required, nil
	default:
		return "unsupported " + f.Type(), false, nil
	}
}

// A JSON column that is not an address must not map to the CLI's address type.
func TestCLIResources_OnlyAnAddressFieldIsTypedAddress(t *testing.T) {
	meta := &core.JSONField{Name: "meta"}
	if got, _, _ := cliTypeOf("books_customers", meta); got != "unsupported json" {
		t.Errorf("a JSON field that is no address: type = %q, want %q", got, "unsupported json")
	}
	if got, _, _ := cliTypeOf("books_customers", &core.JSONField{Name: "billing_address"}); got != "address" {
		t.Errorf("billing_address: type = %q, want address", got)
	}
	// A purchase order's mailing_address is the vendor's address in the shape
	// of 2100000004, checked by isAddress (purchaseOrderKind.AddressField).
	if got, _, _ := cliTypeOf("books_purchase_orders", &core.JSONField{Name: "mailing_address"}); got != "address" {
		t.Errorf("mailing_address of purchase orders: type = %q, want address", got)
	}
	if got, _, _ := cliTypeOf("books_vendors", &core.JSONField{Name: "billing_address"}); got != "unsupported json" {
		t.Errorf("billing_address of vendors: type = %q, want unsupported json", got)
	}
}

// addressFields are the JSON columns the server checks with isAddress, by
// collection: the sources are validateCustomer (customers.go), validateVendor
// (vendors.go) and AddressField of each salesDocKind (sales_documents.go and
// purchase_orders.go).
func addressFields() map[string][]string {
	fields := map[string][]string{
		"books_customers": {"billing_address", "shipping_address"},
		"books_vendors":   {"address"},
	}
	for _, kind := range []salesDocKind{
		invoiceKind, salesReceiptKind, creditMemoKind, refundReceiptKind, estimateKind,
		billKind, expenseKind, vendorCreditKind, purchaseOrderKind,
	} {
		if kind.AddressField != "" {
			fields[kind.Collection] = append(fields[kind.Collection], kind.AddressField)
		}
	}
	return fields
}

func TestCLIResources_MatchTheCollections(t *testing.T) {
	app := newBooksApp(t)
	resources := loadCLIResources(t)
	collectionOf := map[string]string{}
	for _, res := range resources {
		collectionOf[res.Name] = res.Collection
	}
	for _, res := range resources {
		col, err := app.FindCollectionByNameOrId(res.Collection)
		if err != nil {
			t.Errorf("%s: collection %s: %v", res.Name, res.Collection, err)
			continue
		}
		for _, declared := range res.Fields {
			f := col.Fields.GetByName(declared.Name)
			if f == nil {
				t.Errorf("%s: the CLI declares %q, and %s has no such field", res.Name, declared.Name, res.Collection)
				continue
			}
			if f.GetHidden() {
				t.Errorf("%s.%s is hidden: the API never sends it, so the CLI must not declare it", res.Name, declared.Name)
			}
			wantType, required, values := cliTypeOf(res.Collection, f)
			if declared.Type != wantType {
				t.Errorf("%s.%s: the CLI says %q, the collection field is %q (%s)", res.Name, declared.Name, declared.Type, wantType, f.Type())
			}
			// A read-only field is set by the server, so the caller is never
			// asked for it, whatever the schema requires. A generated field is
			// required by the schema and made by the server when left out.
			if declared.Generated && !required {
				t.Errorf("%s.%s: the CLI says generated, and the collection does not require it", res.Name, declared.Name)
			}
			if !declared.ReadOnly && !declared.Generated && declared.Required != required {
				t.Errorf("%s.%s: the CLI says required = %v, the collection says %v", res.Name, declared.Name, declared.Required, required)
			}
			if !slices.Equal(declared.Enum, values) {
				t.Errorf("%s.%s: the CLI's values %v are not the select's %v", res.Name, declared.Name, declared.Enum, values)
			}
			if rel, ok := f.(*core.RelationField); ok {
				target, err := app.FindCollectionByNameOrId(rel.CollectionId)
				if err != nil {
					t.Fatalf("%s.%s: %v", res.Name, declared.Name, err)
				}
				if collectionOf[declared.Ref] != target.Name {
					t.Errorf("%s.%s: ref %q is %s, the relation points to %s", res.Name, declared.Name, declared.Ref, collectionOf[declared.Ref], target.Name)
				}
			}
		}
		// Every column a caller can see is declared or left out on purpose.
		for _, f := range col.Fields {
			name := f.GetName()
			if f.GetHidden() || name == "id" || name == "created" || name == "updated" {
				continue
			}
			if res.field(name) == nil && !slices.Contains(res.Omit, name) {
				t.Errorf("%s has the field %q, which cli/resources.json neither declares for %q nor lists in its omit", res.Collection, name, res.Name)
			}
		}
		for _, name := range res.Omit {
			if col.Fields.GetByName(name) == nil {
				t.Errorf("%s: omit names %q, and %s has no such field", res.Name, name, res.Collection)
			}
		}
	}
}

// A token reaches a collection only when the OAuth registration names it. The
// CLI reads and writes each of its collections, so each needs both scopes.
func TestCLIResources_OAuthAllowsEveryCollection(t *testing.T) {
	collections := oauthPackage().Collections
	for _, res := range loadCLIResources(t) {
		access, ok := collections[res.Collection]
		if !ok {
			t.Errorf("%s: %s has no OAuth entry, so every CLI call on it would be refused", res.Name, res.Collection)
			continue
		}
		if !slices.Equal(access.Read, []string{scopeRead}) || !slices.Equal(access.Write, []string{scopeWrite}) {
			t.Errorf("%s: OAuth access of %s = %+v, want Read %s and Write %s", res.Name, res.Collection, access, scopeRead, scopeWrite)
		}
	}
}

// cli/account_types.json is the copy `tinycld books accounts types` prints.
func TestCLIResources_AccountTypesAreTheServers(t *testing.T) {
	server, err := os.ReadFile("account_types.json")
	if err != nil {
		t.Fatal(err)
	}
	cli, err := os.ReadFile("../cli/account_types.json")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(server, cli) {
		t.Error("cli/account_types.json differs from server/account_types.json: copy the server file over it")
	}
}

// listFilterCase is one entry of cli/testdata/list-filters.json: the `list`
// arguments and the filter and sort texts the CLI sends for them. The CLI's own
// test (cli/list_filters_test.go) holds the file to cli/list.go, so these texts
// are what the command sends, and this module never rebuilds them.
type listFilterCase struct {
	Name     string `json:"name"`
	Resource string `json:"resource"`
	// View is the command word of a view of the transaction type Resource
	// names; empty for the `list` of Resource.
	View   string `json:"view"`
	Filter string `json:"filter"`
	Sort   string `json:"sort"`
}

func loadListFilterCases(t testing.TB) []listFilterCase {
	t.Helper()
	data, err := os.ReadFile("../cli/testdata/list-filters.json")
	if err != nil {
		t.Fatalf("read the CLI's list filters: %v", err)
	}
	var file struct {
		Cases []listFilterCase `json:"cases"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatalf("cli/testdata/list-filters.json: %v", err)
	}
	if len(file.Cases) == 0 {
		t.Fatal("cli/testdata/list-filters.json has no cases")
	}
	return file.Cases
}

// query is the query string of that `list`: its filter and sort, and the page
// and page size it asks for by default.
func (c listFilterCase) query() string {
	q := url.Values{}
	q.Set("filter", c.Filter)
	q.Set("sort", c.Sort)
	q.Set("page", "1")
	q.Set("perPage", "200")
	return q.Encode()
}

func listFilterCaseNamed(t testing.TB, name string) listFilterCase {
	t.Helper()
	for _, c := range loadListFilterCases(t) {
		if c.Name == name {
			return c
		}
	}
	t.Fatalf("cli/testdata/list-filters.json has no case %q", name)
	return listFilterCase{}
}

// The server accepts the filter and sort of every list in the fixture, for a
// bookkeeper's token: each field named is one the caller may filter and sort on,
// and the server parses the quoting of client.Filter. That a quote or a wildcard
// stays text is proved on records, in TestCLIResources_AccountRoundTrip and
// TestCLIResources_SearchWildcardsAreText.
func TestCLIResources_ServerAcceptsEveryListQuery(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	token := tokenFor(t, users.bookkeeper)
	// A list is named by its resource or transaction type, and a view by its
	// type and command word.
	collectionOf := map[string]string{}
	for _, res := range loadCLIResources(t) {
		collectionOf[res.Name] = res.Collection
	}
	for _, doc := range loadCLIDocuments(t) {
		collectionOf[doc.Name] = doc.Collection
		for _, view := range doc.Views {
			collectionOf[doc.Name+" "+view.Word] = view.Collection
		}
	}
	// `reports list` is built in Go (cli/reports.go) over core's collection.
	collectionOf["reports"] = "reports"
	// The lists of `banking` are built in Go too (cli/banking.go).
	collectionOf["banking"] = "books_bank_transactions"
	collectionOf["banking connections"] = "books_bank_connections"
	collectionOf["banking files"] = "books_bank_files"
	// So is `reconcile list` (cli/reconcile.go).
	collectionOf["reconcile"] = "books_reconciliations"
	// So are the lists of `inventory` (cli/inventory.go).
	collectionOf["inventory moves"] = "books_stock_moves"
	collectionOf["inventory layers"] = "books_stock_layers"
	calls := []apiReq{}
	for _, c := range loadListFilterCases(t) {
		list := strings.TrimSpace(c.Resource + " " + c.View)
		collection, ok := collectionOf[list]
		if !ok {
			t.Fatalf("%s: cli/resources.json and cli/documents.json have no list %q", c.Name, list)
		}
		calls = append(calls, apiReq{
			method: "GET", url: "/api/collections/" + collection + "/records?" + c.query(),
			token: token, want: 200, content: []string{`"page":1`},
		})
	}
	apiSeq(t, app, calls...)
}

// PocketBase reads % and _ in a ~ value as wildcards. A search for "15%" finds
// only "Rate 15%", not "Rate 150" or "Rate 115": the % case fails if the CLI
// stops escaping %, as the quote case in TestCLIResources_AccountRoundTrip does
// for quotes. The "1_5" search finds only "Rate 1_5", but it checks the server's
// behavior only: when a value has no %, PocketBase's wrapLikeParams escapes _
// itself (tools/search/filter.go), so this passes even if the CLI stops escaping
// _. The guard of the CLI's escaper is cli/list_filters_test.go.
func TestCLIResources_SearchWildcardsAreText(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	writer := tokenFor(t, users.bookkeeper)
	const accounts = "/api/collections/books_accounts/records"
	add := func(id, name string) apiReq {
		return apiReq{method: "POST", url: accounts, token: writer, want: 200,
			body: `{"id":"` + id + `","name":"` + name + `","type":"bank","detail_type":"cash_on_hand"}`}
	}
	find := func(caseName, id string) apiReq {
		return apiReq{method: "GET", url: accounts + "?" + listFilterCaseNamed(t, caseName).query(), token: writer, want: 200,
			content: []string{`"totalItems":1`, `"id":"` + id + `"`}}
	}
	apiSeq(t, app,
		add("clipercent00001", "Rate 15%"),
		add("clipercent00002", "Rate 150"),
		add("cliunderscore01", "Rate 1_5"),
		add("cliunderscore02", "Rate 105"),
		add("cliunderscore03", "Rate 115"),
		find("accounts-search-percent", "clipercent00001"),
		find("accounts-search-underscore", "cliunderscore01"),
	)
}

// The shapes cli/errors.go reads, from the real PocketBase API: a schema refusal
// names its fields under data, a guard refusal has only a message, a missing
// record is 404. cli/errors_test.go uses these bodies.
func TestCLIResources_RefusalShapes(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	writer := tokenFor(t, users.bookkeeper)
	reader := tokenFor(t, users.readOnly)
	const accounts = "/api/collections/books_accounts/records"
	apiSeq(t, app,
		apiReq{method: "POST", url: accounts, token: writer, want: 400,
			body:    `{"type":"bank","detail_type":"cash_on_hand"}`,
			content: []string{`"message":"Failed to create record."`, `"name":{"code":"validation_required","message":"Cannot be blank."}`, `"status":400`}},
		// A Go guard runs before the schema check and answers with a sentence
		// and no field: here for a detail type, which the CLI cannot check.
		apiReq{method: "POST", url: accounts, token: writer, want: 400,
			body:    `{"name":"Petty Cash","type":"bank","detail_type":"rent_lease"}`,
			content: []string{`"data":{}`, `"message":"Rent_lease is not a detail type of Bank accounts."`}},
		// A field the server sets is refused by the create rule: the reason
		// cli/resources.json marks it readOnly and the CLI refuses it first.
		apiReq{method: "POST", url: accounts, token: writer, want: 400,
			body:    `{"name":"Petty Cash","type":"bank","detail_type":"cash_on_hand","full_name":"X"}`,
			content: []string{`"message":"Failed to create record."`, `"data":{}`}},
		// A caller with read access only: PocketBase answers a failed create
		// rule as a refusal (400), not as 403.
		apiReq{method: "POST", url: accounts, token: reader, want: 400,
			body:    `{"name":"Petty Cash","type":"bank","detail_type":"cash_on_hand"}`,
			content: []string{`"message":"Failed to create record."`}},
		apiReq{method: "GET", url: accounts + "/nosuchaccount01", token: writer, want: 404,
			content: []string{`"message":"The requested resource wasn't found."`, `"status":404`}},
	)
}

// One account through the calls the CLI makes: add, edit with a null, a list
// that finds it, deactivate, delete. It pins what the server does with the
// bodies cli/write.go sends.
func TestCLIResources_AccountRoundTrip(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	writer := tokenFor(t, users.bookkeeper)
	reader := tokenFor(t, users.readOnly)
	const accounts = "/api/collections/books_accounts/records"
	const one = accounts + "/cliaccount00001"
	find := listFilterCaseNamed(t, "accounts-type-and-search").query()
	// `list --search 'x" || id != "'`: if the quote ended the text, `id != ""`
	// would match the account; as text, no name has it.
	quote := listFilterCaseNamed(t, "accounts-search-quote").query()
	apiSeq(t, app,
		// The test names the id so the later calls can use it. The CLI does not.
		apiReq{method: "POST", url: accounts, token: writer, want: 200,
			body:    `{"id":"cliaccount00001","name":"Petty Cash","number":"1020","type":"bank","detail_type":"cash_on_hand","description":"Till"}`,
			content: []string{`"full_name":"Petty Cash"`, `"currency":"USD"`, `"inactive":false`, `"parent":""`}},
		apiReq{method: "GET", url: accounts + "?" + find, token: reader, want: 200,
			content: []string{`"totalItems":1`, `"id":"cliaccount00001"`}},
		apiReq{method: "GET", url: accounts + "?" + quote, token: reader, want: 200,
			content: []string{`"totalItems":0`, `"items":[]`}},
		// null clears a text field to "".
		apiReq{method: "PATCH", url: one, token: writer, want: 200,
			body:    `{"description":null,"number":null,"name":"Till"}`,
			content: []string{`"description":""`, `"number":""`, `"name":"Till"`, `"full_name":"Till"`}},
		// A caller with read access only cannot change it: the update rule
		// hides the record, so the answer is 404.
		apiReq{method: "PATCH", url: one, token: reader, want: 404, body: `{"inactive":true}`},
		apiReq{method: "PATCH", url: one, token: writer, want: 200,
			body: `{"inactive":true}`, content: []string{`"inactive":true`}},
		apiReq{method: "DELETE", url: one, token: writer, want: 204},
		apiReq{method: "GET", url: one, token: writer, want: 404},
	)
}

// One record of each other resource, with the bodies that the cases of
// cli/resources_test.go send: an address object, a null address, cents, a
// rate in parts per million, a list of ids. The fake of the CLI tests stores
// anything; this is the proof that the server takes these shapes. The ids are
// named so a later call can use them. The CLI does not name an id.
func TestCLIResources_EveryResourceRoundTrip(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	writer := tokenFor(t, users.bookkeeper)
	records := func(collection string) string { return "/api/collections/" + collection + "/records" }
	add := func(collection, body string, content ...string) apiReq {
		return apiReq{method: "POST", url: records(collection), token: writer, want: 200, body: body, content: content}
	}
	apiSeq(t, app,
		add("books_accounts", `{"id":"cliincome000001","name":"CLI Services","type":"income","detail_type":"service_income"}`),
		add("books_accounts", `{"id":"clisupplies0001","name":"CLI Supplies","type":"expense","detail_type":"advertising_marketing"}`),
		add("books_accounts", `{"id":"clitaxowed00001","name":"CLI Tax Owed","type":"other_current_liability","detail_type":"sales_tax_payable"}`),
		add("books_customers", `{"id":"clicustomer0001","display_name":"Acme Corp","email":"ap@acme.example","terms":"net_30",`+
			`"billing_address":{"line1":"1 Main St","line2":"","city":"Springfield","region":"IL","postal_code":"62701","country":"US"},`+
			`"shipping_address":null,"tax_exempt":true,"exemption_reason":"resale","exemption_number":"R-1"}`,
			`"display_name":"Acme Corp"`, `"line1":"1 Main St"`, `"shipping_address":null`, `"tax_exempt":true`, `"parent":""`),
		// null clears an address, as it clears a text field.
		apiReq{method: "PATCH", url: records("books_customers") + "/clicustomer0001", token: writer, want: 200,
			body: `{"billing_address":null,"terms":null}`, content: []string{`"billing_address":null`, `"terms":""`}},
		add("books_vendors", `{"id":"clivendor000001","display_name":"Paper Supply",`+
			`"address":{"line1":"9 Mill Rd","line2":"","city":"","region":"","postal_code":"","country":""},`+
			`"expense_account":"clisupplies0001","track_1099":true,"legal_name":"Paper Supply LLC","tax_id_type":"ein","tax_id":"12-3456789"}`,
			`"expense_account":"clisupplies0001"`, `"tax_id":"12-3456789"`),
		add("books_products", `{"id":"cliservice00001","type":"service","name":"Consulting hour","vendor_part_no":"CONS-1","price":15000,`+
			`"income_account":"cliincome000001","taxable":false}`,
			`"price":15000`, `"currency":"USD"`, `"income_account":"cliincome000001"`),
		add("books_products", `{"id":"clibundle000001","type":"bundle","name":"Starter pack"}`, `"type":"bundle"`),
		// An Inventory item with opening stock; the server fills the accounts
		// left empty and keeps the stock totals.
		add("books_products", `{"id":"cliinventory001","type":"inventory","name":"Widget","vendor_part_no":"W-1","price":2500,`+
			`"income_account":"cliincome000001","preferred_vendor":"clivendor000001","reorder_point":5,`+
			`"opening_quantity":10,"opening_value":12000,"opening_date":"2026-01-01"}`,
			`"type":"inventory"`, `"purchases":true`, `"quantity_on_hand":10`, `"stock_value":12000`, `"opening_date":"2026-01-01"`),
		add("books_bundle_items", `{"id":"clibundleitem01","bundle":"clibundle000001","product":"cliservice00001","quantity":2.5,"position":0}`,
			`"quantity":2.5`, `"position":0`),
		add("books_tax_agencies", `{"id":"cliagency000001","name":"State Revenue","account":"clitaxowed00001"}`, `"account":"clitaxowed00001"`),
		add("books_tax_rates", `{"id":"clirate00000001","type":"rate","name":"State","rate_ppm":62500,"agency":"cliagency000001"}`, `"rate_ppm":62500`),
		add("books_tax_rates", `{"id":"clirate00000002","type":"rate","name":"City","rate_ppm":26250,"agency":"cliagency000001"}`),
		add("books_tax_rates", `{"id":"cligroup0000001","type":"group","name":"City and state","components":["clirate00000001","clirate00000002"],"is_default":true}`,
			`"components":["clirate00000001","clirate00000002"]`, `"is_default":true`),
		// What `deactivate` and `delete` send, for a resource other than accounts.
		apiReq{method: "PATCH", url: records("books_vendors") + "/clivendor000001", token: writer, want: 200,
			body: `{"inactive":true}`, content: []string{`"inactive":true`}},
		apiReq{method: "DELETE", url: records("books_bundle_items") + "/clibundleitem01", token: writer, want: 204},
		apiReq{method: "DELETE", url: records("books_vendors") + "/clivendor000001", token: writer, want: 204},
	)
}
