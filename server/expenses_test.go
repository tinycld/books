package books

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The expense's guards (spec §3.5, §3.6, §4): the expense is the fifth kind of
// the shared document layer, with an optional vendor, no address, the bill's
// two line tables, and Paid from (a bank or credit card account) as the side
// posting credits.

// The refusal texts of the expense guards, written out here, not read from the
// consts, so a change of wording fails this file too.
const (
	wantExpenseTotalNegative     = "An expense total cannot be below zero."
	wantExpenseTotalTooLarge     = "The expense total is more than Books can store."
	wantExpenseTooManyLines      = "An expense holds at most 250 lines."
	wantExpenseNotPaymentAccount = "Choose a bank or credit card account."
	wantExpenseLineUnknownKind   = "Line %d: an expense line is an account line or a product line."
	wantExpenseLineStays         = "A line stays on its expense."
	wantExpenseLineNotDraft      = "Only the lines of a draft expense can change."
	wantExpenseDeleteNotDraft    = "Only a draft expense can be deleted."
	wantExpensePostedFromForm    = "A draft expense is posted from the expense form."
)

func wantExpensePaidFromInactive(account string) string {
	return account + " is inactive. Choose an active account."
}

func wantExpenseCheckNo(ref, account, other string) string {
	return fmt.Sprintf("Check no. %s from %s is already on %s.", ref, account, other)
}

const expenseDay = "2026-11-04"

// expenseEnv is a bill env (the e2e chart's expense accounts, vendors and
// purchased products) with the e2e chart's Paid from choices and their
// neighbours: 1000 Business Checking and 1010 Business Savings (bank), 1100
// Accounts receivable (not a payment account) and 2100 Company Card (credit
// card).
type expenseEnv struct {
	*billEnv
	checking1000, savings1010, receivable1100, card2100 *core.Record
}

// newExpenseEnv binds the expense guards and the generated books:expense
// forms host before it builds the book.
func newExpenseEnv(t *testing.T) *expenseEnv {
	t.Helper()
	env := newLedgerEnv(t)
	registerSalesDocGuards(env.app, expenseKind)
	bindHostsByKey(t, env.app, expenseKind.HostKey)
	return expenseEnvOn(t, env)
}

func expenseEnvOn(t *testing.T, env *ledgerEnv) *expenseEnv {
	t.Helper()
	app := env.app
	return &expenseEnv{
		billEnv:        billEnvOn(t, env),
		checking1000:   mkNumberedAccount(t, app, "Business Checking", "1000", "bank", "checking"),
		savings1010:    mkNumberedAccount(t, app, "Business Savings", "1010", "bank", "savings"),
		receivable1100: mkNumberedAccount(t, app, "Accounts receivable", "1100", "accounts_receivable", "accounts_receivable"),
		card2100:       mkNumberedAccount(t, app, "Company Card", "2100", "credit_card", "credit_card"),
	}
}

// newExpense saves a draft expense through the app, so every guard runs, with
// the fields given over a valid default (no vendor, Check from 1000 Business
// Checking), and returns what the guards said.
func (ee *expenseEnv) newExpense(fields map[string]any) (*core.Record, error) {
	all := map[string]any{
		"status": "draft", "date": expenseDay, "paid_from": ee.checking1000.Id, "payment_method": "check",
	}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(ee.app, "books_expenses", all)
}

func (ee *expenseEnv) mkExpense(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	r, err := ee.newExpense(fields)
	if err != nil {
		t.Fatalf("save a draft expense: %v", err)
	}
	return r
}

// newExpenseLine saves one line of expense at position through the app, so
// every guard and the restatement run, and returns what they said.
func newExpenseLine(app core.App, expense *core.Record, position int, fields map[string]any) (*core.Record, error) {
	all := map[string]any{"expense": expense.Id, "position": position}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(app, "books_expense_lines", all)
}

func mkExpenseLine(t testing.TB, app core.App, expense *core.Record, position int, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newExpenseLine(app, expense, position, fields)
	if err != nil {
		t.Fatalf("save expense line %d: %v", position+1, err)
	}
	return r
}

