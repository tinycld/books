package books

import (
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The purchase order (purchase order spec §3.5, §3.6, §4): what the business
// orders from a vendor. It is a kind of the shared document layer with the
// order lifecycle: it is open or closed, it has no draft and it never posts.
// It takes its number at the first save, its lines are the bill's two tables,
// and only a Books admin closes or reopens it. refreshPurchaseOrder
// (purchase_order_receipts.go) writes what its bills received and billed.

// The purchase order's forms host (tinycld/books/forms/hosts.ts), its
// collections and the doc type of its number sequence. A purchase order never
// posts, so no journal entry has the doc type (documentDocTypes).
const (
	purchaseOrderHostKey         = "books:purchase_order"
	docTypePurchaseOrder         = "purchase_order"
	purchaseOrdersCollection     = "books_purchase_orders"
	purchaseOrderLinesCollection = "books_purchase_order_lines"
)

// The statuses of an order (the order lifecycle) and why a closed one closed:
// by an admin's Close (manual) or because its bills received every line.
const (
	statusOpen     = "open"
	closedManual   = "manual"
	closedReceived = "received"
)

// Refusal texts of the purchase order guards. This group is shown by the
// client too, with the same words (PURCHASE_ORDER_MESSAGES,
// lib/document-texts.ts). PocketBase adds the final period to a text without
// one; these have theirs. The line texts start with the line's label and its
// number among the lines of its kind ("Product line 2").
const (
	msgPOTotalNegative = "A purchase order total cannot be below zero."
	msgPOTotalTooLarge = "The purchase order total is more than Books can store."
	msgPOTooManyLines  = "A purchase order holds at most 250 lines."
	// %s is what the bills hold: a quantity, or an amount in money text.
	msgPOBelowReceived = "Product line %d: %s are received. The quantity cannot be below %s."
	msgPOBelowBilled   = "Account line %d: %s is billed. The amount cannot be below %s."
	// %s is the number of the bill whose line names the order line.
	msgPOProductLineOnBill      = "Product line %d is on bill %s and cannot be removed."
	msgPOAccountLineOnBill      = "Account line %d is on bill %s and cannot be removed."
	msgPOProductLineOnDraftBill = "Product line %d is on a draft bill and cannot be removed."
	msgPOAccountLineOnDraftBill = "Account line %d is on a draft bill and cannot be removed."
	msgPOProductKept            = "Product line %d: a line that a bill names keeps its product."
	msgPOAccountKept            = "Account line %d: a line that a bill names keeps its account."
	msgPOVendorKept             = "Bills are made from this purchase order, so its vendor cannot change."
	// %s is the order's number.
	msgPOHasBills         = "Purchase order %s has bills. Close it instead."
	msgPOClosedNoEdit     = "A closed purchase order cannot be edited."
	msgPOClosedLines      = "The lines of a closed purchase order cannot change."
	msgPOAdminOnly        = "Only a Books admin closes or reopens a purchase order."
	msgPOReceivedReopen   = "A purchase order that closed because every line is received opens again from its bills."
	msgPORevisionConflict = "This purchase order changed after you opened it. Load it again, then review it before you save."
)

// A Ship to holds at most maxShipToLines lines, as SHIP_TO_MAX_LINES of
// lib/ship-to.ts, and refuses a longer one with the text of
// SHIP_TO_MESSAGES.tooManyLines there (PocketBase adds the final period).
const (
	maxShipToLines   = 5
	msgPOShipToLines = "Ship to can be at most %d lines"
)

// shipToLine ends one line of a Ship to: \r\n, \r and \n each end one, as
// the client counts them.
var shipToLine = regexp.MustCompile(`\r\n|\r|\n`)

// Go-only refusal texts of the purchase order.
const (
	msgPOCreatedOpen     = "A purchase order is created open."
	msgPOClosedNoDelete  = "A closed purchase order cannot be deleted."
	msgPOCloseOnly       = "A Close changes only the status of the purchase order."
	msgPOLineStays       = "A line stays on its purchase order."
	msgPOLineRestating   = "Only a line's amount changes while Books restates its purchase order."
	msgPOLineUnknownKind = "Line %d: a purchase order line is an account line or a product line."
)

// purchaseOrderKind is the purchase order as a purchase document of the order
// lifecycle: its party is the vendor, its lines are account lines and product
// lines, it has no sales tax, it takes its number when it is created and it
// never posts (no tax lines, no debit or credit account). Its line hooks keep
// what its bills name, and AfterLines refreshes its open values.
var purchaseOrderKind = salesDocKind{
	DocType:            docTypePurchaseOrder,
	Lifecycle:          lifecycleOrder,
	Collection:         purchaseOrdersCollection,
	LinesCollection:    purchaseOrderLinesCollection,
	TaxLinesCollection: "",
	ParentField:        "purchase_order",
	HostKey:            purchaseOrderHostKey,
	LineTables:         []string{purchaseAccountLinesKey, purchaseItemLinesKey},
	LineRowLabels:      purchaseLineRowLabels,
	Party:              partyVendor,
	PartyCollection:    "books_vendors",
	AddressField:       "mailing_address",
	CustomerRequired:   true,
	HasTax:             false,
	Msgs: salesDocMessages{
		TotalNegative:    msgPOTotalNegative,
		TotalTooLarge:    msgPOTotalTooLarge,
		TooManyLines:     msgPOTooManyLines,
		NotDraft:         msgPOClosedNoEdit,
		DeleteNotDraft:   msgPOClosedNoDelete,
		LineStays:        msgPOLineStays,
		LineNotDraft:     msgPOClosedLines,
		LineRestating:    msgPOLineRestating,
		LineUnknownKind:  msgPOLineUnknownKind,
		CustomerOnDocs:   msgVendorOnPurchaseOrders,
		RevisionConflict: msgPORevisionConflict,
		PartyInactive:    msgVendorInactive,
	},
	CheckHeader:     checkPurchaseOrderHeader,
	CheckDelete:     checkPurchaseOrderDelete,
	CheckLine:       checkPurchaseOrderLine,
	CheckLineDelete: checkPurchaseOrderLineDelete,
	AfterLines:      refreshPurchaseOrder,
}

// The fields a write of each order transition may change besides `updated`:
// a Close changes the status and the close stamp (and the open amount, 0 while
// closed); a Reopen only the status, and transitionOrder clears the stamp.
var (
	orderCloseFields  = map[string]bool{"status": true, "revision": true, "closed_reason": true, "closed_at": true, "closed_by": true, "open_amount": true}
	orderReopenFields = map[string]bool{"status": true, "closed_reason": true, "closed_at": true, "closed_by": true}
)

// bindPurchaseOrderHooks binds the order's hooks beyond the shared layer's,
// after them, so each runs inside the shared guard's transaction (e.App is the
// transaction there) and around the write it wraps:
//   - a create request stamps who created the order;
//   - an update of the header refreshes the order (a Close or Reopen moves the
//     quantity on purchase orders), except Books' own saves of it;
//   - a delete refreshes the quantity on purchase orders of the products its
//     lines held, once the cascade removed them;
//   - a line update that changes the product refreshes the product it left,
//     and a line delete the product it held: refreshPurchaseOrder reads the
//     order's lines, which no longer hold either.
func bindPurchaseOrderHooks(app core.App, kind salesDocKind) {
	app.OnRecordCreateRequest(kind.Collection).BindFunc(func(e *core.RecordRequestEvent) error {
		stampActor(e.Record, "created_by", e.Auth)
		return e.Next()
	})
	app.OnRecordUpdate(kind.Collection).BindFunc(func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		if isOwnWrite(e.App, kind.Collection, e.Record.Id) || isRefreshing(e.App, kind, e.Record.Id) {
			return nil
		}
		return refreshPurchaseOrder(e.App, e.Record.Id)
	})
	app.OnRecordDelete(kind.Collection).BindFunc(func(e *core.RecordEvent) error {
		products, err := orderLineProducts(e.App, e.Record.Id)
		if err != nil {
			return err
		}
		if err := e.Next(); err != nil {
			return err
		}
		return refreshOnPO(e.App, products)
	})
	app.OnRecordUpdate(kind.LinesCollection).BindFunc(func(e *core.RecordEvent) error {
		left := e.Record.Original().GetString("product")
		if err := e.Next(); err != nil {
			return err
		}
		if left == "" || left == e.Record.GetString("product") {
			return nil
		}
		return refreshOnPO(e.App, []string{left})
	})
	app.OnRecordDelete(kind.LinesCollection).BindFunc(func(e *core.RecordEvent) error {
		product := e.Record.GetString("product")
		if err := e.Next(); err != nil {
			return err
		}
		// The order's delete refreshes its products after the cascade.
		if product == "" || isDeleting(e.App, kind, e.Record.GetString(kind.ParentField)) {
			return nil
		}
		return refreshOnPO(e.App, []string{product})
	})
}

