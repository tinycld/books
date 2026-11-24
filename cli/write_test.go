package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

const newAccount = `{"name": "Petty Cash", "number": "1020", "type": "bank", "detail_type": "cash_on_hand"}`

func decodeRecord(t *testing.T, out string) map[string]any {
	t.Helper()
	var got map[string]any
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("stdout is not one JSON document: %v\n%s", err, out)
	}
	return got
}

func TestAddSendsExactlyTheInput(t *testing.T) {
	f := chart(t)
	out, errOut, err := runCmd(t, f.serve(), newAccount, "books", "accounts", "add", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	sent, _ := json.Marshal(f.lastCreate)
	if string(sent) != `{"detail_type":"cash_on_hand","name":"Petty Cash","number":"1020","type":"bank"}` {
		t.Errorf("the body sent = %s", sent)
	}
	got := decodeRecord(t, out)
	if got["id"] != "rec000000000001" || got["name"] != "Petty Cash" {
		t.Errorf("printed record = %v", got)
	}
	if !strings.Contains(errOut, "added account Petty Cash (rec000000000001)") {
		t.Errorf("stderr = %q", errOut)
	}
}

func TestAddFromAFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "account.json")
	if err := os.WriteFile(path, []byte(newAccount), 0o600); err != nil {
		t.Fatal(err)
	}
	f := chart(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "accounts", "add", "--input", path)
	if err != nil {
		t.Fatal(err)
	}
	if f.lastCreate["name"] != "Petty Cash" || !strings.Contains(out, "Petty Cash") {
		t.Errorf("created %v, printed:\n%s", f.lastCreate, out)
	}
}

func TestQuietAddPrintsOnlyTheRecord(t *testing.T) {
	out, errOut, err := runCmd(t, chart(t).serve(), newAccount, "books", "accounts", "add", "--input", "-", "--json", "--quiet")
	if err != nil {
		t.Fatal(err)
	}
	if errOut != "" {
		t.Errorf("--quiet must print nothing on stderr, got %q", errOut)
	}
	if got := decodeRecord(t, out); got["name"] != "Petty Cash" {
		t.Errorf("--quiet must still print the record, got %v", got)
	}
}

// The input schema must accept only what checkInput accepts: an agent builds
// input from it.
func TestInputSchemaMatchesCheckInput(t *testing.T) {
	res := &resource{Name: "things", Fields: []field{
		{Name: "name", Type: typeString, Required: true},
		{Name: "parent", Type: typeID, Ref: "things", Required: true},
		{Name: "note", Type: typeString},
		{Name: "price", Type: typeInteger},
	}}
	for _, create := range []bool{true, false} {
		props := inputSchema(res, create)["properties"].(map[string]any)
		for _, name := range []string{"name", "parent"} {
			if got := props[name].(map[string]any)["minLength"]; got != 1 {
				t.Errorf("create=%v: %s minLength = %v, want 1", create, name, got)
			}
		}
		if _, has := props["note"].(map[string]any)["minLength"]; has {
			t.Errorf("create=%v: an optional string accepts \"\" and must have no minLength", create)
		}
		description, _ := props["price"].(map[string]any)["description"].(string)
		if !strings.Contains(description, "a whole number written without a fraction or an exponent, within the 64-bit range") {
			t.Errorf("create=%v: price description = %q", create, description)
		}
	}
	// The output schema is shared with show and list and does not change.
	if _, has := fieldSchema(res.field("name"))["minLength"]; has {
		t.Error("fieldSchema must not carry minLength")
	}
}

