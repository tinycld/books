package books

import (
	"fmt"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func newItemEnv(t *testing.T) *ledgerEnv {
	t.Helper()
	env := newLedgerEnv(t)
	registerInventoryAdjustmentGuards(env.app)
	return env
}

func inventoryItem(env *ledgerEnv, over map[string]any) map[string]any {
	fields := map[string]any{"type": "inventory", "name": "Widget", "income_account": env.revenue.Id, "cost": 500}
	for k, v := range over {
		fields[k] = v
	}
	return fields
}

// openingOf is the item's posted opening adjustment, nil when it has none.
func openingOf(t testing.TB, app core.App, product *core.Record) *core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter(inventoryAdjustmentsCollection,
		"kind = 'opening' && status = 'posted' && source = 'books_products' && document = {:p}", "", 0, 0,
		dbx.Params{"p": product.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) > 1 {
		t.Fatalf("%d posted opening adjustments of one item, want at most 1", len(rows))
	}
	if len(rows) == 0 {
		return nil
	}
	return rows[0]
}

func TestInventoryItem_TakesTheChartsAccounts(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, nil))
	if err != nil {
		t.Fatalf("save an Inventory item: %v", err)
	}
	asset := reload(t, env.app, "books_accounts", widget.GetString("asset_account"))
	cogs := reload(t, env.app, "books_accounts", widget.GetString("expense_account"))
	if asset.GetString("name") != "Inventory asset" || asset.GetString("detail_type") != "inventory" {
		t.Errorf("asset account = %q (%s), want Inventory asset", asset.GetString("name"), asset.GetString("detail_type"))
	}
	if cogs.GetString("type") != "cost_of_goods_sold" {
		t.Errorf("cost of goods sold account is of type %s", cogs.GetString("type"))
	}
	if !widget.GetBool("purchases") {
		t.Error("an Inventory item is bought: purchases must be on")
	}
	if productTypeLabel("inventory") != "Inventory" || !isInventoryProduct(widget) {
		t.Error("the type inventory reads Inventory and isInventoryProduct holds")
	}
	if openingOf(t, env.app, widget) != nil {
		t.Error("an item with no opening quantity has no opening adjustment")
	}
	requireMessageOnlyRefusal(t, env.app.Delete(asset),
		"This account is used by 1 product or service and cannot be deleted. Make it inactive instead.")
}

func TestInventoryItem_Guards(t *testing.T) {
	env := newItemEnv(t)
	bank := env.checking
	gone := saveRecord(t, env.app, "books_accounts", map[string]any{
		"name": "Old stock", "type": "other_current_asset", "detail_type": "inventory", "currency": "USD", "inactive": true,
	})
	cases := []struct {
		name, field, want string
		over              map[string]any
	}{
		{"an asset account of another type", "asset_account", "The inventory asset account must be an Other current asset account.", map[string]any{"asset_account": bank.Id}},
		{"an asset account that does not exist", "asset_account", "The inventory asset account does not exist.", map[string]any{"asset_account": "missing00000000"}},
		{"a cost account of another type", "expense_account", "The cost of goods sold account must be a Cost of goods sold account.", map[string]any{"expense_account": env.rent.Id}},
		{"a vendor that does not exist", "preferred_vendor", "The preferred vendor does not exist.", map[string]any{"preferred_vendor": "missing00000000"}},
		{"an opening value with no quantity", "opening_quantity", "Enter an opening quantity for the opening value.", map[string]any{"opening_value": 500}},
		{"an opening quantity below 0", "opening_quantity", "An opening quantity cannot be below 0.", map[string]any{"opening_quantity": -1, "opening_date": "2026-07-01"}},
		{"an opening quantity with 3 decimals", "opening_quantity", "Enter an opening quantity with at most 2 decimals.", map[string]any{"opening_quantity": 1.005, "opening_date": "2026-07-01"}},
		{"an opening quantity with no date", "opening_date", "Enter the date of the opening quantity.", map[string]any{"opening_quantity": 5}},
		{"an opening date that does not exist", "opening_date", "Enter a date that exists, in the form YYYY-MM-DD.", map[string]any{"opening_quantity": 5, "opening_date": "2026-02-30"}},
		{"an opening date that does not exist and no quantity", "opening_date", "Enter a date that exists, in the form YYYY-MM-DD.", map[string]any{"opening_date": "2026-02-30"}},
		{"an inactive asset account", "asset_account", "The inventory asset account is inactive.", map[string]any{"asset_account": gone.Id}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := newProduct(env.app, inventoryItem(env, tc.over))
			requireFieldRefusal(t, err, tc.field, tc.want)
		})
	}
	_, err := newProduct(env.app, inventoryItem(env, map[string]any{"quantity_on_hand": 5}))
	requireMessageOnlyRefusal(t, err, "Books sets the quantity on hand and the stock value itself.")
	_, err = newProduct(env.app, map[string]any{
		"type": "service", "name": "Setup", "income_account": env.revenue.Id, "reorder_point": 3,
	})
	requireMessageOnlyRefusal(t, err, "Only an Inventory item has an inventory asset account, a reorder point and opening stock.")
	if n, _ := env.app.CountRecords("books_products"); n != 0 {
		t.Errorf("%d products after the refusals, want none", n)
	}
}