// checkOrderStatusRequest is the request rule of an order's status change:
// only a Books admin (or a superuser) closes or reopens an order, and a Close
// stamps the admin as who closed it. The update rule already refuses a
// writer's status; this holds the same for a rule that lets one through.
func checkOrderStatusRequest(e *core.RecordRequestEvent, to string) error {
	level, err := levelFor(e.App, e.Auth)
	if err != nil {
		return err
	}
	if !level.IsAdmin() {
		return refuse("%s", msgPOAdminOnly)
	}
	if to == statusClosed {
		stampActor(e.Record, "closed_by", e.Auth)
	}
	return nil
}

// createOrder guards an order's create. There is no draft: the create stamps
// the id and the currency, takes the next number of the purchase order
// sequence and runs the header guards. It runs inside serialized, so a refusal
// rolls the sequence back and a refused create takes no number. A new order is
// open and carries none of Books' own fields.
func createOrder(tx core.App, kind salesDocKind, r *core.Record) error {
	ensureRecordID(r)
	if r.GetString("status") != statusOpen {
		return refuse("%s", msgPOCreatedOpen)
	}
	if err := checkNewSalesDoc(kind, r); err != nil {
		return err
	}
	if err := stampCurrency(tx, r); err != nil {
		return err
	}
	sequence, number, err := allocateNumber(tx, kind.DocType)
	if err != nil {
		return err
	}
	r.Set("sequence", sequence)
	r.Set("number", number)
	startRevision(tx, kind, r)
	return checkDraftSalesDoc(tx, kind, nil, r)
}

