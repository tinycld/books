package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// The card mark and the doc type on the line tables (1099 report spec §11 Q21
// changed, 2026-11-22): every books_journal_lines row and every
// books_cash_basis_lines row holds its own entry's card_payment and doc_type
// (a cash row: its entry field, not its payment_entry), kept in step on every
// write path, and only Books writes them.

// lecTables are the two line tables that hold the copies.
var lecTables = []string{"books_journal_lines", cashLinesCollection}

// lecRequireFields fails when a line table has no card_payment or doc_type
// field, so a missing field is not read as false or blank.
func lecRequireFields(t testing.TB, app core.App) {
	t.Helper()
	for _, table := range lecTables {
		col, err := app.FindCollectionByNameOrId(table)
		if err != nil {
			t.Fatalf("read the collection %s: %v", table, err)
		}
		for _, field := range []string{"card_payment", "doc_type"} {
			if col.Fields.GetByName(field) == nil {
				t.Fatalf("%s has no field %s (the copy of its entry's %s)", table, field, field)
			}
		}
	}
}

// lecMismatchSQL selects every line and cash row whose copy is not its
// entry's, or whose entry is missing.
const lecMismatchSQL = `
	SELECT 'books_journal_lines' AS tbl, l.id AS id, l.card_payment AS card, l.doc_type AS doc,
		IFNULL(e.card_payment, 'no entry') AS entry_card, IFNULL(e.doc_type, 'no entry') AS entry_doc
	FROM books_journal_lines l LEFT JOIN books_journal_entries e ON e.id = l.entry
	WHERE e.id IS NULL OR l.card_payment IS NOT e.card_payment OR l.doc_type IS NOT e.doc_type
	UNION ALL
	SELECT 'books_cash_basis_lines', c.id, c.card_payment, c.doc_type,
		IFNULL(e.card_payment, 'no entry'), IFNULL(e.doc_type, 'no entry')
	FROM books_cash_basis_lines c LEFT JOIN books_journal_entries e ON e.id = c.entry
	WHERE e.id IS NULL OR c.card_payment IS NOT e.card_payment OR c.doc_type IS NOT e.doc_type`

// requireCopiesMatch checks, in one SQL read over both tables, that no line
// and no cash row has a copy other than its entry's, and that the book has
// rows in both tables and card rows in both, so an empty or all-false book
// cannot pass.
func requireCopiesMatch(t testing.TB, app core.App, what string) {
	t.Helper()
	lecRequireFields(t, app)
	var bad []struct {
		Tbl       string `db:"tbl"`
		ID        string `db:"id"`
		Card      string `db:"card"`
		Doc       string `db:"doc"`
		EntryCard string `db:"entry_card"`
		EntryDoc  string `db:"entry_doc"`
	}
	if err := app.DB().NewQuery(lecMismatchSQL).All(&bad); err != nil {
		t.Fatalf("%s: read the rows whose copy is not their entry's: %v", what, err)
	}
	if len(bad) != 0 {
		var rows []string
		for _, r := range bad {
			rows = append(rows, fmt.Sprintf("%s %s: card_payment %s doc_type %q, entry %s %q", r.Tbl, r.ID, r.Card, r.Doc, r.EntryCard, r.EntryDoc))
		}
		t.Errorf("%s: %d rows have a copy other than their entry's, want 0:\n%s", what, len(bad), strings.Join(rows, "\n"))
	}
	for _, table := range lecTables {
		if n := countOf(t, app, table, nil); n == 0 {
			t.Errorf("%s: %s has no rows, want the rows of the posts", what, table)
		}
		if n := countOf(t, app, table, dbx.HashExp{"card_payment": true}); n == 0 {
			t.Errorf("%s: %s has no row with card_payment true, want the card payments' rows", what, table)
		}
	}
}

// requireEntryCopies checks the lines of entryID (and its cash rows, by their
// entry field, when cash) hold card and doc. At least one line, and with cash
// at least one cash row, must be there.
func requireEntryCopies(t testing.TB, app core.App, what, entryID string, card bool, doc string, cash bool) {
	t.Helper()
	lecRequireFields(t, app)
	if entryID == "" {
		t.Fatalf("%s: no entry", what)
	}
	tables := lecTables[:1]
	if cash {
		tables = lecTables
	}
	for _, table := range tables {
		rows, err := app.FindAllRecords(table, dbx.HashExp{"entry": entryID})
		if err != nil {
			t.Fatalf("%s: read the %s rows of the entry: %v", what, table, err)
		}
		if len(rows) == 0 {
			t.Errorf("%s: the entry has no %s rows, want its rows", what, table)
		}
		for _, r := range rows {
			if r.GetBool("card_payment") != card || r.GetString("doc_type") != doc {
				t.Errorf("%s: %s %s has card_payment %v doc_type %q, want %v %q",
					what, table, r.Id, r.GetBool("card_payment"), r.GetString("doc_type"), card, doc)
			}
		}
	}
}

