package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// Books keeps the stock of an Inventory item from the posted transactions.
// A caller reads these collections and never writes them.
const (
	stockMovesCollection  = "books_stock_moves"
	stockLayersCollection = "books_stock_layers"
	binStockCollection    = "books_bin_stock"
)

// A move between bin locations is the one record of this file that a caller
// writes: Books never changes or deletes one.
const binTransfersCollection = "books_bin_transfers"

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
		{Name: "bin", Type: typeID, ReadOnly: true, Ref: "bins", Help: "the bin location the quantity moved in: the bin of an adjustment line, else the item's default bin when the move was posted; empty for No bin"},
		{Name: "document_number", Type: typeString, ReadOnly: true, Help: "the number of the transaction that made the move (an invoice number, an adjustment number); empty when it has none"},
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

// binStockResource is the quantity of one item in one bin location. Books
// writes it from the stock moves and the moves between bins; the rows of an
// item add up to its quantity on hand.
var binStockResource = resource{
	Name:       "bin stock",
	Singular:   "bin stock row",
	Summary:    "The quantity of each Inventory item in each bin location",
	Collection: binStockCollection,
	Sort:       "product,bin,id",
	Columns:    []string{"product", "bin", "quantity"},
	Timestamps: []string{},
	Filters: []filterFlag{
		{Flag: "product", Field: "product", Help: "only the rows of this Inventory item: the id of a product"},
		{Flag: "bin", Field: "bin", Help: "only the rows of this bin location: the id of a bin; \"\" for No bin"},
	},
	Fields: []field{
		{Name: "product", Type: typeID, ReadOnly: true, Ref: "products", Help: "the Inventory item"},
		{Name: "bin", Type: typeID, ReadOnly: true, Ref: "bins", Help: "the bin location; empty for No bin"},
		{Name: "quantity", Type: typeNumber, ReadOnly: true, Help: "the quantity of the item in the bin; it can be below 0 when a sale took more than the bin held"},
	},
}

// binTransfersResource is one move of a quantity of an item from one bin
// location to another. It is built in Go because its group has no `edit` and
// no `delete`: a move back corrects a move.
var binTransfersResource = resource{
	Name:       "bin transfers",
	Singular:   "move between bins",
	Summary:    "Moves of stock between bin locations",
	Collection: binTransfersCollection,
	Sort:       "-created,id",
	Columns:    []string{"product", "from_bin", "to_bin", "quantity", "memo"},
	Timestamps: []string{"created"},
	Fields: []field{
		{Name: "product", Type: typeID, Required: true, Ref: "products", Help: "the Inventory item"},
		{Name: "from_bin", Type: typeID, Ref: "bins", Help: "the bin location the quantity leaves; empty for No bin; it must hold the quantity"},
		{Name: "to_bin", Type: typeID, Ref: "bins", Help: "the active bin location the quantity goes to; empty for No bin; not from_bin"},
		{Name: "quantity", Type: typeNumber, Required: true, Help: "the quantity to move: above 0, with at most 2 decimals, at most what from_bin holds"},
		{Name: "memo", Type: typeString, Help: "why the stock moves, at most 200 characters"},
		{Name: "created_by", Type: typeString, ReadOnly: true, Help: "the id of the user who made the move; Books sets it"},
	},
}

// inventoryResources are the lists of the group, by the command word of each.
func inventoryResources() map[string]*resource {
	return map[string]*resource{
		"moves":     &stockMovesResource,
		"layers":    &stockLayersResource,
		"bin-stock": &binStockResource,
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
		buildListCmd(c, &binStockResource, commandDef{
			Name:  "bin-stock",
			Short: "List the quantity of each Inventory item in each bin location",
			Long: "List the quantity of each Inventory item in each bin location. A row with an empty `bin` is the\n" +
				"stock in No bin. The rows of an item add up to its `quantity_on_hand`. A bin has a quantity and\n" +
				"no value: the cost of the stock is the item's.\n\n" +
				"Books writes the rows. A transaction that names no bin moves the stock in the item's\n" +
				"`default_bin` (No bin when it has none); an inventory adjustment line names its `bin`; and\n" +
				"`tinycld books bin-transfers add` moves stock from one bin to another.\n\n" +
				"`--bin \"\"` lists the stock in No bin." + paged,
		}),
	)
	return group
}

func newBinTransfersCmd(c *client.Client) *cobra.Command {
	res := &binTransfersResource
	group := newGroup("bin-transfers", "Bin transfers: moves of stock between bin locations")
	group.Aliases = []string{"bin-transfer"}
	group.AddCommand(
		buildListCmd(c, res, commandDef{
			Name:    "list",
			Short:   "List the moves between bin locations",
			Aliases: []string{"ls"},
			Long: "List the moves of stock between bin locations, the newest first. A move changes the quantity in\n" +
				"two bins and nothing else: no cost, no stock move, no journal entry. A move is never changed or\n" +
				"deleted; a move back corrects it.\n\n" +
				fmt.Sprint(defaultListLimit) + " to a page. " + pagingText,
		}),
		newShowCmd(c, res),
		newBinTransferAddCmd(c),
	)
	return group
}

func newBinTransferAddCmd(c *client.Client) *cobra.Command {
	res := &binTransfersResource
	var input, chosen string
	cmd := newCommand(commandDef{
		Name:    "add",
		Short:   "Move stock between bin locations from a JSON object",
		Aliases: []string{"new", "create"},
		Long: "Move a quantity of an Inventory item from one bin location to another. --input names a JSON\n" +
			"file that holds the move (`product`, `from_bin`, `to_bin`, `quantity`, `memo`), or - to read it\n" +
			"from standard input. An empty `from_bin` or `to_bin` is No bin. The move is dated now.\n\n" +
			"Books refuses a move of an item that is not an Inventory item, two bins that are the same, an\n" +
			"inactive `to_bin`, and a quantity above what `from_bin` holds.\n\n" +
			"`tinycld books schema bin-transfers add` prints the fields.",
		Input:  inputSchema(res, true),
		Output: recordSchema(res),
	}, func(cmd *cobra.Command, _ []string, o output.Options, _ bool) error {
		if err := checkIDFlag(cmd, chosen); err != nil {
			return err
		}
		body, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		if err := checkInput(res, body, true); err != nil {
			return err
		}
		id := chosenID(cmd, chosen)
		show := cmd.Parent().CommandPath() + " show " + id
		if err := refuseStoredID(cmd, c, res.Collection, id, res.Singular, show); err != nil {
			return err
		}
		body["id"] = id
		send := func() error {
			_, err := client.CreateRecord[rawRecord](cmd.Context(), c, res.Collection, body)
			return err
		}
		// A move changes the stock of two bins: a resend of a stored move is
		// refused for its id, and the read of the id says it is done.
		stored := func() (bool, error) { return recordExists(cmd.Context(), c, res.Collection, id) }
		if err := sendResent(cmd.Context(), send, stored); err != nil {
			return explain(err, res.Singular+" "+id, checkThenResend(show, id))
		}
		rec, err := fetchRecord(cmd.Context(), c, res, id)
		if err != nil {
			return err
		}
		o.Info(cmd.ErrOrStderr(), "added %s %s", res.Singular, rec.id())
		return writeRecord(cmd, o, rec)
	})
	bindInput(cmd, &input)
	bindID(cmd, &chosen, "the id of the new move")
	return cmd
}