// transitionOrder guards an order's update. refreshPurchaseOrder's own write
// changes only the open values and the status it computes. An open order is
// edited (the header guards run) or closed by hand: a Close stores closed,
// manual, the time and the open amount 0, and changes nothing else. A closed
// order changes only by its Reopen (not of an order its bills received, which
// opens again from its bills), which clears the close stamp, or by PocketBase
// unlinking a deleted user or form. Every write to an open order takes the
// transaction's one revision increase (revision.go); a Reopen changes an
// order nobody edits and adds none.
func transitionOrder(tx core.App, kind salesDocKind, stored, r *core.Record, now time.Time) error {
	if isRefreshing(tx, kind, r.Id) {
		return checkRefreshedOrder(stored, r)
	}
	from, to := stored.GetString("status"), r.GetString("status")
	switch {
	case from == statusOpen && to == statusOpen:
		if err := settleRevision(tx, stored, r, kind.Msgs.RevisionConflict); err != nil {
			return err
		}
		// Books' own save of the totals after a line write (restateSalesDoc).
		if isOwnWrite(tx, kind.Collection, stored.Id) {
			return nil
		}
		unlinks, err := onlySalesDocUnlinks(tx, stored, r)
		if err != nil || unlinks {
			return err
		}
		if err := checkSalesDocBooksFieldsKept(kind, stored, r); err != nil {
			return err
		}
		return checkDraftSalesDoc(tx, kind, stored, r)
	case from == statusOpen && to == statusClosed:
		if err := settleRevision(tx, stored, r, kind.Msgs.RevisionConflict); err != nil {
			return err
		}
		if len(changedFields(stored, r, orderCloseFields)) > 0 {
			return refuse("%s", msgPOCloseOnly)
		}
		r.Set("closed_reason", closedManual)
		r.Set("closed_at", now)
		r.Set("open_amount", 0)
		return nil
	case from == statusClosed && to == statusOpen:
		if stored.GetString("closed_reason") == closedReceived {
			return refuse("%s", msgPOReceivedReopen)
		}
		if len(changedFields(stored, r, orderReopenFields)) > 0 {
			return refuse("%s", kind.Msgs.NotDraft)
		}
		r.Set("closed_reason", "")
		r.Set("closed_at", "")
		r.Set("closed_by", "")
		return nil
	case from == statusClosed && to == statusClosed:
		unlinks, err := onlySalesDocUnlinks(tx, stored, r)
		if err != nil || unlinks {
			return err
		}
		return refuse("%s", kind.Msgs.NotDraft)
	}
	return refuse(msgSalesDocCannotGo, salesDocName(kind, stored), from, to)
}

