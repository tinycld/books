package books

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Inventory-adjust spec §3.1 and §4: books_bin_stock holds the quantity of each
// item in each bin ('' is No bin). Every writer of a stock move keeps it
// (moveBinStock), a move with no bin goes to the item's default bin at the time
// it posts, and the rows of an item add up to its quantity on hand.

// mkBin saves a bin location through the app, so the guards bound on it run.
func mkBin(t testing.TB, app core.App, name string, inactive bool) *core.Record {
	t.Helper()
	return saveRecord(t, app, "books_bins", map[string]any{"name": name, "inactive": inactive})
}

// binStockOf is the item's books_bin_stock rows, quantity by bin.
func binStockOf(t testing.TB, app core.App, product string) map[string]float64 {
	t.Helper()
	rows, err := app.FindRecordsByFilter("books_bin_stock", "product = {:p}", "", 0, 0, dbx.Params{"p": product})
	if err != nil {
		t.Fatalf("read the bin stock of %s: %v", product, err)
	}
	out := make(map[string]float64, len(rows))
	for _, r := range rows {
		if _, seen := out[r.GetString("bin")]; seen {
			t.Errorf("two bin stock rows of %s in bin %q", product, r.GetString("bin"))
		}
		out[r.GetString("bin")] = r.GetFloat("quantity")
	}
	return out
}

func setDefaultBin(t testing.TB, app core.App, product *core.Record, bin string) {
	t.Helper()
	if err := setFields(t, app, "books_products", product.Id, map[string]any{"default_bin": bin}); err != nil {
		t.Fatalf("set the default bin of %s: %v", product.GetString("name"), err)
	}
}

// requireSameBinStock compares two bin stock snapshots in hundredths.
func requireSameBinStock(t testing.TB, got, want map[string]float64, what string) {
	t.Helper()
	keys := map[string]bool{}
	for k := range got {
		keys[k] = true
	}
	for k := range want {
		keys[k] = true
	}
	for k := range keys {
		g, okGot := got[k]
		w, okWant := want[k]
		if okGot != okWant || qtyHundredths(g) != qtyHundredths(w) {
			t.Errorf("%s: bin %q holds %v (row %v), want %v (row %v)", what, k, g, okGot, w, okWant)
		}
	}
}

// requireMoveInBin asserts the one stock move of a document names bin, and that
// the item's bin stock changed from before by that move's quantity in that bin
// alone.
func requireMoveInBin(t testing.TB, app core.App, product, source, document, bin string, before map[string]float64) {
	t.Helper()
	moves, err := documentStockMoves(app, source, document)
	if err != nil || len(moves) != 1 {
		t.Fatalf("%d stock moves of %s %s (err %v), want 1", len(moves), source, document, err)
	}
	m := moves[0]
	if got := m.GetString("bin"); got != bin {
		t.Errorf("the stock move of %s is in bin %q, want %q", source, got, bin)
	}
	if m.GetFloat("quantity") == 0 {
		t.Fatalf("the stock move of %s moves no quantity", source)
	}
	want := map[string]float64{}
	for k, v := range before {
		want[k] = v
	}
	want[bin] = qtyFromHundredths(qtyHundredths(want[bin]) + qtyHundredths(m.GetFloat("quantity")))
	requireSameBinStock(t, binStockOf(t, app, product), want, "after the "+source+" posted")
}

// requireMoveNumbered asserts the one stock move of a posted document stores
// the document's number (spec §4: the move row stores bin and
// document_number), and that a replay of the item keeps it.
func requireMoveNumbered(t testing.TB, app core.App, product, source, document string) {
	t.Helper()
	want := reload(t, app, source, document).GetString("number")
	if want == "" {
		t.Fatalf("the posted %s %s has no number; the case needs one", source, document)
	}
	check := func(when string) {
		t.Helper()
		moves, err := documentStockMoves(app, source, document)
		if err != nil || len(moves) != 1 {
			t.Fatalf("%d stock moves of %s %s (err %v), want 1", len(moves), source, document, err)
		}
		if got := moves[0].GetString("document_number"); got != want {
			t.Errorf("%s: the stock move of %s has document_number %q, want the document's number %q", when, source, got, want)
		}
	}
	check("after the post")
	if err := app.RunInTransaction(func(tx core.App) error {
		return recomputeStock(tx, []string{product})
	}); err != nil {
		t.Fatalf("replay the item: %v", err)
	}
	check("after a replay")
}