func TestInventoryItem_KeepsItsType(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, nil))
	if err != nil {
		t.Fatal(err)
	}
	service := mkService(t, env.app, "Setup", env.revenue)
	requireFieldRefusal(t, setFields(t, env.app, "books_products", widget.Id, map[string]any{"type": "non_inventory"}),
		"type", "An Inventory item cannot change type.")
	requireFieldRefusal(t, setFields(t, env.app, "books_products", service.Id, map[string]any{"type": "inventory"}),
		"type", "Only a new product can be an Inventory item.")
	requireMessageOnlyRefusal(t, setFields(t, env.app, "books_products", widget.Id, map[string]any{"stock_value": 100}),
		"Books sets the quantity on hand and the stock value itself.")
}

// The inventory checks come before the bundle ones, so a move from Inventory to
// Bundle reads the Inventory sentence.
func TestInventoryItem_ToBundleReadsTheInventorySentence(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, nil))
	if err != nil {
		t.Fatal(err)
	}
	requireFieldRefusal(t, setFields(t, env.app, "books_products", widget.Id, map[string]any{"type": "bundle"}),
		"type", "An Inventory item cannot change type.")
}

func stockIn(t *testing.T, env *ledgerEnv, widget *core.Record) {
	t.Helper()
	err := env.app.RunInTransaction(func(tx core.App) error {
		_, err := newSystemAdjustment(tx, systemAdjustment{
			Kind: adjustmentKindManual, Date: "2026-07-01", Actor: env.users.bookkeeper.Id,
			Lines: []adjustmentLineInput{{Product: widget.Id, Quantity: 10, Value: 1000}},
		})
		return err
	})
	if err != nil {
		t.Fatalf("bring stock in: %v", err)
	}
}

// The asset account is free until the item has a stock move, then fixed.
func TestInventoryItem_AssetAccountIsFixedAfterStockMoves(t *testing.T) {
	env := newItemEnv(t)
	other := mkAccount(t, env.app, "Spare parts", "other_current_asset", "undeposited_funds")
	idle, err := newProduct(env.app, inventoryItem(env, map[string]any{"name": "Idle"}))
	if err != nil {
		t.Fatal(err)
	}
	if err := setFields(t, env.app, "books_products", idle.Id, map[string]any{"asset_account": other.Id}); err != nil {
		t.Errorf("an item with no stock moves refuses a new asset account: %v", err)
	}
	widget, err := newProduct(env.app, inventoryItem(env, nil))
	if err != nil {
		t.Fatal(err)
	}
	stockIn(t, env, widget)
	requireFieldRefusal(t, setFields(t, env.app, "books_products", widget.Id, map[string]any{"asset_account": other.Id}),
		"asset_account", "The inventory asset account cannot change after the item has stock transactions.")
}