// checkPurchaseOrderHeader is the order's own header guard on every write of
// an open order: the order date is a real day, the Ship to holds at most
// maxShipToLines lines, and an order that bills name keeps its vendor (the
// bills bill the order's vendor).
func checkPurchaseOrderHeader(tx core.App, stored, r *core.Record) error {
	if _, err := parseDay(r.GetString("date")); err != nil {
		return refuseDocumentDay("date", err)
	}
	if len(shipToLine.Split(r.GetString("ship_to"), -1)) > maxShipToLines {
		return refuseField("ship_to", msgPOShipToLines, maxShipToLines)
	}
	if stored == nil || stored.GetString("vendor") == r.GetString("vendor") {
		return nil
	}
	bills, err := orderBillCount(tx, stored.Id)
	if err != nil {
		return err
	}
	if bills > 0 {
		return refuseField("vendor", msgPOVendorKept)
	}
	return nil
}

// checkPurchaseOrderDelete refuses to delete a closed order with the closed
// text (a closed order has no Delete, so "close it instead" would not apply),
// and an open order that any bill names, draft, posted or void, with the text
// that says what to do. Refusing here also keeps PocketBase from unlinking the
// deleted order from a posted or void bill, which the bill's guard would
// refuse.
func checkPurchaseOrderDelete(tx core.App, stored *core.Record) error {
	if stored.GetString("status") != statusOpen {
		return refuse("%s", msgPOClosedNoDelete)
	}
	bills, err := orderBillCount(tx, stored.Id)
	if err != nil {
		return err
	}
	if bills > 0 {
		return refuse(msgPOHasBills, stored.GetString("number"))
	}
	return nil
}

// orderBillCount is how many bills, of any status, name the order.
func orderBillCount(tx core.App, orderID string) (int64, error) {
	n, err := tx.CountRecords(billKind.Collection, dbx.HashExp{"purchase_order": orderID})
	if err != nil {
		return 0, fmt.Errorf("books: count the bills of the purchase order: %w", err)
	}
	return n, nil
}

// checkPurchaseOrderLine is the order's own rule of a line write, place naming
// the line among the lines of its kind. An account the write chooses is
// active, and a product it chooses is purchased (the line guard refuses an
// inactive one): the texts of a bill's post, at the order's save. A line that
// a bill line names keeps its product or account, a product line's quantity
// is not below what posted bills received of it, and an account line's amount
// not below what they billed (the line's stored received and billed, which
// refreshPurchaseOrder writes). stored is the line before an update, nil on a
// create.
func checkPurchaseOrderLine(tx core.App, stored, r *core.Record, place linePlace) error {
	if err := checkOrderLineChoices(tx, stored, r, place.n); err != nil {
		return err
	}
	if stored == nil {
		return nil
	}
	kind := r.GetString("kind")
	changed := (kind == lineKindItem && stored.GetString("product") != r.GetString("product")) ||
		(kind == lineKindAccount && stored.GetString("account") != r.GetString("account")) ||
		stored.GetString("kind") != kind
	if changed {
		bill, err := billNamingLine(tx, stored.Id)
		if err != nil {
			return err
		}
		if bill.found && stored.GetString("kind") == lineKindItem {
			return refuse(msgPOProductKept, place.n)
		}
		if bill.found {
			return refuse(msgPOAccountKept, place.n)
		}
	}
	switch kind {
	case lineKindItem:
		received := stored.GetFloat("received")
		if qtyHundredths(r.GetFloat("quantity")) < qtyHundredths(received) {
			shown := formatQuantity(received)
			return refuse(msgPOBelowReceived, place.n, shown, shown)
		}
	case lineKindAccount:
		billed := int64(stored.GetInt("billed"))
		if int64(r.GetInt("amount")) < billed {
			currency, err := orderCurrency(tx, r.GetString("purchase_order"))
			if err != nil {
				return err
			}
			shown := formatMoney(billed, currency)
			return refuse(msgPOBelowBilled, place.n, shown, shown)
		}
	}
	return nil
}

