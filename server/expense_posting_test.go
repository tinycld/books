package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/reports"
)

// Posting an expense (spec §3.7): draft → posted writes a numbered journal
// entry with doc type expense: one debit per account (each account line's
// account, each product line's product expense account), summed per account
// in chart order, and one credit to Paid from for the total; every line names
// the vendor, or none. These tests post and void through a Go save of the
// expense's status, the path the client's PATCH reaches after the request hook
// stamps the actor.

const wantExpenseZeroTotal = "An expense total must be more than zero to post."

// officeSupplyExpense saves the posting case of the brief: Office Supply World,
// Credit card from 2100 Company Card; account lines 6210 6418 and 6210 -1000;
// product line Cat6 patch cable, 10 ft 15 x 310 whose product's expense
// account is moved to 6200 first. Total 10068.
func (ee *expenseEnv) officeSupplyExpense(t testing.TB) *core.Record {
	t.Helper()
	if err := setFields(t, ee.app, "books_products", ee.patchCable.Id, map[string]any{"expense_account": ee.software.Id}); err != nil {
		t.Fatalf("move the patch cable's expense account to 6200: %v", err)
	}
	exp := ee.mkExpense(t, map[string]any{
		"vendor": ee.officeSupply.Id, "paid_from": ee.card2100.Id, "payment_method": "credit_card",
		"memo": "Design desk supplies and cables",
	})
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.designTools, 6418))
	mkExpenseLine(t, ee.app, exp, 1, accountLine(ee.designTools, -1000))
	mkExpenseLine(t, ee.app, exp, 2, productLine(ee.patchCable, 15, 310))
	requireExpenseTotal(t, ee.app, exp.Id, 10068)
	return exp
}

func nextExpenseNumber(t testing.TB, app core.App) int {
	t.Helper()
	return reload(t, app, "books_doc_sequences", "booksseqexpense").GetInt("next_number")
}

// requireExpenseNotPosted checks that a refused post wrote nothing: the
// expense is a draft with no number, entry or stamp, no entry names it, and
// the expense sequence did not move.
func requireExpenseNotPosted(t testing.TB, app core.App, expenseID string, nextNumber int) {
	t.Helper()
	exp := reload(t, app, "books_expenses", expenseID)
	if exp.GetString("status") != statusDraft || exp.GetString("number") != "" || exp.GetString("entry") != "" ||
		exp.GetString("posted_at") != "" {
		t.Errorf("expense after a refused post: status %q number %q entry %q posted_at %q, want a draft with none",
			exp.GetString("status"), exp.GetString("number"), exp.GetString("entry"), exp.GetString("posted_at"))
	}
	if n, err := app.CountRecords("books_journal_entries", dbx.HashExp{"document": expenseID}); err != nil || n != 0 {
		t.Errorf("%d journal entries name the expense (err %v), want 0", n, err)
	}
	if got := nextExpenseNumber(t, app); got != nextNumber {
		t.Errorf("expense sequence next_number = %d after a refused post, want %d", got, nextNumber)
	}
}

// splitPaidFrom takes the one Paid from line out of lines.
func splitPaidFrom(t testing.TB, lines []entryLine, paidFrom string) (entryLine, []entryLine) {
	t.Helper()
	var found, rest []entryLine
	for _, l := range lines {
		if l.account == paidFrom {
			found = append(found, l)
			continue
		}
		rest = append(rest, l)
	}
	if len(found) != 1 {
		t.Fatalf("%d Paid from lines in %v, want 1", len(found), lines)
	}
	return found[0], rest
}

