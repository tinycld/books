package books

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/changesignal"
	"tinycld.org/core/reports"
)

// The two receivable item views (A/R Aging spec §4 Data): one row per posted
// Accounts receivable line (books_receivable_lines) and one per application of
// a posted payment (books_receivable_applications), each given to its open
// item. Rows are read as a superuser by the view's name, as the report engine
// reads them, unless a test says it reads them as a reader.

// receivableSources are the six collections both views read (spec §4).
var receivableSources = []string{
	"books_accounts", "books_invoices", "books_journal_entries", "books_journal_lines",
	"books_payment_applications", "books_payments",
}

// arBook is a migrated app with the ledger hooks, the invoice and credit memo
// guards, the payment guards and both forms hosts bound, Books' report
// sources registered, the e2e chart's 1100 Accounts receivable and 4000
// Consulting Income, a Books read-only reader and a user with Books level
// none. docs posts invoices, payments and credit memos through their guards.
type arBook struct {
	app                *tests.TestApp
	reader, none       *core.Record
	receivable, income *core.Record
	docs               *paymentEnv
}

func newARBook(t *testing.T) arBook {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, invoiceKind)
	registerSalesDocGuards(app, creditMemoKind)
	registerPaymentGuards(app)
	// Core keeps one set of bound hosts per app, so both are bound in one call.
	bindHostsByKey(t, app, invoiceKind.HostKey, creditMemoHostKey)
	pe := paymentEnvOn(t, app)
	registerBooksSources(t)
	return arBook{
		app: app, reader: pe.users.readOnly, none: pe.users.none,
		receivable: pe.receivable, income: pe.revenue, docs: pe,
	}
}

// arInvoice posts an invoice of customer dated date, due dueDate, with one
// non-taxable line of cents.
func arInvoice(t *testing.T, b arBook, customer *core.Record, date, dueDate string, cents int) *core.Record {
	t.Helper()
	inv, err := newInvoice(b.app, customer, map[string]any{"date": date, "due_date": dueDate})
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	mkInvoiceLine(t, b.app, inv, 0, item(b.docs.service, 1, int64(cents), false))
	return mustPostInvoice(t, b.app, inv.Id, b.docs.users.bookkeeper.Id)
}

// arPayment posts a payment of customer dated date of cents; applied maps an
// invoice id to the cents applied to it.
func arPayment(t *testing.T, b arBook, customer *core.Record, date string, cents int, applied map[string]int) *core.Record {
	t.Helper()
	p := b.docs.mkPayment(t, map[string]any{"customer": customer.Id, "date": date, "amount": cents})
	arApply(t, b, p, applied)
	return mustPostPayment(t, b.app, p.Id, b.docs.users.bookkeeper.Id)
}

// arApply saves one application of payment per invoice of applied, in invoice
// id order.
func arApply(t *testing.T, b arBook, payment *core.Record, applied map[string]int) {
	t.Helper()
	invoices := make([]string, 0, len(applied))
	for id := range applied {
		invoices = append(invoices, id)
	}
	sort.Strings(invoices)
	for i, id := range invoices {
		if _, err := saveNew(b.app, "books_payment_applications", map[string]any{
			"payment": payment.Id, "invoice": id, "amount": applied[id], "position": i,
		}); err != nil {
			t.Fatalf("save application %d: %v", i+1, err)
		}
	}
}

// arCreditMemo posts a credit memo of customer dated date with one
// non-taxable line of cents.
func arCreditMemo(t *testing.T, b arBook, customer *core.Record, date string, cents int) *core.Record {
	t.Helper()
	memo, err := saveNew(b.app, "books_credit_memos", map[string]any{
		"customer": customer.Id, "status": "draft", "date": date,
	})
	if err != nil {
		t.Fatalf("save a draft credit memo: %v", err)
	}
	if _, err := newCreditMemoLine(b.app, memo, 0, item(b.docs.service, 1, int64(cents), false)); err != nil {
		t.Fatalf("save the credit memo line: %v", err)
	}
	return mustPostCreditMemo(t, b.app, memo.Id, b.docs.users.bookkeeper.Id)
}

