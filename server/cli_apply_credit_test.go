package books

import (
	"fmt"
	"testing"
)

// `credit-memos apply` and `unapply`: one record write each, with the id the
// CLI makes. The bodies are those of cli/document_apply_test.go, with the ids
// of this book.
func TestCLIDocuments_CreditMemoApplyAndUnapply(t *testing.T) {
	env := newMemoApplyEnv(t)
	token := tokenFor(t, env.users.bookkeeper)
	const applications, id = "books_credit_memo_applications", "cliapply0000001"
	memo := env.postedMemo(t, env.customer, memoApplyCreditDay, 25000).Id
	invoice := env.invoice(t, env.customer, 40000).Id
	body := func(amount int, day string) string {
		return fmt.Sprintf(`{"amount":%d,"credit_memo":%q,"date":%q,"id":%q,"invoice":%q}`, amount, memo, day, id, invoice)
	}
	create := func(body string, want int, content ...string) apiReq {
		return apiReq{method: "POST", url: "/api/collections/" + applications + "/records", token: token, body: body, want: want, content: content}
	}
	balance := func(collection, record, want string) apiReq {
		return apiReq{method: "GET", url: recordURL(collection, record), token: token, want: 200, content: []string{`"balance":` + want + `,`}}
	}
	apiSeq(t, env.app,
		// What Books refuses, with the field it names.
		create(body(99999, "2026-11-13"), 400, `"invoice":{"code":"validation_books"`, "the credit is more than its open balance of $400.00."),
		create(body(1000, "2026-11-01"), 400, `"date":{"code":"validation_books"`, "The apply date can't be before the credit date."),
		// An invoice that does not exist is a relation error of the field, never a 404:
		// the CLI treats a 404 of the create as a collection the server lacks.
		create(fmt.Sprintf(`{"amount":100,"credit_memo":%q,"date":"2026-11-13","id":%q,"invoice":"nosuchinvoice01"}`, memo, id), 400,
			`"invoice":{"code":"validation_missing_rel_records"`),
		// apply: Books lowers both balances.
		create(body(10000, "2026-11-13"), 200, `"id":"`+id+`"`, `"amount":10000`),
		balance("books_credit_memos", memo, "15000"), balance("books_invoices", invoice, "30000"),
		// show reads the applications by date.
		apiReq{method: "GET", url: fmt.Sprintf("/api/collections/%s/records?filter=credit_memo%%3D%%22%s%%22&sort=date,created,id", applications, memo), token: token, want: 200,
			content: []string{`"totalItems":1`, `"invoice":"` + invoice + `"`}},
		// An application is never changed, and an applied credit is not voided.
		apiReq{method: "PATCH", url: recordURL(applications, id), token: token, want: 403, body: `{"amount":1}`},
		apiReq{method: "PATCH", url: recordURL("books_credit_memos", memo), token: token, want: 400, body: `{"status":"void"}`,
			content: []string{"This credit is applied to invoices. Remove it from those invoices first."}},
		// unapply: the balances are back, and a second one finds nothing.
		apiReq{method: "DELETE", url: recordURL(applications, id), token: token, want: 204},
		balance("books_credit_memos", memo, "25000"), balance("books_invoices", invoice, "40000"),
		apiReq{method: "DELETE", url: recordURL(applications, id), token: token, want: 404},
	)
	requireNoDrift(t, env.app)
}

func TestCLIDocuments_VendorCreditApplyAndUnapply(t *testing.T) {
	env := newApplyEnv(t)
	token := tokenFor(t, env.users.bookkeeper)
	const applications, id = "books_vendor_credit_applications", "cliapply0000001"
	body := func(amount int) string {
		return fmt.Sprintf(`{"amount":%d,"bill":%q,"date":"2026-11-13","id":%q,"vendor_credit":%q}`, amount, env.small.Id, id, env.credit.Id)
	}
	create := func(body string, want int, content ...string) apiReq {
		return apiReq{method: "POST", url: "/api/collections/" + applications + "/records", token: token, body: body, want: want, content: content}
	}
	balance := func(collection, record, want string) apiReq {
		return apiReq{method: "GET", url: recordURL(collection, record), token: token, want: 200, content: []string{`"balance":` + want + `,`}}
	}
	apiSeq(t, env.app,
		create(body(99999), 400, `"code":"validation_books"`),
		create(body(3000), 200, `"id":"`+id+`"`),
		balance("books_vendor_credits", env.credit.Id, "2000"), balance("books_bills", env.small.Id, "0"),
		apiReq{method: "DELETE", url: recordURL(applications, id), token: token, want: 204},
		balance("books_vendor_credits", env.credit.Id, "5000"), balance("books_bills", env.small.Id, "3000"),
	)
	requireNoDrift(t, env.app)
}
