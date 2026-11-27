package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// A bill made from a purchase order (spec §3.8): the bill names the order
// (purchase_order) and each line it took names its order line (po_line).
// Nothing changes on the order until the bill posts; the post, a void, the
// delete of a draft and a correction compute the order's received, billed and
// open values again in their own transaction, and the order closes as
// received when no line is open. These tests save, post and void through the
// app, so every bill and order guard runs.

// The refusal texts of the bill's order link guards, as the client gets them.
// Written out here, not read from the consts, so a change of wording fails this
// file too.
const (
	wantBillOrderVendor  = "A bill from a purchase order bills the order's vendor."
	wantBillKeepsOrder   = "A bill keeps the purchase order it was made from."
	wantBillLineOtherPO  = "Line %d names a line of another purchase order."
	wantBillLineOtherTab = "Line %d names a purchase order line of the other table."
)

func wantBillOrderClosed(number string) string {
	return "Purchase order " + number + " is closed. Reopen it to copy it to a bill."
}

func wantBillLineKeepsProduct(n int, number string) string {
	return fmt.Sprintf("Product line %d: a line from purchase order %s keeps its product. Remove it and add a new line.", n, number)
}

func wantBillLineKeepsAccount(n int, number string) string {
	return fmt.Sprintf("Account line %d: a line from purchase order %s keeps its account. Remove it and add a new line.", n, number)
}

// poBillEnv is the purchase order env with the bill guards bound as well (the
// generated books:bill and books:purchase_order hosts in one call: core keeps
// one set of bound hosts per app) and 2000 Accounts payable in the chart, so
// its bills post. Unlike newPOEnv it lets the book hold the bills' entries.
type poBillEnv struct {
	*poEnv
	payable *core.Record
}

func newPOBillEnv(t *testing.T) *poBillEnv {
	t.Helper()
	env := newLedgerEnv(t)
	registerSalesDocGuards(env.app, billKind)
	registerSalesDocGuards(env.app, purchaseOrderKind)
	bindHostsByKey(t, env.app, billKind.HostKey, purchaseOrderKind.HostKey)
	be := billEnvOn(t, env)
	return &poBillEnv{
		poEnv:   &poEnv{billEnv: be},
		payable: mkNumberedAccount(t, env.app, "Accounts payable", "2000", "accounts_payable", "accounts_payable"),
	}
}

// orderBill saves a draft bill of order for its vendor, through every guard.
func (pb *poBillEnv) orderBill(t testing.TB, order *core.Record, fields map[string]any) *core.Record {
	t.Helper()
	vendor := reload(t, pb.app, "books_vendors", order.GetString("vendor"))
	all := map[string]any{"purchase_order": order.Id}
	for k, v := range fields {
		all[k] = v
	}
	return mkBill(t, pb.app, vendor, all)
}

// linkedLineFields is a bill line that takes quantity (a product line, at the
// order line's rate) or amount (an account line) of poLine, with its product
// or account and po_line.
func linkedLineFields(poLine *core.Record, quantity float64, amount int64) map[string]any {
	if poLine.GetString("kind") == "item" {
		return map[string]any{
			"kind": "item", "product": poLine.GetString("product"), "quantity": quantity,
			"rate": poLine.GetInt("rate"), "po_line": poLine.Id,
		}
	}
	return map[string]any{"kind": "account", "account": poLine.GetString("account"), "amount": amount, "po_line": poLine.Id}
}

func (pb *poBillEnv) linkedLine(t testing.TB, bill *core.Record, position int, poLine *core.Record, quantity float64, amount int64) *core.Record {
	t.Helper()
	return mkBillLine(t, pb.app, bill, position, linkedLineFields(poLine, quantity, amount))
}

// postedOrderBill saves a bill of order whose lines take takes[i] of lines[i]
// (a quantity of a product line, an amount of an account line) and posts it.
func (pb *poBillEnv) postedOrderBill(t testing.TB, order *core.Record, lines []*core.Record, takes []float64) *core.Record {
	t.Helper()
	bill := pb.orderBill(t, order, nil)
	for i, line := range lines {
		pb.linkedLine(t, bill, i, line, takes[i], int64(takes[i]))
	}
	return mustPostBill(t, pb.app, bill.Id, pb.users.bookkeeper.Id)
}