func TestExpensePost_WritesTheEntry(t *testing.T) {
	ee := newExpenseEnv(t)
	actor := ee.users.bookkeeper.Id
	if got := nextExpenseNumber(t, ee.app); got != 1001 {
		t.Fatalf("a fresh book's expense sequence next_number = %d, want 1001", got)
	}
	exp := ee.officeSupplyExpense(t)

	posted := mustPostExpense(t, ee.app, exp.Id, actor)
	if posted.GetString("status") != statusPosted || posted.GetString("number") != "1001" || posted.GetInt("sequence") != 1001 {
		t.Errorf("expense status %q number %q sequence %d, want posted, 1001, 1001",
			posted.GetString("status"), posted.GetString("number"), posted.GetInt("sequence"))
	}
	if posted.GetString("posted_by") != actor || posted.GetString("posted_at") == "" {
		t.Errorf("expense posted_by %q posted_at %q, want the poster and a time", posted.GetString("posted_by"), posted.GetString("posted_at"))
	}
	if got := nextExpenseNumber(t, ee.app); got != 1002 {
		t.Errorf("expense sequence next_number = %d after the post, want 1002", got)
	}
	entryID := posted.GetString("entry")
	if entryID == "" {
		t.Fatal("the posted expense names no entry")
	}
	entry := reload(t, ee.app, "books_journal_entries", entryID)
	if got, want := [6]string{
		entry.GetString("status"), entry.GetString("doc_type"), entry.GetString("origin"),
		entry.GetString("document"), entry.GetString("number"), entry.GetString("date"),
	}, [6]string{statusPosted, "expense", "document", exp.Id, "1001", expenseDay}; got != want {
		t.Errorf("entry status/doc_type/origin/document/number/date = %v, want %v", got, want)
	}
	if entry.GetString("memo") != "Design desk supplies and cables" {
		t.Errorf("entry memo %q, want the expense memo", entry.GetString("memo"))
	}

	// 6200 takes the patch cables (4650); 6210 the two account lines (6418 -
	// 1000 = 5418); 2100 Company Card the total. Every line names the vendor
	// and no customer.
	v := ee.officeSupply.Id
	paid, debits := splitPaidFrom(t, entryLinesOf(t, ee.app, entryID), ee.card2100.Id)
	if want := (entryLine{account: ee.card2100.Id, credit: 10068, vendor: v}); paid != want {
		t.Errorf("Paid from line = %+v, want %+v", paid, want)
	}
	want := []entryLine{
		{account: ee.software.Id, debit: 4650, vendor: v},
		{account: ee.designTools.Id, debit: 5418, vendor: v},
	}
	if fmt.Sprint(debits) != fmt.Sprint(want) {
		t.Errorf("debit lines =\n%v\nwant (chart order)\n%v", debits, want)
	}
	if entry.GetInt("total") != 10068 {
		t.Errorf("entry total %d, want 10068", entry.GetInt("total"))
	}
	requireNoDrift(t, ee.app)
}

func TestExpensePost_NoVendorLeavesEveryLinesVendorEmpty(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, nil)
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.software, 12500))
	posted := mustPostExpense(t, ee.app, exp.Id, ee.users.bookkeeper.Id)

	lines := entryLinesOf(t, ee.app, posted.GetString("entry"))
	want := []entryLine{
		{account: ee.checking1000.Id, credit: 12500},
		{account: ee.software.Id, debit: 12500},
	}
	paid, rest := splitPaidFrom(t, lines, ee.checking1000.Id)
	if fmt.Sprint(append([]entryLine{paid}, rest...)) != fmt.Sprint(want) {
		t.Errorf("entry lines =\n%v\nwant (no vendor, no customer)\n%v", lines, want)
	}
}

// An account whose lines sum below zero takes a credit line; Paid from is
// credited for the total.
func TestExpensePost_CreditsAnAccountThatNetsBelowZero(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, map[string]any{"vendor": ee.summit.Id})
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.software, 50000))
	mkExpenseLine(t, ee.app, exp, 1, accountLine(ee.designTools, -10000))
	posted := mustPostExpense(t, ee.app, exp.Id, ee.users.bookkeeper.Id)

	v := ee.summit.Id
	paid, rest := splitPaidFrom(t, entryLinesOf(t, ee.app, posted.GetString("entry")), ee.checking1000.Id)
	if want := (entryLine{account: ee.checking1000.Id, credit: 40000, vendor: v}); paid != want {
		t.Errorf("Paid from line = %+v, want %+v", paid, want)
	}
	want := []entryLine{
		{account: ee.software.Id, debit: 50000, vendor: v},
		{account: ee.designTools.Id, credit: 10000, vendor: v},
	}
	if fmt.Sprint(rest) != fmt.Sprint(want) {
		t.Errorf("account lines =\n%v\nwant\n%v", rest, want)
	}
}

