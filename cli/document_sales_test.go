package cli

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// salesTypes are the sales documents that share the line shape of an invoice.
// header is the inside of an `add` input that has every required field.
var salesTypes = []struct {
	name, singular, collection, lines, taxLines, parent string
	header, sentHeader                                  string
	required                                            string
}{
	{"sales-receipts", "sales receipt", "books_sales_receipts", "books_sales_receipt_lines", "books_sales_receipt_tax_lines", "sales_receipt",
		`"date": "2026-11-04", "deposit_to": "acctchecking001", "payment_method": "check", "reference_no": "1041"`,
		`"date":"2026-11-04","deposit_to":"acctchecking001","id":"salesnew0000001","payment_method":"check","reference_no":"1041","status":"draft"`,
		"deposit_to"},
	{"credit-memos", "credit memo", "books_credit_memos", "books_credit_memo_lines", "books_credit_memo_tax_lines", "credit_memo",
		`"customer": "custacme0000001", "date": "2026-11-04", "invoice": "invposted000001"`,
		`"customer":"custacme0000001","date":"2026-11-04","id":"salesnew0000001","invoice":"invposted000001","status":"draft"`,
		"customer"},
	{"refund-receipts", "refund receipt", "books_refund_receipts", "books_refund_receipt_lines", "books_refund_receipt_tax_lines", "refund_receipt",
		`"customer": "custacme0000001", "date": "2026-11-04", "refund_from": "acctchecking001", "payment_method": "check"`,
		`"customer":"custacme0000001","date":"2026-11-04","id":"salesnew0000001","payment_method":"check","refund_from":"acctchecking001","status":"draft"`,
		"refund_from"},
}

// The batch of `add --post` of each type. server/cli_sales_documents_test.go
// sends a copy of each to the real server.
func TestSalesDocumentsAddAndPostInOneBatch(t *testing.T) {
	for _, tc := range salesTypes {
		t.Run(tc.name, func(t *testing.T) {
			f := sales(t)
			fixedIDs(t, "salesnew0000001")
			input := `{` + tc.header + `, "lines": [{"kind": "item", "product": "prodservice0001", "quantity": 1, "rate": 5000, "taxable": true}]}`
			out, errOut, err := runCmd(t, f.serve(), input, "books", tc.name, "add", "--input", "-", "--post", "--json")
			if err != nil {
				t.Fatal(err)
			}
			// Marshal sorts the keys, as the batch does: the parent's name differs by type.
			line, _ := json.Marshal(map[string]any{
				"kind": "item", "position": 0, "product": "prodservice0001", "quantity": 1, "rate": 5000, tc.parent: "salesnew0000001", "taxable": true,
			})
			want := `[` +
				`{"method":"POST","url":"/api/collections/` + tc.collection + `/records","body":{` + tc.sentHeader + `}},` +
				`{"method":"POST","url":"/api/collections/` + tc.lines + `/records","body":` + string(line) + `},` +
				`{"method":"PATCH","url":"/api/collections/` + tc.collection + `/records/salesnew0000001","body":{"revision":1,"status":"posted"}}]`
			if got := sentBatch(t, f, 0); got != want {
				t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
			}
			if !strings.Contains(out, `"status": "posted"`) || !strings.Contains(out, `"tax_lines": []`) {
				t.Errorf("the printed %s:\n%s", tc.singular, out)
			}
			if !strings.Contains(errOut, "added and posted "+tc.singular) {
				t.Errorf("stderr = %q", errOut)
			}
		})
	}
}

