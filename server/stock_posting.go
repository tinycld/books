package books

import (
	"fmt"
	"slices"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// How a posted document changes stock (docs/adr/0003-inventory-costing.md).
// A document that moves stock calls postDocumentStock inside its posting
// transaction, before it builds its journal entry: the store writes the
// document's moves and replays their products, and the document puts the cost
// of its own moves into its own entry (stockCostLines). A document that stops
// standing (a void, a correction's original) calls withdrawDocumentStock or
// names itself in postDocumentStock's replaces.

// ensureInventoryAsset returns the active inventory asset account an Inventory
// item with none of its own takes: the first in chart order with the detail
// type inventory. A chart with none gets "Inventory asset", an other current
// asset numbered 1300 when no account holds that number.
func ensureInventoryAsset(tx core.App) (*core.Record, error) {
	return ensureControlAccount(tx, controlAccount{
		match: dbx.HashExp{"detail_type": "inventory"},
		name:  "Inventory asset", typ: "other_current_asset", detailType: "inventory", number: "1300",
	})
}

// ensureCostOfGoodsSold returns the active cost of goods sold account an
// Inventory item with none of its own takes: the first Supplies and materials
// account in chart order (the starter chart's 5000). A chart with none gets
// "Cost of goods sold", numbered 5000 when no account holds that number.
func ensureCostOfGoodsSold(tx core.App) (*core.Record, error) {
	return ensureControlAccount(tx, controlAccount{
		match: dbx.HashExp{"type": "cost_of_goods_sold", "detail_type": "supplies_materials"},
		name:  "Cost of goods sold", typ: "cost_of_goods_sold", detailType: "supplies_materials", number: "5000",
	})
}

// ensureInventoryShrinkage returns the active account an inventory adjustment
// with no account of its own posts against: the first with the detail type
// inventory_shrinkage. A chart with none gets "Inventory shrinkage", a cost of
// goods sold account numbered 5100 when no account holds that number.
func ensureInventoryShrinkage(tx core.App) (*core.Record, error) {
	return ensureControlAccount(tx, controlAccount{
		match: dbx.HashExp{"detail_type": "inventory_shrinkage"},
		name:  "Inventory shrinkage", typ: "cost_of_goods_sold", detailType: "inventory_shrinkage", number: "5100",
	})
}

// ensureOpeningBalanceEquity returns the active account an item's opening
// stock posts against: the first with the detail type opening_balance_equity.
// A chart with none gets "Opening balance equity", numbered 3000 when no
// account holds that number.
func ensureOpeningBalanceEquity(tx core.App) (*core.Record, error) {
	return ensureControlAccount(tx, controlAccount{
		match: dbx.HashExp{"detail_type": "opening_balance_equity"},
		name:  "Opening balance equity", typ: "equity", detailType: "opening_balance_equity", number: "3000",
	})
}

// inventoryAccounts are the two accounts the moves of an Inventory item post
// to: its inventory asset account and its cost of goods sold account
// (expense_account). An item that names none takes the chart's
// (ensureInventoryAsset, ensureCostOfGoodsSold).
func inventoryAccounts(tx core.App, product *core.Record) (asset, cogs string, err error) {
	asset, cogs = product.GetString("asset_account"), product.GetString("expense_account")
	if asset == "" {
		account, err := ensureInventoryAsset(tx)
		if err != nil {
			return "", "", err
		}
		asset = account.Id
	}
	if cogs == "" {
		account, err := ensureCostOfGoodsSold(tx)
		if err != nil {
			return "", "", err
		}
		cogs = account.Id
	}
	return asset, cogs, nil
}

// postDocumentStock makes moves the stock moves of the document (a row of the
// collection source) and answers them, priced. It takes away the moves the
// document had and the moves of the document it replaces (a correction's
// original; "" for none), replays every product touched, and records that the
// ledger holds the document's moves (the caller puts stockCostLines of them
// into the entry it posts in this transaction). actor is the person who posts
// the document. No moves and nothing to take away is no work.
func postDocumentStock(tx core.App, actor, source, document, replaces string, moves []stockMoveInput) ([]*core.Record, error) {
	// A move of another document would be written but never read back nor
	// marked posted: that is a fault in the caller, not a person's refusal.
	for _, m := range moves {
		if m.Source != source || m.Document != document {
			return nil, fmt.Errorf("stock move of %s %s given to the stock of %s %s", m.Source, m.Document, source, document)
		}
	}
	var products []string
	for _, id := range []string{replaces, document} {
		if id == "" {
			continue
		}
		removed, err := removeStockMoves(tx, source, id)
		if err != nil {
			return nil, err
		}
		products = appendMissing(products, removed...)
	}
	if err := addStockMoves(tx, moves); err != nil {
		return nil, err
	}
	for _, m := range moves {
		products = appendMissing(products, m.Product)
	}
	if len(products) == 0 {
		return nil, nil
	}
	if err := recomputeStock(tx, products); err != nil {
		return nil, err
	}
	own, err := documentStockMoves(tx, source, document)
	if err != nil {
		return nil, err
	}
	if err := markStockPosted(tx, own); err != nil {
		return nil, err
	}
	return own, nil
}

// withdrawDocumentStock takes the stock moves of a document that stops
// standing (a void) away: its moves are deleted and their products replayed.
// actor is the person who voids the document. The caller voids the document's
// own entry.
func withdrawDocumentStock(tx core.App, actor, source, document string) error {
	products, err := removeStockMoves(tx, source, document)
	if err != nil || len(products) == 0 {
		return err
	}
	return recomputeStock(tx, products)
}

func appendMissing(list []string, ids ...string) []string {
	for _, id := range ids {
		if !slices.Contains(list, id) {
			list = append(list, id)
		}
	}
	return list
}

// stockCostLines are the journal lines of the value of moves: a move that adds
// value debits its asset account and credits its offset account, a move that
// takes value away the other way. One line for each account with a net amount,
// in the order the moves name the accounts.
func stockCostLines(moves []*core.Record) []postingLine {
	return stockLedgerLines(moves, func(m *core.Record) int64 { return int64(m.GetInt("value")) })
}

func stockLedgerLines(moves []*core.Record, amount func(m *core.Record) int64) []postingLine {
	sums := map[string]int64{}
	var accounts []string
	for _, m := range moves {
		asset, offset := m.GetString("asset_account"), m.GetString("offset_account")
		accounts = appendMissing(accounts, asset, offset)
		sums[asset] += amount(m)
		sums[offset] -= amount(m)
	}
	var lines []postingLine
	for _, id := range accounts {
		lines = appendSigned(lines, postingLine{Account: id}, sums[id])
	}
	return lines
}
