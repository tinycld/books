package books

import (
	"errors"
	"fmt"
	"math"
	"slices"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The stock rows (pb-migrations/2100000038_create_books_inventory.js). A stock move is one line of a
// posted document that moves the stock of an Inventory product. Only this
// file writes books_stock_moves, books_stock_layers and a product's
// quantity_on_hand and stock_value. Every function here runs inside the
// caller's posting transaction (serialized), so no post commits between a
// replay and the rows it writes.

const (
	stockMovesCollection  = "books_stock_moves"
	stockLayersCollection = "books_stock_layers"
)

// The kinds of a stock move.
const (
	stockKindOpening        = "opening"
	stockKindReceipt        = "receipt"
	stockKindSale           = "sale"
	stockKindCustomerReturn = "customer_return"
	stockKindVendorReturn   = "vendor_return"
	stockKindAdjustment     = "adjustment"
)

// The tx marks of the two rows this file writes that have a guard of their
// own (txmarks.go): the product whose stock a replay writes, and the settings
// row while the first move locks the costing method.
const (
	markStockWrite  = "books.stock.write"
	markCostingLock = "books.costing.lock"
)

// Refusal texts of a replay: the product's name, then the day of the move
// that cannot be costed.
const (
	msgNoStockToRevalue    = "%s has no stock to revalue on %s."
	msgStockValueBelowZero = "The value of %s cannot go below zero on %s."
	msgStockNotInventory   = "%s is not an Inventory item."
)

// stockMoveInput is a move a document asks for. Qty is in hundredths of a
// unit, signed (costMove). Source is the document's collection, Document its
// id and Line its line's id. A Given move carries Value; the engine prices
// every other one, a return at the cost of the removal ReturnOf names (a stock
// move's id). AssetAccount is the product's inventory asset account and
// OffsetAccount the other side of the move's value (cost of goods sold, or an
// adjustment's account), both as they are when the document posts.
type stockMoveInput struct {
	Product, Kind, Source, Document, Line, Date string
	Qty                                         int64
	Given                                       bool
	Value                                       int64
	ReturnOf, AssetAccount, OffsetAccount       string
}

// qtyHundredths is a stored quantity (a number with at most 2 decimals) in
// hundredths of a unit.
func qtyHundredths(q float64) int64 {
	return int64(math.Round(q * 100))
}

// qtyFromHundredths is the stored form of a quantity in hundredths.
func qtyFromHundredths(h int64) float64 {
	return float64(h) / 100
}

// addStockMoves writes the moves, in order, after every move already stored.
// Their value is 0 until recomputeStock prices them. The first move ever
// locks the costing method. Each product must be an Inventory item.
func addStockMoves(tx core.App, moves []stockMoveInput) error {
	if len(moves) == 0 {
		return nil
	}
	if err := lockCostingMethod(tx); err != nil {
		return err
	}
	s, err := loadSettings(tx)
	if err != nil {
		return err
	}
	var seq int
	if err := tx.DB().NewQuery("SELECT CAST(COALESCE(MAX(seq), 0) AS INTEGER) FROM " + stockMovesCollection).Row(&seq); err != nil {
		return fmt.Errorf("books: read the last stock move: %w", err)
	}
	col, err := tx.FindCachedCollectionByNameOrId(stockMovesCollection)
	if err != nil {
		return err
	}
	for i, m := range moves {
		product, err := tx.FindRecordById("books_products", m.Product)
		if err != nil {
			return fmt.Errorf("books: read the product of a stock move: %w", err)
		}
		if product.GetString("type") != "inventory" {
			return refuseNamed(msgStockNotInventory, product.GetString("name"))
		}
		r := core.NewRecord(col)
		r.Set("product", m.Product)
		r.Set("date", m.Date)
		r.Set("seq", seq+i+1)
		r.Set("kind", m.Kind)
		r.Set("source", m.Source)
		r.Set("document", m.Document)
		r.Set("line", m.Line)
		r.Set("quantity", qtyFromHundredths(m.Qty))
		r.Set("given", m.Given)
		if m.Given {
			r.Set("given_value", m.Value)
		}
		r.Set("return_of", m.ReturnOf)
		r.Set("asset_account", m.AssetAccount)
		r.Set("offset_account", m.OffsetAccount)
		r.Set("currency", s.Currency)
		if err := tx.Save(r); err != nil {
			return fmt.Errorf("books: write a stock move: %w", err)
		}
	}
	return nil
}

// lockCostingMethod sets books_settings.costing_locked the first time a stock
// move is written. Nothing clears it: a void removes the move, not the lock.
func lockCostingMethod(tx core.App) error {
	row, err := tx.FindRecordById("books_settings", settingsID)
	if err != nil {
		return fmt.Errorf("books: read settings: %w", err)
	}
	if row.GetBool("costing_locked") {
		return nil
	}
	defer setTxMark(tx, markCostingLock, settingsID)()
	row.Set("costing_locked", true)
	if err := tx.Save(row); err != nil {
		return fmt.Errorf("books: lock the costing method: %w", err)
	}
	return nil
}

// documentStockMoves are the moves of one document, in their order.
func documentStockMoves(tx core.App, source, document string) ([]*core.Record, error) {
	moves, err := tx.FindRecordsByFilter(stockMovesCollection, "source = {:source} && document = {:document}", "seq", 0, 0,
		dbx.Params{"source": source, "document": document})
	if err != nil {
		return nil, fmt.Errorf("books: read the stock moves of %s %s: %w", source, document, err)
	}
	return moves, nil
}

// removeStockMoves deletes the moves of one document (its void, or the
// replacement of its moves) and answers the products they moved, which the
// caller must replay.
func removeStockMoves(tx core.App, source, document string) ([]string, error) {
	moves, err := documentStockMoves(tx, source, document)
	if err != nil {
		return nil, err
	}
	var products []string
	for _, m := range moves {
		if id := m.GetString("product"); !slices.Contains(products, id) {
			products = append(products, id)
		}
	}
	// The layers that name a removed move go first: the replay writes the
	// product's layers again.
	for _, product := range products {
		if err := deleteStockLayers(tx, product); err != nil {
			return nil, err
		}
	}
	for _, m := range moves {
		if err := tx.Delete(m); err != nil {
			return nil, fmt.Errorf("books: delete a stock move: %w", err)
		}
	}
	return products, nil
}

func deleteStockLayers(tx core.App, product string) error {
	layers, err := tx.FindRecordsByFilter(stockLayersCollection, "product = {:product}", "position", 0, 0,
		dbx.Params{"product": product})
	if err != nil {
		return fmt.Errorf("books: read the stock layers of %s: %w", product, err)
	}
	for _, l := range layers {
		if err := tx.Delete(l); err != nil {
			return fmt.Errorf("books: delete a stock layer: %w", err)
		}
	}
	return nil
}

// recomputeStock replays every move of each product under the company's
// costing method and writes what changed: each move's value and the stock
// after it, the product's open layers, and its quantity on hand and stock
// value. It does not touch posted_value: driftedStockMoves then answers the
// moves whose value the ledger does not hold yet. A move the engine cannot
// price refuses the whole transaction with a text a person can act on.
func recomputeStock(tx core.App, products []string) error {
	row, err := tx.FindRecordById("books_settings", settingsID)
	if err != nil {
		return fmt.Errorf("books: read settings: %w", err)
	}
	method := row.GetString("costing_method")
	seen := map[string]bool{}
	for _, id := range products {
		if seen[id] {
			continue
		}
		seen[id] = true
		if err := recomputeProductStock(tx, method, id); err != nil {
			return err
		}
	}
	return nil
}

func recomputeProductStock(tx core.App, method, productID string) error {
	product, err := tx.FindRecordById("books_products", productID)
	if err != nil {
		return fmt.Errorf("books: read the product to replay: %w", err)
	}
	rows, err := tx.FindRecordsByFilter(stockMovesCollection, "product = {:product}", "date,seq", 0, 0,
		dbx.Params{"product": productID})
	if err != nil {
		return fmt.Errorf("books: read the stock moves of %s: %w", productID, err)
	}
	moves := make([]costMove, len(rows))
	byID := make(map[string]*core.Record, len(rows))
	for i, r := range rows {
		byID[r.Id] = r
		moves[i] = costMove{
			ID:       r.Id,
			Qty:      qtyHundredths(r.GetFloat("quantity")),
			Given:    r.GetBool("given"),
			Value:    int64(r.GetInt("given_value")),
			ReturnOf: r.GetString("return_of"),
		}
	}
	result, err := runCosting(method, int64(product.GetInt("cost")), moves)
	var refused *costingError
	if errors.As(err, &refused) {
		return stockRefusal(product, byID[refused.MoveID], refused)
	}
	if err != nil {
		return err
	}
	for _, r := range rows {
		value := result.Values[r.Id]
		qtyAfter := qtyFromHundredths(result.QtyAfter[r.Id])
		valueAfter := result.ValueAfter[r.Id]
		if int64(r.GetInt("value")) == value && r.GetFloat("quantity_after") == qtyAfter &&
			int64(r.GetInt("value_after")) == valueAfter {
			continue
		}
		r.Set("value", value)
		r.Set("quantity_after", qtyAfter)
		r.Set("value_after", valueAfter)
		if err := tx.Save(r); err != nil {
			return fmt.Errorf("books: write the value of a stock move: %w", err)
		}
	}
	if err := writeStockLayers(tx, product, byID, result.Layers); err != nil {
		return err
	}
	qty := qtyFromHundredths(result.Qty)
	if product.GetFloat("quantity_on_hand") == qty && int64(product.GetInt("stock_value")) == result.Value {
		return nil
	}
	defer setTxMark(tx, markStockWrite, product.Id)()
	product.Set("quantity_on_hand", qty)
	product.Set("stock_value", result.Value)
	if err := tx.Save(product); err != nil {
		return fmt.Errorf("books: write the stock of %s: %w", product.GetString("name"), err)
	}
	return nil
}

// stockRefusal is the refusal of a move the engine cannot price. The two
// revaluation reasons are a person's to fix; any other is a move Books should
// never have written.
func stockRefusal(product, move *core.Record, refused *costingError) error {
	name, day := product.GetString("name"), ""
	if move != nil {
		day = move.GetString("date")
	}
	switch refused.Reason {
	case costReasonNoStockToRevalue:
		return refuseNamed(msgNoStockToRevalue, name, day)
	case costReasonValueBelowZero:
		return refuse(msgStockValueBelowZero, name, day)
	}
	return refused
}

// writeStockLayers replaces the product's layer rows when the open stock
// changed, and leaves them when it did not.
func writeStockLayers(tx core.App, product *core.Record, moves map[string]*core.Record, layers []costLayer) error {
	stored, err := tx.FindRecordsByFilter(stockLayersCollection, "product = {:product}", "position", 0, 0,
		dbx.Params{"product": product.Id})
	if err != nil {
		return fmt.Errorf("books: read the stock layers of %s: %w", product.Id, err)
	}
	same := len(stored) == len(layers)
	for i := 0; same && i < len(layers); i++ {
		same = stored[i].GetString("move") == layers[i].MoveID &&
			qtyHundredths(stored[i].GetFloat("quantity")) == layers[i].Qty &&
			int64(stored[i].GetInt("value")) == layers[i].Value
	}
	if same {
		return nil
	}
	for _, l := range stored {
		if err := tx.Delete(l); err != nil {
			return fmt.Errorf("books: delete a stock layer: %w", err)
		}
	}
	col, err := tx.FindCachedCollectionByNameOrId(stockLayersCollection)
	if err != nil {
		return err
	}
	for i, l := range layers {
		r := core.NewRecord(col)
		r.Set("product", product.Id)
		r.Set("move", l.MoveID)
		if move := moves[l.MoveID]; move != nil {
			r.Set("date", move.GetString("date"))
		}
		r.Set("quantity", qtyFromHundredths(l.Qty))
		r.Set("value", l.Value)
		r.Set("position", i)
		r.Set("currency", product.GetString("currency"))
		if err := tx.Save(r); err != nil {
			return fmt.Errorf("books: write a stock layer: %w", err)
		}
	}
	return nil
}

// driftedStockMoves are the moves of the products whose value differs from
// what the ledger holds for them, by document and then in their order.
func driftedStockMoves(tx core.App, products []string) ([]*core.Record, error) {
	if len(products) == 0 {
		return nil, nil
	}
	ids := make([]any, len(products))
	for i, id := range products {
		ids[i] = id
	}
	var moves []*core.Record
	err := tx.RecordQuery(stockMovesCollection).
		AndWhere(dbx.In("product", ids...)).
		AndWhere(dbx.NewExp("[[value]] != [[posted_value]]")).
		OrderBy("source ASC", "document ASC", "seq ASC").
		All(&moves)
	if err != nil {
		return nil, fmt.Errorf("books: read the stock moves to recost: %w", err)
	}
	return moves, nil
}

// markStockPosted records that the ledger now holds each move's value.
func markStockPosted(tx core.App, moves []*core.Record) error {
	for _, m := range moves {
		if m.GetInt("posted_value") == m.GetInt("value") {
			continue
		}
		m.Set("posted_value", m.GetInt("value"))
		if err := tx.Save(m); err != nil {
			return fmt.Errorf("books: mark a stock move posted: %w", err)
		}
	}
	return nil
}
