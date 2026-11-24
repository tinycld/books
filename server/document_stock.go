package books

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// stockRole is how the item lines of a document kind move the stock of an
// Inventory item (books design, "Inventory", Postings). The zero value is a
// kind that moves none (an estimate).
type stockRole string

// stockSale takes the line's quantity out at the costing method's cost: the
// document's entry credits the item's inventory asset account and debits its
// cost of goods sold account. A sale may take the quantity on hand below zero;
// it then posts at the last known cost and the next receipt prices it again
// (a re-cost).
const stockSale stockRole = "sale"

// documentStockInputs are the stock moves the stored lines of doc make, in the
// lines' order: one for each item line whose product is an Inventory item.
// totals holds the lines' amounts (totals.Amounts[i] is the amount of
// lines[i]). A document with none answers nil.
func documentStockInputs(tx core.App, kind salesDocKind, doc *core.Record, lines []*core.Record, totals documentTotalsResult) ([]stockMoveInput, error) {
	products, err := lineProducts(tx, lines)
	if err != nil {
		return nil, err
	}
	// An item without its own accounts takes the chart's, which inventoryAccounts
	// looks up: once for each product, not once for each line.
	accounts := map[string][2]string{}
	var inputs []stockMoveInput
	for i, line := range lines {
		if line.GetString("kind") != lineKindItem || line.GetString("product") == "" {
			continue
		}
		product, ok := products[line.GetString("product")]
		if !ok {
			return nil, fmt.Errorf("books: read the product of line %d: no product %s", i+1, line.GetString("product"))
		}
		if !isInventoryProduct(product) {
			continue
		}
		pair, ok := accounts[product.Id]
		if !ok {
			asset, cogs, err := inventoryAccounts(tx, product)
			if err != nil {
				return nil, err
			}
			pair = [2]string{asset, cogs}
			accounts[product.Id] = pair
		}
		in := stockMoveInput{
			Product: product.Id, Source: kind.Collection, Document: doc.Id, Line: line.Id,
			Date: doc.GetString("date"), AssetAccount: pair[0], OffsetAccount: pair[1],
		}
		qty := qtyHundredths(line.GetFloat("quantity"))
		switch kind.Stock {
		case stockSale:
			in.Kind, in.Qty = stockKindSale, -qty
		default:
			return nil, fmt.Errorf("books: %s has no stock role %q", kind.DocType, kind.Stock)
		}
		inputs = append(inputs, in)
	}
	return inputs, nil
}

// lineProducts reads the products the item lines name in one query, by id: a
// read for each line would make the statements of a post grow with its lines.
func lineProducts(tx core.App, lines []*core.Record) (map[string]*core.Record, error) {
	var ids []string
	for _, line := range lines {
		if line.GetString("kind") == lineKindItem && line.GetString("product") != "" {
			ids = appendMissing(ids, line.GetString("product"))
		}
	}
	if len(ids) == 0 {
		return nil, nil
	}
	found, err := tx.FindRecordsByIds("books_products", ids)
	if err != nil {
		return nil, fmt.Errorf("books: read the products of the lines: %w", err)
	}
	products := make(map[string]*core.Record, len(found))
	for _, p := range found {
		products[p.Id] = p
	}
	return products, nil
}

// salesDocStockLines writes the stock moves of doc while it posts and answers
// the journal lines of their cost, which the caller adds to the document's own
// entry. The moves of the document a correction replaces go with its re-costs
// (postDocumentStock). A kind with no stock role answers nil.
func salesDocStockLines(tx core.App, kind salesDocKind, doc, original *core.Record, lines []*core.Record, totals documentTotalsResult) ([]postingLine, error) {
	if kind.Stock == "" {
		return nil, nil
	}
	inputs, err := documentStockInputs(tx, kind, doc, lines, totals)
	if err != nil {
		return nil, err
	}
	replaces := ""
	if original != nil {
		replaces = original.Id
	}
	moves, err := postDocumentStock(tx, doc.GetString("posted_by"), kind.Collection, doc.Id, replaces, inputs)
	if err != nil {
		return nil, err
	}
	return stockCostLines(moves), nil
}
