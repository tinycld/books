package books

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// Deposit to (spec §3.3, §4.3): with "Sales deposited to" on Ask (the setting
// empty), a receipt names an active bank or Undeposited funds account; with an
// account set, the server stamps that account on every create, update and
// post, whatever the client sent.

func setSalesDepositAccount(t testing.TB, app core.App, accountID string) {
	t.Helper()
	s := reload(t, app, "books_settings", settingsID)
	s.Set("sales_deposit_account", accountID)
	if err := app.Save(s); err != nil {
		t.Fatalf("set Sales deposited to %q: %v", accountID, err)
	}
}

func requireDepositTo(t testing.TB, app core.App, receiptID string, want *core.Record) {
	t.Helper()
	if got := reload(t, app, "books_sales_receipts", receiptID).GetString("deposit_to"); got != want.Id {
		t.Errorf("deposit_to = %q, want %s %s (%s)", got, want.GetString("number"), want.GetString("name"), want.Id)
	}
}

func TestSalesDeposit_AskAcceptsBankAndUndepositedFunds(t *testing.T) {
	re := newReceiptEnv(t)
	for _, account := range []*core.Record{re.undeposited, re.checking} {
		r, err := re.newReceipt(map[string]any{"deposit_to": account.Id})
		if err != nil {
			t.Fatalf("a receipt deposited to %s was refused: %v", account.GetString("name"), err)
		}
		requireDepositTo(t, re.app, r.Id, account)
	}
}

func TestSalesDeposit_AskRefusesAWrongAccount(t *testing.T) {
	re := newReceiptEnv(t)
	makeAccountInactive(t, re.app, re.savings)
	cases := []struct {
		name    string
		account string
	}{
		{"4000 Consulting Income", re.revenue.Id},
		{"an inactive bank account", re.savings.Id},
		{"no account while the chart has one", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := re.newReceipt(map[string]any{"deposit_to": tc.account})
			requireFieldRefusal(t, err, "deposit_to", wantDepositInvalid)
		})
	}
	if n, _ := re.app.CountRecords("books_sales_receipts"); n != 0 {
		t.Errorf("%d sales receipts stored after the refusals, want 0", n)
	}
}

func TestSalesDeposit_AskWithNoDepositAccountInTheChart(t *testing.T) {
	re := newReceiptEnv(t)
	for _, a := range []*core.Record{re.checking, re.savings, re.undeposited} {
		makeAccountInactive(t, re.app, a)
	}
	_, err := re.newReceipt(map[string]any{"deposit_to": ""})
	requireFieldRefusal(t, err, "deposit_to", wantDepositNone)
	if n, _ := re.app.CountRecords("books_sales_receipts"); n != 0 {
		t.Errorf("%d sales receipts stored after the refusal, want 0", n)
	}
}

// Only a change of Deposit to is checked on a draft save: a draft whose
// account became inactive after it was chosen still saves other edits.
func TestSalesDeposit_DraftKeepsAnAccountMadeInactive(t *testing.T) {
	re := newReceiptEnv(t)
	r := re.mkReceipt(t, map[string]any{"deposit_to": re.savings.Id})
	makeAccountInactive(t, re.app, re.savings)
	if err := setFields(t, re.app, "books_sales_receipts", r.Id, map[string]any{"memo": "Second visit"}); err != nil {
		t.Fatalf("a memo edit of a draft whose deposit account became inactive was refused: %v", err)
	}
	stored := reload(t, re.app, "books_sales_receipts", r.Id)
	if stored.GetString("memo") != "Second visit" || stored.GetString("deposit_to") != re.savings.Id {
		t.Errorf("memo %q deposit_to %q, want the edit saved and the stored account kept", stored.GetString("memo"), stored.GetString("deposit_to"))
	}
}

// The draft save keeps an account made inactive, but Post checks it again: a
// post under Ask refuses an inactive Deposit to and leaves the draft as it was.
func TestSalesDeposit_PostRefusesAnAccountMadeInactive(t *testing.T) {
	re := newReceiptEnv(t)
	r := re.mkReceipt(t, map[string]any{"deposit_to": re.savings.Id})
	mkReceiptLine(t, re.app, r, 0, item(re.service, 1, 45000, false))
	makeAccountInactive(t, re.app, re.savings)

	err := postReceiptAs(re.app, r.Id, re.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "deposit_to", wantDepositInvalid)
	requireReceiptNotPosted(t, re.app, r.Id, 1001)
	requireDepositTo(t, re.app, r.Id, re.savings)
}