// requireExpenseTotal checks the stored subtotal and total: an expense has no
// tax, so they are one figure.
func requireExpenseTotal(t testing.TB, app core.App, id string, total int) {
	t.Helper()
	r := reload(t, app, "books_expenses", id)
	if got := [2]int{r.GetInt("subtotal"), r.GetInt("total")}; got != [2]int{total, total} {
		t.Errorf("subtotal/total = %v, want %v", got, [2]int{total, total})
	}
}

func requireExpenseLineCount(t testing.TB, app core.App, expense *core.Record, want int64) {
	t.Helper()
	n, err := app.CountRecords("books_expense_lines", dbx.HashExp{"expense": expense.Id})
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d lines on the expense, want %d", n, want)
	}
}

func requireExpenseCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, err := app.CountRecords("books_expenses"); err != nil || n != want {
		t.Errorf("%d expenses stored (err %v), want %d", n, err, want)
	}
}

// setExpenseStatus writes status straight to the table, past every hook, so
// the line and delete guards can be held to a posted expense without posting
// it.
func setExpenseStatus(t testing.TB, app core.App, id, status string) {
	t.Helper()
	if _, err := app.DB().NewQuery("UPDATE books_expenses SET status = {:s} WHERE id = {:id}").
		Bind(dbx.Params{"s": status, "id": id}).Execute(); err != nil {
		t.Fatalf("set expense %s %s: %v", id, status, err)
	}
}

// postExpenseAs posts a draft expense as actor, as the client's PATCH
// {"status":"posted"} does once the request hook has stamped the poster.
func postExpenseAs(app core.App, expenseID, actor string) error {
	r, err := app.FindRecordById("books_expenses", expenseID)
	if err != nil {
		return err
	}
	r.Set("status", statusPosted)
	r.Set("posted_by", actor)
	return app.Save(r)
}

func mustPostExpense(t testing.TB, app core.App, expenseID, actor string) *core.Record {
	t.Helper()
	if err := postExpenseAs(app, expenseID, actor); err != nil {
		t.Fatalf("post expense %s: %v", expenseID, err)
	}
	return reload(t, app, "books_expenses", expenseID)
}

// voidExpenseAs voids a posted expense as actor.
func voidExpenseAs(app core.App, expenseID, actor string) error {
	r, err := app.FindRecordById("books_expenses", expenseID)
	if err != nil {
		return err
	}
	r.Set("status", statusVoid)
	r.Set("voided_by", actor)
	return app.Save(r)
}

func TestExpense_DraftWithNoVendorSaves(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, map[string]any{"memo": "Paid at the counter"})
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.software, 12500))

	got := reload(t, ee.app, "books_expenses", exp.Id)
	if got.GetString("status") != statusDraft || got.GetString("vendor") != "" || got.GetString("number") != "" ||
		got.GetString("paid_from") != ee.checking1000.Id || got.GetString("payment_method") != "check" {
		t.Errorf("expense status %q vendor %q number %q paid_from %q method %q, want a Check draft from 1000 with no vendor and no number",
			got.GetString("status"), got.GetString("vendor"), got.GetString("number"),
			got.GetString("paid_from"), got.GetString("payment_method"))
	}
	if got.GetInt("total") != 12500 {
		t.Errorf("total = %d, want 12500", got.GetInt("total"))
	}
	requireExpenseTotal(t, ee.app, exp.Id, 12500)
}

func TestExpense_DraftWithAVendorSaves(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, map[string]any{"vendor": ee.summit.Id})
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.software, 12500))
	if got := reload(t, ee.app, "books_expenses", exp.Id).GetString("vendor"); got != ee.summit.Id {
		t.Errorf("vendor = %q, want Summit IT Services", got)
	}
	requireExpenseTotal(t, ee.app, exp.Id, 12500)
}

