package books

import (
	"reflect"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// A correction names the document it replaces: that document's moves go, the
// correction's take their place, in one replay.
func TestPostDocumentStock_ReplacesTheOriginalsMoves(t *testing.T) {
	se := newStockEnv(t)
	original, correction := "bill00000000001", "bill00000000002"
	post := func(document, replaces string, units, value int64) []*core.Record {
		t.Helper()
		var own []*core.Record
		err := se.app.RunInTransaction(func(tx core.App) error {
			var err error
			own, err = postDocumentStock(tx, se.users.bookkeeper.Id, "books_bills", document, replaces, "2026-07-01",
				[]stockMoveInput{se.receipt(document, "2026-07-01", units, value)})
			return err
		})
		if err != nil {
			t.Fatalf("post the stock of %s: %v", document, err)
		}
		return own
	}
	post(original, "", 10, 1000)
	own := post(correction, original, 4, 600)

	if len(own) != 1 || own[0].GetInt("value") != 600 || own[0].GetInt("posted_value") != 600 {
		t.Fatalf("the correction's moves = %v, want one move of 600 the ledger holds", own)
	}
	if n, _ := se.app.CountRecords(stockMovesCollection, dbx.HashExp{"document": original}); n != 0 {
		t.Errorf("%d moves of the replaced document, want none", n)
	}
	requireOnHand(t, se.app, se.widget, 4, 600)
	if got, want := stockCostLines(own), []postingLine{{Account: se.asset.Id, Debit: 600}, {Account: se.cogs.Id, Credit: 600}}; !reflect.DeepEqual(got, want) {
		t.Errorf("cost lines = %+v, want %+v", got, want)
	}
}

// A move that names another document or collection would be written but never
// read back nor marked posted: the door refuses it and writes nothing.
func TestPostDocumentStock_RefusesAMoveOfAnotherDocument(t *testing.T) {
	se := newStockEnv(t)
	other := se.receipt("bill00000000009", "2026-07-01", 3, 300)
	otherSource := se.receipt("bill00000000001", "2026-07-01", 3, 300)
	otherSource.Source = "books_invoices"
	for name, move := range map[string]stockMoveInput{"document": other, "source": otherSource} {
		err := se.app.RunInTransaction(func(tx core.App) error {
			_, err := postDocumentStock(tx, se.users.bookkeeper.Id, "books_bills", "bill00000000001", "", "2026-07-01",
				[]stockMoveInput{move})
			return err
		})
		if err == nil {
			t.Errorf("a move of another %s was posted, want an error", name)
		}
	}
	if n, _ := se.app.CountRecords(stockMovesCollection); n != 0 {
		t.Errorf("%d moves written, want none", n)
	}
	requireOnHand(t, se.app, se.widget, 0, 0)
}

func TestWithdrawDocumentStock_TakesTheMovesAway(t *testing.T) {
	se := newStockEnv(t)
	document := "bill00000000001"
	err := se.app.RunInTransaction(func(tx core.App) error {
		_, err := postDocumentStock(tx, se.users.bookkeeper.Id, "books_bills", document, "", "2026-07-01",
			[]stockMoveInput{se.receipt(document, "2026-07-01", 10, 1000)})
		return err
	})
	if err != nil {
		t.Fatalf("post the stock: %v", err)
	}
	requireOnHand(t, se.app, se.widget, 10, 1000)

	err = se.app.RunInTransaction(func(tx core.App) error {
		return withdrawDocumentStock(tx, se.users.bookkeeper.Id, "books_bills", document)
	})
	if err != nil {
		t.Fatalf("withdraw the stock: %v", err)
	}
	if n, _ := se.app.CountRecords(stockMovesCollection, dbx.HashExp{"document": document}); n != 0 {
		t.Errorf("%d moves left, want none", n)
	}
	requireOnHand(t, se.app, se.widget, 0, 0)

	err = se.app.RunInTransaction(func(tx core.App) error {
		return withdrawDocumentStock(tx, se.users.bookkeeper.Id, "books_bills", document)
	})
	if err != nil {
		t.Errorf("withdraw of a document with no moves: %v", err)
	}
}

// requireEveryMoveNumbered asserts the document has want stock moves and each
// stores the document's number (spec §4 books_stock_moves.document_number).
func requireEveryMoveNumbered(t testing.TB, app core.App, source, document string, want int) {
	t.Helper()
	number := reload(t, app, source, document).GetString("number")
	if number == "" {
		t.Fatalf("the posted %s %s has no number; the case needs one", source, document)
	}
	moves, err := documentStockMoves(app, source, document)
	if err != nil || len(moves) != want {
		t.Fatalf("%d stock moves of %s %s (err %v), want %d", len(moves), source, document, err, want)
	}
	for i, m := range moves {
		if got := m.GetString("document_number"); got != number {
			t.Errorf("stock move %d of %s has document_number %q, want %q", i+1, source, got, number)
		}
	}
}

// requireDocumentNumber asserts every stock move of the document stores number.
func requireDocumentNumber(t testing.TB, app core.App, source, document, number string) {
	t.Helper()
	moves, err := documentStockMoves(app, source, document)
	if err != nil || len(moves) == 0 {
		t.Fatalf("%d stock moves of %s %s (err %v), want some", len(moves), source, document, err)
	}
	for i, m := range moves {
		if got := m.GetString("document_number"); got != number {
			t.Errorf("stock move %d of %s %s has document_number %q, want %q", i+1, source, document, got, number)
		}
	}
}

// postAdjustmentOf saves a manual draft adjustment of lines through the guards
// and posts it as the bookkeeper; replaces names the adjustment it corrects
// ("" for none).
func postAdjustmentOf(t testing.TB, e *binStockEnv, date, replaces string, lines ...adjustmentLineInput) *core.Record {
	t.Helper()
	draft, err := saveNew(e.app, inventoryAdjustmentsCollection, map[string]any{
		"status": statusDraft, "kind": adjustmentKindManual, "date": date, "replaces": replaces,
	})
	if err != nil {
		t.Fatalf("save a draft adjustment: %v", err)
	}
	for i, l := range lines {
		if _, err := saveNew(e.app, inventoryAdjustmentLinesCollection, map[string]any{
			"adjustment": draft.Id, "product": l.Product, "quantity": l.Quantity, "value": l.Value, "bin": l.Bin, "position": i,
		}); err != nil {
			t.Fatalf("save adjustment line %d: %v", i+1, err)
		}
	}
	if err := setFieldsOf(e.app, inventoryAdjustmentsCollection, draft.Id, map[string]any{
		"status": statusPosted, "posted_by": e.users.bookkeeper.Id,
	}); err != nil {
		t.Fatalf("post the adjustment: %v", err)
	}
	return reload(t, e.app, inventoryAdjustmentsCollection, draft.Id)
}

// Spec §4: after a post, every stock move of an invoice, a bill and an
// adjustment stores the document's number; an opening-stock move the number of
// its opening adjustment.
func TestStockMoves_CarryTheirDocumentsNumber(t *testing.T) {
	e := newBinStockEnv(t)
	gadget := e.gadget(t, e.aisle.Id)
	opening := openingOf(t, e.app, gadget)
	if opening == nil {
		t.Fatal("no opening adjustment")
	}
	requireEveryMoveNumbered(t, e.app, inventoryAdjustmentsCollection, opening.Id, 1)

	bill := mkBill(t, e.app, e.vendor, map[string]any{"date": "2026-07-02", "due_date": "2026-07-02"})
	mkBillLine(t, e.app, bill, 0, productLine(gadget, 3, 300))
	mkBillLine(t, e.app, bill, 1, productLine(gadget, 2, 350))
	posted := mustPostBill(t, e.app, bill.Id, e.users.bookkeeper.Id)
	requireEveryMoveNumbered(t, e.app, "books_bills", posted.Id, 2)

	inv, err := newInvoice(e.app, e.customer, map[string]any{"date": "2026-07-03", "due_date": "2026-07-03"})
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	mkInvoiceLine(t, e.app, inv, 0, item(gadget, 2, 2000, false))
	mkInvoiceLine(t, e.app, inv, 1, item(gadget, 1, 2000, false))
	sold := mustPostInvoice(t, e.app, inv.Id, e.users.bookkeeper.Id)
	requireEveryMoveNumbered(t, e.app, "books_invoices", sold.Id, 2)

	adj := postAdjustmentOf(t, e, "2026-07-04", "",
		adjustmentLineInput{Product: gadget.Id, Quantity: -1, Bin: e.aisle.Id},
		adjustmentLineInput{Product: gadget.Id, Quantity: 2, Value: 800, Bin: e.counter.Id},
	)
	requireEveryMoveNumbered(t, e.app, inventoryAdjustmentsCollection, adj.Id, 2)
}

// Spec §3.4 and §4: a correction's moves carry the new document's number, and
// the replaced document keeps no move.
func TestStockMoves_ACorrectionsMovesCarryTheNewNumber(t *testing.T) {
	t.Run("bill", func(t *testing.T) {
		e := newBinStockEnv(t)
		gadget := e.gadget(t, e.aisle.Id)
		original := e.buy(t, gadget, "2026-07-02", 6, 300)
		draft := mkBill(t, e.app, e.vendor, map[string]any{"date": "2026-07-02", "due_date": "2026-07-02", "replaces": original.Id})
		mkBillLine(t, e.app, draft, 0, productLine(gadget, 4, 300))
		// A bill's correction keeps its original's number; its moves are the
		// correction's own.
		correction := mustPostBill(t, e.app, draft.Id, e.users.bookkeeper.Id)
		requireEveryMoveNumbered(t, e.app, "books_bills", correction.Id, 1)
		if n, _ := e.app.CountRecords(stockMovesCollection, dbx.HashExp{"document": original.Id}); n != 0 {
			t.Errorf("%d stock moves of the replaced bill, want none", n)
		}
	})
	t.Run("inventory adjustment", func(t *testing.T) {
		e := newBinStockEnv(t)
		gadget := e.gadget(t, e.aisle.Id)
		original := postAdjustmentOf(t, e, "2026-07-02", "", adjustmentLineInput{Product: gadget.Id, Quantity: -3, Bin: e.aisle.Id})
		correction := postAdjustmentOf(t, e, "2026-07-02", original.Id, adjustmentLineInput{Product: gadget.Id, Quantity: -2, Bin: e.aisle.Id})
		if correction.GetString("number") == original.GetString("number") {
			t.Fatalf("the correction took the original's number %q", original.GetString("number"))
		}
		requireEveryMoveNumbered(t, e.app, inventoryAdjustmentsCollection, correction.Id, 1)
		if n, _ := e.app.CountRecords(stockMovesCollection, dbx.HashExp{"document": original.Id}); n != 0 {
			t.Errorf("%d stock moves of the replaced adjustment, want none", n)
		}
	})
}

// Do step 4: stampStockMoveNumbers writes the number on the moves of one
// document only, cuts a number over 40 characters to 40, and a document no
// poster numbers keeps an empty document_number.
//
// The empty number is of this helper only: no real kind posts stock with no
// number. A grep of the non-test callers of postDocumentStock and addStockMoves
// finds two posters, salesDocStockLines (document_stock.go, every
// registerSalesDocGuards kind, bills among them) and postAdjustmentReplacing
// (inventory_adjustments.go: manual, opening by syncOpeningStock through
// newSystemAdjustment; a re-cost writes no move). Each numbers its document
// before numberPostedMoves, from postDocument's entry or allocateNumber, and
// formatNumber is never "" (a prefix and the counter). So the case calls
// postDocumentStock with no poster and no document row.
func TestStampStockMoveNumbers_StampsOneDocument(t *testing.T) {
	se := newStockEnv(t)
	first, second := "bill00000000001", "bill00000000002"
	for _, document := range []string{first, second} {
		err := se.app.RunInTransaction(func(tx core.App) error {
			_, err := postDocumentStock(tx, se.users.bookkeeper.Id, "books_bills", document, "", "2026-07-01",
				[]stockMoveInput{se.receipt(document, "2026-07-01", 2, 200)})
			return err
		})
		if err != nil {
			t.Fatalf("post the stock of %s: %v", document, err)
		}
	}
	requireDocumentNumber(t, se.app, "books_bills", first, "")

	stamp := func(number string) {
		t.Helper()
		if err := se.app.RunInTransaction(func(tx core.App) error {
			return stampStockMoveNumbers(tx, "books_bills", first, number)
		}); err != nil {
			t.Fatalf("stamp %q: %v", number, err)
		}
	}
	stamp("B-7")
	requireDocumentNumber(t, se.app, "books_bills", first, "B-7")
	requireDocumentNumber(t, se.app, "books_bills", second, "")

	// books_stock_moves.document_number holds 40 characters (migration 2100000049).
	stamp(strings.Repeat("9", 41))
	requireDocumentNumber(t, se.app, "books_bills", first, strings.Repeat("9", 40))
	requireDocumentNumber(t, se.app, "books_bills", second, "")
}

func TestInventoryAccounts_OwnAccountsThenTheChart(t *testing.T) {
	se := newStockEnv(t)
	asset, cogs, err := inventoryAccounts(se.app, se.widget)
	if err != nil || asset != se.asset.Id || cogs != se.cogs.Id {
		t.Errorf("item with no accounts: %q, %q, %v; want the chart's %q, %q", asset, cogs, err, se.asset.Id, se.cogs.Id)
	}

	ownAsset := mkAccount(t, se.app, "Own stock", "other_current_asset", "inventory")
	ownCogs := mkAccount(t, se.app, "Own cost", "cost_of_goods_sold", "supplies_materials")
	if err := setFields(t, se.app, "books_products", se.widget.Id, map[string]any{
		"asset_account": ownAsset.Id, "expense_account": ownCogs.Id,
	}); err != nil {
		t.Fatalf("name the item's accounts: %v", err)
	}
	item := reload(t, se.app, "books_products", se.widget.Id)
	asset, cogs, err = inventoryAccounts(se.app, item)
	if err != nil || asset != ownAsset.Id || cogs != ownCogs.Id {
		t.Errorf("item with accounts: %q, %q, %v; want %q, %q", asset, cogs, err, ownAsset.Id, ownCogs.Id)
	}
}

func TestEnsureInventoryAccounts_CreateEachOnce(t *testing.T) {
	env := newLedgerEnv(t)
	cases := []struct {
		ensure                        func(tx core.App) (*core.Record, error)
		name, typ, detailType, number string
	}{
		{ensureInventoryAsset, "Inventory asset", "other_current_asset", "inventory", "1300"},
		{ensureCostOfGoodsSold, "Cost of goods sold", "cost_of_goods_sold", "supplies_materials", "5000"},
		{ensureInventoryShrinkage, "Inventory shrinkage", "cost_of_goods_sold", "inventory_shrinkage", "5100"},
		{ensureOpeningBalanceEquity, "Opening Balance Equity", "equity", "opening_balance_equity", "3000"},
	}
	for _, tc := range cases {
		first, err := tc.ensure(env.app)
		if err != nil {
			t.Fatalf("ensure %s: %v", tc.name, err)
		}
		got := [4]string{first.GetString("name"), first.GetString("type"), first.GetString("detail_type"), first.GetString("number")}
		if got != [4]string{tc.name, tc.typ, tc.detailType, tc.number} {
			t.Errorf("account = %v, want %s", got, tc.name)
		}
		again, err := tc.ensure(env.app)
		if err != nil || again.Id != first.Id {
			t.Errorf("the second ensure of %s made another account (err %v)", tc.name, err)
		}
	}
}
