package cli

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// resourceCase is one list resource other than accounts: an input `add`
// accepts, the body it must send, and what its commands look like.
type resourceCase struct {
	name       string
	collection string
	singular   string
	commands   string
	listFlags  []string
	input      string
	sent       string
	label      string
}

var resourceCases = []resourceCase{
	{
		name: "customers", collection: "books_customers", singular: "customer",
		commands:  "activate add deactivate delete edit list show",
		listFlags: []string{"all", "inactive", "limit", "page", "parent", "search"},
		input: `{"display_name": "Acme Corp", "email": "ap@acme.example", "terms": "net_30",
			"billing_address": {"line1": "1 Main St", "line2": "", "city": "Springfield", "region": "IL", "postal_code": "62701", "country": "US"},
			"shipping_address": null, "tax_exempt": true, "exemption_reason": "resale", "exemption_number": "R-1"}`,
		sent: `{"billing_address":{"city":"Springfield","country":"US","line1":"1 Main St","line2":"","postal_code":"62701","region":"IL"},` +
			`"display_name":"Acme Corp","email":"ap@acme.example","exemption_number":"R-1","exemption_reason":"resale",` +
			`"shipping_address":null,"tax_exempt":true,"terms":"net_30"}`,
		label: "Acme Corp",
	},
	{
		name: "vendors", collection: "books_vendors", singular: "vendor",
		commands:  "activate add deactivate delete edit list show",
		listFlags: []string{"all", "inactive", "limit", "page", "search"},
		input: `{"display_name": "Paper Supply", "expense_account": "acctsupplies001",
			"address": {"line1": "9 Mill Rd", "line2": "", "city": "", "region": "", "postal_code": "", "country": ""},
			"track_1099": true, "legal_name": "Paper Supply LLC", "tax_id_type": "ein", "tax_id": "12-3456789"}`,
		sent: `{"address":{"city":"","country":"","line1":"9 Mill Rd","line2":"","postal_code":"","region":""},"display_name":"Paper Supply","expense_account":"acctsupplies001",` +
			`"legal_name":"Paper Supply LLC","tax_id":"12-3456789","tax_id_type":"ein","track_1099":true}`,
		label: "Paper Supply",
	},
	{
		name: "products", collection: "books_products", singular: "product",
		commands:  "activate add deactivate delete edit list show",
		listFlags: []string{"all", "inactive", "limit", "page", "search", "type"},
		input: `{"type": "service", "name": "Consulting hour", "vendor_part_no": "CONS-1", "price": 15000,
			"income_account": "acctincome00001", "taxable": false}`,
		sent:  `{"income_account":"acctincome00001","name":"Consulting hour","price":15000,"taxable":false,"type":"service","vendor_part_no":"CONS-1"}`,
		label: "Consulting hour",
	},
	{
		name: "bundle-items", collection: "books_bundle_items", singular: "bundle item",
		commands:  "add delete edit list show",
		listFlags: []string{"bundle", "limit", "page", "product"},
		input:     `{"bundle": "prodbundle00001", "product": "prodservice0001", "quantity": 2.5, "position": 0}`,
		sent:      `{"bundle":"prodbundle00001","position":0,"product":"prodservice0001","quantity":2.5}`,
		// A bundle item has no name: it is known by its id.
		label: "rec000000000001",
	},
	{
		name: "tax-agencies", collection: "books_tax_agencies", singular: "tax agency",
		commands:  "activate add deactivate delete edit list show",
		listFlags: []string{"all", "inactive", "limit", "page", "search"},
		input:     `{"name": "State Revenue", "account": "accttaxowed0001"}`,
		sent:      `{"account":"accttaxowed0001","name":"State Revenue"}`,
		label:     "State Revenue",
	},
	{
		name: "tax-rates", collection: "books_tax_rates", singular: "tax rate",
		commands:  "activate add deactivate delete edit list show",
		listFlags: []string{"agency", "all", "inactive", "limit", "page", "search", "type"},
		input:     `{"type": "group", "name": "City and state", "components": ["taxratestate001", "taxratecity0001"], "is_default": true}`,
		sent:      `{"components":["taxratestate001","taxratecity0001"],"is_default":true,"name":"City and state","type":"group"}`,
		label:     "City and state",
	},
	{
		// Books numbers a statement, so the fake's record has no label but its id.
		name: "statements", collection: "books_statements", singular: "statement",
		commands:  "add delete list show",
		listFlags: []string{"customer", "limit", "page", "search", "type"},
		input:     `{"customer": "custacme0000001", "type": "balance_forward", "statement_date": "2026-11-20", "start_date": "2026-11-01", "end_date": "2026-11-20"}`,
		sent:      `{"customer":"custacme0000001","end_date":"2026-11-20","start_date":"2026-11-01","statement_date":"2026-11-20","type":"balance_forward"}`,
		label:     "rec000000000001",
	},
}

