package books

import (
	"fmt"
	"strings"
	"testing"
)

// A sales receipt, a credit memo and a refund receipt through the writes of
// their commands. The bodies are those of cli/document_sales_test.go, with the
// ids of this book; the commands are the ones of an invoice
// (TestCLIDocuments_InvoiceRoundTrip), on other collections.
func TestCLIDocuments_SalesDocumentsRoundTrip(t *testing.T) {
	// The three types and the invoice a credit memo is for. Core keeps one set
	// of bound hosts per app, so the four are bound in one call.
	app := newBooksApp(t)
	registerLedger(app)
	for _, kind := range []salesDocKind{invoiceKind, salesReceiptKind, creditMemoKind, refundReceiptKind} {
		registerSalesDocGuards(app, kind)
	}
	bindHostsByKey(t, app, invoiceKind.HostKey, salesReceiptKind.HostKey, creditMemoHostKey, refundReceiptHostKey)
	env := refundReceiptEnvOn(t, app)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	// The posted invoice the credit memo is for (`credit-memos add` with `invoice`).
	returned := env.postedInvoiceFor(t, env.customer, 9000)
	types := []struct {
		collection, lines, taxLines, parent, id, header, docType string
		posted                                                   []string
		taxAmount                                                string
	}{
		{"books_sales_receipts", "books_sales_receipt_lines", "books_sales_receipt_tax_lines", "sales_receipt", "clireceipt00001",
			fmt.Sprintf(`"date":"2026-11-04","deposit_to":%q,"id":"clireceipt00001","payment_method":"check","reference_no":"1041","status":"draft","tax_rate":%q`, env.checking.Id, env.denver.Id),
			"sales_receipt", []string{`"number":"1001"`, `"subtotal":5000`, `"tax_total":436`, `"total":5436`}, `"amount":145`},
		{"books_credit_memos", "books_credit_memo_lines", "books_credit_memo_tax_lines", "credit_memo", "clicreditmemo01",
			fmt.Sprintf(`"customer":%q,"date":"2026-11-04","id":"clicreditmemo01","invoice":%q,"status":"draft","tax_rate":%q`, env.customer.Id, returned.Id, env.denver.Id),
			"credit_memo", []string{`"number":"1001"`, `"total":5436`, `"balance":5436`, `"applied":0`}, `"amount":-145`},
		{"books_refund_receipts", "books_refund_receipt_lines", "books_refund_receipt_tax_lines", "refund_receipt", "clirefund000001",
			fmt.Sprintf(`"customer":%q,"date":"2026-11-04","id":"clirefund000001","payment_method":"check","refund_from":%q,"status":"draft","tax_rate":%q`, env.customer.Id, env.checking.Id, env.denver.Id),
			"refund_receipt", []string{`"number":"1001"`, `"total":5436`}, `"amount":-145`},
	}
	for _, tc := range types {
		t.Run(tc.collection, func(t *testing.T) {
			line := func(id string, position, rate int) string {
				return rowOp(tc.lines, tc.parent, id, position, fmt.Sprintf(`"kind":"item","product":%q,"quantity":1,"rate":%d,"taxable":true`, env.service.Id, rate))
			}
			draft := "clidraft" + tc.id[8:]
			draftHeader := fmt.Sprintf(`{%s}`, replaceID(tc.header, tc.id, draft))
			apiSeq(t, env.app, apiCalls(
				// add --post
				[]apiReq{docBatch(token, cliOp("POST", tc.collection, "", `{`+tc.header+`}`), line(tc.id, 0, 5000),
					cliOp("PATCH", tc.collection, tc.id, `{"revision":1,"status":"posted"}`))},
				showDoc(token, tc.collection, tc.id, append([]string{`"status":"posted"`, `"revision":1`}, tc.posted...),
					tc.lines, tc.parent, []string{`"totalItems":1`, `"amount":5000`}),
				[]apiReq{{method: "GET", url: rowsURL(tc.taxLines, tc.parent, tc.id), token: token, want: 200,
					content: []string{`"totalItems":3`, `"rate_ppm":29000`, tc.taxAmount}}},
				// add, edit of the draft, post, void
				[]apiReq{
					docBatch(token, cliOp("POST", tc.collection, "", draftHeader),
						cliOp("POST", tc.lines, "", fmt.Sprintf(`{"id":"clidraftline001","kind":"item","product":%q,"quantity":1,"rate":1000,"taxable":true,%q:%q,"position":0}`, env.service.Id, tc.parent, draft))),
					docBatch(token, rowUpdateOp(tc.lines, "clidraftline001", fmt.Sprintf(`"description":null,"kind":"item","percent_ppm":null,"position":0,"product":%q,"quantity":1,"rate":2000,"taxable":true`, env.service.Id)),
						cliOp("PATCH", tc.collection, draft, `{"memo":"Changed","revision":2}`)),
					{method: "GET", url: recordURL(tc.collection, draft), token: token, want: 200,
						content: []string{`"status":"draft"`, `"subtotal":2000`, `"total":2174`, `"revision":2`, `"memo":"Changed"`}},
					{method: "PATCH", url: recordURL(tc.collection, draft), token: token, want: 200,
						body: `{"revision":3,"status":"posted"}`, content: []string{`"status":"posted"`, `"number":"1002"`}},
					{method: "PATCH", url: recordURL(tc.collection, draft), token: token, want: 200,
						body: `{"status":"void"}`, content: []string{`"status":"void"`}},
					{method: "DELETE", url: recordURL(tc.collection, draft), token: token, want: 404},
				},
			)...)
			// entry
			entryID := reload(t, env.app, tc.collection, tc.id).GetString("entry")
			if entryID == "" {
				t.Fatal("the posted document has no entry")
			}
			apiSeq(t, env.app, showDoc(token, "books_journal_entries", entryID,
				[]string{`"doc_type":"` + tc.docType + `"`, `"document":"` + tc.id + `"`, `"total":5436`},
				"books_journal_lines", "entry", []string{`"totalItems":5`})...)
			// edit of the posted document: a correction with the stored values,
			// the empty ones too (`email`, `memo`, `message`).
			fix := "clifix00" + tc.id[8:]
			apiSeq(t, env.app,
				docBatch(token, cliOp("POST", tc.collection, "", `{`+replaceID(tc.header, tc.id, fix)+`,"email":"","memo":"Corrected","message":"","replaces":"`+tc.id+`"}`),
					rowOp(tc.lines, tc.parent, fix, 0, fmt.Sprintf(`"description":"","kind":"item","percent_ppm":0,"product":%q,"quantity":1,"rate":5000,"taxable":true`, env.service.Id)),
					cliOp("PATCH", tc.collection, fix, `{"revision":1,"status":"posted"}`)),
				apiReq{method: "GET", url: recordURL(tc.collection, fix), token: token, want: 200,
					content: []string{`"status":"posted"`, `"total":5436`, `"memo":"Corrected"`, `"replaces":"` + tc.id + `"`}},
				apiReq{method: "GET", url: recordURL(tc.collection, tc.id), token: token, want: 200,
					content: []string{`"status":"void"`, `"replaced_by":"` + fix + `"`}},
			)
		})
	}
	requireNoDrift(t, env.app)
}

// replaceID is a header with another id, for a second document of the type.
func replaceID(header, from, to string) string {
	return strings.Replace(header, `"id":"`+from+`"`, `"id":"`+to+`"`, 1)
}
