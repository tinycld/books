package books

import (
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Every kind var is found by its collection; a kind missing from salesDocKinds
// would be named as an unknown document in a re-cost's memo.
func TestSalesDocKindOf_FindsEveryKindByItsCollection(t *testing.T) {
	kinds := map[string]salesDocKind{
		"invoiceKind": invoiceKind, "salesReceiptKind": salesReceiptKind, "estimateKind": estimateKind,
		"creditMemoKind": creditMemoKind, "refundReceiptKind": refundReceiptKind,
		"billKind": billKind, "expenseKind": expenseKind, "vendorCreditKind": vendorCreditKind,
		"purchaseOrderKind": purchaseOrderKind,
	}
	for name, want := range kinds {
		got, ok := salesDocKindOf(want.Collection)
		if !ok || got.Collection != want.Collection || got.DocType != want.DocType {
			t.Errorf("%s: salesDocKindOf(%q) = %q, %v; want its own kind", name, want.Collection, got.Collection, ok)
		}
	}
	if len(salesDocKinds) != len(kinds) {
		t.Errorf("salesDocKinds holds %d kinds, want %d", len(salesDocKinds), len(kinds))
	}
	if _, ok := salesDocKindOf("books_accounts"); ok {
		t.Error("books_accounts found as a kind")
	}
}

// A source that is neither an adjustment nor a kind, with no entry, is named
// from its number, or generically with none.
func TestStockDocumentName_NamesAnUnknownSource(t *testing.T) {
	se := newStockEnv(t)
	adj := se.mustAdjust(t, "2026-07-01", se.stockIn(1, 100))
	entry := reload(t, se.app, "books_journal_entries", adj.GetString("entry"))
	number := entry.GetString("number")
	if number == "" {
		t.Fatal("the posted entry has no number")
	}
	got, err := stockDocumentName(se.app, "books_journal_entries", entry.Id)
	if err != nil || got != "Document "+number {
		t.Errorf("name of a numbered record = %q, err %v, want %q", got, err, "Document "+number)
	}
	got, err = stockDocumentName(se.app, "books_settings", settingsID)
	if err != nil || got != "A document" {
		t.Errorf("name of a record with no number = %q, err %v, want %q", got, err, "A document")
	}
}

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

// A removal in a closed period that a later stock-in prices again: the
// re-cost cannot post on the removal's day, so it posts on the stock-in's,
// which passed the close date itself, and the stock-in posts.
func TestRecost_OfAMoveInAClosedPeriodPostsOnTheDayOfItsCause(t *testing.T) {
	eachCostingMethod(t, func(t *testing.T, se *stockEnv, _ string) {
		out := se.mustAdjust(t, "2026-07-01", se.stockOut(4))
		if err := setFields(t, se.app, "books_settings", settingsID, map[string]any{"close_date": "2026-07-15"}); err != nil {
			t.Fatalf("close the books: %v", err)
		}
		se.mustAdjust(t, "2026-07-20", se.stockIn(10, 7000))
		recosts := recostsOf(t, se.app, out)
		if len(recosts) != 1 {
			t.Fatalf("%d re-costs of the oversold removal, want 1", len(recosts))
		}
		got := [3]string{recosts[0].GetString("status"), recosts[0].GetString("date"), recosts[0].GetString("memo")}
		want := [3]string{statusPosted, "2026-07-20", "Re-cost of Inventory adjustment IA-1"}
		if got != want {
			t.Errorf("re-cost status/date/memo = %v, want %v", got, want)
		}
		requireEntryLines(t, se.app, recosts[0].GetString("entry"),
			entryLine{account: se.asset.Id, credit: 800},
			entryLine{account: se.shrinkage(t).Id, debit: 800},
		)
		requireOnHand(t, se.app, se.widget, 6, 4200)
	})
}

// A cause that is itself in the closed period cannot carry the re-cost
// either: it is refused for its own day, on its date field, before the
// replay, and nothing of the post is written.
func TestRecost_ACauseInAClosedPeriodIsRefusedOnItsDate(t *testing.T) {
	se := newStockEnv(t)
	se.mustAdjust(t, "2026-07-01", se.stockOut(4))
	if err := setFields(t, se.app, "books_settings", settingsID, map[string]any{"close_date": "2026-07-15"}); err != nil {
		t.Fatalf("close the books: %v", err)
	}
	_, err := se.adjust("2026-07-10", se.stockIn(10, 7000))
	requireFieldRefusal(t, err, "date",
		"The books are closed through 2026-07-15. Ask a Books admin for a close-date override to post on 2026-07-10.")
	if n, _ := se.app.CountRecords(inventoryAdjustmentsCollection); n != 1 {
		t.Errorf("%d adjustments after the refusal, want the 1 removal", n)
	}
	requireOnHand(t, se.app, se.widget, -4, -2000)
}

// Voiding a stock-in changes what a later removal cost; the removal's re-cost
// comes from the withdraw, not from a post.
func TestRecost_AVoidedStockInRecostsTheLaterRemoval(t *testing.T) {
	eachCostingMethod(t, func(t *testing.T, se *stockEnv, method string) {
		// FIFO: the removal took 5 of the 500 stock-in (250) and now takes 5 of the
		// 1000 one (500). Average: 5 of 20 for 1500 (375), then 5 of 10 for 1000 (500).
		difference := map[string]int{costingFIFO: 250, costingAverage: 125}[method]
		first := se.mustAdjust(t, "2026-07-01", se.stockIn(10, 500))
		se.mustAdjust(t, "2026-07-02", se.stockIn(10, 1000))
		out := se.mustAdjust(t, "2026-07-03", se.stockOut(5))
		if got := recostsOf(t, se.app, out); len(got) != 0 {
			t.Fatalf("%d re-costs before the void, want none", len(got))
		}

		err := se.app.RunInTransaction(func(tx core.App) error {
			fresh, err := tx.FindRecordById(inventoryAdjustmentsCollection, first.Id)
			if err != nil {
				return err
			}
			return voidSystemAdjustment(tx, fresh, se.users.bookkeeper.Id, fresh.GetDateTime("posted_at").Time())
		})
		if err != nil {
			t.Fatalf("void the stock-in: %v", err)
		}
		recosts := recostsOf(t, se.app, out)
		if len(recosts) != 1 {
			t.Fatalf("%d re-costs of the removal, want 1", len(recosts))
		}
		if got := recosts[0].GetString("date"); got != "2026-07-03" {
			t.Errorf("re-cost date = %s, want the removal's 2026-07-03", got)
		}
		requireEntryLines(t, se.app, recosts[0].GetString("entry"),
			entryLine{account: se.asset.Id, credit: difference},
			entryLine{account: se.shrinkage(t).Id, debit: difference},
		)
		drifted, err := driftedStockMoves(se.app, []string{se.widget.Id})
		if err != nil || len(drifted) != 0 {
			t.Errorf("%d moves still differ from the ledger (err %v), want none", len(drifted), err)
		}
	})
}

// A correction takes the re-costs of the document it replaces away with that
// document's moves.
func TestRecost_AreVoidedWithTheDocumentACorrectionReplaces(t *testing.T) {
	se := newStockEnv(t)
	se.mustAdjust(t, "2026-07-02", se.stockIn(10, 1000))
	out := se.mustAdjust(t, "2026-07-03", se.stockOut(5))
	se.mustAdjust(t, "2026-07-01", se.stockIn(10, 500))
	if got := recostsOf(t, se.app, out); len(got) != 1 {
		t.Fatalf("%d re-costs before the correction, want 1", len(got))
	}

	correction := se.receipt("adjustment0000x", "2026-07-03", 5, 500)
	correction.Source = inventoryAdjustmentsCollection
	err := se.app.RunInTransaction(func(tx core.App) error {
		_, err := postDocumentStock(tx, se.users.bookkeeper.Id, inventoryAdjustmentsCollection, correction.Document, out.Id,
			correction.Date, []stockMoveInput{correction})
		return err
	})
	if err != nil {
		t.Fatalf("post the correction's stock: %v", err)
	}
	recost := recostsOf(t, se.app, out)[0]
	if recost.GetString("status") != statusVoid {
		t.Errorf("the re-cost of the replaced document is %s, want void", recost.GetString("status"))
	}
	if got := reload(t, se.app, "books_journal_entries", recost.GetString("entry")).GetString("status"); got != statusVoid {
		t.Errorf("the re-cost's entry is %s, want void", got)
	}
	if n, _ := se.app.CountRecords(stockMovesCollection, dbx.HashExp{"document": out.Id}); n != 0 {
		t.Errorf("%d moves of the replaced document, want none", n)
	}
}

// A drift that nets to no journal line (a move whose asset and offset account
// are one) posts no adjustment, and the ledger is recorded as holding it.
func TestRecost_ADriftWithNoJournalLineIsOnlyMarkedPosted(t *testing.T) {
	se := newStockEnv(t)
	post := func(document string, m stockMoveInput) {
		t.Helper()
		err := se.app.RunInTransaction(func(tx core.App) error {
			_, err := postDocumentStock(tx, se.users.bookkeeper.Id, m.Source, document, "", m.Date, []stockMoveInput{m})
			return err
		})
		if err != nil {
			t.Fatalf("post the stock of %s: %v", document, err)
		}
	}
	post("bill00000000001", se.receipt("bill00000000001", "2026-07-02", 10, 1000))
	sale := se.sold("inv00000000001", "2026-07-03", 5)
	sale.OffsetAccount = se.asset.Id
	post("inv00000000001", sale)
	post("bill00000000002", se.receipt("bill00000000002", "2026-07-01", 10, 500))

	if n, _ := se.app.CountRecords(inventoryAdjustmentsCollection); n != 0 {
		t.Errorf("%d adjustments, want none for a drift with no journal line", n)
	}
	drifted, err := driftedStockMoves(se.app, []string{se.widget.Id})
	if err != nil || len(drifted) != 0 {
		t.Errorf("%d moves still differ from the ledger (err %v), want none", len(drifted), err)
	}
}

// A re-cost memo names a sales document that posted no entry as the package
// names it elsewhere, never as an inventory adjustment.
func TestStockDocumentName_NamesASalesDocumentWithNoEntry(t *testing.T) {
	ie := newInvoiceEnv(t)
	invoice := ie.mkInvoice(t, nil)
	got, err := stockDocumentName(ie.app, "books_invoices", invoice.Id)
	if err != nil {
		t.Fatal(err)
	}
	if want := "This invoice"; got != want {
		t.Errorf("name of a draft invoice = %q, want %q", got, want)
	}
}
