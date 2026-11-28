package books

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// books_bin_stock holds the quantity of each item in each bin location ('' is
// No bin): one row for each item and bin that ever held stock
// (pb-migrations/2100000049_create_books_bins.js). This file is its one writer.
// Every stock move with a quantity (stock.go addStockMoves and
// removeStockMoves) and every move between bins (bins.go) changes it, so the
// rows of an item add up to its quantity on hand. A bin has a quantity and no
// value: cost is per item. Each function runs in the caller's transaction.

const (
	binsCollection         = "books_bins"
	binStockCollection     = "books_bin_stock"
	binTransfersCollection = "books_bin_transfers"
)

// moveBinStock adds hundredths (signed, in hundredths of a unit) to the
// quantity of product in bin, and makes the row when the item never held stock
// there (also for a change of 0: moves of a document that add up to 0 still
// put the item in the bin). A row whose quantity comes to 0 stays: the bin
// held the item.
func moveBinStock(tx core.App, product, bin string, hundredths int64) error {
	row, err := binStockRow(tx, product, bin)
	if err != nil {
		return err
	}
	if row != nil && hundredths == 0 {
		return nil
	}
	if row == nil {
		col, err := tx.FindCachedCollectionByNameOrId(binStockCollection)
		if err != nil {
			return err
		}
		row = core.NewRecord(col)
		row.Set("product", product)
		row.Set("bin", bin)
	}
	row.Set("quantity", qtyFromHundredths(qtyHundredths(row.GetFloat("quantity"))+hundredths))
	if err := tx.Save(row); err != nil {
		return fmt.Errorf("books: write the bin stock of %s: %w", product, err)
	}
	return nil
}

// binStockKey is one item in one bin.
type binStockKey struct{ product, bin string }

// binStockChanges sums the quantities of many stock moves by item and bin, so
// a document of 250 lines of two items writes two bin stock rows, not 250.
type binStockChanges struct {
	order  []binStockKey
	totals map[binStockKey]int64
}

func (c *binStockChanges) add(product, bin string, hundredths int64) {
	if hundredths == 0 {
		return
	}
	if c.totals == nil {
		c.totals = map[binStockKey]int64{}
	}
	key := binStockKey{product, bin}
	if _, seen := c.totals[key]; !seen {
		c.order = append(c.order, key)
	}
	c.totals[key] += hundredths
}

// write applies the sums by moveBinStock, in the order the moves named them.
func (c *binStockChanges) write(tx core.App) error {
	for _, key := range c.order {
		if err := moveBinStock(tx, key.product, key.bin, c.totals[key]); err != nil {
			return err
		}
	}
	return nil
}

// binStockRow is the row of product in bin, or nil when there is none.
func binStockRow(tx core.App, product, bin string) (*core.Record, error) {
	rows, err := tx.FindRecordsByFilter(binStockCollection, "product = {:product} && bin = {:bin}", "", 1, 0,
		dbx.Params{"product": product, "bin": bin})
	if err != nil {
		return nil, fmt.Errorf("books: read the bin stock of %s: %w", product, err)
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}

// binQuantity is the quantity of product in bin, in hundredths.
func binQuantity(tx core.App, product, bin string) (int64, error) {
	row, err := binStockRow(tx, product, bin)
	if err != nil || row == nil {
		return 0, err
	}
	return qtyHundredths(row.GetFloat("quantity")), nil
}

// rebuildBinStock writes the rows of product again from its stock moves (by
// their bin) and its moves between bins, so they hold what the incremental
// writes would hold. Each bin that a move names gets a row, as moveBinStock
// gives it one; a stored row that no move names any more (its moves were
// voided) is kept at 0, because the bin held the item.
func rebuildBinStock(tx core.App, product string) error {
	stored, err := tx.FindRecordsByFilter(binStockCollection, "product = {:product}", "", 0, 0,
		dbx.Params{"product": product})
	if err != nil {
		return fmt.Errorf("books: read the bin stock of %s: %w", product, err)
	}
	rows := make(map[string]*core.Record, len(stored))
	totals := map[string]int64{}
	var order []string
	add := func(bin string, hundredths int64) {
		if _, seen := totals[bin]; !seen {
			order = append(order, bin)
		}
		totals[bin] += hundredths
	}
	for _, r := range stored {
		rows[r.GetString("bin")] = r
		add(r.GetString("bin"), 0)
	}
	var moves []struct {
		Bin      string  `db:"bin"`
		Quantity float64 `db:"quantity"`
	}
	if err := tx.DB().NewQuery("SELECT bin, quantity FROM books_stock_moves WHERE product = {:product} AND quantity != 0 ORDER BY seq").
		Bind(dbx.Params{"product": product}).All(&moves); err != nil {
		return fmt.Errorf("books: read the stock moves of %s: %w", product, err)
	}
	for _, m := range moves {
		add(m.Bin, qtyHundredths(m.Quantity))
	}
	var transfers []struct {
		From     string  `db:"from_bin"`
		To       string  `db:"to_bin"`
		Quantity float64 `db:"quantity"`
	}
	if err := tx.DB().NewQuery("SELECT from_bin, to_bin, quantity FROM books_bin_transfers WHERE product = {:product} ORDER BY created, id").
		Bind(dbx.Params{"product": product}).All(&transfers); err != nil {
		return fmt.Errorf("books: read the moves between bins of %s: %w", product, err)
	}
	for _, m := range transfers {
		q := qtyHundredths(m.Quantity)
		add(m.From, -q)
		add(m.To, q)
	}
	col, err := tx.FindCachedCollectionByNameOrId(binStockCollection)
	if err != nil {
		return err
	}
	for _, bin := range order {
		quantity := qtyFromHundredths(totals[bin])
		row := rows[bin]
		if row != nil && qtyHundredths(row.GetFloat("quantity")) == totals[bin] {
			continue
		}
		if row == nil {
			row = core.NewRecord(col)
			row.Set("product", product)
			row.Set("bin", bin)
		}
		row.Set("quantity", quantity)
		if err := tx.Save(row); err != nil {
			return fmt.Errorf("books: write the bin stock of %s: %w", product, err)
		}
	}
	return nil
}