// requireBinsAddUp asserts the item's bin rows add up to its quantity on hand.
func requireBinsAddUp(t testing.TB, app core.App, product string) {
	t.Helper()
	var sum int64
	for _, q := range binStockOf(t, app, product) {
		sum += qtyHundredths(q)
	}
	onHand := reload(t, app, "books_products", product).GetFloat("quantity_on_hand")
	if sum != qtyHundredths(onHand) {
		t.Errorf("the bins of %s hold %v, the quantity on hand is %v", product, qtyFromHundredths(sum), onHand)
	}
}

// Spec §3.1: every transaction that moves stock and names no bin moves it in
// the item's default bin, or in No bin when the item has none. One case for
// each of the eight kinds, each posted with the helpers of its own stock tests.
func TestBinStock_EachKindMovesInTheDefaultBin(t *testing.T) {
	cases := []struct {
		name string
		run  func(t *testing.T, withDefault bool)
	}{
		{"invoice", func(t *testing.T, withDefault bool) {
			e := newSaleStockEnv(t, costingFIFO)
			bin := defaultBinFor(t, e.app, e.stock.widget, withDefault)
			e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 1000))
			before := binStockOf(t, e.app, e.stock.widget.Id)
			inv := e.invoiceOf(t, "2026-07-02", 4)
			requireMoveInBin(t, e.app, e.stock.widget.Id, "books_invoices", inv.Id, bin, before)
			requireMoveNumbered(t, e.app, e.stock.widget.Id, "books_invoices", inv.Id)
		}},
		{"sales receipt", func(t *testing.T, withDefault bool) {
			e := newSaleStockEnv(t, costingFIFO)
			bin := defaultBinFor(t, e.app, e.stock.widget, withDefault)
			e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 1000))
			before := binStockOf(t, e.app, e.stock.widget.Id)
			receipt := e.mkReceipt(t, map[string]any{"date": "2026-07-02"})
			mkReceiptLine(t, e.app, receipt, 0, item(e.stock.widget, 4, 2000, false))
			posted := mustPostReceipt(t, e.app, receipt.Id, e.users.bookkeeper.Id)
			requireMoveInBin(t, e.app, e.stock.widget.Id, "books_sales_receipts", posted.Id, bin, before)
			requireMoveNumbered(t, e.app, e.stock.widget.Id, "books_sales_receipts", posted.Id)
		}},
		{"bill", func(t *testing.T, withDefault bool) {
			e := newBuyStockEnv(t, costingFIFO)
			bin := defaultBinFor(t, e.app, e.stock.widget, withDefault)
			before := binStockOf(t, e.app, e.stock.widget.Id)
			bill := e.billOf(t, "2026-07-01", 10, 300, nil)
			requireMoveInBin(t, e.app, e.stock.widget.Id, "books_bills", bill.Id, bin, before)
			requireMoveNumbered(t, e.app, e.stock.widget.Id, "books_bills", bill.Id)
		}},
		{"expense", func(t *testing.T, withDefault bool) {
			e := newBuyStockEnv(t, costingFIFO)
			bin := defaultBinFor(t, e.app, e.stock.widget, withDefault)
			before := binStockOf(t, e.app, e.stock.widget.Id)
			expense := e.mkExpense(t, map[string]any{"date": "2026-07-01", "vendor": e.summit.Id, "ref_no": "1042"})
			mkExpenseLine(t, e.app, expense, 0, productLine(e.stock.widget, 4, 250))
			posted := mustPostExpense(t, e.app, expense.Id, e.users.bookkeeper.Id)
			requireMoveInBin(t, e.app, e.stock.widget.Id, "books_expenses", posted.Id, bin, before)
			requireMoveNumbered(t, e.app, e.stock.widget.Id, "books_expenses", posted.Id)
		}},
		{"vendor credit", func(t *testing.T, withDefault bool) {
			e := newBuyStockEnv(t, costingFIFO)
			bin := defaultBinFor(t, e.app, e.stock.widget, withDefault)
			e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 1000))
			before := binStockOf(t, e.app, e.stock.widget.Id)
			credit := mkVendorCreditOn(t, e.app, e.summit, map[string]any{"date": "2026-07-03"})
			mkVendorCreditLine(t, e.app, credit, 0, productLine(e.stock.widget, 4, 200))
			posted := mustPostVendorCredit(t, e.app, credit.Id, e.users.bookkeeper.Id)
			requireMoveInBin(t, e.app, e.stock.widget.Id, "books_vendor_credits", posted.Id, bin, before)
			requireMoveNumbered(t, e.app, e.stock.widget.Id, "books_vendor_credits", posted.Id)
		}},
		{"credit memo", func(t *testing.T, withDefault bool) {
			e := newReturnStockEnv(t, costingFIFO)
			bin := defaultBinFor(t, e.app, e.stock.widget, withDefault)
			e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 3000))
			before := binStockOf(t, e.app, e.stock.widget.Id)
			memo := e.returnedOn(t, "2026-07-02", 2, nil)
			requireMoveInBin(t, e.app, e.stock.widget.Id, "books_credit_memos", memo.Id, bin, before)
			requireMoveNumbered(t, e.app, e.stock.widget.Id, "books_credit_memos", memo.Id)
		}},
		{"refund receipt", func(t *testing.T, withDefault bool) {
			e := newReturnStockEnv(t, costingFIFO)
			bin := defaultBinFor(t, e.app, e.stock.widget, withDefault)
			e.stock.mustAdjust(t, "2026-07-01", e.stock.stockIn(10, 1000))
			receipt := e.mkReceipt(t, map[string]any{"date": "2026-07-02", "deposit_to": e.checking.Id})
			mkReceiptLine(t, e.app, receipt, 0, item(e.stock.widget, 5, 2000, false))
			sold := mustPostReceipt(t, e.app, receipt.Id, e.users.bookkeeper.Id)
			before := binStockOf(t, e.app, e.stock.widget.Id)
			refund := e.mkRefundReceipt(t, map[string]any{"date": "2026-07-04", "sales_receipt": sold.Id})
			mkRefundReceiptLine(t, e.app, refund, 0, item(e.stock.widget, 2, 2000, false))
			posted := mustPostRefundReceipt(t, e.app, refund.Id, e.users.bookkeeper.Id)
			requireMoveInBin(t, e.app, e.stock.widget.Id, refundReceiptsCollection, posted.Id, bin, before)
			requireMoveNumbered(t, e.app, e.stock.widget.Id, refundReceiptsCollection, posted.Id)
		}},
		{"opening stock", func(t *testing.T, withDefault bool) {
			env := newItemEnv(t)
			aisle := mkBin(t, env.app, "Aisle 3", false)
			fields := map[string]any{"opening_quantity": 10, "opening_value": 4000, "opening_date": "2026-07-01"}
			bin := ""
			if withDefault {
				bin = aisle.Id
				fields["default_bin"] = bin
			}
			widget, err := newProduct(env.app, inventoryItem(env, fields))
			if err != nil {
				t.Fatalf("save an item with opening stock: %v", err)
			}
			opening := openingOf(t, env.app, widget)
			if opening == nil {
				t.Fatal("no opening adjustment")
			}
			requireMoveInBin(t, env.app, widget.Id, inventoryAdjustmentsCollection, opening.Id, bin, map[string]float64{})
			// A posted adjustment always has a number (postAdjustmentReplacing
			// takes it from its entry or from the sequence), the opening one too.
			requireMoveNumbered(t, env.app, widget.Id, inventoryAdjustmentsCollection, opening.Id)
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name+" with a default bin", func(t *testing.T) { tc.run(t, true) })
		t.Run(tc.name+" with no default bin", func(t *testing.T) { tc.run(t, false) })
	}
}

