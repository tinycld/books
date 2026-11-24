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
	Name     string   `json:"name"`
	Type     string   `json:"type"`
	Required bool     `json:"required"`
	ReadOnly bool     `json:"readOnly"`
	Enum     []string `json:"enum"`
	Ref      string   `json:"ref"`
}

type cliResource struct {
	Name       string   `json:"name"`
	Collection string   `json:"collection"`
	Sort       string   `json:"sort"`
	Search     []string `json:"search"`
	Omit       []string `json:"omit"`
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
func cliTypeOf(f core.Field) (cliType string, required bool, values []string) {
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
		return "address", field.Required, nil
	default:
		return "unsupported " + f.Type(), false, nil
	}
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
			wantType, required, values := cliTypeOf(f)
			if declared.Type != wantType {
				t.Errorf("%s.%s: the CLI says %q, the collection field is %q (%s)", res.Name, declared.Name, declared.Type, wantType, f.Type())
			}
			// A read-only field is set by the server, so the caller is never
			// asked for it, whatever the schema requires.
			if !declared.ReadOnly && declared.Required != required {
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

// listQuery is the query string `list` sends with every filter flag and
// --search given, as cli/list.go builds it.
func (r cliResource) listQuery() string {
	clauses := []string{}
	if r.field("inactive") != nil {
		clauses = append(clauses, "inactive = false")
	}
	for _, flt := range r.Filters {
		clauses = append(clauses, flt.Field+` = "nothinghasthis1"`)
	}
	if len(r.Search) > 0 {
		alternatives := []string{}
		for _, name := range r.Search {
			alternatives = append(alternatives, name+` ~ "x\" || id != \""`)
		}
		clauses = append(clauses, "("+strings.Join(alternatives, " || ")+")")
	}
	q := url.Values{}
	q.Set("filter", strings.Join(clauses, " && "))
	q.Set("sort", r.Sort)
	q.Set("page", "1")
	q.Set("perPage", "200")
	return q.Encode()
}

// The server accepts the filter and sort of every `list`, for a bookkeeper's
// token: each field named is one the caller may filter and sort on, and the
// server parses the quoting of client.Filter. That a quote stays text is
// proved on a record, in TestCLIResources_AccountRoundTrip.
func TestCLIResources_ServerAcceptsEveryListQuery(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	token := tokenFor(t, users.bookkeeper)
	calls := []apiReq{}
	for _, res := range loadCLIResources(t) {
		calls = append(calls, apiReq{
			method: "GET", url: "/api/collections/" + res.Collection + "/records?" + res.listQuery(),
			token: token, want: 200, content: []string{`"items":[]`, `"totalItems":0`},
		})
	}
	apiSeq(t, app, calls...)
}

// The CLI escapes \, % and _ in --search (cli/list.go likeEscaper) and binds the
// value through client.Filter, which doubles each backslash and escapes quotes.
// This is the text it sends for --search '15%': the % is text, not a wildcard.
func TestCLIResources_SearchPercentIsText(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	writer := tokenFor(t, users.bookkeeper)
	const accounts = "/api/collections/books_accounts/records"
	likeEscaper := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	value := likeEscaper.Replace("15%")
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `"`, `\"`)
	quoted := `"` + value + `"`
	search := url.Values{}
	search.Set("filter", `inactive = false && (name ~ `+quoted+` || number ~ `+quoted+`)`)
	search.Set("sort", "full_name,id")
	search.Set("page", "1")
	search.Set("perPage", "200")
	apiSeq(t, app,
		apiReq{method: "POST", url: accounts, token: writer, want: 200,
			body: `{"id":"clipercent00001","name":"Rate 15%","type":"bank","detail_type":"cash_on_hand"}`},
		apiReq{method: "POST", url: accounts, token: writer, want: 200,
			body: `{"id":"clipercent00002","name":"Rate 150","type":"bank","detail_type":"cash_on_hand"}`},
		apiReq{method: "GET", url: accounts + "?" + search.Encode(), token: writer, want: 200,
			content: []string{`"totalItems":1`, `"id":"clipercent00001"`}},
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
	find := url.Values{}
	find.Set("filter", `inactive = false && type = "bank" && (name ~ "petty" || number ~ "petty")`)
	find.Set("sort", "full_name,id")
	find.Set("page", "1")
	find.Set("perPage", "200")
	// What `list --search 'x" || id != "'` sends. If the quote ended the text,
	// `id != ""` would match the account; as text, no name has it.
	quote := url.Values{}
	quote.Set("filter", `inactive = false && (name ~ "x\" || id != \"" || number ~ "x\" || id != \"")`)
	quote.Set("sort", "full_name,id")
	quote.Set("page", "1")
	quote.Set("perPage", "200")
	apiSeq(t, app,
		// The test names the id so the later calls can use it. The CLI does not.
		apiReq{method: "POST", url: accounts, token: writer, want: 200,
			body:    `{"id":"cliaccount00001","name":"Petty Cash","number":"1020","type":"bank","detail_type":"cash_on_hand","description":"Till"}`,
			content: []string{`"full_name":"Petty Cash"`, `"currency":"USD"`, `"inactive":false`, `"parent":""`}},
		apiReq{method: "GET", url: accounts + "?" + find.Encode(), token: reader, want: 200,
			content: []string{`"totalItems":1`, `"id":"cliaccount00001"`}},
		apiReq{method: "GET", url: accounts + "?" + quote.Encode(), token: reader, want: 200,
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
		add("books_products", `{"id":"cliservice00001","type":"service","name":"Consulting hour","sku":"CONS-1","price":15000,`+
			`"income_account":"cliincome000001","taxable":false}`,
			`"price":15000`, `"currency":"USD"`, `"income_account":"cliincome000001"`),
		add("books_products", `{"id":"clibundle000001","type":"bundle","name":"Starter pack"}`, `"type":"bundle"`),
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
