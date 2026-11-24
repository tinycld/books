package books

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// These tests write adjustments the way a person's request does once the rules
// passed and the request hook stamped who posts or voids.

func newAdjustmentEnv(t *testing.T) *stockEnv {
	t.Helper()
	se := newStockEnv(t)
	registerInventoryAdjustmentGuards(se.app)
	return se
}

func (se *stockEnv) draftAdjustment(t testing.TB, date string, lines ...adjustmentLineInput) *core.Record {
	t.Helper()
	r, err := saveNew(se.app, inventoryAdjustmentsCollection, map[string]any{
		"status": statusDraft, "kind": adjustmentKindManual, "date": date,
	})
	if err != nil {
		t.Fatalf("save a draft adjustment: %v", err)
	}
	for i, l := range lines {
		if _, err := se.adjustmentLine(r, i, l); err != nil {
			t.Fatalf("save adjustment line %d: %v", i+1, err)
		}
	}
	return r
}

func (se *stockEnv) adjustmentLine(adjustment *core.Record, position int, l adjustmentLineInput) (*core.Record, error) {
	return saveNew(se.app, inventoryAdjustmentLinesCollection, map[string]any{
		"adjustment": adjustment.Id, "product": l.Product, "quantity": l.Quantity, "value": l.Value, "position": position,
	})
}

func (se *stockEnv) postAdjustment(id string) error {
	return setFieldsOf(se.app, inventoryAdjustmentsCollection, id, map[string]any{
		"status": statusPosted, "posted_by": se.users.bookkeeper.Id,
	})
}

func (se *stockEnv) voidAdjustment(id string) error {
	return setFieldsOf(se.app, inventoryAdjustmentsCollection, id, map[string]any{
		"status": statusVoid, "voided_by": se.users.bookkeeper.Id,
	})
}

func setFieldsOf(app core.App, collection, id string, fields map[string]any) error {
	r, err := app.FindRecordById(collection, id)
	if err != nil {
		return err
	}
	for k, v := range fields {
		r.Set(k, v)
	}
	return app.Save(r)
}

func TestInventoryAdjustment_APersonPostsAndVoids(t *testing.T) {
	se := newAdjustmentEnv(t)
	draft := se.draftAdjustment(t, "2026-07-01", se.stockIn(10, 1000))
	if draft.GetString("number") != "" || draft.GetString("currency") != "USD" {
		t.Errorf("draft number %q currency %q, want no number and USD", draft.GetString("number"), draft.GetString("currency"))
	}
	requireOnHand(t, se.app, se.widget, 0, 0)

	if err := se.postAdjustment(draft.Id); err != nil {
		t.Fatalf("post: %v", err)
	}
	posted := reload(t, se.app, inventoryAdjustmentsCollection, draft.Id)
	if posted.GetString("number") != "IA-1" || posted.GetString("entry") == "" || posted.GetString("account") != se.shrinkage(t).Id {
		t.Errorf("posted number %q entry %q account %q, want IA-1, an entry and Inventory shrinkage",
			posted.GetString("number"), posted.GetString("entry"), posted.GetString("account"))
	}
	requireOnHand(t, se.app, se.widget, 10, 1000)

	requireRefused(t, setFieldsOf(se.app, inventoryAdjustmentsCollection, draft.Id, map[string]any{"memo": "Later"}),
		"A posted or void inventory adjustment cannot be changed.")
	_, err := se.adjustmentLine(posted, 1, se.stockIn(1, 100))
	requireRefused(t, err, "The lines of a posted or void inventory adjustment cannot change.")
	requireRefused(t, se.app.Delete(posted), "Only a draft inventory adjustment can be deleted.")

	if err := se.voidAdjustment(draft.Id); err != nil {
		t.Fatalf("void: %v", err)
	}
	if got := reload(t, se.app, "books_journal_entries", posted.GetString("entry")).GetString("status"); got != statusVoid {
		t.Errorf("the entry is %s after the void, want void", got)
	}
	requireOnHand(t, se.app, se.widget, 0, 0)
	requireRefused(t, se.postAdjustment(draft.Id), "A posted or void inventory adjustment cannot be changed.")
}

func TestInventoryAdjustment_ADraftIsEditedAndDeleted(t *testing.T) {
	se := newAdjustmentEnv(t)
	draft := se.draftAdjustment(t, "2026-07-01", se.stockIn(10, 1000))
	if err := setFieldsOf(se.app, inventoryAdjustmentsCollection, draft.Id, map[string]any{"date": "2026-07-02", "account": se.rent.Id}); err != nil {
		t.Fatalf("edit the draft: %v", err)
	}
	if err := se.app.Delete(reload(t, se.app, inventoryAdjustmentsCollection, draft.Id)); err != nil {
		t.Fatalf("delete the draft: %v", err)
	}
	if n, _ := se.app.CountRecords(inventoryAdjustmentLinesCollection); n != 0 {
		t.Errorf("%d lines after the draft's delete, want none", n)
	}
}

