package books

import (
	"fmt"
	"testing"
)

// A vendor refund through the writes of its commands. It has no revision. The
// bodies are those of cli/document_deposit_test.go, with the ids of this book.
func TestCLIDocuments_VendorRefundRoundTrip(t *testing.T) {
	env := newRefundEnv(t)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const refunds, rows = "books_vendor_refunds", "books_vendor_refund_lines"
	credit := env.postedCredit(t, env.pacificPower, vendorCreditDay, billAmount{env.rent, 15000}).Id
	header := func(id string, cents int, extra string) string {
		return cliOp("POST", refunds, "", fmt.Sprintf(`{"amount":%d,"date":"2026-11-14","id":%q,"payment_method":"check","refunded_to":%q,"status":"draft","vendor":%q%s}`,
			cents, id, env.checking1000.Id, env.pacificPower.Id, extra))
	}
	line := func(id string, cents int) string {
		return rowOp(rows, "refund", id, 0, fmt.Sprintf(`"amount":%d,"vendor_credit":%q`, cents, credit))
	}
	post := func(id string) string {
		return cliOp("PATCH", refunds, id, `{"status":"posted"}`)
	}
	unapplied := func(want string) apiReq {
		return apiReq{method: "GET", url: recordURL("books_vendor_credits", credit), token: token, want: 200, content: []string{`"balance":` + want + `,`}}
	}
	const first, draft, fix = "clivrefund00001", "clivrefund00002", "clivrefund00003"
	apiSeq(t, env.app, apiCalls(
		// add --post: the header, the line, the post with no revision.
		[]apiReq{docBatch(token, header(first, 10000, ""), line(first, 10000), post(first))},
		showDoc(token, refunds, first, []string{`"status":"posted"`, `"number":"1001"`, `"amount":10000`}, rows, "refund", []string{`"totalItems":1`, `"amount":10000`}),
		[]apiReq{
			unapplied("5000"),
			// add: a draft takes nothing from the credit.
			docBatch(token, header(draft, 5000, ""), line(draft, 5000)),
			unapplied("5000"),
		},
	)...)
	row := cliRows(t, env.app, rows, "refund", draft)[0].Id
	apiSeq(t, env.app,
		// edit of a draft: the rows, then the header, and no revision.
		docBatch(token, cliOp("DELETE", rows, row, ""), line(draft, 4000), cliOp("PATCH", refunds, draft, `{"amount":4000}`)),
		// post: one PATCH with no revision.
		apiReq{method: "PATCH", url: recordURL(refunds, draft), token: token, want: 200, body: `{"status":"posted"}`, content: []string{`"status":"posted"`, `"number":"1002"`}},
		unapplied("1000"),
		// edit of a posted refund: a correction, with the empty values of the first.
		docBatch(token, header(fix, 11000, `,"memo":"","reference_no":"","replaces":"`+first+`"`), line(fix, 11000), post(fix)),
		apiReq{method: "GET", url: recordURL(refunds, first), token: token, want: 200, content: []string{`"status":"void"`, `"replaced_by":"` + fix + `"`}},
		unapplied("0"),
		// void, and no delete of what was posted.
		apiReq{method: "PATCH", url: recordURL(refunds, fix), token: token, want: 200, body: `{"status":"void"}`, content: []string{`"status":"void"`}},
		unapplied("11000"),
		apiReq{method: "DELETE", url: recordURL(refunds, fix), token: token, want: 404},
	)
	requireNoDrift(t, env.app)
}

