package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
)

// Books keeps the stock of an Inventory item from the posted transactions.
// A caller reads these collections and never writes them.
const (
	stockMovesCollection  = "books_stock_moves"
	stockLayersCollection = "books_stock_layers"
)

// stockMovesResource is one change of the stock of an item. It is built in Go
// because it has no command but its list.
var stockMovesResource = resource{
	Name:       "stock moves",
	Singular:   "stock move",
	Summary:    "The changes of the stock of the Inventory items",
	Collection: stockMovesCollection,
	Sort:       "-date,-seq,id",
	Columns:    []string{"date", "kind", "product", "quantity", "value", "quantity_after", "value_after"},
	Filters: []filterFlag{
		{Flag: "product", Field: "product", Help: "only the moves of this Inventory item: the id of a product"},
		{Flag: "kind", Field: "kind", Help: "only the moves of this kind: opening, receipt, sale, customer_return, vendor_return or adjustment"},
	},
	Fields: []field{
		{Name: "product", Type: typeID, ReadOnly: true, Ref: "products", Help: "the Inventory item"},
		{Name: "date", Type: typeString, ReadOnly: true, Help: "the date of the transaction, YYYY-MM-DD"},
		{Name: "seq", Type: typeInteger, ReadOnly: true, Help: "the order of the move among all the stock moves of the books; it orders the moves of one date"},
		{Name: "kind", Type: typeString, ReadOnly: true, Enum: []string{"opening", "receipt", "sale", "customer_return", "vendor_return", "adjustment"}, Help: "what changed the stock"},
		{Name: "source", Type: typeString, ReadOnly: true, Help: "the collection of the transaction that made the move"},
		{Name: "document", Type: typeString, ReadOnly: true, Help: "the id of that transaction"},
		{Name: "line", Type: typeString, ReadOnly: true, Help: "the id of its line"},
		{Name: "quantity", Type: typeNumber, ReadOnly: true, Help: "the change of the quantity: above 0 into stock, below 0 out of stock"},
		{Name: "value", Type: typeInteger, ReadOnly: true, Help: "the change of the value of the stock, in cents. For a move out of stock, it is the cost that the costing method gives."},
		{Name: "quantity_after", Type: typeNumber, ReadOnly: true, Help: "the quantity in stock after the move"},
		{Name: "value_after", Type: typeInteger, ReadOnly: true, Help: "the value of the stock after the move, in cents"},
		{Name: "asset_account", Type: typeID, ReadOnly: true, Ref: "accounts", Help: "the inventory asset account of the item"},
		{Name: "offset_account", Type: typeID, ReadOnly: true, Ref: "accounts", Help: "the other account of the move: cost of goods sold for a sale, the adjustment account for an adjustment"},
		{Name: "currency", Type: typeString, ReadOnly: true, Help: "the currency of the books"},
	},
}

// stockLayersResource is what is left of one move into stock. The sort is the
// order in which Books takes stock out (`stockLayerOrder` of the server).
var stockLayersResource = resource{
	Name:       "stock layers",
	Singular:   "stock layer",
	Summary:    "The stock on hand of the Inventory items, by the move that brought it in",
	Collection: stockLayersCollection,
	Sort:       "product,date,position,id",
	Columns:    []string{"product", "date", "quantity", "value"},
	Filters: []filterFlag{
		{Flag: "product", Field: "product", Help: "only the layers of this Inventory item: the id of a product"},
	},
	Fields: []field{
		{Name: "product", Type: typeID, ReadOnly: true, Ref: "products", Help: "the Inventory item"},
		{Name: "move", Type: typeID, ReadOnly: true, Ref: "inventory moves", Help: "the move that brought the stock in; empty with the costing method average cost"},
		{Name: "date", Type: typeString, ReadOnly: true, Help: "the date of that move, YYYY-MM-DD; empty with the costing method average cost"},
		{Name: "quantity", Type: typeNumber, ReadOnly: true, Help: "the quantity that is left of the move"},
		{Name: "value", Type: typeInteger, ReadOnly: true, Help: "the cost of that quantity, in cents"},
		{Name: "position", Type: typeInteger, ReadOnly: true, Help: "the seq of the move that brought the stock in: it orders the layers of one date; 0 with the costing method average cost"},
		{Name: "currency", Type: typeString, ReadOnly: true, Help: "the currency of the books"},
	},
}

// inventoryResources are the lists of the group, by the command word of each.
func inventoryResources() map[string]*resource {
	return map[string]*resource{
		"moves":  &stockMovesResource,
		"layers": &stockLayersResource,
	}
}

func newInventoryCmd(c *client.Client) *cobra.Command {
	group := newGroup("inventory", "Inventory: the stock and the cost of the Inventory items")
	paged := "\n\n" + fmt.Sprint(defaultListLimit) + " to a page. " + pagingText
	group.AddCommand(
		buildListCmd(c, &stockMovesResource, commandDef{
			Name:  "moves",
			Short: "List the changes of the stock of the Inventory items",
			Long: "List the stock moves, the newest first: each posted transaction that changed the quantity or the\n" +
				"value of the stock of an Inventory item. `quantity_after` and `value_after` are the stock of the\n" +
				"item after the move. `tinycld books products show` prints the stock of an item now:\n" +
				"`quantity_on_hand` and `stock_value`.\n\n" +
				"Books writes the moves. To change the stock, post a transaction: a bill, an invoice, or\n" +
				"`tinycld books inventory-adjustments add`." + paged,
		}),
		buildListCmd(c, &stockLayersResource, commandDef{
			Name:  "layers",
			Short: "List the stock on hand by the move that brought it in",
			Long: "List the stock layers: the stock on hand of each Inventory item, with its cost.\n\n" +
				"With the costing method FIFO, a layer is what is left of one move into stock. The layers of an item\n" +
				"are in the order of the date of that move, and Books takes stock out from the first one: the\n" +
				"layers give the cost of the next sale. With the costing method average cost, an item has one\n" +
				"layer: all its stock, at the average cost." + paged,
		}),
	)
	return group
}
