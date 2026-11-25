package books

import (
	"fmt"
	"strconv"
	"strings"
	"testing"
)

// A bill, an expense and a vendor credit through the writes of their commands:
// one account line (the amount is typed) and one item line of an Inventory item
// (Books computes the amount, and the stock moves at the post). The bodies are
// those of cli/document_purchase_test.go, with the ids of this book.
func TestCLIDocuments_PurchasesRoundTrip(t *testing.T) {
	env := newBuyStockEnv(t, costingFIFO)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	widget := recordURL("books_products", env.stock.widget.Id)
	types := []struct {
		collection, lines, parent, id, header, docType string
		posted, stock                                  []string
		// entryLines is the count of lines of the journal entry. A vendor credit
		// takes the item out through the inventory asset, with two more lines.
		entryLines int
	}{
		{"books_bills", "books_bill_lines", "bill", "clibill00000001",
			fmt.Sprintf(`"date":"2026-11-04","due_date":"2026-12-04","id":"clibill00000001","ref_no":"S-88","status":"draft","vendor":%q`, env.summit.Id),
			"bill", []string{`"number":"1001"`, `"subtotal":6500`, `"total":6500`, `"balance":6500`},
			[]string{`"quantity_on_hand":4`, `"stock_value":2000`}, 3},
		{"books_expenses", "books_expense_lines", "expense", "cliexpense00001",
			fmt.Sprintf(`"date":"2026-11-04","id":"cliexpense00001","paid_from":%q,"payment_method":"check","status":"draft","vendor":%q`, env.checking1000.Id, env.summit.Id),
			"expense", []string{`"number":"1001"`, `"total":6500`},
			[]string{`"quantity_on_hand":8`, `"stock_value":4000`}, 3},
		{"books_vendor_credits", "books_vendor_credit_lines", "vendor_credit", "clivcredit00001",
			fmt.Sprintf(`"date":"2026-11-04","id":"clivcredit00001","status":"draft","vendor":%q`, env.summit.Id),
			"vendor_credit", []string{`"number":"1001"`, `"total":6500`, `"balance":6500`},
			[]string{`"quantity_on_hand":4`, `"stock_value":2000`}, 5},
	}
	for _, tc := range types {
		t.Run(tc.collection, func(t *testing.T) {
			account := func(id string, cents int) string {
				return rowOp(tc.lines, tc.parent, id, 0, fmt.Sprintf(`"account":%q,"amount":%d,"description":"Design tools","kind":"account"`, env.software.Id, cents))
			}
			item := func(id string) string {
				return rowOp(tc.lines, tc.parent, id, 1, fmt.Sprintf(`"kind":"item","product":%q,"quantity":4,"rate":500`, env.stock.widget.Id))
			}
			post := func(id string) string {
				return cliOp("PATCH", tc.collection, id, `{"revision":1,"status":"posted"}`)
			}
			apiSeq(t, env.app, apiCalls(
				// add --post
				[]apiReq{docBatch(token, cliOp("POST", tc.collection, "", `{`+tc.header+`}`), account(tc.id, 4500), item(tc.id), post(tc.id))},
				showDoc(token, tc.collection, tc.id, append([]string{`"status":"posted"`, `"revision":1`}, tc.posted...),
					tc.lines, tc.parent, []string{`"totalItems":2`, `"amount":4500`, `"amount":2000`}),
				[]apiReq{{method: "GET", url: widget, token: token, want: 200, content: tc.stock}},
			)...)
			entryID := reload(t, env.app, tc.collection, tc.id).GetString("entry")
			if entryID == "" {
				t.Fatal("the posted document has no entry")
			}
			apiSeq(t, env.app, showDoc(token, "books_journal_entries", entryID,
				[]string{`"doc_type":"` + tc.docType + `"`, `"document":"` + tc.id + `"`},
				"books_journal_lines", "entry", []string{fmt.Sprintf(`"totalItems":%d`, tc.entryLines)})...)

			// edit of the posted document: a correction with the stored values,
			// the empty ones too, and no amount on the item line.
			fix := "clifix00" + tc.id[8:]
			apiSeq(t, env.app,
				docBatch(token, cliOp("POST", tc.collection, "", `{`+replaceID(tc.header, tc.id, fix)+`,"memo":"Corrected","replaces":"`+tc.id+`"}`),
					rowOp(tc.lines, tc.parent, fix, 0, fmt.Sprintf(`"account":%q,"amount":4500,"description":"Design tools","kind":"account","product":"","quantity":0,"rate":0`, env.software.Id)),
					rowOp(tc.lines, tc.parent, fix, 1, fmt.Sprintf(`"account":"","description":"","kind":"item","product":%q,"quantity":4,"rate":500`, env.stock.widget.Id)),
					post(fix)),
				apiReq{method: "GET", url: recordURL(tc.collection, fix), token: token, want: 200,
					content: []string{`"status":"posted"`, `"total":6500`, `"replaces":"` + tc.id + `"`}},
				apiReq{method: "GET", url: recordURL(tc.collection, tc.id), token: token, want: 200, content: []string{`"status":"void"`}},
				apiReq{method: "GET", url: widget, token: token, want: 200, content: tc.stock},
			)

			// add, edit of the draft (new lines, the header last), post, void.
			// A vendor's bill number is used one time, so the draft has its own.
			draft := "clidraft" + tc.id[8:]
			draftHeader := strings.Replace(replaceID(tc.header, tc.id, draft), `"ref_no":"S-88"`, `"ref_no":"S-89"`, 1)
			apiSeq(t, env.app,
				docBatch(token, cliOp("POST", tc.collection, "", `{`+draftHeader+`}`),
					cliOp("POST", tc.lines, "", fmt.Sprintf(`{"id":"clidraftline001","account":%q,"amount":100,"kind":"account",%q:%q,"position":0}`, env.software.Id, tc.parent, draft))),
				docBatch(token, cliOp("DELETE", tc.lines, "clidraftline001", ""), account(draft, 300),
					cliOp("PATCH", tc.collection, draft, `{"memo":"Changed","revision":2}`)),
				apiReq{method: "GET", url: recordURL(tc.collection, draft), token: token, want: 200,
					content: []string{`"status":"draft"`, `"total":300`, `"revision":2`, `"memo":"Changed"`}},
				apiReq{method: "PATCH", url: recordURL(tc.collection, draft), token: token, want: 200,
					body: `{"revision":3,"status":"posted"}`, content: []string{`"status":"posted"`, `"number":"1002"`}},
				apiReq{method: "PATCH", url: recordURL(tc.collection, draft), token: token, want: 200,
					body: `{"status":"void"}`, content: []string{`"status":"void"`}},
				apiReq{method: "DELETE", url: recordURL(tc.collection, draft), token: token, want: 404},
			)
		})
	}
	requireNoDrift(t, env.app)
}