// defaultBinFor makes the bin Aisle 3 and, when withDefault, makes it the
// item's default bin. It answers the bin a move with no bin must go to.
func defaultBinFor(t testing.TB, app core.App, product *core.Record, withDefault bool) string {
	t.Helper()
	aisle := mkBin(t, app, "Aisle 3", false)
	if !withDefault {
		return ""
	}
	setDefaultBin(t, app, product, aisle.Id)
	return aisle.Id
}

// binStockEnv is a book with the invoice, bill, inventory adjustment and bin
// guards, a customer, a vendor and two bins, for the runs that mix every
// writer of bin stock.
type binStockEnv struct {
	*receiptEnv
	vendor, aisle, counter *core.Record
	client                 *restClient
}

func newBinStockEnv(t *testing.T) *binStockEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, invoiceKind)
	registerSalesDocGuards(app, billKind)
	registerInventoryAdjustmentGuards(app)
	registerBinGuards(app)
	bindHostsByKey(t, app, invoiceKind.HostKey, billKind.HostKey)
	re := receiptEnvOn(t, app)
	setCostingMethod(t, app, costingFIFO)
	if _, err := ensurePayables(app); err != nil {
		t.Fatalf("make Accounts payable: %v", err)
	}
	// The stock accounts the items take.
	stockEnvOn(t, re.ledgerEnv)
	return &binStockEnv{
		receiptEnv: re,
		vendor:     mkVendor(t, app, "Summit IT Services"),
		aisle:      mkBin(t, app, "Aisle 3", false),
		counter:    mkBin(t, app, "Front counter", false),
	}
}

