package books

import (
	"fmt"
	"testing"
)

// One invoice through the writes of the `invoices` commands. The bodies are
// those of cli/document_invoice_test.go, with the ids of this book.
func TestCLIDocuments_InvoiceRoundTrip(t *testing.T) {
	env := newSaleStockEnv(t, costingFIFO)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const invoices, lines, taxLines = "books_invoices", "books_invoice_lines", "books_invoice_tax_lines"
	header := func(id, extra string) string {
		return cliOp("POST", invoices, "", fmt.Sprintf(`{"customer":%q,"date":"2026-11-04","due_date":"2026-12-04","id":%q,"status":"draft","tax_rate":%q%s}`,
			env.customer.Id, id, env.denver.Id, extra))
	}
	item := func(id string, position, quantity, rate int) string {
		return rowOp(lines, "invoice", id, position, fmt.Sprintf(`"kind":"item","product":%q,"quantity":%d,"rate":%d,"taxable":true`, env.service.Id, quantity, rate))
	}
	apiSeq(t, env.app, apiCalls(
		// add --post (TestInvoiceAddSendsTheLinesAndNoTaxLine)
		[]apiReq{docBatch(token, header("cliinvoice00001", ""),
			item("cliinvoice00001", 0, 2, 18900),
			rowOp(lines, "invoice", "cliinvoice00001", 1, fmt.Sprintf(`"kind":"percent","percent_ppm":-100000,"product":%q,"taxable":true`, env.service.Id)),
			rowOp(lines, "invoice", "cliinvoice00001", 2, `"description":"Thank you","kind":"description"`),
			cliOp("PATCH", invoices, "cliinvoice00001", `{"revision":1,"status":"posted"}`))},
		// show: the totals, the amounts of the lines and the tax lines are Books'.
		showDoc(token, invoices, "cliinvoice00001",
			[]string{`"status":"posted"`, `"number":"1001"`, `"subtotal":34020`, `"tax_total":2963`, `"total":36983`, `"balance":36983`, `"revision":1`},
			lines, "invoice", []string{`"totalItems":3`, `"amount":37800`, `"amount":-3780`}),
		[]apiReq{{method: "GET", url: rowsURL(taxLines, "invoice", "cliinvoice00001"), token: token, want: 200,
			content: []string{`"totalItems":3`, `"rate_ppm":29000`, `"amount":987`, `"amount":340`, `"amount":1636`, `"taxable_amount":34020`, `"gross_amount":34020`}}},
	)...)
	// entry: the id in the invoice's `entry` field is a journal entry the
	// caller reads with its lines.
	entryID := reload(t, env.app, invoices, "cliinvoice00001").GetString("entry")
	if entryID == "" {
		t.Fatal("the posted invoice has no entry")
	}
	apiSeq(t, env.app, apiCalls(
		showDoc(token, "books_journal_entries", entryID,
			[]string{`"doc_type":"invoice"`, `"origin":"document"`, `"document":"cliinvoice00001"`, `"status":"posted"`, `"total":36983`},
			"books_journal_lines", "entry", []string{`"debit":36983`, `"credit":34020`, `"credit":987`}),
		// add, then edit of the draft (TestInvoiceEditOfADraftLeavesTheTaxLinesToBooks):
		// the header is last, states the next revision, and Books restates the totals.
		[]apiReq{docBatch(token, header("cliinvoice00002", ""),
			cliOp("POST", lines, "", fmt.Sprintf(`{"id":"cliinvline00001","kind":"item","product":%q,"quantity":1,"rate":1000,"taxable":true,"invoice":"cliinvoice00002","position":0}`, env.service.Id)))},
		showDoc(token, invoices, "cliinvoice00002", []string{`"status":"draft"`, `"number":""`, `"total":1087`, `"entry":""`},
			lines, "invoice", []string{`"totalItems":1`}),
		[]apiReq{docBatch(token,
			cliOp("DELETE", lines, "cliinvline00001", ""),
			item("cliinvoice00002", 0, 1, 5000),
			cliOp("PATCH", invoices, "cliinvoice00002", `{"memo":"Net 30","revision":2}`))},
		showDoc(token, invoices, "cliinvoice00002", []string{`"subtotal":5000`, `"tax_total":436`, `"total":5436`, `"revision":2`, `"memo":"Net 30"`},
			lines, "invoice", []string{`"totalItems":1`, `"amount":5000`}),
		[]apiReq{
			// A draft has no tax line: Books writes them at the post.
			{method: "GET", url: rowsURL(taxLines, "invoice", "cliinvoice00002"), token: token, want: 200, content: []string{`"totalItems":0`}},
			// post
			{method: "PATCH", url: recordURL(invoices, "cliinvoice00002"), token: token, want: 200,
				body: `{"revision":3,"status":"posted"}`, content: []string{`"status":"posted"`, `"number":"1002"`}},
			// edit of a posted invoice (TestInvoiceEditOfAPostedInvoiceCopiesOnlyWhatACallerSends):
			// every field a caller can send, with its stored value, and no amount.
			docBatch(token,
				cliOp("POST", invoices, "", fmt.Sprintf(`{"customer":%q,"date":"2026-11-04","due_date":"2026-12-04","email":"","id":"cliinvoice00003","memo":"Corrected","message":"","replaces":"cliinvoice00002","status":"draft","tax_rate":%q,"terms":""}`,
					env.customer.Id, env.denver.Id)),
				rowOp(lines, "invoice", "cliinvoice00003", 0, fmt.Sprintf(`"description":"","kind":"item","percent_ppm":0,"product":%q,"quantity":1,"rate":5000,"taxable":true`, env.service.Id)),
				cliOp("PATCH", invoices, "cliinvoice00003", `{"revision":1,"status":"posted"}`)),
			{method: "GET", url: recordURL(invoices, "cliinvoice00002"), token: token, want: 200,
				content: []string{`"status":"void"`, `"replaced_by":"cliinvoice00003"`}},
			{method: "GET", url: recordURL(invoices, "cliinvoice00003"), token: token, want: 200,
				content: []string{`"status":"posted"`, `"replaces":"cliinvoice00002"`, `"number":"1002"`, `"total":5436`}},
			// void
			{method: "PATCH", url: recordURL(invoices, "cliinvoice00003"), token: token, want: 200,
				body: `{"status":"void"}`, content: []string{`"status":"void"`, `"balance":0`}},
			// delete: 404 for a posted or void invoice, 204 for a draft, and its lines go with it.
			{method: "DELETE", url: recordURL(invoices, "cliinvoice00001"), token: token, want: 404},
			docBatch(token, header("cliinvoice00004", ""), item("cliinvoice00004", 0, 1, 1000)),
			{method: "DELETE", url: recordURL(invoices, "cliinvoice00004"), token: token, want: 204},
			{method: "GET", url: rowsURL(lines, "invoice", "cliinvoice00004"), token: token, want: 200, content: []string{`"totalItems":0`}},
		},
	)...)
	requireNoDrift(t, env.app)
}

