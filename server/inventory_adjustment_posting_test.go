package books

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
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
		{"a product that is not an Inventory item", adjustmentLineInput{Product: service.Id, Quantity: 1, Value: 100}, "Line 1: Setup is not an Inventory item."},
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
	requireFieldRefusal(t, err, "date", "The books are closed through 2026-07-15. Ask a Books admin for a close-date override to post on 2026-07-01.")
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
	requireFieldRefusal(t, err, "date", "The books are closed through 2026-07-15. Ask a Books admin for a close-date override to post on 2026-07-01.")
	requireOnHand(t, se.app, sample, 5, 0)
}

// postAs posts a system adjustment of the given kind and account as the
// bookkeeper.
func (se *stockEnv) postAs(kind, account string, lines ...adjustmentLineInput) (*core.Record, error) {
	var r *core.Record
	err := se.app.RunInTransaction(func(tx core.App) error {
		var err error
		r, err = newSystemAdjustment(tx, systemAdjustment{
			Kind: kind, Date: "2026-07-01", Actor: se.users.bookkeeper.Id, Account: account, Lines: lines,
		})
		return err
	})
	return r, err
}

func TestAdjustment_VoidReversesTheEntryAndTheStock(t *testing.T) {
	se := newStockEnv(t)
	adj := se.mustAdjust(t, "2026-07-01", se.stockIn(10, 1000))
	err := se.app.RunInTransaction(func(tx core.App) error {
		return voidSystemAdjustment(tx, adj, se.users.bookkeeper.Id, adj.GetDateTime("posted_at").Time())
	})
	if err != nil {
		t.Fatalf("void the adjustment: %v", err)
	}
	if got := reload(t, se.app, "books_journal_entries", adj.GetString("entry")).GetString("status"); got != statusVoid {
		t.Errorf("entry status = %q, want void", got)
	}
	if got := reload(t, se.app, inventoryAdjustmentsCollection, adj.Id).GetString("status"); got != statusVoid {
		t.Errorf("adjustment status = %q, want void", got)
	}
	requireOnHand(t, se.app, se.widget, 0, 0)
}

func TestAdjustment_RefusesAReceivableOrPayableAccount(t *testing.T) {
	se := newStockEnv(t)
	for _, typ := range []string{"accounts_receivable", "accounts_payable"} {
		t.Run(typ, func(t *testing.T) {
			account := mkAccount(t, se.app, "Ledger "+typ, typ, typ)
			_, err := se.postAs(adjustmentKindManual, account.Id, se.stockIn(10, 1000))
			requireFieldRefusal(t, err, "account", msgAdjustmentAccountLedger)
			requireOnHand(t, se.app, se.widget, 0, 0)
		})
	}
}

func TestAdjustment_RefusesAnInactiveAccount(t *testing.T) {
	se := newStockEnv(t)
	account := mkAccount(t, se.app, "Old shrinkage", "cost_of_goods_sold", "supplies_materials")
	if err := setFields(t, se.app, "books_accounts", account.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatal(err)
	}
	_, err := se.postAs(adjustmentKindManual, account.Id, se.stockIn(10, 1000))
	requireFieldRefusal(t, err, "account", "Old shrinkage is inactive. Choose an active adjustment account.")
	requireOnHand(t, se.app, se.widget, 0, 0)
}

// An opening quantity with no value comes in at no cost: it is Given at 0, not
// priced at the item's cost, and posts against Opening Balance Equity.
func TestAdjustment_OpeningTakesOpeningBalanceEquityAndComesInAtNoCost(t *testing.T) {
	se := newStockEnv(t)
	adj, err := se.postAs(adjustmentKindOpening, "", adjustmentLineInput{Product: se.widget.Id, Quantity: 5})
	if err != nil {
		t.Fatalf("post the opening adjustment: %v", err)
	}
	account := reload(t, se.app, "books_accounts", adj.GetString("account"))
	if account.GetString("name") != "Opening Balance Equity" {
		t.Errorf("the adjustment account is %q, want Opening Balance Equity", account.GetString("name"))
	}
	requireOnHand(t, se.app, se.widget, 5, 0)
}

