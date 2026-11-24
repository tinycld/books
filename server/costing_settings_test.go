package books

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func costingSettings(t testing.TB, app core.App) (method string, locked bool) {
	t.Helper()
	row := reload(t, app, "books_settings", settingsID)
	return row.GetString("costing_method"), row.GetBool("costing_locked")
}

func TestCostingMethod_ChangesUntilTheFirstStockMove(t *testing.T) {
	se := newStockEnv(t)
	if method, locked := costingSettings(t, se.app); method != costingFIFO || locked {
		t.Fatalf("new books: method %q locked %v, want fifo and not locked", method, locked)
	}
	setCostingMethod(t, se.app, costingAverage)
	setCostingMethod(t, se.app, costingFIFO)
	requireFieldRefusal(t, setFields(t, se.app, "books_settings", settingsID, map[string]any{"costing_method": ""}),
		"costing_method", "Choose a costing method: FIFO or average cost.")

	// A draft moves no stock, so it does not lock the method.
	registerInventoryAdjustmentGuards(se.app)
	draft := se.draftAdjustment(t, "2026-07-01", se.stockIn(10, 1000))
	if _, locked := costingSettings(t, se.app); locked {
		t.Fatal("a draft adjustment locked the costing method")
	}
	if err := se.postAdjustment(draft.Id); err != nil {
		t.Fatalf("post the adjustment: %v", err)
	}
	if _, locked := costingSettings(t, se.app); !locked {
		t.Fatal("the first stock move did not lock the costing method")
	}
	requireFieldRefusal(t, setFields(t, se.app, "books_settings", settingsID, map[string]any{"costing_method": costingAverage}),
		"costing_method", "The costing method cannot change after the first inventory transaction posts.")
	// The lock does not block another setting, or a write of the same method.
	if err := setFields(t, se.app, "books_settings", settingsID, map[string]any{"close_date": "2026-06-30", "costing_method": costingFIFO}); err != nil {
		t.Errorf("a write that keeps the method is refused: %v", err)
	}

	// Nothing clears the lock: not a void of the only move, not a direct write.
	if err := se.voidAdjustment(draft.Id); err != nil {
		t.Fatalf("void the adjustment: %v", err)
	}
	if _, locked := costingSettings(t, se.app); !locked {
		t.Error("the void cleared the lock")
	}
	requireMessageOnlyRefusal(t, setFields(t, se.app, "books_settings", settingsID, map[string]any{"costing_locked": false}),
		"Books locks the costing method itself.")
}

// The mark lets the store set the lock, never clear it: nothing unlocks.
func TestCostingMethod_TheMarkCannotClearTheLock(t *testing.T) {
	env := newLedgerEnv(t)
	writeLock := func(locked bool) error {
		return env.app.RunInTransaction(func(tx core.App) error {
			defer setTxMark(tx, markCostingLock, settingsID)()
			row, err := tx.FindRecordById("books_settings", settingsID)
			if err != nil {
				return err
			}
			row.Set("costing_locked", locked)
			return tx.Save(row)
		})
	}
	if err := writeLock(true); err != nil {
		t.Fatalf("the store sets the lock under its mark: %v", err)
	}
	requireMessageOnlyRefusal(t, writeLock(false), "Books locks the costing method itself.")
	if _, locked := costingSettings(t, env.app); !locked {
		t.Error("a write under the mark cleared the lock")
	}
}

func TestCostingMethod_ThePersonCannotSetTheLock(t *testing.T) {
	env := newLedgerEnv(t)
	requireMessageOnlyRefusal(t, setFields(t, env.app, "books_settings", settingsID, map[string]any{"costing_locked": true}),
		"Books locks the costing method itself.")
	if _, locked := costingSettings(t, env.app); locked {
		t.Error("the refused write locked the method")
	}
}
