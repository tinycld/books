package books

import (
	"fmt"
	"slices"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// How a posted document changes stock (docs/adr/0003-inventory-costing.md).
// A document that moves stock calls postDocumentStock inside its posting
// transaction, before it builds its journal entry: the store writes the
// document's moves and replays their products, and the document puts the cost
// of its own moves into its own entry (stockCostLines). A replay can change
// the value of a move of ANOTHER posted document (a back-dated receipt, a
// receipt that fills an oversold sale, a void). That document's entry never
// changes (ADR 1): recostDrifted posts the difference as an inventory
// adjustment of the kind recost, dated the document's date. A document that
// stops standing (a void, a correction's original) calls withdrawDocumentStock
// or names itself in postDocumentStock's replaces; its re-costs are voided
// with it.

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

// inventoryAccountCache holds inventoryAccounts of each product for one post:
// an item without its own accounts takes the chart's, which inventoryAccounts
// looks up, so a post looks them up once for each product, not each line.
type inventoryAccountCache map[string][2]string

func (c inventoryAccountCache) of(tx core.App, product *core.Record) (asset, cogs string, err error) {
	if pair, ok := c[product.Id]; ok {
		return pair[0], pair[1], nil
	}
	asset, cogs, err = inventoryAccounts(tx, product)
	if err != nil {
		return "", "", err
	}
	c[product.Id] = [2]string{asset, cogs}
	return asset, cogs, nil
}

// postDocumentStock makes moves the stock moves of the document (a row of the
// collection source) and answers them, priced. It takes away the moves the
// document had and the moves of the document it replaces (a correction's
// original; "" for none), with that document's re-costs, replays every product
// touched, records that the ledger holds the document's moves (the caller puts
// stockCostLines of them into the entry it posts in this transaction), and
// re-costs every other posted document whose cost the replay changed. actor
// posts the re-costs. No moves and nothing to take away is no work.
func postDocumentStock(tx core.App, actor, source, document, replaces string, moves []stockMoveInput) ([]*core.Record, error) {
	// A move of another document would be written but never read back nor
	// marked posted: that is a fault in the caller, not a person's refusal.
	for _, m := range moves {
		if m.Source != source || m.Document != document {
			return nil, fmt.Errorf("stock move of %s %s given to the stock of %s %s", m.Source, m.Document, source, document)
		}
	}
	var products []string
	var gone []*core.Record
	for _, id := range []string{replaces, document} {
		if id == "" {
			continue
		}
		if err := voidRecosts(tx, actor, source, id); err != nil {
			return nil, err
		}
		was, err := documentStockMoves(tx, source, id)
		if err != nil {
			return nil, err
		}
		gone = append(gone, was...)
		removed, err := removeStockMoves(tx, source, id)
		if err != nil {
			return nil, err
		}
		products = appendMissing(products, removed...)
	}
	if err := addStockMoves(tx, moves); err != nil {
		return nil, err
	}
	if err := repointStockReturns(tx, gone, source, document); err != nil {
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
	// Before the re-cost: the document's own moves are in its own entry, so
	// they are not drift.
	if err := markStockPosted(tx, own); err != nil {
		return nil, err
	}
	if err := recostDrifted(tx, actor, products); err != nil {
		return nil, err
	}
	return own, nil
}

// withdrawDocumentStock takes the stock moves of a document that stops
// standing (a void) away: its re-costs are voided, its moves deleted, their
// products replayed, and every other posted document whose cost changed is
// re-costed. The caller voids the document's own entry.
func withdrawDocumentStock(tx core.App, actor, source, document string) error {
	if err := voidRecosts(tx, actor, source, document); err != nil {
		return err
	}
	gone, err := documentStockMoves(tx, source, document)
	if err != nil {
		return err
	}
	products, err := removeStockMoves(tx, source, document)
	if err != nil || len(products) == 0 {
		return err
	}
	// The returns of a voided sale name no sale: they come back at the last
	// known cost.
	if err := repointStockReturns(tx, gone, "", ""); err != nil {
		return err
	}
	if err := recomputeStock(tx, products); err != nil {
		return err
	}
	return recostDrifted(tx, actor, products)
}

// repointStockReturns keeps the returns of moves that are gone at their sale's
// cost: a return (return_of) that names a gone move names instead the first
// move of the same product on the document that takes their place (a
// correction's), or no move when there is none, so that it comes back at the
// last known cost. A return has the product of the move it names, so the
// caller's replay of the gone moves' products prices it again. It reads the
// returns of all gone moves, and the moves of the new document, once each.
func repointStockReturns(tx core.App, gone []*core.Record, source, document string) error {
	if len(gone) == 0 {
		return nil
	}
	ids := make([]any, len(gone))
	productOf := make(map[string]string, len(gone))
	for i, old := range gone {
		ids[i] = old.Id
		productOf[old.Id] = old.GetString("product")
	}
	returns, err := tx.FindAllRecords(stockMovesCollection, dbx.In("return_of", ids...))
	if err != nil {
		return fmt.Errorf("books: read the returns of the stock moves: %w", err)
	}
	if len(returns) == 0 {
		return nil
	}
	var now []*core.Record
	if document != "" {
		if now, err = documentStockMoves(tx, source, document); err != nil {
			return err
		}
	}
	for _, r := range returns {
		product := productOf[r.GetString("return_of")]
		to := ""
		if i := slices.IndexFunc(now, func(m *core.Record) bool {
			return m.GetString("product") == product
		}); i >= 0 {
			to = now[i].Id
		}
		r.Set("return_of", to)
		if err := tx.Save(r); err != nil {
			return fmt.Errorf("books: repoint a stock return: %w", err)
		}
	}
	return nil
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

// stockDriftLines are the journal lines of what the ledger does not hold yet
// of moves: each move's value less its posted value.
func stockDriftLines(moves []*core.Record) []postingLine {
	return stockLedgerLines(moves, func(m *core.Record) int64 {
		return int64(m.GetInt("value")) - int64(m.GetInt("posted_value"))
	})
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

// recostDrifted posts, for each posted document with a move of products whose
// value differs from what the ledger holds, one inventory adjustment of the
// kind recost for the difference, dated the document's date. A difference that
// nets to no journal line (a move whose two accounts are one) is recorded as
// posted with no adjustment.
func recostDrifted(tx core.App, actor string, products []string) error {
	drifted, err := driftedStockMoves(tx, products)
	if err != nil {
		return err
	}
	// driftedStockMoves orders by document, so a document's moves are together.
	for len(drifted) > 0 {
		source, document := drifted[0].GetString("source"), drifted[0].GetString("document")
		n := slices.IndexFunc(drifted, func(m *core.Record) bool {
			return m.GetString("source") != source || m.GetString("document") != document
		})
		if n < 0 {
			n = len(drifted)
		}
		group := drifted[:n]
		drifted = drifted[n:]
		if len(stockDriftLines(group)) == 0 {
			if err := markStockPosted(tx, group); err != nil {
				return err
			}
			continue
		}
		name, err := stockDocumentName(tx, source, document)
		if err != nil {
			return err
		}
		lines := make([]adjustmentLineInput, len(group))
		for i, m := range group {
			lines[i] = adjustmentLineInput{
				Product: m.GetString("product"),
				Value:   int64(m.GetInt("value")) - int64(m.GetInt("posted_value")),
			}
		}
		_, err = newSystemAdjustment(tx, systemAdjustment{
			Kind: adjustmentKindRecost, Date: group[0].GetString("date"), Actor: actor,
			Source: source, Document: document, Memo: "Re-cost of " + name, Lines: lines,
		})
		if err != nil {
			return err
		}
	}
	return nil
}

// voidRecosts voids the posted re-costs of a document that stops standing.
func voidRecosts(tx core.App, actor, source, document string) error {
	recosts, err := tx.FindRecordsByFilter(inventoryAdjustmentsCollection,
		"source = {:source} && document = {:document} && kind = {:kind} && status = {:posted}", "sequence", 0, 0,
		dbx.Params{"source": source, "document": document, "kind": adjustmentKindRecost, "posted": statusPosted})
	if err != nil {
		return fmt.Errorf("books: read the re-costs of %s %s: %w", source, document, err)
	}
	for _, r := range recosts {
		if err := voidSystemAdjustment(tx, r, actor, time.Now()); err != nil {
			return err
		}
	}
	return nil
}

// stockDocumentName is how a re-cost's memo names the document it re-costs:
// the name of the document's journal entry ("Invoice 1001"), or, when it posted
// no entry, the name its own kind gives it.
func stockDocumentName(tx core.App, source, document string) (string, error) {
	doc, err := tx.FindRecordById(source, document)
	if err != nil {
		return "", fmt.Errorf("books: read the document to re-cost: %w", err)
	}
	if id := doc.GetString("entry"); id != "" {
		entry, err := tx.FindRecordById("books_journal_entries", id)
		if err != nil {
			return "", fmt.Errorf("books: read the entry of the document to re-cost: %w", err)
		}
		return entryName(entry), nil
	}
	if source == inventoryAdjustmentsCollection {
		return inventoryAdjustmentName(doc), nil
	}
	if kind, ok := salesDocKindOf(source); ok {
		return salesDocName(kind, doc), nil
	}
	if n := doc.GetString("number"); n != "" {
		return "Document " + n, nil
	}
	return "A document", nil
}
