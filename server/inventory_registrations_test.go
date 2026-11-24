package books

import (
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/oauth"
)

// ADR 3: a token reads and writes the inventory adjustments and their lines,
// and only reads the stock moves and the cost layers, which the server writes.
func TestOAuth_InventoryCollectionsAreScoped(t *testing.T) {
	collections := oauthPackage().Collections
	rw := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	ro := oauth.Access{Read: []string{scopeRead}}
	for c, access := range map[string]oauth.Access{
		"books_inventory_adjustments":      rw,
		"books_inventory_adjustment_lines": rw,
		"books_stock_moves":                ro,
		"books_stock_layers":               ro,
	} {
		got, ok := collections[c]
		if !ok {
			t.Errorf("%s has no OAuth entry", c)
			continue
		}
		if !reflect.DeepEqual(got.Read, access.Read) || !reflect.DeepEqual(got.Write, access.Write) {
			t.Errorf("%s OAuth access = %+v, want Read %v and Write %v", c, got, access.Read, access.Write)
		}
	}
}

// An adjustment and its lines are audited: a person writes them. A line's
// history names its adjustment and its place, and is filed under the
// adjustment.
func TestAudit_InventoryAdjustmentsAreAudited(t *testing.T) {
	env := newLedgerEnv(t)
	audited := auditedCollections(env.app)
	for _, c := range []string{inventoryAdjustmentsCollection, inventoryAdjustmentLinesCollection} {
		if _, ok := audited[c]; !ok {
			t.Fatalf("%s is not audited", c)
		}
	}
	if got := auditParentFields[inventoryAdjustmentLinesCollection]; got != "adjustment" {
		t.Fatalf("parent field of an adjustment line = %q, want adjustment", got)
	}
	shrinkage := mkAccount(t, env.app, "Inventory shrinkage", "cost_of_goods_sold", "other_costs")
	adjustment, err := saveNew(env.app, inventoryAdjustmentsCollection, map[string]any{
		"status": "draft", "kind": "manual", "date": "2026-03-01", "account": shrinkage.Id,
	})
	if err != nil {
		t.Fatalf("save a draft adjustment: %v", err)
	}
	if got := inventoryAdjustmentName(adjustment); got != "Draft inventory adjustment" {
		t.Errorf("name of a draft = %q, want %q", got, "Draft inventory adjustment")
	}
	widget, err := saveNew(env.app, "books_products", map[string]any{
		"type": "inventory", "name": "Widget", "income_account": env.revenue.Id,
	})
	if err != nil {
		t.Fatalf("save an Inventory product: %v", err)
	}
	line, err := saveNew(env.app, inventoryAdjustmentLinesCollection, map[string]any{
		"adjustment": adjustment.Id, "product": widget.Id, "quantity": 1, "value": 100, "position": 1,
	})
	if err != nil {
		t.Fatalf("save an adjustment line: %v", err)
	}
	if got, want := inventoryAdjustmentLineLabel(env.app, line), "Draft inventory adjustment: line 2"; got != want {
		t.Errorf("label of the line = %q, want %q", got, want)
	}
	numbered := core.NewRecord(adjustment.Collection())
	numbered.Set("number", "IA-3")
	if got := inventoryAdjustmentName(numbered); got != "Inventory adjustment IA-3" {
		t.Errorf("name of a numbered adjustment = %q, want %q", got, "Inventory adjustment IA-3")
	}
}