func TestEveryResourceHasACase(t *testing.T) {
	have := []string{"accounts"}
	for _, tc := range resourceCases {
		have = append(have, tc.name)
	}
	want := []string{}
	for i := range resources {
		want = append(want, resources[i].Name)
	}
	if !slices.Equal(have, want) {
		t.Errorf("resources.json has %v; the cases cover %v", want, have)
	}
}

func TestResourceCommands(t *testing.T) {
	root := newTestRoot(nil)
	for _, tc := range resourceCases {
		group, _, err := root.Find([]string{"books", tc.name})
		if err != nil {
			t.Errorf("%s: %v", tc.name, err)
			continue
		}
		if got := strings.Join(subcommandNames(group), " "); got != tc.commands {
			t.Errorf("%s commands = %q, want %q", tc.name, got, tc.commands)
		}
		list, _, _ := root.Find([]string{"books", tc.name, "list"})
		flags := []string{}
		for _, spec := range flagSpecs(list.LocalFlags()) {
			flags = append(flags, strings.TrimPrefix(spec.Name, "--"))
		}
		slices.Sort(flags)
		if !slices.Equal(flags, tc.listFlags) {
			t.Errorf("%s list flags = %v, want %v", tc.name, flags, tc.listFlags)
		}
	}
}

// add sends the input as given, to the resource's own collection, and the
// record that comes back can be shown, listed, edited and deleted.
func TestResourceLifeCycle(t *testing.T) {
	for _, tc := range resourceCases {
		f := newFakeBooks(t)
		f.rows[tc.collection] = []rawRecord{}
		c := f.serve()
		const id = "rec000000000001"

		out, errOut, err := runCmd(t, c, tc.input, "books", tc.name, "add", "--input", "-", "--json")
		if err != nil {
			t.Errorf("%s add: %v", tc.name, err)
			continue
		}
		if sent, _ := json.Marshal(f.lastCreate); string(sent) != tc.sent {
			t.Errorf("%s add sent\n%s\nwant\n%s", tc.name, sent, tc.sent)
		}
		if want := "added " + tc.singular + " " + tc.label; !strings.Contains(errOut, want) {
			t.Errorf("%s add: stderr %q has no %q", tc.name, errOut, want)
		}
		added := decodeRecord(t, out)
		res := findResource(tc.name)
		// The server sets sort_key, which no declared column fills; the fake
		// refuses a sort on a column no row has.
		if slices.Contains(res.Omit, "sort_key") {
			f.find(tc.collection, id)["sort_key"] = "a"
		}
		if got, want := len(added), len(recordKeys(res)); got != want {
			t.Errorf("%s: the printed record has %d keys, the schema %d: %v", tc.name, got, want, added)
		}

		out, _, err = runCmd(t, c, "", "books", tc.name, "show", id, "--json")
		if err != nil || decodeRecord(t, out)["id"] != id {
			t.Errorf("%s show: %v\n%s", tc.name, err, out)
		}
		if err == nil {
			if extra := keysOutside(decodeRecord(t, out), recordKeys(res)); extra != "" {
				t.Errorf("%s show: the record has keys the schema does not: %s", tc.name, extra)
			}
		}

		var listed listOut
		out, _, err = runCmd(t, c, "", "books", tc.name, "list", "--json")
		if err != nil {
			t.Errorf("%s list: %v", tc.name, err)
			continue
		}
		if jsonErr := json.Unmarshal([]byte(out), &listed); jsonErr != nil || listed.Total != 1 || len(listed.Items) != 1 {
			t.Errorf("%s list: %v\n%s", tc.name, jsonErr, out)
		}
		for _, item := range listed.Items {
			if extra := keysOutside(item, recordKeys(res)); extra != "" {
				t.Errorf("%s list: an item has keys the schema does not: %s", tc.name, extra)
			}
			if got, want := len(item), len(recordKeys(res)); got != want {
				t.Errorf("%s list: an item has %d keys, the schema %d: %v", tc.name, got, want, item)
			}
		}
		if f.lastQuery.Get("sort") != res.Sort {
			t.Errorf("%s list sort = %q, want %q", tc.name, f.lastQuery.Get("sort"), res.Sort)
		}
		if _, _, err = runCmd(t, c, "", "books", tc.name, "list"); err != nil {
			t.Errorf("%s list as a table: %v", tc.name, err)
		}

		if res.hasInactive() {
			if _, _, err = runCmd(t, c, "", "books", tc.name, "deactivate", id); err != nil {
				t.Errorf("%s deactivate: %v", tc.name, err)
			}
			if f.find(tc.collection, id)["inactive"] != true {
				t.Errorf("%s: deactivate did not set inactive", tc.name)
			}
			out, _, _ = runCmd(t, c, "", "books", tc.name, "list", "--json")
			if !strings.Contains(out, `"total": 0`) {
				t.Errorf("%s: an inactive record is in the default list:\n%s", tc.name, out)
			}
		}

		if _, _, err = runCmd(t, c, "", "books", tc.name, "delete", id, "--yes"); err != nil {
			t.Errorf("%s delete: %v", tc.name, err)
		}
		if len(f.rows[tc.collection]) != 0 {
			t.Errorf("%s: the record was not deleted", tc.name)
		}
	}
}

