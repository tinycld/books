package books

import (
	"fmt"
	"testing"
)

// A payment through the writes of its commands. A payment has no revision
// (documents.json has no such field for it), so its post and its draft edit
// state none. The bodies are those of cli/document_payment_test.go, with the
// ids of this book.
func TestCLIDocuments_PaymentRoundTrip(t *testing.T) {
	env := newPaymentEnv(t)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const payments, rows = "books_payments", "books_payment_applications"
	invoice := func(id string, rate int) apiReq {
		return docBatch(token,
			cliOp("POST", "books_invoices", "", fmt.Sprintf(`{"customer":%q,"date":"2026-11-01","due_date":"2026-12-01","id":%q,"status":"draft"}`, env.customer.Id, id)),
			rowOp("books_invoice_lines", "invoice", id, 0, fmt.Sprintf(`"kind":"item","product":%q,"quantity":1,"rate":%d`, env.service.Id, rate)),
			cliOp("PATCH", "books_invoices", id, `{"revision":1,"status":"posted"}`))
	}
	header := func(id string, cents int, extra string) string {
		return cliOp("POST", payments, "", fmt.Sprintf(`{"amount":%d,"customer":%q,"date":"2026-11-04","id":%q,"payment_method":"check","reference_no":"2210","status":"draft"%s}`, cents, env.customer.Id, id, extra))
	}
	apply := func(id string, position int, invoiceID string, cents int) string {
		return rowOp(rows, "payment", id, position, fmt.Sprintf(`"amount":%d,"invoice":%q`, cents, invoiceID))
	}
	balance := func(id, want string) apiReq {
		return apiReq{method: "GET", url: recordURL("books_invoices", id), token: token, want: 200, content: []string{`"balance":` + want + `,`}}
	}
	const invA, invB, pay, draft, fix = "cliinvpay000001", "cliinvpay000002", "clipayment00001", "clipayment00002", "clipayment00003"
	apiSeq(t, env.app, apiCalls(
		[]apiReq{invoice(invA, 30000), invoice(invB, 20000)},
		// add --post: the header, the applications, the post with no revision.
		[]apiReq{docBatch(token, header(pay, 35000, ""), apply(pay, 0, invA, 30000), apply(pay, 1, invB, 5000),
			cliOp("PATCH", payments, pay, `{"status":"posted"}`))},
		showDoc(token, payments, pay, []string{`"status":"posted"`, `"number":"1001"`, `"amount":35000`, `"applied":35000`, `"credited":0`},
			rows, "payment", []string{`"totalItems":2`, `"amount":30000`, `"amount":5000`}),
		[]apiReq{balance(invA, "0"), balance(invB, "15000")},
	)...)
	entryID := reload(t, env.app, payments, pay).GetString("entry")
	if entryID == "" {
		t.Fatal("the posted payment has no entry")
	}
	deposit := reload(t, env.app, payments, pay).GetString("deposit_to")
	account, err := env.app.FindRecordById("books_accounts", deposit)
	if err != nil {
		t.Fatalf("Books did not fill deposit_to at the post: %v", err)
	}
	if got := account.GetString("detail_type"); got != "undeposited_funds" {
		t.Errorf("deposit_to is an account of detail type %q, want undeposited_funds", got)
	}
	draftRows := func() string {
		return cliRows(t, env.app, rows, "payment", draft)[0].Id
	}
	apiSeq(t, env.app, apiCalls(
		showDoc(token, "books_journal_entries", entryID, []string{`"doc_type":"payment"`, `"document":"` + pay + `"`, `"total":35000`},
			"books_journal_lines", "entry", []string{`"totalItems":2`}),
		// add: a draft applies nothing.
		[]apiReq{docBatch(token, header(draft, 4000, ""), apply(draft, 0, invB, 4000)), balance(invB, "15000")},
	)...)
	first := draftRows()
	// edit with a header change: the rows, then the header, and no revision.
	apiSeq(t, env.app,
		docBatch(token, cliOp("DELETE", rows, first, ""), apply(draft, 0, invB, 6000), cliOp("PATCH", payments, draft, `{"amount":6000}`)),
		apiReq{method: "GET", url: recordURL(payments, draft), token: token, want: 200, content: []string{`"status":"draft"`, `"amount":6000`}},
	)
	second := draftRows()
	apiSeq(t, env.app, apiCalls(
		// edit with only rows: no header write at all.
		[]apiReq{docBatch(token, cliOp("DELETE", rows, second, ""), apply(draft, 0, invB, 5500))},
		showDoc(token, payments, draft, []string{`"status":"draft"`, `"amount":6000`}, rows, "payment", []string{`"totalItems":1`, `"amount":5500`}),
		[]apiReq{
			// post: one PATCH with no revision.
			{method: "PATCH", url: recordURL(payments, draft), token: token, want: 200, body: `{"status":"posted"}`,
				content: []string{`"status":"posted"`, `"number":"1002"`, `"applied":5500`, `"credited":500`}},
			balance(invB, "9500"),
		},
	)...)
	// The correction copies the stored deposit_to and memo of the payment it
	// replaces, as the CLI does.
	storedDeposit := reload(t, env.app, payments, draft).GetString("deposit_to")
	apiSeq(t, env.app, apiCalls(
		[]apiReq{
			// edit of a posted payment: a correction that replaces it.
			docBatch(token, header(fix, 6000, fmt.Sprintf(`,"deposit_to":%q,"memo":"","replaces":%q`, storedDeposit, draft)), apply(fix, 0, invB, 6000), cliOp("PATCH", payments, fix, `{"status":"posted"}`)),
			{method: "GET", url: recordURL(payments, draft), token: token, want: 200, content: []string{`"status":"void"`, `"replaced_by":"` + fix + `"`}},
			{method: "GET", url: recordURL(payments, fix), token: token, want: 200, content: []string{`"status":"posted"`, `"applied":6000`, `"credited":0`}},
			balance(invB, "9000"),
			// void, and no delete of what was posted.
			{method: "PATCH", url: recordURL(payments, fix), token: token, want: 200, body: `{"status":"void"}`, content: []string{`"status":"void"`}},
			balance(invB, "15000"),
			{method: "DELETE", url: recordURL(payments, fix), token: token, want: 404},
		},
	)...)
	requireNoDrift(t, env.app)
}

