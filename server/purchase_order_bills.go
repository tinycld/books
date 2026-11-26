package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// A bill made from a purchase order (purchase order spec §3.8): the bill
// names the order (purchase_order) and each of its lines that the order gave
// names its order line (po_line). The bill's guards keep the links true: the
// bill bills the order's vendor and keeps its order, and a linked line names
// a line of that order in its own table and keeps the order line's product or
// account. Nothing changes on the order while the bill is a draft; the bill's
// post, void, draft delete and correction compute the order's received,
// billed and open values again in their own transaction (refreshOrderOfBill).

// Refusal texts of the bill's order links. The client shows them as the server
// sends them; no client table holds them yet (the bill screen's order texts
// come in checkpoint 4). Today the words are pinned by the want* consts of
// purchase_order_bills_test.go. PocketBase adds a final period to a text
// without one; these have theirs.
const (
	msgBillOrderVendor = "A bill from a purchase order bills the order's vendor."
	msgBillKeepsOrder  = "A bill keeps the purchase order it was made from."
	// %d is the line's number among the lines of its table.
	msgBillLineOtherPO  = "Line %d names a line of another purchase order."
	msgBillLineOtherTab = "Line %d names a purchase order line of the other table."
	// %s is the order's number.
	msgBillOrderClosed = "Purchase order %s is closed. Reopen it to copy it to a bill."
	// %d is the line's number among the lines of its table, %s the order's number.
	msgBillLineKeepsProduct = "Product line %d: a line from purchase order %s keeps its product. Remove it and add a new line."
	msgBillLineKeepsAccount = "Account line %d: a line from purchase order %s keeps its account. Remove it and add a new line."
)

// checkBillPurchaseOrder is the bill's header rule of its order link, on a
// draft write (checkBillHeader). After the first save the bill keeps the
// order it names, and one with no order gets none. At the first save, an
// order closed by hand is refused, except for the correction of a bill of
// that order; a correction names the order of the bill it replaces, or none
// (moveOrderLinksTo gives it that order when it posts). A bill with an order
// bills the order's vendor. stored is the bill before an update, nil on a
// create.
func checkBillPurchaseOrder(tx core.App, stored, r *core.Record) error {
	orderID := r.GetString("purchase_order")
	if stored != nil && stored.GetString("purchase_order") != orderID {
		return refuseField("purchase_order", "%s", msgBillKeepsOrder)
	}
	if orderID == "" {
		return nil
	}
	order, err := tx.FindRecordById(purchaseOrdersCollection, orderID)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses a bill whose order does not exist.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the bill's purchase order: %w", err)
	}
	if stored == nil {
		correction, err := correctsBillOfOrder(tx, r, orderID)
		if err != nil {
			return err
		}
		if !correction && isClosedByHand(order) {
			return refuseField("purchase_order", msgBillOrderClosed, order.GetString("number"))
		}
	}
	if r.GetString("vendor") != order.GetString("vendor") {
		return refuseField("vendor", "%s", msgBillOrderVendor)
	}
	return nil
}

// correctsBillOfOrder reports whether r is the correction of a bill of the
// order. It refuses a correction that names another order than the bill it
// replaces.
func correctsBillOfOrder(tx core.App, r *core.Record, orderID string) (bool, error) {
	replaces := r.GetString("replaces")
	if replaces == "" {
		return false, nil
	}
	original, err := tx.FindRecordById(billsCollection, replaces)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses a correction of a bill that does not exist.
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("books: read the bill the correction replaces: %w", err)
	}
	if original.GetString("purchase_order") != orderID {
		return false, refuseField("purchase_order", "%s", msgBillKeepsOrder)
	}
	return true, nil
}

// isClosedByHand reports whether an admin's Close closed the order.
func isClosedByHand(order *core.Record) bool {
	return order.GetString("status") != statusOpen && order.GetString("closed_reason") == closedManual
}