// Books computes the amount of an item line and refuses one that is sent, so
// a correction (`bills edit` of a posted bill) copies an item line without its
// amount (documents.json `computed`) and an account line with it.
func TestCLIDocuments_BillItemLineAmountIsBooksOwn(t *testing.T) {
	env := newBuyStockEnv(t, costingFIFO)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	bill := func(id, extra string) string {
		return cliOp("POST", "books_bills", "", fmt.Sprintf(`{"date":"2026-11-04","due_date":"2026-12-04","id":%q,"status":"draft","vendor":%q%s}`, id, env.summit.Id, extra))
	}
	item := func(id, amount string) string {
		return rowOp("books_bill_lines", "bill", id, 0, fmt.Sprintf(`"account":"","description":"","kind":"item","product":%q,"quantity":4,"rate":500%s`, env.stock.widget.Id, amount))
	}
	account := func(id string) string {
		return rowOp("books_bill_lines", "bill", id, 1, fmt.Sprintf(`"account":%q,"amount":4500,"description":"","kind":"account","product":"","quantity":0,"rate":0`, env.software.Id))
	}
	post := func(id string) string {
		return cliOp("PATCH", "books_bills", id, `{"revision":1,"status":"posted"}`)
	}
	// The header of the correction as `bills edit` sends it: every writable
	// field of the posted bill, also the empty ones, and its bill number again.
	const correction = `,"memo":"Corrected","ref_no":"S-88","replaces":"clibill00000001","terms":""`
	apiSeq(t, env.app,
		docBatch(token, bill("clibill00000001", `,"ref_no":"S-88"`), item("clibill00000001", ""), account("clibill00000001"), post("clibill00000001")),
		// The copy of the stored item line with its stored amount is refused.
		refusedBatch(token, []string{"Books computes a line's amount."},
			bill("clibill00000002", correction), item("clibill00000002", `,"amount":2000`), account("clibill00000002"), post("clibill00000002")),
		apiReq{method: "GET", url: recordURL("books_bills", "clibill00000001"), token: token, want: 200, content: []string{`"status":"posted"`}},
		// The correction as `edit` sends it.
		docBatch(token, bill("clibill00000002", correction), item("clibill00000002", ""), account("clibill00000002"), post("clibill00000002")),
		apiReq{method: "GET", url: recordURL("books_bills", "clibill00000002"), token: token, want: 200,
			content: []string{`"status":"posted"`, `"total":6500`, `"replaces":"clibill00000001"`}},
		apiReq{method: "GET", url: recordURL("books_bills", "clibill00000001"), token: token, want: 200,
			content: []string{`"status":"void"`, `"replaced_by":"clibill00000002"`}},
		// The stock holds the 4 units of the correction, not 8.
		apiReq{method: "GET", url: recordURL("books_products", env.stock.widget.Id), token: token, want: 200,
			content: []string{`"quantity_on_hand":4`, `"stock_value":2000`}},
		// An account line with no amount is refused, and names the line.
		refusedBatch(token, []string{"Account line 1: Enter an amount other than 0."},
			bill("clibill00000003", ""), rowOp("books_bill_lines", "bill", "clibill00000003", 0, fmt.Sprintf(`"account":%q,"kind":"account"`, env.software.Id)), post("clibill00000003")),
	)
	requireNoDrift(t, env.app)
}