func TestCLIDocuments_VendorRefundRefusals(t *testing.T) {
	env := newRefundEnv(t)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const refunds, rows, id = "books_vendor_refunds", "books_vendor_refund_lines", "clivrefund00001"
	credit := env.postedCredit(t, env.pacificPower, vendorCreditDay, billAmount{env.rent, 1000}).Id
	batch := func(amount, lineAmount int) []string {
		return []string{
			cliOp("POST", refunds, "", fmt.Sprintf(`{"amount":%d,"date":"2026-11-14","id":%q,"refunded_to":%q,"status":"draft","vendor":%q}`, amount, id, env.checking1000.Id, env.pacificPower.Id)),
			rowOp(rows, "refund", id, 0, fmt.Sprintf(`"amount":%d,"vendor_credit":%q`, lineAmount, credit)),
			cliOp("PATCH", refunds, id, `{"status":"posted"}`),
		}
	}
	apiSeq(t, env.app,
		refusedBatch(token, []string{"The refunds must add up to the amount refunded."}, batch(1000, 500)...),
		// More than the credit has left: the line is named.
		refusedBatch(token, []string{`"lines.0"`, "the refund is more than its unapplied credit of $10.00."}, batch(90000, 90000)...),
		apiReq{method: "GET", url: recordURL(refunds, id), token: token, want: 404},
	)
}

// A deposit through the writes of its commands: two line tables, no revision.
// The bodies are those of cli/document_deposit_test.go, with the ids of this
// book.
func TestCLIDocuments_DepositRoundTrip(t *testing.T) {
	env := newDepositEnv(t)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const deposits, items, lines = "books_deposits", "books_deposit_items", "books_deposit_lines"
	itemA := env.undepositedItem(t, env.undeposited, depositItemDay, 30000, "Check 1").Id
	itemB := env.undepositedItem(t, env.undeposited, depositItemDay, 20000, "Check 2").Id
	header := func(id, extra string) string {
		return cliOp("POST", deposits, "", fmt.Sprintf(`{"date":"2026-11-16","deposit_to":%q,"id":%q,"memo":"Week 46","status":"draft"%s}`, env.checking.Id, id, extra))
	}
	item := func(id, line string) string {
		return rowOp(items, "deposit", id, 0, fmt.Sprintf(`"line":%q`, line))
	}
	post := func(id string) string {
		return cliOp("PATCH", deposits, id, `{"status":"posted"}`)
	}
	const first, draft, fix, again = "clideposit00001", "clideposit00002", "clideposit00003", "clideposit00004"
	apiSeq(t, env.app, apiCalls(
		// add --post: the header, the items, the lines, the post.
		[]apiReq{docBatch(token, header(first, ""), item(first, itemA),
			rowOp(lines, "deposit", first, 0, fmt.Sprintf(`"account":%q,"amount":-500,"description":"Bank fee"`, env.fees.Id)), post(first))},
		// Books fills the item and computes the totals.
		showDoc(token, deposits, first, []string{`"status":"posted"`, `"number":"1001"`, `"items_total":30000`, `"lines_total":-500`, `"total":29500`},
			items, "deposit", []string{`"totalItems":1`, `"line":"` + itemA + `"`, `"amount":30000`, `"posted":true`}),
		[]apiReq{
			{method: "GET", url: rowsURL(lines, "deposit", first), token: token, want: 200, content: []string{`"totalItems":1`, `"amount":-500`, `"description":"Bank fee"`}},
			// add: the totals of a draft stay 0 until the post.
			docBatch(token, header(draft, ""), item(draft, itemB)),
			{method: "GET", url: recordURL(deposits, draft), token: token, want: 200, content: []string{`"status":"draft"`, `"total":0`, `"items_total":0`}},
		},
	)...)
	row := cliRows(t, env.app, items, "deposit", draft)[0].Id
	apiSeq(t, env.app,
		// edit of a draft that names both tables and the memo.
		docBatch(token, cliOp("DELETE", items, row, ""), item(draft, itemB),
			rowOp(lines, "deposit", draft, 0, fmt.Sprintf(`"account":%q,"amount":100,"customer":%q`, env.interest.Id, env.customer.Id)),
			cliOp("PATCH", deposits, draft, `{"memo":"Changed"}`)),
		// edit of a posted deposit with `lines` in the input: a correction that
		// takes the same item and the lines as the caller wrote them.
		docBatch(token, header(fix, `,"replaces":"`+first+`"`), item(fix, itemA),
			rowOp(lines, "deposit", fix, 0, fmt.Sprintf(`"account":%q,"amount":-700,"description":"Bank fee"`, env.fees.Id)), post(fix)),
		apiReq{method: "GET", url: recordURL(deposits, first), token: token, want: 200, content: []string{`"status":"void"`, `"replaced_by":"` + fix + `"`}},
		apiReq{method: "GET", url: recordURL(deposits, fix), token: token, want: 200, content: []string{`"status":"posted"`, `"total":29300`}},
		// edit of a posted deposit with only the memo: the correction sends the
		// stored line back, with its empty customer and vendor.
		docBatch(token, cliOp("POST", deposits, "", fmt.Sprintf(`{"date":"2026-11-16","deposit_to":%q,"id":%q,"memo":"Week 46, corrected","replaces":%q,"status":"draft"}`, env.checking.Id, again, fix)),
			item(again, itemA),
			rowOp(lines, "deposit", again, 0, fmt.Sprintf(`"account":%q,"amount":-700,"customer":"","description":"Bank fee","vendor":""`, env.fees.Id)), post(again)),
		apiReq{method: "GET", url: recordURL(deposits, again), token: token, want: 200, content: []string{`"status":"posted"`, `"total":29300`, `"memo":"Week 46, corrected"`}},
		// void, then delete of the draft: its rows go with it.
		apiReq{method: "PATCH", url: recordURL(deposits, again), token: token, want: 200, body: `{"status":"void"}`, content: []string{`"status":"void"`}},
		apiReq{method: "DELETE", url: recordURL(deposits, draft), token: token, want: 204},
		apiReq{method: "GET", url: rowsURL(items, "deposit", draft), token: token, want: 200, content: []string{`"totalItems":0`}},
	)
	requireNoDrift(t, env.app)
}