// arJournalPrefix gives manual entries the "JE-" numbers the seeded book and
// the e2e book print.
func arJournalPrefix(t *testing.T, b arBook) {
	t.Helper()
	seq := reload(t, b.app, "books_doc_sequences", "booksseqjournal")
	seq.Set("prefix", "JE-")
	if err := b.app.Save(seq); err != nil {
		t.Fatalf("set the journal prefix: %v", err)
	}
}

// arRow is one row of either view.
type arRow struct {
	id, customer, entry, date, currency string
	debit, credit                       int
	item, kind, number, due             string
}

func (r arRow) net() int { return r.debit - r.credit }

func arRows(t *testing.T, app core.App, view string) []arRow {
	t.Helper()
	records, err := app.FindAllRecords(view)
	if err != nil {
		t.Fatalf("read %s: %v", view, err)
	}
	out := make([]arRow, len(records))
	for i, r := range records {
		out[i] = arRow{
			id: r.Id, customer: r.GetString("customer"), entry: r.GetString("entry"),
			date: r.GetString("date"), currency: r.GetString("currency"),
			debit: r.GetInt("debit"), credit: r.GetInt("credit"),
			item: r.GetString("item"), kind: r.GetString("item_kind"),
			number: r.GetString("item_number"), due: r.GetString("due_date"),
		}
	}
	return out
}

func rowsWhere(rows []arRow, keep func(arRow) bool) []arRow {
	var out []arRow
	for _, r := range rows {
		if keep(r) {
			out = append(out, r)
		}
	}
	return out
}

func ofItem(rows []arRow, item string) []arRow {
	return rowsWhere(rows, func(r arRow) bool { return r.item == item })
}

func ofEntry(rows []arRow, entry string) []arRow {
	return rowsWhere(rows, func(r arRow) bool { return r.entry == entry })
}

func netOf(rows []arRow) int {
	sum := 0
	for _, r := range rows {
		sum += r.net()
	}
	return sum
}

// allRows are the rows of both views.
func allRows(t *testing.T, app core.App) []arRow {
	t.Helper()
	return append(arRows(t, app, receivableLinesView), arRows(t, app, receivableApplicationsView)...)
}

// oneRow fails unless rows holds exactly one row.
func oneRow(t *testing.T, what string, rows []arRow) arRow {
	t.Helper()
	if len(rows) != 1 {
		t.Fatalf("%s: %d rows, want 1: %+v", what, len(rows), rows)
	}
	return rows[0]
}

// requireOneItem fails unless rows share one item, kind, number and due day
// and add up to want.
func requireOneItem(t *testing.T, what string, rows []arRow, item string, want int) {
	t.Helper()
	if len(rows) == 0 {
		t.Fatalf("%s: no rows", what)
	}
	for _, r := range rows {
		if r.item != item || r.kind != rows[0].kind || r.number != rows[0].number || r.due != rows[0].due {
			t.Errorf("%s: row %+v, want item %s with the kind, number and due day of %+v", what, r, item, rows[0])
		}
	}
	if got := netOf(rows); got != want {
		t.Errorf("%s: rows add up to %d, want %d: %+v", what, got, want, rows)
	}
}

func arLineOf(t *testing.T, b arBook, entryID string) *core.Record {
	t.Helper()
	line, err := b.app.FindFirstRecordByFilter("books_journal_lines", "entry = {:e} && account = {:a}",
		dbx.Params{"e": entryID, "a": b.receivable.Id})
	if err != nil {
		t.Fatalf("no Accounts receivable line of entry %s: %v", entryID, err)
	}
	return line
}

