package books

import (
	"database/sql"
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Bin locations and the moves of stock between them (inventory-adjust spec
// §3.7, §3.8 and §4; pb-migrations/2100000049_create_books_bins.js). A bin has
// a quantity of each item (bin_stock.go) and no value. The bin guard keeps the
// name unique without regard to case and refuses the delete of a bin while
// anything names it; the transfer guard checks a move between bins and changes
// the two bins' quantities in the transaction of the move.

// Refusal texts. server/testdata/bin_messages.json holds the five that the
// client says too (nameTaken, inUse, sameBins, holds, holdsNone); bins_test.go and
// tests/bin-messages.test.ts fail when a word drifts. A text that starts with a
// bin's name keeps the name as typed (refuseNamed).
const (
	msgBinNameTaken            = "A bin location named %s exists."
	msgBinInUse                = "%s has stock or history. Make it inactive instead."
	msgBinsSame                = "Choose two different bin locations."
	msgBinHolds                = "%s holds %s. Move %s or fewer."
	msgBinHoldsNone            = "%s holds none of this item."
	msgBinInactive             = "%s is inactive. Choose another bin location."
	msgBinMissing              = "The bin location does not exist."
	msgDefaultBinInventoryOnly = "Only an Inventory item has a default bin."
	msgBinMoveInventoryOnly    = "Only an Inventory item has stock to move."
)

// noBinLabel names the stock in no bin, as the screens do (NO_BIN_LABEL).
const noBinLabel = "No bin"

// The reads of the bin delete guard: one for each kind of row that names a bin.
// Every value is bound.
var binReferenceQueries = []string{
	"SELECT 1 FROM books_bin_stock WHERE bin = {:bin} LIMIT 1",
	"SELECT 1 FROM books_stock_moves WHERE bin = {:bin} LIMIT 1",
	"SELECT 1 FROM books_inventory_adjustment_lines WHERE bin = {:bin} LIMIT 1",
	"SELECT 1 FROM books_bin_transfers WHERE from_bin = {:bin} OR to_bin = {:bin} LIMIT 1",
	"SELECT 1 FROM books_products WHERE default_bin = {:bin} LIMIT 1",
}

// sqlBinNameTaken finds another bin with the name, compared by lower case as
// the unique index idx_books_bins_name compares it.
const sqlBinNameTaken = "SELECT 1 FROM books_bins WHERE lower(name) = lower({:name}) AND id != {:id} LIMIT 1"

// registerBinGuards binds the bin guard, the bin delete guard and the guard of
// a move between bins. Each reads inside serialized, so no other write commits
// between the check and the write it allows. A move between bins has no update
// and no delete rule, so only its create has a guard.
func registerBinGuards(app core.App) {
	bindSerializedGuard(app, binsCollection, validateBin)
	app.OnRecordDelete(binsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			return checkBinDelete(tx, e.Record)
		})
	})
	app.OnRecordCreateRequest(binTransfersCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		stampActor(e.Record, "created_by", e.Auth)
		return e.Next()
	})
	app.OnRecordCreate(binTransfersCollection).BindFunc(func(e *core.RecordEvent) error {
		return serializedThen(e, func(tx core.App) error {
			return validateBinTransfer(tx, e.Record)
		}, func(tx core.App) error {
			return moveBetweenBins(tx, e.Record)
		})
	})
}

// validateBin stores the name trimmed and its sort key, and refuses a name
// another bin has without regard to case. A bin may take a new case of its own
// name. stored is the record before an update, nil on a create.
func validateBin(tx core.App, _, r *core.Record) error {
	name := strings.TrimSpace(r.GetString("name"))
	r.Set("name", name)
	r.Set("sort_key", sortName(name))
	if name == "" {
		// The schema refuses an empty name.
		return nil
	}
	var one int
	err := tx.DB().NewQuery(sqlBinNameTaken).Bind(dbx.Params{"name": name, "id": r.Id}).Row(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: look up bin names: %w", err)
	}
	return refuseField("name", msgBinNameTaken, name)
}