func TestCLIDocuments_DepositRefusals(t *testing.T) {
	env := newDepositEnv(t)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const deposits, items = "books_deposits", "books_deposit_items"
	line := env.undepositedItem(t, env.undeposited, depositItemDay, 30000, "Check 1").Id
	header := func(id string) string {
		return cliOp("POST", deposits, "", fmt.Sprintf(`{"date":"2026-11-16","deposit_to":%q,"id":%q,"status":"draft"}`, env.checking.Id, id))
	}
	post := func(id string) string {
		return cliOp("PATCH", deposits, id, `{"status":"posted"}`)
	}
	const first, second = "clideposit00001", "clideposit00002"
	apiSeq(t, env.app,
		// An item that states what Books writes.
		refusedBatch(token, nil, header(first), rowOp(items, "deposit", first, 0, fmt.Sprintf(`"amount":5,"line":%q`, line))),
		// A deposit of nothing.
		refusedBatch(token, []string{"The deposit total must be above $0.00."}, header(first), post(first)),
		docBatch(token, header(first), rowOp(items, "deposit", first, 0, fmt.Sprintf(`"line":%q`, line)), post(first)),
		// Money that is in a posted deposit: the item is named.
		refusedBatch(token, []string{`"items.0"`, "is already in Deposit 1001."}, header(second), rowOp(items, "deposit", second, 0, fmt.Sprintf(`"line":%q`, line)), post(second)),
		apiReq{method: "GET", url: recordURL(deposits, second), token: token, want: 404},
	)
}

// The most rows of a table in cli/documents.json is the server's own limit. A
// table with no `max` has the limit of a document's lines.
func TestCLIDocuments_RowLimitsAreTheServers(t *testing.T) {
	want := map[string]int{
		"payments.applications": maxPaymentApplications,
		"bill-payments.lines":   maxBillPaymentLines,
		"vendor-refunds.lines":  maxVendorRefundLines,
		"deposits.items":        maxDepositItems,
		"deposits.lines":        maxDepositLines,
	}
	seen := 0
	for _, doc := range loadCLIDocuments(t) {
		for _, table := range doc.Lines {
			limit, ok := want[doc.Name+"."+table.Key]
			if !ok {
				continue
			}
			seen++
			most := table.Max
			if most == 0 {
				most = maxDocumentLines
			}
			if most != limit {
				t.Errorf("%s.%s: the CLI takes %d rows, the server %d", doc.Name, table.Key, most, limit)
			}
		}
	}
	if seen != len(want) {
		t.Errorf("%d of the %d tables were found in documents.json", seen, len(want))
	}
}