// The cases of testdata/document_totals.json that have an account line, sent
// as the batch of `bills add`: what the server stores is what the form shows
// (see TestCLIDocuments_TotalsMatchTheFormCases).
func TestCLIDocuments_BillTotalsMatchTheFormCases(t *testing.T) {
	env := newBuyStockEnv(t, costingFIFO)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	ran := 0
	for index, tc := range loadDocumentTotalsVectors(t).Cases {
		if tc.Lines[0].Kind != lineKindAccount {
			continue
		}
		ran++
		t.Run(tc.Name, func(t *testing.T) {
			id := fmt.Sprintf("clibilltot%05d", index)
			ops := []string{cliOp("POST", "books_bills", "", fmt.Sprintf(`{"date":"2026-11-04","due_date":"2026-12-04","id":%q,"status":"draft","vendor":%q}`, id, env.summit.Id))}
			for position, l := range tc.Lines {
				fields := fmt.Sprintf(`"account":%q,"amount":%d,"kind":"account"`, env.software.Id, l.Amount)
				if l.Kind == lineKindItem {
					fields = fmt.Sprintf(`"kind":"item","product":%q,"quantity":%s,"rate":%d`, env.accessPoint.Id, strconv.FormatFloat(l.Quantity, 'f', -1, 64), l.Rate)
				}
				ops = append(ops, rowOp("books_bill_lines", "bill", id, position, fields))
			}
			if tc.TooLarge {
				apiSeq(t, env.app, refusedBatch(token, []string{`"message":"The bill total is more than Books can store."`}, ops...))
				return
			}
			apiSeq(t, env.app, docBatch(token, ops...))
			stored := reload(t, env.app, "books_bills", id)
			if got := [2]int64{int64(stored.GetFloat("subtotal")), int64(stored.GetFloat("total"))}; got != [2]int64{tc.Subtotal, tc.Total} {
				t.Errorf("subtotal/total = %v, want %v", got, [2]int64{tc.Subtotal, tc.Total})
			}
			rows := cliRows(t, env.app, "books_bill_lines", "bill", id)
			if len(rows) != len(tc.Amounts) {
				t.Fatalf("%d lines, want %d", len(rows), len(tc.Amounts))
			}
			for i, want := range tc.Amounts {
				if want == nil {
					t.Fatalf("line %d of the case has no amount", i)
				}
				if got := int64(rows[i].GetFloat("amount")); got != *want {
					t.Errorf("line %d amount = %d, want %d", i, got, *want)
				}
			}
		})
	}
	if ran == 0 {
		t.Error("testdata/document_totals.json has no case with an account line")
	}
}
