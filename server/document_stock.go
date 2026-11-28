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

// stockReceipt brings the line's quantity in at the line's amount (a bill, an
// expense, a check): the document's entry debits the item's inventory asset
// account in place of an expense account (stockInByAccount), so the move adds
// no cost line of its own.
const stockReceipt stockRole = "receipt"

// stockVendorReturn takes the line's quantity out at the costing method's cost
// (a vendor credit). The line credits the item's cost of goods sold account
// with the credited amount, as any product line of a vendor credit; the move
// credits the inventory asset account and debits cost of goods sold at cost.
// Cost of goods sold keeps the difference between the cost and the credit.
const stockVendorReturn stockRole = "vendor_return"

// stockCustomerReturn brings the line's quantity back in (a credit memo, a
// refund receipt) at its original cost: the unit cost of the sale's move of
// the same item on the document the return was made from (the kind's
// ReturnOfField). A return made from no sale, or of an item that sale did not
// move, comes back at the last known cost. The document's entry debits the
// inventory asset account and credits cost of goods sold.
const stockCustomerReturn stockRole = "customer_return"

// soldMoves are the ids of the sale moves a return's lines come back at the
// cost of, by product: the first move of each product on the sale that doc
// names in the kind's ReturnOfField. A kind with no such field, and a document
// that names no sale, answer an empty map.
func soldMoves(tx core.App, kind salesDocKind, doc *core.Record) (map[string]string, error) {
	sold := map[string]string{}
	if kind.ReturnOfField == "" || doc.GetString(kind.ReturnOfField) == "" {
		return sold, nil
	}
	moves, err := documentStockMoves(tx, kind.ReturnOfCollection, doc.GetString(kind.ReturnOfField))
	if err != nil {
		return nil, err
	}
	for _, m := range moves {
		if _, seen := sold[m.GetString("product")]; !seen {
			sold[m.GetString("product")] = m.Id
		}
	}
	return sold, nil
}

// documentStockInputs are the stock moves the stored lines of doc make, in the
// lines' order: one for each item line whose product is an Inventory item.
// totals holds the lines' amounts (totals.Amounts[i] is the amount of
// lines[i]). A document with none answers nil.
func documentStockInputs(tx core.App, kind salesDocKind, doc *core.Record, lines []*core.Record, totals documentTotalsResult) ([]stockMoveInput, error) {
	products, err := lineProducts(tx, lines)
	if err != nil {
		return nil, err
	}
	sold, err := soldMoves(tx, kind, doc)
	if err != nil {
		return nil, err
	}
	accounts := inventoryAccountCache{}
	var inputs []stockMoveInput
	for i, line := range lines {
		if line.GetString("kind") != lineKindItem || line.GetString("product") == "" {
			continue
		}
		product, err := recordOf(products, line.GetString("product"))
		if err != nil {
			return nil, fmt.Errorf("books: read the product of line %d: %w", i+1, err)
		}
		if !isInventoryProduct(product) {
			continue
		}
		asset, cogs, err := accounts.of(tx, product)
		if err != nil {
			return nil, err
		}
		in := stockMoveInput{
			Product: product.Id, Source: kind.Collection, Document: doc.Id, Line: line.Id,
			Date: doc.GetString("date"), AssetAccount: asset, OffsetAccount: cogs,
		}
		qty := qtyHundredths(line.GetFloat("quantity"))
		switch kind.Stock {
		case stockSale:
			in.Kind, in.Qty = stockKindSale, -qty
		case stockReceipt:
			// The amount is never below 0: the schema holds a product line's
			// rate at 0 or more and the line guard its quantity above 0.
			in.Kind, in.Qty, in.Given, in.Value = stockKindReceipt, qty, true, totals.Amounts[i]
		case stockVendorReturn:
			in.Kind, in.Qty = stockKindVendorReturn, -qty
		case stockCustomerReturn:
			in.Kind, in.Qty, in.ReturnOf = stockKindCustomerReturn, qty, sold[product.Id]
		default:
			return nil, fmt.Errorf("books: %s has no stock role %q", kind.DocType, kind.Stock)
		}
		inputs = append(inputs, in)
	}
	return inputs, nil
}

// salesDocStockLines writes the stock moves of doc while it posts and answers
// the journal lines of their cost, which the caller adds to the document's own
// entry, and the moves, which take the document's number once it has one
// (numberPostedMoves). The moves of the document a correction replaces go with
// its re-costs (postDocumentStock). A kind with no stock role answers nil.
func salesDocStockLines(tx core.App, kind salesDocKind, doc, original *core.Record, lines []*core.Record, totals documentTotalsResult) ([]postingLine, []*core.Record, error) {
	if kind.Stock == "" {
		return nil, nil, nil
	}
	inputs, err := documentStockInputs(tx, kind, doc, lines, totals)
	if err != nil {
		return nil, nil, err
	}
	replaces := ""
	if original != nil {
		replaces = original.Id
	}
	moves, err := postDocumentStock(tx, doc.GetString("posted_by"), kind.Collection, doc.Id, replaces, doc.GetString("date"), inputs)
	if err != nil {
		return nil, nil, err
	}
	if kind.Stock == stockReceipt {
		// The kind's line accounts debit the asset account with the line's
		// amount, which is the move's value.
		return nil, moves, nil
	}
	return stockCostLines(moves), moves, nil
}
