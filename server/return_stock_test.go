package books

import (
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// returnStockEnv is the refund receipt environment (which holds the credit
// memo's and the sales receipt's) with the guards of the four sales kinds and
// of the inventory adjustment, and an Inventory item, Widget, whose purchase
// cost is 5.00.
type returnStockEnv struct {
	*refundReceiptEnv
	stock *stockEnv
}

func newReturnStockEnv(t *testing.T, method string) *returnStockEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	for _, kind := range []salesDocKind{invoiceKind, salesReceiptKind, creditMemoKind, refundReceiptKind} {
		registerSalesDocGuards(app, kind)
	}
	registerInventoryAdjustmentGuards(app)
	bindHostsByKey(t, app, invoiceKind.HostKey, salesReceiptKind.HostKey, creditMemoHostKey, refundReceiptHostKey)
	rr := refundReceiptEnvOn(t, app)
	setCostingMethod(t, app, method)
	return &returnStockEnv{refundReceiptEnv: rr, stock: stockEnvOn(t, rr.ledgerEnv)}
}

func eachReturnMethod(t *testing.T, run func(t *testing.T, e *returnStockEnv, method string)) {
	t.Helper()
	for _, method := range []string{costingFIFO, costingAverage} {
		t.Run(method, func(t *testing.T) { run(t, newReturnStockEnv(t, method), method) })
	}
}

// soldOn posts an invoice dated date of units widgets at 20.00, not taxable.
func (e *returnStockEnv) soldOn(t testing.TB, date string, units float64, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{"date": date, "due_date": date}
	for k, v := range fields {
		all[k] = v
	}
	inv, err := newInvoice(e.app, e.customer, all)
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	mkInvoiceLine(t, e.app, inv, 0, item(e.stock.widget, units, 2000, false))
	return mustPostInvoice(t, e.app, inv.Id, e.users.bookkeeper.Id)
}

// returnedOn posts a credit memo dated date of units widgets at 20.00, made
// from invoice (nil for a credit memo made from no invoice).
func (e *returnStockEnv) returnedOn(t testing.TB, date string, units float64, invoice *core.Record) *core.Record {
	t.Helper()
	fields := map[string]any{"date": date}
	if invoice != nil {
		fields["invoice"] = invoice.Id
	}
	memo := e.mkCreditMemo(t, fields)
	mkCreditMemoLine(t, e.app, memo, 0, item(e.stock.widget, units, 2000, false))
	return mustPostCreditMemo(t, e.app, memo.Id, e.users.bookkeeper.Id)
}

func returnMove(t testing.TB, app core.App, collection string, doc *core.Record) *core.Record {
	t.Helper()
	moves, err := documentStockMoves(app, collection, doc.Id)
	if err != nil || len(moves) != 1 {
		t.Fatalf("%d moves of the return (err %v), want 1", len(moves), err)
	}
	if moves[0].GetString("kind") != stockKindCustomerReturn {
		t.Fatalf("the move is a %s, want a customer return", moves[0].GetString("kind"))
	}
	return moves[0]
}

// A credit memo returns stock at the cost its invoice took it out at, not at
// the cost of the stock bought since.
func TestReturnStock_CreditMemoReturnsAtTheInvoicesCost(t *testing.T) {
	eachReturnMethod(t, func(t *testing.T, e *returnStockEnv, method string) {
		// 15 sold of 10 at 1.00 and 10 at 2.00: 2000 (FIFO) or 2250 (average).
		// 3 of the 15 come back at 400 or 450.
		cost := map[string]int{costingFIFO: 400, costingAverage: 450}[method]
		e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 1000))
		e.stock.mustAdjust(t, "2026-07-02", e.stock.stockIn(10, 2000))
		inv := e.soldOn(t, "2026-07-03", 15, nil)
		e.stock.mustAdjust(t, "2026-07-04", e.stock.stockIn(10, 9000))
		memo := e.returnedOn(t, "2026-07-05", 3, inv)

		requireEntryLines(t, e.app, memo.GetString("entry"),
			entryLine{account: e.receivable.Id, credit: 6000, customer: e.customer.Id},
			entryLine{account: e.revenue.Id, debit: 6000, customer: e.customer.Id},
			entryLine{account: e.stock.asset.Id, debit: cost, customer: e.customer.Id},
			entryLine{account: e.stock.cogs.Id, credit: cost, customer: e.customer.Id},
		)
		sale, err := documentStockMoves(e.app, "books_invoices", inv.Id)
		if err != nil || len(sale) != 1 {
			t.Fatal("the invoice has one sale move")
		}
		if got := returnMove(t, e.app, "books_credit_memos", memo); got.GetString("return_of") != sale[0].Id || got.GetInt("value") != cost {
			t.Errorf("return move names %q for %d, want the sale move %q for %d", got.GetString("return_of"), got.GetInt("value"), sale[0].Id, cost)
		}
		if err := voidCreditMemoAs(e.app, memo.Id, e.users.bookkeeper.Id); err != nil {
			t.Fatalf("void the credit memo: %v", err)
		}
		if moves, _ := documentStockMoves(e.app, "books_credit_memos", memo.Id); len(moves) != 0 {
			t.Errorf("%d moves of the voided credit memo, want none", len(moves))
		}
	})
}