func TestReceivableViewsShape(t *testing.T) {
	b := newARBook(t)
	for _, name := range []string{receivableLinesView, receivableApplicationsView} {
		t.Run(name, func(t *testing.T) {
			col, err := b.app.FindCollectionByNameOrId(name)
			if err != nil {
				t.Fatalf("find %s: %v", name, err)
			}
			if col.Type != core.CollectionTypeView {
				t.Errorf("%s type = %q, want view", name, col.Type)
			}
			for rule, got := range map[string]*string{"list": col.ListRule, "view": col.ViewRule} {
				if got == nil || *got != booksReadRule {
					t.Errorf("%s %s rule = %v, want the Books READ rule", name, rule, got)
				}
			}
			for rule, got := range map[string]*string{"create": col.CreateRule, "update": col.UpdateRule, "delete": col.DeleteRule} {
				if got != nil {
					t.Errorf("%s %s rule = %q, want nil (nothing writes a view)", name, rule, *got)
				}
			}
			want := map[string]string{
				"customer": core.FieldTypeRelation, "entry": core.FieldTypeRelation,
				"debit": core.FieldTypeNumber, "credit": core.FieldTypeNumber,
				"date": core.FieldTypeText, "currency": core.FieldTypeText, "item": core.FieldTypeText,
				"item_kind": core.FieldTypeText, "item_number": core.FieldTypeText, "due_date": core.FieldTypeText,
			}
			for field, typ := range want {
				f := col.Fields.GetByName(field)
				if f == nil {
					t.Errorf("%s has no %s field", name, field)
					continue
				}
				if f.Type() != typ {
					t.Errorf("%s.%s type = %q, want %q", name, field, f.Type(), typ)
				}
			}
		})
	}

	changesignal.ResetForTesting()
	app, _ := newRegisteredApp(t)
	if err := changesignal.CheckViews(app); err != nil {
		t.Fatalf("CheckViews on an app wired by Register: %v", err)
	}
	for _, name := range []string{receivableLinesView, receivableApplicationsView} {
		got := slices.Clone(changesignal.RegisteredViews()[name])
		slices.Sort(got)
		if !slices.Equal(got, receivableSources) {
			t.Errorf("Register registered %s over %v, want exactly %v", name, got, receivableSources)
		}
	}
}

func TestReceivableLinesInvoice(t *testing.T) {
	b := newARBook(t)
	c := b.docs.customer
	inv := arInvoice(t, b, c, "2026-08-04", "2026-09-03", 100000)
	draft, err := newInvoice(b.app, c, map[string]any{"date": "2026-08-05", "due_date": "2026-09-04"})
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	mkInvoiceLine(t, b.app, draft, 0, item(b.docs.service, 1, 20000, false))

	entryID := inv.GetString("entry")
	line := arLineOf(t, b, entryID)
	rows := arRows(t, b.app, receivableLinesView)
	got := oneRow(t, "the invoice's rows", ofEntry(rows, entryID))
	want := arRow{
		id: line.Id, customer: c.Id, entry: entryID, date: "2026-08-04", currency: "USD",
		debit: 100000, credit: 0,
		item: inv.Id, kind: "invoice", number: inv.GetString("number"), due: "2026-09-03",
	}
	if got != want {
		t.Errorf("the invoice's row =\n%+v\nwant\n%+v", got, want)
	}
	if n := len(ofItem(rows, draft.Id)); n != 0 {
		t.Errorf("a draft invoice gives %d rows, want 0", n)
	}
	income := entryLineOn(t, b.app, entryID, b.income)
	if n := len(rowsWhere(rows, func(r arRow) bool { return r.id == income.Id })); n != 0 {
		t.Errorf("the invoice's income line gives %d rows, want 0", n)
	}
}

