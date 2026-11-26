package cli

import (
	"net/http"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

func TestEstimateHasConvert(t *testing.T) {
	group, _, err := newTestRoot(nil).Find([]string{"books", "estimates"})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(subcommandNames(group), ","); got != "accept,add,convert,delete,edit,list,reject,reopen,show" {
		t.Errorf("commands = %s", got)
	}
	// Only a type with a rule for it has the command.
	invoices, _, _ := newTestRoot(nil).Find([]string{"books", "invoices"})
	if strings.Contains(strings.Join(subcommandNames(invoices), ","), "convert") {
		t.Error("invoices has a convert command")
	}
}

// The batch of `convert`. server/cli_estimate_convert_test.go sends a copy.
func TestEstimateConvertMakesADraftInvoiceInOneBatch(t *testing.T) {
	f := quotes(t)
	fixedIDs(t, "invfromest00001")
	out, errOut, err := runCmd(t, f.serve(), `{"date": "2026-11-06", "due_date": "2026-12-06"}`, "books", "estimates", "convert", "estpending00001", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_invoices/records","body":{"customer":"custacme0000001","date":"2026-11-06","due_date":"2026-12-06","email":"","estimate":"estpending00001","id":"invfromest00001","status":"draft","tax_rate":"taxdenver000001"}},` +
		`{"method":"POST","url":"/api/collections/books_invoice_lines/records","body":{"description":"","invoice":"invfromest00001","kind":"item","percent_ppm":0,"position":0,"product":"prodservice0001","quantity":3,"rate":12600,"taxable":true}},` +
		`{"method":"POST","url":"/api/collections/books_invoice_lines/records","body":{"description":"","invoice":"invfromest00001","kind":"percent","percent_ppm":-100000,"position":1,"product":"proddiscount001","quantity":0,"rate":0,"taxable":false}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	// The estimate's own date, memo and message are not the invoice's.
	if strings.Contains(sentBatch(t, f, 0), "Estimate memo") || strings.Contains(sentBatch(t, f, 0), "2026-11-02") {
		t.Errorf("the invoice took the estimate's memo or date:\n%s", sentBatch(t, f, 0))
	}
	if !strings.Contains(out, `"id": "invfromest00001"`) || !strings.Contains(out, `"estimate": "estpending00001"`) || !strings.Contains(out, `"status": "draft"`) {
		t.Errorf("the printed invoice:\n%s", out)
	}
	if !strings.Contains(errOut, "added invoice invfromest00001 from estimate 1001") {
		t.Errorf("stderr = %q", errOut)
	}
}

func TestEstimateConvertTakesTheInputOverTheEstimate(t *testing.T) {
	f := quotes(t)
	fixedIDs(t, "invfromest00001")
	input := `{"date": "2026-11-06", "due_date": "2026-12-06", "email": null, "memo": "From the estimate", "lines": [{"kind": "item", "product": "prodservice0001", "quantity": 1, "rate": 100}]}`
	if _, _, err := runCmd(t, f.serve(), input, "books", "estimates", "convert", "estpending00001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_invoices/records","body":{"customer":"custacme0000001","date":"2026-11-06","due_date":"2026-12-06","email":null,"estimate":"estpending00001","id":"invfromest00001","memo":"From the estimate","status":"draft","tax_rate":"taxdenver000001"}},` +
		`{"method":"POST","url":"/api/collections/books_invoice_lines/records","body":{"invoice":"invfromest00001","kind":"item","position":0,"product":"prodservice0001","quantity":1,"rate":100}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
}

func TestEstimateConvertRefusesBeforeItSends(t *testing.T) {
	f := quotes(t)
	cases := []struct {
		id, input, want string
		code            int
	}{
		{"estpending00001", `{"date": "2026-11-06"}`, `"due_date" is required`, exitcode.Usage},
		{"estpending00001", `{"due_date": "2026-12-06"}`, `"date" is required`, exitcode.Usage},
		// An empty object names what is missing, not "nothing to change".
		{"estpending00001", `{}`, `"date" is required`, exitcode.Usage},
		{"estpending00001", `{"date": "2026-11-06", "due_date": "2026-12-06", "estimate": "estaccepted0001"}`, `"estimate" is set by the server`, exitcode.Usage},
		{"estpending00001", `{"date": "2026-11-06", "due_date": "2026-12-06", "expiration_date": "2026-12-06"}`, `invoices has no field "expiration_date"`, exitcode.Usage},
		// The record holds its invoice: the next step is to show it.
		{"estclosed000001", `{"date": "2026-11-06", "due_date": "2026-12-06"}`, "estimate estclosed000001 is closed: one invoice was already made from it; show it with `tinycld books invoices show invdraft0000001`", exitcode.Refused},
		{"nosuchestimate1", `{"date": "2026-11-06", "due_date": "2026-12-06"}`, "estimate nosuchestimate1", exitcode.NotFound},
	}
	for _, tc := range cases {
		_, _, err := runCmd(t, f.serve(), tc.input, "books", "estimates", "convert", tc.id, "--input", "-", "--json")
		if err == nil {
			t.Errorf("%s %s: no error", tc.id, tc.input)
			continue
		}
		if got := exitcode.Of(err); got != tc.code || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s %s: exit = %d, err = %v, want %d with %q", tc.id, tc.input, got, err, tc.code, tc.want)
		}
	}
	if len(f.batches) != 0 {
		t.Errorf("a refused convert sent %d batches", len(f.batches))
	}
}

// A closed estimate whose record names no invoice has no next step to name.
func TestEstimateConvertOfAClosedEstimateWithNoInvoiceNamesNoInvoice(t *testing.T) {
	f := quotes(t)
	f.addRow("books_estimates", "estclosednoinv1", map[string]any{
		"customer": "custacme0000001", "date": "2026-11-02", "status": "closed", "number": "1005", "revision": cents(5),
	})
	_, _, err := runCmd(t, f.serve(), `{"date": "2026-11-06", "due_date": "2026-12-06"}`, "books", "estimates", "convert", "estclosednoinv1", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused || err == nil || !strings.Contains(err.Error(), "estimate estclosednoinv1 is closed: one invoice was already made from it") || strings.Contains(err.Error(), "show it") {
		t.Errorf("exit = %d, err = %v", got, err)
	}
}

// A record that names two documents made from it shows the first.
func TestClosedSourceRefusalNamesTheFirstDocument(t *testing.T) {
	doc := &document{resource: resource{Name: "estimates", Singular: "estimate", Fields: []field{
		{Name: "first", Type: typeID, Ref: "invoices", ReadOnly: true},
		{Name: "second", Type: typeID, Ref: "invoices", ReadOnly: true},
	}}}
	to := &document{resource: resource{Name: "invoices", Singular: "invoice"}}
	source := record{values: map[string]any{"id": "est1", "first": "inv1", "second": "inv2"}}
	root := newTestRoot(nil)
	group, _, _ := root.Find([]string{"books", "estimates"})
	cmd, _, _ := root.Find([]string{"books", "estimates", "convert"})
	if group == nil || cmd == nil {
		t.Fatal("no convert command")
	}
	err := closedSourceRefusal(cmd, doc, to, source)
	if err == nil || !strings.Contains(err.Error(), "invoices show inv1`") || strings.Contains(err.Error(), "inv2") {
		t.Errorf("err = %v", err)
	}
}

// The Long text names the full command path, as the other commands' do.
func TestConvertLongNamesFullCommandPaths(t *testing.T) {
	cmd, _, err := newTestRoot(nil).Find([]string{"books", "estimates", "convert"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cmd.Long, "`tinycld books invoices post`") || !strings.Contains(cmd.Long, "`tinycld books schema estimates convert`") {
		t.Errorf("Long:\n%s", cmd.Long)
	}
}

// The batch is stored, so a read after it that fails must not read as a failed
// convert, and it must keep the id of the invoice.
func TestEstimateConvertSaysWhenTheReadAfterItFails(t *testing.T) {
	f := quotes(t)
	fixedIDs(t, "invfromest00001")
	inner := f.handler()
	c := clientFor(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inner.ServeHTTP(w, r)
		if r.Method == http.MethodPost && r.URL.Path == "/api/batch" {
			f.refuse("GET", 404, `{"data":{},"message":"The requested resource wasn't found.","status":404}`)
		}
	}))
	_, _, err := runCmd(t, c, `{"date": "2026-11-06", "due_date": "2026-12-06"}`, "books", "estimates", "convert", "estpending00001", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Failed {
		t.Errorf("exit = %d, want %d (%v)", got, exitcode.Failed, err)
	}
	if err == nil || !strings.Contains(err.Error(), "invoice invfromest00001 was added, and then it could not be read") {
		t.Errorf("err = %v", err)
	}
	if f.find("books_invoices", "invfromest00001") == nil {
		t.Error("the invoice was not stored")
	}
}

// A correction of an invoice made from an estimate keeps the estimate: the
// server refuses a correction that drops it.
func TestInvoiceCorrectionKeepsItsEstimate(t *testing.T) {
	f := quotes(t)
	f.addRow("books_invoices", "invofestimate01", map[string]any{
		"customer": "custacme0000001", "date": "2026-11-06", "due_date": "2026-12-06", "status": "posted", "number": "1003",
		"estimate": "estclosed000001", "revision": cents(1),
	})
	fixedIDs(t, "invcorrected001")
	if _, _, err := runCmd(t, f.serve(), `{"memo": "Corrected"}`, "books", "invoices", "edit", "invofestimate01", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	sent := sentBatch(t, f, 0)
	if !strings.Contains(sent, `"estimate":"estclosed000001"`) || !strings.Contains(sent, `"replaces":"invofestimate01"`) {
		t.Errorf("the correction:\n%s", sent)
	}
	// An invoice with no estimate sends none.
	fixedIDs(t, "invcorrected002")
	if _, _, err := runCmd(t, f.serve(), `{"memo": "Corrected"}`, "books", "invoices", "edit", "invposted000001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(sentBatch(t, f, 1), `"estimate"`) {
		t.Errorf("a correction of an invoice with no estimate names one:\n%s", sentBatch(t, f, 1))
	}
}

func TestLoadDocumentsChecksAConversionAndKeep(t *testing.T) {
	cases := []struct{ name, old, new, want string }{
		{"a conversion to itself", `"to": "invoices"`, `"to": "estimates"`, `to names "estimates", which is not another document`},
		{"a conversion with a link a caller sets", `"link": "estimate"`, `"link": "customer"`, `link names "customer", which is not a read-only id of estimates in invoices`},
		{"a conversion that copies a field the target has not", `"copy": ["customer", "bill_to", "email", "tax_rate"]`, `"copy": ["customer", "expiration_date"]`, `copy names "expiration_date"`},
		{"a conversion of a document that never closes", `"keep": ["estimate"]`, `"keep": ["estimate"], "convert": {"to": "estimates", "link": "customer", "copy": []}`, `convert is only for a document with the lifecycle "quote"`},
		// The input is checked against the target's tables; a caller's rows for
		// a table the source lacks would be dropped with no error.
		{"a conversion to a writable line table the source lacks", "\"sort\": \"position,id\",\n                    \"readOnly\": true,\n                    \"omit\": [\"invoice\", \"position\", \"date\", \"currency\"],", "\"sort\": \"position,id\",\n                    \"omit\": [\"invoice\", \"position\", \"date\", \"currency\"],", `invoices.tax_lines has no source line table in estimates`},
		{"keep of a field a caller sets", `"keep": ["estimate"]`, `"keep": ["memo"]`, `keep names "memo", which is not a read-only field of a posting document`},
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