// A product on an adjustment line is kept: Books makes the line's stock moves.
func TestInventoryItem_OnAnAdjustmentCannotBeDeleted(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, nil))
	if err != nil {
		t.Fatal(err)
	}
	stockIn(t, env, widget)
	requireMessageOnlyRefusal(t, env.app.Delete(reload(t, env.app, "books_products", widget.Id)),
		"This product or service is on 1 inventory adjustment. Make it inactive instead.")
}

// A bundle may hold Inventory items (books design, "Inventory").
func TestBundle_HoldsAnInventoryItem(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, nil))
	if err != nil {
		t.Fatal(err)
	}
	bundle, err := newProduct(env.app, map[string]any{"type": "bundle", "name": "Starter kit"})
	if err != nil {
		t.Fatalf("save a bundle: %v", err)
	}
	if _, err := saveNew(env.app, "books_bundle_items", map[string]any{"bundle": bundle.Id, "product": widget.Id, "quantity": 2}); err != nil {
		t.Errorf("a bundle refuses an Inventory item: %v", err)
	}
}

// moveItemStock posts a manual adjustment of qty units of the item (in for
// 1.00 each, or out at cost when qty is below 0).
func moveItemStock(t testing.TB, env *ledgerEnv, product *core.Record, qty float64) {
	t.Helper()
	line := adjustmentLineInput{Product: product.Id, Quantity: qty}
	if qty > 0 {
		line.Value = int64(qty * 100)
	}
	err := env.app.RunInTransaction(func(tx core.App) error {
		_, err := newSystemAdjustment(tx, systemAdjustment{
			Kind: adjustmentKindManual, Date: "2026-07-01", Actor: env.users.bookkeeper.Id,
			Lines: []adjustmentLineInput{line},
		})
		return err
	})
	if err != nil {
		t.Fatalf("move %v of %s: %v", qty, product.GetString("name"), err)
	}
}

func requireLowStock(t testing.TB, app core.App, product *core.Record, want bool, when string) {
	t.Helper()
	r := reload(t, app, "books_products", product.Id)
	if got := r.GetBool("low_stock"); got != want {
		t.Errorf("%s: low_stock = %v with %v on hand and reorder point %v, want %v",
			when, got, r.GetFloat("quantity_on_hand"), r.GetFloat("reorder_point"), want)
	}
}

// Inventory-adjust spec §3.10: an item is low when its reorder point is above
// 0 and its quantity on hand is at or below it. The stock move writes it.
func TestInventoryItem_LowStockFollowsTheQuantityOnHand(t *testing.T) {
	cases := []struct {
		name         string
		reorderPoint float64
		onHand       float64
		want         bool
	}{
		{"reorder point 0", 0, 0, false},
		{"reorder point 0 with stock", 0, 4, false},
		{"on hand above the reorder point", 10, 12, false},
		{"on hand at the reorder point", 10, 10, true},
		{"on hand below the reorder point", 10, 4, true},
		{"on hand below zero", 10, -2, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := newItemEnv(t)
			widget, err := newProduct(env.app, inventoryItem(env, map[string]any{"reorder_point": tc.reorderPoint}))
			if err != nil {
				t.Fatal(err)
			}
			// Above the point first, so the case's own move is what writes it.
			moveItemStock(t, env, widget, 20)
			requireLowStock(t, env.app, widget, false, "with 20 on hand")
			if delta := tc.onHand - 20; delta != 0 {
				moveItemStock(t, env, widget, delta)
			}
			requireLowStock(t, env.app, widget, tc.want, tc.name)
		})
	}
}

