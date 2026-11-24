package books

import (
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// ADR 3: the inventory migration (2100000038) adds the stock rows, the
// inventory adjustments, the Inventory fields of a product and the costing
// method of the company.
func TestInventorySchema(t *testing.T) {
	app := newBooksApp(t)

	// Only Books writes the stock rows: no API rule lets a request write one.
	for _, name := range []string{"books_stock_moves", "books_stock_layers"} {
		col, err := app.FindCollectionByNameOrId(name)
		if err != nil {
			t.Fatalf("collection %s: %v", name, err)
		}
		if col.ListRule == nil || col.ViewRule == nil {
			t.Errorf("%s has no list or view rule, want every Books reader to read it", name)
		}
		if col.CreateRule != nil || col.UpdateRule != nil || col.DeleteRule != nil {
			t.Errorf("%s has a create, update or delete rule, want none", name)
		}
	}
	for _, name := range []string{"books_inventory_adjustments", "books_inventory_adjustment_lines"} {
		col, err := app.FindCollectionByNameOrId(name)
		if err != nil {
			t.Fatalf("collection %s: %v", name, err)
		}
		if col.CreateRule == nil || col.UpdateRule == nil || col.DeleteRule == nil {
			t.Errorf("%s lacks a create, update or delete rule, want a writer to write a draft", name)
		}
	}

	products, err := app.FindCollectionByNameOrId("books_products")
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{
		"asset_account", "preferred_vendor", "reorder_point", "opening_quantity", "opening_value", "opening_date",
		"quantity_on_hand", "stock_value",
	} {
		if products.Fields.GetByName(field) == nil {
			t.Errorf("books_products has no %s field", field)
		}
	}
	types, ok := products.Fields.GetByName("type").(*core.SelectField)
	if !ok || !slices.Contains(types.Values, "inventory") {
		t.Errorf("books_products.type does not hold inventory")
	}

	row, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		t.Fatal(err)
	}
	if row.GetString("costing_method") != "fifo" || row.GetBool("costing_locked") {
		t.Errorf("settings start with method %q locked %v, want fifo and not locked",
			row.GetString("costing_method"), row.GetBool("costing_locked"))
	}
	method, ok := row.Collection().Fields.GetByName("costing_method").(*core.SelectField)
	if !ok || !slices.Equal(method.Values, []string{"fifo", "average"}) {
		t.Errorf("books_settings.costing_method is not a select of fifo and average")
	}
}

// The layer index holds the order every read of a product's layers sorts by
// (stockLayerOrder), so the sort needs no step of its own.
func TestInventorySchema_TheLayerIndexHoldsTheReadOrder(t *testing.T) {
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId(stockLayersCollection)
	if err != nil {
		t.Fatal(err)
	}
	if stockLayerOrder != "date,position" {
		t.Fatalf("stockLayerOrder is %q: change the index and this test with it", stockLayerOrder)
	}
	want := "CREATE INDEX idx_books_stock_layers_product ON books_stock_layers (product, date, position)"
	if !slices.Contains(col.Indexes, want) {
		t.Errorf("books_stock_layers indexes %q, want %q", col.Indexes, want)
	}
}

// A stock move's seq orders the moves of one day; two moves never share one.
func TestInventorySchema_AStockMoveSeqIsUnique(t *testing.T) {
	env := newLedgerEnv(t)
	widget, err := saveNew(env.app, "books_products", map[string]any{
		"type": "inventory", "name": "Widget", "income_account": env.revenue.Id,
	})
	if err != nil {
		t.Fatalf("save an Inventory product: %v", err)
	}
	move := map[string]any{
		"product": widget.Id, "date": "2026-03-01", "seq": 1, "kind": "receipt",
		"source": "books_bills", "document": "bill00000000001", "quantity": 1,
		"asset_account": env.checking.Id, "offset_account": env.rent.Id,
	}
	if _, err := saveNew(env.app, "books_stock_moves", move); err != nil {
		t.Fatalf("save the first move: %v", err)
	}
	if _, err := saveNew(env.app, "books_stock_moves", move); err == nil {
		t.Fatal("a second move with seq 1 saved, want the unique index to refuse it")
	}
}
