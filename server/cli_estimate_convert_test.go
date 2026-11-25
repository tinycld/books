package books

import (
	"fmt"
	"testing"
)

// `estimates convert` through its writes: a draft invoice that names the
// estimate, with the estimate's lines. Books closes the estimate in the same
// transaction, and a closed estimate takes no second invoice, no change and no
// delete. The bodies are those of cli/document_convert_test.go, with the ids
// of this book.
func TestCLIDocuments_EstimateConvert(t *testing.T) {
	env := newConversionEnv(t)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const est, inv = "cliestimate0001", "cliinvfromest01"
	apiSeq(t, env.app, apiCalls(
		[]apiReq{docBatch(token,
			cliOp("POST", "books_estimates", "", fmt.Sprintf(`{"customer":%q,"date":"2026-11-04","id":%q,"status":"pending","tax_rate":%q}`, env.customer.Id, est, env.denver.Id)),
			rowOp("books_estimate_lines", "estimate", est, 0, fmt.Sprintf(`"kind":"item","product":%q,"quantity":2,"rate":6000,"taxable":true`, env.service.Id)),
			rowOp("books_estimate_lines", "estimate", est, 1, fmt.Sprintf(`"kind":"percent","percent_ppm":-100000,"product":%q`, env.service.Id)),
			rowOp("books_estimate_lines", "estimate", est, 2, `"description":"Thank you","kind":"description"`))},
		[]apiReq{
			// convert: a draft invoice that names the estimate; Books closes it.
			docBatch(token,
				cliOp("POST", "books_invoices", "", fmt.Sprintf(`{"customer":%q,"date":"2026-11-06","due_date":"2026-12-06","email":"","estimate":%q,"id":%q,"status":"draft","tax_rate":%q}`, env.customer.Id, est, inv, env.denver.Id)),
				cliOp("POST", "books_invoice_lines", "", fmt.Sprintf(`{"description":"","invoice":%q,"kind":"item","percent_ppm":0,"position":0,"product":%q,"quantity":2,"rate":6000,"taxable":true}`, inv, env.service.Id)),
				cliOp("POST", "books_invoice_lines", "", fmt.Sprintf(`{"description":"","invoice":%q,"kind":"percent","percent_ppm":-100000,"position":1,"product":%q,"quantity":0,"rate":0,"taxable":false}`, inv, env.service.Id)),
				cliOp("POST", "books_invoice_lines", "", fmt.Sprintf(`{"description":"Thank you","invoice":%q,"kind":"description","percent_ppm":0,"position":2,"product":"","quantity":0,"rate":0,"taxable":false}`, inv))),
			{method: "GET", url: recordURL("books_invoices", inv), token: token, want: 200,
				content: []string{`"status":"draft"`, `"estimate":"` + est + `"`, `"subtotal":10800`}},
			{method: "GET", url: recordURL("books_estimates", est), token: token, want: 200,
				content: []string{`"status":"closed"`, `"invoice":"` + inv + `"`}},
			// A closed estimate: no second invoice, no change, no delete.
			refusedBatch(token, []string{"already on a draft invoice"},
				cliOp("POST", "books_invoices", "", fmt.Sprintf(`{"customer":%q,"date":"2026-11-06","due_date":"2026-12-06","estimate":%q,"id":"cliinvfromest02","status":"draft"}`, env.customer.Id, est))),
			{method: "PATCH", url: recordURL("books_estimates", est), token: token, want: 404, body: `{"revision":3,"status":"rejected"}`},
			{method: "DELETE", url: recordURL("books_estimates", est), token: token, want: 404},
		},
	)...)
	requireNoDrift(t, env.app)
}

// `invoices edit` of a posted invoice made from an estimate: the correction
// names the estimate (documents.json `keep`). Without it the server refuses.
func TestCLIDocuments_InvoiceCorrectionKeepsItsEstimate(t *testing.T) {
	env := newConversionEnv(t)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const est, inv = "cliestimate0001", "cliinvfromest01"
	invoice := func(id, extra string) string {
		return cliOp("POST", "books_invoices", "", fmt.Sprintf(`{"customer":%q,"date":"2026-11-06","due_date":"2026-12-06","id":%q,"status":"draft"%s}`, env.customer.Id, id, extra))
	}
	line := func(collection, parent, id string) string {
		return rowOp(collection, parent, id, 0, fmt.Sprintf(`"kind":"item","product":%q,"quantity":2,"rate":5000`, env.service.Id))
	}
	post := func(id string) string {
		return cliOp("PATCH", "books_invoices", id, `{"revision":1,"status":"posted"}`)
	}
	apiSeq(t, env.app,
		docBatch(token, cliOp("POST", "books_estimates", "", fmt.Sprintf(`{"customer":%q,"date":"2026-11-04","id":%q,"status":"pending"}`, env.customer.Id, est)),
			line("books_estimate_lines", "estimate", est)),
		docBatch(token, invoice(inv, fmt.Sprintf(`,"estimate":%q`, est)), line("books_invoice_lines", "invoice", inv), post(inv)),
		// A correction that drops the estimate is refused, and nothing is stored.
		refusedBatch(token, nil, invoice("clicorrection01", fmt.Sprintf(`,"replaces":%q`, inv)), line("books_invoice_lines", "invoice", "clicorrection01"), post("clicorrection01")),
		apiReq{method: "GET", url: recordURL("books_invoices", "clicorrection01"), token: token, want: 404},
		docBatch(token, invoice("clicorrection01", fmt.Sprintf(`,"estimate":%q,"replaces":%q`, est, inv)), line("books_invoice_lines", "invoice", "clicorrection01"), post("clicorrection01")),
		apiReq{method: "GET", url: recordURL("books_invoices", "clicorrection01"), token: token, want: 200,
			content: []string{`"status":"posted"`, `"estimate":"` + est + `"`, `"replaces":"` + inv + `"`}},
		apiReq{method: "GET", url: recordURL("books_invoices", inv), token: token, want: 200, content: []string{`"status":"void"`}},
		apiReq{method: "GET", url: recordURL("books_estimates", est), token: token, want: 200,
			content: []string{`"status":"closed"`, `"invoice":"clicorrection01"`}},
	)
	requireNoDrift(t, env.app)
}
