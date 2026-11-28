package books

import (
	"slices"
	"strings"
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

// Inventory-adjust spec §4: the bin migration (2100000049) adds the bins, their
// stock, the moves between bins, and the bin and correction fields.
func TestInventorySchema_Bins(t *testing.T) {
	app := newBooksApp(t)
	collection := func(name string) *core.Collection {
		t.Helper()
		col, err := app.FindCollectionByNameOrId(name)
		if err != nil {
			t.Fatalf("collection %s: %v", name, err)
		}
		return col
	}
	requireFields := func(col *core.Collection, fields ...string) {
		t.Helper()
		for _, field := range fields {
			if col.Fields.GetByName(field) == nil {
				t.Errorf("%s has no %s field", col.Name, field)
			}
		}
	}

	bins := collection(binsCollection)
	requireFields(bins, "name", "note", "inactive", "sort_key", "created", "updated")
	if bins.CreateRule == nil || bins.UpdateRule == nil || bins.DeleteRule == nil {
		t.Errorf("%s lacks a create, update or delete rule, want a writer to keep the list", bins.Name)
	}
	if !slices.Contains(bins.Indexes, "CREATE UNIQUE INDEX idx_books_bins_name ON books_bins (lower(name))") {
		t.Errorf("%s indexes %q, want the unique index on the lower-case name", bins.Name, bins.Indexes)
	}

	// Only Books writes the bin stock.
	stock := collection(binStockCollection)
	requireFields(stock, "product", "bin", "quantity")
	if stock.ListRule == nil || stock.ViewRule == nil {
		t.Errorf("%s has no list or view rule, want every Books reader to read it", stock.Name)
	}
	if stock.CreateRule != nil || stock.UpdateRule != nil || stock.DeleteRule != nil {
		t.Errorf("%s has a create, update or delete rule, want none", stock.Name)
	}
	if !slices.Contains(stock.Indexes, "CREATE UNIQUE INDEX idx_books_bin_stock_product_bin ON books_bin_stock (product, bin)") {
		t.Errorf("%s indexes %q, want one row for each item and bin", stock.Name, stock.Indexes)
	}

	// A move between bins is created and never edited or deleted.
	transfers := collection(binTransfersCollection)
	requireFields(transfers, "product", "from_bin", "to_bin", "quantity", "memo", "created_by", "created")
	if transfers.CreateRule == nil || transfers.UpdateRule != nil || transfers.DeleteRule != nil {
		t.Errorf("%s rules create %v update %v delete %v, want a create rule only",
			transfers.Name, transfers.CreateRule, transfers.UpdateRule, transfers.DeleteRule)
	}

	requireFields(collection("books_products"), "default_bin", "low_stock")
	requireFields(collection(inventoryAdjustmentLinesCollection), "bin")
	requireFields(collection(stockMovesCollection), "bin", "document_number")
	adjustments := collection(inventoryAdjustmentsCollection)
	requireFields(adjustments, "value_change", "replaces", "replaced_by")
	for _, server := range []string{"value_change", "replaced_by"} {
		unset := "@request.body." + server + ":isset = false"
		if adjustments.CreateRule == nil || !strings.Contains(*adjustments.CreateRule, unset) {
			t.Errorf("the adjustment create rule does not keep %s unset", server)
		}
		if adjustments.UpdateRule == nil || !strings.Contains(*adjustments.UpdateRule, unset) {
			t.Errorf("the adjustment update rule does not keep %s unchanged", server)
		}
	}
	if strings.Contains(*adjustments.CreateRule, "@request.body.replaces:isset") {
		t.Error("the adjustment create rule refuses replaces, want a correction to set it")
	}
	if !strings.Contains(*adjustments.UpdateRule, "@request.body.replaces:isset = false") {
		t.Error("the adjustment update rule lets replaces change, want it set at create only")
	}

	var n int
	if err := app.DB().NewQuery("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'fts_books_inventory_adjustments'").Row(&n); err != nil || n != 1 {
		t.Errorf("fts_books_inventory_adjustments: %d tables (err %v), want 1", n, err)
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
