package books

import (
	"errors"
	"fmt"
	"math"

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
	// stockLayerOrder sorts a product's layers oldest first (writeStockLayers).
	stockLayerOrder = "date,position"
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
	msgStockValueTooLarge  = "The value of %s is too large to keep on %s."
	msgStockNotInventory   = "%s is not an Inventory item."
)

// stockMoveInput is a move a document asks for. Qty is in hundredths of a
// unit, signed (costMove). Source is the document's collection, Document its
// id and Line its line's id. A Given move carries Value; the engine prices
// every other one, a return at the cost of the removal ReturnOf names (a stock
// move's id). AssetAccount is the product's inventory asset account and
// OffsetAccount the other side of the move's value (cost of goods sold, or an
// adjustment's account), both as they are when the document posts. Bin is the
// bin location the quantity goes to or comes from when BinNamed is set ("" is
// No bin); a move that names no bin takes the product's stored default bin as
// it is when the move is written, and No bin when it has none. A move whose
// product is saved in the same write (an item's opening stock) names the bin
// of that save, because the stored row still holds the old one.
type stockMoveInput struct {
	Product, Kind, Source, Document, Line, Date string
	Qty                                         int64
	Given                                       bool
	Value                                       int64
	ReturnOf, AssetAccount, OffsetAccount, Bin  string
	BinNamed                                    bool
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
	settingsRow, err := tx.FindRecordById("books_settings", settingsID)
	if err != nil {
		return fmt.Errorf("books: read settings: %w", err)
	}
	if err := lockCostingMethod(tx, settingsRow); err != nil {
		return err
	}
	currency := settingsRow.GetString("currency")
	var seq int
	if err := tx.DB().NewQuery("SELECT CAST(COALESCE(MAX(seq), 0) AS INTEGER) FROM books_stock_moves").Row(&seq); err != nil {
		return fmt.Errorf("books: read the last stock move: %w", err)
	}
	col, err := tx.FindCachedCollectionByNameOrId(stockMovesCollection)
	if err != nil {
		return err
	}
	ids := make([]string, len(moves))
	for i, m := range moves {
		ids[i] = m.Product
	}
	products, err := recordsByID(tx, "books_products", ids)
	if err != nil {
		return err
	}
	var binMoves binStockChanges
	for i, m := range moves {
		product, err := recordOf(products, m.Product)
		if err != nil {
			return fmt.Errorf("books: read the product of a stock move: %w", err)
		}
		if product.GetString("type") != "inventory" {
			return refuseNamed(msgStockNotInventory, product.GetString("name"))
		}
		bin := m.Bin
		if !m.BinNamed && bin == "" && m.Qty != 0 {
			bin = product.GetString("default_bin")
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
		r.Set("currency", currency)
		r.Set("bin", bin)
		if err := tx.Save(r); err != nil {
			return fmt.Errorf("books: write a stock move: %w", err)
		}
		binMoves.add(m.Product, bin, m.Qty)
	}
	return binMoves.write(tx)
}

// lockCostingMethod sets books_settings.costing_locked the first time a stock
// move is written. Nothing clears it: a void removes the move, not the lock.
func lockCostingMethod(tx core.App, row *core.Record) error {
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
// replacement of its moves) and answers the moves it deleted, so that a caller
// reads them no second time: stockMoveProducts names the products to replay.
func removeStockMoves(tx core.App, source, document string) ([]*core.Record, error) {
	moves, err := documentStockMoves(tx, source, document)
	if err != nil {
		return nil, err
	}
	products := stockMoveProducts(moves)
	// The layers that name a removed move go first: the replay writes the
	// product's layers again.
	for _, product := range products {
		if err := deleteStockLayers(tx, product); err != nil {
			return nil, err
		}
	}
	var binMoves binStockChanges
	for _, m := range moves {
		if err := tx.Delete(m); err != nil {
			return nil, fmt.Errorf("books: delete a stock move: %w", err)
		}
		// The quantity goes back to the bin the move went to, not to the
		// item's default bin of today.
		binMoves.add(m.GetString("product"), m.GetString("bin"), -qtyHundredths(m.GetFloat("quantity")))
	}
	if err := binMoves.write(tx); err != nil {
		return nil, err
	}
	return moves, nil
}

// maxDocumentNumber is the length books_stock_moves.document_number holds
// (pb-migrations/2100000049_create_books_bins.js), as the documents' own
// number fields do.
const maxDocumentNumber = 40

// stampStockMoveNumbers writes number on every stock move of the document (a
// row of the collection source) in one bound UPDATE
// (books_stock_moves.document_number). A document takes its number in its post
// after its moves are written (postDocument numbers the entry that holds their
// cost), so the moves get it here: one statement for the document, not one for
// each move (purchase_stock_cost_test.go). A number longer than the field holds
// is cut to maxDocumentNumber characters. A replay keeps the number
// (recomputeProductStock writes only the value columns).
func stampStockMoveNumbers(tx core.App, source, document, number string) error {
	_, err := tx.DB().NewQuery("UPDATE books_stock_moves SET document_number = {:number} WHERE source = {:source} AND document = {:document}").
		Bind(dbx.Params{"number": storedDocumentNumber(number), "source": source, "document": document}).
		Execute()
	if err != nil {
		return fmt.Errorf("books: write the document number of the stock moves of %s %s: %w", source, document, err)
	}
	return nil
}

// numberPostedMoves stamps the number of the posted document on its stock
// moves (stampStockMoveNumbers) and on moves, the records of them the post
// holds (postDocumentStock's answer). markStockPosted saved each of those
// records whose value is not 0 in this transaction, and PocketBase sends that
// realtime update after the commit with the record as it is then, so the
// update carries the number. The bound UPDATE sends no realtime event, so a
// move of value 0, which markStockPosted did not save, is saved here with its
// number: a client that holds it gets the number live too.
func numberPostedMoves(tx core.App, moves []*core.Record, source, document, number string) error {
	if len(moves) == 0 {
		return nil
	}
	if err := stampStockMoveNumbers(tx, source, document, number); err != nil {
		return err
	}
	for _, m := range moves {
		m.Set("document_number", storedDocumentNumber(number))
		if m.GetInt("value") != 0 {
			continue
		}
		if err := tx.SaveNoValidate(m); err != nil {
			return fmt.Errorf("books: write the document number of a stock move: %w", err)
		}
	}
	return nil
}

// storedDocumentNumber is number as books_stock_moves.document_number holds
// it: at most maxDocumentNumber characters.
func storedDocumentNumber(number string) string {
	if runes := []rune(number); len(runes) > maxDocumentNumber {
		return string(runes[:maxDocumentNumber])
	}
	return number
}

// stockMoveProducts are the products of moves, each once, in order.
func stockMoveProducts(moves []*core.Record) []string {
	var products []string
	for _, m := range moves {
		products = appendMissing(products, m.GetString("product"))
	}
	return products
}

func deleteStockLayers(tx core.App, product string) error {
	layers, err := tx.FindRecordsByFilter(stockLayersCollection, "product = {:product}", "", 0, 0,
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
	method, currency := row.GetString("costing_method"), row.GetString("currency")
	seen := map[string]bool{}
	for _, id := range products {
		if seen[id] {
			continue
		}
		seen[id] = true
		if err := recomputeProductStock(tx, method, currency, id); err != nil {
			return err
		}
	}
	return nil
}

func recomputeProductStock(tx core.App, method, currency, productID string) error {
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
	if err := writeStockLayers(tx, product, currency, byID, result.Layers); err != nil {
		return err
	}
	qty := qtyFromHundredths(result.Qty)
	low := isLowStock(product.GetFloat("reorder_point"), qty)
	if product.GetFloat("quantity_on_hand") == qty && int64(product.GetInt("stock_value")) == result.Value &&
		product.GetBool("low_stock") == low {
		return nil
	}
	defer setTxMark(tx, markStockWrite, product.Id)()
	product.Set("quantity_on_hand", qty)
	product.Set("stock_value", result.Value)
	product.Set("low_stock", low)
	if err := tx.Save(product); err != nil {
		return fmt.Errorf("books: write the stock of %s: %w", product.GetString("name"), err)
	}
	return nil
}

// isLowStock is the low-stock answer of an item (inventory-adjust spec §3.10):
// its reorder point is above 0 and its quantity on hand is at or below it. The
// quantity on purchase orders does not count.
func isLowStock(reorderPoint, onHand float64) bool {
	return reorderPoint > 0 && qtyHundredths(onHand) <= qtyHundredths(reorderPoint)
}

// stockRefusal is the refusal of a move the engine cannot price. The
// revaluation reasons and a value too large are a person's to fix; any other
// is a move Books should never have written. A move that is not among the
// product's rows is a fault too: a sentence would end "on .".
func stockRefusal(product, move *core.Record, refused *costingError) error {
	if move == nil {
		return fmt.Errorf("books: the stock move %s of %s is not among its moves: %w", refused.MoveID, product.Id, refused)
	}
	name, day := product.GetString("name"), move.GetString("date")
	switch refused.Reason {
	case costReasonNoStockToRevalue:
		return refuseNamed(msgNoStockToRevalue, name, day)
	case costReasonValueBelowZero:
		return refuse(msgStockValueBelowZero, name, day)
	case costReasonValueTooLarge:
		return refuse(msgStockValueTooLarge, name, day)
	}
	return refused
}

// writeStockLayers makes the product's layer rows hold layers, writing only
// the rows that changed: a row is the layer of one stock-in (the one layer of
// the average cost names none), so a removal at the end of the history writes
// the front layer it takes from, not every open one. A layer's position is
// the seq of its stock-in, which no other move changes, so a back-dated
// move writes only the layers whose data it changes. The replay orders moves
// by date, then seq: layers sort oldest first by date, then position.
func writeStockLayers(tx core.App, product *core.Record, currency string, moves map[string]*core.Record, layers []costLayer) error {
	rows, err := tx.FindRecordsByFilter(stockLayersCollection, "product = {:product}", stockLayerOrder, 0, 0,
		dbx.Params{"product": product.Id})
	if err != nil {
		return fmt.Errorf("books: read the stock layers of %s: %w", product.Id, err)
	}
	stored := make(map[string]*core.Record, len(rows))
	for _, r := range rows {
		stored[r.GetString("move")] = r
	}
	kept := make(map[string]bool, len(layers))
	var col *core.Collection
	for _, l := range layers {
		date, position := "", 0
		if move := moves[l.MoveID]; move != nil {
			date, position = move.GetString("date"), move.GetInt("seq")
		}
		qty := qtyFromHundredths(l.Qty)
		r := stored[l.MoveID]
		delete(stored, l.MoveID)
		if r != nil {
			kept[r.Id] = true
		}
		if r != nil && r.GetFloat("quantity") == qty && int64(r.GetInt("value")) == l.Value &&
			r.GetInt("position") == position && r.GetString("date") == date && r.GetString("currency") == currency {
			continue
		}
		if r == nil {
			if col == nil {
				if col, err = tx.FindCachedCollectionByNameOrId(stockLayersCollection); err != nil {
					return err
				}
			}
			r = core.NewRecord(col)
			r.Set("product", product.Id)
			r.Set("move", l.MoveID)
		}
		r.Set("currency", currency)
		r.Set("date", date)
		r.Set("quantity", qty)
		r.Set("value", l.Value)
		r.Set("position", position)
		if err := tx.Save(r); err != nil {
			return fmt.Errorf("books: write a stock layer: %w", err)
		}
	}
	for _, r := range rows {
		if kept[r.Id] {
			continue
		}
		if err := tx.Delete(r); err != nil {
			return fmt.Errorf("books: delete a stock layer: %w", err)
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
