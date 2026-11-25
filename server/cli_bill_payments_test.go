package books

import (
	"fmt"
	"testing"
)

// A bill payment through the writes of its commands. It has no draft: the
// header is created posted with its lines in one batch, and nothing posts it.
// The bodies are those of cli/document_billpay_test.go, with the ids of this
// book.
func TestCLIDocuments_BillPaymentRoundTrip(t *testing.T) {
	env := newBillPayEnv(t)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const payments, rows = "books_bill_payments", "books_bill_payment_lines"
	billA := env.postedBill(t, env.summit, 30000).Id
	billB := env.postedBill(t, env.summit, 20000).Id
	header := func(id, extra string) string {
		return cliOp("POST", payments, "", fmt.Sprintf(`{"date":"2026-11-10","id":%q,"paid_from":%q,"payment_method":"check","reference_no":"301","status":"posted","vendor":%q%s}`,
			id, env.checking1000.Id, env.summit.Id, extra))
	}
	line := func(id string, position int, bill string, cents int) string {
		return rowOp(rows, "payment", id, position, fmt.Sprintf(`"amount":%d,"bill":%q`, cents, bill))
	}
	balance := func(id, want string) apiReq {
		return apiReq{method: "GET", url: recordURL("books_bills", id), token: token, want: 200, content: []string{`"balance":` + want + `,`}}
	}
	const pay, fix = "clibillpay00001", "clibillpay00002"
	apiSeq(t, env.app, apiCalls(
		// add: the header and the lines, and no post.
		[]apiReq{docBatch(token, header(pay, ""), line(pay, 0, billA, 30000), line(pay, 1, billB, 5000))},
		showDoc(token, payments, pay, []string{`"status":"posted"`, `"number":"1001"`, `"total":35000`},
			rows, "payment", []string{`"totalItems":2`, `"amount":30000`, `"amount":5000`}),
		[]apiReq{balance(billA, "0"), balance(billB, "15000")},
	)...)
	entryID := reload(t, env.app, payments, pay).GetString("entry")
	if entryID == "" {
		t.Fatal("the bill payment has no entry")
	}
	apiSeq(t, env.app, apiCalls(
		showDoc(token, "books_journal_entries", entryID, []string{`"document":"` + pay + `"`, `"total":35000`},
			"books_journal_lines", "entry", []string{`"totalItems":2`}),
		[]apiReq{
			// edit: a correction that is created posted and replaces the first.
			docBatch(token, header(fix, `,"replaces":"`+pay+`"`), line(fix, 0, billA, 30000), line(fix, 1, billB, 6000)),
			{method: "GET", url: recordURL(payments, pay), token: token, want: 200, content: []string{`"status":"void"`, `"replaced_by":"` + fix + `"`}},
			{method: "GET", url: recordURL(payments, fix), token: token, want: 200, content: []string{`"status":"posted"`, `"number":"1001"`, `"total":36000`}},
			balance(billB, "14000"),
			// A posted bill payment takes no other change.
			{method: "PATCH", url: recordURL(payments, fix), token: token, want: 404, body: `{"reference_no":"302"}`},
			// void, and neither a second void nor a delete.
			{method: "PATCH", url: recordURL(payments, fix), token: token, want: 200, body: `{"status":"void"}`, content: []string{`"status":"void"`}},
			balance(billA, "30000"), balance(billB, "20000"),
			{method: "PATCH", url: recordURL(payments, fix), token: token, want: 404, body: `{"status":"void"}`},
			{method: "DELETE", url: recordURL(payments, fix), token: token, want: 403},
		},
	)...)
	requireNoDrift(t, env.app)
}

// What Books refuses of a bill payment, and how the refusal names the line.
func TestCLIDocuments_BillPaymentRefusals(t *testing.T) {
	env := newBillPayEnv(t)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const payments, rows, pay = "books_bill_payments", "books_bill_payment_lines", "clibillpay00001"
	bill := env.postedBill(t, env.summit, 15000).Id
	header := func(status string) string {
		return cliOp("POST", payments, "", fmt.Sprintf(`{"date":"2026-11-10","id":%q,"paid_from":%q,"payment_method":"check","status":%q,"vendor":%q}`,
			pay, env.checking1000.Id, status, env.summit.Id))
	}
	line := func(position, cents int) string {
		return rowOp(rows, "payment", pay, position, fmt.Sprintf(`"amount":%d,"bill":%q`, cents, bill))
	}
	apiSeq(t, env.app,
		// No draft: the type has no such status.
		refusedBatch(token, nil, header("draft"), line(0, 1000)),
		// No lines.
		refusedBatch(token, []string{"Select at least one bill to pay."}, header("posted")),
		// More than the bill is owed: the line is named.
		refusedBatch(token, []string{`"lines.0"`, "the payment is more than its open balance of $150.00."}, header("posted"), line(0, 99999)),
		// One bill two times: the second line is named.
		refusedBatch(token, []string{`"lines.1"`, "is already on this payment."}, header("posted"), line(0, 1), line(1, 1)),
		// A refused batch stored nothing.
		apiReq{method: "GET", url: recordURL(payments, pay), token: token, want: 404},
		apiReq{method: "GET", url: recordURL("books_bills", bill), token: token, want: 200, content: []string{`"balance":15000,`}},
	)
}
