package books

import (
	"fmt"
	"testing"
)

// An estimate through the writes of its commands: add, edit, accept, reject,
// reopen and delete. The bodies are those of
// cli/document_estimate_test.go, with the ids of this book.
func TestCLIDocuments_EstimateRoundTrip(t *testing.T) {
	env := newConversionEnv(t)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const est = "cliestimate0001"
	estLine := func(position, rate int) string {
		return rowOp("books_estimate_lines", "estimate", est, position, fmt.Sprintf(`"kind":"item","product":%q,"quantity":2,"rate":%d,"taxable":true`, env.service.Id, rate))
	}
	patch := func(body string, want int, content ...string) apiReq {
		return apiReq{method: "PATCH", url: recordURL("books_estimates", est), token: token, body: body, want: want, content: content}
	}
	apiSeq(t, env.app, apiCalls(
		// add: pending and numbered at once, with its totals.
		[]apiReq{docBatch(token,
			cliOp("POST", "books_estimates", "", fmt.Sprintf(`{"customer":%q,"date":"2026-11-04","id":%q,"status":"pending","tax_rate":%q}`, env.customer.Id, est, env.denver.Id)),
			cliOp("POST", "books_estimate_lines", "", fmt.Sprintf(`{"id":"cliestline00001","estimate":%q,"kind":"item","position":0,"product":%q,"quantity":2,"rate":5000,"taxable":true}`, est, env.service.Id)))},
		showDoc(token, "books_estimates", est, []string{`"status":"pending"`, `"number":"1001"`, `"subtotal":10000`, `"tax_total":871`, `"total":10871`, `"revision":1`},
			"books_estimate_lines", "estimate", []string{`"totalItems":1`, `"amount":10000`}),
		[]apiReq{
			// edit: the lines, then the header with the next revision and no status.
			docBatch(token, cliOp("DELETE", "books_estimate_lines", "cliestline00001", ""), estLine(0, 6000),
				cliOp("PATCH", "books_estimates", est, `{"memo":"Changed","revision":2}`)),
			{method: "GET", url: recordURL("books_estimates", est), token: token, want: 200,
				content: []string{`"status":"pending"`, `"subtotal":12000`, `"revision":2`, `"memo":"Changed"`}},
			// accept needs its date; a stale revision is refused.
			patch(`{"accepted_by":"Dana Lee","accepted_date":"","revision":3,"status":"accepted"}`, 400, "Enter the accepted date"),
			patch(`{"accepted_by":"Dana Lee","accepted_date":"2026-11-05","revision":2,"status":"accepted"}`, 409),
			patch(`{"accepted_by":"Dana Lee","accepted_date":"2026-11-05","revision":3,"status":"accepted"}`, 200,
				`"status":"accepted"`, `"accepted_by":"Dana Lee"`, `"accepted_date":"2026-11-05"`, `"revision":3`),
			// edit of an accepted estimate keeps it accepted.
			docBatch(token, cliOp("PATCH", "books_estimates", est, `{"memo":"Changed again","revision":4}`)),
			{method: "GET", url: recordURL("books_estimates", est), token: token, want: 200,
				content: []string{`"status":"accepted"`, `"accepted_date":"2026-11-05"`, `"revision":4`}},
			patch(`{"revision":5,"status":"rejected"}`, 200, `"status":"rejected"`, `"accepted_by":""`, `"accepted_date":""`),
			patch(`{"revision":6,"status":"pending"}`, 200, `"status":"pending"`, `"revision":6`),
			// A person cannot close an estimate: the update rule hides the write.
			patch(`{"revision":7,"status":"closed"}`, 404),
			// delete: a pending estimate goes with its lines.
			{method: "DELETE", url: recordURL("books_estimates", est), token: token, want: 204},
			{method: "GET", url: rowsURL("books_estimate_lines", "estimate", est), token: token, want: 200, content: []string{`"totalItems":0`}},
		},
	)...)
	requireNoDrift(t, env.app)
}