func TestReceivableLinesPayment(t *testing.T) {
	b := newARBook(t)
	c := b.docs.customer
	inv := arInvoice(t, b, c, "2026-08-04", "2026-09-03", 100000)
	p := arPayment(t, b, c, "2026-09-10", 70000, map[string]int{inv.Id: 55000})

	lines := arRows(t, b.app, receivableLinesView)
	apps := arRows(t, b.app, receivableApplicationsView)
	own := oneRow(t, "the payment's lines rows", ofEntry(lines, p.GetString("entry")))
	if want := (arRow{
		id: arLineOf(t, b, p.GetString("entry")).Id, customer: c.Id, entry: p.GetString("entry"),
		date: "2026-09-10", currency: "USD", debit: 0, credit: 15000,
		item: p.Id, kind: "payment", number: p.GetString("number"), due: "2026-09-10",
	}); own != want {
		t.Errorf("the payment's lines row =\n%+v\nwant\n%+v (credit is its credited)", own, want)
	}
	application, err := b.app.FindFirstRecordByFilter("books_payment_applications", "payment = {:p}", dbx.Params{"p": p.Id})
	if err != nil {
		t.Fatalf("find the application: %v", err)
	}
	invoiceRow := oneRow(t, "the invoice's lines rows", ofEntry(lines, inv.GetString("entry")))
	applied := oneRow(t, "the applications rows", apps)
	if want := (arRow{
		id: application.Id, customer: c.Id, entry: p.GetString("entry"), date: "2026-09-10",
		currency: p.GetString("currency"), debit: 0, credit: 55000,
		item: inv.Id, kind: "invoice", number: invoiceRow.number, due: "2026-09-03",
	}); applied != want {
		t.Errorf("the application's row =\n%+v\nwant\n%+v", applied, want)
	}

	t.Run("applied in full", func(t *testing.T) {
		b := newARBook(t)
		inv := arInvoice(t, b, b.docs.customer, "2026-08-04", "2026-09-03", 40000)
		p := arPayment(t, b, b.docs.customer, "2026-09-10", 40000, map[string]int{inv.Id: 40000})
		own := oneRow(t, "the payment's lines rows", ofEntry(arRows(t, b.app, receivableLinesView), p.GetString("entry")))
		if own.credit != 0 || own.debit != 0 {
			t.Errorf("a payment applied in full: debit %d credit %d, want 0 and 0", own.debit, own.credit)
		}
	})

	t.Run("applied to no invoice", func(t *testing.T) {
		b := newARBook(t)
		p := arPayment(t, b, b.docs.customer, "2026-09-10", 25000, nil)
		own := oneRow(t, "the payment's lines rows", ofEntry(arRows(t, b.app, receivableLinesView), p.GetString("entry")))
		if own.credit != 25000 || own.item != p.Id {
			t.Errorf("a payment applied to no invoice: credit %d item %q, want 25000 and the payment", own.credit, own.item)
		}
		if n := len(arRows(t, b.app, receivableApplicationsView)); n != 0 {
			t.Errorf("a payment applied to no invoice gives %d applications rows, want 0", n)
		}
	})

	t.Run("a draft", func(t *testing.T) {
		b := newARBook(t)
		inv := arInvoice(t, b, b.docs.customer, "2026-08-04", "2026-09-03", 40000)
		draft := b.docs.mkPayment(t, map[string]any{"date": "2026-09-10", "amount": 30000})
		arApply(t, b, draft, map[string]int{inv.Id: 30000})
		lines := arRows(t, b.app, receivableLinesView)
		if n := len(ofItem(lines, draft.Id)); n != 0 {
			t.Errorf("a draft payment gives %d lines rows, want 0", n)
		}
		if n := len(arRows(t, b.app, receivableApplicationsView)); n != 0 {
			t.Errorf("a draft payment gives %d applications rows, want 0", n)
		}
	})
}

func TestReceivableLinesCreditMemo(t *testing.T) {
	b := newARBook(t)
	memo := arCreditMemo(t, b, b.docs.customer, "2026-10-20", 63500)
	got := oneRow(t, "the credit memo's rows", ofEntry(arRows(t, b.app, receivableLinesView), memo.GetString("entry")))
	if got.credit != 63500 || got.debit != 0 || got.item != memo.Id || got.kind != "credit_memo" ||
		got.number != memo.GetString("number") || got.due != "2026-10-20" {
		t.Errorf("the credit memo's row = %+v, want credit 63500, item the memo, kind credit_memo, number %q, due 2026-10-20",
			got, memo.GetString("number"))
	}
}

