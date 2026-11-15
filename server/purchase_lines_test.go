package books

import (
	"fmt"
	"slices"
	"testing"
)

// The purchase line checks the bill and the expense share (server/purchase_lines.go,
// spec §3.1): an account line keeps only its own cells, needs each required cell
// of the account row kind (account, amount), and charges an expense type; Post
// reads the lines of the kind it is given.

const wantPurchaseAccountLineCells = "Account line 1: An account line has no product, quantity or rate."

// newPurchaseEnv binds the bill and the expense guards and both forms hosts on one
// book.
func newPurchaseEnv(t *testing.T) *expenseEnv {
	t.Helper()
	env := newLedgerEnv(t)
	registerSalesDocGuards(env.app, billKind)
	registerSalesDocGuards(env.app, expenseKind)
	bindHostsByKey(t, env.app, billKind.HostKey, expenseKind.HostKey)
	return expenseEnvOn(t, env)
}

func TestPurchaseAccountTypes_AreTheExpenseTypes(t *testing.T) {
	var got []string
	for accountType, ok := range purchaseAccountTypes {
		if ok {
			got = append(got, accountType)
		}
	}
	slices.Sort(got)
	if want := []string{"cost_of_goods_sold", "expense", "other_expense"}; !slices.Equal(got, want) {
		t.Errorf("purchaseAccountTypes = %v, want %v", got, want)
	}
	if purchaseLineRowLabels[lineKindAccount] != "Account line" || purchaseLineRowLabels[lineKindItem] != "Product line" {
		t.Errorf("purchaseLineRowLabels = %v, want Account line and Product line", purchaseLineRowLabels)
	}
}

// checkPurchaseAccountLine runs on every save of an account line, of a bill
// and of an expense alike.
func TestCheckPurchaseAccountLine_RefusesTheCellsOfAProductLine(t *testing.T) {
	pe := newPurchaseEnv(t)
	others := map[string]map[string]any{
		"product":  {"product": pe.accessPoint.Id},
		"quantity": {"quantity": 2},
		"rate":     {"rate": 500},
	}

	t.Run("on a bill", func(t *testing.T) {
		bill := mkBill(t, pe.app, pe.summit, nil)
		for name, extra := range others {
			_, err := newBillLine(pe.app, bill, 0, billLineWith(accountLine(pe.software, 12500), extra))
			if err == nil {
				t.Errorf("a bill account line with a %s was saved", name)
				continue
			}
			requireRefusalText(t, err, wantPurchaseAccountLineCells)
		}
		requireBillLineCount(t, pe.app, bill, 0)
	})

	t.Run("on an expense", func(t *testing.T) {
		exp := pe.mkExpense(t, nil)
		for name, extra := range others {
			_, err := newExpenseLine(pe.app, exp, 0, billLineWith(accountLine(pe.software, 12500), extra))
			if err == nil {
				t.Errorf("an expense account line with a %s was saved", name)
				continue
			}
			requireRefusalText(t, err, wantPurchaseAccountLineCells)
		}
		requireExpenseLineCount(t, pe.app, exp, 0)
	})
}

// One case per required cell of the account row kind (lesson 34): Account
// (core's row check) and Amount (a number is never blank, so a 0 or a missing
// amount is the purchase check's refusal).
func TestCheckPurchaseAccountLine_RefusesAMissingRequiredCell(t *testing.T) {
	pe := newPurchaseEnv(t)
	exp := pe.mkExpense(t, nil)

	_, err := newExpenseLine(pe.app, exp, 0, map[string]any{"kind": "account", "amount": 12500})
	requireRefusalText(t, err, "Account line 1: Account is required.")

	_, err = newExpenseLine(pe.app, exp, 0, map[string]any{"kind": "account", "account": pe.software.Id})
	requireRefusalText(t, err, fmt.Sprintf(wantBillAmountNotZero, 1))
	_, err = newExpenseLine(pe.app, exp, 0, accountLine(pe.software, 0))
	requireRefusalText(t, err, fmt.Sprintf(wantBillAmountNotZero, 1))
	requireExpenseLineCount(t, pe.app, exp, 0)

	bill := mkBill(t, pe.app, pe.summit, nil)
	_, err = newBillLine(pe.app, bill, 0, map[string]any{"kind": "account", "amount": 12500})
	requireRefusalText(t, err, "Account line 1: Account is required.")
	requireBillLineCount(t, pe.app, bill, 0)
}

// checkPurchaseLinesToPost reads the lines of the kind it is given, by that
// kind's lines collection and parent field.
func TestCheckPurchaseLinesToPost_ReadsTheLinesOfTheKind(t *testing.T) {
	pe := newPurchaseEnv(t)

	t.Run("a bill", func(t *testing.T) {
		bill := mkBill(t, pe.app, pe.summit, nil)
		mkBillLine(t, pe.app, bill, 0, accountLine(pe.pettyCash, 41286))
		err := checkPurchaseLinesToPost(pe.app, billKind, reload(t, pe.app, "books_bills", bill.Id))
		requireRefusalText(t, err, wantAccountInactive(1, "Old Petty Cash"))
	})

	t.Run("an expense", func(t *testing.T) {
		exp := pe.mkExpense(t, nil)
		mkExpenseLine(t, pe.app, exp, 0, accountLine(pe.software, 12500))
		mkExpenseLine(t, pe.app, exp, 1, productLine(pe.accessPoint, 1, 12140))
		makeProductInactive(t, pe.app, pe.accessPoint)
		err := checkPurchaseLinesToPost(pe.app, expenseKind, reload(t, pe.app, "books_expenses", exp.Id))
		requireRefusalText(t, err, fmt.Sprintf(wantBillProductInactive, 1, "Wireless access point"))
	})

	t.Run("an expense whose lines pass", func(t *testing.T) {
		exp := pe.mkExpense(t, nil)
		mkExpenseLine(t, pe.app, exp, 0, accountLine(pe.software, 12500))
		if err := checkPurchaseLinesToPost(pe.app, expenseKind, reload(t, pe.app, "books_expenses", exp.Id)); err != nil {
			t.Errorf("an expense with an active expense account line: %v", err)
		}
	})
}