// Pin: after each write path that writes lines or cash rows, every row holds
// its entry's card mark and doc type.
func TestLineEntryCopy_EveryWritePathKeepsTheCopy(t *testing.T) {
	b := new1099Book(t)
	app := b.app
	v := f1099Vendor(t, b, "Copy Check Co")

	opening := mustPost(t, app, mkOpening(t, app, "2025-12-31", "",
		ln{b.bank, 50000, 0}, ln{openingEquity(t, app), 0, 50000}).Id, b.users.bookkeeper.Id)
	requireEntryCopies(t, app, "an opening balance", opening.Id, false, docTypeJournal, false)

	journal := b.postEntry(t, f1099Day, v, b.nec, 4000)
	requireEntryCopies(t, app, "a manual journal entry", journal.Id, false, docTypeJournal, false)

	cardExpense := f1099Pay(t, b, f1099Expense, v, b.nec, 10000, "credit_card", b.bank)
	requireEntryCopies(t, app, "an expense by credit card", cardExpense.GetString("entry"), true, docTypeExpense, false)

	checkExpense := f1099Pay(t, b, f1099Expense, v, b.misc1, 11000, "check", b.bank)
	requireEntryCopies(t, app, "an expense by check", checkExpense.GetString("entry"), false, docTypeExpense, false)

	cardBillPayment := f1099Pay(t, b, f1099BillPayment, v, b.nec, 20000, "credit_card", b.bank)
	requireEntryCopies(t, app, "a bill payment by credit card (lines and the paid bill's cash rows)",
		cardBillPayment.GetString("entry"), true, docTypeBillPayment, true)

	cardRefund := f1099Pay(t, b, f1099VendorRefund, v, b.nec, 3000, "check", b.card)
	requireEntryCopies(t, app, "a vendor refund to the credit card account", cardRefund.GetString("entry"), true, docTypeVendorRefund, true)

	voided := f1099Pay(t, b, f1099Expense, v, b.nec, 6000, "credit_card", b.bank)
	if err := voidExpenseAs(app, voided.Id, b.users.admin.Id); err != nil {
		t.Fatalf("void the card expense: %v", err)
	}
	requireEntryCopies(t, app, "the reversal of a voided card expense",
		findReversal(t, app, voided.GetString("entry")).Id, true, docTypeExpense, false)

	original := f1099Pay(t, b, f1099Expense, v, b.nec, 7000, "credit_card", b.bank)
	draft := b.mkExpense(t, map[string]any{
		"vendor": v.Id, "date": f1099Day, "payment_method": "check", "paid_from": b.bank.Id, "replaces": original.Id,
	})
	mkExpenseLine(t, app, draft, 0, accountLine(b.nec, 7500))
	corrected := mustPostExpense(t, app, draft.Id, b.users.bookkeeper.Id)
	requireEntryCopies(t, app, "the reversal of an edited card expense",
		findReversal(t, app, original.GetString("entry")).Id, true, docTypeExpense, false)
	requireEntryCopies(t, app, "the edit (by check) that replaces a card expense", corrected.GetString("entry"), false, docTypeExpense, false)

	transfer := mustPost(t, app, transferDraft(t, app, f1099Day, b.bank, b.savings1010, 2500).Id, b.users.bookkeeper.Id)
	requireEntryCopies(t, app, "a transfer", transfer.Id, false, docTypeTransfer, false)

	bill := apBill(t, b.apBook, v, f1099Day, f1099Day, 9000)
	credit := apVendorCredit(t, b.apBook, v, f1099Day, 4000)
	apApply(t, b.apBook, credit, bill, f1099Day, 4000)
	if n := countOf(t, app, cashLinesCollection, dbx.HashExp{"bill": bill.Id}); n == 0 {
		t.Fatal("the vendor credit application wrote no cash rows of the bill, want its rows")
	}

	requireCopiesMatch(t, app, "after every write path")
}

// A bank-categorized entry is posted by the categorization's hook.
func TestLineEntryCopy_BankCategorizedEntry(t *testing.T) {
	c := newCatEnv(t)
	txn := c.bankTxn(t, catDay, -8647, "for_review")
	cat := c.mustCategorize(t, txn, "categorize", []catLine{{Account: c.rent.Id, Amount: 8647}},
		map[string]any{"vendor": c.vendor.Id, "memo": "September rent"})
	requireEntryCopies(t, c.app, "a bank-categorized entry", c.entryOf(t, cat).Id, false, docTypeJournal, false)
}

