package books

import (
	"testing"
)

// The statement bounds of a bill's post and an inventory adjustment's post, as
// sales_document_cost_test.go bounds a sales document's: a read for each line
// makes the count grow with the lines. Each bound is the measured value plus
// 10 percent. Measured 2026-11-24: 153 for the bill, the same at 50 lines
// (649 while each line's product and account were read one at a time); 3,851
// for the adjustment (4,349 then). The adjustment still grows by 15 statements
// a line: each line writes a stock move and a cost layer, and PocketBase
// checks the relations of every row it saves. After the purchase postings
// (Task 12) the bill's post is 156 statements (its stock role reads the
// stock settings and the stock moves of the document), and a 250-line bill
// of two Inventory items is 3,893, 15.6 a line for the same reason as the
// adjustment: a receipt writes a stock move and a cost layer for each line.
// Task 13's returns read the moves that a post takes away once. While the
// post read them twice, the bill's post was 157 statements; it is 156 now.
// No return is read for each line.
const (
	billPostStatementBound          = 171
	adjustmentPostStatementBound    = 4236
	inventoryBillPostStatementBound = 4282
)

// billPostStatements saves a draft bill of n lines (every third an account
// line, the others product lines of two products) and counts the statements
// of its post.
func billPostStatements(t *testing.T, n int) int {
	t.Helper()
	pe := newBillPostingEnv(t)
	bill := mkBill(t, pe.app, pe.officeSupply, nil)
	for i := 0; i < n; i++ {
		switch i % 3 {
		case 0:
			mkBillLine(t, pe.app, bill, i, accountLine(pe.designTools, 100))
		case 1:
			mkBillLine(t, pe.app, bill, i, productLine(pe.accessPoint, 1, 100))
		default:
			mkBillLine(t, pe.app, bill, i, productLine(pe.patchCable, 1, 100))
		}
	}
	return countStatements(t, pe.app, func(string) bool { return true }, func() {
		mustPostBill(t, pe.app, bill.Id, pe.users.bookkeeper.Id)
	})
}

// adjustmentPostStatements saves a draft adjustment of n stock-in lines of two
// Inventory items and counts the statements of its post.
func adjustmentPostStatements(t *testing.T, n int) int {
	t.Helper()
	se := newAdjustmentEnv(t)
	gadget := se.mkInventoryItem(t, "Gadget", 300)
	lines := make([]adjustmentLineInput, n)
	for i := range lines {
		lines[i] = se.stockIn(1, 500)
		if i%2 == 1 {
			lines[i].Product = gadget.Id
		}
	}
	draft := se.draftAdjustment(t, "2026-11-04", lines...)
	return countStatements(t, se.app, func(string) bool { return true }, func() {
		if err := se.postAdjustment(draft.Id); err != nil {
			t.Fatalf("post the adjustment: %v", err)
		}
	})
}

// inventoryBillPostStatements saves a draft bill of n product lines of two
// Inventory items (widget and a second one) and counts the statements of its
// post.
func inventoryBillPostStatements(t *testing.T, n int) int {
	t.Helper()
	e := newBuyStockEnv(t, costingFIFO)
	gadget := e.stock.mkInventoryItem(t, "Gadget", 300)
	bill := mkBill(t, e.app, e.summit, map[string]any{"date": "2026-07-01", "due_date": "2026-07-31"})
	for i := 0; i < n; i++ {
		product := e.stock.widget
		if i%2 == 1 {
			product = gadget
		}
		mkBillLine(t, e.app, bill, i, productLine(product, 1, 100))
	}
	return countStatements(t, e.app, func(string) bool { return true }, func() {
		mustPostBill(t, e.app, bill.Id, e.users.bookkeeper.Id)
	})
}

func TestPostCost_250LineInventoryBill(t *testing.T) {
	statements := inventoryBillPostStatements(t, maxDocumentLines)
	t.Logf("post of a 250-line bill of Inventory items: %d statements", statements)
	if statements > inventoryBillPostStatementBound {
		t.Fatalf(msgStatementBound, statements, inventoryBillPostStatementBound)
	}
}

func TestPostCost_250LineBill(t *testing.T) {
	statements := billPostStatements(t, maxDocumentLines)
	t.Logf("post of a 250-line bill: %d statements", statements)
	if statements > billPostStatementBound {
		t.Fatalf(msgStatementBound, statements, billPostStatementBound)
	}
}

func TestPostCost_250LineInventoryAdjustment(t *testing.T) {
	statements := adjustmentPostStatements(t, 250)
	t.Logf("post of a 250-line inventory adjustment: %d statements", statements)
	if statements > adjustmentPostStatementBound {
		t.Fatalf(msgStatementBound, statements, adjustmentPostStatementBound)
	}
}
