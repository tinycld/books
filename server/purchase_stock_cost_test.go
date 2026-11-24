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
// checks the relations of every row it saves.
const (
	billPostStatementBound       = 168
	adjustmentPostStatementBound = 4236
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