// keysOutside names the keys of a record that are not in want.
func keysOutside(record map[string]any, want []string) string {
	var extra []string
	for key := range record {
		if !slices.Contains(want, key) {
			extra = append(extra, key)
		}
	}
	slices.Sort(extra)
	return strings.Join(extra, ", ")
}

func TestBundleItemsHaveNoInactive(t *testing.T) {
	_, _, err := runCmd(t, nil, "", "books", "bundle-items", "deactivate", "x")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Errorf("exit = %d, want 2; err: %v", got, err)
	}
}

// Money and rates are whole numbers in the smallest unit. A fraction is a
// mistake the CLI catches, with the field's help in the message.
func TestMoneyFieldsRefuseAFraction(t *testing.T) {
	for _, tc := range []struct {
		resource, input, want string
	}{
		{"products", `{"type":"service","name":"A","price":12.5}`, `"price" must be a whole number, without a fraction`},
		{"products", `{"type":"service","name":"A","cost":"3"}`, `"cost" must be a whole number`},
		{"tax-rates", `{"type":"rate","name":"A","rate_ppm":8.875}`, `"rate_ppm" must be a whole number, without a fraction`},
		{"tax-rates", `{"type":"rate","name":"A","components":"taxratestate001"}`, `"components" must be an array of ids`},
		{"customers", `{"display_name":"A","billing_address":"1 Main St"}`, `"billing_address" must be an object`},
		{"customers", `{"display_name":"A","billing_address":{"line1":"1 Main St"}}`, `"billing_address" has no "line2": an address names every key`},
		{"customers", `{"display_name":"A","terms":"net_45"}`, `"terms" must be one of: due_on_receipt, net_10, net_15, net_30, net_60`},
		{"vendors", `{"display_name":"A","tax_id_type":"itin"}`, `"tax_id_type" must be one of: ein, ssn`},
		{"bundle-items", `{"bundle":"prodbundle00001"}`, `"product" is required`},
	} {
		f := newFakeBooks(t)
		_, _, err := runCmd(t, f.serve(), tc.input, "books", tc.resource, "add", "--input", "-")
		if got := exitcode.Of(err); got != exitcode.Usage {
			t.Errorf("%s %s: exit = %d, want 2; err: %v", tc.resource, tc.input, got, err)
			continue
		}
		if !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: error %q does not contain %q", tc.resource, err.Error(), tc.want)
		}
		if len(f.requests) != 0 {
			t.Errorf("%s: a request was sent: %v", tc.resource, f.requests)
		}
	}
}

