package books

import (
	"slices"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// cli/inventory.go declares the fields of its two lists in Go, so
// TestCLIResources_MatchTheCollections does not see them. Each one must be a
// field of its collection that the API sends. When a list gains a field, add
// it here.
func TestCLIInventory_DeclaredFieldsAreOnTheCollections(t *testing.T) {
	app := newBooksApp(t)
	for collection, fields := range map[string][]string{
		"books_stock_moves":  {"product", "date", "seq", "kind", "source", "document", "line", "quantity", "value", "quantity_after", "value_after", "asset_account", "offset_account", "currency"},
		"books_stock_layers": {"product", "move", "date", "quantity", "value", "position", "currency"},
	} {
		col, err := app.FindCollectionByNameOrId(collection)
		if err != nil {
			t.Errorf("%s: %v", collection, err)
			continue
		}
		for _, name := range fields {
			if f := col.Fields.GetByName(name); f == nil || f.GetHidden() {
				t.Errorf("%s has no field %q that the API sends, and the CLI reads it", collection, name)
			}
		}
	}
	col, err := app.FindCollectionByNameOrId("books_stock_moves")
	if err != nil {
		t.Fatal(err)
	}
	kinds := []string{"opening", "receipt", "sale", "customer_return", "vendor_return", "adjustment"}
	if sel, ok := col.Fields.GetByName("kind").(*core.SelectField); !ok || !slices.Equal(sel.Values, kinds) {
		t.Errorf("books_stock_moves.kind: the CLI states %v, the collection has %v", kinds, sel)
	}
}

// cliLayerSort is the sort of `inventory layers` (cli/inventory.go).
const cliLayerSort = "product,date,position,id"

// `inventory layers` says that Books takes stock out from the first layer it
// prints. With FIFO, a receipt that is recorded later with an earlier date is
// the first: the position of a layer is the seq of its move, so the date
// comes before it in the sort.
func TestCLIInventory_LayersPrintInTheOrderStockGoesOut(t *testing.T) {
	se := newStockEnv(t)
	setCostingMethod(t, se.app, costingFIFO)
	se.mustMoveStock(t, se.receipt("bill00000000001", "2026-07-02", 10, 2000))
	se.mustMoveStock(t, se.receipt("bill00000000002", "2026-07-01", 10, 1000))
	rows, err := se.app.FindRecordsByFilter(stockLayersCollection, "product = {:p}", cliLayerSort, 0, 0, dbx.Params{"p": se.widget.Id})
	if err != nil || len(rows) != 2 {
		t.Fatalf("layers = %v, %v; want 2", rows, err)
	}
	if rows[0].GetString("date") != "2026-07-01" || rows[0].GetInt("position") <= rows[1].GetInt("position") {
		t.Errorf("the first layer is of %s at position %d, the second at %d; want the back-dated receipt first, with the higher position",
			rows[0].GetString("date"), rows[0].GetInt("position"), rows[1].GetInt("position"))
	}
	move, err := se.app.FindRecordById(stockMovesCollection, rows[0].GetString("move"))
	if err != nil || move.GetInt("seq") != rows[0].GetInt("position") {
		t.Errorf("the position of a layer = %d, want the seq of its move (%v, %v)", rows[0].GetInt("position"), move, err)
	}
	se.mustMoveStock(t, se.sold("invoice00000001", "2026-07-03", 4))
	if got := moveValue(t, se.app, "invoice00000001"); got != -400 {
		t.Errorf("the sale took %d of value, want -400: 4 of the back-dated receipt", got)
	}
}

// With average cost, an item has one layer, and it names no move.
func TestCLIInventory_AverageCostHasOneLayerWithNoMove(t *testing.T) {
	se := newStockEnv(t)
	setCostingMethod(t, se.app, costingAverage)
	se.mustMoveStock(t,
		se.receipt("bill00000000001", "2026-07-01", 10, 1000),
		se.receipt("bill00000000002", "2026-07-02", 10, 2000),
	)
	rows, err := se.app.FindRecordsByFilter(stockLayersCollection, "product = {:p}", cliLayerSort, 0, 0, dbx.Params{"p": se.widget.Id})
	if err != nil || len(rows) != 1 {
		t.Fatalf("layers = %v, %v; want 1", rows, err)
	}
	if l := rows[0]; l.GetString("move") != "" || l.GetString("date") != "" || l.GetInt("position") != 0 || l.GetFloat("quantity") != 20 || l.GetInt("value") != 3000 {
		t.Errorf("the layer = move %q, date %q, position %d, %v for %d; want no move, no date, position 0, 20 for 3000",
			l.GetString("move"), l.GetString("date"), l.GetInt("position"), l.GetFloat("quantity"), l.GetInt("value"))
	}
}