func TestReceivableLinesJournal(t *testing.T) {
	b := newARBook(t)
	arJournalPrefix(t, b)
	c := b.docs.customer

	one := postJournal(t, b.app, "", "2026-09-01", "A/R adjustment",
		jnLine{account: b.receivable, debit: 31000, position: 0, customer: c.Id},
		jnLine{account: b.income, credit: 31000, position: 1})
	none := postJournal(t, b.app, "", "2026-09-02", "A/R with no customer",
		jnLine{account: b.receivable, debit: 12000, position: 0},
		jnLine{account: b.income, credit: 12000, position: 1})
	two := postJournal(t, b.app, "", "2026-09-03", "Two A/R lines",
		jnLine{account: b.receivable, debit: 5000, position: 0, customer: c.Id},
		jnLine{account: b.receivable, debit: 7000, position: 1, customer: c.Id},
		jnLine{account: b.income, credit: 12000, position: 2})

	rows := arRows(t, b.app, receivableLinesView)
	got := oneRow(t, "the manual entry's rows", ofEntry(rows, one.Id))
	line := arLineOf(t, b, one.Id)
	if got.item != line.Id || got.kind != "entry" || got.number != one.GetString("number") ||
		!strings.HasPrefix(got.number, "JE-") || got.due != "2026-09-01" || got.customer != c.Id || got.debit != 31000 {
		t.Errorf("the manual entry's row = %+v, want item the line %s, kind entry, number %q (JE-), due 2026-09-01, the customer, debit 31000",
			got, line.Id, one.GetString("number"))
	}
	blank := oneRow(t, "the no-customer entry's rows", ofEntry(rows, none.Id))
	if blank.customer != "" || blank.debit != 12000 {
		t.Errorf("the no-customer row = %+v, want a blank customer and debit 12000", blank)
	}
	pair := ofEntry(rows, two.Id)
	if len(pair) != 2 || pair[0].item == pair[1].item {
		t.Fatalf("two Accounts receivable lines of one entry = %+v, want two rows with two items", pair)
	}
	for _, r := range pair {
		if r.item != r.id {
			t.Errorf("row %s item = %q, want the line's own id", r.id, r.item)
		}
	}

	for _, e := range []*core.Record{one, two} {
		if err := setStatus(b.app, e.Id, statusVoid, b.docs.users.admin.Id); err != nil {
			t.Fatalf("void entry %s: %v", e.GetString("number"), err)
		}
	}
	rows = arRows(t, b.app, receivableLinesView)
	revOne := findReversal(t, b.app, one.Id)
	requireOneItem(t, "the voided entry and its reversal",
		append(ofEntry(rows, one.Id), ofEntry(rows, revOne.Id)...), line.Id, 0)
	revTwo := findReversal(t, b.app, two.Id)
	both := append(ofEntry(rows, two.Id), ofEntry(rows, revTwo.Id)...)
	if len(both) != 4 {
		t.Fatalf("the voided two-line entry and its reversal give %d rows, want 4: %+v", len(both), both)
	}
	for _, original := range pair {
		requireOneItem(t, "line "+original.id+" and its reversal line", ofItem(both, original.id), original.id, 0)
		if n := len(ofItem(both, original.id)); n != 2 {
			t.Errorf("line %s: %d rows carry its item after the void, want 2 (it and its reversal)", original.id, n)
		}
	}
}