// The input schema of a real resource says what the server takes: an address
// with every key or null, and null for a field that `edit` can clear.
func TestInputSchemaOfACustomer(t *testing.T) {
	raw, err := json.Marshal(inputSchema(findResource("customers"), true))
	if err != nil {
		t.Fatal(err)
	}
	var schema struct {
		Required   []string `json:"required"`
		Properties map[string]struct {
			Type                 any      `json:"type"`
			Required             []string `json:"required"`
			AdditionalProperties *bool    `json:"additionalProperties"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(schema.Required, []string{"display_name"}) {
		t.Errorf("required = %v", schema.Required)
	}
	address := schema.Properties["billing_address"]
	if !slices.Equal(address.Required, []string{"line1", "line2", "city", "region", "postal_code", "country"}) {
		t.Errorf("billing_address requires %v, want all six keys", address.Required)
	}
	if address.AdditionalProperties == nil || *address.AdditionalProperties {
		t.Error("billing_address must refuse a key that is no address part")
	}
	if !holds(address.Type, "null") || !holds(schema.Properties["email"].Type, "null") {
		t.Errorf("a field that can be cleared must allow null: %v, %v", address.Type, schema.Properties["email"].Type)
	}
	if holds(schema.Properties["display_name"].Type, "null") {
		t.Error("a required field must not allow null")
	}
}

// A list filter flag is an exact match on its field, bound as a value.
func TestResourceFilterFlags(t *testing.T) {
	f := newFakeBooks(t)
	f.add("books_tax_rates", "taxratestate001", map[string]any{"name": "State", "type": "rate", "agency": "agencystate0001", "inactive": false, "sort_key": "a"})
	f.add("books_tax_rates", "taxratecity0001", map[string]any{"name": "City", "type": "rate", "agency": "agencycity00001", "inactive": false, "sort_key": "b"})
	f.add("books_tax_rates", "taxrategroup001", map[string]any{"name": "Both", "type": "group", "agency": "", "inactive": false, "sort_key": "c"})
	c := f.serve()
	for _, tc := range []struct {
		args   []string
		filter string
		total  int
	}{
		{[]string{"--type", "rate"}, `inactive = false && type = "rate"`, 2},
		{[]string{"--agency", "agencycity00001"}, `inactive = false && agency = "agencycity00001"`, 1},
		{[]string{"--type", "group", "--search", "bo"}, `inactive = false && type = "group" && (name ~ "bo")`, 1},
		{[]string{"--agency", ""}, `inactive = false && agency = ""`, 1},
	} {
		out, _, err := runCmd(t, c, "", append([]string{"books", "tax-rates", "list", "--json"}, tc.args...)...)
		if err != nil {
			t.Fatalf("%v: %v", tc.args, err)
		}
		if got := f.lastQuery.Get("filter"); got != tc.filter {
			t.Errorf("%v: filter = %q, want %q", tc.args, got, tc.filter)
		}
		var listed listOut
		if jsonErr := json.Unmarshal([]byte(out), &listed); jsonErr != nil || listed.Total != tc.total {
			t.Errorf("%v: total = %d, want %d (%v)", tc.args, listed.Total, tc.total, jsonErr)
		}
	}
}