// A credit memo made from no invoice has no original cost: the stock comes
// back at the last known cost.
func TestReturnStock_CreditMemoWithNoInvoiceReturnsAtTheLastKnownCost(t *testing.T) {
	e := newReturnStockEnv(t, costingFIFO)
	e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 3000))
	memo := e.returnedOn(t, "2026-07-02", 2, nil)
	if got := returnMove(t, e.app, "books_credit_memos", memo); got.GetString("return_of") != "" || got.GetInt("value") != 600 {
		t.Errorf("return move names %q for %d, want no sale and 600 (2 at 3.00)", got.GetString("return_of"), got.GetInt("value"))
	}
	requireOnHand(t, e.app, e.stock.widget, 12, 3600)
}

func TestReturnStock_RefundReceiptReturnsAtTheSalesReceiptsCost(t *testing.T) {
	e := newReturnStockEnv(t, costingFIFO)
	e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 1000))
	receipt := e.mkReceipt(t, map[string]any{"date": "2026-07-02", "deposit_to": e.checking.Id})
	mkReceiptLine(t, e.app, receipt, 0, item(e.stock.widget, 5, 2000, false))
	sold := mustPostReceipt(t, e.app, receipt.Id, e.users.bookkeeper.Id)
	e.stock.mustAdjust(t, "2026-07-03", e.stock.stockIn(10, 9000))

	refund := e.mkRefundReceipt(t, map[string]any{"date": "2026-07-04", "sales_receipt": sold.Id})
	mkRefundReceiptLine(t, e.app, refund, 0, item(e.stock.widget, 2, 2000, false))
	posted := mustPostRefundReceipt(t, e.app, refund.Id, e.users.bookkeeper.Id)

	requireEntryLines(t, e.app, posted.GetString("entry"),
		entryLine{account: e.checking.Id, credit: 4000, customer: e.customer.Id},
		entryLine{account: e.revenue.Id, debit: 4000, customer: e.customer.Id},
		entryLine{account: e.stock.asset.Id, debit: 200, customer: e.customer.Id},
		entryLine{account: e.stock.cogs.Id, credit: 200, customer: e.customer.Id},
	)
	if got := returnMove(t, e.app, refundReceiptsCollection, posted); got.GetInt("value") != 200 {
		t.Errorf("the return is worth %d, want 200 (2 at the sales receipt's 1.00)", got.GetInt("value"))
	}
	requireOnHand(t, e.app, e.stock.widget, 17, 9700)
}

// A refund receipt that pays out a credit memo moves no stock: the credit memo
// already brought it back.
func TestReturnStock_PayoutOfACreditMemoMovesNoStock(t *testing.T) {
	e := newReturnStockEnv(t, costingFIFO)
	e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 1000))
	memo := e.returnedOn(t, "2026-07-02", 2, nil)
	payout := e.mkRefundReceipt(t, map[string]any{"date": "2026-07-03", "credit_memo": memo.Id})
	mkRefundReceiptLine(t, e.app, payout, 0, item(e.stock.widget, 2, 2000, false))
	posted := mustPostRefundReceipt(t, e.app, payout.Id, e.users.bookkeeper.Id)
	if moves, _ := documentStockMoves(e.app, refundReceiptsCollection, posted.Id); len(moves) != 0 {
		t.Errorf("%d moves of the payout, want none", len(moves))
	}
	requireOnHand(t, e.app, e.stock.widget, 12, 1200)
}