// checkBillLineOrderLink is the bill's rule of a line write that names an
// order line (po_line): the order line is a line of the bill's order and of
// the line's own table, and the bill line has the order line's product (a
// product line) or account (an account line). The product and account are
// compared with the order line's, so a line saved with another one is
// refused as an update to another one is. place names the line among the
// lines of its table. The rule reads r only: a stored line that names an
// order line is held to it on each write, so stored (nil on a create) adds
// nothing.
func checkBillLineOrderLink(tx core.App, bill, stored, r *core.Record, place linePlace) error {
	poLineID := r.GetString("po_line")
	if poLineID == "" {
		return nil
	}
	poLine, err := tx.FindRecordById(purchaseOrderLinesCollection, poLineID)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses a line that names an order line that does not exist.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the bill line's purchase order line: %w", err)
	}
	orderID := bill.GetString("purchase_order")
	if orderID == "" || poLine.GetString("purchase_order") != orderID {
		return refuseField("po_line", msgBillLineOtherPO, place.n)
	}
	kind := r.GetString("kind")
	if poLine.GetString("kind") != kind {
		return refuseField("po_line", msgBillLineOtherTab, place.n)
	}
	order, err := tx.FindRecordById(purchaseOrdersCollection, orderID)
	if err != nil {
		return fmt.Errorf("books: read the bill's purchase order: %w", err)
	}
	number := order.GetString("number")
	switch kind {
	case lineKindItem:
		if r.GetString("product") != poLine.GetString("product") {
			return refuseField("product", msgBillLineKeepsProduct, place.n, number)
		}
	case lineKindAccount:
		if r.GetString("account") != poLine.GetString("account") {
			return refuseField("account", msgBillLineKeepsAccount, place.n, number)
		}
	}
	return nil
}

// checkBillLine is the bill's CheckLine: the order link rule of the line,
// with the bill the line is on. It names the collection and the parent field
// itself: billKind holds this function, so a read of billKind here is an
// initialization cycle.
func checkBillLine(tx core.App, stored, r *core.Record, place linePlace) error {
	if r.GetString("po_line") == "" {
		return nil
	}
	bill, err := tx.FindRecordById(billsCollection, r.GetString("bill"))
	if err != nil {
		return fmt.Errorf("books: read the line's bill: %w", err)
	}
	return checkBillLineOrderLink(tx, bill, stored, r, place)
}

// refreshOrderOfBill computes the values of the bill's order again from its
// bills (refreshPurchaseOrder), in tx's transaction. A bill with no order,
// and one whose order is gone, change nothing.
func refreshOrderOfBill(tx core.App, bill *core.Record) error {
	orderID := bill.GetString("purchase_order")
	if orderID == "" {
		return nil
	}
	if _, err := tx.FindRecordById(purchaseOrdersCollection, orderID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("books: read the bill's purchase order: %w", err)
	}
	return refreshPurchaseOrder(tx, orderID)
}

// moveOrderLinksTo is the order step of a bill correction's post (replaceBill):
// the correction bills the original's order. It moves only the header link: a
// correction that names no order takes the original's. It moves no line link.
// The client carries the line links (po_line) in its copy of the original's
// lines, and this step does not read or change them. So a correction that
// holds no linked lines gets the order, and its post takes nothing from the
// order: the order's values are those of its other bills. The original is void and replaced now, so
// the order's values are computed again without it; the correction's own post
// computes them again with its lines (bindBillOrderRefresh).
func moveOrderLinksTo(tx core.App, original, correction *core.Record) error {
	orderID := original.GetString("purchase_order")
	switch correction.GetString("purchase_order") {
	case orderID:
	case "":
		correction.Set("purchase_order", orderID)
	default:
		// A guard only: the create refusal of a correction that names another
		// order (correctsBillOfOrder) and the update refusal of a changed order
		// (checkBillPurchaseOrder) come first, so no saved correction gets here.
		// It stays so this step never moves a bill to another order.
		return refuseField("purchase_order", "%s", msgBillKeepsOrder)
	}
	return refreshOrderOfBill(tx, original)
}

// bindBillOrderRefresh computes the bill's order again after a write that
// changes what the order's bills took: a status change of the bill (its post
// and its void, which only the stored row shows done) and the delete of a
// draft (after its lines are gone). It is bound after the bill's guards, so it
// runs inside their transaction (e.App is the transaction there) and after the
// write: a failure rolls the bill's write back with the order's.
func bindBillOrderRefresh(app core.App) {
	app.OnRecordUpdate(billsCollection).BindFunc(func(e *core.RecordEvent) error {
		from := e.Record.Original().GetString("status")
		if err := e.Next(); err != nil {
			return err
		}
		if e.Record.GetString("status") == from {
			return nil
		}
		return refreshOrderOfBill(e.App, e.Record)
	})
	app.OnRecordDelete(billsCollection).BindFunc(func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		return refreshOrderOfBill(e.App, e.Record)
	})
}
