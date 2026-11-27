package books

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// refreshPurchaseOrder is the one writer of an order line's received, billed,
// open quantity and open amount, of the order's open amount and status, and
// of each product's quantity on PO (spec §3.8, §3.11). The bills here are rows
// the test writes with saveRecord on an app with no bill guard bound, so only
// the refresh reads them: the bill's own link guards are checkpoint 2.

// mkPOBill writes a bill of order for vendor with status and number, past the
// bill guards. A replaced bill is a void bill whose replaced_by names its
// correction.
func mkPOBill(t testing.TB, app core.App, vendor, order *core.Record, status, number string) *core.Record {
	t.Helper()
	bill := saveRecord(t, app, "books_bills", map[string]any{
		"vendor": vendor.Id, "status": statusDraft, "date": billDay, "due_date": billDueDay,
		"currency": "USD", "number": number, "purchase_order": order.Id,
	})
	if status != statusDraft {
		setBillStatus(t, app, bill.Id, status)
	}
	return reload(t, app, "books_bills", bill.Id)
}

// markReplaced sets bill void and names correction as what replaced it, past
// every hook.
func markReplaced(t testing.TB, app core.App, bill, correction *core.Record) {
	t.Helper()
	if _, err := app.DB().NewQuery("UPDATE books_bills SET status = {:s}, replaced_by = {:by} WHERE id = {:id}").
		Bind(dbx.Params{"s": statusVoid, "by": correction.Id, "id": bill.Id}).Execute(); err != nil {
		t.Fatalf("mark bill %s replaced: %v", bill.Id, err)
	}
}

// mkPOBillLine writes one line of bill that names the order line poLine and
// takes quantity (a product line) or amount (both tables) of it.
func mkPOBillLine(t testing.TB, app core.App, bill *core.Record, position int, poLine *core.Record, quantity float64, amount int) *core.Record {
	t.Helper()
	fields := map[string]any{
		"bill": bill.Id, "position": position, "kind": poLine.GetString("kind"), "amount": amount, "po_line": poLine.Id,
	}
	if poLine.GetString("kind") == "item" {
		fields["product"] = poLine.GetString("product")
		fields["quantity"] = quantity
		fields["rate"] = poLine.GetInt("rate")
	} else {
		fields["account"] = poLine.GetString("account")
	}
	return saveRecord(t, app, "books_bill_lines", fields)
}

// refreshPO runs the refresh of order in its own transaction, as the bill's
// post will, and fails the test on an error.
func refreshPO(t testing.TB, app core.App, orderID string) {
	t.Helper()
	if err := app.RunInTransaction(func(tx core.App) error {
		return refreshPurchaseOrder(tx, orderID)
	}); err != nil {
		t.Fatalf("refresh purchase order %s: %v", orderID, err)
	}
}

func requirePOStatus(t testing.TB, app core.App, orderID, status, reason string) {
	t.Helper()
	r := reload(t, app, "books_purchase_orders", orderID)
	if r.GetString("status") != status || r.GetString("closed_reason") != reason {
		t.Errorf("status %q closed_reason %q, want %q and %q", r.GetString("status"), r.GetString("closed_reason"), status, reason)
	}
}