// gadget saves an Inventory item with an opening quantity of 10 on
// 2026-07-01, its default bin bin (” for none).
func (e *binStockEnv) gadget(t testing.TB, bin string) *core.Record {
	t.Helper()
	r, err := newProduct(e.app, map[string]any{
		"type": "inventory", "name": "Gadget", "income_account": e.revenue.Id, "cost": 500,
		"opening_quantity": 10, "opening_value": 4000, "opening_date": "2026-07-01", "default_bin": bin,
	})
	if err != nil {
		t.Fatalf("save the gadget with opening stock: %v", err)
	}
	return r
}

func (e *binStockEnv) sell(t testing.TB, product *core.Record, date string, units float64) *core.Record {
	t.Helper()
	inv, err := newInvoice(e.app, e.customer, map[string]any{"date": date, "due_date": date})
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	mkInvoiceLine(t, e.app, inv, 0, item(product, units, 2000, false))
	return mustPostInvoice(t, e.app, inv.Id, e.users.bookkeeper.Id)
}

func (e *binStockEnv) buy(t testing.TB, product *core.Record, date string, units float64, rate int64) *core.Record {
	t.Helper()
	bill := mkBill(t, e.app, e.vendor, map[string]any{"date": date, "due_date": date})
	mkBillLine(t, e.app, bill, 0, productLine(product, units, rate))
	return mustPostBill(t, e.app, bill.Id, e.users.bookkeeper.Id)
}

func (e *binStockEnv) rest(t testing.TB) *restClient {
	t.Helper()
	if e.client == nil {
		e.client = newRestClient(t, e.app)
	}
	return e.client
}

// transfer moves qty of the product from one bin to another as the
// bookkeeper's request, and fails the test on a refusal.
func (e *binStockEnv) transfer(t testing.TB, product *core.Record, from, to string, qty float64) {
	t.Helper()
	body, err := json.Marshal(map[string]any{"product": product.Id, "from_bin": from, "to_bin": to, "quantity": qty})
	if err != nil {
		t.Fatal(err)
	}
	code, answer := e.rest(t).send(t, e.users.bookkeeper, http.MethodPost, "/api/collections/books_bin_transfers/records", string(body))
	if code != http.StatusOK {
		t.Fatalf("move %v between bins: %d %s", qty, code, answer)
	}
}