// Books' own write of a draft entry's card_payment or doc_type (the only
// write the entry guard admits for them) changes its lines with it, in the
// same transaction.
func TestLineEntryCopy_AnEntryChangeMovesItsLines(t *testing.T) {
	env := newLedgerEnv(t)
	savings := mkAccount(t, env.app, "Savings", "bank", "savings")
	entry := mkDraft(t, env.app, "2026-05-10", ln{savings, 2500, 0}, ln{env.checking, 0, 2500})
	requireEntryCopies(t, env.app, "the draft as saved", entry.Id, false, docTypeJournal, false)

	booksWrite := func(fields map[string]any) error {
		return env.app.RunInTransaction(func(tx core.App) error {
			r, err := tx.FindRecordById("books_journal_entries", entry.Id)
			if err != nil {
				return err
			}
			for k, v := range fields {
				r.Set(k, v)
			}
			defer ownWrite(tx, "books_journal_entries", r.Id)()
			return tx.Save(r)
		})
	}

	if err := booksWrite(map[string]any{"card_payment": true}); err != nil {
		t.Fatalf("Books' own write of the draft entry's card_payment: %v", err)
	}
	requireEntryCopies(t, env.app, "after Books' own write of the entry's card_payment", entry.Id, true, docTypeJournal, false)

	if err := booksWrite(map[string]any{"doc_type": docTypeTransfer}); err != nil {
		t.Fatalf("Books' own write of the draft entry's doc_type: %v", err)
	}
	requireEntryCopies(t, env.app, "after Books' own write of the entry's doc_type", entry.Id, true, docTypeTransfer, false)
}

// A plain Go save of a draft entry's card_payment stays refused (the brief
// moves the lines with an entry change; it does not open the field), and the
// refused save leaves the lines' copies as they were.
func TestLineEntryCopy_APlainGoSaveOfTheCardMarkStaysRefused(t *testing.T) {
	env := newLedgerEnv(t)
	savings := mkAccount(t, env.app, "Savings", "bank", "savings")
	entry := mkDraft(t, env.app, "2026-05-10", ln{savings, 2500, 0}, ln{env.checking, 0, 2500})

	requireRefused(t, setFields(t, env.app, "books_journal_entries", entry.Id, map[string]any{"card_payment": true}),
		"Books sets these fields itself: card_payment.")
	requireEntryCopies(t, env.app, "after a refused Go save of the entry's card_payment", entry.Id, false, docTypeJournal, false)
}

// The cash-basis rebuild does not count a stored row with a stale copy as
// matching: it writes the row again with its entry's values.
func TestLineEntryCopy_TheRebuildReplacesAStaleCopy(t *testing.T) {
	b := new1099Book(t)
	v := f1099Vendor(t, b, "Stale Copy Co")
	payment := f1099Pay(t, b, f1099BillPayment, v, b.nec, 20000, "credit_card", b.bank)
	entryID := payment.GetString("entry")
	requireEntryCopies(t, b.app, "the card bill payment", entryID, true, docTypeBillPayment, true)
	rows, err := b.app.FindAllRecords(cashLinesCollection, dbx.HashExp{"entry": entryID})
	if err != nil || len(rows) == 0 {
		t.Fatalf("read the payment's cash rows: %d rows, %v", len(rows), err)
	}
	billID := rows[0].GetString("bill")
	if _, err := b.app.DB().NewQuery("UPDATE " + cashLinesCollection + " SET card_payment = {:stale}, doc_type = {:doc} WHERE id = {:id}").
		Bind(dbx.Params{"stale": false, "doc": docTypeJournal, "id": rows[0].Id}).Execute(); err != nil {
		t.Fatalf("make a cash row's copy stale: %v", err)
	}
	if err := b.app.RunInTransaction(func(tx core.App) error {
		return rebuildCashBasisFor(tx, billCashDeferral, billID)
	}); err != nil {
		t.Fatalf("rebuild the bill's cash rows: %v", err)
	}
	requireEntryCopies(t, b.app, "the card bill payment after the rebuild", entryID, true, docTypeBillPayment, true)
}

