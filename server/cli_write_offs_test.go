package books

import (
	"fmt"
	"testing"
)

// A write-off through the writes of its commands: one batch of one write that
// creates it posted, then a void. The body is that of
// cli/document_writeoff_test.go, with the ids of this book.
func TestCLIDocuments_WriteOffRoundTrip(t *testing.T) {
	env := newWriteOffEnv(t)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const writeOffs, id = "books_write_offs", "cliwriteoff0001"
	invoice := env.postedInvoice(t, 50000).Id
	add := func(id string, amount int, status, extra string) string {
		return cliOp("POST", writeOffs, "", fmt.Sprintf(`{"account":%q,"amount":%d,"date":"2026-11-10","id":%q,"invoice":%q,"memo":"Customer closed","status":%q%s}`,
			env.badDebts.Id, amount, id, invoice, status, extra))
	}
	open := func(balance, writtenOff string) apiReq {
		return apiReq{method: "GET", url: recordURL("books_invoices", invoice), token: token, want: 200,
			content: []string{`"balance":` + balance + `,`, `"written_off":` + writtenOff + `}`}}
	}
	apiSeq(t, env.app,
		// Not the open balance: the field is named.
		refusedBatch(token, []string{`"amount":{"code":"validation_books"`, "The open balance of invoice 1001 is now $500.00."}, add(id, 100, "posted", "")),
		// No draft, and the customer is Books' own.
		refusedBatch(token, nil, add(id, 50000, "draft", "")),
		refusedBatch(token, nil, add(id, 50000, "posted", fmt.Sprintf(`,"customer":%q`, env.customer.Id))),
		apiReq{method: "GET", url: recordURL(writeOffs, id), token: token, want: 404},
		// add.
		docBatch(token, add(id, 50000, "posted", "")),
		apiReq{method: "GET", url: recordURL(writeOffs, id), token: token, want: 200,
			content: []string{`"status":"posted"`, `"number":"1001"`, `"amount":50000`, `"customer":"` + env.customer.Id + `"`}},
		open("0", "50000"),
		// A second one has nothing to write off.
		refusedBatch(token, []string{`"invoice":{"code":"validation_books"`, "Invoice 1001 has no open balance."}, add("cliwriteoff0002", 50000, "posted", "")),
		// A write-off takes no change but the void, and no delete.
		apiReq{method: "PATCH", url: recordURL(writeOffs, id), token: token, want: 404, body: `{"memo":"x"}`},
		apiReq{method: "PATCH", url: recordURL(writeOffs, id), token: token, want: 200, body: `{"status":"void"}`, content: []string{`"status":"void"`}},
		open("50000", "0"),
		apiReq{method: "DELETE", url: recordURL(writeOffs, id), token: token, want: 403},
	)
	entryID := reload(t, env.app, writeOffs, id).GetString("entry")
	if entryID == "" {
		t.Fatal("the write-off has no entry")
	}
	apiSeq(t, env.app, showDoc(token, "books_journal_entries", entryID, []string{`"doc_type":"write_off"`, `"document":"` + id + `"`},
		"books_journal_lines", "entry", []string{`"totalItems":2`})...)
	requireNoDrift(t, env.app)
}
