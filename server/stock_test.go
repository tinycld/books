package books

import (
	"errors"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
)

// stockEnv is a ledger env with an inventory asset account, a cost of goods
// sold account and one Inventory item whose purchase cost is 5.00.
type stockEnv struct {
	*ledgerEnv
	asset, cogs, widget *core.Record
}

func newStockEnv(t *testing.T) *stockEnv {
	t.Helper()
	return stockEnvOn(t, newLedgerEnv(t))
}

func stockEnvOn(t *testing.T, env *ledgerEnv) *stockEnv {
	t.Helper()
	se := &stockEnv{
		ledgerEnv: env,
		asset:     mkAccount(t, env.app, "Inventory asset", "other_current_asset", "inventory"),
		cogs:      mkAccount(t, env.app, "Cost of goods sold", "cost_of_goods_sold", "supplies_materials"),
	}
	se.widget = se.mkInventoryItem(t, "Widget", 500)
	return se
}

func (se *stockEnv) mkInventoryItem(t testing.TB, name string, cost int) *core.Record {
	t.Helper()
	r, err := newProduct(se.app, map[string]any{
		"type": "inventory", "name": name, "income_account": se.revenue.Id, "cost": cost,
	})
	if err != nil {
		t.Fatalf("save inventory item %q: %v", name, err)
	}
	return r
}

func setCostingMethod(t testing.TB, app core.App, method string) {
	t.Helper()
	if err := setFields(t, app, "books_settings", settingsID, map[string]any{"costing_method": method}); err != nil {
		t.Fatalf("set the costing method to %s: %v", method, err)
	}
}

// receipt is units received for value cents on a document; sold is units sold.
func (se *stockEnv) receipt(document, date string, units, value int64) stockMoveInput {
	return stockMoveInput{
		Product: se.widget.Id, Kind: stockKindReceipt, Source: "books_bills", Document: document, Date: date,
		Qty: units * 100, Given: true, Value: value, AssetAccount: se.asset.Id, OffsetAccount: se.cogs.Id,
	}
}

func (se *stockEnv) sold(document, date string, units int64) stockMoveInput {
	return stockMoveInput{
		Product: se.widget.Id, Kind: stockKindSale, Source: "books_invoices", Document: document, Date: date,
		Qty: -units * 100, AssetAccount: se.asset.Id, OffsetAccount: se.cogs.Id,
	}
}

// moveStock writes the moves and replays the widget in one transaction, as a
// posting does.
func (se *stockEnv) moveStock(t testing.TB, moves ...stockMoveInput) error {
	t.Helper()
	return se.app.RunInTransaction(func(tx core.App) error {
		if err := addStockMoves(tx, moves); err != nil {
			return err
		}
		return recomputeStock(tx, []string{se.widget.Id})
	})
}

func (se *stockEnv) mustMoveStock(t testing.TB, moves ...stockMoveInput) {
	t.Helper()
	if err := se.moveStock(t, moves...); err != nil {
		t.Fatalf("move stock: %v", err)
	}
}

// moveValue is the value of the one move of a document.
func moveValue(t testing.TB, app core.App, document string) int {
	t.Helper()
	r, err := app.FindFirstRecordByFilter(stockMovesCollection, "document = {:d}", dbx.Params{"d": document})
	if err != nil {
		t.Fatalf("read the stock move of %s: %v", document, err)
	}
	return r.GetInt("value")
}

func requireOnHand(t testing.TB, app core.App, product *core.Record, qty float64, value int) {
	t.Helper()
	r := reload(t, app, "books_products", product.Id)
	if r.GetFloat("quantity_on_hand") != qty || r.GetInt("stock_value") != value {
		t.Errorf("on hand = %v for %d, want %v for %d", r.GetFloat("quantity_on_hand"), r.GetInt("stock_value"), qty, value)
	}
}

// layer is one stored layer as these tests compare it.
type layer struct {
	qty   float64
	value int
}

