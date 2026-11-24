package books

import (
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// recostsOf are the re-costs of an adjustment, in the order Books posted them.
func recostsOf(t testing.TB, app core.App, document *core.Record) []*core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter(inventoryAdjustmentsCollection,
		"kind = 'recost' && source = {:s} && document = {:d}", "sequence", 0, 0,
		dbx.Params{"s": inventoryAdjustmentsCollection, "d": document.Id})
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

// A stock-in dated before a posted removal changes what the removal cost. The
// removal's entry stays; a re-cost posts the difference on the removal's date.
func TestRecost_BackDatedStockInRecostsTheLaterRemoval(t *testing.T) {
	eachCostingMethod(t, func(t *testing.T, se *stockEnv, method string) {
		// FIFO: the removal now takes the older stock, 5 for 250, not 500.
		// Average: 5 of 20 that cost 1500, 375.
		difference := map[string]int{costingFIFO: 250, costingAverage: 125}[method]
		se.mustAdjust(t, "2026-07-02", se.stockIn(10, 1000))
		out := se.mustAdjust(t, "2026-07-03", se.stockOut(5))
		se.mustAdjust(t, "2026-07-01", se.stockIn(10, 500))

		recosts := recostsOf(t, se.app, out)
		if len(recosts) != 1 {
			t.Fatalf("%d re-costs of the removal, want 1", len(recosts))
		}
		recost := recosts[0]
		got := [4]string{recost.GetString("status"), recost.GetString("date"), recost.GetString("number"), recost.GetString("memo")}
		// The stock-in that caused it posts after it, in the same transaction.
		want := [4]string{statusPosted, "2026-07-03", "IA-3", "Re-cost of Inventory adjustment IA-2"}
		if got != want {
			t.Errorf("re-cost status/date/number/memo = %v, want %v", got, want)
		}
		requireEntryLines(t, se.app, recost.GetString("entry"),
			entryLine{account: se.asset.Id, debit: difference},
			entryLine{account: se.shrinkage(t).Id, credit: difference},
		)
		lines, err := docLineRecords(se.app, inventoryAdjustmentLinesCollection, "adjustment", recost.Id)
		if err != nil || len(lines) != 1 {
			t.Fatalf("lines of the re-cost: %d, err %v, want 1", len(lines), err)
		}
		if lines[0].GetString("product") != se.widget.Id || lines[0].GetFloat("quantity") != 0 || lines[0].GetInt("value") != difference {
			t.Errorf("re-cost line = product %s quantity %v value %d, want the widget, 0 and %d",
				lines[0].GetString("product"), lines[0].GetFloat("quantity"), lines[0].GetInt("value"), difference)
		}
		// The removal's own entry did not change.
		requireEntryLines(t, se.app, out.GetString("entry"),
			entryLine{account: se.asset.Id, credit: 500},
			entryLine{account: se.shrinkage(t).Id, debit: 500},
		)
		drifted, err := driftedStockMoves(se.app, []string{se.widget.Id})
		if err != nil || len(drifted) != 0 {
			t.Errorf("%d moves still differ from the ledger (err %v), want none", len(drifted), err)
		}
	})
}

// Negative stock (spec, Inventory): a removal with no stock posts at the last
// known cost, here the item's purchase cost, and the next stock-in prices it
// again.
func TestRecost_NegativeStockIsRepricedByTheNextStockIn(t *testing.T) {
	eachCostingMethod(t, func(t *testing.T, se *stockEnv, _ string) {
		out := se.mustAdjust(t, "2026-07-01", se.stockOut(4))
		shrinkage := se.shrinkage(t)
		requireEntryLines(t, se.app, out.GetString("entry"),
			entryLine{account: se.asset.Id, credit: 2000},
			entryLine{account: shrinkage.Id, debit: 2000},
		)
		requireOnHand(t, se.app, se.widget, -4, -2000)

		se.mustAdjust(t, "2026-07-02", se.stockIn(10, 7000))
		recosts := recostsOf(t, se.app, out)
		if len(recosts) != 1 {
			t.Fatalf("%d re-costs of the oversold removal, want 1", len(recosts))
		}
		// 4 units at 7.00 are 2800, 800 more than the 2000 the ledger holds.
		requireEntryLines(t, se.app, recosts[0].GetString("entry"),
			entryLine{account: se.asset.Id, credit: 800},
			entryLine{account: shrinkage.Id, debit: 800},
		)
		requireOnHand(t, se.app, se.widget, 6, 4200)
	})
}

// A void of the removal voids its re-cost with it, and the stock comes back.
func TestRecost_IsVoidedWithItsDocument(t *testing.T) {
	se := newStockEnv(t)
	se.mustAdjust(t, "2026-07-02", se.stockIn(10, 1000))
	out := se.mustAdjust(t, "2026-07-03", se.stockOut(5))
	se.mustAdjust(t, "2026-07-01", se.stockIn(10, 500))

	err := se.app.RunInTransaction(func(tx core.App) error {
		fresh, err := tx.FindRecordById(inventoryAdjustmentsCollection, out.Id)
		if err != nil {
			return err
		}
		return voidSystemAdjustment(tx, fresh, se.users.bookkeeper.Id, fresh.GetDateTime("posted_at").Time())
	})
	if err != nil {
		t.Fatalf("void the removal: %v", err)
	}
	recosts := recostsOf(t, se.app, out)
	if len(recosts) != 1 {
		t.Fatalf("%d re-costs of the removal, want 1", len(recosts))
	}
	recost := recosts[0]
	if recost.GetString("status") != statusVoid {
		t.Errorf("the re-cost is %s, want void", recost.GetString("status"))
	}
	for _, id := range []string{out.GetString("entry"), recost.GetString("entry")} {
		if got := reload(t, se.app, "books_journal_entries", id).GetString("status"); got != statusVoid {
			t.Errorf("entry %s is %s, want void", id, got)
		}
	}
	if n, _ := se.app.CountRecords(stockMovesCollection, dbx.HashExp{"document": out.Id}); n != 0 {
		t.Errorf("%d stock moves of the voided removal, want none", n)
	}
	requireOnHand(t, se.app, se.widget, 20, 1500)
}

// ADR 3, Consequences: a re-cost dated in a closed period refuses the post
// that caused it, and nothing of that post is written.
func TestRecost_InAClosedPeriodRefusesThePost(t *testing.T) {
	se := newStockEnv(t)
	se.mustAdjust(t, "2026-07-01", se.stockOut(4))
	if err := setFields(t, se.app, "books_settings", settingsID, map[string]any{"close_date": "2026-07-15"}); err != nil {
		t.Fatalf("close the books: %v", err)
	}
	_, err := se.adjust("2026-07-20", se.stockIn(10, 7000))
	requireRefused(t, err, "The books are closed through 2026-07-15.")
	if n, _ := se.app.CountRecords(inventoryAdjustmentsCollection); n != 1 {
		t.Errorf("%d adjustments after the refusal, want the 1 removal", n)
	}
	requireOnHand(t, se.app, se.widget, -4, -2000)
}