// Spec §3.8: received and billed count the posted, not replaced, not void
// bills only; a draft bill changes nothing. The header's open amount and the
// product's quantity on PO follow.
func TestRefreshPurchaseOrder_CountsPostedBillsOnly(t *testing.T) {
	pe := newPOEnv(t)
	order := mkPO(t, pe.app, pe.officeSupply, nil)
	item := mkPOLine(t, pe.app, order, 0, productLine(pe.accessPoint, 10, 12140))
	account := mkPOLine(t, pe.app, order, 1, accountLine(pe.software, 30000))
	requirePOTotals(t, pe.app, order.Id, 151400, 151400)
	requireOnPO(t, pe.app, pe.accessPoint, 10)

	draft := mkPOBill(t, pe.app, pe.officeSupply, order, statusDraft, "")
	mkPOBillLine(t, pe.app, draft, 0, item, 3, 36420)
	mkPOBillLine(t, pe.app, draft, 1, account, 0, 5000)
	refreshPO(t, pe.app, order.Id)
	requirePOLineOpen(t, pe.app, item.Id, 0, 0, 10, 121400)
	requirePOLineOpen(t, pe.app, account.Id, 0, 0, 0, 30000)
	requirePOTotals(t, pe.app, order.Id, 151400, 151400)
	requireOnPO(t, pe.app, pe.accessPoint, 10)

	posted := mkPOBill(t, pe.app, pe.officeSupply, order, statusPosted, "1012")
	mkPOBillLine(t, pe.app, posted, 0, item, 4, 48560)
	mkPOBillLine(t, pe.app, posted, 1, account, 0, 12000)
	void := mkPOBill(t, pe.app, pe.officeSupply, order, statusVoid, "1013")
	mkPOBillLine(t, pe.app, void, 0, item, 2, 24280)
	mkPOBillLine(t, pe.app, void, 1, account, 0, 1000)
	replaced := mkPOBill(t, pe.app, pe.officeSupply, order, statusPosted, "1014")
	mkPOBillLine(t, pe.app, replaced, 0, item, 1, 12140)
	markReplaced(t, pe.app, replaced, posted)
	refreshPO(t, pe.app, order.Id)

	// 10 - 4 = 6 open, 6 x 121.40 = 728.40; 300.00 - 120.00 = 180.00 open.
	requirePOLineOpen(t, pe.app, item.Id, 4, 48560, 6, 72840)
	requirePOLineOpen(t, pe.app, account.Id, 0, 12000, 0, 18000)
	requirePOTotals(t, pe.app, order.Id, 151400, 90840)
	requirePOStatus(t, pe.app, order.Id, "open", "")
	requireOnPO(t, pe.app, pe.accessPoint, 6)
}