// checkOrderLineChoices refuses an inactive account on an account line and a
// product that is not purchased on a product line, when the write chooses it;
// a line keeps one that changed after it was chosen. A row that does not exist
// is the schema's refusal. n is the line's number among its kind's lines.
func checkOrderLineChoices(tx core.App, stored, r *core.Record, n int) error {
	switch r.GetString("kind") {
	case lineKindAccount:
		id := r.GetString("account")
		if id == "" || (stored != nil && stored.GetString("account") == id) {
			return nil
		}
		account, err := tx.FindRecordById("books_accounts", id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("books: read the account of account line %d: %w", n, err)
		}
		if account.GetBool("inactive") {
			return refuseNamed(msgPurchaseAccountInactive, n, account.GetString("name"))
		}
	case lineKindItem:
		id := r.GetString("product")
		if id == "" || (stored != nil && stored.GetString("product") == id) {
			return nil
		}
		product, err := tx.FindRecordById("books_products", id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("books: read the product of product line %d: %w", n, err)
		}
		if !product.GetBool("purchases") {
			return refuseNamed(msgPurchaseProductNotPurchased, n, product.GetString("name"))
		}
	}
	return nil
}

// checkPurchaseOrderLineDelete keeps a line that a bill line names, of any
// bill: the refusal names a bill with a number before a draft bill, which has
// none yet.
func checkPurchaseOrderLineDelete(tx core.App, line *core.Record, place linePlace) error {
	bill, err := billNamingLine(tx, line.Id)
	if err != nil || !bill.found {
		return err
	}
	item := line.GetString("kind") == lineKindItem
	switch {
	case bill.number == "" && item:
		return refuse(msgPOProductLineOnDraftBill, place.n)
	case bill.number == "":
		return refuse(msgPOAccountLineOnDraftBill, place.n)
	case item:
		return refuse(msgPOProductLineOnBill, place.n, bill.number)
	}
	return refuse(msgPOAccountLineOnBill, place.n, bill.number)
}

// lineBill is the bill whose line names an order line: its number, "" for a
// draft bill.
type lineBill struct {
	found  bool
	number string
}

// billNamingLine finds a bill whose line names the order line, preferring one
// that is not a draft (so a refusal can name its number), then the newest.
func billNamingLine(tx core.App, poLineID string) (lineBill, error) {
	var rows []struct {
		Status string `db:"status"`
		Number string `db:"number"`
	}
	err := tx.DB().NewQuery(`SELECT b.status AS status, b.number AS number
		FROM books_bill_lines bl JOIN books_bills b ON b.id = bl.bill
		WHERE bl.po_line = {:line}
		ORDER BY (b.status = {:draft}), b.sequence DESC, b.id
		LIMIT 1`).
		Bind(dbx.Params{"line": poLineID, "draft": statusDraft}).All(&rows)
	if err != nil {
		return lineBill{}, fmt.Errorf("books: read the bills of the purchase order line: %w", err)
	}
	if len(rows) == 0 {
		return lineBill{}, nil
	}
	number := rows[0].Number
	if rows[0].Status == statusDraft {
		number = ""
	}
	return lineBill{found: true, number: number}, nil
}

// orderCurrency is the currency of the order, which its money texts print.
func orderCurrency(tx core.App, orderID string) (string, error) {
	order, err := tx.FindRecordById(purchaseOrdersCollection, orderID)
	if err != nil {
		return "", fmt.Errorf("books: read the purchase order of the line: %w", err)
	}
	return order.GetString("currency"), nil
}

// orderLineProducts are the products the order's lines hold.
func orderLineProducts(tx core.App, orderID string) ([]string, error) {
	lines, err := docLineRecords(tx, purchaseOrderLinesCollection, "purchase_order", orderID)
	if err != nil {
		return nil, err
	}
	var products []string
	for _, line := range lines {
		if id := line.GetString("product"); id != "" {
			products = append(products, id)
		}
	}
	return products, nil
}

// formatQuantity prints a stored quantity (at most 2 decimals) with no
// trailing zeros: 4, 2.5.
func formatQuantity(q float64) string {
	return strconv.FormatFloat(qtyFromHundredths(qtyHundredths(q)), 'f', -1, 64)
}