// A back-dated stock-in changes what the sale cost; the return that came back
// at that cost changes with it, and both documents are re-costed.
func TestReturnStock_ReturnFollowsTheRecostOfItsSale(t *testing.T) {
	eachReturnMethod(t, func(t *testing.T, e *returnStockEnv, method string) {
		// The sale of 5 cost 500. FIFO: it now takes the older 0.50 stock, 250,
		// so the 2 that came back are worth 100, not 200. Average: 5 of 20
		// that cost 1500 are 375, and 2 of them 150.
		difference := map[string]int{costingFIFO: 100, costingAverage: 50}[method]
		e.stock.mustAdjust(t, "2026-07-02", e.stock.stockIn(10, 1000))
		inv := e.soldOn(t, "2026-07-03", 5, nil)
		memo := e.returnedOn(t, "2026-07-05", 2, inv)
		if got := returnMove(t, e.app, "books_credit_memos", memo); got.GetInt("value") != 200 {
			t.Fatalf("the return is worth %d before the stock-in, want 200", got.GetInt("value"))
		}
		e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 500))

		recosts := recostsOfDoc(t, e.app, "books_credit_memos", memo)
		if len(recosts) != 1 {
			t.Fatalf("%d re-costs of the credit memo, want 1", len(recosts))
		}
		requireEntryLines(t, e.app, recosts[0].GetString("entry"),
			entryLine{account: e.stock.asset.Id, credit: difference},
			entryLine{account: e.stock.cogs.Id, debit: difference},
		)
		if got := recostsOfDoc(t, e.app, "books_invoices", inv); len(got) != 1 {
			t.Errorf("%d re-costs of the invoice, want 1", len(got))
		}
		drifted, err := driftedStockMoves(e.app, []string{e.stock.widget.Id})
		if err != nil || len(drifted) != 0 {
			t.Errorf("%d moves still differ from the ledger (err %v), want none", len(drifted), err)
		}
	})
}

// A correction gives the sale new stock moves: the return follows the sale to
// the correction's move and keeps the sale's cost.
func TestReturnStock_ReturnFollowsTheCorrectionOfItsSale(t *testing.T) {
	e := newReturnStockEnv(t, costingFIFO)
	e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 1000))
	inv := e.soldOn(t, "2026-07-02", 5, nil)
	e.stock.mustAdjust(t, "2026-07-03", e.stock.stockIn(10, 9000))
	memo := e.returnedOn(t, "2026-07-04", 2, inv)

	correction := e.soldOn(t, "2026-07-02", 6, map[string]any{"replaces": inv.Id})
	sale, err := documentStockMoves(e.app, "books_invoices", correction.Id)
	if err != nil || len(sale) != 1 {
		t.Fatal("the correction has one sale move")
	}
	if got := returnMove(t, e.app, "books_credit_memos", memo); got.GetString("return_of") != sale[0].Id || got.GetInt("value") != 200 {
		t.Errorf("return move names %q for %d, want the correction's move %q for 200", got.GetString("return_of"), got.GetInt("value"), sale[0].Id)
	}
	if got := recostsOfDoc(t, e.app, "books_credit_memos", memo); len(got) != 0 {
		t.Errorf("%d re-costs of the credit memo, want none: its cost did not change", len(got))
	}
}

// A voided sale has no cost to return at: its return names no sale and comes
// back at the last known cost, and the difference is re-costed.
func TestReturnStock_ReturnOfAVoidedSaleTakesTheLastKnownCost(t *testing.T) {
	e := newReturnStockEnv(t, costingFIFO)
	e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 1000))
	inv := e.soldOn(t, "2026-07-02", 5, nil)
	e.stock.mustAdjust(t, "2026-07-03", e.stock.stockIn(10, 9000))
	memo := e.returnedOn(t, "2026-07-04", 2, inv)

	if err := voidInvoiceAs(e.app, inv.Id, e.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	// The last known cost on 2026-07-04 is the 9.00 of the day before.
	if got := returnMove(t, e.app, "books_credit_memos", memo); got.GetString("return_of") != "" || got.GetInt("value") != 1800 {
		t.Errorf("return move names %q for %d, want no sale and 1800", got.GetString("return_of"), got.GetInt("value"))
	}
	recosts := recostsOfDoc(t, e.app, "books_credit_memos", memo)
	if len(recosts) != 1 {
		t.Fatalf("%d re-costs of the credit memo, want 1", len(recosts))
	}
	requireEntryLines(t, e.app, recosts[0].GetString("entry"),
		entryLine{account: e.stock.asset.Id, debit: 1600},
		entryLine{account: e.stock.cogs.Id, credit: 1600},
	)
	requireOnHand(t, e.app, e.stock.widget, 22, 11800)
}