// A person cannot write the copies: a create or an update of a line that
// names card_payment or doc_type is refused, also as a Books admin. A create
// without them gets them from the entry.
func TestLineEntryCopy_APersonCannotWriteTheCopies(t *testing.T) {
	newBook := func(t *testing.T) (*ledgerEnv, *core.Record, *core.Record) {
		t.Helper()
		env := newLedgerEnv(t)
		entry := env.sale(t, "2026-05-10", 100)
		return env, entry, mustLines(t, env.app, entry.Id)[0]
	}
	lineBody := func(entry, account *core.Record, extra string) string {
		return fmt.Sprintf(`{"entry":%q,"account":%q,"debit":5,"position":9%s}`, entry.Id, account.Id, extra)
	}

	t.Run("a create without the copies gets the entry's", func(t *testing.T) {
		env, entry, _ := newBook(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_journal_lines/records",
			token: tokenFor(t, env.users.admin), body: lineBody(entry, env.rent, ""), want: http.StatusOK,
			after: func(t testing.TB, app *tests.TestApp) {
				requireEntryCopies(t, app, "a line a person created", entry.Id, false, docTypeJournal, false)
			},
		}.run(t, env.app)
	})
	for _, extra := range []string{`,"card_payment":true`, `,"card_payment":false`, `,"doc_type":"expense"`, `,"doc_type":"journal"`} {
		t.Run("a create with "+extra[1:], func(t *testing.T) {
			env, entry, _ := newBook(t)
			lecRequireFields(t, env.app)
			apiReq{
				method: http.MethodPost, url: "/api/collections/books_journal_lines/records",
				token: tokenFor(t, env.users.admin), body: lineBody(entry, env.rent, extra), want: http.StatusBadRequest,
				after: func(t testing.TB, app *tests.TestApp) {
					if n := len(mustLines(t, app, entry.Id)); n != 2 {
						t.Errorf("%d lines after the refused create, want 2", n)
					}
				},
			}.run(t, env.app)
		})
	}
	for _, body := range []string{`{"card_payment":true}`, `{"doc_type":"expense"}`} {
		t.Run("an update with "+body, func(t *testing.T) {
			env, entry, line := newBook(t)
			lecRequireFields(t, env.app)
			apiReq{
				method: http.MethodPatch, url: "/api/collections/books_journal_lines/records/" + line.Id,
				token: tokenFor(t, env.users.admin), body: body, want: http.StatusNotFound,
				after: func(t testing.TB, app *tests.TestApp) {
					requireEntryCopies(t, app, "the line after the refused update", entry.Id, false, docTypeJournal, false)
				},
			}.run(t, env.app)
		})
	}
	// A superuser's request skips the rules; the line guard holds the copies.
	t.Run("a superuser's update of a copy", func(t *testing.T) {
		env, entry, line := newBook(t)
		lecRequireFields(t, env.app)
		apiReq{
			method: http.MethodPatch, url: "/api/collections/books_journal_lines/records/" + line.Id,
			token: tokenFor(t, mkSuperuser(t, env.app)), body: `{"card_payment":true}`, want: http.StatusBadRequest,
			after: func(t testing.TB, app *tests.TestApp) {
				requireEntryCopies(t, app, "the line after the superuser's refused update", entry.Id, false, docTypeJournal, false)
			},
		}.run(t, env.app)
	})
}

// A Go write of a line holds the copies too. The create hook stamps the
// entry's values over what the caller set (corrected, as stampCurrency fills
// a line's currency); an update that sets a copy other than the entry's is
// refused, on a draft line and on a posted line.
func TestLineEntryCopy_AGoWriteCannotSetAWrongCopy(t *testing.T) {
	t.Run("a Go create with a wrong copy is corrected", func(t *testing.T) {
		env := newLedgerEnv(t)
		entry := env.sale(t, "2026-05-10", 100)
		lecRequireFields(t, env.app)
		saveRecord(t, env.app, "books_journal_lines", map[string]any{
			"entry": entry.Id, "account": env.rent.Id, "debit": 5, "position": 9, "currency": "USD",
			"card_payment": true, "doc_type": docTypeExpense,
		})
		requireEntryCopies(t, env.app, "the draft after a Go create with a wrong copy", entry.Id, false, docTypeJournal, false)
	})
	for name, fields := range map[string]map[string]any{
		"card_payment": {"card_payment": true},
		"doc_type":     {"doc_type": docTypeExpense},
	} {
		t.Run("a Go update of a draft line's "+name+" is refused", func(t *testing.T) {
			env := newLedgerEnv(t)
			entry := env.sale(t, "2026-05-10", 100)
			lecRequireFields(t, env.app)
			line := mustLines(t, env.app, entry.Id)[0]
			if err := setFields(t, env.app, "books_journal_lines", line.Id, fields); err == nil {
				t.Errorf("a Go update that sets the draft line's %s to %v was saved, want a refusal", name, fields[name])
			}
			requireEntryCopies(t, env.app, "the draft after the refused update", entry.Id, false, docTypeJournal, false)
		})
		t.Run("a Go save of a posted line's "+name+" is refused", func(t *testing.T) {
			env := newLedgerEnv(t)
			entry := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
			lecRequireFields(t, env.app)
			line := mustLines(t, env.app, entry.Id)[0]
			if err := setFields(t, env.app, "books_journal_lines", line.Id, fields); err == nil {
				t.Errorf("a Go save that sets the posted line's %s to %v was saved, want a refusal", name, fields[name])
			}
			requireEntryCopies(t, env.app, "the posted entry after the refused save", entry.Id, false, docTypeJournal, false)
		})
	}
}