// The vendor check is a Post check: a draft may name an inactive vendor, and
// its post is refused under Vendor.
func TestExpense_InactiveVendorSavesAsDraftAndPostIsRefused(t *testing.T) {
	ee := newExpenseEnv(t)
	exp, err := ee.newExpense(map[string]any{"vendor": ee.pacificPower.Id})
	if err != nil {
		t.Fatalf("a draft naming the inactive Pacific Power was refused: %v", err)
	}
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.software, 12500))

	err = postExpenseAs(ee.app, exp.Id, ee.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "vendor", wantVendorInactive("Pacific Power"))
	if got := reload(t, ee.app, "books_expenses", exp.Id).GetString("status"); got != statusDraft {
		t.Errorf("status = %q after the refused post, want draft", got)
	}
}

func TestExpense_PaidFromMustBeABankOrCreditCardAccount(t *testing.T) {
	ee := newExpenseEnv(t)

	_, err := ee.newExpense(map[string]any{"paid_from": ee.receivable1100.Id})
	requireFieldRefusal(t, err, "paid_from", wantExpenseNotPaymentAccount)
	requireExpenseCount(t, ee.app, 0)

	exp := ee.mkExpense(t, nil)
	err = setFields(t, ee.app, "books_expenses", exp.Id, map[string]any{"paid_from": ee.receivable1100.Id})
	requireFieldRefusal(t, err, "paid_from", wantExpenseNotPaymentAccount)
	if got := reload(t, ee.app, "books_expenses", exp.Id).GetString("paid_from"); got != ee.checking1000.Id {
		t.Errorf("paid_from = %s after the refusal, want 1000 Business Checking", got)
	}

	card := ee.mkExpense(t, map[string]any{"paid_from": ee.card2100.Id, "payment_method": "credit_card"})
	if got := reload(t, ee.app, "books_expenses", card.Id).GetString("paid_from"); got != ee.card2100.Id {
		t.Errorf("paid_from = %s, want 2100 Company Card", got)
	}
	savings := ee.mkExpense(t, map[string]any{"paid_from": ee.savings1010.Id})
	if got := reload(t, ee.app, "books_expenses", savings.Id).GetString("paid_from"); got != ee.savings1010.Id {
		t.Errorf("paid_from = %s, want 1010 Business Savings", got)
	}
}

func TestExpense_IsPaymentAccount(t *testing.T) {
	ee := newExpenseEnv(t)
	for _, c := range []struct {
		account *core.Record
		want    bool
	}{
		{ee.checking1000, true},
		{ee.savings1010, true},
		{ee.card2100, true},
		{ee.receivable1100, false},
		{ee.software, false},
		{ee.equipment, false},
	} {
		if got := isPaymentAccount(c.account); got != c.want {
			t.Errorf("isPaymentAccount(%s %s) = %v, want %v",
				c.account.GetString("number"), c.account.GetString("type"), got, c.want)
		}
	}
}

func TestExpense_SchemaRefusals(t *testing.T) {
	ee := newExpenseEnv(t)

	_, err := ee.newExpense(map[string]any{"paid_from": ""})
	requireSchemaRefusal(t, err, "paid_from")

	_, err = ee.newExpense(map[string]any{"payment_method": "barter"})
	requireSchemaRefusal(t, err, "payment_method")

	_, err = ee.newExpense(map[string]any{"reference_no": strings.Repeat("7", 41)})
	requireSchemaRefusal(t, err, "reference_no")
	requireExpenseCount(t, ee.app, 0)

	exp := ee.mkExpense(t, map[string]any{"reference_no": strings.Repeat("7", 40)})
	if got := len(reload(t, ee.app, "books_expenses", exp.Id).GetString("reference_no")); got != 40 {
		t.Errorf("reference_no has %d characters, want 40", got)
	}
}

func TestExpenseLine_AccountMustBeAnExpense(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, nil)

	_, err := newExpenseLine(ee.app, exp, 0, accountLine(ee.equipment, 12500))
	requireRefusalText(t, err, fmt.Sprintf(wantBillNotExpense, 1, "Office Equipment"))
	requireExpenseLineCount(t, ee.app, exp, 0)
}

