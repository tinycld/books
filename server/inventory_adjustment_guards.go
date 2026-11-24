package books

import (
	"database/sql"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// maxAdjustmentLines is the most lines one inventory adjustment holds.
const maxAdjustmentLines = 500

// Refusal texts of the inventory adjustment guards. PocketBase adds a final
// period to a text without one; these have theirs.
const (
	msgAdjustmentPostedFromForm = "A draft inventory adjustment is posted from the adjustment form."
	msgAdjustmentKindManual     = "A person makes a manual inventory adjustment only."
	msgAdjustmentKindFixed      = "The kind of an inventory adjustment cannot change."
	msgAdjustmentPostedFixed    = "A posted or void inventory adjustment cannot be changed."
	msgAdjustmentDeleteNotDraft = "Only a draft inventory adjustment can be deleted."
	msgAdjustmentBySystem       = "Books made %s. It changes with the item or the transaction it belongs to."
	msgAdjustmentRowsFixed      = "The lines of a posted or void inventory adjustment cannot change."
	msgAdjustmentRowStays       = "An adjustment line stays on its adjustment."
	msgAdjustmentTooManyLines   = "An inventory adjustment holds at most 500 lines."
	msgAdjustmentLineProduct    = "Choose an Inventory item."
	msgAdjustmentLineDecimals   = "Enter a quantity with at most 2 decimals."
	msgAdjustmentLineTooLarge   = "Enter a quantity between -1,000,000 and 1,000,000."
)

// maxAdjustmentQuantity is the schema's limit of a line's quantity. The guard
// runs before the schema's check, and a larger quantity overflows int64 in
// qtyHundredths.
const maxAdjustmentQuantity = 1000000

// The adjustment fields only Books writes. adjustmentNewBooksFields must be
// empty on a new adjustment; adjustmentKeptBooksFields cannot change while a
// person edits or posts a draft. posted_by is not kept: the request hook, or a
// Go caller, names the poster with the post. The rules pin them for a person;
// these checks hold for Go and a superuser too.
var (
	adjustmentNewBooksFields = []string{
		"number", "sequence", "source", "document", "entry", "posted_at", "posted_by", "voided_at", "voided_by",
	}
	adjustmentKeptBooksFields = []string{
		"number", "sequence", "source", "document", "currency", "entry", "posted_at", "voided_at", "voided_by",
	}
	voidAdjustmentEditable = map[string]bool{"status": true, "voided_by": true, "voided_at": true}
)

// registerInventoryAdjustmentGuards binds the adjustment and line guards
// inside serialized, so no other write can commit between a check and the
// write it allows. A person's adjustment is a deposit's lifecycle: a draft is
// edited and posted (postInventoryAdjustment), a posted one is voided
// (voidInventoryAdjustment), and a draft alone is deleted; its lines change
// only while it is a draft. An adjustment Books writes itself
// (newSystemAdjustment, voidSystemAdjustment) passes under
// markSystemAdjustment: the caller does the posting.
func registerInventoryAdjustmentGuards(app core.App) {
	bindSerializedGuard(app, inventoryAdjustmentsCollection, func(tx core.App, stored, r *core.Record) error {
		if hasTxMark(tx, markSystemAdjustment, r.Id) {
			return nil
		}
		if stored == nil {
			return createInventoryAdjustment(tx, r)
		}
		return transitionInventoryAdjustment(tx, stored, r, time.Now())
	})
	app.OnRecordDelete(inventoryAdjustmentsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			stored, err := tx.FindRecordById(inventoryAdjustmentsCollection, e.Record.Id)
			if err != nil {
				return fmt.Errorf("books: read the adjustment to delete: %w", err)
			}
			if stored.GetString("status") != statusDraft {
				return refuse(msgAdjustmentDeleteNotDraft)
			}
			return nil
		})
	})
	// A person's post or void is stamped with who did it, on the transition
	// only; the update rule refuses these fields in a person's body.
	app.OnRecordUpdateRequest(inventoryAdjustmentsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		from, to := e.Record.Original().GetString("status"), e.Record.GetString("status")
		if from != to {
			switch to {
			case statusPosted:
				stampActor(e.Record, "posted_by", e.Auth)
			case statusVoid:
				stampActor(e.Record, "voided_by", e.Auth)
			}
		}
		return e.Next()
	})

	bindSerializedGuard(app, inventoryAdjustmentLinesCollection, validateInventoryAdjustmentLine)
	app.OnRecordDelete(inventoryAdjustmentLinesCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			// A draft's delete cascades its lines after the adjustment row is
			// gone: nothing is left to hold them.
			adjustment, err := tx.FindRecordById(inventoryAdjustmentsCollection, e.Record.GetString("adjustment"))
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			if err != nil {
				return fmt.Errorf("books: read the line's adjustment: %w", err)
			}
			if adjustment.GetString("status") != statusDraft {
				return refuse(msgAdjustmentRowsFixed)
			}
			return nil
		})
	})
}

// createInventoryAdjustment guards a new adjustment a person makes: a manual
// draft with none of the fields Books writes, in the books currency.
func createInventoryAdjustment(tx core.App, r *core.Record) error {
	ensureRecordID(r)
	if r.GetString("status") != statusDraft {
		return refuse(msgAdjustmentPostedFromForm)
	}
	if r.GetString("kind") != adjustmentKindManual {
		return refuseField("kind", msgAdjustmentKindManual)
	}
	var set []string
	for _, name := range adjustmentNewBooksFields {
		// An empty number field reads "0".
		if v := r.GetString(name); v != "" && v != "0" {
			set = append(set, name)
		}
	}
	if err := refuseServerFields(set); err != nil {
		return err
	}
	if err := stampCurrency(tx, r); err != nil {
		return err
	}
	return checkAdjustmentHeader(tx, nil, r)
}

