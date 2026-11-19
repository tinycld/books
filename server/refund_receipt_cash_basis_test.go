package books

import (
	"fmt"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The refund receipt on the cash basis (spec §3.13, Q11): a plain refund is no
// deferred kind and writes no cash row. A payout is a payment of its credit
// memo: at the refund date it brings back the payout's share of the memo's
// deferred lines and cash tax rows, memo "Credit memo <n> refunded (cash
// basis)". A void of the payout takes them out again.

func creditMemoRefundedMemo(number string) string {
	return fmt.Sprintf("Credit memo %s refunded (cash basis)", number)
}

func TestRefundReceiptCashBasis_APlainRefundWritesNoRow(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.denverRefund(t, nil)
	posted := mustPostRefundReceipt(t, rr.app, r.Id, rr.users.bookkeeper.Id)
	if posted.GetString("entry") == "" {
		t.Fatal("the posted refund names no entry")
	}
	if rows := cashRowsOf(t, rr.app, nil); len(rows) != 0 {
		t.Errorf("a plain refund wrote cash-basis rows %+v, want none (it counts on its date on both methods)", rows)
	}
	if rows := cashTaxRowsOf(t, rr.app, nil); len(rows) != 0 {
		t.Errorf("a plain refund wrote cash-basis tax rows %+v, want none", rows)
	}
	requireNoCashDrift(t, rr.app)
}

// The denverMemo of the credit memo tests (108710, dated creditMemoDay) paid
// out by half, 54355, on refundReceiptDay: each deferred line comes back by
// half (60000 -> 30000, 40000 -> 20000, tax 2900 -> 1450, 1000 -> 500,
// 4810 -> 2405, adding up to 54355), and each cash tax row by half.
func TestRefundReceiptCashBasis_APayoutBringsBackItsShare(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	actor := rr.users.bookkeeper.Id
	memo := mustPostCreditMemo(t, rr.app, rr.denverMemo(t, nil).Id, actor)
	number := memo.GetString("number")
	memoEntry := memo.GetString("entry")

	// A posted memo with no refund has only its taken-out rows.
	requireCashRows(t, "the unrefunded memo's rows", creditMemoCashRows(t, rr.app, memo.Id), []cashRow{
		creditMemoTakenOut(rr.receivable, 108710, 0, memoEntry),
		creditMemoTakenOut(rr.revenue, 0, 60000, memoEntry),
		creditMemoTakenOut(rr.hardware, 0, 40000, memoEntry),
		creditMemoTakenOut(rr.stateTax, 0, 2900, memoEntry),
		creditMemoTakenOut(rr.rtdTax, 0, 1000, memoEntry),
		creditMemoTakenOut(rr.cityTax, 0, 4810, memoEntry),
	})
	for _, row := range creditMemoCashRows(t, rr.app, memo.Id) {
		if row.memo != unappliedCreditMemoMemo {
			t.Errorf("an unrefunded memo's row has memo %q, want %q", row.memo, unappliedCreditMemoMemo)
		}
	}
	requireNoCashDrift(t, rr.app)

	payout := rr.postedPayout(t, memo, 54355)
	payEntry := payout.GetString("entry")
	if payEntry == "" {
		t.Fatal("the posted payout names no entry")
	}
	share := func(account *core.Record, debit, credit int) cashRow {
		return cashRow{kind: "credit_memo", account: account.Id, debit: debit, credit: credit, date: refundReceiptDay,
			memo: creditMemoRefundedMemo(number), entry: payEntry, paymentEntry: payEntry}
	}
	half := []cashRow{
		share(rr.receivable, 0, 54355),
		share(rr.revenue, 30000, 0),
		share(rr.hardware, 20000, 0),
		share(rr.stateTax, 1450, 0),
		share(rr.rtdTax, 500, 0),
		share(rr.cityTax, 2405, 0),
	}
	requireCashRows(t, "the memo's rows the half payout brought back", shareRows(t, rr.app, payEntry), half)
	requireCashRows(t, "the memo's rows dated the refund day",
		cashRowsOf(t, rr.app, dbx.HashExp{"credit_memo": memo.Id, "date": refundReceiptDay}), half)
	broughtBack := 0
	for _, r := range shareRows(t, rr.app, payEntry) {
		broughtBack += r.debit
	}
	if broughtBack != 54355 {
		t.Errorf("the shares brought back add up to %d, want the payout's 54355", broughtBack)
	}
	taxShare := func(component, agency *core.Record, amount int) taxRow {
		return taxRow{
			rate: rr.denver.Id, component: component.Id, agency: agency.Id,
			gross: -50000, taxable: -50000, amount: amount, date: refundReceiptDay, paymentEntry: payEntry,
		}
	}
	requireTaxRows(t, "the memo's cash tax rows the half payout brought back",
		cashTaxRowsOf(t, rr.app, dbx.HashExp{"credit_memo": memo.Id, "payment_entry": payEntry}), []taxRow{
			taxShare(rr.state, rr.stateDOR, -1450),
			taxShare(rr.rtd, rr.rtdAgency, -500),
			taxShare(rr.city, rr.cityDept, -2405),
		})
	requireCashRowsBalancePerDate(t, rr.app)
	requireNoCashDrift(t, rr.app)

	if err := voidRefundReceiptAs(rr.app, payout.Id, actor); err != nil {
		t.Fatalf("void the payout: %v", err)
	}
	requireCashRows(t, "the rows that name the void payout's entry", shareRows(t, rr.app, payEntry), []cashRow{})
	requireCashRows(t, "the memo's rows dated the refund day after the void",
		cashRowsOf(t, rr.app, dbx.HashExp{"credit_memo": memo.Id, "date": refundReceiptDay}), []cashRow{})
	if rows := cashTaxRowsOf(t, rr.app, dbx.HashExp{"payment_entry": payEntry}); len(rows) != 0 {
		t.Errorf("cash tax rows of the void payout %+v, want none", rows)
	}
	requireNoCashDrift(t, rr.app)
}

// A payout of the whole credit brings every line back: from the refund date
// on, the memo's rows net to zero per account and its cash tax rows to zero
// per component.
func TestRefundReceiptCashBasis_AFullPayoutNetsTheMemoToZero(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	memo := mustPostCreditMemo(t, rr.app, rr.denverMemo(t, nil).Id, rr.users.bookkeeper.Id)
	if got := nonZero(netByAccount(creditMemoCashRows(t, rr.app, memo.Id))); len(got) == 0 {
		t.Fatal("the unrefunded memo's rows net to nothing, want its lines taken out")
	}
	requireNoCashDrift(t, rr.app)

	rr.postedPayout(t, memo, 108710)
	if got := nonZero(netByAccount(creditMemoCashRows(t, rr.app, memo.Id))); len(got) != 0 {
		t.Errorf("the fully refunded memo's rows net to %v per account, want nothing", got)
	}
	upToTheDayBefore := cashRowsOf(t, rr.app, dbx.And(dbx.HashExp{"credit_memo": memo.Id}, dbx.NewExp("date < {:d}", dbx.Params{"d": refundReceiptDay})))
	if got := nonZero(netByAccount(upToTheDayBefore)); len(got) == 0 {
		t.Error("the memo's rows before the refund date net to nothing, want them still taken out until the refund")
	}
	byComponent := map[string]int{}
	for _, r := range cashTaxRowsOf(t, rr.app, dbx.HashExp{"credit_memo": memo.Id}) {
		byComponent[r.component] += r.amount
	}
	if len(byComponent) != 3 {
		t.Errorf("the memo's cash tax rows name %d components, want 3", len(byComponent))
	}
	if got := nonZero(byComponent); len(got) != 0 {
		t.Errorf("the fully refunded memo's cash tax rows net to %v per component, want nothing", got)
	}
	requireCashRowsBalancePerDate(t, rr.app)
	requireNoCashDrift(t, rr.app)
}