// checkBinDelete refuses the delete of a bin that a quantity, a stock move, an
// adjustment line, a move between bins or an item's default bin names.
func checkBinDelete(tx core.App, r *core.Record) error {
	for _, q := range binReferenceQueries {
		var one int
		err := tx.DB().NewQuery(q).Bind(dbx.Params{"bin": r.Id}).Row(&one)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return fmt.Errorf("books: look up what names the bin: %w", err)
		}
		return refuseNamed(msgBinInUse, r.GetString("name"))
	}
	return nil
}

// findBin reads the bin a field names; a missing bin refuses the write on
// that field.
func findBin(tx core.App, field, id string) (*core.Record, error) {
	bin, err := tx.FindRecordById(binsCollection, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, refuseField(field, msgBinMissing)
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the bin location: %w", err)
	}
	return bin, nil
}

// checkActiveBin refuses a field that names a missing or an inactive bin.
func checkActiveBin(tx core.App, field, id string) error {
	bin, err := findBin(tx, field, id)
	if err != nil {
		return err
	}
	if bin.GetBool("inactive") {
		return refuseNamedField(field, msgBinInactive, bin.GetString("name"))
	}
	return nil
}

// validateBinTransfer checks a move between bins: the product is an Inventory
// item, the two bins differ, each bin it names exists and the To bin is
// active, the quantity is above 0 with at most 2 decimals, and the From bin
// holds it. An empty bin id is No bin on either side.
func validateBinTransfer(tx core.App, r *core.Record) error {
	product, err := tx.FindRecordById("books_products", r.GetString("product"))
	if errors.Is(err, sql.ErrNoRows) {
		return refuseField("product", msgItemProductMissing)
	}
	if err != nil {
		return fmt.Errorf("books: read the product of the move between bins: %w", err)
	}
	if !isInventoryProduct(product) {
		return refuseField("product", msgBinMoveInventoryOnly)
	}
	from, to := r.GetString("from_bin"), r.GetString("to_bin")
	if from == to {
		return refuseField("to_bin", msgBinsSame)
	}
	fromName := noBinLabel
	if from != "" {
		bin, err := findBin(tx, "from_bin", from)
		if err != nil {
			return err
		}
		fromName = bin.GetString("name")
	}
	if to != "" {
		if err := checkActiveBin(tx, "to_bin", to); err != nil {
			return err
		}
	}
	q := r.GetFloat("quantity")
	if q <= 0 || q > maxAdjustmentQuantity || math.Abs(q*100-math.Round(q*100)) > 1e-6 {
		return refuseField("quantity", msgItemQuantity)
	}
	held, err := binQuantity(tx, product.Id, from)
	if err != nil {
		return err
	}
	// A bin may go below zero (spec §8): one that holds 0 or less has nothing
	// to move, and "holds -3. Move -3 or fewer." asks for no move at all.
	if held <= 0 {
		return refuseNamedField("quantity", msgBinHoldsNone, fromName)
	}
	if qtyHundredths(q) > held {
		text := formatQuantity(qtyFromHundredths(held))
		return refuseNamedField("quantity", msgBinHolds, fromName, text, text)
	}
	r.Set("quantity", qtyFromHundredths(qtyHundredths(q)))
	return nil
}

// moveBetweenBins takes the quantity of a saved move out of its From bin and
// puts it in its To bin. It writes no stock move, no journal entry and no
// quantity on hand or stock value: the item's stock does not change.
func moveBetweenBins(tx core.App, r *core.Record) error {
	product, q := r.GetString("product"), qtyHundredths(r.GetFloat("quantity"))
	if err := moveBinStock(tx, product, r.GetString("from_bin"), -q); err != nil {
		return err
	}
	return moveBinStock(tx, product, r.GetString("to_bin"), q)
}