// tenAndThree is an open order 1001 for Office Supply World with a product
// line of 10 Wireless access points at 121.40 and an account line of 300.00 on
// 6200 Software Subscriptions: 1214.00 + 300.00 = 1514.00, all open.
func (pb *poBillEnv) tenAndThree(t testing.TB) (order, item, account *core.Record) {
	t.Helper()
	order = mkPO(t, pb.app, pb.officeSupply, nil)
	item = mkPOLine(t, pb.app, order, 0, productLine(pb.accessPoint, 10, 12140))
	account = mkPOLine(t, pb.app, order, 1, accountLine(pb.software, 30000))
	requirePOTotals(t, pb.app, order.Id, 151400, 151400)
	requireOnPO(t, pb.app, pb.accessPoint, 10)
	return order, item, account
}

// Spec §3.8 (Q4): a bill from an order saves as a draft with its links, and
// nothing changes on the order until it posts.
func TestBillFromOrder_ADraftChangesNothingOnTheOrder(t *testing.T) {
	pb := newPOBillEnv(t)
	order, item, account := pb.tenAndThree(t)

	bill := pb.orderBill(t, order, nil)
	itemLine := pb.linkedLine(t, bill, 0, item, 4, 0)
	accountLineRow := pb.linkedLine(t, bill, 1, account, 0, 12000)

	stored := reload(t, pb.app, "books_bills", bill.Id)
	if stored.GetString("status") != statusDraft || stored.GetString("purchase_order") != order.Id {
		t.Errorf("bill status %q purchase_order %q, want a draft that names the order", stored.GetString("status"), stored.GetString("purchase_order"))
	}
	for _, l := range []struct{ row, poLine *core.Record }{{itemLine, item}, {accountLineRow, account}} {
		if got := reload(t, pb.app, "books_bill_lines", l.row.Id).GetString("po_line"); got != l.poLine.Id {
			t.Errorf("bill line po_line = %q, want the order line %q", got, l.poLine.Id)
		}
	}
	requirePOLineOpen(t, pb.app, item.Id, 0, 0, 10, 121400)
	requirePOLineOpen(t, pb.app, account.Id, 0, 0, 0, 30000)
	requirePOTotals(t, pb.app, order.Id, 151400, 151400)
	requirePOStatus(t, pb.app, order.Id, "open", "")
	requireOnPO(t, pb.app, pb.accessPoint, 10)
}