// Paid from is read and checked again inside the post: an account made
// inactive, or no longer a bank or credit card account, after the draft was
// saved is refused under Paid from.
func TestExpensePost_ChecksPaidFromAgain(t *testing.T) {
	t.Run("made inactive after the save", func(t *testing.T) {
		ee := newExpenseEnv(t)
		exp := ee.mkExpense(t, nil)
		mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.software, 12500))
		makeAccountInactive(t, ee.app, ee.checking1000)

		err := postExpenseAs(ee.app, exp.Id, ee.users.bookkeeper.Id)
		requireFieldRefusal(t, err, "paid_from", wantExpensePaidFromInactive("1000 Business Checking"))
		requireExpenseNotPosted(t, ee.app, exp.Id, 1001)
	})

	t.Run("its type changed to expense after the save", func(t *testing.T) {
		ee := newExpenseEnv(t)
		exp := ee.mkExpense(t, nil)
		mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.software, 12500))
		// Straight to the table, past the account guards: the post must not trust
		// what the draft's save saw.
		if _, err := ee.app.DB().NewQuery("UPDATE books_accounts SET type = 'expense', detail_type = 'rent_lease' WHERE id = {:id}").
			Bind(dbx.Params{"id": ee.checking1000.Id}).Execute(); err != nil {
			t.Fatalf("change 1000's type to expense: %v", err)
		}

		err := postExpenseAs(ee.app, exp.Id, ee.users.bookkeeper.Id)
		requireFieldRefusal(t, err, "paid_from", wantExpenseNotPaymentAccount)
		requireExpenseNotPosted(t, ee.app, exp.Id, 1001)
	})
}

func TestExpensePost_RefusesAnInactiveAccount(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, nil)
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.pettyCash, 41286))

	err := postExpenseAs(ee.app, exp.Id, ee.users.bookkeeper.Id)
	requireRefusalText(t, err, wantAccountInactive(1, "Old Petty Cash"))
	requireExpenseNotPosted(t, ee.app, exp.Id, 1001)
}

func TestExpensePost_RefusesAnInactiveProduct(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, nil)
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.designTools, 6418))
	mkExpenseLine(t, ee.app, exp, 1, productLine(ee.accessPoint, 3, 12140))
	makeProductInactive(t, ee.app, ee.accessPoint)

	err := postExpenseAs(ee.app, exp.Id, ee.users.bookkeeper.Id)
	requireRefusalText(t, err, fmt.Sprintf(wantBillProductInactive, 1, "Wireless access point"))
	requireExpenseNotPosted(t, ee.app, exp.Id, 1001)
}

func TestExpensePost_RefusesAProductThatIsNotPurchased(t *testing.T) {
	ee := newExpenseEnv(t)
	paper, err := newProduct(ee.app, map[string]any{
		"type": "non_inventory", "name": "Printer paper, case", "income_account": ee.revenue.Id,
	})
	if err != nil {
		t.Fatalf("save Printer paper, case: %v", err)
	}
	exp := ee.mkExpense(t, nil)
	mkExpenseLine(t, ee.app, exp, 0, productLine(paper, 2, 4250))

	err = postExpenseAs(ee.app, exp.Id, ee.users.bookkeeper.Id)
	requireRefusalText(t, err, wantProductNotPurchased(1, "Printer paper, case"))
	requireExpenseNotPosted(t, ee.app, exp.Id, 1001)
}

// A product keeps an expense account that became inactive after it was saved;
// the post refuses it by the expense's product line.
func TestExpensePost_RefusesAProductsInactiveExpenseAccount(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, nil)
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.software, 12500))
	mkExpenseLine(t, ee.app, exp, 1, productLine(ee.patchCable, 2, 310))
	makeAccountInactive(t, ee.app, ee.designTools)

	err := postExpenseAs(ee.app, exp.Id, ee.users.bookkeeper.Id)
	requireRefusalText(t, err, fmt.Sprintf(msgLineExpenseAccountInactive, "Product line 1", "Cat6 patch cable, 10 ft"))
	requireExpenseNotPosted(t, ee.app, exp.Id, 1001)
}

func TestExpensePost_RefusesZeroTotal(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, nil)
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.software, 10000))
	mkExpenseLine(t, ee.app, exp, 1, accountLine(ee.designTools, -10000))
	requireExpenseTotal(t, ee.app, exp.Id, 0)

	err := postExpenseAs(ee.app, exp.Id, ee.users.bookkeeper.Id)
	requireRefusalText(t, err, wantExpenseZeroTotal)
	requireExpenseNotPosted(t, ee.app, exp.Id, 1001)
}

