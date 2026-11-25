package cli

import (
	"encoding/json"
	"maps"
	"strconv"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// cents is a whole number as the server sends it and the CLI reads it.
func cents(v int) json.Number {
	return json.Number(strconv.Itoa(v))
}

// addRow stores a row as the server would answer it: every declared field,
// empty unless values names it.
func (f *fakeBooks) addRow(collection, id string, values map[string]any) {
	row := map[string]any{}
	fields := fieldsOf(collection)
	for i := range fields {
		row[fields[i].Name] = emptyValue(&fields[i])
	}
	maps.Copy(row, values)
	f.add(collection, id, row)
}

// sales is the journal fixture with two invoices of customer custacme0000001:
//
//	invdraft0000001  draft   revision 3, an item line and a 10% discount line
//	invposted000001  posted  number 1001, one item line, two tax lines,
//	                         journal entry entryinvoice001 (two lines)
func sales(t *testing.T) *fakeBooks {
	t.Helper()
	f := journal(t)
	invoice := func(id, status, number, entry string, subtotal, tax, revision int) {
		f.addRow("books_invoices", id, map[string]any{
			"customer": "custacme0000001", "date": "2026-11-04", "due_date": "2026-12-04", "terms": "net_30",
			"tax_rate": "taxdenver000001", "message": "Thank you", "status": status, "number": number, "entry": entry,
			"subtotal": cents(subtotal), "tax_total": cents(tax), "total": cents(subtotal + tax), "balance": cents(subtotal + tax),
			"revision": cents(revision), "currency": "USD",
			// Columns the CLI leaves out.
			"public_token": "secret-token", "sequence": cents(1001),
		})
	}
	line := func(id, invoiceID, kind string, position int, values map[string]any) {
		row := map[string]any{"invoice": invoiceID, "kind": kind, "position": cents(position)}
		maps.Copy(row, values)
		f.addRow("books_invoice_lines", id, row)
	}
	item := map[string]any{"product": "prodservice0001", "quantity": json.Number("2"), "rate": cents(18900), "taxable": true, "amount": cents(37800)}
	invoice("invdraft0000001", "draft", "", "", 34020, 2963, 3)
	line("invline00000002", "invdraft0000001", "percent", 1, map[string]any{"product": "proddiscount001", "percent_ppm": cents(-100000), "taxable": true, "amount": cents(-3780)})
	line("invline00000001", "invdraft0000001", "item", 0, item)
	invoice("invposted000001", "posted", "1001", "entryinvoice001", 37800, 1474, 1)
	line("invline00000003", "invposted000001", "item", 0, item)
	taxLine := func(id string, position, ppm, amount int) {
		f.addRow("books_invoice_tax_lines", id, map[string]any{
			"invoice": "invposted000001", "position": cents(position), "rate": "taxdenver000001", "component": "taxcomponent" + strconv.Itoa(position) + "00",
			"agency": "taxagency000001", "rate_ppm": cents(ppm), "gross_amount": cents(37800), "taxable_amount": cents(37800), "amount": cents(amount),
			"date": "2026-11-04", "currency": "USD",
		})
	}
	taxLine("invtax000000002", 1, 10000, 378)
	taxLine("invtax000000001", 0, 29000, 1096)
	entryLine := func(id, account string, debit, credit, position int) {
		f.addRow("books_journal_lines", id, map[string]any{
			"entry": "entryinvoice001", "account": account, "debit": cents(debit), "credit": cents(credit), "position": cents(position),
		})
	}
	entryLine("lineinvoice0001", "acctchecking001", 39274, 0, 0)
	entryLine("lineinvoice0002", "acctincome00001", 0, 39274, 1)
	return f
}

const newInvoice = `{"customer": "custacme0000001", "date": "2026-11-04", "due_date": "2026-12-04", "tax_rate": "taxdenver000001", "lines": [
	{"kind": "item", "product": "prodservice0001", "quantity": 2, "rate": 18900, "taxable": true},
	{"kind": "percent", "product": "proddiscount001", "percent_ppm": -100000, "taxable": true},
	{"kind": "description", "description": "Thank you"}]}`

// The batch of `invoices add --post`. server/cli_invoices_test.go
// (TestCLIDocuments_InvoiceRoundTrip) sends a copy of it to the real server.
func TestInvoiceAddSendsTheLinesAndNoTaxLine(t *testing.T) {
	f := sales(t)
	fixedIDs(t, "invnew000000001")
	out, errOut, err := runCmd(t, f.serve(), newInvoice, "books", "invoices", "add", "--input", "-", "--post", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_invoices/records","body":{"customer":"custacme0000001","date":"2026-11-04","due_date":"2026-12-04","id":"invnew000000001","status":"draft","tax_rate":"taxdenver000001"}},` +
		`{"method":"POST","url":"/api/collections/books_invoice_lines/records","body":{"invoice":"invnew000000001","kind":"item","position":0,"product":"prodservice0001","quantity":2,"rate":18900,"taxable":true}},` +
		`{"method":"POST","url":"/api/collections/books_invoice_lines/records","body":{"invoice":"invnew000000001","kind":"percent","percent_ppm":-100000,"position":1,"product":"proddiscount001","taxable":true}},` +
		`{"method":"POST","url":"/api/collections/books_invoice_lines/records","body":{"description":"Thank you","invoice":"invnew000000001","kind":"description","position":2}},` +
		`{"method":"PATCH","url":"/api/collections/books_invoices/records/invnew000000001","body":{"revision":1,"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(out, `"tax_lines": []`) || !strings.Contains(out, `"lines": [`) {
		t.Errorf("the printed invoice has no lines or no tax_lines key:\n%s", out)
	}
	if !strings.Contains(errOut, "added and posted invoice") {
		t.Errorf("stderr = %q", errOut)
	}
}

func TestInvoiceShowPrintsTheLinesAndTheTaxLinesBooksWrote(t *testing.T) {
	f := sales(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "invoices", "show", "invposted000001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Number   string                         `json:"number"`
		Total    json.Number                    `json:"total"`
		Entry    string                         `json:"entry"`
		Lines    []struct{ Amount json.Number } `json:"lines"`
		TaxLines []struct {
			ID      string      `json:"id"`
			RatePpm json.Number `json:"rate_ppm"`
			Amount  json.Number `json:"amount"`
		} `json:"tax_lines"`
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("stdout is not one JSON document: %v\n%s", err, out)
	}
	if got.Number != "1001" || got.Total != "39274" || got.Entry != "entryinvoice001" || len(got.Lines) != 1 || got.Lines[0].Amount != "37800" {
		t.Errorf("invoice = %+v", got)
	}
	if len(got.TaxLines) != 2 || got.TaxLines[0].ID != "invtax000000001" || got.TaxLines[0].Amount != "1096" || got.TaxLines[1].RatePpm != "10000" {
		t.Errorf("tax lines = %+v", got.TaxLines)
	}
	for _, absent := range []string{"public_token", "secret-token", `"sequence"`, `"position"`} {
		if strings.Contains(out, absent) {
			t.Errorf("the invoice has %s:\n%s", absent, out)
		}
	}
	table, _, err := runCmd(t, f.serve(), "", "books", "invoices", "show", "invposted000001")
	if err != nil || !strings.Contains(table, "TAX_LINES") || !strings.Contains(table, "RATE_PPM") {
		t.Errorf("the table has no tax lines (%v):\n%s", err, table)
	}
}

func TestInvoiceInputRefusesWhatBooksComputes(t *testing.T) {
	f := sales(t)
	cases := []struct{ name, input, want string }{
		{"tax lines", `{"customer":"c","date":"2026-11-04","due_date":"2026-12-04","tax_lines":[]}`, `"tax_lines" is set by the server`},
		{"a line amount", `{"customer":"c","date":"2026-11-04","due_date":"2026-12-04","lines":[{"kind":"item","amount":5}]}`, `lines[0]: "amount" is set by the server`},
		{"a total", `{"customer":"c","date":"2026-11-04","due_date":"2026-12-04","total":5}`, `"total" is set by the server`},
		{"a line of no kind", `{"customer":"c","date":"2026-11-04","due_date":"2026-12-04","lines":[{"kind":"discount"}]}`, `lines[0]: "kind"`},
		{"an unknown field names the tables a caller can send", `{"customer":"c","date":"2026-11-04","due_date":"2026-12-04","taxes":[]}`, `message, memo, lines`},
	}
	for _, tc := range cases {
		_, _, err := runCmd(t, f.serve(), tc.input, "books", "invoices", "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: exit = %d, err = %v, want one that says %q", tc.name, got, err, tc.want)
		}
	}
	if len(f.requests) != 0 {
		t.Errorf("a refused input sent %v", f.requests)
	}
	out, _, err := runCmd(t, nil, "", "books", "schema", "invoices", "add", "--json")
	if err != nil {
		t.Fatal(err)
	}
	input := out[strings.Index(out, `"input"`):strings.Index(out, `"output"`)]
	if strings.Contains(input, "tax_lines") || !strings.Contains(out[strings.Index(out, `"output"`):], "tax_lines") {
		t.Errorf("tax_lines must be in the output schema only:\n%s", out)
	}
}

func TestInvoiceEditOfADraftLeavesTheTaxLinesToBooks(t *testing.T) {
	f := sales(t)
	_, _, err := runCmd(t, f.serve(), `{"memo": "Net 30", "lines": [{"kind": "item", "product": "prodservice0001", "quantity": 1, "rate": 5000}]}`,
		"books", "invoices", "edit", "invdraft0000001", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"DELETE","url":"/api/collections/books_invoice_lines/records/invline00000001"},` +
		`{"method":"DELETE","url":"/api/collections/books_invoice_lines/records/invline00000002"},` +
		`{"method":"POST","url":"/api/collections/books_invoice_lines/records","body":{"invoice":"invdraft0000001","kind":"item","position":0,"product":"prodservice0001","quantity":1,"rate":5000}},` +
		`{"method":"PATCH","url":"/api/collections/books_invoices/records/invdraft0000001","body":{"memo":"Net 30","revision":4}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
}

// A correction copies what a caller can send: not the amount of a line, and
// no tax line. Books computes both again for the new invoice.
func TestInvoiceEditOfAPostedInvoiceCopiesOnlyWhatACallerSends(t *testing.T) {
	f := sales(t)
	fixedIDs(t, "invnew000000001")
	_, errOut, err := runCmd(t, f.serve(), `{"memo": "Corrected"}`, "books", "invoices", "edit", "invposted000001", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_invoices/records","body":{"customer":"custacme0000001","date":"2026-11-04","due_date":"2026-12-04","email":"","id":"invnew000000001","memo":"Corrected","message":"Thank you","replaces":"invposted000001","status":"draft","tax_rate":"taxdenver000001","terms":"net_30"}},` +
		`{"method":"POST","url":"/api/collections/books_invoice_lines/records","body":{"description":"","invoice":"invnew000000001","kind":"item","percent_ppm":0,"position":0,"product":"prodservice0001","quantity":2,"rate":18900,"taxable":true}},` +
		`{"method":"PATCH","url":"/api/collections/books_invoices/records/invnew000000001","body":{"revision":1,"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(errOut, "corrected invoice 1001: it is void, and invnew000000001 (invnew000000001) is posted in its place") {
		t.Errorf("stderr = %q", errOut)
	}
}

func TestInvoiceEntryPrintsTheJournalEntryWithItsLines(t *testing.T) {
	f := sales(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "invoices", "entry", "invposted000001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		ID      string `json:"id"`
		DocType string `json:"doc_type"`
		Lines   []struct {
			Account string      `json:"account"`
			Debit   json.Number `json:"debit"`
			Credit  json.Number `json:"credit"`
		} `json:"lines"`
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("stdout is not one JSON document: %v\n%s", err, out)
	}
	if got.ID != "entryinvoice001" || got.DocType != "invoice" || len(got.Lines) != 2 || got.Lines[0].Debit != "39274" || got.Lines[1].Account != "acctincome00001" {
		t.Errorf("entry = %+v", got)
	}
	// The same document `journal-entries show` prints for that id.
	same, _, err := runCmd(t, f.serve(), "", "books", "journal-entries", "show", "entryinvoice001", "--json")
	if err != nil || same != out {
		t.Errorf("`invoices entry` and `journal-entries show` differ (%v):\n%s\n%s", err, out, same)
	}
	schema, _, err := runCmd(t, nil, "", "books", "schema", "invoices", "entry", "--json")
	if err != nil || !strings.Contains(schema, `"doc_type"`) || !strings.Contains(schema, `"debit"`) {
		t.Errorf("the schema of `invoices entry` is not a journal entry (%v):\n%s", err, schema)
	}
}

func TestInvoiceEntryOfADraftIsARefusalAndOfAMissingInvoiceIsNotFound(t *testing.T) {
	f := sales(t)
	_, _, err := runCmd(t, f.serve(), "", "books", "invoices", "entry", "invdraft0000001", "--json")
	want := "invoice invdraft0000001 is draft: it has no journal entry; Books writes one when the invoice is posted: post it with `tinycld books invoices post`"
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), want) {
		t.Errorf("a draft: exit = %d, err = %v", got, err)
	}
	if last := f.requests[len(f.requests)-1]; last != "GET /api/collections/books_invoices/records/invdraft0000001" {
		t.Errorf("after the invoice the command sent %s", last)
	}
	_, _, err = runCmd(t, f.serve(), "", "books", "invoices", "entry", "nosuchinvoice01", "--json")
	if got := exitcode.Of(err); got != exitcode.NotFound || !strings.Contains(err.Error(), "invoice nosuchinvoice01") {
		t.Errorf("a missing invoice: exit = %d, err = %v", got, err)
	}
	// A posted or void invoice with no entry is not told to post.
	f.addRow("books_invoices", "invnoentry00001", map[string]any{"status": "posted", "entry": ""})
	_, _, err = runCmd(t, f.serve(), "", "books", "invoices", "entry", "invnoentry00001", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused || err.Error() != "invoice invnoentry00001 is posted and has no journal entry" {
		t.Errorf("a posted invoice with no entry: exit = %d, err = %v", got, err)
	}
	// The entry is gone, or the caller may not read it: the error says whose it is.
	f.addRow("books_invoices", "invorphan000001", map[string]any{"status": "posted", "entry": "nosuchentry0001"})
	_, _, err = runCmd(t, f.serve(), "", "books", "invoices", "entry", "invorphan000001", "--json")
	if got := exitcode.Of(err); got != exitcode.NotFound || !strings.Contains(err.Error(), "the journal entry of invoice invorphan000001: journal entry nosuchentry0001") {
		t.Errorf("a missing entry: exit = %d, err = %v", got, err)
	}
}

func TestEntryCommandIsOnlyOnATypeThatHasAnEntry(t *testing.T) {
	root := newTestRoot(nil)
	for name, want := range map[string]string{
		"invoices":        "add,delete,edit,entry,list,post,show,void",
		"journal-entries": "add,delete,edit,list,post,show,void",
	} {
		group, _, err := root.Find([]string{"books", name})
		if err != nil {
			t.Fatal(err)
		}
		if got := strings.Join(subcommandNames(group), ","); got != want {
			t.Errorf("%s: commands = %s, want %s", name, got, want)
		}
	}
}

func TestLoadDocumentsChecksTheEntryField(t *testing.T) {
	withEntry := strings.Replace(minimalDocument, `"lifecycle":"posting",`, `"lifecycle":"posting","entry":"title",`, 1)
	if _, err := loadDocuments([]byte(withEntry)); err == nil || !strings.Contains(err.Error(), `entry names "title", which is not a read-only id of journal-entries`) {
		t.Errorf("entry on a text field: err = %v", err)
	}
	readOnly := strings.Replace(minimalDocument, `"parent":"note",`, `"parent":"note","readOnly":true,`, 1)
	docs, err := loadDocuments([]byte(readOnly))
	if err != nil {
		t.Fatal(err)
	}
	body, _ := parseObject([]byte(`{"title":"x","lines":[]}`))
	if _, err := checkDocumentInput(&docs[0], "tinycld books "+docs[0].Name, body, true); err == nil || !strings.Contains(err.Error(), `"lines" is set by the server`) {
		t.Errorf("a read-only table in the input: err = %v", err)
	}
}