func layersOf(t testing.TB, app core.App, product *core.Record) []layer {
	t.Helper()
	rows, err := app.FindRecordsByFilter(stockLayersCollection, "product = {:p}", stockLayerOrder, 0, 0, dbx.Params{"p": product.Id})
	if err != nil {
		t.Fatal(err)
	}
	out := make([]layer, len(rows))
	for i, r := range rows {
		out[i] = layer{r.GetFloat("quantity"), r.GetInt("value")}
	}
	return out
}

func TestRecomputeStock_WritesValuesLayersAndOnHand(t *testing.T) {
	cases := []struct {
		method    string
		saleValue int
		layers    []layer
		value     int
	}{
		{costingFIFO, -2000, []layer{{5, 1000}}, 1000},
		{costingAverage, -2250, []layer{{5, 750}}, 750},
	}
	for _, tc := range cases {
		t.Run(tc.method, func(t *testing.T) {
			se := newStockEnv(t)
			setCostingMethod(t, se.app, tc.method)
			se.mustMoveStock(t,
				se.receipt("bill00000000001", "2026-07-01", 10, 1000),
				se.receipt("bill00000000002", "2026-07-02", 10, 2000),
				se.sold("invoice00000001", "2026-07-03", 15),
			)
			if got := moveValue(t, se.app, "invoice00000001"); got != tc.saleValue {
				t.Errorf("the sale's value = %d, want %d", got, tc.saleValue)
			}
			if got := layersOf(t, se.app, se.widget); len(got) != len(tc.layers) || got[0] != tc.layers[0] {
				t.Errorf("layers = %v, want %v", got, tc.layers)
			}
			requireOnHand(t, se.app, se.widget, 5, tc.value)
			sale, err := se.app.FindFirstRecordByFilter(stockMovesCollection, "document = 'invoice00000001'")
			if err != nil {
				t.Fatal(err)
			}
			if sale.GetFloat("quantity_after") != 5 || sale.GetInt("value_after") != tc.value {
				t.Errorf("after the sale = %v for %d, want 5 for %d",
					sale.GetFloat("quantity_after"), sale.GetInt("value_after"), tc.value)
			}
		})
	}
}

func TestAddStockMoves_LocksTheCostingMethod(t *testing.T) {
	se := newStockEnv(t)
	se.mustMoveStock(t, se.receipt("bill00000000001", "2026-07-01", 1, 100))
	if !reload(t, se.app, "books_settings", settingsID).GetBool("costing_locked") {
		t.Error("the first stock move did not lock the costing method")
	}
}

func TestAddStockMoves_RefusesAProductThatIsNotInventory(t *testing.T) {
	se := newStockEnv(t)
	service := mkService(t, se.app, "Setup", se.revenue)
	move := se.receipt("bill00000000001", "2026-07-01", 1, 100)
	move.Product = service.Id
	requireRefused(t, se.moveStock(t, move), "Setup is not an Inventory item.")
	if n, _ := se.app.CountRecords(stockMovesCollection); n != 0 {
		t.Errorf("%d stock moves were written, want none", n)
	}
}

// A receipt dated before a posted sale changes that sale's value: the sale
// then differs from what the ledger holds for it.
func TestRecomputeStock_BackDatedReceiptDriftsTheLaterSale(t *testing.T) {
	se := newStockEnv(t)
	se.mustMoveStock(t, se.receipt("bill00000000001", "2026-07-02", 10, 1000), se.sold("invoice00000001", "2026-07-03", 5))
	err := se.app.RunInTransaction(func(tx core.App) error {
		moves, err := driftedStockMoves(tx, []string{se.widget.Id})
		if err != nil {
			return err
		}
		return markStockPosted(tx, moves)
	})
	if err != nil {
		t.Fatal(err)
	}
	se.mustMoveStock(t, se.receipt("bill00000000002", "2026-07-01", 10, 500))

	if got := moveValue(t, se.app, "invoice00000001"); got != -250 {
		t.Errorf("the sale's value = %d, want -250 (the older, cheaper stock)", got)
	}
	drifted, err := driftedStockMoves(se.app, []string{se.widget.Id})
	if err != nil {
		t.Fatal(err)
	}
	got := map[string][2]int{}
	for _, m := range drifted {
		got[m.GetString("document")] = [2]int{m.GetInt("value"), m.GetInt("posted_value")}
	}
	want := map[string][2]int{"invoice00000001": {-250, -500}, "bill00000000002": {500, 0}}
	if len(got) != len(want) || got["invoice00000001"] != want["invoice00000001"] || got["bill00000000002"] != want["bill00000000002"] {
		t.Errorf("drifted = %v, want %v", got, want)
	}
}

