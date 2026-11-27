package books

import (
	"database/sql"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// What the bills of a purchase order received and billed (purchase order spec
// §3.8, §3.11). refreshPurchaseOrder is the one writer of an order line's
// received, billed, open quantity and open amount, of the order's open amount
// and of its status as its bills change it, and refreshOnPO of each product's
// quantity_on_po. Both take the transaction of the write that moves them: the
// order's own writes (its lines, its Close and Reopen, its delete) and, in
// checkpoint 2, a bill's post, void, draft delete and correction.
//
// received and billed count the lines of posted bills that no correction
// replaced: a draft bill changes nothing until it posts, and a void bill
// nothing at all. The open values are those of lib/purchase-order-status.ts,
// whose cases server/testdata/purchase_order_open_cases.json holds for both
// sides:
//   - open_quantity = max(quantity − received, 0) on a product line, rounded
//     to hundredths (0 on an account line);
//   - open_amount = round(open_quantity × rate) on a product line and
//     max(amount − billed, 0) on an account line;
//   - a product line is open while its open quantity is above 0, an account
//     line while its open amount is;
//   - the order's open_amount is the sum of its lines' while it is open and 0
//     while it is closed; the lines of a closed order keep their open values.
//
// An open order with lines of which none is open closes as received (closed_at
// set, closed_by empty); an order closed as received opens again when a line
// is open again. An order closed by hand keeps its status.

// msgOnPOFixed refuses a write that sets a product's quantity on purchase
// orders; only refreshOnPO writes it.
const msgOnPOFixed = "Books sets the quantity on purchase orders itself."

// msgPORefreshOnly refuses a change beyond the open values while Books
// refreshes an order; a Go-only invariant of refreshPurchaseOrder's writes.
const msgPORefreshOnly = "Only the open values change while Books refreshes its purchase order."

// markOnPOWrite marks a product whose quantity_on_po refreshOnPO writes, so the
// product guard lets the write through (txmarks.go).
const markOnPOWrite = "books.on_po.write"

// The fields refreshPurchaseOrder writes on a line and on the order.
var (
	orderLineRefreshFields = map[string]bool{"received": true, "billed": true, "open_quantity": true, "open_amount": true}
	orderRefreshFields     = map[string]bool{"status": true, "closed_reason": true, "closed_at": true, "closed_by": true, "open_amount": true}
)

// refreshingMark is the mark of an order whose rows refreshPurchaseOrder
// writes: docMark(kind, "refreshing") of the order's kind, spelled from its
// doc type so the refresh, which purchaseOrderKind names, does not name the
// kind.
func refreshingMark(docType string) string {
	return docType + ".refreshing"
}

// isRefreshing reports whether refreshPurchaseOrder is writing docID's rows in
// tx. Only an order is ever marked.
func isRefreshing(tx core.App, kind salesDocKind, docID string) bool {
	return hasTxMark(tx, refreshingMark(kind.DocType), docID)
}

// checkRefreshedLine lets refreshPurchaseOrder's write of a line through: it
// changes only the line's open values.
func checkRefreshedLine(stored, r *core.Record) error {
	if !onlyFieldsChanged(stored, r, orderLineRefreshFields) {
		return refuse("%s", msgPORefreshOnly)
	}
	return nil
}

// checkRefreshedOrder lets refreshPurchaseOrder's write of the order through:
// it changes only the open amount and the status with its close stamp.
func checkRefreshedOrder(stored, r *core.Record) error {
	if !onlyFieldsChanged(stored, r, orderRefreshFields) {
		return refuse("%s", msgPORefreshOnly)
	}
	return nil
}

// onlyFieldsChanged reports whether r differs from stored in the allowed
// fields and the autodate fields alone.
func onlyFieldsChanged(stored, r *core.Record, allowed map[string]bool) bool {
	for _, field := range r.Collection().Fields {
		name := field.GetName()
		if allowed[name] || field.Type() == core.FieldTypeAutodate {
			continue
		}
		if !reflect.DeepEqual(stored.Get(name), r.Get(name)) {
			return false
		}
	}
	return true
}

// orderLineTaken is what posted, not replaced bills took of one order line:
// the quantity received, in hundredths, and the amount billed, in cents.
type orderLineTaken struct {
	receivedH, billed int64
}

// orderLineBills sums, per order line of the order, the bill lines that name
// it on posted bills that no correction replaced.
func orderLineBills(tx core.App, orderID string) (map[string]orderLineTaken, error) {
	var rows []struct {
		Line     string  `db:"line"`
		Quantity float64 `db:"quantity"`
		Amount   int64   `db:"amount"`
	}
	err := tx.DB().NewQuery(`SELECT bl.po_line AS line, bl.quantity AS quantity, bl.amount AS amount
		FROM books_bill_lines bl
		JOIN books_bills b ON b.id = bl.bill
		JOIN books_purchase_order_lines pl ON pl.id = bl.po_line
		WHERE pl.purchase_order = {:order} AND b.status = {:posted} AND COALESCE(b.replaced_by, '') = ''`).
		Bind(dbx.Params{"order": orderID, "posted": statusPosted}).All(&rows)
	if err != nil {
		return nil, fmt.Errorf("books: read the bill lines of the purchase order: %w", err)
	}
	taken := map[string]orderLineTaken{}
	for _, row := range rows {
		t := taken[row.Line]
		t.receivedH += qtyHundredths(row.Quantity)
		t.billed += row.Amount
		taken[row.Line] = t
	}
	return taken, nil
}

// orderLineOpen is one line's open values: the open quantity in hundredths
// and the open amount in cents.
type orderLineOpen struct {
	quantityH, amount int64
}

// open reports whether the line is open: a product line while a quantity is,
// an account line while an amount is.
func (o orderLineOpen) open(kind string) bool {
	if kind == lineKindItem {
		return o.quantityH > 0
	}
	return o.amount > 0
}

// orderLineOpenValues is the open quantity and amount of a line of kind with
// quantity, rate and amount, of which t was received and billed.
func orderLineOpenValues(kind string, quantity float64, rate, amount int64, t orderLineTaken) orderLineOpen {
	if kind != lineKindItem {
		return orderLineOpen{quantityH: 0, amount: max(amount-t.billed, 0)}
	}
	openH := max(qtyHundredths(quantity)-t.receivedH, 0)
	// A stored line's quantity and rate keep Qty x Rate within an int64 (the
	// line guard refuses a larger amount), so the open part fits too.
	open, _ := lineAmount(qtyFromHundredths(openH), rate)
	return orderLineOpen{quantityH: openH, amount: open}
}

// refreshPurchaseOrder writes the order's lines' received, billed and open
// values from its bills, then the order's status and open amount, then the
// quantity on purchase orders of the products its lines hold. It writes a row
// only when a value changes, through tx.Save under the refreshing mark, so the
// guards let the write through and realtime sees it. It runs in tx's
// transaction (a nested RunInTransaction joins it), so a failure rolls back
// the write that called it.
func refreshPurchaseOrder(tx core.App, orderID string) error {
	return tx.RunInTransaction(func(tx core.App) error {
		order, err := tx.FindRecordById(purchaseOrdersCollection, orderID)
		if err != nil {
			return fmt.Errorf("books: read the purchase order to refresh: %w", err)
		}
		lines, err := docLineRecords(tx, purchaseOrderLinesCollection, "purchase_order", orderID)
		if err != nil {
			return err
		}
		taken, err := orderLineBills(tx, orderID)
		if err != nil {
			return err
		}
		defer setTxMark(tx, refreshingMark(docTypePurchaseOrder), orderID)()

		anyOpen := false
		var openSum int64
		var products []string
		for _, line := range lines {
			kind := line.GetString("kind")
			t := taken[line.Id]
			values := orderLineOpenValues(kind, line.GetFloat("quantity"), int64(line.GetInt("rate")), int64(line.GetInt("amount")), t)
			if values.open(kind) {
				anyOpen = true
			}
			openSum += values.amount
			if kind == lineKindItem && line.GetString("product") != "" {
				products = append(products, line.GetString("product"))
			}
			if err := saveLineOpenValues(tx, line, t, values); err != nil {
				return err
			}
		}
		if err := saveOrderOpenValues(tx, order, len(lines) > 0, anyOpen, openSum, time.Now()); err != nil {
			return err
		}
		return refreshOnPO(tx, products)
	})
}

// saveLineOpenValues writes the line's received, billed and open values when
// one of them changed.
func saveLineOpenValues(tx core.App, line *core.Record, t orderLineTaken, values orderLineOpen) error {
	if qtyHundredths(line.GetFloat("received")) == t.receivedH && int64(line.GetInt("billed")) == t.billed &&
		qtyHundredths(line.GetFloat("open_quantity")) == values.quantityH && int64(line.GetInt("open_amount")) == values.amount {
		return nil
	}
	line.Set("received", qtyFromHundredths(t.receivedH))
	line.Set("billed", t.billed)
	line.Set("open_quantity", qtyFromHundredths(values.quantityH))
	line.Set("open_amount", values.amount)
	if err := tx.Save(line); err != nil {
		return fmt.Errorf("books: write the open values of a purchase order line: %w", err)
	}
	return nil
}

// saveOrderOpenValues writes the order's status, close stamp and open amount
// when one of them changed: an open order with lines of which none is open
// closes as received; an order closed as received opens again when a line is
// open; an order closed by hand keeps its status. An open order's open amount
// is openSum, a closed order's 0.
func saveOrderOpenValues(tx core.App, order *core.Record, hasLines, anyOpen bool, openSum int64, now time.Time) error {
	status, reason := order.GetString("status"), order.GetString("closed_reason")
	changed := false
	switch {
	case status == statusOpen && hasLines && !anyOpen:
		order.Set("status", statusClosed)
		order.Set("closed_reason", closedReceived)
		order.Set("closed_at", now)
		order.Set("closed_by", "")
		changed = true
	case status == statusClosed && reason == closedReceived && anyOpen:
		order.Set("status", statusOpen)
		order.Set("closed_reason", "")
		order.Set("closed_at", "")
		order.Set("closed_by", "")
		changed = true
	}
	open := openSum
	if order.GetString("status") != statusOpen {
		open = 0
	}
	if int64(order.GetInt("open_amount")) != open {
		order.Set("open_amount", open)
		changed = true
	}
	if !changed {
		return nil
	}
	if err := tx.Save(order); err != nil {
		return fmt.Errorf("books: write the open values of the purchase order: %w", err)
	}
	return nil
}

// refreshOnPO writes each product's quantity_on_po: the sum of the open
// quantities of its product lines on open orders, rounded to hundredths. It
// writes a product only when the value changes, through tx.Save under
// markOnPOWrite. A product that does not exist has nothing to write.
func refreshOnPO(tx core.App, productIDs []string) error {
	ids := slices.Clone(productIDs)
	slices.Sort(ids)
	for _, id := range slices.Compact(ids) {
		var row struct {
			Quantity float64 `db:"quantity"`
		}
		err := tx.DB().NewQuery(`SELECT COALESCE(SUM(l.open_quantity), 0) AS quantity
			FROM books_purchase_order_lines l
			JOIN books_purchase_orders o ON o.id = l.purchase_order
			WHERE l.product = {:product} AND l.kind = {:item} AND o.status = {:open}`).
			Bind(dbx.Params{"product": id, "item": lineKindItem, "open": statusOpen}).One(&row)
		if err != nil {
			return fmt.Errorf("books: sum the quantity on purchase orders: %w", err)
		}
		product, err := tx.FindRecordById("books_products", id)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return fmt.Errorf("books: read the product to refresh its quantity on purchase orders: %w", err)
		}
		onPO := qtyHundredths(row.Quantity)
		if qtyHundredths(product.GetFloat("quantity_on_po")) == onPO {
			continue
		}
		product.Set("quantity_on_po", qtyFromHundredths(onPO))
		if err := saveOnPO(tx, product); err != nil {
			return err
		}
	}
	return nil
}

