package books

import (
	"fmt"
	"net/http"
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

// newCLIStockEnv is a cliBankEnv with batch writes on and one Inventory item.
func newCLIStockEnv(t *testing.T) (*cliBankEnv, *core.Record) {
	t.Helper()
	env := newCLIBankEnv(t)
	enableBatch(t, env.app)
	mkAccount(t, env.app, "Inventory asset", "other_current_asset", "inventory")
	mkAccount(t, env.app, "Cost of goods sold", "cost_of_goods_sold", "supplies_materials")
	widget, err := newProduct(env.app, map[string]any{"type": "inventory", "name": "Widget", "income_account": env.revenue.Id, "cost": 500})
	if err != nil {
		t.Fatal(err)
	}
	return env, widget
}

// The writes of `tinycld books inventory-adjustments` (the document engine of
// the CLI with the entry of cli/documents.json), sent to the real PocketBase
// API with an access token. A batch here is a copy of what
// cli/document_adjust_test.go asserts: when one changes, change the other.
func TestCLIInventory_ATokenAddsPostsAndVoidsAnAdjustment(t *testing.T) {
	env, widget := newCLIStockEnv(t)
	const id = "cliadjust000001"
	one := collectionURL(inventoryAdjustmentsCollection) + "/" + id
	batch := func(auth string, ops ...string) apiAnswer {
		return env.call(t, auth, http.MethodPost, "/api/batch", batchBody(ops...))
	}
	header := cliOp("POST", inventoryAdjustmentsCollection, "", `{"date":"2026-09-05","id":"`+id+`","kind":"manual","memo":"count","status":"draft"}`)
	post := cliOp("PATCH", inventoryAdjustmentsCollection, id, `{"status":"posted"}`)
	row := func(position int, fields string) string {
		return rowOp(inventoryAdjustmentLinesCollection, "adjustment", id, position, fmt.Sprintf(`"product":%q,%s`, widget.Id, fields))
	}
	// `add --post`: the header, the lines and the post in one batch. A line
	// that takes stock out and states a value refuses the whole batch.
	batch(env.reader, header).requireStatus(t, http.StatusForbidden)
	batch(env.writer, header, row(0, `"quantity":-2,"value":-100`), post).
		requireStatus(t, http.StatusBadRequest)
	env.call(t, env.writer, http.MethodGet, one, "").requireStatus(t, http.StatusNotFound)
	batch(env.writer, header, row(0, `"quantity":10,"value":5000`), row(1, `"quantity":-2.5`), post).requireStatus(t, http.StatusOK)
	posted := env.call(t, env.writer, http.MethodGet, one, "")
	posted.requireStatus(t, http.StatusOK)
	if got := posted.json(t); got["status"] != "posted" || got["number"] != "IA-1" || got["entry"] == "" || got["account"] == "" {
		t.Errorf("the posted adjustment = %s", posted.body)
	}
	// The lines `show` reads, and the stock that `inventory moves`, `inventory
	// layers` and `products show` print.
	if rows := env.list(t, inventoryAdjustmentLinesCollection, `adjustment = "`+id+`"`, "position,id").items(t); len(rows) != 2 || rows[1]["quantity"] != -2.5 {
		t.Errorf("the lines = %v", rows)
	}
	moves := env.list(t, "books_stock_moves", fmt.Sprintf(`product = %q && kind = "adjustment"`, widget.Id), "-date,-seq,id").items(t)
	if len(moves) != 2 || moves[0]["quantity"] != -2.5 || moves[0]["value"] != float64(-1250) || moves[0]["quantity_after"] != 7.5 || moves[0]["value_after"] != float64(3750) {
		t.Errorf("the moves = %v", moves)
	}
	if layers := env.list(t, "books_stock_layers", fmt.Sprintf(`product = %q`, widget.Id), cliLayerSort).items(t); len(layers) != 1 || layers[0]["quantity"] != 7.5 {
		t.Errorf("the layers = %v", layers)
	}
	product := env.call(t, env.reader, http.MethodGet, collectionURL("books_products")+"/"+widget.Id, "").json(t)
	if product["quantity_on_hand"] != 7.5 || product["stock_value"] != float64(3750) {
		t.Errorf("the stock of the item = %v, %v", product["quantity_on_hand"], product["stock_value"])
	}
	// A posted adjustment takes one change, the void: the CLI's `edit` and
	// `delete` read the status and do not send these.
	env.call(t, env.writer, http.MethodPatch, one, `{"memo":"x"}`).requireStatus(t, http.StatusNotFound)
	env.call(t, env.writer, http.MethodDelete, one, "").requireStatus(t, http.StatusNotFound)
	env.call(t, env.reader, http.MethodPatch, one, `{"status":"void"}`).requireStatus(t, http.StatusForbidden)
	env.call(t, env.writer, http.MethodPatch, one, `{"status":"void"}`).requireStatus(t, http.StatusOK)
	if moves := env.list(t, "books_stock_moves", fmt.Sprintf(`product = %q`, widget.Id), "-date,-seq,id").items(t); len(moves) != 0 {
		t.Errorf("the moves after the void = %v", moves)
	}
}

// A caller creates a draft of the kind manual only, and changes a draft in
// place with no revision.
func TestCLIInventory_ATokenChangesADraftAdjustment(t *testing.T) {
	env := newCLIBankEnv(t)
	adjustments := collectionURL(inventoryAdjustmentsCollection)
	draft := func(id, kind, status string) string {
		return fmt.Sprintf(`{"date":"2026-09-05","id":%q,"kind":%q,"status":%q}`, id, kind, status)
	}
	env.call(t, env.writer, http.MethodPost, adjustments, draft("cliadjust000002", "manual", "posted")).requireStatus(t, http.StatusBadRequest)
	env.call(t, env.writer, http.MethodPost, adjustments, draft("cliadjust000002", "opening", "draft")).requireStatus(t, http.StatusBadRequest)
	env.call(t, env.writer, http.MethodPost, adjustments, draft("cliadjust000002", "manual", "draft")).requireStatus(t, http.StatusOK)
	edited := env.call(t, env.writer, http.MethodPatch, adjustments+"/cliadjust000002", `{"memo":"stock count"}`)
	edited.requireStatus(t, http.StatusOK)
	if got := edited.json(t); got["memo"] != "stock count" || got["status"] != "draft" {
		t.Errorf("the edited draft = %s", edited.body)
	}
	// A post with no line is refused.
	env.call(t, env.writer, http.MethodPatch, adjustments+"/cliadjust000002", `{"status":"posted"}`).requireRefusal(t, "Add a line to the inventory adjustment.")
	env.call(t, env.writer, http.MethodDelete, adjustments+"/cliadjust000002", "").requireStatus(t, http.StatusNoContent)
}

// `edit` of a draft with `lines`: the stored row is updated, the new row is
// created, then the header, in one batch with no revision
// (TestInventoryAdjustmentEditOfADraftChangesItsLines of the CLI asserts the
// same writes). The new row has a value and no quantity: it changes the value
// of the stock only.
func TestCLIInventory_ATokenChangesTheLinesOfADraft(t *testing.T) {
	env, widget := newCLIStockEnv(t)
	const id, lines = "cliadjust000003", inventoryAdjustmentLinesCollection
	one := collectionURL(inventoryAdjustmentsCollection) + "/" + id
	batch := func(ops ...string) apiAnswer {
		return env.call(t, env.writer, http.MethodPost, "/api/batch", batchBody(ops...))
	}
	batch(
		cliOp("POST", inventoryAdjustmentsCollection, "", `{"date":"2026-09-05","id":"`+id+`","kind":"manual","status":"draft"}`),
		cliOp("POST", lines, "", fmt.Sprintf(`{"adjustment":%q,"id":"cliadjline00001","position":0,"product":%q,"quantity":10,"value":5000}`, id, widget.Id)),
	).requireStatus(t, http.StatusOK)
	batch(
		rowUpdateOp(lines, "cliadjline00001", fmt.Sprintf(`"position":0,"product":%q,"quantity":12,"value":6000`, widget.Id)),
		cliOp("POST", lines, "", fmt.Sprintf(`{"adjustment":%q,"id":"cliadjline00002","position":1,"product":%q,"value":-300}`, id, widget.Id)),
		cliOp("PATCH", inventoryAdjustmentsCollection, id, `{"memo":"stock count"}`),
	).requireStatus(t, http.StatusOK)
	rows := env.list(t, lines, `adjustment = "`+id+`"`, "position,id").items(t)
	if len(rows) != 2 || rows[0]["quantity"] != float64(12) || rows[0]["value"] != float64(6000) || rows[1]["quantity"] != float64(0) || rows[1]["value"] != float64(-300) {
		t.Errorf("the lines of the draft = %v", rows)
	}
	env.call(t, env.writer, http.MethodPatch, one, `{"status":"posted"}`).requireStatus(t, http.StatusOK)
	product := env.call(t, env.reader, http.MethodGet, collectionURL("books_products")+"/"+widget.Id, "").json(t)
	if product["quantity_on_hand"] != float64(12) || product["stock_value"] != float64(5700) {
		t.Errorf("the stock of the item = %v for %v, want 12 for 5700", product["quantity_on_hand"], product["stock_value"])
	}
}
