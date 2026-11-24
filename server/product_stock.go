package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The rules of an Inventory item (books design, "Inventory"), on top of the
// rules every item has (validateProductAccounts). The type is given to a new
// product and never changes. The item names an inventory asset account and a
// cost of goods sold account (expense_account); one it leaves empty takes the
// chart's. quantity_on_hand and stock_value are the store's (stock.go). The
// opening quantity and value post as an opening inventory adjustment.

// Refusal texts of an Inventory item.
const (
	msgInventoryTypeFixed      = "An Inventory item cannot change type."
	msgInventoryOnlyNew        = "Only a new product can be an Inventory item."
	msgStockFieldsInventory    = "Only an Inventory item has an inventory asset account, a reorder point and opening stock."
	msgStockTotalsFixed        = "Books sets the quantity on hand and the stock value itself."
	msgAssetAccountMissing     = "The inventory asset account does not exist."
	msgAssetAccountInactive    = "The inventory asset account is inactive."
	msgAssetAccountType        = "The inventory asset account must be an Other current asset account."
	msgAssetAccountFixed       = "The inventory asset account cannot change after the item has stock transactions."
	msgCogsAccountType         = "The cost of goods sold account must be a Cost of goods sold account."
	msgPreferredVendorMissing  = "The preferred vendor does not exist."
	msgOpeningDateRequired     = "Enter the date of the opening quantity."
	msgOpeningQuantityRequired = "Enter an opening quantity for the opening value."
	msgOpeningQuantityNegative = "An opening quantity cannot be below 0."
	msgOpeningQuantityDecimals = "Enter an opening quantity with at most 2 decimals."
	msgProductOnOneAdjustment  = "This product or service is on 1 inventory adjustment. Make it inactive instead."
	msgProductOnAdjustments    = "This product or service is on %d inventory adjustments. Make it inactive instead."
)

// isInventoryProduct reports whether r is an Inventory item: a product whose
// stock Books tracks.
func isInventoryProduct(r *core.Record) bool {
	return r.GetString("type") == "inventory"
}

// hasStockFields reports whether r carries a field only an Inventory item has.
func hasStockFields(r *core.Record) bool {
	return r.GetString("asset_account") != "" ||
		r.GetFloat("reorder_point") != 0 ||
		r.GetFloat("opening_quantity") != 0 ||
		r.GetInt("opening_value") != 0 ||
		r.GetString("opening_date") != ""
}

// checkStockTotalsKept refuses a write that sets quantity_on_hand or
// stock_value, unless the store is writing them (markStockWrite). A write that
// leaves them as it loaded them takes the stored ones: a posting may have
// moved the stock between the load and this guard, and that is no fault of a
// rename. A write that holds the stored ones passes too (a Go caller that
// saves one record again after its stock moved).
func checkStockTotalsKept(tx core.App, stored, r *core.Record) error {
	if hasTxMark(tx, markStockWrite, r.Id) {
		return nil
	}
	same := func(to *core.Record) bool {
		return to != nil && r.GetFloat("quantity_on_hand") == to.GetFloat("quantity_on_hand") && r.GetInt("stock_value") == to.GetInt("stock_value")
	}
	if !same(r.Original()) && !same(stored) {
		return refuse(msgStockTotalsFixed)
	}
	if stored != nil {
		r.Set("quantity_on_hand", stored.GetFloat("quantity_on_hand"))
		r.Set("stock_value", stored.GetInt("stock_value"))
	}
	return nil
}

// validateInventoryItem runs before the accounts every item has are checked.
// It turns purchasing on (an Inventory item is bought), gives an item with no
// inventory asset or cost of goods sold account the chart's, and checks the
// asset account, the cost of goods sold account's type, the preferred vendor
// and the opening fields when the write changes them. stored is the record
// before an update, nil on a create.
func validateInventoryItem(tx core.App, stored, r *core.Record) error {
	r.Set("purchases", true)
	if r.GetString("asset_account") == "" {
		account, err := ensureInventoryAsset(tx)
		if err != nil {
			return err
		}
		r.Set("asset_account", account.Id)
	}
	if r.GetString("expense_account") == "" {
		account, err := ensureCostOfGoodsSold(tx)
		if err != nil {
			return err
		}
		r.Set("expense_account", account.Id)
	}
	if id := r.GetString("asset_account"); stored == nil || stored.GetString("asset_account") != id {
		if stored != nil {
			moves, err := tx.CountRecords(stockMovesCollection, dbx.HashExp{"product": r.Id})
			if err != nil {
				return fmt.Errorf("books: count the item's stock moves: %w", err)
			}
			if moves > 0 {
				return refuseField("asset_account", msgAssetAccountFixed)
			}
		}
		account, err := tx.FindRecordById("books_accounts", id)
		if errors.Is(err, sql.ErrNoRows) {
			return refuseField("asset_account", msgAssetAccountMissing)
		}
		if err != nil {
			return fmt.Errorf("books: read the inventory asset account: %w", err)
		}
		if account.GetBool("inactive") {
			return refuseField("asset_account", msgAssetAccountInactive)
		}
		if account.GetString("type") != "other_current_asset" {
			return refuseField("asset_account", msgAssetAccountType)
		}
	}
	if id := r.GetString("expense_account"); stored == nil || stored.GetString("expense_account") != id {
		account, err := tx.FindRecordById("books_accounts", id)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("books: read the cost of goods sold account: %w", err)
		}
		// validateProductAccounts refuses a missing or an inactive account.
		if err == nil && account.GetString("type") != "cost_of_goods_sold" {
			return refuseField("expense_account", msgCogsAccountType)
		}
	}
	if id := r.GetString("preferred_vendor"); id != "" && (stored == nil || stored.GetString("preferred_vendor") != id) {
		if _, err := tx.FindRecordById("books_vendors", id); errors.Is(err, sql.ErrNoRows) {
			return refuseField("preferred_vendor", msgPreferredVendorMissing)
		} else if err != nil {
			return fmt.Errorf("books: read the preferred vendor: %w", err)
		}
	}
	if !openingChanged(stored, r) {
		return nil
	}
	qty := r.GetFloat("opening_quantity")
	switch {
	case qty < 0:
		// The schema has min 0, but this guard runs first and gives the sentence.
		return refuseField("opening_quantity", msgOpeningQuantityNegative)
	case qty == 0 && r.GetInt("opening_value") != 0:
		return refuseField("opening_quantity", msgOpeningQuantityRequired)
	case qtyFromHundredths(qtyHundredths(qty)) != qty:
		return refuseField("opening_quantity", msgOpeningQuantityDecimals)
	case qty == 0:
		return nil
	case r.GetString("opening_date") == "":
		return refuseField("opening_date", msgOpeningDateRequired)
	}
	if _, err := parseDay(r.GetString("opening_date")); err != nil {
		return refuseDocumentDay("opening_date", err)
	}
	return nil
}

// openingChanged reports whether the write changes the item's opening stock.
// A new item with none has nothing to post.
func openingChanged(stored, r *core.Record) bool {
	if stored == nil {
		return r.GetFloat("opening_quantity") != 0 || r.GetInt("opening_value") != 0
	}
	return stored.GetFloat("opening_quantity") != r.GetFloat("opening_quantity") ||
		stored.GetInt("opening_value") != r.GetInt("opening_value") ||
		stored.GetString("opening_date") != r.GetString("opening_date")
}

func productOnAdjustmentsMessage(count int) string {
	if count == 1 {
		return msgProductOnOneAdjustment
	}
	return fmt.Sprintf(msgProductOnAdjustments, count)
}