// What Books refuses of a payment, and how the refusal names the row.
func TestCLIDocuments_PaymentRefusals(t *testing.T) {
	env := newPaymentEnv(t)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const inv = "cliinvpay000001"
	header := func(id, amount string) string {
		return cliOp("POST", "books_payments", "", fmt.Sprintf(`{%s"customer":%q,"date":"2026-11-04","id":%q,"status":"draft"}`, amount, env.customer.Id, id))
	}
	apply := func(id string, position, cents int) string {
		return rowOp("books_payment_applications", "payment", id, position, fmt.Sprintf(`"amount":%d,"invoice":%q`, cents, inv))
	}
	post := func(id string) string {
		return cliOp("PATCH", "books_payments", id, `{"status":"posted"}`)
	}
	apiSeq(t, env.app,
		docBatch(token,
			cliOp("POST", "books_invoices", "", fmt.Sprintf(`{"customer":%q,"date":"2026-11-01","due_date":"2026-12-01","id":%q,"status":"draft"}`, env.customer.Id, inv)),
			rowOp("books_invoice_lines", "invoice", inv, 0, fmt.Sprintf(`"kind":"item","product":%q,"quantity":1,"rate":30000`, env.service.Id)),
			cliOp("PATCH", "books_invoices", inv, `{"revision":1,"status":"posted"}`)),
		// No amount: the field is named.
		refusedBatch(token, []string{`"amount":{"code":"validation_books","message":"Enter the amount received."}`}, header("clipayment00001", "")),
		// One invoice two times: the second row is named.
		refusedBatch(token, []string{`"applications.1"`}, header("clipayment00001", `"amount":2000,`), apply("clipayment00001", 0, 1000), apply("clipayment00001", 1, 1000), post("clipayment00001")),
		// More than the invoice is owed.
		refusedBatch(token, nil, header("clipayment00001", `"amount":40000,`), apply("clipayment00001", 0, 40000), post("clipayment00001")),
		// A refused batch stored nothing.
		apiReq{method: "GET", url: recordURL("books_payments", "clipayment00001"), token: token, want: 404},
		apiReq{method: "GET", url: recordURL("books_invoices", inv), token: token, want: 200, content: []string{`"balance":30000,`}},
	)
}

// The `max` of `applications` in documents.json is the server's own limit: one
// batch with 500 applications is posted, one with 501 is refused.
func TestCLIDocuments_PaymentTakesAtMost500Invoices(t *testing.T) {
	env := newPaymentEnv(t)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	invoices := make([]string, 501)
	for i := range invoices {
		invoices[i] = env.postedInvoice(t, env.customer, 100).Id
	}
	batch := func(id string, count int) []string {
		ops := []string{cliOp("POST", "books_payments", "", fmt.Sprintf(`{"amount":%d,"customer":%q,"date":"2026-11-04","id":%q,"status":"draft"}`, 100*count, env.customer.Id, id))}
		for position := range count {
			ops = append(ops, rowOp("books_payment_applications", "payment", id, position, fmt.Sprintf(`"amount":100,"invoice":%q`, invoices[position])))
		}
		return append(ops, cliOp("PATCH", "books_payments", id, `{"status":"posted"}`))
	}
	apiSeq(t, env.app,
		refusedBatch(token, []string{"A payment can apply to at most 500 invoices."}, batch("clipayment00501", 501)...),
		apiReq{method: "GET", url: recordURL("books_payments", "clipayment00501"), token: token, want: 404},
		docBatch(token, batch("clipayment00500", 500)...),
		apiReq{method: "GET", url: recordURL("books_payments", "clipayment00500"), token: token, want: 200,
			content: []string{`"status":"posted"`, `"amount":50000`, `"applied":50000`}},
	)
	requireNoDrift(t, env.app)
}