func TestExpensePost_HonorsCloseDate(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.officeSupplyExpense(t)
	setCloseDate(t, ee.app, expenseDay)

	err := postExpenseAs(ee.app, exp.Id, ee.users.bookkeeper.Id)
	requireRefusalText(t, err,
		"The books are closed through 2026-11-04. Ask a Books admin for a close-date override to post on 2026-11-04.")
	requireExpenseNotPosted(t, ee.app, exp.Id, 1001)
}

// Unlike the bill (which creates Accounts payable when the chart has none),
// posting an expense creates no account. The book gets its retained-earnings
// account first, because the shared ledger rule makes one on the first P&L
// post of a book with none; that account is not the expense's doing.
func TestExpensePost_CreatesNoAccount(t *testing.T) {
	ee := newExpenseEnv(t)
	mkRetainedEarnings(t, ee.app, "3900")
	exp := ee.officeSupplyExpense(t)
	before, err := ee.app.CountRecords("books_accounts")
	if err != nil {
		t.Fatal(err)
	}
	mustPostExpense(t, ee.app, exp.Id, ee.users.bookkeeper.Id)
	after, err := ee.app.CountRecords("books_accounts")
	if err != nil {
		t.Fatal(err)
	}
	if after != before {
		t.Errorf("%d accounts after the post, want the %d before it", after, before)
	}
}

// A correction posts under its original's number, voids the original with
// replaced_by, and keeps the original's vendor after it became inactive.
func TestExpenseCorrection_TakesTheNumberAndKeepsAnInactiveVendor(t *testing.T) {
	ee := newExpenseEnv(t)
	actor := ee.users.bookkeeper.Id
	original := mustPostExpense(t, ee.app, ee.officeSupplyExpense(t).Id, actor)
	originalEntry := original.GetString("entry")
	makeVendorInactive(t, ee.app, ee.officeSupply)

	draft, err := ee.newExpense(map[string]any{
		"vendor": ee.officeSupply.Id, "paid_from": ee.card2100.Id, "payment_method": "credit_card",
		"replaces": original.Id, "memo": "Corrected",
	})
	if err != nil {
		t.Fatalf("save the correction draft for the original's inactive vendor: %v", err)
	}
	mkExpenseLine(t, ee.app, draft, 0, accountLine(ee.designTools, 20000))
	if err := postExpenseAs(ee.app, draft.Id, actor); err != nil {
		t.Fatalf("post the correction of an inactive vendor's expense: %v", err)
	}
	corrected := reload(t, ee.app, "books_expenses", draft.Id)
	if corrected.GetString("status") != statusPosted || corrected.GetString("number") != "1001" || corrected.GetInt("sequence") != 1001 {
		t.Errorf("correction status %q number %q sequence %d, want posted, 1001, 1001",
			corrected.GetString("status"), corrected.GetString("number"), corrected.GetInt("sequence"))
	}
	if got := nextExpenseNumber(t, ee.app); got != 1002 {
		t.Errorf("expense sequence next_number = %d after a correction, want 1002 (no new number)", got)
	}
	after := reload(t, ee.app, "books_expenses", original.Id)
	if after.GetString("status") != statusVoid || after.GetString("replaced_by") != draft.Id || after.GetString("voided_at") == "" {
		t.Errorf("original status %q replaced_by %q voided_at %q, want void, the correction, a time",
			after.GetString("status"), after.GetString("replaced_by"), after.GetString("voided_at"))
	}
	if s := reload(t, ee.app, "books_journal_entries", originalEntry).GetString("status"); s != statusVoid {
		t.Errorf("the original's entry status %q, want void", s)
	}
	newEntry := reload(t, ee.app, "books_journal_entries", corrected.GetString("entry"))
	if newEntry.GetString("replaces") != originalEntry || newEntry.GetString("number") != "1001" || newEntry.GetString("doc_type") != "expense" {
		t.Errorf("correction entry replaces %q number %q doc_type %q, want the original's entry, 1001, expense",
			newEntry.GetString("replaces"), newEntry.GetString("number"), newEntry.GetString("doc_type"))
	}
	for i, l := range entryLinesOf(t, ee.app, newEntry.Id) {
		if l.vendor != ee.officeSupply.Id || l.customer != "" {
			t.Errorf("correction entry line %d vendor %q customer %q, want the original's vendor and no customer", i+1, l.vendor, l.customer)
		}
	}
	requireNoDrift(t, ee.app)
}

