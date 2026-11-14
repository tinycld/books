package books

import (
	"fmt"
	"net/http"
	"testing"
)

// The bill takes the shared layer's one-batch save: the owner of the batch
// restates the bill one time, each deferred line write checks its own line,
// and a save states the revision it saw.

func newBillBatchEnv(t *testing.T) *billEnv {
	t.Helper()
	be := newBillEnv(t)
	enableBatch(t, be.app)
	return be
}

// An account line written in a batch keeps its typed amount, as a single
// write does; a product line's amount is Qty x Rate.
func TestBillBatch_KeepsTypedAccountAmounts(t *testing.T) {
	be := newBillBatchEnv(t)
	bill := mkBill(t, be.app, be.officeSupply, nil)
	saw := docRevision(t, be.app, "books_bills", bill.Id)
	ops := []string{
		docLineCreateOp(t, billKind, bill.Id, 0, accountLine(be.designTools, 18745)),
		docLineCreateOp(t, billKind, bill.Id, 1, accountLine(be.designTools, -3890)),
		docLineCreateOp(t, billKind, bill.Id, 2, productLine(be.accessPoint, 3, 12140)),
		docHeaderOp(billKind, bill.Id, fmt.Sprintf(`{"memo":"Quarter supplies","revision":%d}`, saw+1)),
	}
	batchAs(t, be.users.bookkeeper, http.StatusOK, []string{"Quarter supplies"}, ops...).run(t, be.app)

	lines, err := salesDocLines(be.app, billKind, bill.Id)
	if err != nil {
		t.Fatal(err)
	}
	var got []int
	for _, line := range lines {
		got = append(got, line.GetInt("amount"))
	}
	if fmt.Sprint(got) != fmt.Sprint([]int{18745, -3890, 36420}) {
		t.Errorf("line amounts = %v, want [18745 -3890 36420]", got)
	}
	requireBillTotal(t, be.app, bill.Id, 18745-3890+36420)
	if rev := docRevision(t, be.app, "books_bills", bill.Id); rev != saw+1 {
		t.Errorf("revision = %d, want %d", rev, saw+1)
	}
}

// A deferred line write names a bill's line by its table and its place among
// that table's lines, as a single write does.
func TestBillBatch_NamesTheLineByItsTable(t *testing.T) {
	be := newBillBatchEnv(t)
	bill := mkBill(t, be.app, be.officeSupply, nil)
	ops := []string{
		docLineCreateOp(t, billKind, bill.Id, 0, accountLine(be.designTools, 18745)),
		docLineCreateOp(t, billKind, bill.Id, 1, productLine(be.accessPoint, 3, 12140)),
		docLineCreateOp(t, billKind, bill.Id, 2, accountLine(be.designTools, 0)),
	}
	batchAs(t, be.users.bookkeeper, http.StatusBadRequest,
		[]string{fmt.Sprintf(msgBillAccountAmountZero, 2)}, ops...).run(t, be.app)
	requireBillLineCount(t, be.app, bill, 0)
}

// A save that states a revision the bill no longer has is refused with the
// bill's own text, and changes nothing.
func TestBillBatch_RefusesAStaleSave(t *testing.T) {
	be := newBillBatchEnv(t)
	bill := mkBill(t, be.app, be.officeSupply, nil)
	mkBillLine(t, be.app, bill, 0, accountLine(be.designTools, 18745))
	saw := docRevision(t, be.app, "books_bills", bill.Id)
	ops := []string{
		docLineCreateOp(t, billKind, bill.Id, 1, accountLine(be.designTools, 500)),
		docHeaderOp(billKind, bill.Id, fmt.Sprintf(`{"memo":"stale","revision":%d}`, saw)),
	}
	// The batch answers 400 for any failed operation; the operation's 409 and
	// its text are in the body.
	batchAs(t, be.users.bookkeeper, http.StatusBadRequest, []string{msgBillRevisionConflict}, ops...).run(t, be.app)
	patchDoc(t, be.app, be.users.bookkeeper, "books_bills", bill.Id,
		fmt.Sprintf(`{"memo":"stale","revision":%d}`, saw), http.StatusConflict, msgBillRevisionConflict)
	requireBillLineCount(t, be.app, bill, 1)
	requireBillTotal(t, be.app, bill.Id, 18745)
	if got := reload(t, be.app, "books_bills", bill.Id).GetString("memo"); got == "stale" {
		t.Error("the refused save changed the memo")
	}
}

// A product keeps an expense account that became inactive after it was saved;
// the post refuses it by the bill's product line, not by the entry's line.
func TestBillPost_RefusesAProductsInactiveExpenseAccount(t *testing.T) {
	be := newBillEnv(t)
	bill := mkBill(t, be.app, be.officeSupply, nil)
	mkBillLine(t, be.app, bill, 0, accountLine(be.designTools, 18745))
	mkBillLine(t, be.app, bill, 1, productLine(be.patchCable, 2, 1860))
	mkBillLine(t, be.app, bill, 2, productLine(be.accessPoint, 3, 12140))
	expense := reload(t, be.app, "books_products", be.accessPoint.Id).GetString("expense_account")
	if err := setFields(t, be.app, "books_accounts", expense, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make the access point's expense account inactive: %v", err)
	}

	err := postBillAs(be.app, bill.Id, be.users.bookkeeper.Id)
	requireRefusalText(t, err, fmt.Sprintf(msgLineExpenseAccountInactive, "Product line 2", "Wireless access point"))
	requireBillNotPosted(t, be.app, bill.Id, 1001)
}
