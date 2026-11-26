package books

import (
	"fmt"
	"testing"
)

// A transfer through the writes of its commands: a journal entry with the type
// transfer. The bodies are those of cli/document_transfer_test.go, with the ids
// of this book.
func TestCLIDocuments_TransferRoundTrip(t *testing.T) {
	env, token := cliLedgerEnv(t)
	savings := mkNumberedAccount(t, env.app, "Business Savings", "1010", "bank", "savings")
	const entries, lines = "books_journal_entries", "books_journal_lines"
	header := func(id, extra string) string {
		return cliOp("POST", entries, "", fmt.Sprintf(`{"date":"2026-07-15","doc_type":"transfer","id":%q,"memo":"To savings","origin":"manual","status":"draft"%s}`, id, extra))
	}
	post := func(id string) string {
		return cliOp("PATCH", entries, id, `{"revision":1,"status":"posted"}`)
	}
	// A line as a correction sends it back: the stored zero and the empty memo.
	stored := func(id string, position int, account string, debit, credit int) string {
		return rowOp(lines, "entry", id, position, fmt.Sprintf(`"account":%q,"credit":%d,"debit":%d,"memo":""`, account, credit, debit))
	}
	const first, draft, fix, manual = "clitransfer0001", "clitransfer0002", "clitransfer0003", "clijournal00001"
	apiSeq(t, env.app, apiCalls(
		// add --post: line 1 credits the account the money leaves.
		[]apiReq{docBatch(token, header(first, ""), journalLine(first, env.checking, "credit", 50000, 0), journalLine(first, savings, "debit", 50000, 1), post(first))},
		showDoc(token, entries, first, []string{`"status":"posted"`, `"doc_type":"transfer"`, `"number":"TR-1"`, `"total":50000`},
			lines, "entry", []string{`"totalItems":2`}),
		[]apiReq{
			// The other order is a draft Books takes, and refuses to post.
			docBatch(token, header(draft, ""), journalLine(draft, savings, "debit", 50000, 0), journalLine(draft, env.checking, "credit", 50000, 1)),
			{method: "PATCH", url: recordURL(entries, draft), token: token, want: 400, body: `{"revision":2,"status":"posted"}`,
				content: []string{"Line 1: a transfer moves money out of this account, so it takes a credit."}},
			// A journal entry made by hand, which `transfers list` must not show.
			docBatch(token, cliOp("POST", entries, "", `{"date":"2026-07-15","doc_type":"journal","id":"`+manual+`","origin":"manual","status":"draft"}`),
				journalLine(manual, env.checking, "debit", 100, 0), journalLine(manual, env.revenue, "credit", 100, 1)),
			// list: the filter of the scope, then the flag.
			{method: "GET", url: "/api/collections/" + entries + `/records?filter=doc_type%20%3D%20%22transfer%22%20%26%26%20origin%20%3D%20%22manual%22%20%26%26%20status%20%3D%20%22posted%22&sort=-date,-created,id`,
				token: token, want: 200, content: []string{`"totalItems":1`, `"id":"` + first + `"`}},
			{method: "GET", url: "/api/collections/" + entries + `/records?filter=doc_type%20%3D%20%22transfer%22%20%26%26%20origin%20%3D%20%22manual%22&sort=-date,-created,id`,
				token: token, want: 200, content: []string{`"totalItems":2`}},
			// edit of a posted transfer: a correction that replaces it.
			docBatch(token, header(fix, `,"replaces":"`+first+`"`), stored(fix, 0, env.checking.Id, 0, 50000), stored(fix, 1, savings.Id, 50000, 0), post(fix)),
			{method: "GET", url: recordURL(entries, first), token: token, want: 200, content: []string{`"status":"void"`}},
			{method: "GET", url: recordURL(entries, fix), token: token, want: 200, content: []string{`"status":"posted"`, `"number":"TR-1"`, `"replaces":"` + first + `"`}},
			// void, and delete of the draft.
			{method: "PATCH", url: recordURL(entries, fix), token: token, want: 200, body: `{"status":"void"}`, content: []string{`"status":"void"`}},
			{method: "DELETE", url: recordURL(entries, draft), token: token, want: 204},
		},
	)...)
	requireNoDrift(t, env.app)
}

// What Books refuses of a transfer when it is posted. The CLI checks only the
// count of lines (`max` of documents.json); the rest is the server's.
func TestCLIDocuments_TransferRefusals(t *testing.T) {
	env, token := cliLedgerEnv(t)
	savings := mkNumberedAccount(t, env.app, "Business Savings", "1010", "bank", "savings")
	const entries, id = "books_journal_entries", "clitransfer0001"
	header := func(extra string) string {
		return cliOp("POST", entries, "", fmt.Sprintf(`{"date":"2026-07-15","doc_type":"transfer","id":%q,"origin":"manual","status":"draft"%s}`, id, extra))
	}
	post := cliOp("PATCH", entries, id, `{"revision":1,"status":"posted"}`)
	apiSeq(t, env.app,
		refusedBatch(token, []string{"cannot be used in a transfer. Choose a bank, credit card, asset, liability or equity account."},
			header(""), journalLine(id, env.checking, "credit", 50000, 0), journalLine(id, env.revenue, "debit", 50000, 1), post),
		refusedBatch(token, []string{"A transfer has two lines: the account the money comes from and the account it goes to."},
			header(""), journalLine(id, env.checking, "credit", 50000, 0), journalLine(id, savings, "debit", 25000, 1), journalLine(id, savings, "debit", 25000, 2), post),
		// The field the transfers type leaves out.
		refusedBatch(token, []string{"A transfer cannot reverse automatically."},
			header(`,"auto_reverse_on":"2026-08-01"`), journalLine(id, env.checking, "credit", 50000, 0), journalLine(id, savings, "debit", 50000, 1), post),
		apiReq{method: "GET", url: recordURL(entries, id), token: token, want: 404},
	)
}