func TestExpenseLine_AccountAmountIsNotZero(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, nil)

	_, err := newExpenseLine(ee.app, exp, 0, accountLine(ee.software, 0))
	requireRefusalText(t, err, fmt.Sprintf(wantBillAmountNotZero, 1))
	requireExpenseLineCount(t, ee.app, exp, 0)
}

func TestExpenseLine_NegativeAccountLineSavesWhileTheTotalStaysAtOrAboveZero(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, map[string]any{"vendor": ee.officeSupply.Id})
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.designTools, 6418))
	credit := mkExpenseLine(t, ee.app, exp, 1, accountLine(ee.designTools, -1000))

	if got := reload(t, ee.app, "books_expense_lines", credit.Id).GetInt("amount"); got != -1000 {
		t.Errorf("line 2 amount = %d, want -1000", got)
	}
	requireExpenseTotal(t, ee.app, exp.Id, 5418)
}

func TestExpense_RefusesNegativeTotal(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, nil)
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.designTools, 1000))

	_, err := newExpenseLine(ee.app, exp, 1, accountLine(ee.designTools, -1001))
	requireRefusalText(t, err, wantExpenseTotalNegative)
	requireExpenseLineCount(t, ee.app, exp, 1)
	requireExpenseTotal(t, ee.app, exp.Id, 1000)
}

func TestExpense_RefusesTooLargeTotal(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, nil)
	for i := 0; i < 9; i++ {
		mkExpenseLine(t, ee.app, exp, i, accountLine(ee.software, maxAmount))
	}
	requireExpenseTotal(t, ee.app, exp.Id, 9_000_000_000_000_000)

	_, err := newExpenseLine(ee.app, exp, 9, accountLine(ee.software, maxAmount))
	requireRefusalText(t, err, wantExpenseTotalTooLarge)
	requireExpenseLineCount(t, ee.app, exp, 9)
}

// The bound counts the lines of both tables together.
func TestExpenseLine_RefusesTheLine251st(t *testing.T) {
	env := newLedgerEnv(t)
	ee := expenseEnvOn(t, env)
	// 249 lines written before the expense guards are bound, so the test does
	// not wait on 249 restatements; the guard counts what is stored.
	exp := saveRecord(t, env.app, "books_expenses", map[string]any{
		"status": "draft", "date": expenseDay, "paid_from": ee.checking1000.Id, "payment_method": "check", "currency": "USD",
	})
	for i := 0; i < 249; i++ {
		fields := map[string]any{"expense": exp.Id, "position": i, "kind": "account", "account": ee.software.Id, "amount": 100}
		if i%2 == 1 {
			fields = map[string]any{"expense": exp.Id, "position": i, "kind": "item", "product": ee.accessPoint.Id, "quantity": 1, "rate": 100}
		}
		saveRecord(t, env.app, "books_expense_lines", fields)
	}
	registerSalesDocGuards(env.app, expenseKind)
	bindHostsByKey(t, env.app, expenseKind.HostKey)

	mkExpenseLine(t, env.app, exp, 249, accountLine(ee.software, 100))
	_, err := newExpenseLine(env.app, exp, 250, productLine(ee.accessPoint, 1, 100))
	requireRefusalText(t, err, wantExpenseTooManyLines)
	requireExpenseLineCount(t, env.app, exp, 250)
}

func TestExpenseLine_RefusesAKindThatIsNotAnExpenseLine(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, nil)
	_, err := newExpenseLine(ee.app, exp, 0, map[string]any{"kind": "percent", "product": ee.accessPoint.Id, "percent_ppm": -100000})
	requireRefusalText(t, err, fmt.Sprintf(wantExpenseLineUnknownKind, 1))
	requireExpenseLineCount(t, ee.app, exp, 0)
}