// A voided receipt takes its move away: the sale it supplied is oversold and
// costs the product's purchase cost.
func TestRemoveStockMoves_ReplayLeavesTheSaleOversold(t *testing.T) {
	se := newStockEnv(t)
	se.mustMoveStock(t, se.receipt("bill00000000001", "2026-07-01", 10, 1000), se.sold("invoice00000001", "2026-07-03", 5))
	err := se.app.RunInTransaction(func(tx core.App) error {
		removed, err := removeStockMoves(tx, "books_bills", "bill00000000001")
		if err != nil {
			return err
		}
		products := stockMoveProducts(removed)
		if len(products) != 1 || products[0] != se.widget.Id {
			t.Errorf("products = %v, want the widget", products)
		}
		return recomputeStock(tx, products)
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := moveValue(t, se.app, "invoice00000001"); got != -2500 {
		t.Errorf("the sale's value = %d, want -2500 (5 at the purchase cost 5.00)", got)
	}
	requireOnHand(t, se.app, se.widget, -5, -2500)
	if got := layersOf(t, se.app, se.widget); len(got) != 0 {
		t.Errorf("layers = %v, want none", got)
	}
}

func TestRecomputeStock_RefusesAValueTooLarge(t *testing.T) {
	se := newStockEnv(t)
	// 0.01 unit for 9×10^12 cents, then 100,000 unlinked units priced at that
	// cost: 9×10^19 cents, more than the stock may hold.
	tiny := stockMoveInput{
		Product: se.widget.Id, Kind: stockKindReceipt, Source: "books_bills", Document: "bill00000000001", Date: "2026-07-01",
		Qty: 1, Given: true, Value: 9_000_000_000_000, AssetAccount: se.asset.Id, OffsetAccount: se.cogs.Id,
	}
	huge := stockMoveInput{
		Product: se.widget.Id, Kind: stockKindAdjustment, Source: "books_inventory_adjustments",
		Document: "adjust000000001", Date: "2026-07-02", Qty: 10_000_000,
		AssetAccount: se.asset.Id, OffsetAccount: se.cogs.Id,
	}
	requireRefused(t, se.moveStock(t, tiny, huge), "The value of Widget is too large to keep on 2026-07-02.")
	if n, _ := se.app.CountRecords(stockMovesCollection); n != 0 {
		t.Errorf("%d stock moves stayed after the refusal, want none", n)
	}
}

func TestStockRefusal_AMoveThatIsNotFoundIsAFault(t *testing.T) {
	product := core.NewRecord(core.NewBaseCollection("books_products"))
	product.Set("name", "Widget")
	cause := &costingError{MoveID: "gone", Reason: costReasonNoStockToRevalue}
	err := stockRefusal(product, nil, cause)
	var refused *costingError
	if !errors.As(err, &refused) {
		t.Fatalf("err = %v, want it to wrap the costingError", err)
	}
	var sentence *router.ApiError
	if errors.As(err, &sentence) {
		t.Errorf("a move that is not found was refused with a sentence: %v", err)
	}
}

func TestRecomputeStock_RefusesARevaluationWithNoStock(t *testing.T) {
	se := newStockEnv(t)
	revaluation := stockMoveInput{
		Product: se.widget.Id, Kind: stockKindAdjustment, Source: "books_inventory_adjustments",
		Document: "adjust000000001", Date: "2026-07-01", Given: true, Value: 100,
		AssetAccount: se.asset.Id, OffsetAccount: se.cogs.Id,
	}
	requireRefused(t, se.moveStock(t, revaluation), "Widget has no stock to revalue on 2026-07-01.")
	if n, _ := se.app.CountRecords(stockMovesCollection); n != 0 {
		t.Errorf("%d stock moves stayed after the refusal, want none", n)
	}
}
