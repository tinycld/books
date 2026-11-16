package books

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// One check number per Paid from (pay-bills spec §4.2): checkCheckNo looks at
// the non-void expenses and bill payments by Check from the same account, so
// one check never pays twice whichever screen wrote it.

// billPaymentWithCheck posts a bill payment of Summit IT Services by Check
// ref from paidFrom on a new bill of 30000.
func (bp *billPayEnv) billPaymentWithCheck(t testing.TB, ref string, fields map[string]any) *core.Record {
	t.Helper()
	bill := bp.postedBill(t, bp.summit, 30000)
	all := map[string]any{"reference_no": ref, "payment_method": "check"}
	for k, v := range fields {
		all[k] = v
	}
	return bp.pay(t, bp.summit, all, payLine{bill, 10000})
}

func TestCheckNo_ExpenseClashesWithABillPayment(t *testing.T) {
	bp := newBillPayEnv(t)
	p := bp.billPaymentWithCheck(t, "1042", nil)

	_, err := bp.newExpense(map[string]any{"reference_no": "1042"})
	requireFieldRefusal(t, err, "reference_no",
		wantExpenseCheckNo("1042", "1000 Business Checking", "Bill payment "+p.GetString("number")))
	requireExpenseCount(t, bp.app, 0)
}

func TestCheckNo_BillPaymentClashesWithAnExpense(t *testing.T) {
	bp := newBillPayEnv(t)
	expense := bp.mkExpense(t, map[string]any{"reference_no": "1042"})
	mkExpenseLine(t, bp.app, expense, 0, accountLine(bp.software, 12500))
	posted := mustPostExpense(t, bp.app, expense.Id, bp.users.bookkeeper.Id)
	bill := bp.postedBill(t, bp.summit, 30000)

	f := bp.batch(t, bp.users.bookkeeper, payOps(t, bp.payBody(bp.summit, map[string]any{"reference_no": "1042"}),
		payLine{bill, 10000})...).failure(t)
	f.requireField(t, "reference_no",
		wantExpenseCheckNo("1042", "1000 Business Checking", "Expense "+posted.GetString("number")))
	requireBillPaymentCount(t, bp.app, 0)
	requireBillBalance(t, bp.app, bill, 30000)
}

func TestCheckNo_BillPaymentClashesWithABillPayment(t *testing.T) {
	bp := newBillPayEnv(t)
	first := bp.billPaymentWithCheck(t, "1042", nil)
	bill := bp.postedBill(t, bp.summit, 30000)

	f := bp.batch(t, bp.users.bookkeeper, payOps(t, bp.payBody(bp.summit, map[string]any{"reference_no": "1042"}),
		payLine{bill, 10000})...).failure(t)
	f.requireField(t, "reference_no",
		wantExpenseCheckNo("1042", "1000 Business Checking", "Bill payment "+first.GetString("number")))
	requireBillPaymentCount(t, bp.app, 1)
}

// checkCheckNo itself, on a bill payment row that is not saved yet.
func TestCheckCheckNo_ReadsBothCollections(t *testing.T) {
	bp := newBillPayEnv(t)
	p := bp.billPaymentWithCheck(t, "1042", nil)

	col, err := bp.app.FindCollectionByNameOrId(billPaymentsCol)
	if err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(col)
	r.Set("vendor", bp.summit.Id)
	r.Set("paid_from", bp.checking1000.Id)
	r.Set("payment_method", "check")
	r.Set("reference_no", "1042")
	requireFieldRefusal(t, checkCheckNo(bp.app, billPaymentsCol, r), "reference_no",
		wantExpenseCheckNo("1042", "1000 Business Checking", "Bill payment "+p.GetString("number")))

	r.Set("reference_no", "1043")
	if err := checkCheckNo(bp.app, billPaymentsCol, r); err != nil {
		t.Errorf("checkCheckNo of an unused number = %v, want nil", err)
	}
	expenses, err := bp.app.FindCollectionByNameOrId("books_expenses")
	if err != nil {
		t.Fatal(err)
	}
	e := core.NewRecord(expenses)
	e.Set("paid_from", bp.checking1000.Id)
	e.Set("payment_method", "check")
	e.Set("reference_no", "1042")
	requireFieldRefusal(t, checkCheckNo(bp.app, "books_expenses", e), "reference_no",
		wantExpenseCheckNo("1042", "1000 Business Checking", "Bill payment "+p.GetString("number")))
}