// Cash basis (cash_basis.go): an unapplied credit memo counts for nothing, so
// the cost lines of its return (inventory asset, cost of goods sold) are taken
// out with the rest of its entry.
func TestReturnStock_CashBasisTakesOutTheCostLinesOfAnUnappliedCreditMemo(t *testing.T) {
	e := newReturnStockEnv(t, costingFIFO)
	e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 1000))
	memo := e.returnedOn(t, "2026-07-05", 3, nil)

	rows := takenOutRows(t, e.app, "credit_memo", memo.Id)
	if !slices.ContainsFunc(rows, func(r cashRow) bool { return r.account == e.stock.asset.Id && r.credit == 300 }) {
		t.Errorf("taken-out rows = %v, want one that credits the inventory asset account 300", rows)
	}
	if !slices.ContainsFunc(rows, func(r cashRow) bool { return r.account == e.stock.cogs.Id && r.debit == 300 }) {
		t.Errorf("taken-out rows = %v, want one that debits cost of goods sold 300", rows)
	}
	requireNoCashDrift(t, e.app)
}

// repointStockReturns reads the returns of all the gone moves in one query: its
// SELECT count does not grow with the number of gone moves, and each return
// follows its own sale move to the replacing document's move of the same
// product ("" when that document has none).
func TestReturnStock_RepointReadsTheReturnsOfAllGoneMovesOnce(t *testing.T) {
	run := func(t *testing.T, sales int) int {
		e := newReturnStockEnv(t, costingFIFO)
		gadget := e.stock.mkInventoryItem(t, "Gadget", 300)
		var gone, memos []*core.Record
		for i := 0; i < sales; i++ {
			inv, err := newInvoice(e.app, e.customer, map[string]any{"date": "2026-07-02", "due_date": "2026-07-02"})
			if err != nil {
				t.Fatalf("save a draft invoice: %v", err)
			}
			mkInvoiceLine(t, e.app, inv, 0, item(e.stock.widget, 3, 2000, false))
			mkInvoiceLine(t, e.app, inv, 1, item(gadget, 2, 1000, false))
			mustPostInvoice(t, e.app, inv.Id, e.users.bookkeeper.Id)
			moves, err := documentStockMoves(e.app, "books_invoices", inv.Id)
			if err != nil || len(moves) != 2 {
				t.Fatalf("%d moves of the invoice (err %v), want 2", len(moves), err)
			}
			gone = append(gone, moves...)
			memo := e.mkCreditMemo(t, map[string]any{"date": "2026-07-03", "invoice": inv.Id})
			mkCreditMemoLine(t, e.app, memo, 0, item(e.stock.widget, 1, 2000, false))
			mkCreditMemoLine(t, e.app, memo, 1, item(gadget, 1, 1000, false))
			memos = append(memos, mustPostCreditMemo(t, e.app, memo.Id, e.users.bookkeeper.Id))
		}
		// The replacing document sells the widget only: the gadget returns
		// name no move.
		fresh := e.soldOn(t, "2026-07-02", 4, nil)
		freshMoves, err := documentStockMoves(e.app, "books_invoices", fresh.Id)
		if err != nil || len(freshMoves) != 1 {
			t.Fatalf("%d moves of the replacing invoice (err %v), want 1", len(freshMoves), err)
		}
		// Only the reads of the moves: saving each repointed return costs
		// its own relation checks, which is no part of what is pinned.
		reads := func(sql string) bool {
			return strings.HasPrefix(strings.TrimSpace(sql), "SELECT") && strings.Contains(sql, "books_stock_moves")
		}
		count := countStatements(t, e.app, reads, func() {
			if err := repointStockReturns(e.app, gone, "books_invoices", fresh.Id); err != nil {
				t.Fatal(err)
			}
		})
		for _, memo := range memos {
			moves, err := documentStockMoves(e.app, "books_credit_memos", memo.Id)
			if err != nil || len(moves) != 2 {
				t.Fatalf("%d moves of the credit memo (err %v), want 2", len(moves), err)
			}
			for _, m := range moves {
				want := ""
				if m.GetString("product") == e.stock.widget.Id {
					want = freshMoves[0].Id
				}
				if got := m.GetString("return_of"); got != want {
					t.Errorf("the return of product %s names %q, want %q", m.GetString("product"), got, want)
				}
			}
		}
		return count
	}
	var twoGoneSelects, sixGoneSelects int
	t.Run("one sale", func(t *testing.T) { twoGoneSelects = run(t, 1) })
	t.Run("three sales", func(t *testing.T) { sixGoneSelects = run(t, 3) })
	if sixGoneSelects != twoGoneSelects {
		t.Errorf("%d SELECTs for 6 gone moves, %d for 2 gone moves: want the same count", sixGoneSelects, twoGoneSelects)
	}
}