func TestExpenseLine_ProductAmountIsBooks(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, nil)

	_, err := newExpenseLine(ee.app, exp, 0, billLineWith(productLine(ee.patchCable, 15, 310), map[string]any{"amount": 500}))
	requireRefusalText(t, err, wantLineAmountByBooks)
	requireExpenseLineCount(t, ee.app, exp, 0)

	line := mkExpenseLine(t, ee.app, exp, 0, productLine(ee.patchCable, 15, 310))
	if got := reload(t, ee.app, "books_expense_lines", line.Id).GetInt("amount"); got != 4650 {
		t.Errorf("product line amount = %d, want 15 x 310 = 4650", got)
	}
}

// A check number clashes with another non-void Check expense from the same
// Paid from account; the number is compared after trimming.
func TestExpense_RefusesADuplicateCheckNumber(t *testing.T) {
	ee := newExpenseEnv(t)
	first := ee.mkExpense(t, map[string]any{"reference_no": "1042"})
	mkExpenseLine(t, ee.app, first, 0, accountLine(ee.software, 12500))

	if err := setFields(t, ee.app, "books_expenses", first.Id, map[string]any{"memo": "October power"}); err != nil {
		t.Fatalf("an edit of the expense that holds the check number was refused: %v", err)
	}

	_, err := ee.newExpense(map[string]any{"reference_no": " 1042 "})
	requireFieldRefusal(t, err, "reference_no", wantExpenseCheckNo("1042", "1000 Business Checking", "a draft expense"))
	requireExpenseCount(t, ee.app, 1)

	second := ee.mkExpense(t, map[string]any{"reference_no": "1043"})
	err = setFields(t, ee.app, "books_expenses", second.Id, map[string]any{"reference_no": "1042"})
	requireFieldRefusal(t, err, "reference_no", wantExpenseCheckNo("1042", "1000 Business Checking", "a draft expense"))

	posted := mustPostExpense(t, ee.app, first.Id, ee.users.bookkeeper.Id)
	_, err = ee.newExpense(map[string]any{"reference_no": "1042"})
	requireFieldRefusal(t, err, "reference_no",
		wantExpenseCheckNo("1042", "1000 Business Checking", "Expense "+posted.GetString("number")))
}

func TestExpense_CheckNumberDoesNotClash(t *testing.T) {
	// Each case has its own book: an expense one case saves would clash in the next.
	firstCheck := func(t *testing.T) (*expenseEnv, *core.Record) {
		t.Helper()
		ee := newExpenseEnv(t)
		first := ee.mkExpense(t, map[string]any{"reference_no": "1042"})
		mkExpenseLine(t, ee.app, first, 0, accountLine(ee.software, 12500))
		return ee, first
	}

	t.Run("when the method is Credit card", func(t *testing.T) {
		ee, _ := firstCheck(t)
		ee.mkExpense(t, map[string]any{"reference_no": "1042", "payment_method": "credit_card"})
	})

	t.Run("when Paid from is another account", func(t *testing.T) {
		ee, _ := firstCheck(t)
		ee.mkExpense(t, map[string]any{"reference_no": "1042", "paid_from": ee.savings1010.Id})
	})

	t.Run("when the first is void", func(t *testing.T) {
		ee, first := firstCheck(t)
		mustPostExpense(t, ee.app, first.Id, ee.users.bookkeeper.Id)
		if err := voidExpenseAs(ee.app, first.Id, ee.users.bookkeeper.Id); err != nil {
			t.Fatalf("void the first expense: %v", err)
		}
		ee.mkExpense(t, map[string]any{"reference_no": "1042"})
	})

	t.Run("when Ref no. is empty", func(t *testing.T) {
		ee, _ := firstCheck(t)
		ee.mkExpense(t, map[string]any{"reference_no": ""})
		ee.mkExpense(t, map[string]any{"reference_no": ""})
	})

	t.Run("for a correction of the first", func(t *testing.T) {
		ee, first := firstCheck(t)
		mustPostExpense(t, ee.app, first.Id, ee.users.bookkeeper.Id)
		ee.mkExpense(t, map[string]any{"reference_no": "1042", "replaces": first.Id})
	})
}