// Plan decisions: the order closes as received when no line is open, with
// closed_at set and closed_by empty, and opens again when a line is open
// again. An order closed by hand never changes status in the refresh.
func TestRefreshPurchaseOrder_ClosesAsReceivedAndOpensAgain(t *testing.T) {
	pe := newPOEnv(t)
	order := mkPO(t, pe.app, pe.officeSupply, nil)
	item := mkPOLine(t, pe.app, order, 0, productLine(pe.accessPoint, 2, 12140))
	account := mkPOLine(t, pe.app, order, 1, accountLine(pe.software, 30000))
	bill := mkPOBill(t, pe.app, pe.officeSupply, order, statusPosted, "1012")
	mkPOBillLine(t, pe.app, bill, 0, item, 2, 24280)
	mkPOBillLine(t, pe.app, bill, 1, account, 0, 30000)
	refreshPO(t, pe.app, order.Id)

	closed := reload(t, pe.app, "books_purchase_orders", order.Id)
	if closed.GetString("status") != "closed" || closed.GetString("closed_reason") != "received" ||
		closed.GetDateTime("closed_at").IsZero() || closed.GetString("closed_by") != "" {
		t.Errorf("status %q closed_reason %q closed_at %v closed_by %q, want closed, received, a time and no one",
			closed.GetString("status"), closed.GetString("closed_reason"), closed.GetDateTime("closed_at"), closed.GetString("closed_by"))
	}
	requirePOTotals(t, pe.app, order.Id, 54280, 0)
	requireOnPO(t, pe.app, pe.accessPoint, 0)

	// The bill is voided: every line is open again.
	setBillStatus(t, pe.app, bill.Id, statusVoid)
	refreshPO(t, pe.app, order.Id)
	requireOpenOrder(t, pe.app, order.Id)
	requirePOLineOpen(t, pe.app, item.Id, 0, 0, 2, 24280)
	requirePOTotals(t, pe.app, order.Id, 54280, 54280)
	requireOnPO(t, pe.app, pe.accessPoint, 2)

	// Closed by hand, then a bill receives everything: it stays manual.
	if _, err := pe.app.DB().NewQuery("UPDATE books_purchase_orders SET status = 'closed', closed_reason = 'manual' WHERE id = {:id}").
		Bind(dbx.Params{"id": order.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	setBillStatus(t, pe.app, bill.Id, statusPosted)
	refreshPO(t, pe.app, order.Id)
	requirePOStatus(t, pe.app, order.Id, "closed", "manual")
	setBillStatus(t, pe.app, bill.Id, statusVoid)
	refreshPO(t, pe.app, order.Id)
	requirePOStatus(t, pe.app, order.Id, "closed", "manual")
	requirePOTotals(t, pe.app, order.Id, 54280, 0)
	requireOnPO(t, pe.app, pe.accessPoint, 0)
}

// Spec §3.5: the refusals of an edit of an order that bills name, each with
// its exact text. Product line 2 has 4 of 10 received on bill 1012; account
// line 1 has 120.00 of 300.00 billed on it; product line 1 is on a draft bill.
func TestPurchaseOrder_EditRefusalsOfAnOrderThatBillsName(t *testing.T) {
	pe := newPOEnv(t)
	order := mkPO(t, pe.app, pe.officeSupply, nil)
	account := mkPOLine(t, pe.app, order, 0, accountLine(pe.designTools, 30000))
	cable := mkPOLine(t, pe.app, order, 1, productLine(pe.patchCable, 12, 310))
	point := mkPOLine(t, pe.app, order, 2, productLine(pe.accessPoint, 10, 12140))
	posted := mkPOBill(t, pe.app, pe.officeSupply, order, statusPosted, "1012")
	mkPOBillLine(t, pe.app, posted, 0, account, 0, 12000)
	mkPOBillLine(t, pe.app, posted, 1, point, 4, 48560)
	draft := mkPOBill(t, pe.app, pe.officeSupply, order, statusDraft, "")
	mkPOBillLine(t, pe.app, draft, 0, cable, 5, 1550)
	refreshPO(t, pe.app, order.Id)

	cases := []struct {
		name string
		do   func() error
		want string
	}{
		{"Qty below received", func() error {
			return setFields(t, pe.app, "books_purchase_order_lines", point.Id, map[string]any{"quantity": 3})
		}, "Product line 2: 4 are received. The quantity cannot be below 4."},
		{"Amount below billed", func() error {
			return setFields(t, pe.app, "books_purchase_order_lines", account.Id, map[string]any{"amount": 11999})
		}, "Account line 1: $120.00 is billed. The amount cannot be below $120.00."},
		{"remove a product line on a posted bill", func() error {
			return pe.app.Delete(reload(t, pe.app, "books_purchase_order_lines", point.Id))
		}, "Product line 2 is on bill 1012 and cannot be removed."},
		{"remove an account line on a posted bill", func() error {
			return pe.app.Delete(reload(t, pe.app, "books_purchase_order_lines", account.Id))
		}, "Account line 1 is on bill 1012 and cannot be removed."},
		{"remove a product line on a draft bill", func() error {
			return pe.app.Delete(reload(t, pe.app, "books_purchase_order_lines", cable.Id))
		}, "Product line 1 is on a draft bill and cannot be removed."},
		{"product change", func() error {
			return setFields(t, pe.app, "books_purchase_order_lines", point.Id, map[string]any{"product": pe.patchCable.Id})
		}, "Product line 2: a line that a bill names keeps its product."},
		{"account change", func() error {
			return setFields(t, pe.app, "books_purchase_order_lines", account.Id, map[string]any{"account": pe.software.Id})
		}, "Account line 1: a line that a bill names keeps its account."},
		{"vendor change", func() error {
			return setFields(t, pe.app, "books_purchase_orders", order.Id, map[string]any{"vendor": pe.summit.Id})
		}, "Bills are made from this purchase order, so its vendor cannot change."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			requireRefusalText(t, tc.do(), tc.want)
		})
	}

	requirePOLineCount(t, pe.app, order, 3)
	stored := reload(t, pe.app, "books_purchase_order_lines", point.Id)
	if stored.GetFloat("quantity") != 10 || stored.GetString("product") != pe.accessPoint.Id {
		t.Errorf("product line 2 quantity %v product %q after the refusals, want 10 and the access point",
			stored.GetFloat("quantity"), stored.GetString("product"))
	}
	if got := reload(t, pe.app, "books_purchase_order_lines", account.Id); got.GetInt("amount") != 30000 || got.GetString("account") != pe.designTools.Id {
		t.Errorf("account line 1 amount %d account %q after the refusals, want 30000 and Design Tools", got.GetInt("amount"), got.GetString("account"))
	}
	if got := reload(t, pe.app, "books_purchase_orders", order.Id).GetString("vendor"); got != pe.officeSupply.Id {
		t.Errorf("vendor = %q after the refusal, want Office Supply World", got)
	}

	// The received quantity and the billed amount themselves pass.
	if err := setFields(t, pe.app, "books_purchase_order_lines", point.Id, map[string]any{"quantity": 4}); err != nil {
		t.Fatalf("Qty equal to received refused: %v", err)
	}
	if err := setFields(t, pe.app, "books_purchase_order_lines", account.Id, map[string]any{"amount": 12000}); err != nil {
		t.Fatalf("Amount equal to billed refused: %v", err)
	}
	requirePOLineOpen(t, pe.app, point.Id, 4, 48560, 0, 0)
	requirePOLineOpen(t, pe.app, account.Id, 0, 12000, 0, 0)
}

// Spec §3.11: quantity_on_po is written in the same transaction as the line
// change that moves it.
func TestPurchaseOrder_RaisingAQuantityRaisesOnPOInTheSameTransaction(t *testing.T) {
	pe := newPOEnv(t)
	order := mkPO(t, pe.app, pe.officeSupply, nil)
	line := mkPOLine(t, pe.app, order, 0, productLine(pe.accessPoint, 10, 12140))
	requireOnPO(t, pe.app, pe.accessPoint, 10)

	err := pe.app.RunInTransaction(func(tx core.App) error {
		fresh, err := tx.FindRecordById("books_purchase_order_lines", line.Id)
		if err != nil {
			return err
		}
		fresh.Set("quantity", 15)
		if err := tx.Save(fresh); err != nil {
			return err
		}
		product, err := tx.FindRecordById("books_products", pe.accessPoint.Id)
		if err != nil {
			return err
		}
		if got := product.GetFloat("quantity_on_po"); got != 15 {
			return fmt.Errorf("quantity_on_po = %v inside the line's transaction, want 15", got)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	requireOnPO(t, pe.app, pe.accessPoint, 15)
	requirePOTotals(t, pe.app, order.Id, 182100, 182100)
}

// Spec §3.11: "on PO" counts open orders only: 6, then 0 after an admin's
// Close, 6 after Reopen, 0 after the line is removed, and 0 after the order is
// deleted.
func TestPurchaseOrder_OnPOFollowsCloseReopenRemoveAndDelete(t *testing.T) {
	pe := newPOEnv(t)
	order := mkPO(t, pe.app, pe.officeSupply, nil)
	mkPOLine(t, pe.app, order, 0, accountLine(pe.software, 4500))
	line := mkPOLine(t, pe.app, order, 1, productLine(pe.accessPoint, 6, 12140))
	requireOnPO(t, pe.app, pe.accessPoint, 6)

	code, body := pe.closePO(t, pe.users.admin, order.Id)
	requireCode(t, "an admin's Close", code, body, http.StatusOK)
	requireOnPO(t, pe.app, pe.accessPoint, 0)

	code, body = pe.reopenPO(t, pe.users.admin, order.Id)
	requireCode(t, "an admin's Reopen", code, body, http.StatusOK)
	requireOnPO(t, pe.app, pe.accessPoint, 6)

	if err := pe.app.Delete(reload(t, pe.app, "books_purchase_order_lines", line.Id)); err != nil {
		t.Fatalf("remove the product line: %v", err)
	}
	requireOnPO(t, pe.app, pe.accessPoint, 0)

	mkPOLine(t, pe.app, order, 1, productLine(pe.accessPoint, 6, 12140))
	requireOnPO(t, pe.app, pe.accessPoint, 6)
	if err := pe.app.Delete(reload(t, pe.app, "books_purchase_orders", order.Id)); err != nil {
		t.Fatalf("delete the order: %v", err)
	}
	requireOnPO(t, pe.app, pe.accessPoint, 0)
}

// The product guard lets refreshOnPO's marked write through, and that write
// changes quantity_on_po alone: a write under the mark that changes another
// field of the product is refused with the refresh text, and changes nothing.
// The same marked write of quantity_on_po alone passes.
func TestProduct_AMarkedOnPOWriteChangesTheQuantityOnPOAlone(t *testing.T) {
	const wantPORefreshOnly = "Only the open values change while Books refreshes its purchase order."
	pe := newPOEnv(t)
	markedSave := func(fields map[string]any) error {
		return pe.app.RunInTransaction(func(tx core.App) error {
			product, err := tx.FindRecordById("books_products", pe.accessPoint.Id)
			if err != nil {
				return err
			}
			for k, v := range fields {
				product.Set(k, v)
			}
			defer setTxMark(tx, markOnPOWrite, product.Id)()
			return tx.Save(product)
		})
	}
	name := pe.accessPoint.GetString("name")

	err := markedSave(map[string]any{"quantity_on_po": 3, "name": "Renamed access point"})
	requireRefusalText(t, err, wantPORefreshOnly)
	stored := reload(t, pe.app, "books_products", pe.accessPoint.Id)
	if stored.GetString("name") != name || stored.GetFloat("quantity_on_po") != 0 {
		t.Errorf("name %q quantity_on_po %v after the refused write, want %q and 0",
			stored.GetString("name"), stored.GetFloat("quantity_on_po"), name)
	}

	if err := markedSave(map[string]any{"quantity_on_po": 3}); err != nil {
		t.Fatalf("a marked write of quantity_on_po alone refused: %v", err)
	}
	requireOnPO(t, pe.app, pe.accessPoint, 3)
}

// The refresh runs inside the order write's transaction: when it fails, the
// line write rolls back with it. A trigger makes the product's quantity_on_po
// write fail, whether the refresh saves the product or updates it by SQL.
func TestPurchaseOrder_AFailedRefreshRollsTheWriteBack(t *testing.T) {
	pe := newPOEnv(t)
	order := mkPO(t, pe.app, pe.officeSupply, nil)
	line := mkPOLine(t, pe.app, order, 0, productLine(pe.accessPoint, 6, 12140))
	saw := docRevision(t, pe.app, "books_purchase_orders", order.Id)
	if _, err := pe.app.DB().NewQuery(`CREATE TRIGGER fail_on_po BEFORE UPDATE OF quantity_on_po ON books_products
		BEGIN SELECT RAISE(ABORT, 'on PO write fails'); END`).Execute(); err != nil {
		t.Fatalf("create the failing trigger: %v", err)
	}

	if err := setFields(t, pe.app, "books_purchase_order_lines", line.Id, map[string]any{"quantity": 9}); err == nil {
		t.Fatal("the line write passed although its refresh failed")
	}
	if got := reload(t, pe.app, "books_purchase_order_lines", line.Id).GetFloat("quantity"); got != 6 {
		t.Errorf("quantity = %v after the failed refresh, want 6", got)
	}
	requirePOLineOpen(t, pe.app, line.Id, 0, 0, 6, 72840)
	requirePOTotals(t, pe.app, order.Id, 72840, 72840)
	if got := docRevision(t, pe.app, "books_purchase_orders", order.Id); got != saw {
		t.Errorf("revision = %d after the failed write, want %d", got, saw)
	}
	requireOnPO(t, pe.app, pe.accessPoint, 6)
}

// poOpenCase is one row of server/testdata/purchase_order_open_cases.json, the
// case table tests/purchase-order-status.test.ts runs too.
type poOpenCase struct {
	Name           string  `json:"name"`
	Kind           string  `json:"kind"`
	Status         string  `json:"status"`
	Quantity       float64 `json:"quantity"`
	Rate           int     `json:"rate"`
	Amount         int     `json:"amount"`
	Received       float64 `json:"received"`
	Billed         int     `json:"billed"`
	OpenQuantity   float64 `json:"open_quantity"`
	OpenAmount     int     `json:"open_amount"`
	LineOpen       bool    `json:"line_open"`
	PartlyReceived bool    `json:"partly_received"`
}

func readPOOpenCases(t testing.TB) []poOpenCase {
	t.Helper()
	raw, err := os.ReadFile("testdata/purchase_order_open_cases.json")
	if err != nil {
		t.Fatalf("read the open cases: %v", err)
	}
	var cases []poOpenCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("parse the open cases: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("the open case file holds no case")
	}
	return cases
}

// Every row of the shared case file: an order with the one line of the row,
// a posted bill that receives and bills what the row says, then the refresh.
// A row with status closed is closed by hand after the first refresh, and a
// second refresh keeps its lines' open values and stores the header's 0.
func TestRefreshPurchaseOrder_RunsTheSharedOpenCases(t *testing.T) {
	pe := newPOEnv(t)
	for i, tc := range readPOOpenCases(t) {
		t.Run(tc.Name, func(t *testing.T) {
			order := mkPO(t, pe.app, pe.officeSupply, nil)
			fields := accountLine(pe.software, int64(tc.Amount))
			if tc.Kind == "item" {
				fields = productLine(pe.accessPoint, tc.Quantity, int64(tc.Rate))
			}
			line := mkPOLine(t, pe.app, order, 0, fields)
			if got := reload(t, pe.app, "books_purchase_order_lines", line.Id).GetInt("amount"); got != tc.Amount {
				t.Fatalf("line amount = %d, want the case's %d", got, tc.Amount)
			}
			if tc.Received > 0 || tc.Billed > 0 {
				bill := mkPOBill(t, pe.app, pe.officeSupply, order, statusPosted, fmt.Sprint(2000+i))
				mkPOBillLine(t, pe.app, bill, 0, line, tc.Received, tc.Billed)
			}
			refreshPO(t, pe.app, order.Id)

			wantStatus, wantReason, wantHeader := "open", "", tc.OpenAmount
			if !tc.LineOpen {
				wantStatus, wantReason, wantHeader = "closed", "received", 0
			}
			if tc.Status == "closed" {
				if _, err := pe.app.DB().NewQuery("UPDATE books_purchase_orders SET status = 'closed', closed_reason = 'manual' WHERE id = {:id}").
					Bind(dbx.Params{"id": order.Id}).Execute(); err != nil {
					t.Fatal(err)
				}
				refreshPO(t, pe.app, order.Id)
				wantStatus, wantReason, wantHeader = "closed", "manual", 0
			}
			stored := reload(t, pe.app, "books_purchase_order_lines", line.Id)
			if math.Abs(stored.GetFloat("open_quantity")-tc.OpenQuantity) > 1e-9 || stored.GetInt("open_amount") != tc.OpenAmount {
				t.Errorf("open_quantity %v open_amount %d, want %v and %d",
					stored.GetFloat("open_quantity"), stored.GetInt("open_amount"), tc.OpenQuantity, tc.OpenAmount)
			}
			requirePOStatus(t, pe.app, order.Id, wantStatus, wantReason)
			if got := reload(t, pe.app, "books_purchase_orders", order.Id).GetInt("open_amount"); got != wantHeader {
				t.Errorf("header open_amount = %d, want %d", got, wantHeader)
			}
		})
	}
}