func TestReceivableLinesVoids(t *testing.T) {
	t.Run("a voided invoice", func(t *testing.T) {
		b := newARBook(t)
		inv := arInvoice(t, b, b.docs.customer, "2026-08-04", "2026-09-03", 40000)
		if err := voidInvoiceAs(b.app, inv.Id, b.docs.users.admin.Id); err != nil {
			t.Fatalf("void the invoice: %v", err)
		}
		rev := findReversal(t, b.app, inv.GetString("entry"))
		rows := arRows(t, b.app, receivableLinesView)
		both := append(ofEntry(rows, inv.GetString("entry")), ofEntry(rows, rev.Id)...)
		if len(both) != 2 {
			t.Fatalf("the invoice and its reversal give %d rows, want 2: %+v", len(both), both)
		}
		requireOneItem(t, "the invoice and its reversal", both, inv.Id, 0)
		if both[0].due != "2026-09-03" {
			t.Errorf("due day = %q, want the invoice's 2026-09-03 (the reversal ages with what it reverses)", both[0].due)
		}
	})

	t.Run("a voided payment", func(t *testing.T) {
		b := newARBook(t)
		inv := arInvoice(t, b, b.docs.customer, "2026-08-04", "2026-09-03", 40000)
		p := arPayment(t, b, b.docs.customer, "2026-09-10", 30000, map[string]int{inv.Id: 30000})
		if err := voidPaymentAs(b.app, p.Id, b.docs.users.admin.Id); err != nil {
			t.Fatalf("void the payment: %v", err)
		}
		if n := len(ofEntry(arRows(t, b.app, receivableApplicationsView), p.GetString("entry"))); n != 0 {
			t.Errorf("a voided payment gives %d applications rows, want 0", n)
		}
		rev := findReversal(t, b.app, p.GetString("entry"))
		rows := arRows(t, b.app, receivableLinesView)
		own := oneRow(t, "the voided payment's own row", ofEntry(rows, p.GetString("entry")))
		if own.credit != 30000 {
			t.Errorf("the voided payment's own row credits %d, want the whole amount 30000", own.credit)
		}
		requireOneItem(t, "the payment and its reversal", append([]arRow{own}, ofEntry(rows, rev.Id)...), p.Id, 0)
		requireOneItem(t, "the invoice after the void", ofItem(allRows(t, b.app), inv.Id), inv.Id, 40000)
	})

	t.Run("a corrected payment", func(t *testing.T) {
		b := newARBook(t)
		actor := b.docs.users.bookkeeper.Id
		first := arInvoice(t, b, b.docs.customer, "2026-08-04", "2026-09-03", 30000)
		second := arInvoice(t, b, b.docs.customer, "2026-08-05", "2026-09-04", 40000)
		original := arPayment(t, b, b.docs.customer, "2026-09-10", 70000,
			map[string]int{first.Id: 30000, second.Id: 25000})
		draft := b.docs.mkPayment(t, map[string]any{"replaces": original.Id, "date": "2026-09-10", "amount": 70000})
		arApply(t, b, draft, map[string]int{first.Id: 30000, second.Id: 30000})
		corrected := mustPostPayment(t, b.app, draft.Id, actor)
		if corrected.GetInt("credited") != 10000 {
			t.Fatalf("the correction credits %d, want 10000", corrected.GetInt("credited"))
		}

		rows := allRows(t, b.app)
		requireOneItem(t, "the replaced payment", ofItem(rows, original.Id), original.Id, 0)
		requireOneItem(t, "the correction", ofItem(rows, draft.Id), draft.Id, -10000)
		requireOneItem(t, "invoice 1", ofItem(rows, first.Id), first.Id, 0)
		requireOneItem(t, "invoice 2", ofItem(rows, second.Id), second.Id, 10000)
	})

	t.Run("a corrected invoice with an applied payment", func(t *testing.T) {
		b := newARBook(t)
		inv := arInvoice(t, b, b.docs.customer, "2026-11-04", "2026-12-04", 50000)
		arPayment(t, b, b.docs.customer, "2026-11-10", 30000, map[string]int{inv.Id: 30000})
		draft := b.docs.correctionOf(t, inv, b.docs.customer, 45000)
		mustPostInvoice(t, b.app, draft.Id, b.docs.users.bookkeeper.Id)

		rows := allRows(t, b.app)
		requireOneItem(t, "the replaced invoice", ofItem(rows, inv.Id), inv.Id, 0)
		requireOneItem(t, "the correction", ofItem(rows, draft.Id), draft.Id, 15000)
	})
}