// mixedRun is opening stock of 10 in Aisle 3, a bill of 6, a sale of 4 and its
// void, a move of 5 to Front counter, the default bin changed to Front
// counter, and a sale of 3: Aisle 3 holds 11 and Front counter 2.
func (e *binStockEnv) mixedRun(t testing.TB) *core.Record {
	t.Helper()
	gadget := e.gadget(t, e.aisle.Id)
	e.buy(t, gadget, "2026-07-02", 6, 300)
	sale := e.sell(t, gadget, "2026-07-03", 4)
	if err := voidInvoiceAs(e.app, sale.Id, e.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the sale: %v", err)
	}
	e.transfer(t, gadget, e.aisle.Id, e.counter.Id, 5)
	setDefaultBin(t, e.app, gadget, e.counter.Id)
	e.sell(t, gadget, "2026-07-04", 3)
	return gadget
}

// Spec §3.1: the sum of an item's bin quantities and its No-bin quantity always
// equals its quantity on hand. A writer that skips moveBinStock breaks it.
func TestBinStock_BinsAddUpToTheQuantityOnHand(t *testing.T) {
	e := newBinStockEnv(t)
	gadget := e.mixedRun(t)
	if got := reload(t, e.app, "books_products", gadget.Id).GetFloat("quantity_on_hand"); got != 13 {
		t.Fatalf("the gadget has %v on hand after the mixed run, want 13", got)
	}
	requireBinsAddUp(t, e.app, gadget.Id)
	requireSameBinStock(t, binStockOf(t, e.app, gadget.Id),
		map[string]float64{e.aisle.Id: 11, e.counter.Id: 2}, "after the mixed run")
}

// Spec §3.1: a void takes the quantity back from the bin its stock move went
// to, not from the item's default bin of the day of the void.
func TestBinStock_AVoidTakesBackFromTheBinTheMoveWentTo(t *testing.T) {
	e := newBinStockEnv(t)
	gadget := e.gadget(t, e.aisle.Id)
	sale := e.sell(t, gadget, "2026-07-03", 4)
	requireSameBinStock(t, binStockOf(t, e.app, gadget.Id), map[string]float64{e.aisle.Id: 6}, "after the sale")
	setDefaultBin(t, e.app, gadget, e.counter.Id)
	if err := voidInvoiceAs(e.app, sale.Id, e.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the sale: %v", err)
	}
	after := binStockOf(t, e.app, gadget.Id)
	if got := after[e.aisle.Id]; qtyHundredths(got) != 1000 {
		t.Errorf("Aisle 3 holds %v after the void, want 10 again", got)
	}
	if got := after[e.counter.Id]; got != 0 {
		t.Errorf("Front counter holds %v after the void, want its 0 of before", got)
	}
	requireBinsAddUp(t, e.app, gadget.Id)
}

// Spec §3.1: opening stock moves in the item's default bin at the time it
// posts. One save that changes the default bin to Front counter and the
// opening quantity from 10 to 20 posts the new opening move in Front counter,
// the default bin that save writes, not in the stored Aisle 3.
func TestBinStock_OpeningStockTakesTheDefaultBinOfItsOwnSave(t *testing.T) {
	e := newBinStockEnv(t)
	gadget := e.gadget(t, e.aisle.Id)
	requireSameBinStock(t, binStockOf(t, e.app, gadget.Id), map[string]float64{e.aisle.Id: 10}, "after the create")
	if err := setFields(t, e.app, "books_products", gadget.Id, map[string]any{
		"default_bin": e.counter.Id, "opening_quantity": 20, "opening_value": 8000,
	}); err != nil {
		t.Fatalf("change the default bin and the opening quantity in one save: %v", err)
	}
	opening := openingOf(t, e.app, gadget)
	if opening == nil {
		t.Fatal("no posted opening adjustment after the save")
	}
	moves, err := documentStockMoves(e.app, inventoryAdjustmentsCollection, opening.Id)
	if err != nil || len(moves) != 1 {
		t.Fatalf("%d stock moves of the opening adjustment (err %v), want 1", len(moves), err)
	}
	if got := moves[0].GetString("bin"); got != e.counter.Id {
		t.Errorf("the opening stock move is in bin %q, want Front counter %q (Aisle 3 is %q)", got, e.counter.Id, e.aisle.Id)
	}
	requireSameBinStock(t, binStockOf(t, e.app, gadget.Id),
		map[string]float64{e.aisle.Id: 0, e.counter.Id: 20}, "after the save")
	requireBinsAddUp(t, e.app, gadget.Id)
}

