package books

import (
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// These tests move stock with inventory adjustments Books writes itself
// (newSystemAdjustment), the one document of this task: a stock-in is a line
// with a quantity and a value, a removal a line with a quantity below zero.

// adjust posts a manual adjustment of the widget's stock as the bookkeeper.
func (se *stockEnv) adjust(date string, lines ...adjustmentLineInput) (*core.Record, error) {
	var r *core.Record
	err := se.app.RunInTransaction(func(tx core.App) error {
		var err error
		r, err = newSystemAdjustment(tx, systemAdjustment{
			Kind: adjustmentKindManual, Date: date, Actor: se.users.bookkeeper.Id, Lines: lines,
		})
		return err
	})
	return r, err
}

func (se *stockEnv) mustAdjust(t testing.TB, date string, lines ...adjustmentLineInput) *core.Record {
	t.Helper()
	r, err := se.adjust(date, lines...)
	if err != nil {
		t.Fatalf("adjust on %s: %v", date, err)
	}
	return r
}

// stockIn is units of the widget in for value cents; stockOut is units out.
func (se *stockEnv) stockIn(units float64, value int64) adjustmentLineInput {
	return adjustmentLineInput{Product: se.widget.Id, Quantity: units, Value: value}
}

func (se *stockEnv) stockOut(units float64) adjustmentLineInput {
	return adjustmentLineInput{Product: se.widget.Id, Quantity: -units}
}

// shrinkage is the Inventory shrinkage account the first adjustment made.
func (se *stockEnv) shrinkage(t testing.TB) *core.Record {
	t.Helper()
	r, err := se.app.FindFirstRecordByFilter("books_accounts", "detail_type = 'inventory_shrinkage'")
	if err != nil {
		t.Fatalf("read the Inventory shrinkage account: %v", err)
	}
	return r
}

func requireEntryLines(t testing.TB, app core.App, entryID string, want ...entryLine) {
	t.Helper()
	if got := entryLinesOf(t, app, entryID); !reflect.DeepEqual(got, want) {
		t.Errorf("entry lines = %+v, want %+v", got, want)
	}
}

func eachCostingMethod(t *testing.T, run func(t *testing.T, se *stockEnv, method string)) {
	t.Helper()
	for _, method := range []string{costingFIFO, costingAverage} {
		t.Run(method, func(t *testing.T) {
			se := newStockEnv(t)
			setCostingMethod(t, se.app, method)
			run(t, se, method)
		})
	}
}

func TestSystemAdjustment_StockInPostsItsValue(t *testing.T) {
	se := newStockEnv(t)
	adj := se.mustAdjust(t, "2026-07-01", se.stockIn(10, 1000))

	if got := [3]string{adj.GetString("status"), adj.GetString("number"), adj.GetString("posted_by")}; got != [3]string{statusPosted, "IA-1", se.users.bookkeeper.Id} {
		t.Errorf("status/number/posted_by = %v, want posted, IA-1 and the bookkeeper", got)
	}
	shrinkage := se.shrinkage(t)
	if shrinkage.GetString("name") != "Inventory shrinkage" || shrinkage.GetString("type") != "cost_of_goods_sold" {
		t.Errorf("the adjustment account is %q of type %q, want Inventory shrinkage, a cost of goods sold account",
			shrinkage.GetString("name"), shrinkage.GetString("type"))
	}
	if adj.GetString("account") != shrinkage.Id {
		t.Errorf("the adjustment names account %q, want Inventory shrinkage", adj.GetString("account"))
	}
	entry := reload(t, se.app, "books_journal_entries", adj.GetString("entry"))
	if got := [3]string{entry.GetString("doc_type"), entry.GetString("document"), entry.GetString("number")}; got != [3]string{docTypeInventoryAdjustment, adj.Id, "IA-1"} {
		t.Errorf("entry doc_type/document/number = %v", got)
	}
	requireEntryLines(t, se.app, entry.Id,
		entryLine{account: se.asset.Id, debit: 1000},
		entryLine{account: shrinkage.Id, credit: 1000},
	)
	requireOnHand(t, se.app, se.widget, 10, 1000)
}

func TestSystemAdjustment_RemovalCostsByTheMethod(t *testing.T) {
	eachCostingMethod(t, func(t *testing.T, se *stockEnv, method string) {
		cost := map[string]int{costingFIFO: 2000, costingAverage: 2250}[method]
		se.mustAdjust(t, "2026-07-01", se.stockIn(10, 1000))
		se.mustAdjust(t, "2026-07-02", se.stockIn(10, 2000))
		out := se.mustAdjust(t, "2026-07-03", se.stockOut(15))
		requireEntryLines(t, se.app, out.GetString("entry"),
			entryLine{account: se.asset.Id, credit: cost},
			entryLine{account: se.shrinkage(t).Id, debit: cost},
		)
		requireOnHand(t, se.app, se.widget, 5, 3000-cost)
	})
}

func TestAdjustment_RevaluationChangesTheValueOnly(t *testing.T) {
	se := newStockEnv(t)
	se.mustAdjust(t, "2026-07-01", se.stockIn(10, 1000))
	revalued := se.mustAdjust(t, "2026-07-02", adjustmentLineInput{Product: se.widget.Id, Value: -400})
	requireEntryLines(t, se.app, revalued.GetString("entry"),
		entryLine{account: se.asset.Id, credit: 400},
		entryLine{account: se.shrinkage(t).Id, debit: 400},
	)
	requireOnHand(t, se.app, se.widget, 10, 600)

	_, err := se.adjust("2026-07-03", adjustmentLineInput{Product: se.widget.Id, Value: -5000})
	requireRefused(t, err, "The value of Widget cannot go below zero on 2026-07-03.")
	requireOnHand(t, se.app, se.widget, 10, 600)
}

func TestAdjustment_RefusesALineItCannotCost(t *testing.T) {
	se := newStockEnv(t)
	service := mkService(t, se.app, "Setup", se.revenue)
	cases := []struct {
		name string
		line adjustmentLineInput
		want string
	}{
		{"neither a quantity nor a value", adjustmentLineInput{Product: se.widget.Id}, "Line 1: Enter a quantity change, a value change, or both."},
		{"a decrease with a value", adjustmentLineInput{Product: se.widget.Id, Quantity: -1, Value: -100}, "Line 1: A quantity decrease takes its cost from the costing method."},
		{"an increase with a value below 0", adjustmentLineInput{Product: se.widget.Id, Quantity: 1, Value: -100}, "Line 1: A quantity increase cannot have a value below 0."},
		{"a product that is not an Inventory item", adjustmentLineInput{Product: service.Id, Quantity: 1, Value: 100}, "Setup is not an Inventory item."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := se.adjust("2026-07-01", tc.line)
			requireRefused(t, err, tc.want)
		})
	}
	_, err := se.adjust("2026-07-01")
	requireRefused(t, err, "Add a line to the inventory adjustment.")
	if n, _ := se.app.CountRecords(inventoryAdjustmentsCollection); n != 0 {
		t.Errorf("%d adjustments after the refusals, want none", n)
	}
}

