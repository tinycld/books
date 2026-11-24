package books

import "github.com/pocketbase/pocketbase/core"

// docTypeInventoryAdjustment is the doc type of an inventory adjustment's
// sequence and of the entry it posts; entry_type_labels.json holds how a
// reader sees it.
const docTypeInventoryAdjustment = "inventory_adjustment"

const (
	inventoryAdjustmentsCollection     = "books_inventory_adjustments"
	inventoryAdjustmentLinesCollection = "books_inventory_adjustment_lines"
)

// inventoryAdjustmentName names an adjustment by its number: "Inventory
// adjustment IA-3". A draft has no number: "Draft inventory adjustment".
func inventoryAdjustmentName(r *core.Record) string {
	noun, _, draft := entryNouns(docTypeInventoryAdjustment)
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return draft
}
