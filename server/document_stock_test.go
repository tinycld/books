package books

import (
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// saleStockEnv is the sales receipt environment (its chart, tax rates and
// customer) with the invoice and inventory adjustment guards and an Inventory
// item, Widget, whose purchase cost is 5.00. Stock comes in by an inventory
// adjustment (se.stock.mustAdjust), so these tests need no purchase form.
type saleStockEnv struct {
	*receiptEnv
	stock *stockEnv
}

func newSaleStockEnv(t *testing.T, method string) *saleStockEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, invoiceKind)
	registerSalesDocGuards(app, salesReceiptKind)
	registerInventoryAdjustmentGuards(app)
	bindSalesDocHosts(t, app)
	re := receiptEnvOn(t, app)
	setCostingMethod(t, app, method)
	return &saleStockEnv{receiptEnv: re, stock: stockEnvOn(t, re.ledgerEnv)}
}

func eachMethod(t *testing.T, run func(t *testing.T, e *saleStockEnv, method string)) {
	t.Helper()
	for _, method := range []string{costingFIFO, costingAverage} {
		t.Run(method, func(t *testing.T) { run(t, newSaleStockEnv(t, method), method) })
	}
}

// draftInvoiceOf saves a draft invoice dated date of units widgets at 20.00
// each, not taxable; invoiceOf posts it as the bookkeeper.
func (e *saleStockEnv) draftInvoiceOf(t testing.TB, date string, units float64, fields map[string]any) *core.Record {
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
	return inv
}

func (e *saleStockEnv) invoiceOf(t testing.TB, date string, units float64) *core.Record {
	t.Helper()
	inv := e.draftInvoiceOf(t, date, units, nil)
	return mustPostInvoice(t, e.app, inv.Id, e.users.bookkeeper.Id)
}

// recostsOfDoc are the posted or void re-costs of a document, oldest first.
func recostsOfDoc(t testing.TB, app core.App, collection string, doc *core.Record) []*core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter(inventoryAdjustmentsCollection,
		"kind = 'recost' && source = {:s} && document = {:d}", "sequence", 0, 0,
		dbx.Params{"s": collection, "d": doc.Id})
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

func TestSaleStock_InvoicePostsItsCostOfGoodsSold(t *testing.T) {
	eachMethod(t, func(t *testing.T, e *saleStockEnv, method string) {
		app := e.app
		// 10 at 1.00, then 10 at 2.00. FIFO takes 10 at 1.00 and 5 at 2.00;
		// the average is 1.50.
		cost := map[string]int{costingFIFO: 2000, costingAverage: 2250}[method]
		e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 1000))
		e.stock.mustAdjust(t, "2026-07-02", e.stock.stockIn(10, 2000))
		inv := e.invoiceOf(t, "2026-07-03", 15)

		requireEntryLines(t, app, inv.GetString("entry"),
			entryLine{account: e.receivable.Id, debit: 30000, customer: e.customer.Id},
			entryLine{account: e.revenue.Id, credit: 30000, customer: e.customer.Id},
			entryLine{account: e.stock.asset.Id, credit: cost, customer: e.customer.Id},
			entryLine{account: e.stock.cogs.Id, debit: cost, customer: e.customer.Id},
		)
		requireOnHand(t, app, e.stock.widget, 5, 3000-cost)
		moves, err := documentStockMoves(app, "books_invoices", inv.Id)
		if err != nil || len(moves) != 1 {
			t.Fatalf("%d moves of the invoice (err %v), want 1", len(moves), err)
		}
		m := moves[0]
		if m.GetString("kind") != stockKindSale || m.GetFloat("quantity") != -15 || m.GetInt("value") != -cost || m.GetInt("posted_value") != -cost {
			t.Errorf("move kind %s quantity %v value %d posted %d, want a sale of -15 for %d the ledger holds",
				m.GetString("kind"), m.GetFloat("quantity"), m.GetInt("value"), m.GetInt("posted_value"), -cost)
		}
		if got := recostsOfDoc(t, app, "books_invoices", inv); len(got) != 0 {
			t.Errorf("%d re-costs of an invoice nothing changed, want none", len(got))
		}
	})
}

func TestSaleStock_SalesReceiptPostsItsCostOfGoodsSold(t *testing.T) {
	e := newSaleStockEnv(t, costingFIFO)
	app := e.app
	e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 1000))
	receipt := e.mkReceipt(t, map[string]any{"date": "2026-07-02"})
	mkReceiptLine(t, app, receipt, 0, item(e.stock.widget, 4, 2000, false))
	mkReceiptLine(t, app, receipt, 1, item(e.service, 1, 5000, false))
	if err := setFieldsOf(app, "books_sales_receipts", receipt.Id, map[string]any{
		"status": statusPosted, "posted_by": e.users.bookkeeper.Id,
	}); err != nil {
		t.Fatalf("post the sales receipt: %v", err)
	}
	posted := reload(t, app, "books_sales_receipts", receipt.Id)
	requireEntryLines(t, app, posted.GetString("entry"),
		entryLine{account: e.undeposited.Id, debit: 13000, customer: e.customer.Id},
		entryLine{account: e.revenue.Id, credit: 13000, customer: e.customer.Id},
		entryLine{account: e.stock.asset.Id, credit: 400, customer: e.customer.Id},
		entryLine{account: e.stock.cogs.Id, debit: 400, customer: e.customer.Id},
	)
	requireOnHand(t, app, e.stock.widget, 6, 600)
}