// The item's own inventory asset account as the adjustment account would post
// no journal line for a change of the stock value.
func TestAdjustment_RefusesTheItemsAssetAccount(t *testing.T) {
	se := newStockEnv(t)
	err := se.app.RunInTransaction(func(tx core.App) error {
		_, err := newSystemAdjustment(tx, systemAdjustment{
			Kind: adjustmentKindManual, Date: "2026-07-01", Actor: se.users.bookkeeper.Id, Account: se.asset.Id,
			Lines: []adjustmentLineInput{se.stockIn(10, 1000)},
		})
		return err
	})
	requireRefused(t, err, "Choose an adjustment account other than the inventory asset account of Widget.")
	requireOnHand(t, se.app, se.widget, 0, 0)
}

// An adjustment with no entry is still held to the close date.
func TestAdjustment_AtNoCostInAClosedPeriodIsRefused(t *testing.T) {
	se := newStockEnv(t)
	if err := setFields(t, se.app, "books_products", se.widget.Id, map[string]any{"cost": 0}); err != nil {
		t.Fatal(err)
	}
	if err := setFields(t, se.app, "books_settings", settingsID, map[string]any{"close_date": "2026-07-15"}); err != nil {
		t.Fatalf("close the books: %v", err)
	}
	_, err := se.adjust("2026-07-01", se.stockOut(2))
	requireRefused(t, err, "The books are closed through 2026-07-15.")
	requireOnHand(t, se.app, se.widget, 0, 0)
}

// The void of an adjustment with no entry is held to the close date too.
func TestAdjustment_AtNoCostVoidInAClosedPeriodIsRefused(t *testing.T) {
	se := newStockEnv(t)
	sample := se.mkInventoryItem(t, "Free sample", 0)
	adj := se.mustAdjust(t, "2026-07-01", adjustmentLineInput{Product: sample.Id, Quantity: 5})
	if err := setFields(t, se.app, "books_settings", settingsID, map[string]any{"close_date": "2026-07-15"}); err != nil {
		t.Fatalf("close the books: %v", err)
	}
	err := se.app.RunInTransaction(func(tx core.App) error {
		return voidSystemAdjustment(tx, adj, se.users.bookkeeper.Id, adj.GetDateTime("posted_at").Time())
	})
	requireRefused(t, err, "The books are closed through 2026-07-15.")
	requireOnHand(t, se.app, sample, 5, 0)
}

// A quantity at no cost has no value to post: the adjustment takes its number
// from the sequence and posts no entry, and its void needs none.
func TestAdjustment_AtNoCostPostsNoEntry(t *testing.T) {
	se := newStockEnv(t)
	sample := se.mkInventoryItem(t, "Free sample", 0)
	adj := se.mustAdjust(t, "2026-07-01", adjustmentLineInput{Product: sample.Id, Quantity: 5})
	if adj.GetString("number") != "IA-1" || adj.GetString("entry") != "" {
		t.Errorf("number %q entry %q, want IA-1 and no entry", adj.GetString("number"), adj.GetString("entry"))
	}
	requireOnHand(t, se.app, sample, 5, 0)
	err := se.app.RunInTransaction(func(tx core.App) error {
		return voidSystemAdjustment(tx, adj, se.users.bookkeeper.Id, adj.GetDateTime("posted_at").Time())
	})
	if err != nil {
		t.Fatalf("void the adjustment: %v", err)
	}
	requireOnHand(t, se.app, sample, 0, 0)
}
