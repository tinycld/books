package books

import (
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// buyStockEnv is the expense environment (which holds the bill's) with the
// bill, expense, vendor credit and inventory adjustment guards and an
// Inventory item, Widget, whose purchase cost is 5.00.
type buyStockEnv struct {
	*expenseEnv
	stock    *stockEnv
	payables *core.Record
}

func newBuyStockEnv(t *testing.T, method string) *buyStockEnv {
	t.Helper()
	env := newLedgerEnv(t)
	for _, kind := range []salesDocKind{billKind, expenseKind, vendorCreditKind} {
		registerSalesDocGuards(env.app, kind)
	}
	registerInventoryAdjustmentGuards(env.app)
	bindHostsByKey(t, env.app, billKind.HostKey, expenseKind.HostKey, vendorCreditHostKey)
	setCostingMethod(t, env.app, method)
	e := &buyStockEnv{expenseEnv: expenseEnvOn(t, env), stock: stockEnvOn(t, env)}
	payables, err := ensurePayables(env.app)
	if err != nil {
		t.Fatalf("make Accounts payable: %v", err)
	}
	e.payables = payables
	return e
}

func eachBuyMethod(t *testing.T, run func(t *testing.T, e *buyStockEnv, method string)) {
	t.Helper()
	for _, method := range []string{costingFIFO, costingAverage} {
		t.Run(method, func(t *testing.T) { run(t, newBuyStockEnv(t, method), method) })
	}
}

// billOf posts a bill from Summit dated date of units widgets at rate cents.
func (e *buyStockEnv) billOf(t testing.TB, date string, units float64, rate int64, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{"date": date, "due_date": date}
	for k, v := range fields {
		all[k] = v
	}
	bill := mkBill(t, e.app, e.summit, all)
	mkBillLine(t, e.app, bill, 0, productLine(e.stock.widget, units, rate))
	return mustPostBill(t, e.app, bill.Id, e.users.bookkeeper.Id)
}

func TestBuyStock_BillDebitsTheInventoryAsset(t *testing.T) {
	e := newBuyStockEnv(t, costingFIFO)
	bill := mkBill(t, e.app, e.summit, map[string]any{"date": "2026-07-01", "due_date": "2026-07-31"})
	mkBillLine(t, e.app, bill, 0, productLine(e.stock.widget, 10, 300))
	mkBillLine(t, e.app, bill, 1, productLine(e.accessPoint, 1, 12140))
	mkBillLine(t, e.app, bill, 2, accountLine(e.designTools, 5000))
	posted := mustPostBill(t, e.app, bill.Id, e.users.bookkeeper.Id)

	// The widget's 30.00 is in the asset account, not in an expense account,
	// and the entry has no cost of goods sold line.
	requireEntryLines(t, e.app, posted.GetString("entry"),
		entryLine{account: e.payables.Id, credit: 20140, vendor: e.summit.Id},
		entryLine{account: e.software.Id, debit: 12140, vendor: e.summit.Id},
		entryLine{account: e.designTools.Id, debit: 5000, vendor: e.summit.Id},
		entryLine{account: e.stock.asset.Id, debit: 3000, vendor: e.summit.Id},
	)
	requireOnHand(t, e.app, e.stock.widget, 10, 3000)
	moves, err := documentStockMoves(e.app, "books_bills", posted.Id)
	if err != nil || len(moves) != 1 {
		t.Fatalf("%d moves of the bill (err %v), want 1", len(moves), err)
	}
	m := moves[0]
	if m.GetString("kind") != stockKindReceipt || m.GetFloat("quantity") != 10 || m.GetInt("value") != 3000 || m.GetInt("posted_value") != 3000 {
		t.Errorf("move kind %s quantity %v value %d posted %d, want a receipt of 10 for 3000 the ledger holds",
			m.GetString("kind"), m.GetFloat("quantity"), m.GetInt("value"), m.GetInt("posted_value"))
	}
}

// An expense is a receipt whatever its payment method: a check here.
func TestBuyStock_ExpenseDebitsTheInventoryAsset(t *testing.T) {
	e := newBuyStockEnv(t, costingFIFO)
	expense := e.mkExpense(t, map[string]any{"date": "2026-07-01", "vendor": e.summit.Id, "ref_no": "1042"})
	mkExpenseLine(t, e.app, expense, 0, productLine(e.stock.widget, 4, 250))
	posted := mustPostExpense(t, e.app, expense.Id, e.users.bookkeeper.Id)
	requireEntryLines(t, e.app, posted.GetString("entry"),
		entryLine{account: e.checking1000.Id, credit: 1000, vendor: e.summit.Id},
		entryLine{account: e.stock.asset.Id, debit: 1000, vendor: e.summit.Id},
	)
	requireOnHand(t, e.app, e.stock.widget, 4, 1000)
	if err := voidExpenseAs(e.app, posted.Id, e.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the expense: %v", err)
	}
	requireOnHand(t, e.app, e.stock.widget, 0, 0)
}

// The next receipt prices an oversold removal again (spec, Negative stock).
func TestBuyStock_BillRecostsAnOversoldRemoval(t *testing.T) {
	eachBuyMethod(t, func(t *testing.T, e *buyStockEnv, _ string) {
		out := e.stock.mustAdjust(t, "2026-07-01", e.stock.stockOut(4))
		e.billOf(t, "2026-07-02", 10, 700, nil)
		recosts := recostsOf(t, e.app, out)
		if len(recosts) != 1 {
			t.Fatalf("%d re-costs of the oversold removal, want 1", len(recosts))
		}
		// 4 at 7.00 are 2800; the removal posted 4 at the purchase cost, 2000.
		requireEntryLines(t, e.app, recosts[0].GetString("entry"),
			entryLine{account: e.stock.asset.Id, credit: 800},
			entryLine{account: e.stock.shrinkage(t).Id, debit: 800},
		)
		requireOnHand(t, e.app, e.stock.widget, 6, 4200)
	})
}

// A bill dated before a posted removal changes what the removal cost.
func TestBuyStock_BackDatedBillRecostsTheLaterRemoval(t *testing.T) {
	eachBuyMethod(t, func(t *testing.T, e *buyStockEnv, method string) {
		// FIFO: the removal takes 5 of the older 1.00 stock, 500, not 1000.
		// Average: 5 of 20 that cost 3000, 750.
		difference := map[string]int{costingFIFO: 500, costingAverage: 250}[method]
		e.billOf(t, "2026-07-10", 10, 200, nil)
		out := e.stock.mustAdjust(t, "2026-07-15", e.stock.stockOut(5))
		e.billOf(t, "2026-07-05", 10, 100, map[string]any{"ref_no": "B-2"})
		recosts := recostsOf(t, e.app, out)
		if len(recosts) != 1 {
			t.Fatalf("%d re-costs of the removal, want 1", len(recosts))
		}
		requireEntryLines(t, e.app, recosts[0].GetString("entry"),
			entryLine{account: e.stock.asset.Id, debit: difference},
			entryLine{account: e.stock.shrinkage(t).Id, credit: difference},
		)
	})
}

func TestBuyStock_BillVoidAndCorrection(t *testing.T) {
	e := newBuyStockEnv(t, costingFIFO)
	original := e.billOf(t, "2026-07-01", 10, 300, nil)

	draft := mkBill(t, e.app, e.summit, map[string]any{"date": "2026-07-01", "due_date": "2026-07-01", "replaces": original.Id})
	mkBillLine(t, e.app, draft, 0, productLine(e.stock.widget, 8, 350))
	correction := mustPostBill(t, e.app, draft.Id, e.users.bookkeeper.Id)
	if moves, _ := documentStockMoves(e.app, "books_bills", original.Id); len(moves) != 0 {
		t.Errorf("%d moves of the replaced bill, want none", len(moves))
	}
	requireOnHand(t, e.app, e.stock.widget, 8, 2800)

	if err := voidBillAs(e.app, correction.Id, e.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the bill: %v", err)
	}
	requireOnHand(t, e.app, e.stock.widget, 0, 0)
}

// A vendor credit removes stock at the costing method's cost. Its line credits
// cost of goods sold with the credited amount, so cost of goods sold keeps the
// difference between the cost and the credit.
func TestBuyStock_VendorCreditRemovesStockAtCost(t *testing.T) {
	eachBuyMethod(t, func(t *testing.T, e *buyStockEnv, method string) {
		// 10 at 1.00 and 10 at 2.00: 4 leave at 1.00 (FIFO) or at 1.50.
		cost := map[string]int{costingFIFO: 400, costingAverage: 600}[method]
		e.billOf(t, "2026-07-01", 10, 100, nil)
		e.billOf(t, "2026-07-02", 10, 200, map[string]any{"ref_no": "B-2"})
		credit := mkVendorCreditOn(t, e.app, e.summit, map[string]any{"date": "2026-07-03"})
		mkVendorCreditLine(t, e.app, credit, 0, productLine(e.stock.widget, 4, 200))
		posted := mustPostVendorCredit(t, e.app, credit.Id, e.users.bookkeeper.Id)

		requireEntryLines(t, e.app, posted.GetString("entry"),
			entryLine{account: e.payables.Id, debit: 800, vendor: e.summit.Id},
			entryLine{account: e.stock.cogs.Id, credit: 800, vendor: e.summit.Id},
			entryLine{account: e.stock.asset.Id, credit: cost, vendor: e.summit.Id},
			entryLine{account: e.stock.cogs.Id, debit: cost, vendor: e.summit.Id},
		)
		requireOnHand(t, e.app, e.stock.widget, 16, 3000-cost)
		moves, err := documentStockMoves(e.app, "books_vendor_credits", posted.Id)
		if err != nil || len(moves) != 1 || moves[0].GetString("kind") != stockKindVendorReturn {
			t.Fatalf("moves of the vendor credit = %v (err %v), want one vendor return", moves, err)
		}
		if err := voidVendorCreditAs(e.app, posted.Id, e.users.bookkeeper.Id); err != nil {
			t.Fatalf("void the vendor credit: %v", err)
		}
		requireOnHand(t, e.app, e.stock.widget, 20, 3000)
	})
}

// A refused post writes no stock move and does not lock the costing method.
func TestBuyStock_RefusedPostMovesNoStock(t *testing.T) {
	e := newBuyStockEnv(t, costingFIFO)
	bill := mkBill(t, e.app, e.summit, map[string]any{"date": "2026-07-01", "due_date": "2026-07-01"})
	mkBillLine(t, e.app, bill, 0, productLine(e.stock.widget, 2, 100))
	makeAccountInactive(t, e.app, e.stock.asset)
	requireRefused(t, postBillAs(e.app, bill.Id, e.users.bookkeeper.Id),
		"Product line 1: the inventory asset account of Widget is inactive. Choose an active one on the product or service.")
	// An expense takes the same stock-in path as a bill, so it is refused the same way.
	expense := e.mkExpense(t, map[string]any{"date": "2026-07-01", "vendor": e.summit.Id, "ref_no": "1043"})
	mkExpenseLine(t, e.app, expense, 0, productLine(e.stock.widget, 2, 100))
	requireRefused(t, postExpenseAs(e.app, expense.Id, e.users.bookkeeper.Id),
		"Product line 1: the inventory asset account of Widget is inactive. Choose an active one on the product or service.")
	if n, _ := e.app.CountRecords(stockMovesCollection); n != 0 {
		t.Errorf("%d stock moves after the refusals, want none", n)
	}
	if _, locked := costingSettings(t, e.app); locked {
		t.Error("a refused post locked the costing method")
	}
}

// A refusal after the bill's moves are written takes them back: the bill,
// dated in a closed period itself, fills a removal in that period, and the
// re-cost of that removal is refused, naming the removal and the item.
func TestBuyStock_RefusedRecostMovesNoStock(t *testing.T) {
	e := newBuyStockEnv(t, costingFIFO)
	out := e.stock.mustAdjust(t, "2026-07-01", e.stock.stockOut(4))
	if err := setFields(t, e.app, "books_settings", settingsID, map[string]any{"close_date": "2026-07-15"}); err != nil {
		t.Fatalf("close the books: %v", err)
	}
	bill := mkBill(t, e.app, e.summit, map[string]any{"date": "2026-07-10", "due_date": "2026-07-20"})
	mkBillLine(t, e.app, bill, 0, productLine(e.stock.widget, 10, 700))
	requireRefused(t, postBillAs(e.app, bill.Id, e.users.bookkeeper.Id),
		"The books are closed through 2026-07-15, so Books cannot re-cost Inventory adjustment IA-1 for Widget on 2026-07-10.")

	if moves, _ := documentStockMoves(e.app, "books_bills", bill.Id); len(moves) != 0 {
		t.Errorf("%d moves of the refused bill, want none", len(moves))
	}
	if got := reload(t, e.app, "books_bills", bill.Id).GetString("status"); got != statusDraft {
		t.Errorf("the refused bill is %s, want draft", got)
	}
	if n := len(recostsOf(t, e.app, out)); n != 0 {
		t.Errorf("%d re-costs of the removal after the refusal, want none", n)
	}
	requireOnHand(t, e.app, e.stock.widget, -4, -2000)
}

// Cash basis (cash_basis.go): an unpaid bill counts for nothing, so the debit
// of the inventory asset is taken out with the rest of its entry.
func TestBuyStock_CashBasisTakesOutTheAssetLineOfAnUnpaidBill(t *testing.T) {
	e := newBuyStockEnv(t, costingFIFO)
	bill := e.billOf(t, "2026-07-01", 10, 300, nil)
	rows := takenOutRows(t, e.app, "bill", bill.Id)
	if len(rows) != 2 {
		t.Errorf("%d taken-out rows of the bill, want 2 (payables, inventory asset)", len(rows))
	}
	if !slices.ContainsFunc(rows, func(r cashRow) bool { return r.account == e.stock.asset.Id }) {
		t.Errorf("taken-out rows = %v, want one on the inventory asset account", rows)
	}
	if got := nonZero(cashNet(t, e.app)); len(got) != 0 {
		t.Errorf("an unpaid bill counts on the cash basis: %v, want nothing", got)
	}
	requireNoCashDrift(t, e.app)
}

// An unapplied vendor credit counts for nothing on the cash basis, so the cost
// lines of its stock (inventory asset, cost of goods sold) are taken out with
// the rest of its entry.
func TestBuyStock_CashBasisTakesOutTheCostLinesOfAnUnappliedVendorCredit(t *testing.T) {
	e := newBuyStockEnv(t, costingFIFO)
	e.billOf(t, "2026-07-01", 10, 300, nil)
	credit := mkVendorCreditOn(t, e.app, e.summit, map[string]any{"date": "2026-07-03"})
	mkVendorCreditLine(t, e.app, credit, 0, productLine(e.stock.widget, 4, 300))
	posted := mustPostVendorCredit(t, e.app, credit.Id, e.users.bookkeeper.Id)

	rows := takenOutRows(t, e.app, "vendor_credit", posted.Id)
	if !slices.ContainsFunc(rows, func(r cashRow) bool { return r.account == e.stock.asset.Id && r.debit == 1200 }) {
		t.Errorf("taken-out rows = %v, want one that debits the inventory asset account 1200", rows)
	}
	if got := nonZero(cashNet(t, e.app)); len(got) != 0 {
		t.Errorf("an unpaid bill and an unapplied vendor credit count on the cash basis: %v, want nothing", got)
	}
	requireNoCashDrift(t, e.app)
}
