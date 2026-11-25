package books

import (
	"fmt"
	"testing"
)

// An Inventory item on a sales line needs nothing more from the CLI than its
// id in `product`: Books moves the stock and writes the cost lines when the
// document is posted, and `entry` prints them. The quantity on hand may go
// below zero (spec "Inventory"): Books posts such a sale.
func TestCLIDocuments_InventoryItemOnASalesLine(t *testing.T) {
	env := newSaleStockEnv(t, costingFIFO)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	// 10 units on hand, 700 each.
	env.stock.mustAdjust(t, "2026-11-01", env.stock.stockIn(10, 7000))
	widget := recordURL("books_products", env.stock.widget.Id)
	stock := func(content ...string) apiReq {
		return apiReq{method: "GET", url: widget, token: token, want: 200, content: content}
	}
	sale := func(collection, lines, parent, id, header string, units int) apiReq {
		return docBatch(token,
			cliOp("POST", collection, "", fmt.Sprintf(`{%s,"date":"2026-11-04","id":%q,"status":"draft"}`, header, id)),
			rowOp(lines, parent, id, 0, fmt.Sprintf(`"kind":"item","product":%q,"quantity":%d,"rate":2000`, env.stock.widget.Id, units)),
			cliOp("PATCH", collection, id, `{"revision":1,"status":"posted"}`))
	}
	const inv, receipt = "cliinvstock0001", "clircptstock001"
	apiSeq(t, env.app,
		stock(`"quantity_on_hand":10`, `"stock_value":7000`),
		// invoices add --post: 4 of 10 leave the stock at their cost.
		sale("books_invoices", "books_invoice_lines", "invoice", inv,
			fmt.Sprintf(`"customer":%q,"due_date":"2026-12-04"`, env.customer.Id), 4),
		stock(`"quantity_on_hand":6`, `"stock_value":4200`),
		// A draft moves nothing.
		docBatch(token,
			cliOp("POST", "books_invoices", "", fmt.Sprintf(`{"customer":%q,"date":"2026-11-04","due_date":"2026-12-04","id":"cliinvstock0002","status":"draft"}`, env.customer.Id)),
			rowOp("books_invoice_lines", "invoice", "cliinvstock0002", 0, fmt.Sprintf(`"kind":"item","product":%q,"quantity":5,"rate":2000`, env.stock.widget.Id))),
		stock(`"quantity_on_hand":6`, `"stock_value":4200`),
		// sales-receipts add --post of 8 with 6 on hand: Books posts it.
		sale("books_sales_receipts", "books_sales_receipt_lines", "sales_receipt", receipt,
			fmt.Sprintf(`"deposit_to":%q`, env.checking.Id), 8),
		apiReq{method: "GET", url: recordURL("books_sales_receipts", receipt), token: token, want: 200,
			content: []string{`"status":"posted"`, `"total":16000`}},
		stock(`"quantity_on_hand":-2`),
		// sales-receipts void: the stock comes back.
		apiReq{method: "PATCH", url: recordURL("books_sales_receipts", receipt), token: token, want: 200,
			body: `{"status":"void"}`, content: []string{`"status":"void"`}},
		stock(`"quantity_on_hand":6`, `"stock_value":4200`),
	)
	// invoices entry: receivable and income, and the cost of the 4 units.
	entryID := reload(t, env.app, "books_invoices", inv).GetString("entry")
	lines := mustLines(t, env.app, entryID)
	if len(lines) != 4 {
		t.Fatalf("the entry of the invoice has %d lines, want 4", len(lines))
	}
	cost := map[string]string{}
	for _, line := range lines {
		cost[line.GetString("account")] = fmt.Sprintf("%d/%d", line.GetInt("debit"), line.GetInt("credit"))
	}
	if cost[env.stock.asset.Id] != "0/2800" || cost[env.stock.cogs.Id] != "2800/0" {
		t.Errorf("the cost lines: inventory asset %s, cost of goods sold %s; want 0/2800 and 2800/0", cost[env.stock.asset.Id], cost[env.stock.cogs.Id])
	}
	apiSeq(t, env.app, showDoc(token, "books_journal_entries", entryID, []string{`"doc_type":"invoice"`, `"total":10800`},
		"books_journal_lines", "entry", []string{`"totalItems":4`, `"debit":2800`, `"credit":2800`})...)
	requireNoDrift(t, env.app)
}