// Negative stock (spec, Inventory): a sale with no stock posts at the last
// known cost, here the item's purchase cost of 5.00, and the next receipt
// prices it again. The invoice's entry stays; a re-cost posts the difference
// on the invoice's date against the item's cost of goods sold account.
func TestSaleStock_NegativeStockIsRecostByTheNextReceipt(t *testing.T) {
	eachMethod(t, func(t *testing.T, e *saleStockEnv, _ string) {
		app := e.app
		inv := e.invoiceOf(t, "2026-07-01", 4)
		entryLines := []entryLine{
			{account: e.receivable.Id, debit: 8000, customer: e.customer.Id},
			{account: e.revenue.Id, credit: 8000, customer: e.customer.Id},
			{account: e.stock.asset.Id, credit: 2000, customer: e.customer.Id},
			{account: e.stock.cogs.Id, debit: 2000, customer: e.customer.Id},
		}
		requireEntryLines(t, app, inv.GetString("entry"), entryLines...)
		requireOnHand(t, app, e.stock.widget, -4, -2000)

		e.stock.mustAdjust(t, "2026-07-02", e.stock.stockIn(10, 7000))
		recosts := recostsOfDoc(t, app, "books_invoices", inv)
		if len(recosts) != 1 {
			t.Fatalf("%d re-costs of the oversold invoice, want 1", len(recosts))
		}
		recost := recosts[0]
		if recost.GetString("date") != "2026-07-01" || recost.GetString("memo") != "Re-cost of Invoice "+inv.GetString("number") {
			t.Errorf("re-cost date %q memo %q", recost.GetString("date"), recost.GetString("memo"))
		}
		// 4 at 7.00 are 2800: 800 more than the invoice's entry holds.
		requireEntryLines(t, app, recost.GetString("entry"),
			entryLine{account: e.stock.asset.Id, credit: 800},
			entryLine{account: e.stock.cogs.Id, debit: 800},
		)
		requireEntryLines(t, app, inv.GetString("entry"), entryLines...)
		requireOnHand(t, app, e.stock.widget, 6, 4200)
	})
}

// A sale dated before a posted sale takes the older stock first under FIFO, so
// the later sale costs more: its cost of goods sold is posted again as a
// re-cost. Under the average cost both sales cost the same.
func TestSaleStock_BackDatedSaleRecostsTheLaterSale(t *testing.T) {
	eachMethod(t, func(t *testing.T, e *saleStockEnv, method string) {
		app := e.app
		e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 1000))
		e.stock.mustAdjust(t, "2026-07-02", e.stock.stockIn(10, 2000))
		later := e.invoiceOf(t, "2026-07-10", 10)
		e.invoiceOf(t, "2026-07-05", 10)

		recosts := recostsOfDoc(t, app, "books_invoices", later)
		if method == costingAverage {
			if len(recosts) != 0 {
				t.Fatalf("%d re-costs under the average cost, want none", len(recosts))
			}
			return
		}
		if len(recosts) != 1 {
			t.Fatalf("%d re-costs of the later sale, want 1", len(recosts))
		}
		// The later sale posted 10 at 1.00; it now takes the 10 at 2.00.
		requireEntryLines(t, app, recosts[0].GetString("entry"),
			entryLine{account: e.stock.asset.Id, credit: 1000},
			entryLine{account: e.stock.cogs.Id, debit: 1000},
		)
		requireOnHand(t, app, e.stock.widget, 0, 0)
	})
}