func TestReceivableItemsTieToPartyBalances(t *testing.T) {
	b := newARBook(t)
	arJournalPrefix(t, b)
	actor := b.docs.users.bookkeeper.Id
	harbor := b.docs.customer
	northwind := mkCustomer(t, b.app, "Northwind Traders", "")
	portland := mkCustomer(t, b.app, "Northwind Portland store", northwind.Id)

	// Harborview: a part payment with a credit, a credit memo, a paid invoice,
	// a voided invoice and a voided two-line manual entry.
	partPaid := arInvoice(t, b, harbor, "2026-08-04", "2026-09-03", 100000)
	arPayment(t, b, harbor, "2026-09-10", 70000, map[string]int{partPaid.Id: 55000})
	arCreditMemo(t, b, harbor, "2026-10-20", 63500)
	paid := arInvoice(t, b, harbor, "2026-08-10", "2026-09-09", 20000)
	arPayment(t, b, harbor, "2026-09-12", 20000, map[string]int{paid.Id: 20000})
	voided := arInvoice(t, b, harbor, "2026-08-12", "2026-09-11", 30000)
	if err := voidInvoiceAs(b.app, voided.Id, b.docs.users.admin.Id); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	twoLines := postJournal(t, b.app, "", "2026-09-03", "Two A/R lines",
		jnLine{account: b.receivable, debit: 5000, position: 0, customer: harbor.Id},
		jnLine{account: b.receivable, debit: 7000, position: 1, customer: harbor.Id},
		jnLine{account: b.income, credit: 12000, position: 2})
	if err := setStatus(b.app, twoLines.Id, statusVoid, b.docs.users.admin.Id); err != nil {
		t.Fatalf("void the entry: %v", err)
	}

	// Northwind Traders: a voided payment and a manual entry.
	open := arInvoice(t, b, northwind, "2026-08-04", "2026-09-03", 40000)
	voidedPayment := arPayment(t, b, northwind, "2026-09-10", 40000, map[string]int{open.Id: 25000})
	if err := voidPaymentAs(b.app, voidedPayment.Id, b.docs.users.admin.Id); err != nil {
		t.Fatalf("void the payment: %v", err)
	}
	postJournal(t, b.app, "", "2026-09-01", "A/R adjustment",
		jnLine{account: b.receivable, debit: 31000, position: 0, customer: northwind.Id},
		jnLine{account: b.income, credit: 31000, position: 1})

	// The Portland store (a sub-customer): a corrected payment and a corrected
	// invoice that has an applied payment.
	e := arInvoice(t, b, portland, "2026-08-04", "2026-09-03", 30000)
	f := arInvoice(t, b, portland, "2026-08-05", "2026-09-04", 40000)
	original := arPayment(t, b, portland, "2026-09-10", 70000, map[string]int{e.Id: 30000, f.Id: 25000})
	correction := b.docs.mkPayment(t, map[string]any{
		"customer": portland.Id, "replaces": original.Id, "date": "2026-09-10", "amount": 70000,
	})
	arApply(t, b, correction, map[string]int{e.Id: 30000, f.Id: 30000})
	mustPostPayment(t, b.app, correction.Id, actor)
	g := arInvoice(t, b, portland, "2026-11-04", "2026-12-04", 50000)
	arPayment(t, b, portland, "2026-11-10", 20000, map[string]int{g.Id: 20000})
	mustPostInvoice(t, b.app, b.docs.correctionOf(t, g, portland, 60000).Id, actor)

	// A line with no customer.
	postJournal(t, b.app, "", "2026-09-02", "A/R with no customer",
		jnLine{account: b.receivable, debit: 12000, position: 0},
		jnLine{account: b.income, credit: 12000, position: 1})

	rows := allRows(t, b.app)
	balances := partyBalances(t, b.app)
	for _, c := range []*core.Record{harbor, northwind, portland} {
		got := netOf(rowsWhere(rows, func(r arRow) bool { return r.customer == c.Id }))
		if want, ok := balances[c.Id]; !ok || got != want {
			t.Errorf("%s: the views add up to %d, want its books_party_balances balance %d (found %v)",
				c.GetString("display_name"), got, want, ok)
		}
	}

	lines, err := b.app.FindAllRecords("books_journal_lines", dbx.HashExp{"account": b.receivable.Id, "posted": true})
	if err != nil {
		t.Fatalf("read the Accounts receivable lines: %v", err)
	}
	ledger := 0
	for _, l := range lines {
		ledger += l.GetInt("debit") - l.GetInt("credit")
	}
	if got := netOf(rows); got != ledger {
		t.Errorf("every row of both views adds up to %d, want the net of every posted Accounts receivable line %d", got, ledger)
	}
}

func TestReceivableViewsAccess(t *testing.T) {
	b := newARBook(t)
	inv := arInvoice(t, b, b.docs.customer, "2026-08-04", "2026-09-03", 100000)
	arPayment(t, b, b.docs.customer, "2026-09-10", 70000, map[string]int{inv.Id: 55000})

	lines := "/api/collections/" + receivableLinesView + "/records"
	apps := "/api/collections/" + receivableApplicationsView + "/records"
	reader, none := tokenFor(t, b.reader), tokenFor(t, b.none)
	apiSeq(t, b.app,
		apiReq{method: http.MethodGet, url: lines, token: reader, want: http.StatusOK, content: []string{`"totalItems":2`}},
		apiReq{method: http.MethodGet, url: apps, token: reader, want: http.StatusOK, content: []string{`"totalItems":1`}},
		apiReq{method: http.MethodGet, url: lines, token: none, want: http.StatusOK, content: []string{`"totalItems":0`}},
		apiReq{method: http.MethodGet, url: apps, token: none, want: http.StatusOK, content: []string{`"totalItems":0`}},
	)
}

