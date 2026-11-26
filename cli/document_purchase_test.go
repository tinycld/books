package cli

import (
	"encoding/json"
	"maps"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// purchaseTypes are the purchase documents. header is the inside of an `add`
// input that has every required field; sentHeader is what the CLI sends for it.
var purchaseTypes = []struct {
	name, singular, collection, lines, parent string
	header, sentHeader                        string
	required                                  string
}{
	{"bills", "bill", "books_bills", "books_bill_lines", "bill",
		`"vendor": "vendsummit00001", "date": "2026-11-04", "due_date": "2026-12-04", "ref_no": "S-88"`,
		`"date":"2026-11-04","due_date":"2026-12-04","id":"buynew000000001","ref_no":"S-88","status":"draft","vendor":"vendsummit00001"`,
		"due_date"},
	{"expenses", "expense", "books_expenses", "books_expense_lines", "expense",
		`"vendor": "vendsummit00001", "date": "2026-11-04", "paid_from": "acctchecking001", "payment_method": "check"`,
		`"date":"2026-11-04","id":"buynew000000001","paid_from":"acctchecking001","payment_method":"check","status":"draft","vendor":"vendsummit00001"`,
		"paid_from"},
	{"vendor-credits", "vendor credit", "books_vendor_credits", "books_vendor_credit_lines", "vendor_credit",
		`"vendor": "vendsummit00001", "date": "2026-11-04"`,
		`"date":"2026-11-04","id":"buynew000000001","status":"draft","vendor":"vendsummit00001"`,
		"vendor"},
}

const purchaseLines = `"lines": [
	{"kind": "account", "account": "acctsoftware001", "description": "Design tools", "amount": 4500},
	{"kind": "item", "product": "prodwidget00001", "quantity": 4, "rate": 500}]`

// The batch of `add --post` of each type: an account line with its amount and
// an item line with none. server/cli_purchases_test.go sends a copy of each.
func TestPurchasesAddAndPostInOneBatch(t *testing.T) {
	for _, tc := range purchaseTypes {
		t.Run(tc.name, func(t *testing.T) {
			f := sales(t)
			fixedIDs(t, "buynew000000001")
			out, errOut, err := runCmd(t, f.serve(), `{`+tc.header+`, `+purchaseLines+`}`, "books", tc.name, "add", "--input", "-", "--post", "--json")
			if err != nil {
				t.Fatal(err)
			}
			// Marshal sorts the keys, as the batch does: the parent's name differs by type.
			account, _ := json.Marshal(map[string]any{"kind": "account", "account": "acctsoftware001", "description": "Design tools", "amount": 4500, "position": 0, tc.parent: "buynew000000001"})
			item, _ := json.Marshal(map[string]any{"kind": "item", "product": "prodwidget00001", "quantity": 4, "rate": 500, "position": 1, tc.parent: "buynew000000001"})
			want := `[` +
				`{"method":"POST","url":"/api/collections/` + tc.collection + `/records","body":{` + tc.sentHeader + `}},` +
				`{"method":"POST","url":"/api/collections/` + tc.lines + `/records","body":` + string(account) + `},` +
				`{"method":"POST","url":"/api/collections/` + tc.lines + `/records","body":` + string(item) + `},` +
				`{"method":"PATCH","url":"/api/collections/` + tc.collection + `/records/buynew000000001","body":{"revision":1,"status":"posted"}}]`
			if got := sentBatch(t, f, 0); got != want {
				t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
			}
			if !strings.Contains(out, `"status": "posted"`) || !strings.Contains(out, `"kind": "account"`) || strings.Contains(out, "tax_lines") {
				t.Errorf("the printed %s:\n%s", tc.singular, out)
			}
			if !strings.Contains(errOut, "added and posted "+tc.singular) {
				t.Errorf("stderr = %q", errOut)
			}
		})
	}
}

func TestPurchasesCheckTheInputAndHaveEveryCommand(t *testing.T) {
	root := newTestRoot(nil)
	for _, tc := range purchaseTypes {
		f := sales(t)
		_, _, err := runCmd(t, f.serve(), `{"date": "2026-11-04", "memo": "x"}`, "books", tc.name, "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), "is required") {
			t.Errorf("%s with no required field: exit = %d, err = %v", tc.name, got, err)
		}
		without := strings.Replace(tc.header, `"`+tc.required+`"`, `"memo"`, 1)
		_, _, err = runCmd(t, f.serve(), `{`+without+`}`, "books", tc.name, "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), `"`+tc.required+`" is required`) {
			t.Errorf("%s with no %s: exit = %d, err = %v", tc.name, tc.required, got, err)
		}
		// Books computes the amount of an item line and refuses one that is sent.
		_, _, err = runCmd(t, f.serve(), `{`+tc.header+`, "lines": [{"kind": "account", "account": "acctsoftware001", "amount": 1}, {"kind": "item", "product": "prodwidget00001", "quantity": 4, "rate": 500, "amount": 2000}]}`,
			"books", tc.name, "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), `lines[1]: Books computes "amount" of a row with the kind "item": leave it out`) {
			t.Errorf("%s with an item amount: exit = %d, err = %v", tc.name, got, err)
		}
		_, _, err = runCmd(t, f.serve(), `{`+tc.header+`, "lines": [{"kind": "percent"}]}`, "books", tc.name, "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), "lines[0]") {
			t.Errorf("%s with a sales line kind: exit = %d, err = %v", tc.name, got, err)
		}
		for _, name := range []string{"total", "balance", "tax_rate"} {
			_, _, err = runCmd(t, f.serve(), `{`+tc.header+`, "`+name+`": 1}`, "books", tc.name, "add", "--input", "-", "--json")
			if got := exitcode.Of(err); got != exitcode.Usage {
				t.Errorf("%s with %s: exit = %d, err = %v", tc.name, name, got, err)
			}
		}
		if len(f.requests) != 0 {
			t.Errorf("%s: a refused input sent %v", tc.name, f.requests)
		}
		group, _, err := root.Find([]string{"books", tc.name})
		if err != nil {
			t.Fatal(err)
		}
		if got := strings.Join(subcommandNames(group), ","); got != postingCommands(tc.name) {
			t.Errorf("%s: commands = %s", tc.name, got)
		}
		alias := strings.ReplaceAll(tc.singular, " ", "-")
		if found, _, err := root.Find([]string{"books", alias, "show"}); err != nil || found.Name() != "show" {
			t.Errorf("the alias %s: %v", alias, err)
		}
	}
}

// A correction copies the lines of the posted document. The stored item line
// has the amount Books computed; sending it back would be refused, so it is
// left out. The amount of an account line is the caller's, and is kept. The
// header is sent with every stored value, the empty text ones too (the
// document's `terms`, `reference_no` or `ref_no`); an address the server holds
// as null is left out. server/cli_purchases_test.go sends a copy of each body.
func TestPurchaseCorrectionLeavesOutTheAmountBooksComputes(t *testing.T) {
	corrections := map[string]struct {
		stored map[string]any
		header string
	}{
		"bills": {
			map[string]any{"due_date": "2026-12-04", "ref_no": "S-88", "mailing_address": nil},
			`"date":"2026-11-04","due_date":"2026-12-04","id":"buynew000000001","memo":"Corrected","ref_no":"S-88","replaces":"buyposted00001","status":"draft","terms":"","vendor":"vendsummit00001"`,
		},
		"expenses": {
			map[string]any{"paid_from": "acctchecking001", "payment_method": "check"},
			`"date":"2026-11-04","id":"buynew000000001","memo":"Corrected","paid_from":"acctchecking001","payment_method":"check","reference_no":"","replaces":"buyposted00001","status":"draft","vendor":"vendsummit00001"`,
		},
		"vendor-credits": {
			map[string]any{},
			`"date":"2026-11-04","id":"buynew000000001","memo":"Corrected","ref_no":"","replaces":"buyposted00001","status":"draft","vendor":"vendsummit00001"`,
		},
	}
	for _, tc := range purchaseTypes {
		t.Run(tc.name, func(t *testing.T) {
			want := corrections[tc.name]
			f := sales(t)
			header := map[string]any{
				"vendor": "vendsummit00001", "date": "2026-11-04", "status": "posted", "number": "1001",
				"total": cents(6500), "revision": cents(1),
			}
			maps.Copy(header, want.stored)
			f.addRow(tc.collection, "buyposted00001", header)
			f.addRow(tc.lines, "buyline0000001", map[string]any{
				tc.parent: "buyposted00001", "position": cents(0), "kind": "account", "account": "acctsoftware001",
				"description": "Design tools", "amount": cents(4500),
			})
			f.addRow(tc.lines, "buyline0000002", map[string]any{
				tc.parent: "buyposted00001", "position": cents(1), "kind": "item", "product": "prodwidget00001",
				"quantity": cents(4), "rate": cents(500), "amount": cents(2000),
			})
			fixedIDs(t, "buynew000000001")
			if _, _, err := runCmd(t, f.serve(), `{"memo": "Corrected"}`, "books", tc.name, "edit", "buyposted00001", "--input", "-", "--json"); err != nil {
				t.Fatal(err)
			}
			url := "/api/collections/" + tc.lines + "/records"
			account, _ := json.Marshal(map[string]any{"account": "acctsoftware001", "amount": 4500, "description": "Design tools", "kind": "account", "position": 0, "product": "", "quantity": 0, "rate": 0, tc.parent: "buynew000000001"})
			item, _ := json.Marshal(map[string]any{"account": "", "description": "", "kind": "item", "position": 1, "product": "prodwidget00001", "quantity": 4, "rate": 500, tc.parent: "buynew000000001"})
			got := `[` +
				`{"method":"POST","url":"/api/collections/` + tc.collection + `/records","body":{` + want.header + `}},` +
				`{"method":"POST","url":"` + url + `","body":` + string(account) + `},` +
				`{"method":"POST","url":"` + url + `","body":` + string(item) + `},` +
				`{"method":"PATCH","url":"/api/collections/` + tc.collection + `/records/buynew000000001","body":{"revision":1,"status":"posted"}}]`
			if sent := sentBatch(t, f, 0); sent != got {
				t.Errorf("the batch:\n%s\nwant:\n%s", sent, got)
			}
		})
	}
}

func TestLoadDocumentsChecksAComputedField(t *testing.T) {
	cases := []struct{ name, old, new, want string }{
		{"a field the table has not", `"field": "amount",`, `"field": "total",`, `computed names "total"`},
		{"a read-only field", `{ "name": "amount", "type": "integer", "help": "the amount of an account line, in cents; Books computes`,
			`{ "name": "amount", "type": "integer", "readOnly": true, "help": "the amount of an account line, in cents; Books computes`, `computed names "amount", which is not an optional field`},
		{"a required field", `"field": "amount",`, `"field": "kind",`, `computed names "kind", which is not an optional field`},
		{"a when that is no field", `"when": "kind",`, `"when": "type",`, `when names "type", which is not a field`},
		{"a value the when field has not", `"is": ["item"]`, `"is": ["percent"]`, `"percent" is not a value of kind`},
		{"no value", `"is": ["item"]`, `"is": []`, `computed "amount": is names no value`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if !strings.Contains(string(documentsJSON), tc.old) {
				t.Fatalf("documents.json has no %s", tc.old)
			}
			_, err := loadDocuments([]byte(strings.Replace(string(documentsJSON), tc.old, tc.new, 1)))
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %v, want one that says %q", err, tc.want)
			}
		})
	}
}