// stockMoveRows is each stock move of the item, its bin and quantity by id.
func stockMoveRows(t testing.TB, app core.App, product string) map[string][2]any {
	t.Helper()
	rows, err := app.FindRecordsByFilter(stockMovesCollection, "product = {:p}", "seq", 0, 0, dbx.Params{"p": product})
	if err != nil {
		t.Fatal(err)
	}
	out := make(map[string][2]any, len(rows))
	for _, r := range rows {
		out[r.Id] = [2]any{r.GetString("bin"), r.GetFloat("quantity")}
	}
	return out
}

// Spec §3.1: changing an item's default bin moves no stock; it applies to
// transactions posted after it.
func TestBinStock_ChangingTheDefaultBinMovesNoStock(t *testing.T) {
	e := newBinStockEnv(t)
	gadget := e.gadget(t, e.aisle.Id)
	e.sell(t, gadget, "2026-07-03", 3)
	rows, moves := binStockOf(t, e.app, gadget.Id), stockMoveRows(t, e.app, gadget.Id)
	requireSameBinStock(t, rows, map[string]float64{e.aisle.Id: 7}, "before the default bin changed")
	if len(moves) != 2 {
		t.Fatalf("%d stock moves before the change, want the opening and the sale", len(moves))
	}
	setDefaultBin(t, e.app, gadget, e.counter.Id)
	requireSameBinStock(t, binStockOf(t, e.app, gadget.Id), rows, "after the default bin changed")
	after := stockMoveRows(t, e.app, gadget.Id)
	if len(after) != len(moves) {
		t.Errorf("%d stock moves after the default bin changed, want %d", len(after), len(moves))
	}
	for id, m := range moves {
		if after[id] != m {
			t.Errorf("stock move %s is %v after the default bin changed, want %v", id, after[id], m)
		}
	}
}

// Spec §4: rebuildBinStock writes an item's rows again from its stock moves and
// its moves between bins, and gives what the incremental writes gave.
func TestBinStock_RebuildGivesTheIncrementalRows(t *testing.T) {
	e := newBinStockEnv(t)
	gadget := e.mixedRun(t)
	incremental := binStockOf(t, e.app, gadget.Id)
	if len(incremental) == 0 {
		t.Fatal("the mixed run left no bin stock rows")
	}
	// The rows go first, so a rebuild that writes nothing is seen.
	if _, err := e.app.DB().NewQuery("DELETE FROM books_bin_stock WHERE product = {:p}").
		Bind(dbx.Params{"p": gadget.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	if err := e.app.RunInTransaction(func(tx core.App) error {
		return rebuildBinStock(tx, gadget.Id)
	}); err != nil {
		t.Fatalf("rebuild the bin stock: %v", err)
	}
	requireSameBinStock(t, binStockOf(t, e.app, gadget.Id), incremental, "after the rebuild")
}

// Spec §8: no refusal of a sale that takes a bin below zero. The item still
// has stock in No bin; its default bin has none.
func TestBinStock_ASaleMayTakeABinBelowZero(t *testing.T) {
	e := newBinStockEnv(t)
	gadget := e.gadget(t, "")
	setDefaultBin(t, e.app, gadget, e.aisle.Id)
	sale := e.sell(t, gadget, "2026-07-03", 3)
	if sale.GetString("status") != statusPosted {
		t.Fatalf("the sale is %s, want posted", sale.GetString("status"))
	}
	requireSameBinStock(t, binStockOf(t, e.app, gadget.Id),
		map[string]float64{"": 10, e.aisle.Id: -3}, "after the sale")
	requireBinsAddUp(t, e.app, gadget.Id)
}