// arEngineSpec is the two engine pins of spec §4 Engine reach: a union over two
// view collections, grouped on a text column, with a group label that reads
// min of two text fields.
func arEngineSpec() *reports.Spec {
	kindLabel := op("case",
		op("eq", op("min", fld("item_kind")), lit("invoice")), lit("Invoice"),
		op("eq", op("min", fld("item_kind")), lit("payment")), lit("Payment"),
		op("eq", op("min", fld("item_kind")), lit("credit_memo")), lit("Credit memo"),
		lit("Journal entry"),
	)
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.receivable_items",
		Columns: []reports.Column{
			{ID: "net", Label: "Net", Formula: op("sum", op("sub", fld("debit"), fld("credit")))},
			{ID: "due", Label: "Due date", Formula: op("min", fld("due_date"))},
			{ID: "itemKey", Label: "Item", Hidden: true, Path: reports.Path{{Field: "item"}}},
		},
		Groups: []reports.Group{
			{ID: "byItem", Col: "itemKey", Label: op("concat", kindLabel, lit(" "), op("min", fld("item_number")))},
		},
	}
}

func TestReceivableItemsEngine(t *testing.T) {
	b := newARBook(t)
	arJournalPrefix(t, b)
	if err := reports.CheckSources(b.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	if reason, refused := reports.Refused(b.app)["books.receivable_items"]; refused {
		t.Fatalf("books.receivable_items refused: %s", reason)
	}
	accepted := slices.ContainsFunc(reports.Sources(b.app), func(s reports.Source) bool { return s.Key == "books.receivable_items" })
	if !accepted {
		t.Fatal("source books.receivable_items is not registered and accepted")
	}

	c := b.docs.customer
	inv := arInvoice(t, b, c, "2026-08-04", "2026-09-03", 100000)
	p := arPayment(t, b, c, "2026-09-10", 70000, map[string]int{inv.Id: 55000})
	memo := arCreditMemo(t, b, c, "2026-10-20", 63500)
	je := postJournal(t, b.app, "", "2026-09-01", "A/R adjustment",
		jnLine{account: b.receivable, debit: 31000, position: 0, customer: c.Id},
		jnLine{account: b.income, credit: 31000, position: 1})

	spec, info, err := reports.Load(mustJSON(arEngineSpec()))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if err := reports.Validate(b.app, spec); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	run := func(user *core.Record) *reports.Result {
		t.Helper()
		res, err := reports.Run(context.Background(), b.app, reports.Request{Spec: spec, Loaded: info, Auth: user})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		return res
	}

	res := run(b.reader)
	type item struct {
		net int64
		due string
	}
	got := map[string]item{}
	groups := 0
	for _, r := range res.Rows {
		if r.Kind != reports.KindGroup {
			continue
		}
		groups++
		net, _ := moneyCell(t, r, "net")
		got[r.Label] = item{net: net, due: fmt.Sprint(r.Cells["due"])}
	}
	want := map[string]item{
		"Invoice " + inv.GetString("number"):      {net: 45000, due: "2026-09-03"},
		"Payment " + p.GetString("number"):        {net: -15000, due: "2026-09-10"},
		"Credit memo " + memo.GetString("number"): {net: -63500, due: "2026-10-20"},
		"Journal entry " + je.GetString("number"): {net: 31000, due: "2026-09-01"},
	}
	// Counted from the rows, not the map: the part-paid invoice's lines row and its
	// applications row share an item, so they must be ONE group row, and two rows with
	// one label would collapse into one map entry.
	if groups != 4 {
		t.Errorf("group rows = %d, want 4 (one per item; the part-paid invoice is one row)", groups)
	}
	if len(got) != len(want) {
		t.Errorf("group rows = %+v, want one per item: %+v", got, want)
	}
	for label, w := range want {
		if g, ok := got[label]; !ok || g != w {
			t.Errorf("group row %q = %+v (found %v), want %+v", label, g, ok, w)
		}
	}
	if !strings.HasPrefix(je.GetString("number"), "JE-") {
		t.Errorf("the entry number %q is not the JE- form", je.GetString("number"))
	}
	// Core lists a view's base tables, never the view's own topic
	// (core/server/changesignal/topics.go): SQLite reads the base tables.
	for _, topic := range []string{
		"collection/books_journal_lines",
		"collection/books_journal_entries",
		"collection/books_accounts",
		"collection/books_invoices",
		"collection/books_payments",
		"collection/books_payment_applications",
	} {
		if !slices.Contains(res.Topics, topic) {
			t.Errorf("topics = %v, want %s", res.Topics, topic)
		}
	}

	for _, r := range run(b.none).Rows {
		if r.Kind == reports.KindGroup {
			t.Errorf("a user with Books level none sees group row %q", r.Label)
		}
	}
}