// transitionInventoryAdjustment is the lifecycle of an adjustment a person
// writes. stored is the row before the update. A posted adjustment changes
// only to void, and a void one never, except for a link PocketBase clears
// because its row is gone. A person voids a manual adjustment only: an opening
// adjustment changes with its item, a re-cost with its transaction.
func transitionInventoryAdjustment(tx core.App, stored, r *core.Record, now time.Time) error {
	if stored.GetString("kind") != r.GetString("kind") {
		return refuseField("kind", msgAdjustmentKindFixed)
	}
	from, to := stored.GetString("status"), r.GetString("status")
	switch {
	case from == statusDraft && to == statusDraft:
		if err := checkAdjustmentBooksFieldsKept(stored, r); err != nil {
			return err
		}
		return checkAdjustmentHeader(tx, stored, r)
	case from == statusDraft && to == statusPosted:
		if err := checkAdjustmentBooksFieldsKept(stored, r); err != nil {
			return err
		}
		if err := checkAdjustmentHeader(tx, stored, r); err != nil {
			return err
		}
		return postInventoryAdjustment(tx, r, now)
	case from == statusPosted && to == statusVoid:
		if len(changedFields(stored, r, voidAdjustmentEditable)) > 0 {
			return refuse(msgAdjustmentPostedFixed)
		}
		if stored.GetString("kind") != adjustmentKindManual {
			return refuseNamed(msgAdjustmentBySystem, inventoryAdjustmentName(stored))
		}
		return voidInventoryAdjustment(tx, r, now)
	case from == to:
		unlinks, err := onlySalesDocUnlinks(tx, stored, r)
		if err != nil || unlinks {
			return err
		}
		return refuse(msgAdjustmentPostedFixed)
	case from != statusDraft:
		return refuse(msgAdjustmentPostedFixed)
	}
	return refuse(msgSalesDocCannotGo, inventoryAdjustmentName(stored), from, to)
}

func checkAdjustmentBooksFieldsKept(stored, r *core.Record) error {
	var changed []string
	for _, name := range adjustmentKeptBooksFields {
		if stored.GetString(name) != r.GetString(name) {
			changed = append(changed, name)
		}
	}
	return refuseServerFields(changed)
}

// checkAdjustmentHeader runs the header guards of a draft write and sets the
// sort key: the date is a real day when the write sets it, and an adjustment
// account the write sets is active and is not Accounts receivable or Accounts
// payable. A draft may name no account; the post gives it Inventory shrinkage
// (adjustmentAccount). stored is the row before an update, nil on a create.
func checkAdjustmentHeader(tx core.App, stored, r *core.Record) error {
	if day := r.GetString("date"); stored == nil || stored.GetString("date") != day {
		if _, err := parseDay(day); err != nil {
			return refuseDocumentDay("date", err)
		}
	}
	if account := r.GetString("account"); account != "" && (stored == nil || stored.GetString("account") != account) {
		// Checks only: the draft keeps the account it names.
		if _, err := adjustmentAccount(tx, r); err != nil {
			return err
		}
	}
	r.Set("sort_key", salesDocSortKey(r))
	return nil
}

// validateInventoryAdjustmentLine guards a line a person writes: its
// adjustment is a draft and stays its adjustment, its product is an Inventory
// item, and Books can cost its two numbers (adjustmentLineFault). The post
// checks every line again. A line Books writes itself passes.
func validateInventoryAdjustmentLine(tx core.App, stored, r *core.Record) error {
	id := r.GetString("adjustment")
	if hasTxMark(tx, markSystemAdjustment, id) {
		return nil
	}
	if stored != nil && stored.GetString("adjustment") != id {
		return refuseField("adjustment", msgAdjustmentRowStays)
	}
	adjustment, err := tx.FindRecordById(inventoryAdjustmentsCollection, id)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses the line: adjustment is a required relation.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the line's adjustment: %w", err)
	}
	if adjustment.GetString("status") != statusDraft {
		return refuse(msgAdjustmentRowsFixed)
	}
	if stored == nil {
		ensureRecordID(r)
		n, err := tx.CountRecords(inventoryAdjustmentLinesCollection, dbx.HashExp{"adjustment": id})
		if err != nil {
			return fmt.Errorf("books: count the adjustment's lines: %w", err)
		}
		if n >= maxAdjustmentLines {
			return refuse(msgAdjustmentTooManyLines)
		}
	}
	product, err := tx.FindRecordById("books_products", r.GetString("product"))
	if errors.Is(err, sql.ErrNoRows) {
		return refuseField("product", msgAdjustmentLineProduct)
	}
	if err != nil {
		return fmt.Errorf("books: read the line's product: %w", err)
	}
	if product.GetString("type") != "inventory" {
		return refuseNamedField("product", msgStockNotInventory, product.GetString("name"))
	}
	// The stock move holds hundredths: a third decimal would post a quantity
	// the line does not show.
	qty := r.GetFloat("quantity")
	if math.Abs(qty) > maxAdjustmentQuantity {
		return refuseField("quantity", msgAdjustmentLineTooLarge)
	}
	if qtyFromHundredths(qtyHundredths(qty)) != qty {
		return refuseField("quantity", msgAdjustmentLineDecimals)
	}
	if fault := adjustmentLineFault(qtyHundredths(r.GetFloat("quantity")), int64(r.GetInt("value"))); fault != "" {
		return refuseField("value", "%s", fault)
	}
	return nil
}