// A quantity in with no value comes in at the last known cost.
func TestAdjustment_StockInWithNoValueComesInAtTheLastCost(t *testing.T) {
	se := newStockEnv(t)
	se.mustAdjust(t, "2026-07-01", se.stockIn(10, 1000))
	adj := se.mustAdjust(t, "2026-07-02", se.stockIn(5, 0))
	requireEntryLines(t, se.app, adj.GetString("entry"),
		entryLine{account: se.asset.Id, debit: 500},
		entryLine{account: se.shrinkage(t).Id, credit: 500},
	)
	requireOnHand(t, se.app, se.widget, 15, 1500)
}

func TestAdjustment_OpeningRefusesAQuantityBelowZero(t *testing.T) {
	se := newStockEnv(t)
	_, err := se.postAs(adjustmentKindOpening, "", adjustmentLineInput{Product: se.widget.Id, Quantity: -1})
	requireRefused(t, err, "Line 1: An opening quantity cannot be below 0.")
	requireOnHand(t, se.app, se.widget, 0, 0)
}

// binAdjustEnv is the adjustment guards' book with three bin locations
// (inventory-adjust spec §3.1): Aisle 3 and Front counter active, Back room
// inactive.
type binAdjustEnv struct {
	*stockEnv
	aisle, counter, backRoom *core.Record
}

func newBinAdjustEnv(t *testing.T) *binAdjustEnv {
	t.Helper()
	se := newAdjustmentEnv(t)
	return &binAdjustEnv{
		stockEnv: se,
		aisle:    mkBin(t, se.app, "Aisle 3", false),
		counter:  mkBin(t, se.app, "Front counter", false),
		backRoom: mkBin(t, se.app, "Back room", true),
	}
}

// postLines saves a draft adjustment of lines as a person's writes do and
// posts it as the bookkeeper.
func (e *binAdjustEnv) postLines(t testing.TB, date string, lines ...adjustmentLineInput) *core.Record {
	t.Helper()
	draft := e.draftAdjustment(t, date, lines...)
	if err := e.postAdjustment(draft.Id); err != nil {
		t.Fatalf("post the adjustment of %s: %v", date, err)
	}
	return reload(t, e.app, inventoryAdjustmentsCollection, draft.Id)
}

// Spec §3.1: an inventory adjustment line names its bin. A decrease in Aisle 3
// of an item whose default bin is Front counter changes Aisle 3, not Front
// counter.
func TestAdjustmentBin_ALineMovesStockInItsBin(t *testing.T) {
	e := newBinAdjustEnv(t)
	setDefaultBin(t, e.app, e.widget, e.counter.Id)
	in := e.postLines(t, "2026-07-01", adjustmentLineInput{Product: e.widget.Id, Quantity: 10, Value: 1000, Bin: e.aisle.Id})
	requireMoveInBin(t, e.app, e.widget.Id, inventoryAdjustmentsCollection, in.Id, e.aisle.Id, map[string]float64{})

	before := binStockOf(t, e.app, e.widget.Id)
	out := e.postLines(t, "2026-07-02", adjustmentLineInput{Product: e.widget.Id, Quantity: -4, Bin: e.aisle.Id})
	requireMoveInBin(t, e.app, e.widget.Id, inventoryAdjustmentsCollection, out.Id, e.aisle.Id, before)
	requireSameBinStock(t, binStockOf(t, e.app, e.widget.Id), map[string]float64{e.aisle.Id: 6}, "after the decrease in Aisle 3")
	requireBinsAddUp(t, e.app, e.widget.Id)
}