// Every mistake the CLI can see is refused before a request is sent, with
// exit 2 and a message that names the field.
func TestAddRefusesBadInputBeforeSending(t *testing.T) {
	for _, tc := range []struct {
		name, input, want string
	}{
		{"unknown field", `{"name":"A","type":"bank","detail_type":"checking","colour":"red"}`, `accounts has no field "colour"; fields: name, number, type`},
		{"server field", `{"name":"A","type":"bank","detail_type":"checking","full_name":"A"}`, `"full_name" is set by the server`},
		{"system field", `{"id":"acct00000000001","name":"A","type":"bank","detail_type":"checking"}`, `"id" is set by the server`},
		{"missing required", `{"name":"A","type":"bank"}`, `"detail_type" is required`},
		{"null required", `{"name":null,"type":"bank","detail_type":"checking"}`, `"name" is required: it cannot be null`},
		{"empty required", `{"name":"","type":"bank","detail_type":"checking"}`, `"name" is required: it cannot be empty`},
		{"string for bool", `{"name":"A","type":"bank","detail_type":"checking","inactive":"yes"}`, `"inactive" must be true or false`},
		{"number for string", `{"name":7,"type":"bank","detail_type":"checking"}`, `"name" must be a string`},
		{"outside the select", `{"name":"A","type":"savings","detail_type":"checking"}`, `"type" must be one of: bank, accounts_receivable`},
		{"object for id", `{"name":"A","type":"bank","detail_type":"checking","parent":{"id":"x"}}`, `"parent" must be a string`},
	} {
		f := chart(t)
		out, _, err := runCmd(t, f.serve(), tc.input, "books", "accounts", "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage {
			t.Errorf("%s: exit = %d, want 2; err: %v", tc.name, got, err)
			continue
		}
		if !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: error %q does not contain %q", tc.name, err.Error(), tc.want)
		}
		if len(f.requests) != 0 {
			t.Errorf("%s: a request was sent: %v", tc.name, f.requests)
		}
		if !strings.Contains(out, `"code": "usage"`) {
			t.Errorf("%s: no JSON error document on stdout:\n%s", tc.name, out)
		}
	}
}

func TestCheckValueTypes(t *testing.T) {
	res := &resource{Name: "things", Fields: []field{
		{Name: "price", Type: typeInteger}, {Name: "quantity", Type: typeNumber},
		{Name: "components", Type: typeIDs}, {Name: "address", Type: typeAddress},
		{Name: "terms", Type: typeString, Enum: []string{"net_30"}},
	}}
	for _, tc := range []struct {
		input, want string
	}{
		{`{"price": 1250}`, ""},
		{`{"price": 12.5}`, `"price" must be a whole number, without a fraction`},
		{`{"price": 1e3}`, `"price" must be a whole number, without a fraction`},
		{`{"price": 1E3}`, `"price" must be a whole number, without a fraction`},
		{`{"price": 99999999999999999999}`, `"price" is too large: a whole number within the 64-bit range`},
		{`{"price": -99999999999999999999}`, `"price" is too large`},
		{`{"price": "1250"}`, `"price" must be a whole number`},
		{`{"price": 9007199254740991}`, ""},
		{`{"quantity": 2.5}`, ""},
		{`{"quantity": "2"}`, `"quantity" must be a number`},
		{`{"components": ["a", "b"]}`, ""},
		{`{"components": []}`, ""},
		{`{"components": "a"}`, `"components" must be an array of ids`},
		{`{"components": ["a", 2]}`, `each one a string`},
		{`{"address": {"line1": "1 Main St", "line2": "", "city": "Springfield", "region": "IL", "postal_code": "62701", "country": "US"}}`, ""},
		// The server refuses an address that does not name every key.
		{`{"address": {"line1": "1 Main St", "city": "Springfield"}}`, `"address" has no "line2": an address names every key (line1, line2, city, region, postal_code, country); a part with no value is ""`},
		{`{"address": {}}`, `"address" has no "line1"`},
		{`{"address": null}`, ""},
		{`{"address": "1 Main St"}`, `"address" must be an object with the keys line1, line2, city, region, postal_code, country, or null`},
		{`{"address": {"street": "1 Main St"}}`, `"address" has no key "street"`},
		// Two bad keys: the first in sorted order is always the one named.
		{`{"address": {"zeta": "1", "alpha": "2", "mid": "3"}}`, `"address" has no key "alpha"`},
		{`{"address": {"line2": 1, "line1": 2}}`, `"address": "line1" must be a string`},
		{`{"address": {"line1": 1, "line2": "", "city": "", "region": "", "postal_code": "", "country": ""}}`, `"address": "line1" must be a string`},
		{`{"terms": "net_30"}`, ""},
		{`{"terms": ""}`, ""},
		{`{"terms": null}`, ""},
		{`{"terms": "net_45"}`, `"terms" must be one of: net_30`},
	} {
		body, err := parseObject([]byte(tc.input))
		if err != nil {
			t.Fatalf("%s: %v", tc.input, err)
		}
		err = checkInput(res, body, false)
		switch {
		case tc.want == "" && err != nil:
			t.Errorf("%s: refused: %v", tc.input, err)
		case tc.want != "" && (err == nil || !strings.Contains(err.Error(), tc.want)):
			t.Errorf("%s: error = %v, want one that contains %q", tc.input, err, tc.want)
		}
	}
}