func TestInventoryAdjustment_CreateGuards(t *testing.T) {
	se := newAdjustmentEnv(t)
	receivables, err := ensureReceivables(se.app)
	if err != nil {
		t.Fatal(err)
	}
	inactive := mkAccount(t, se.app, "Old losses", "expense", "bad_debts")
	if err := setFields(t, se.app, "books_accounts", inactive.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatal(err)
	}
	base := func(over map[string]any) map[string]any {
		fields := map[string]any{"status": statusDraft, "kind": adjustmentKindManual, "date": "2026-07-01"}
		for k, v := range over {
			fields[k] = v
		}
		return fields
	}
	cases := []struct {
		name string
		over map[string]any
		want string
	}{
		{"posted at once", map[string]any{"status": statusPosted}, "A draft inventory adjustment is posted from the adjustment form."},
		{"an opening adjustment", map[string]any{"kind": adjustmentKindOpening}, "A person makes a manual inventory adjustment only."},
		{"a re-cost", map[string]any{"kind": adjustmentKindRecost}, "A person makes a manual inventory adjustment only."},
		{"a number", map[string]any{"number": "IA-9"}, "Books sets these fields itself: number."},
		{"a source", map[string]any{"source": "books_invoices", "document": "inv000000000001"}, "Books sets these fields itself: source, document."},
		{"a day that does not exist", map[string]any{"date": "2026-02-30"}, "Enter a date"},
		{"Accounts receivable", map[string]any{"account": receivables.Id}, "Choose an adjustment account other than Accounts receivable or Accounts payable."},
		{"an inactive account", map[string]any{"account": inactive.Id}, "Old losses is inactive. Choose an active adjustment account."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := saveNew(se.app, inventoryAdjustmentsCollection, base(tc.over))
			requireRefused(t, err, tc.want)
		})
	}
}

func TestInventoryAdjustment_LineGuards(t *testing.T) {
	se := newAdjustmentEnv(t)
	service := mkService(t, se.app, "Setup", se.revenue)
	draft := se.draftAdjustment(t, "2026-07-01")
	other := se.draftAdjustment(t, "2026-07-01")

	_, err := se.adjustmentLine(draft, 0, adjustmentLineInput{Product: service.Id, Quantity: 1, Value: 100})
	requireFieldRefusal(t, err, "product", "Setup is not an Inventory item.")
	_, err = se.adjustmentLine(draft, 0, adjustmentLineInput{Product: se.widget.Id})
	requireFieldRefusal(t, err, "value", "Enter a quantity change, a value change, or both.")
	_, err = se.adjustmentLine(draft, 0, adjustmentLineInput{Product: se.widget.Id, Quantity: -2, Value: -100})
	requireFieldRefusal(t, err, "value", "A quantity decrease takes its cost from the costing method. Enter the value change on a line of its own.")
	_, err = se.adjustmentLine(draft, 0, adjustmentLineInput{Product: se.widget.Id, Quantity: 2, Value: -100})
	requireFieldRefusal(t, err, "value", "A quantity increase cannot have a value below 0.")
	_, err = se.adjustmentLine(draft, 0, adjustmentLineInput{Product: se.widget.Id, Quantity: 1.005, Value: 100})
	requireFieldRefusal(t, err, "quantity", "Enter a quantity with at most 2 decimals.")

	line, err := se.adjustmentLine(draft, 0, se.stockOut(2))
	if err != nil {
		t.Fatalf("save a removal line: %v", err)
	}
	requireFieldRefusal(t, setFieldsOf(se.app, inventoryAdjustmentLinesCollection, line.Id, map[string]any{"adjustment": other.Id}),
		"adjustment", "An adjustment line stays on its adjustment.")
	if err := se.app.Delete(line); err != nil {
		t.Fatalf("delete a draft's line: %v", err)
	}
	requireRefused(t, se.postAdjustment(draft.Id), "Add a line to the inventory adjustment.")
}

// A person cannot void or change what Books made: an opening adjustment
// changes with its item, a re-cost with its transaction.
func TestInventoryAdjustment_APersonCannotVoidWhatBooksMade(t *testing.T) {
	se := newAdjustmentEnv(t)
	out := se.mustAdjust(t, "2026-07-01", se.stockOut(4))
	se.mustAdjust(t, "2026-07-02", se.stockIn(10, 7000))
	recosts := recostsOf(t, se.app, out)
	if len(recosts) != 1 {
		t.Fatalf("%d re-costs of the removal, want 1", len(recosts))
	}
	recost := recosts[0]

	requireMessageOnlyRefusal(t, se.voidAdjustment(recost.Id),
		"Books made Inventory adjustment IA-2. It changes with the item or the transaction it belongs to.")
	requireRefused(t, setFieldsOf(se.app, inventoryAdjustmentsCollection, recost.Id, map[string]any{"kind": adjustmentKindManual}),
		"The kind of an inventory adjustment cannot change.")
	// A manual adjustment's void still voids its re-cost.
	if err := se.voidAdjustment(out.Id); err != nil {
		t.Fatalf("void the removal: %v", err)
	}
	if got := reload(t, se.app, inventoryAdjustmentsCollection, recost.Id).GetString("status"); got != statusVoid {
		t.Errorf("the re-cost is %s after its document's void, want void", got)
	}
	requireOnHand(t, se.app, se.widget, 10, 7000)
}
