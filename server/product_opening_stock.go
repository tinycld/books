package books

import (
	"fmt"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// What the write of an Inventory item posts (books design, "Inventory"): its
// opening stock, as an opening inventory adjustment, and the re-costs of a
// change of its purchase cost. product_stock.go holds the item's rules.

// productActors holds the person whose request writes a product, so the
// opening adjustment and the re-costs that write posts name them. The key is
// the request's own record (the *core.Record the model hooks get), not the
// product id: two requests that write one product at a time each keep their
// own person. A Go caller and a superuser leave no mark: what their write
// posts names no one.
var productActors sync.Map

// stampProductActor is the request hook of a product's create and update.
func stampProductActor(e *core.RecordRequestEvent) error {
	if e.Auth != nil && !e.Auth.IsSuperuser() {
		productActors.Store(e.Record, e.Auth.Id)
		defer productActors.Delete(e.Record)
	}
	return e.Next()
}

func productActor(r *core.Record) string {
	if id, ok := productActors.Load(r); ok {
		return id.(string)
	}
	return ""
}

// syncOpeningStock makes the opening inventory adjustment of item r say what
// r's opening fields say: the posted one, if any, is voided, and an item with
// an opening quantity gets a new one, dated the opening date, of the opening
// quantity at the opening value against Opening Balance Equity. It posts and
// voids as the person whose request writes the product. The adjustment replays
// the item, which writes quantity_on_hand and stock_value on the stored row;
// r, which the caller's save writes after, takes them.
func syncOpeningStock(tx core.App, r *core.Record) error {
	actor := productActor(r)
	posted, err := tx.FindRecordsByFilter(inventoryAdjustmentsCollection,
		"source = 'books_products' && document = {:product} && kind = {:kind} && status = {:posted}", "", 0, 0,
		dbx.Params{"product": r.Id, "kind": adjustmentKindOpening, "posted": statusPosted})
	if err != nil {
		return fmt.Errorf("books: read the item's opening adjustment: %w", err)
	}
	qty := r.GetFloat("opening_quantity")
	replaces := ""
	for _, old := range posted {
		// The new adjustment takes the old one's place in one replay, so a
		// document after the opening stock is re-costed once.
		if qty > 0 && replaces == "" {
			replaces = old.Id
			continue
		}
		if err := voidSystemAdjustment(tx, old, actor, time.Now()); err != nil {
			return err
		}
	}
	if qty > 0 {
		_, err := newSystemAdjustment(tx, systemAdjustment{
			Kind: adjustmentKindOpening, Date: r.GetString("opening_date"), Actor: actor,
			Source: "books_products", Document: r.Id, Memo: "Opening stock of " + r.GetString("name"),
			Replaces: replaces,
			// The default bin of this save: the stored row still holds the
			// one before it (spec §3.1, the bin at the time it posts).
			Lines: []adjustmentLineInput{{
				Product: r.Id, Quantity: qty, Value: int64(r.GetInt("opening_value")), Bin: r.GetString("default_bin"),
			}},
		})
		if err != nil {
			return err
		}
	}
	return takeStockTotals(tx, r)
}

// takeStockTotals gives r, which the caller's save writes next, the totals the
// store wrote on the stored row in this transaction, and the low-stock answer
// of its quantity on hand.
func takeStockTotals(tx core.App, r *core.Record) error {
	fresh, err := tx.FindRecordById("books_products", r.Id)
	if err != nil {
		return fmt.Errorf("books: read the item after its stock replay: %w", err)
	}
	r.Set("quantity_on_hand", fresh.GetFloat("quantity_on_hand"))
	r.Set("stock_value", fresh.GetInt("stock_value"))
	// By r's reorder point: the write may change it too.
	r.Set("low_stock", isLowStock(r.GetFloat("reorder_point"), fresh.GetFloat("quantity_on_hand")))
	return nil
}

// The purchase cost of an item is the last known cost of an item with no
// stock-in yet: it prices an oversold removal and a stock-in with a quantity
// only. So a write that changes it replays the item and posts the re-costs
// itself (storeItemCost, then recostForCost). Without that, the next document
// of the item would post them, by a person who did not make the change.

// itemHasStockMoves reports whether any stock move names the item.
func itemHasStockMoves(tx core.App, id string) (bool, error) {
	n, err := tx.CountRecords(stockMovesCollection, dbx.HashExp{"product": id})
	if err != nil {
		return false, fmt.Errorf("books: count the item's stock moves: %w", err)
	}
	return n > 0, nil
}

// storeItemCost writes the new cost of r on the stored row before r's own
// save, because a replay reads the stored row. stored is the row before the
// write. An item with no stock move has nothing to replay.
func storeItemCost(tx core.App, stored, r *core.Record) error {
	moved, err := itemHasStockMoves(tx, r.Id)
	if err != nil || !moved {
		return err
	}
	stored.Set("cost", r.GetInt("cost"))
	release := setTxMark(tx, markStockWrite, r.Id)
	err = tx.Save(stored)
	release()
	if err != nil {
		return fmt.Errorf("books: write the item's cost before its replay: %w", err)
	}
	return nil
}

// recostForCost replays item r, whose new cost is stored (storeItemCost), and
// posts the re-cost of each posted document whose cost the change moved, as
// the person whose request writes the item. After a replay in this write
// (syncOpeningStock) it finds nothing left to post.
func recostForCost(tx core.App, r *core.Record) error {
	moved, err := itemHasStockMoves(tx, r.Id)
	if err != nil || !moved {
		return err
	}
	products := []string{r.Id}
	if err := recomputeStock(tx, products); err != nil {
		return err
	}
	if err := recostDrifted(tx, productActor(r), todayUTC(time.Now()), products); err != nil {
		return err
	}
	return takeStockTotals(tx, r)
}