// Spec §3.8: the post writes each order line's received and billed values, the
// open values, the header's open amount and the product's quantity on PO in
// the posting transaction: a read inside the transaction that posts sees them.
func TestBillFromOrder_ThePostWritesTheOrderInThePostingTransaction(t *testing.T) {
	pb := newPOBillEnv(t)
	order, item, account := pb.tenAndThree(t)
	bill := pb.orderBill(t, order, nil)
	pb.linkedLine(t, bill, 0, item, 4, 0)
	pb.linkedLine(t, bill, 1, account, 0, 12000)

	err := pb.app.RunInTransaction(func(tx core.App) error {
		fresh, err := tx.FindRecordById("books_bills", bill.Id)
		if err != nil {
			return err
		}
		fresh.Set("status", statusPosted)
		fresh.Set("posted_by", pb.users.bookkeeper.Id)
		if err := tx.Save(fresh); err != nil {
			return fmt.Errorf("post the bill: %w", err)
		}
		line, err := tx.FindRecordById("books_purchase_order_lines", item.Id)
		if err != nil {
			return err
		}
		product, err := tx.FindRecordById("books_products", pb.accessPoint.Id)
		if err != nil {
			return err
		}
		header, err := tx.FindRecordById("books_purchase_orders", order.Id)
		if err != nil {
			return err
		}
		if line.GetFloat("received") != 4 || product.GetFloat("quantity_on_po") != 6 || header.GetInt("open_amount") != 90840 {
			return fmt.Errorf("inside the posting transaction: received %v, quantity_on_po %v, header open_amount %d; want 4, 6, 90840",
				line.GetFloat("received"), product.GetFloat("quantity_on_po"), header.GetInt("open_amount"))
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	// 10 - 4 = 6 open, 6 x 121.40 = 728.40; 300.00 - 120.00 = 180.00 open.
	requirePOLineOpen(t, pb.app, item.Id, 4, 48560, 6, 72840)
	requirePOLineOpen(t, pb.app, account.Id, 0, 12000, 0, 18000)
	requirePOTotals(t, pb.app, order.Id, 151400, 90840)
	requirePOStatus(t, pb.app, order.Id, "open", "")
	requireOnPO(t, pb.app, pb.accessPoint, 6)
}

// Spec §3.8: a second partial bill adds to what the first took, and the bill
// that takes the last open quantity and amount closes the order as received:
// closed_at set, closed_by empty, the header's open amount 0.
func TestBillFromOrder_PartialBillsAddUpAndTheLastClosesTheOrder(t *testing.T) {
	pb := newPOBillEnv(t)
	order, item, account := pb.tenAndThree(t)
	lines := []*core.Record{item, account}

	pb.postedOrderBill(t, order, lines, []float64{4, 12000})
	pb.postedOrderBill(t, order, lines, []float64{3, 5000})
	// 7 of 10 received: 3 open, 3 x 121.40 = 364.20; 170.00 billed, 130.00 open.
	requirePOLineOpen(t, pb.app, item.Id, 7, 84980, 3, 36420)
	requirePOLineOpen(t, pb.app, account.Id, 0, 17000, 0, 13000)
	requirePOTotals(t, pb.app, order.Id, 151400, 49420)
	requirePOStatus(t, pb.app, order.Id, "open", "")
	requireOnPO(t, pb.app, pb.accessPoint, 3)

	pb.postedOrderBill(t, order, lines, []float64{3, 13000})
	requirePOLineOpen(t, pb.app, item.Id, 10, 121400, 0, 0)
	requirePOLineOpen(t, pb.app, account.Id, 0, 30000, 0, 0)
	closed := reload(t, pb.app, "books_purchase_orders", order.Id)
	if closed.GetString("status") != "closed" || closed.GetString("closed_reason") != "received" ||
		closed.GetDateTime("closed_at").IsZero() || closed.GetString("closed_by") != "" {
		t.Errorf("status %q closed_reason %q closed_at %v closed_by %q, want closed, received, a time and no one",
			closed.GetString("status"), closed.GetString("closed_reason"), closed.GetDateTime("closed_at"), closed.GetString("closed_by"))
	}
	requirePOTotals(t, pb.app, order.Id, 151400, 0)
	requireOnPO(t, pb.app, pb.accessPoint, 0)
}

// Spec §8 (Q5): the server does not refuse a bill quantity above the open one.
// The bill posts and the line's open values are 0, not negative.
func TestBillFromOrder_AQuantityAboveTheOpenOnePostsAndOpenIsZero(t *testing.T) {
	pb := newPOBillEnv(t)
	order := mkPO(t, pb.app, pb.officeSupply, nil)
	item := mkPOLine(t, pb.app, order, 0, productLine(pb.accessPoint, 2, 12140))

	posted := pb.postedOrderBill(t, order, []*core.Record{item}, []float64{5})
	if posted.GetString("status") != statusPosted {
		t.Fatalf("bill status = %q, want posted", posted.GetString("status"))
	}
	// 5 x 121.40 = 607.00 billed.
	requirePOLineOpen(t, pb.app, item.Id, 5, 60700, 0, 0)
	requirePOStatus(t, pb.app, order.Id, "closed", "received")
	requirePOTotals(t, pb.app, order.Id, 24280, 0)
	requireOnPO(t, pb.app, pb.accessPoint, 0)
}

// Spec §3.8: the void of a posted bill computes the numbers again, and an
// order closed as received opens again when a line is open again.
func TestBillFromOrder_AVoidReopensAReceivedOrder(t *testing.T) {
	pb := newPOBillEnv(t)
	order := mkPO(t, pb.app, pb.officeSupply, nil)
	item := mkPOLine(t, pb.app, order, 0, productLine(pb.accessPoint, 2, 12140))
	account := mkPOLine(t, pb.app, order, 1, accountLine(pb.software, 30000))
	bill := pb.postedOrderBill(t, order, []*core.Record{item, account}, []float64{2, 30000})
	requirePOStatus(t, pb.app, order.Id, "closed", "received")

	if err := voidBillAs(pb.app, bill.Id, pb.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the bill: %v", err)
	}
	requireOpenOrder(t, pb.app, order.Id)
	requirePOLineOpen(t, pb.app, item.Id, 0, 0, 2, 24280)
	requirePOLineOpen(t, pb.app, account.Id, 0, 0, 0, 30000)
	requirePOTotals(t, pb.app, order.Id, 54280, 54280)
	requireOnPO(t, pb.app, pb.accessPoint, 2)
}

// Spec §3.8: the void of a bill of an order closed by hand changes the
// numbers and not the status. A closed order keeps its lines' open values as
// history; its header's open amount and the quantity on PO stay 0.
func TestBillFromOrder_AVoidOfAManualOrderChangesTheNumbersNotTheStatus(t *testing.T) {
	pb := newPOBillEnv(t)
	order := mkPO(t, pb.app, pb.officeSupply, nil)
	item := mkPOLine(t, pb.app, order, 0, productLine(pb.accessPoint, 10, 12140))
	bill := pb.postedOrderBill(t, order, []*core.Record{item}, []float64{4})
	requirePOLineOpen(t, pb.app, item.Id, 4, 48560, 6, 72840)

	code, body := pb.closePO(t, pb.users.admin, order.Id)
	requireCode(t, "an admin's Close", code, body, http.StatusOK)
	requirePOStatus(t, pb.app, order.Id, "closed", "manual")

	if err := voidBillAs(pb.app, bill.Id, pb.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the bill: %v", err)
	}
	requirePOStatus(t, pb.app, order.Id, "closed", "manual")
	requirePOLineOpen(t, pb.app, item.Id, 0, 0, 10, 121400)
	requirePOTotals(t, pb.app, order.Id, 121400, 0)
	requireOnPO(t, pb.app, pb.accessPoint, 0)
}

// Spec §3.8: the delete of the draft bill frees its links: the order that
// refused its delete while the draft named it is deleted afterwards.
func TestBillFromOrder_DeletingTheDraftFreesItsLinks(t *testing.T) {
	pb := newPOBillEnv(t)
	order, item, account := pb.tenAndThree(t)
	bill := pb.orderBill(t, order, nil)
	pb.linkedLine(t, bill, 0, item, 3, 0)
	pb.linkedLine(t, bill, 1, account, 0, 5000)

	err := pb.app.Delete(reload(t, pb.app, "books_purchase_orders", order.Id))
	requireRefusalText(t, err, wantPOHasBills("1001"))

	if err := pb.app.Delete(reload(t, pb.app, "books_bills", bill.Id)); err != nil {
		t.Fatalf("delete the draft bill: %v", err)
	}
	requirePOLineOpen(t, pb.app, item.Id, 0, 0, 10, 121400)
	requirePOTotals(t, pb.app, order.Id, 151400, 151400)
	if err := pb.app.Delete(reload(t, pb.app, "books_purchase_orders", order.Id)); err != nil {
		t.Fatalf("delete the order after its draft bill was deleted: %v", err)
	}
	requirePOCount(t, pb.app, 0)
	requireOnPO(t, pb.app, pb.accessPoint, 0)
}

// Spec §3.8: a correction carries the links; when it posts, the server moves
// them to it and the numbers follow the correction's lines. A correction to
// less opens the order that closed as received.
func TestBillFromOrder_ACorrectionMovesTheLinksAndTheNumbersFollowIt(t *testing.T) {
	pb := newPOBillEnv(t)
	order, item, account := pb.tenAndThree(t)
	original := pb.postedOrderBill(t, order, []*core.Record{item, account}, []float64{10, 30000})
	requirePOStatus(t, pb.app, order.Id, "closed", "received")

	draft := pb.orderBill(t, order, map[string]any{"replaces": original.Id, "memo": "Six arrived, not ten"})
	itemLine := pb.linkedLine(t, draft, 0, item, 6, 0)
	accountLineRow := pb.linkedLine(t, draft, 1, account, 0, 30000)
	correction := mustPostBill(t, pb.app, draft.Id, pb.users.bookkeeper.Id)

	if got := reload(t, pb.app, "books_bills", original.Id).GetString("replaced_by"); got != correction.Id {
		t.Fatalf("original replaced_by = %q, want the correction", got)
	}
	if got := correction.GetString("purchase_order"); got != order.Id {
		t.Errorf("correction purchase_order = %q after its post, want the order", got)
	}
	for _, l := range []struct{ row, poLine *core.Record }{{itemLine, item}, {accountLineRow, account}} {
		if got := reload(t, pb.app, "books_bill_lines", l.row.Id).GetString("po_line"); got != l.poLine.Id {
			t.Errorf("correction line po_line = %q after its post, want the order line %q", got, l.poLine.Id)
		}
	}
	// 6 of 10 received: 4 open, 4 x 121.40 = 485.60; the account line stays billed.
	requireOpenOrder(t, pb.app, order.Id)
	requirePOLineOpen(t, pb.app, item.Id, 6, 72840, 4, 48560)
	requirePOLineOpen(t, pb.app, account.Id, 0, 30000, 0, 0)
	requirePOTotals(t, pb.app, order.Id, 151400, 48560)
	requireOnPO(t, pb.app, pb.accessPoint, 4)
}

// Spec §3.8: a correction saved with no order (so its lines name no order
// line) bills the original's order once it posts. The original is void and
// the correction's lines took nothing of the order, so the order opens again
// in full.
func TestBillFromOrder_ACorrectionWithNoOrderTakesTheOriginalsOrder(t *testing.T) {
	pb := newPOBillEnv(t)
	order, item, account := pb.tenAndThree(t)
	original := pb.postedOrderBill(t, order, []*core.Record{item, account}, []float64{10, 30000})
	requirePOStatus(t, pb.app, order.Id, "closed", "received")

	draft := mkBill(t, pb.app, pb.officeSupply, map[string]any{"replaces": original.Id, "memo": "Rebilled by hand"})
	mkBillLine(t, pb.app, draft, 0, productLine(pb.accessPoint, 6, 12140))
	mkBillLine(t, pb.app, draft, 1, accountLine(pb.software, 30000))
	if got := reload(t, pb.app, "books_bills", draft.Id).GetString("purchase_order"); got != "" {
		t.Fatalf("draft correction purchase_order = %q, want none before its post", got)
	}
	correction := mustPostBill(t, pb.app, draft.Id, pb.users.bookkeeper.Id)

	if got := reload(t, pb.app, "books_bills", correction.Id).GetString("purchase_order"); got != order.Id {
		t.Errorf("correction purchase_order = %q after its post, want the original's order %q", got, order.Id)
	}
	requireOpenOrder(t, pb.app, order.Id)
	requirePOLineOpen(t, pb.app, item.Id, 0, 0, 10, 121400)
	requirePOLineOpen(t, pb.app, account.Id, 0, 0, 0, 30000)
	requirePOTotals(t, pb.app, order.Id, 151400, 151400)
	requireOnPO(t, pb.app, pb.accessPoint, 10)
}

// Spec §3.8: a correction that names another order than the bill it replaces
// is refused at its first save with the exact text, and no bill is stored.
func TestBillFromOrder_ACorrectionThatNamesAnotherOrderIsRefused(t *testing.T) {
	pb := newPOBillEnv(t)
	order, item, account := pb.tenAndThree(t)
	other := mkPO(t, pb.app, pb.officeSupply, nil)
	mkPOLine(t, pb.app, other, 0, productLine(pb.patchCable, 12, 310))
	original := pb.postedOrderBill(t, order, []*core.Record{item, account}, []float64{4, 12000})

	before, _ := pb.app.CountRecords("books_bills")
	_, err := newBill(pb.app, pb.officeSupply, map[string]any{"replaces": original.Id, "purchase_order": other.Id})
	requireRefusalText(t, err, wantBillKeepsOrder)
	requireBillCount(t, pb.app, before)
	if got := reload(t, pb.app, "books_bills", original.Id).GetString("replaced_by"); got != "" {
		t.Errorf("original replaced_by = %q after the refusal, want none", got)
	}
}

// Spec §3.8: an Inventory product's stock moves by a bill from an order as by
// every bill, and the order counts what it received.
func TestBillFromOrder_AnInventoryProductsStockMovesByTheBill(t *testing.T) {
	pb := newPOBillEnv(t)
	// The inventory asset and cost of goods sold accounts the Inventory item posts to.
	stockEnvOn(t, pb.ledgerEnv)
	setCostingMethod(t, pb.app, costingFIFO)
	printer, err := newProduct(pb.app, map[string]any{
		"type": "inventory", "name": "Thermal label printer", "income_account": pb.revenue.Id,
		"purchases": true, "cost": 500,
	})
	if err != nil {
		t.Fatalf("save the Inventory item: %v", err)
	}
	order := mkPO(t, pb.app, pb.officeSupply, nil)
	line := mkPOLine(t, pb.app, order, 0, productLine(printer, 5, 500))
	requireOnPO(t, pb.app, printer, 5)

	bill := pb.postedOrderBill(t, order, []*core.Record{line}, []float64{5})
	requireOnHand(t, pb.app, printer, 5, 2500)
	moves, err := documentStockMoves(pb.app, "books_bills", bill.Id)
	if err != nil || len(moves) != 1 {
		t.Fatalf("%d stock moves of the bill (err %v), want 1", len(moves), err)
	}
	requirePOLineOpen(t, pb.app, line.Id, 5, 2500, 0, 0)
	requirePOStatus(t, pb.app, order.Id, "closed", "received")
	requireOnPO(t, pb.app, printer, 0)
}

// The order's writes run inside the posting transaction: when the quantity on
// PO cannot be written, the post fails and rolls back every write of the
// order's refresh with the bill's own. A trigger makes the product's
// quantity_on_po write fail, whether the refresh saves the product or updates
// it by SQL.
func TestBillFromOrder_APostingFailureRollsEveryOrderWriteBack(t *testing.T) {
	pb := newPOBillEnv(t)
	order, item, account := pb.tenAndThree(t)
	bill := pb.orderBill(t, order, nil)
	pb.linkedLine(t, bill, 0, item, 4, 0)
	pb.linkedLine(t, bill, 1, account, 0, 12000)
	if _, err := pb.app.DB().NewQuery(`CREATE TRIGGER fail_on_po BEFORE UPDATE OF quantity_on_po ON books_products
		BEGIN SELECT RAISE(ABORT, 'on PO write fails'); END`).Execute(); err != nil {
		t.Fatalf("create the failing trigger: %v", err)
	}

	if err := postBillAs(pb.app, bill.Id, pb.users.bookkeeper.Id); err == nil {
		t.Fatal("the bill posted although the order's refresh failed")
	}
	requireBillNotPosted(t, pb.app, bill.Id, 1001)
	requirePOLineOpen(t, pb.app, item.Id, 0, 0, 10, 121400)
	requirePOLineOpen(t, pb.app, account.Id, 0, 0, 0, 30000)
	requirePOTotals(t, pb.app, order.Id, 151400, 151400)
	requirePOStatus(t, pb.app, order.Id, "open", "")
	requireOnPO(t, pb.app, pb.accessPoint, 10)
}

// Spec §3.8: the server's refusals of a bill from an order, each with its
// exact text, and each leaving what was stored. Orders: 1001 (Office Supply
// World, a product and an account line), 1002 (Office Supply World), 1003
// (Summit IT Services) and 1004 (Office Supply World, closed by hand).
func TestBillFromOrder_Refusals(t *testing.T) {
	pb := newPOBillEnv(t)
	order, item, account := pb.tenAndThree(t)
	other := mkPO(t, pb.app, pb.officeSupply, nil)
	otherItem := mkPOLine(t, pb.app, other, 0, productLine(pb.patchCable, 12, 310))
	summits := mkPO(t, pb.app, pb.summit, nil)
	summitItem := mkPOLine(t, pb.app, summits, 0, productLine(pb.accessPoint, 3, 12140))
	closed := mkPO(t, pb.app, pb.officeSupply, nil)
	mkPOLine(t, pb.app, closed, 0, accountLine(pb.designTools, 5000))
	code, body := pb.closePO(t, pb.users.admin, closed.Id)
	requireCode(t, "an admin's Close", code, body, http.StatusOK)
	for o, number := range map[*core.Record]string{order: "1001", other: "1002", summits: "1003", closed: "1004"} {
		if got := reload(t, pb.app, "books_purchase_orders", o.Id).GetString("number"); got != number {
			t.Fatalf("order number = %q, want %s", got, number)
		}
	}

	t.Run("the first save of a bill from an order closed by hand", func(t *testing.T) {
		before, _ := pb.app.CountRecords("books_bills")
		_, err := newBill(pb.app, pb.officeSupply, map[string]any{"purchase_order": closed.Id})
		requireRefusalText(t, err, wantBillOrderClosed("1004"))
		requireBillCount(t, pb.app, before)
	})

	t.Run("a bill of another vendor's order", func(t *testing.T) {
		before, _ := pb.app.CountRecords("books_bills")
		_, err := newBill(pb.app, pb.officeSupply, map[string]any{"purchase_order": summits.Id})
		requireRefusalText(t, err, wantBillOrderVendor)
		requireBillCount(t, pb.app, before)
	})

	t.Run("a po_line of another order", func(t *testing.T) {
		bill := pb.orderBill(t, order, nil)
		_, err := newBillLine(pb.app, bill, 0, linkedLineFields(otherItem, 2, 0))
		requireRefusalText(t, err, fmt.Sprintf(wantBillLineOtherPO, 1))
		requireBillLineCount(t, pb.app, bill, 0)
	})

	t.Run("a po_line of another vendor's order", func(t *testing.T) {
		bill := pb.orderBill(t, order, nil)
		_, err := newBillLine(pb.app, bill, 0, linkedLineFields(summitItem, 2, 0))
		requireRefusalText(t, err, fmt.Sprintf(wantBillLineOtherPO, 1))
		requireBillLineCount(t, pb.app, bill, 0)
	})

	t.Run("a po_line of the other table", func(t *testing.T) {
		bill := pb.orderBill(t, order, nil)
		_, err := newBillLine(pb.app, bill, 0, billLineWith(accountLine(pb.software, 12000), map[string]any{"po_line": item.Id}))
		requireRefusalText(t, err, fmt.Sprintf(wantBillLineOtherTab, 1))
		requireBillLineCount(t, pb.app, bill, 0)
	})

	t.Run("a changed product", func(t *testing.T) {
		bill := pb.orderBill(t, order, nil)
		// Saved with another product than the order line's.
		_, err := newBillLine(pb.app, bill, 0, billLineWith(linkedLineFields(item, 4, 0), map[string]any{"product": pb.patchCable.Id}))
		requireRefusalText(t, err, wantBillLineKeepsProduct(1, "1001"))
		requireBillLineCount(t, pb.app, bill, 0)

		line := pb.linkedLine(t, bill, 0, item, 4, 0)
		err = setFields(t, pb.app, "books_bill_lines", line.Id, map[string]any{"product": pb.patchCable.Id})
		requireRefusalText(t, err, wantBillLineKeepsProduct(1, "1001"))
		if got := reload(t, pb.app, "books_bill_lines", line.Id).GetString("product"); got != pb.accessPoint.Id {
			t.Errorf("product = %q after the refusal, want the access point", got)
		}
	})

	t.Run("a changed account", func(t *testing.T) {
		bill := pb.orderBill(t, order, nil)
		_, err := newBillLine(pb.app, bill, 0, billLineWith(linkedLineFields(account, 0, 12000), map[string]any{"account": pb.designTools.Id}))
		requireRefusalText(t, err, wantBillLineKeepsAccount(1, "1001"))
		requireBillLineCount(t, pb.app, bill, 0)

		line := pb.linkedLine(t, bill, 0, account, 0, 12000)
		err = setFields(t, pb.app, "books_bill_lines", line.Id, map[string]any{"account": pb.designTools.Id})
		requireRefusalText(t, err, wantBillLineKeepsAccount(1, "1001"))
		if got := reload(t, pb.app, "books_bill_lines", line.Id).GetString("account"); got != pb.software.Id {
			t.Errorf("account = %q after the refusal, want 6200 Software Subscriptions", got)
		}
	})

	t.Run("a changed vendor", func(t *testing.T) {
		bill := pb.orderBill(t, order, nil)
		err := setFields(t, pb.app, "books_bills", bill.Id, map[string]any{"vendor": pb.summit.Id})
		requireRefusalText(t, err, wantBillOrderVendor)
		if got := reload(t, pb.app, "books_bills", bill.Id).GetString("vendor"); got != pb.officeSupply.Id {
			t.Errorf("vendor = %q after the refusal, want Office Supply World", got)
		}
	})

	t.Run("a changed purchase_order", func(t *testing.T) {
		bill := pb.orderBill(t, order, nil)
		err := setFields(t, pb.app, "books_bills", bill.Id, map[string]any{"purchase_order": other.Id})
		requireRefusalText(t, err, wantBillKeepsOrder)
		if got := reload(t, pb.app, "books_bills", bill.Id).GetString("purchase_order"); got != order.Id {
			t.Errorf("purchase_order = %q after the refusal, want order 1001", got)
		}
	})

	t.Run("a cleared purchase_order", func(t *testing.T) {
		bill := pb.orderBill(t, order, nil)
		err := setFields(t, pb.app, "books_bills", bill.Id, map[string]any{"purchase_order": ""})
		requireRefusalText(t, err, wantBillKeepsOrder)
		if got := reload(t, pb.app, "books_bills", bill.Id).GetString("purchase_order"); got != order.Id {
			t.Errorf("purchase_order = %q after the refusal, want order 1001", got)
		}
	})
}
