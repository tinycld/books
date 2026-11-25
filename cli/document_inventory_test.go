package cli

import (
	"os"
	"strings"
	"testing"
)

// A sale of an Inventory item is an item line with its id: the CLI has no
// stock field and no stock check. What Books does with the line is said where
// a caller reads the fields, and in the help topic.
func TestSalesLinesSayWhatAnInventoryItemDoes(t *testing.T) {
	for _, name := range []string{"invoices", "sales-receipts", "credit-memos", "refund-receipts"} {
		doc := findDocument(name)
		if doc == nil {
			t.Errorf("there is no document %s", name)
			continue
		}
		table := doc.table("lines")
		product := table.asResource().field("product")
		if product == nil || product.Ref != "products" || product.ReadOnly || !strings.Contains(product.Help, "Inventory item") {
			t.Errorf("%s: the product of a line = %+v", name, product)
		}
		for _, stock := range []string{"quantity_on_hand", "stock_value", "cost", "cogs"} {
			if table.asResource().field(stock) != nil {
				t.Errorf("%s: a line has the stock field %q; Books computes the cost", name, stock)
			}
		}
	}
	topic, err := os.ReadFile("../help/command-line.md")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"## To sell an Inventory item", "goes below zero", "`quantity_on_hand`"} {
		if !strings.Contains(string(topic), want) {
			t.Errorf("the help topic does not say %q", want)
		}
	}
}

// An oversell is the server's to judge (it posts it): the CLI sends the
// quantity it was given, whatever the product record says is on hand.
func TestInvoiceOfMoreThanIsOnHandIsSent(t *testing.T) {
	f := sales(t)
	fixedIDs(t, "invstock0000001")
	input := `{"customer": "custacme0000001", "date": "2026-11-04", "due_date": "2026-12-04",
		"lines": [{"kind": "item", "product": "prodwidget00001", "quantity": 8, "rate": 2000}]}`
	if _, _, err := runCmd(t, f.serve(), input, "books", "invoices", "add", "--input", "-", "--post", "--json"); err != nil {
		t.Fatal(err)
	}
	if len(f.batches) != 1 || !strings.Contains(sentBatch(t, f, 0), `"product":"prodwidget00001","quantity":8,"rate":2000`) {
		t.Errorf("the batch:\n%s", sentBatch(t, f, 0))
	}
	// One batch and the read back: no read of the product before the write.
	for _, req := range f.requests {
		if strings.Contains(req, "books_products") {
			t.Errorf("the command read a product: %s", req)
		}
	}
}