// A void writes the void reversal and keeps the number; the General Ledger
// reads Type "Expense" on the expense's entry and "Void reversal of <n>" on
// its reversal, each naming the vendor.
func TestExpenseVoid_ReversesAndKeepsNumber(t *testing.T) {
	ee := newExpenseEnv(t)
	registerBooksSources(t)
	exp := ee.officeSupplyExpense(t)
	entryID := mustPostExpense(t, ee.app, exp.Id, ee.users.bookkeeper.Id).GetString("entry")

	if err := voidExpenseAs(ee.app, exp.Id, ee.users.admin.Id); err != nil {
		t.Fatalf("void the expense: %v", err)
	}
	voided := reload(t, ee.app, "books_expenses", exp.Id)
	if voided.GetString("status") != statusVoid || voided.GetString("number") != "1001" ||
		voided.GetString("voided_by") != ee.users.admin.Id || voided.GetString("voided_at") == "" {
		t.Errorf("expense status %q number %q voided_by %q voided_at %q, want void, 1001, the voider and a time",
			voided.GetString("status"), voided.GetString("number"), voided.GetString("voided_by"), voided.GetString("voided_at"))
	}
	if s := reload(t, ee.app, "books_journal_entries", entryID).GetString("status"); s != statusVoid {
		t.Errorf("the expense's entry status %q, want void", s)
	}
	rev := findReversal(t, ee.app, entryID)
	if got, want := [4]string{rev.GetString("origin"), rev.GetString("doc_type"), rev.GetString("number"), rev.GetString("date")},
		[4]string{originVoidReversal, "expense", "1001", expenseDay}; got != want {
		t.Errorf("reversal origin/doc_type/number/date = %v, want %v", got, want)
	}
	revPaid, _ := splitPaidFrom(t, entryLinesOf(t, ee.app, rev.Id), ee.card2100.Id)
	if revPaid.debit != 10068 || revPaid.vendor != ee.officeSupply.Id {
		t.Errorf("reversal Paid from line %+v, want a 10068 debit naming the vendor", revPaid)
	}
	requireNoDrift(t, ee.app)

	res := runGL(t, ee.app, ee.users.readOnly, map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")}, reports.Options{Today: glToday})
	type cols struct{ typ, number, name string }
	read := func(row reports.Row) cols {
		return cols{typ: textCell(t, row, "type"), number: textCell(t, row, "number"), name: textCell(t, row, "name")}
	}
	for _, w := range []struct {
		what  string
		entry string
		want  cols
	}{
		{"the expense's Paid from line", entryID, cols{"Expense", "1001", "Office Supply World"}},
		{"the void reversal's Paid from line", rev.Id, cols{"Void reversal of 1001", "1001", "Office Supply World"}},
	} {
		if got := read(lineRow(t, res, entryLineOn(t, ee.app, w.entry, ee.card2100))); got != w.want {
			t.Errorf("%s = %+v, want %+v", w.what, got, w.want)
		}
	}
}

// A person's REST create of an expense entry is refused with the expense's
// text, and nothing is stored.
func TestCreate_ExpenseEntryOverRESTIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	apiReq{
		method:  http.MethodPost,
		url:     "/api/collections/books_journal_entries/records",
		token:   tokenFor(t, env.users.bookkeeper),
		body:    `{"date":"2026-11-04","doc_type":"expense","status":"draft","origin":"manual"}`,
		want:    http.StatusBadRequest,
		content: []string{"An expense entry comes only from posting its expense."},
		after: func(t testing.TB, app *tests.TestApp) {
			if n, _ := app.CountRecords("books_journal_entries", dbx.HashExp{"doc_type": "expense"}); n != 0 {
				t.Errorf("%d expense entries stored, want 0", n)
			}
		},
	}.run(t, env.app)
}

// The server never reads the Purchase lines setting: an expense with lines of
// both kinds posts while the setting says Accounts only.
func TestExpensePost_IgnoresThePurchaseLinesSetting(t *testing.T) {
	ee := newExpenseEnv(t)
	if err := setFields(t, ee.app, "books_settings", settingsID, map[string]any{"purchase_lines": "accounts"}); err != nil {
		t.Fatalf("set purchase_lines to accounts: %v", err)
	}
	exp := ee.officeSupplyExpense(t)
	posted := mustPostExpense(t, ee.app, exp.Id, ee.users.bookkeeper.Id)
	if posted.GetString("status") != statusPosted || posted.GetString("number") != "1001" {
		t.Errorf("expense status %q number %q, want posted 1001", posted.GetString("status"), posted.GetString("number"))
	}
}