// Why documents.json marks them read-only: the server refuses a line amount
// and a tax line from a caller, and a percent line that has nothing above it.
func TestCLIDocuments_InvoiceRefusals(t *testing.T) {
	env := newSaleStockEnv(t, costingFIFO)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const invoices, lines = "books_invoices", "books_invoice_lines"
	header := cliOp("POST", invoices, "", fmt.Sprintf(`{"customer":%q,"date":"2026-11-04","due_date":"2026-12-04","id":"cliinvoice00009","status":"draft"}`, env.customer.Id))
	apiSeq(t, env.app,
		refusedBatch(token, []string{`"requests":{"1":`}, header,
			rowOp(lines, "invoice", "cliinvoice00009", 0, fmt.Sprintf(`"kind":"item","product":%q,"quantity":2,"rate":18900,"amount":5`, env.service.Id))),
		refusedBatch(token, []string{`"requests":{"1":`, `Only superusers can perform this action.`}, header,
			rowOp("books_invoice_tax_lines", "invoice", "cliinvoice00009", 0, `"amount":1`)),
		// The message names the line as the form does: "Line 1" is lines[0].
		refusedBatch(token, []string{`"requests":{"1":`, `"message":"Line 1: Product or service is required."`}, header,
			rowOp(lines, "invoice", "cliinvoice00009", 0, `"kind":"item","quantity":1,"rate":500`)),
		refusedBatch(token, []string{`"requests":{"1":`, `"message":"Line 1: A percent line applies to the item or subtotal right above it."`}, header,
			rowOp(lines, "invoice", "cliinvoice00009", 0, fmt.Sprintf(`"kind":"percent","percent_ppm":-100000,"product":%q,"taxable":true`, env.service.Id))),
		refusedBatch(token, []string{`"requests":{"1":`, `"message":"An invoice with a total of zero cannot be posted. Add an amount or keep it as a draft."`}, header,
			cliOp("PATCH", invoices, "cliinvoice00009", `{"revision":1,"status":"posted"}`)),
		refusedBatch(token, []string{`"requests":{"0":`, `"due_date":{"code":"validation_books"`},
			cliOp("POST", invoices, "", fmt.Sprintf(`{"customer":%q,"date":"2026-11-04","id":"cliinvoice00009","status":"draft"}`, env.customer.Id))),
		apiReq{method: "GET", url: recordURL(invoices, "cliinvoice00009"), token: token, want: 404},
	)
}