func TestSalesDeposit_SetAccountIsStampedOnCreateAndUpdate(t *testing.T) {
	re := newReceiptEnv(t)
	asked := re.mkReceipt(t, map[string]any{"deposit_to": re.checking.Id})
	requireDepositTo(t, re.app, asked.Id, re.checking)

	setSalesDepositAccount(t, re.app, re.undeposited.Id)

	created := re.mkReceipt(t, map[string]any{"deposit_to": re.checking.Id})
	requireDepositTo(t, re.app, created.Id, re.undeposited)

	if err := setFields(t, re.app, "books_sales_receipts", asked.Id, map[string]any{"deposit_to": re.checking.Id, "memo": "Edited"}); err != nil {
		t.Fatalf("update a draft while an account is set: %v", err)
	}
	requireDepositTo(t, re.app, asked.Id, re.undeposited)
}

// A draft saved under Ask with 1000 posts to the account set afterwards.
func TestSalesDeposit_PostTakesTheSetAccount(t *testing.T) {
	re := newReceiptEnv(t)
	r := re.mkReceipt(t, map[string]any{"deposit_to": re.checking.Id})
	mkReceiptLine(t, re.app, r, 0, item(re.service, 1, 45000, false))
	setSalesDepositAccount(t, re.app, re.undeposited.Id)

	posted := mustPostReceipt(t, re.app, r.Id, re.users.bookkeeper.Id)
	lines := entryLinesOf(t, re.app, posted.GetString("entry"))
	if len(lines) == 0 || lines[0].account != re.undeposited.Id || lines[0].debit != 45000 {
		t.Errorf("entry lines %v, want line 1 a 45000 debit to 1200 Undeposited funds", lines)
	}
	for _, l := range lines {
		if l.account == re.checking.Id {
			t.Errorf("entry line %v names 1000 Business Checking, which the setting replaced", l)
		}
	}
	if got := posted.GetString("deposit_to"); got != re.undeposited.Id {
		t.Errorf("posted receipt deposit_to = %q, want 1200 Undeposited funds", got)
	}
}

// A correction takes the current setting too, not the original's account.
func TestSalesDeposit_CorrectionTakesTheSetAccount(t *testing.T) {
	re := newReceiptEnv(t)
	original := re.mkReceipt(t, map[string]any{"deposit_to": re.checking.Id})
	mkReceiptLine(t, re.app, original, 0, item(re.service, 1, 45000, false))
	mustPostReceipt(t, re.app, original.Id, re.users.bookkeeper.Id)
	requireDepositTo(t, re.app, original.Id, re.checking)

	setSalesDepositAccount(t, re.app, re.undeposited.Id)
	correction := re.mkReceipt(t, map[string]any{"replaces": original.Id, "deposit_to": re.checking.Id})
	requireDepositTo(t, re.app, correction.Id, re.undeposited)
}

func TestIsDepositAccount(t *testing.T) {
	re := newReceiptEnv(t)
	retiredFunds := mkNumberedAccount(t, re.app, "Old undeposited funds", "1210", "other_current_asset", "undeposited_funds")
	makeAccountInactive(t, re.app, retiredFunds)
	makeAccountInactive(t, re.app, re.savings)
	cases := []struct {
		name    string
		account *core.Record
		want    bool
	}{
		{"an active bank account", re.checking, true},
		{"an active Undeposited funds account", re.undeposited, true},
		{"an inactive bank account", re.savings, false},
		{"an inactive Undeposited funds account", retiredFunds, false},
		{"an accounts receivable account", re.receivable, false},
	}
	for _, tc := range cases {
		if got := isDepositAccount(reload(t, re.app, "books_accounts", tc.account.Id)); got != tc.want {
			t.Errorf("isDepositAccount(%s) = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestSalesDepositAccount_ReadsTheSetting(t *testing.T) {
	re := newReceiptEnv(t)
	got, err := salesDepositAccount(re.app)
	if err != nil {
		t.Fatalf("salesDepositAccount: %v", err)
	}
	if got != "" {
		t.Errorf("salesDepositAccount with the field empty = %q, want \"\" (Ask)", got)
	}
	setSalesDepositAccount(t, re.app, re.undeposited.Id)
	got, err = salesDepositAccount(re.app)
	if err != nil {
		t.Fatalf("salesDepositAccount: %v", err)
	}
	if got != re.undeposited.Id {
		t.Errorf("salesDepositAccount with 1200 set = %q, want %q", got, re.undeposited.Id)
	}
}