func saveOnPO(tx core.App, product *core.Record) error {
	defer setTxMark(tx, markOnPOWrite, product.Id)()
	if err := tx.Save(product); err != nil {
		return fmt.Errorf("books: write the quantity on purchase orders of %s: %w", product.GetString("name"), err)
	}
	return nil
}

// isOnPOWrite reports whether r is refreshOnPO's write of a stored product,
// which the product guard lets through when checkOnPOWrite passes.
func isOnPOWrite(tx core.App, stored, r *core.Record) bool {
	return stored != nil && hasTxMark(tx, markOnPOWrite, r.Id)
}

// onPORefreshFields is the one product field refreshOnPO writes.
var onPORefreshFields = map[string]bool{"quantity_on_po": true}

// checkOnPOWrite refuses a marked write of a product that changes more than
// its quantity on purchase orders.
func checkOnPOWrite(stored, r *core.Record) error {
	if !onlyFieldsChanged(stored, r, onPORefreshFields) {
		return refuse("%s", msgPORefreshOnly)
	}
	return nil
}

// checkOnPOKept refuses a write that sets quantity_on_po, as
// checkStockTotalsKept does for the stock totals: a write that leaves it as it
// loaded it takes the stored value, since a refresh may have moved it between
// the load and this guard.
func checkOnPOKept(stored, r *core.Record) error {
	same := func(to *core.Record) bool {
		return to != nil && qtyHundredths(r.GetFloat("quantity_on_po")) == qtyHundredths(to.GetFloat("quantity_on_po"))
	}
	if !same(r.Original()) && !same(stored) {
		return refuse(msgOnPOFixed)
	}
	if stored != nil {
		r.Set("quantity_on_po", stored.GetFloat("quantity_on_po"))
	}
	return nil
}