// Inventory-adjust spec §3.10 (Q5): quantity on PO does not count.
func TestInventoryItem_LowStockLeavesOutTheQuantityOnPO(t *testing.T) {
	// newPOEnv's no-posting check does not fit here: the stock-in posts.
	env := newLedgerEnv(t)
	registerSalesDocGuards(env.app, purchaseOrderKind)
	bindHostsByKey(t, env.app, purchaseOrderKind.HostKey)
	registerInventoryAdjustmentGuards(env.app)
	pe := &poEnv{billEnv: billEnvOn(t, env)}
	widget, err := newProduct(pe.app, inventoryItem(pe.ledgerEnv, map[string]any{"reorder_point": 10}))
	if err != nil {
		t.Fatal(err)
	}
	moveItemStock(t, pe.ledgerEnv, widget, 8)
	requireLowStock(t, pe.app, widget, true, "with 8 on hand")
	order := mkPO(t, pe.app, pe.officeSupply, nil)
	mkPOLine(t, pe.app, order, 0, productLine(widget, 5, 300))
	requireOnPO(t, pe.app, widget, 5)
	requireLowStock(t, pe.app, widget, true, "with 8 on hand and 5 on PO")
}

// Inventory-adjust spec §4: a change of the reorder point writes low_stock,
// with no stock move.
func TestInventoryItem_LowStockFollowsTheReorderPoint(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, map[string]any{"reorder_point": 5}))
	if err != nil {
		t.Fatal(err)
	}
	moveItemStock(t, env, widget, 8)
	requireLowStock(t, env.app, widget, false, "8 on hand, reorder point 5")
	for _, step := range []struct {
		point float64
		want  bool
	}{{10, true}, {8, true}, {7.5, false}, {0, false}} {
		if err := setFields(t, env.app, "books_products", widget.Id, map[string]any{"reorder_point": step.point}); err != nil {
			t.Fatalf("set the reorder point to %v: %v", step.point, err)
		}
		requireLowStock(t, env.app, widget, step.want, fmt.Sprintf("reorder point %v", step.point))
	}
	if n, _ := env.app.CountRecords(stockMovesCollection); n != 1 {
		t.Errorf("%d stock moves after the reorder point changes, want the one stock-in", n)
	}
}

// Inventory-adjust spec §4: the opening stock's write of the totals carries
// low_stock too (takeStockTotals), so the item's own save does not put the
// answer of before back.
func TestInventoryItem_LowStockFollowsTheOpeningStock(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, map[string]any{
		"reorder_point": 12, "opening_quantity": 3, "opening_value": 300, "opening_date": "2026-07-01",
	}))
	if err != nil {
		t.Fatalf("save an item with opening stock: %v", err)
	}
	if !widget.GetBool("low_stock") {
		t.Error("the saved record holds low_stock off, want on as the stored row")
	}
	requireLowStock(t, env.app, widget, true, "opening quantity 3, reorder point 12")
	if err := setFields(t, env.app, "books_products", widget.Id, map[string]any{"opening_quantity": 20, "opening_value": 2000}); err != nil {
		t.Fatalf("change the opening stock: %v", err)
	}
	requireLowStock(t, env.app, widget, false, "opening quantity 20, reorder point 12")
}

// A write that loaded the item before a posting moved its stock does not put
// the old totals back, and is not refused for them.
func TestInventoryItem_AStaleWriteKeepsTheStoredTotals(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, nil))
	if err != nil {
		t.Fatal(err)
	}
	stale := reload(t, env.app, "books_products", widget.Id)
	err = env.app.RunInTransaction(func(tx core.App) error {
		_, err := newSystemAdjustment(tx, systemAdjustment{
			Kind: adjustmentKindManual, Date: "2026-07-01", Actor: env.users.bookkeeper.Id,
			Lines: []adjustmentLineInput{{Product: widget.Id, Quantity: 10, Value: 1000}},
		})
		return err
	})
	if err != nil {
		t.Fatalf("bring stock in: %v", err)
	}
	stale.Set("name", "Blue widget")
	if err := env.app.Save(stale); err != nil {
		t.Fatalf("rename with the totals of before the stock-in: %v", err)
	}
	requireOnHand(t, env.app, widget, 10, 1000)
}
