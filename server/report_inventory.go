package books

import "tinycld.org/core/reports"

// The inventory report sources (books design, "Inventory", Reports): the stock
// moves and the open FIFO layers the store keeps (stock.go). Inventory
// Valuation Detail reads books.stock_moves; Inventory Valuation Summary and
// Stock status read books.products (quantity on hand, stock value, reorder
// point); the layers show what the value on hand is made of under FIFO. The
// sources hold what the store wrote: a report over them never prices stock.

const (
	stockMovesKey  = "books.stock_moves"
	stockLayersKey = "books.stock_layers"
)

// stockMoveKindOptions are the kinds of a stock move as a person reads them.
func stockMoveKindOptions() []reports.Option {
	return []reports.Option{
		{Value: stockKindOpening, Label: "Opening stock"},
		{Value: stockKindReceipt, Label: "Receipt"},
		{Value: stockKindSale, Label: "Sale"},
		{Value: stockKindCustomerReturn, Label: "Customer return"},
		{Value: stockKindVendorReturn, Label: "Vendor return"},
		{Value: stockKindAdjustment, Label: "Adjustment"},
	}
}

// stockMoveSourceOptions name the document of a stock move as a person reads
// it: source holds the document's collection.
func stockMoveSourceOptions() []reports.Option {
	return []reports.Option{
		{Value: invoiceKind.Collection, Label: "Invoice"},
		{Value: salesReceiptKind.Collection, Label: "Sales receipt"},
		{Value: creditMemoKind.Collection, Label: "Credit memo"},
		{Value: refundReceiptKind.Collection, Label: "Refund receipt"},
		{Value: billKind.Collection, Label: "Bill"},
		{Value: expenseKind.Collection, Label: "Expense"},
		{Value: vendorCreditKind.Collection, Label: "Vendor credit"},
		{Value: inventoryAdjustmentsCollection, Label: "Inventory adjustment"},
	}
}

// stockMovesSource is books_stock_moves: one row for each quantity or value a
// posted document moved, with the value the costing method gave it and the
// item's quantity and value after it. source names the document's type and
// document its id; a move holds no document number. line, given, given_value,
// return_of and posted_value are the store's own and are left out.
func stockMovesSource() reports.Source {
	return reports.Source{
		Key: stockMovesKey, Collection: stockMovesCollection, Label: "Stock moves",
		Fields: []reports.Field{
			{Key: "date", Label: "Date", Type: reports.Date, TextDay: true, Aggregates: reports.MinMax},
			{Key: "seq", Label: "Order", Type: reports.Number},
			{Key: "kind", Label: "Kind", Type: reports.Select, Options: stockMoveKindOptions()},
			{Key: "source", Label: "Document type", Type: reports.Select, Options: stockMoveSourceOptions()},
			{Key: "document", Label: "Document ID", Type: reports.Text},
			{Key: "quantity", Label: "Quantity", Type: reports.Number, Aggregates: reports.SumAll},
			{Key: "value", Label: "Value", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "quantity_after", Label: "Quantity on hand", Type: reports.Number, Aggregates: reports.MinMax},
			{Key: "value_after", Label: "Stock value", Type: reports.Money, Aggregates: reports.MinMax, Currency: "currency"},
			{Key: "currency", Label: "Currency", Type: reports.Text},
		},
		Links: []reports.Link{
			{Key: "product", Label: "Product", Target: "books.products", Cardinality: reports.ToOne, Field: "product"},
			{Key: "asset_account", Label: "Inventory asset account", Target: "books.accounts", Cardinality: reports.ToOne, Field: "asset_account"},
			{Key: "offset_account", Label: "Offset account", Target: "books.accounts", Cardinality: reports.ToOne, Field: "offset_account"},
		},
	}
}

// stockLayersSource is books_stock_layers: the stock on hand of each item by
// the stock-in it came from. position is the seq of the stock-in, labelled
// "Order" as the moves source labels seq: like a move's, it orders the layers
// of one day, so layers come oldest first by Date, then Order. Under the
// average cost an item has one layer.
func stockLayersSource() reports.Source {
	return reports.Source{
		Key: stockLayersKey, Collection: stockLayersCollection, Label: "Stock layers",
		Fields: []reports.Field{
			{Key: "date", Label: "Date", Type: reports.Date, TextDay: true, Aggregates: reports.MinMax},
			{Key: "quantity", Label: "Quantity", Type: reports.Number, Aggregates: reports.SumAll},
			{Key: "value", Label: "Value", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "position", Label: "Order", Type: reports.Number},
			{Key: "currency", Label: "Currency", Type: reports.Text},
		},
		Links: []reports.Link{
			{Key: "product", Label: "Product", Target: "books.products", Cardinality: reports.ToOne, Field: "product"},
			{Key: "move", Label: "Stock move", Target: stockMovesKey, Cardinality: reports.ToOne, Field: "move"},
		},
	}
}