func TestSalesDocumentsShowTheirOwnLinesTaxLinesAndEntry(t *testing.T) {
	for _, tc := range salesTypes {
		t.Run(tc.name, func(t *testing.T) {
			f := sales(t)
			f.addRow(tc.collection, "salesposted0001", map[string]any{"date": "2026-11-04", "status": "posted", "number": "1001", "entry": "entryinvoice001", "total": cents(5436)})
			f.addRow(tc.lines, "salesline000001", map[string]any{tc.parent: "salesposted0001", "position": cents(0), "kind": "item", "amount": cents(5000)})
			f.addRow(tc.lines, "salesline000002", map[string]any{tc.parent: "anotherdocument", "position": cents(0), "kind": "item"})
			f.addRow(tc.taxLines, "salestax0000001", map[string]any{tc.parent: "salesposted0001", "position": cents(0), "rate_ppm": cents(87100), "amount": cents(436)})
			out, _, err := runCmd(t, f.serve(), "", "books", tc.name, "show", "salesposted0001", "--json")
			if err != nil {
				t.Fatal(err)
			}
			if strings.Count(out, `"kind": "item"`) != 1 || !strings.Contains(out, `"amount": 5000`) || !strings.Contains(out, `"rate_ppm": 87100`) {
				t.Errorf("the printed %s:\n%s", tc.singular, out)
			}
			if got, want := f.lastQuery.Get("filter"), fmt.Sprintf(`%s = "salesposted0001"`, tc.parent); got != want {
				t.Errorf("the tax lines were asked for with %q, want %q", got, want)
			}
			entry, _, err := runCmd(t, f.serve(), "", "books", tc.name, "entry", "salesposted0001", "--json")
			if err != nil || !strings.Contains(entry, `"id": "entryinvoice001"`) || !strings.Contains(entry, `"debit": 39274`) {
				t.Errorf("entry (%v):\n%s", err, entry)
			}
		})
	}
}

func TestSalesDocumentsCheckTheInputAndHaveEveryCommand(t *testing.T) {
	root := newTestRoot(nil)
	for _, tc := range salesTypes {
		f := sales(t)
		_, _, err := runCmd(t, f.serve(), `{"date": "2026-11-04", "memo": "x"}`, "books", tc.name, "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), `"`+tc.required+`" is required`) {
			t.Errorf("%s with no %s: exit = %d, err = %v", tc.name, tc.required, got, err)
		}
		_, _, err = runCmd(t, f.serve(), `{`+tc.header+`, "tax_lines": [{"amount": 1}]}`, "books", tc.name, "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), `"tax_lines" is set by the server`) {
			t.Errorf("%s with tax lines: exit = %d, err = %v", tc.name, got, err)
		}
		if len(f.requests) != 0 {
			t.Errorf("%s: a refused input sent %v", tc.name, f.requests)
		}
		group, _, err := root.Find([]string{"books", tc.name})
		if err != nil {
			t.Fatal(err)
		}
		if got := strings.Join(subcommandNames(group), ","); got != "add,delete,edit,entry,list,post,show,void" {
			t.Errorf("%s: commands = %s", tc.name, got)
		}
		alias := strings.ReplaceAll(tc.singular, " ", "-")
		if found, _, err := root.Find([]string{"books", alias, "show"}); err != nil || found.Name() != "show" {
			t.Errorf("the alias %s: %v", alias, err)
		}
	}
	// A choice value is checked before anything is sent.
	f := sales(t)
	_, _, err := runCmd(t, f.serve(), `{"date": "2026-11-04", "deposit_to": "acctchecking001", "payment_method": "cheque"}`, "books", "sales-receipts", "add", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), "payment_method") || len(f.requests) != 0 {
		t.Errorf("an unknown payment method: exit = %d, err = %v, sent %v", got, err, f.requests)
	}
}

// A correction of a refund receipt keeps the links to the sale it refunds.
func TestRefundReceiptCorrectionKeepsItsLinks(t *testing.T) {
	f := sales(t)
	f.addRow("books_refund_receipts", "refundposted001", map[string]any{
		"customer": "custacme0000001", "date": "2026-11-04", "refund_from": "acctchecking001", "payment_method": "check",
		"sales_receipt": "salesposted0001", "status": "posted", "number": "1001", "revision": cents(1),
	})
	fixedIDs(t, "refundnew000001")
	if _, _, err := runCmd(t, f.serve(), `{"memo": "Corrected"}`, "books", "refund-receipts", "edit", "refundposted001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_refund_receipts/records","body":{"credit_memo":"","customer":"custacme0000001","date":"2026-11-04","email":"","id":"refundnew000001","memo":"Corrected","message":"","payment_method":"check","reference_no":"","refund_from":"acctchecking001","replaces":"refundposted001","sales_receipt":"salesposted0001","status":"draft","tax_rate":""}},` +
		`{"method":"PATCH","url":"/api/collections/books_refund_receipts/records/refundnew000001","body":{"revision":1,"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
}
