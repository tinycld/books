package books

import (
	"fmt"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// A vendor refund on the cash basis (vendor refund spec §3.10): each refund
// line counts as a payment of its vendor credit at the refund date and brings
// back that line's share of the credit's lines (amount ÷ total, by the share
// rule of the other payers), memo "Vendor credit <n> refunded (cash basis)".
// The rows read the refund's entry. A void takes them out again.

func creditRefundedMemo(number string) string {
	return fmt.Sprintf("Vendor credit %s refunded (cash basis)", number)
}

// newRefundCashBook is the refund env with Books' report sources and a fiscal
// year from January.
func newRefundCashBook(t *testing.T) *refundEnv {
	t.Helper()
	re := newRefundEnv(t)
	registerBooksSources(t)
	saveSettings(t, re.app, map[string]any{"fiscal_year_start_month": 1})
	return re
}

// A credit of 300.00 (6100 Rent) and 125.00 (6200 Software) refunded 170.00
// brings back 170/425 of each line at the refund date: 120.00 and 50.00, and
// 170.00 on Accounts payable. On the Cash method Rent falls on the refund day;
// on Accrual it fell on the credit date and the refund day does not move it.
func TestVendorRefundCashBasis_ARefundBringsBackItsShare(t *testing.T) {
	re := newRefundCashBook(t)
	credit := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 30000}, billAmount{re.software, 12500})
	number := credit.GetString("number")
	requireNoCashDrift(t, re.app)
	cashBefore := plOn(t, re.billPayEnv, re.rent, refundDay, refundDay, "cash")
	accrualBefore := plOn(t, re.billPayEnv, re.rent, refundDay, refundDay, "accrual")

	posted := re.refund(t, nil, refundLine{credit, 17000})
	entry := posted.GetString("entry")
	if entry == "" {
		t.Fatal("the posted refund names no entry")
	}
	share := func(account *core.Record, debit, credit int) cashRow {
		return cashRow{kind: "vendor_credit", account: account.Id, debit: debit, credit: credit, date: refundDay,
			memo: creditRefundedMemo(number), entry: entry, paymentEntry: entry}
	}
	requireCashRows(t, "the credit's rows the 170.00 refund brought back", shareRows(t, re.app, entry), []cashRow{
		share(re.rent, 0, 12000),
		share(re.software, 0, 5000),
		share(re.payable, 17000, 0),
	})
	requireCashRows(t, "the credit's rows dated the refund day",
		cashRowsOf(t, re.app, dbx.HashExp{"vendor_credit": credit.Id, "date": refundDay}), []cashRow{
			share(re.rent, 0, 12000),
			share(re.software, 0, 5000),
			share(re.payable, 17000, 0),
		})
	if got := cashBefore - plOn(t, re.billPayEnv, re.rent, refundDay, refundDay, "cash"); got != 12000 {
		t.Errorf("Profit and Loss on Cash: 6100 Rent fell by %d on the refund day, want 12000", got)
	}
	if got := plOn(t, re.billPayEnv, re.rent, refundDay, refundDay, "accrual"); got != accrualBefore {
		t.Errorf("Profit and Loss on Accrual: 6100 Rent on the refund day = %d, want %d (a credit counts on its credit date)", got, accrualBefore)
	}
	requireCashRowsBalancePerDate(t, re.app)
	requireNoCashDrift(t, re.app)
	if n, err := rebuildCashBasis(re.app); err != nil || n != 0 {
		t.Errorf("rebuildCashBasis = %d changes (err %v), want 0", n, err)
	}

	if err := voidRefundAs(re.app, posted.Id, re.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the refund: %v", err)
	}
	requireCashRows(t, "the rows that name the void refund's entry", shareRows(t, re.app, entry), []cashRow{})
	requireCashRows(t, "the credit's rows dated the refund day after the void",
		cashRowsOf(t, re.app, dbx.HashExp{"vendor_credit": credit.Id, "date": refundDay}), []cashRow{})
	requireCashRowsBalancePerDate(t, re.app)
	requireNoCashDrift(t, re.app)
}

// A credit never applied and never refunded has only its taken-out rows.
func TestVendorRefundCashBasis_ACreditNeverRefundedHasOnlyItsTakenOutRows(t *testing.T) {
	re := newRefundCashBook(t)
	credit := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 30000}, billAmount{re.software, 12500})
	// A draft refund names it; a draft brings nothing back.
	draft := re.mkRefund(t, map[string]any{"amount": 17000})
	mkRefundLine(t, re.app, draft, credit, 0, 17000)

	entry := credit.GetString("entry")
	takenOut := func(account *core.Record, debit, credit int) cashRow {
		return cashRow{kind: "vendor_credit", account: account.Id, debit: debit, credit: credit,
			date: vendorCreditDay, memo: unappliedVendorCreditMemo, entry: entry}
	}
	requireCashRows(t, "every cash row of the credit", cashRowsOf(t, re.app, dbx.HashExp{"vendor_credit": credit.Id}), []cashRow{
		takenOut(re.payable, 0, 42500),
		takenOut(re.rent, 30000, 0),
		takenOut(re.software, 12500, 0),
	})
	requireNoCashDrift(t, re.app)
}