func TestExpenseLine_StaysOnItsExpense(t *testing.T) {
	ee := newExpenseEnv(t)
	first := ee.mkExpense(t, nil)
	second := ee.mkExpense(t, nil)
	line := mkExpenseLine(t, ee.app, first, 0, accountLine(ee.designTools, 6418))
	if got := reload(t, ee.app, "books_expense_lines", line.Id).GetString("expense"); got != first.Id {
		t.Fatalf("line expense = %q, want the first expense", got)
	}

	err := setFields(t, ee.app, "books_expense_lines", line.Id, map[string]any{"expense": second.Id})
	requireRefusalText(t, err, wantExpenseLineStays)
	if got := reload(t, ee.app, "books_expense_lines", line.Id).GetString("expense"); got != first.Id {
		t.Errorf("line expense = %q after the refusal, want the first expense", got)
	}
	requireExpenseLineCount(t, ee.app, second, 0)
}

func TestExpenseLine_RefusedOnPostedExpense(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, nil)
	line := mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.designTools, 6418))
	setExpenseStatus(t, ee.app, exp.Id, statusPosted)

	err := setFields(t, ee.app, "books_expense_lines", line.Id, map[string]any{"amount": 7000})
	requireRefusalText(t, err, wantExpenseLineNotDraft)
	requireExpenseLineCount(t, ee.app, exp, 1)
	requireExpenseTotal(t, ee.app, exp.Id, 6418)
}

func TestExpense_DeleteOnlyDraft(t *testing.T) {
	ee := newExpenseEnv(t)
	exp := ee.mkExpense(t, nil)
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.designTools, 6418))
	setExpenseStatus(t, ee.app, exp.Id, statusPosted)

	err := ee.app.Delete(reload(t, ee.app, "books_expenses", exp.Id))
	requireRefusalText(t, err, wantExpenseDeleteNotDraft)
	if _, err := ee.app.FindRecordById("books_expenses", exp.Id); err != nil {
		t.Fatalf("the posted expense is gone: %v", err)
	}
	requireExpenseLineCount(t, ee.app, exp, 1)
}

// A posted or void expense comes only from posting a draft; a create that asks
// for either is refused with the expense's text.
func TestExpense_CreateAsPostedIsRefused(t *testing.T) {
	ee := newExpenseEnv(t)
	for _, status := range []string{"posted", "void"} {
		_, err := ee.newExpense(map[string]any{"status": status})
		requireRefusalText(t, err, wantExpensePostedFromForm)
	}
	requireExpenseCount(t, ee.app, 0)
}

// An expense's entry is named "Expense 1004" ("This expense", "Draft
// expense"), and its doc type is one only posting the document writes.
func TestExpense_EntryNounsAndDocType(t *testing.T) {
	if noun, this, draft := entryNouns("expense"); [3]string{noun, this, draft} != [3]string{"Expense", "This expense", "Draft expense"} {
		t.Errorf("entryNouns(expense) = %q, %q, %q; want Expense, This expense, Draft expense", noun, this, draft)
	}
	if docTypeExpense != "expense" || !documentDocTypes[docTypeExpense] {
		t.Errorf("docTypeExpense %q in documentDocTypes %v, want expense and true", docTypeExpense, documentDocTypes[docTypeExpense])
	}
	if expensesCollection != "books_expenses" || expenseLinesCollection != "books_expense_lines" {
		t.Errorf("collections %q, %q; want books_expenses, books_expense_lines", expensesCollection, expenseLinesCollection)
	}
	if expenseDraftName != "a draft expense" {
		t.Errorf("expenseDraftName = %q, want %q", expenseDraftName, "a draft expense")
	}
	if expenseKind.Collection != expensesCollection || expenseKind.LinesCollection != expenseLinesCollection ||
		expenseKind.ParentField != "expense" || expenseKind.HostKey != "books:expense" ||
		expenseKind.CustomerRequired || expenseKind.HasTax || expenseKind.AddressField != "" {
		t.Errorf("expenseKind = %+v, want books_expenses / books_expense_lines on parent expense, host books:expense, an optional vendor, no tax, no address", expenseKind)
	}
}