// Spec §4: a line's bin is refused on a line with no quantity change, at the
// post ("Line n: …") and when a person saves the line.
func TestAdjustmentBin_AValueChangeHasNoBin(t *testing.T) {
	e := newBinAdjustEnv(t)
	e.mustAdjust(t, "2026-07-01", e.stockIn(10, 1000))
	revalue := adjustmentLineInput{Product: e.widget.Id, Value: 300, Bin: e.aisle.Id}

	_, err := e.adjust("2026-07-02", revalue)
	requireRefused(t, err, "Line 1: A value change has no bin.")

	draft := e.draftAdjustment(t, "2026-07-02")
	_, err = e.adjustmentLine(draft, 0, revalue)
	requireRefused(t, err, "A value change has no bin.")
	requireOnHand(t, e.app, e.widget, 10, 1000)
}

// Spec §4: a line's bin is refused when it is inactive, with the bin's name;
// the post checks a saved line again.
func TestAdjustmentBin_AnInactiveBinIsRefused(t *testing.T) {
	e := newBinAdjustEnv(t)
	into := func(bin string) adjustmentLineInput {
		return adjustmentLineInput{Product: e.widget.Id, Quantity: 5, Value: 500, Bin: bin}
	}

	_, err := e.adjust("2026-07-01", into(e.backRoom.Id))
	requireRefused(t, err, "Line 1: Back room is inactive. Choose another bin location.")

	draft := e.draftAdjustment(t, "2026-07-01")
	_, err = e.adjustmentLine(draft, 0, into(e.backRoom.Id))
	requireRefused(t, err, "Back room is inactive. Choose another bin location.")

	shelf := mkBin(t, e.app, "Shelf C", false)
	saved := e.draftAdjustment(t, "2026-07-01", into(shelf.Id))
	if err := setFields(t, e.app, "books_bins", shelf.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Shelf C inactive: %v", err)
	}
	requireRefused(t, e.postAdjustment(saved.Id), "Line 1: Shelf C is inactive. Choose another bin location.")
	requireOnHand(t, e.app, e.widget, 0, 0)
}

// Spec §3.1: the line names its bin, so a line with no bin moves No bin; an
// adjustment line never falls back to the item's default bin.
func TestAdjustmentBin_ALineWithNoBinMovesNoBin(t *testing.T) {
	e := newBinAdjustEnv(t)
	setDefaultBin(t, e.app, e.widget, e.counter.Id)
	in := e.postLines(t, "2026-07-01", adjustmentLineInput{Product: e.widget.Id, Quantity: 5, Value: 500})
	requireMoveInBin(t, e.app, e.widget.Id, inventoryAdjustmentsCollection, in.Id, "", map[string]float64{})
	requireSameBinStock(t, binStockOf(t, e.app, e.widget.Id), map[string]float64{"": 5}, "after the line with no bin")
}

// Spec §4: value_change is written at the post, the sum of the adjustment's
// stock moves' values: here a decrease at its FIFO cost and an increase at a
// given value. A draft holds 0 and a void keeps the posted value.
func TestAdjustment_ValueChangeIsTheSumOfItsMoves(t *testing.T) {
	e := newBinAdjustEnv(t)
	setCostingMethod(t, e.app, costingFIFO)
	e.mustAdjust(t, "2026-07-01", e.stockIn(10, 1000))
	e.mustAdjust(t, "2026-07-02", e.stockIn(10, 2000))
	draft := e.draftAdjustment(t, "2026-07-03",
		adjustmentLineInput{Product: e.widget.Id, Quantity: -15},
		adjustmentLineInput{Product: e.widget.Id, Quantity: 5, Value: 700},
	)
	if got := reload(t, e.app, inventoryAdjustmentsCollection, draft.Id).GetInt("value_change"); got != 0 {
		t.Errorf("the draft's value_change = %d, want 0", got)
	}
	if err := e.postAdjustment(draft.Id); err != nil {
		t.Fatalf("post: %v", err)
	}
	moves, err := documentStockMoves(e.app, inventoryAdjustmentsCollection, draft.Id)
	if err != nil {
		t.Fatal(err)
	}
	sum := 0
	for _, m := range moves {
		sum += m.GetInt("value")
	}
	// 15 out at FIFO: 10 at 1.00 and 5 at 2.00; 5 in at 7.00.
	if sum != -2000+700 {
		t.Fatalf("the adjustment's moves are worth %d, want -1300", sum)
	}
	if got := reload(t, e.app, inventoryAdjustmentsCollection, draft.Id).GetInt("value_change"); got != sum {
		t.Errorf("the posted value_change = %d, want the sum of its moves %d", got, sum)
	}
	if err := e.voidAdjustment(draft.Id); err != nil {
		t.Fatalf("void: %v", err)
	}
	if got := reload(t, e.app, inventoryAdjustmentsCollection, draft.Id).GetInt("value_change"); got != sum {
		t.Errorf("the void's value_change = %d, want the posted %d kept", got, sum)
	}
}