func TestCheckNo_BillPaymentDoesNotClash(t *testing.T) {
	t.Run("when the bill payment is void", func(t *testing.T) {
		bp := newBillPayEnv(t)
		p := bp.billPaymentWithCheck(t, "1042", nil)
		if err := voidBillPaymentAs(bp.app, p.Id, bp.users.bookkeeper.Id); err != nil {
			t.Fatalf("void the bill payment: %v", err)
		}
		// A second bill payment takes the number of the void one, and is voided in
		// turn, so the expense below meets only void bill payments with 1042.
		again := bp.billPaymentWithCheck(t, "1042", nil)
		if err := voidBillPaymentAs(bp.app, again.Id, bp.users.bookkeeper.Id); err != nil {
			t.Fatalf("void the second bill payment: %v", err)
		}
		if _, err := bp.newExpense(map[string]any{"reference_no": "1042"}); err != nil {
			t.Errorf("an expense with the check number of a void bill payment was refused: %v", err)
		}
	})

	t.Run("when the expense is void", func(t *testing.T) {
		bp := newBillPayEnv(t)
		expense := bp.mkExpense(t, map[string]any{"reference_no": "1042"})
		mkExpenseLine(t, bp.app, expense, 0, accountLine(bp.software, 12500))
		mustPostExpense(t, bp.app, expense.Id, bp.users.bookkeeper.Id)
		if err := voidExpenseAs(bp.app, expense.Id, bp.users.bookkeeper.Id); err != nil {
			t.Fatalf("void the expense: %v", err)
		}
		bp.billPaymentWithCheck(t, "1042", nil)
	})

	t.Run("when Paid from is another account", func(t *testing.T) {
		bp := newBillPayEnv(t)
		bp.billPaymentWithCheck(t, "1042", nil)
		expense, err := bp.newExpense(map[string]any{"reference_no": "1042", "paid_from": bp.savings1010.Id})
		if err != nil {
			t.Fatalf("an expense with the number from 1010 was refused: %v", err)
		}
		// The draft expense from 1010 is non-void and would hold 1042 there; remove
		// it so the bill payment below meets only the one from 1000.
		if err := bp.app.Delete(expense); err != nil {
			t.Fatalf("delete the draft expense: %v", err)
		}
		bp.billPaymentWithCheck(t, "1042", map[string]any{"paid_from": bp.savings1010.Id})
	})

	t.Run("when the method is not Check", func(t *testing.T) {
		bp := newBillPayEnv(t)
		bp.billPaymentWithCheck(t, "1042", nil)
		if _, err := bp.newExpense(map[string]any{"reference_no": "1042", "payment_method": "credit_card"}); err != nil {
			t.Errorf("a credit card expense with the number was refused: %v", err)
		}
		bp.billPaymentWithCheck(t, "1042", map[string]any{"payment_method": "bank_transfer"})
	})

	t.Run("when the bill payment corrects the one that holds it", func(t *testing.T) {
		bp := newBillPayEnv(t)
		original := bp.billPaymentWithCheck(t, "1042", nil)
		bill := bp.postedBill(t, bp.summit, 30000)
		correction := bp.pay(t, bp.summit, map[string]any{"replaces": original.Id, "reference_no": "1042"},
			payLine{bill, 20000})
		if correction.GetString("status") != statusPosted || correction.GetString("reference_no") != "1042" {
			t.Errorf("correction status %q reference_no %q, want posted with 1042",
				correction.GetString("status"), correction.GetString("reference_no"))
		}
	})
}