func TestAServerRefusalOfAnAddIsExit6WithItsFields(t *testing.T) {
	f := chart(t)
	f.refuse("POST", 400, `{"data":{"number":{"code":"validation_not_unique","message":"Value must be unique."}},"message":"Failed to create record.","status":400}`)
	out, _, err := runCmd(t, f.serve(), newAccount, "books", "accounts", "add", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused {
		t.Fatalf("exit = %d, want 6; err: %v", got, err)
	}
	var doc errorDoc
	if jsonErr := json.Unmarshal([]byte(out), &doc); jsonErr != nil {
		t.Fatalf("stdout: %v\n%s", jsonErr, out)
	}
	if doc.Error.Fields["number"].Message != "Value must be unique." {
		t.Errorf("error document = %+v", doc.Error)
	}
	if len(f.rows["books_accounts"]) != 4 {
		t.Error("the refused record was stored")
	}
}

func TestEditSendsOnlyTheNamedFields(t *testing.T) {
	f := chart(t)
	out, errOut, err := runCmd(t, f.serve(), `{"description": "Main account", "number": null}`,
		"books", "accounts", "edit", "acctchecking001", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	sent, _ := json.Marshal(f.lastPatch)
	if string(sent) != `{"description":"Main account","number":null}` {
		t.Errorf("the body sent = %s", sent)
	}
	got := decodeRecord(t, out)
	if got["description"] != "Main account" || got["name"] != "Checking" {
		t.Errorf("printed record = %v", got)
	}
	if !strings.Contains(errOut, "updated account Checking (acctchecking001)") {
		t.Errorf("stderr = %q", errOut)
	}
}

func TestEditRefusals(t *testing.T) {
	for _, tc := range []struct {
		name  string
		args  []string
		input string
		code  int
		want  string
	}{
		{"empty object", []string{"acctchecking001"}, `{}`, exitcode.Usage, "nothing to change"},
		{"no id", nil, `{"name":"A"}`, exitcode.Usage, "<id>"},
		{"server field", []string{"acctchecking001"}, `{"currency":"EUR"}`, exitcode.Usage, `"currency" is set by the server`},
		{"clearing a required field", []string{"acctchecking001"}, `{"name":null}`, exitcode.Usage, `"name" is required`},
		{"missing record", []string{"nope"}, `{"name":"A"}`, exitcode.NotFound, "account nope"},
	} {
		f := chart(t)
		args := append(append([]string{"books", "accounts", "edit"}, tc.args...), "--input", "-")
		_, _, err := runCmd(t, f.serve(), tc.input, args...)
		if got := exitcode.Of(err); got != tc.code {
			t.Errorf("%s: exit = %d, want %d; err: %v", tc.name, got, tc.code, err)
			continue
		}
		if !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: error %q does not contain %q", tc.name, err.Error(), tc.want)
		}
		if tc.code == exitcode.Usage && len(f.requests) != 0 {
			t.Errorf("%s: a request was sent: %v", tc.name, f.requests)
		}
	}
}

// An edit does not need the required fields: they keep their values.
func TestEditDoesNotAskForTheRequiredFields(t *testing.T) {
	f := chart(t)
	if _, _, err := runCmd(t, f.serve(), `{"inactive": true}`, "books", "accounts", "edit", "acctchecking001", "--input", "-"); err != nil {
		t.Fatal(err)
	}
	if f.find("books_accounts", "acctchecking001")["inactive"] != true {
		t.Error("the account was not changed")
	}
}