// Spec §4 (value_change, the sum of its stock moves' values at the post): a
// Books re-cost adjustment has no move of its own; the value it posts is the
// drift of the moves it re-costs, and its value_change is that amount, the
// inventory-asset side of its entry. Here a bill of 10 at 1.00, a removal of 5
// (500) and a correction of the bill to 1.20: the removal now costs 600, so
// the re-cost takes 100 more out of the asset.
func TestAdjustment_ARecostsValueChangeIsTheDriftItPosts(t *testing.T) {
	e := newBuyStockEnv(t, costingFIFO)
	original := e.billOf(t, "2026-07-01", 10, 100, nil)
	out := e.stock.mustAdjust(t, "2026-07-02", e.stock.stockOut(5))
	draft := mkBill(t, e.app, e.summit, map[string]any{"date": "2026-07-01", "due_date": "2026-07-01", "replaces": original.Id})
	mkBillLine(t, e.app, draft, 0, productLine(e.stock.widget, 10, 120))
	mustPostBill(t, e.app, draft.Id, e.users.bookkeeper.Id)

	recosts := recostsOf(t, e.app, out)
	if len(recosts) != 1 {
		t.Fatalf("%d re-costs of the removal, want 1", len(recosts))
	}
	recost := recosts[0]
	asset := 0
	for _, l := range entryLinesOf(t, e.app, recost.GetString("entry")) {
		if l.account == e.stock.asset.Id {
			asset += l.debit - l.credit
		}
	}
	if asset != -100 {
		t.Fatalf("the re-cost's entry moves the inventory asset by %d, want -100", asset)
	}
	if got := recost.GetInt("value_change"); got != asset {
		t.Errorf("the re-cost's value_change = %d, want %d, the inventory-asset amount of its entry", got, asset)
	}
}

// Spec §3.1: a void takes each line's quantity back from the line's bin, not
// from the item's default bin.
func TestAdjustment_AVoidTakesEachLineBackFromItsBin(t *testing.T) {
	e := newBinAdjustEnv(t)
	shelf := mkBin(t, e.app, "Shelf C", false)
	setDefaultBin(t, e.app, e.widget, shelf.Id)
	adj := e.postLines(t, "2026-07-01",
		adjustmentLineInput{Product: e.widget.Id, Quantity: 6, Value: 600, Bin: e.aisle.Id},
		adjustmentLineInput{Product: e.widget.Id, Quantity: 4, Value: 400, Bin: e.counter.Id},
	)
	requireSameBinStock(t, binStockOf(t, e.app, e.widget.Id),
		map[string]float64{e.aisle.Id: 6, e.counter.Id: 4}, "after the post")
	if err := e.voidAdjustment(adj.Id); err != nil {
		t.Fatalf("void: %v", err)
	}
	requireSameBinStock(t, binStockOf(t, e.app, e.widget.Id),
		map[string]float64{e.aisle.Id: 0, e.counter.Id: 0}, "after the void")
	requireOnHand(t, e.app, e.widget, 0, 0)
}