func TestSaleStock_VoidPutsTheStockBack(t *testing.T) {
	e := newSaleStockEnv(t, costingFIFO)
	app := e.app
	inv := e.invoiceOf(t, "2026-07-01", 4)
	e.stock.mustAdjust(t, "2026-07-02", e.stock.stockIn(10, 7000))
	if err := voidInvoiceAs(app, inv.Id, e.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	recosts := recostsOfDoc(t, app, "books_invoices", inv)
	if len(recosts) != 1 || recosts[0].GetString("status") != statusVoid {
		t.Fatalf("re-costs after the void = %v, want the one re-cost, void", recosts)
	}
	if moves, _ := documentStockMoves(app, "books_invoices", inv.Id); len(moves) != 0 {
		t.Errorf("%d moves of the voided invoice, want none", len(moves))
	}
	requireOnHand(t, app, e.stock.widget, 10, 7000)
}

// A correction's post replaces the original's moves and voids its re-costs.
func TestSaleStock_CorrectionReplacesTheOriginalsMoves(t *testing.T) {
	e := newSaleStockEnv(t, costingFIFO)
	app := e.app
	original := e.invoiceOf(t, "2026-07-01", 4)
	e.stock.mustAdjust(t, "2026-07-02", e.stock.stockIn(10, 7000))

	draft := e.draftInvoiceOf(t, "2026-07-03", 3, map[string]any{"replaces": original.Id})
	correction := mustPostInvoice(t, app, draft.Id, e.users.bookkeeper.Id)

	if got := recostsOfDoc(t, app, "books_invoices", original); len(got) != 1 || got[0].GetString("status") != statusVoid {
		t.Errorf("the original's re-costs = %v, want the one re-cost, void", got)
	}
	if moves, _ := documentStockMoves(app, "books_invoices", original.Id); len(moves) != 0 {
		t.Errorf("%d moves of the replaced invoice, want none", len(moves))
	}
	requireEntryLines(t, app, correction.GetString("entry"),
		entryLine{account: e.receivable.Id, debit: 6000, customer: e.customer.Id},
		entryLine{account: e.revenue.Id, credit: 6000, customer: e.customer.Id},
		entryLine{account: e.stock.asset.Id, credit: 2100, customer: e.customer.Id},
		entryLine{account: e.stock.cogs.Id, debit: 2100, customer: e.customer.Id},
	)
	requireOnHand(t, app, e.stock.widget, 7, 4900)
}

// A bundle is never on a line: the form stores its items (checkLineProduct
// refuses a bundle), so a sale of a bundle moves the stock of each part.
func TestSaleStock_EachPartOfABundleMovesItsOwnStock(t *testing.T) {
	e := newSaleStockEnv(t, costingFIFO)
	app := e.app
	gadget := e.stock.mkInventoryItem(t, "Gadget", 300)
	inv, err := newInvoice(app, e.customer, map[string]any{"date": "2026-07-01", "due_date": "2026-07-01"})
	if err != nil {
		t.Fatal(err)
	}
	mkInvoiceLine(t, app, inv, 0, item(e.stock.widget, 2, 2000, false))
	mkInvoiceLine(t, app, inv, 1, item(gadget, 1, 1000, false))
	mkInvoiceLine(t, app, inv, 2, item(e.service, 1, 5000, false))
	mustPostInvoice(t, app, inv.Id, e.users.bookkeeper.Id)
	moves, err := documentStockMoves(app, "books_invoices", inv.Id)
	if err != nil || len(moves) != 2 {
		t.Fatalf("%d moves (err %v), want one for each Inventory item", len(moves), err)
	}
	requireOnHand(t, app, e.stock.widget, -2, -1000)
	requireOnHand(t, app, gadget, -1, -300)
}

// A document with no Inventory item writes no move and leaves the costing
// method open.
func TestSaleStock_AServiceInvoiceMovesNoStock(t *testing.T) {
	e := newSaleStockEnv(t, costingFIFO)
	app := e.app
	inv, err := newInvoice(app, e.customer, nil)
	if err != nil {
		t.Fatal(err)
	}
	mkInvoiceLine(t, app, inv, 0, item(e.service, 1, 5000, false))
	mustPostInvoice(t, app, inv.Id, e.users.bookkeeper.Id)
	if n, _ := app.CountRecords(stockMovesCollection); n != 0 {
		t.Errorf("%d stock moves, want none", n)
	}
	if _, locked := costingSettings(t, app); locked {
		t.Error("an invoice with no Inventory item locked the costing method")
	}
}

// Cash basis (cash_basis.go): an unpaid invoice counts for nothing, so every
// line of its entry is taken out, its cost of goods sold and inventory asset
// lines with the rest.
func TestSaleStock_CashBasisTakesOutTheCostLinesOfAnUnpaidInvoice(t *testing.T) {
	e := newSaleStockEnv(t, costingFIFO)
	app := e.app
	e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 1000))
	before := cashNet(t, app)
	inv := e.invoiceOf(t, "2026-07-02", 4)
	if rows := takenOutRows(t, app, "invoice", inv.Id); len(rows) != 4 {
		t.Errorf("%d taken-out rows of the invoice, want 4 (receivable, income, asset, cost of goods sold)", len(rows))
	}
	after := cashNet(t, app)
	for _, account := range []string{e.stock.cogs.Id, e.revenue.Id, e.receivable.Id} {
		if after[account] != before[account] {
			t.Errorf("account %s nets %d on the cash basis after the unpaid invoice, want %d", account, after[account], before[account])
		}
	}
	requireNoCashDrift(t, app)
}