// Spec §3.1 (opening stock moves in the item's default bin): the opening
// adjustment Books makes writes the item's default bin on its line, and the
// stock lands in that bin.
func TestAdjustment_TheOpeningLineTakesTheDefaultBin(t *testing.T) {
	e := newBinAdjustEnv(t)
	gadget, err := newProduct(e.app, inventoryItem(e.ledgerEnv, map[string]any{
		"name": "Gadget", "opening_quantity": 10, "opening_value": 4000, "opening_date": "2026-07-01",
		"default_bin": e.aisle.Id,
	}))
	if err != nil {
		t.Fatalf("save an item with opening stock: %v", err)
	}
	opening := openingOf(t, e.app, gadget)
	if opening == nil {
		t.Fatal("no opening adjustment")
	}
	line, err := e.app.FindFirstRecordByData(inventoryAdjustmentLinesCollection, "adjustment", opening.Id)
	if err != nil {
		t.Fatalf("read the opening line: %v", err)
	}
	if got := line.GetString("bin"); got != e.aisle.Id {
		t.Errorf("the opening line is in bin %q, want the default bin Aisle 3 %q", got, e.aisle.Id)
	}
	requireSameBinStock(t, binStockOf(t, e.app, gadget.Id), map[string]float64{e.aisle.Id: 10}, "after the opening stock")
}

// moveEvents collects the realtime events of books_stock_moves that reach l
// until none came for quiet (at most 5 s), and answers the document_number of
// the last event of each move, by move id.
func moveEvents(t *testing.T, l *rlListener, quiet time.Duration) map[string]string {
	t.Helper()
	last := map[string]string{}
	deadline := time.After(5 * time.Second)
	for {
		select {
		case msg := <-l.conn.Channel():
			var body struct {
				Record struct {
					ID             string `json:"id"`
					DocumentNumber string `json:"document_number"`
				} `json:"record"`
			}
			if err := json.Unmarshal(msg.Data, &body); err != nil {
				t.Fatalf("decode the realtime message %s: %v", msg.Data, err)
			}
			last[body.Record.ID] = body.Record.DocumentNumber
		case <-time.After(quiet):
			return last
		case <-deadline:
			return last
		}
	}
}

// Decision cp2 (gate 3): every stock move's last realtime event carries the
// number of its document, so a movement row shows it with no reload. A move of
// value 0 is not saved by markStockPosted, so the bound UPDATE alone would
// leave its last event at document_number "".
func TestAdjustment_AMoveAtNoValueGetsItsNumberLive(t *testing.T) {
	se := newStockEnv(t)
	if _, err := apis.NewRouter(se.app); err != nil {
		t.Fatalf("bind realtime: %v", err)
	}
	sample := se.mkInventoryItem(t, "Free sample", 0)
	l := rlListen(t, se.app, stockMovesCollection, se.users.bookkeeper)
	l.drain(200 * time.Millisecond)

	adj := se.mustAdjust(t, "2026-07-01", adjustmentLineInput{Product: sample.Id, Quantity: 5})
	if adj.GetString("number") != "IA-1" {
		t.Fatalf("the adjustment's number is %q, want IA-1", adj.GetString("number"))
	}
	events := moveEvents(t, l, 500*time.Millisecond)
	moves, err := documentStockMoves(se.app, inventoryAdjustmentsCollection, adj.Id)
	if err != nil || len(moves) != 1 || moves[0].GetInt("value") != 0 {
		t.Fatalf("moves of the adjustment = %v (err %v), want one move of value 0", moves, err)
	}
	got, ok := events[moves[0].Id]
	if !ok {
		t.Fatalf("no realtime event for the move %s; events %v", moves[0].Id, events)
	}
	if got != "IA-1" {
		t.Errorf("the last realtime event of the move carries document_number %q, want IA-1", got)
	}
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
