package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// A vendor credit on the cash basis (vendor credit spec §3.11): its lines are
// taken out on its date, and each application brings back its share of the
// credit's lines at the apply date (amount ÷ total, cumulative, largest
// remainder). For the bill, an application counts as a payment at the apply
// date. The rows an application brings back, for the credit and the bill,
// name the vendor credit's entry. On Accrual a credit counts on its credit
// date.

const (
	cashApplyDay  = "2026-11-16"
	cashApplyDay2 = "2026-11-17"
	cashPayDay    = "2026-11-18"
	dayBeforeVC   = "2026-11-11"
)

func creditAppliedMemo(number string) string {
	return fmt.Sprintf("Vendor credit %s applied (cash basis)", number)
}

func billCreditPaidMemo(number string) string {
	return fmt.Sprintf("Bill %s paid by vendor credit (cash basis)", number)
}

// newCreditCashBook is the apply book with Books' report sources and a fiscal
// year from January.
func newCreditCashBook(t *testing.T) *billPayEnv {
	t.Helper()
	bp := newApplyBook(t)
	registerBooksSources(t)
	saveSettings(t, bp.app, map[string]any{"fiscal_year_start_month": 1})
	return bp
}

// broughtBack are the rows of the document in field dated day that a payment
// or an application brought back.
func broughtBack(t testing.TB, app core.App, field, docID, day string) []cashRow {
	t.Helper()
	return cashRowsOf(t, app, dbx.And(dbx.HashExp{field: docID, "date": day}, dbx.Not(dbx.HashExp{"payment_entry": ""})))
}

// creditCashFigures are the statement figures a vendor credit on 6100 Rent and
// 6200 Software Subscriptions can move.
type creditCashFigures struct {
	plRent, plSoftware, plNet int64
	bsPayable, bsNetIncome    int64
}

func readCreditCashFigures(t *testing.T, bp *billPayEnv, day, method string) creditCashFigures {
	t.Helper()
	opts := reports.Options{Today: day}
	reader := bp.users.readOnly
	pl := runPL(t, bp.app, profitAndLossShipped(), reader,
		withMethod(map[string]any{"period": glPeriod(day, day)}, method), opts)
	bs := runBS(t, bp.app, reader, withMethod(map[string]any{"asOf": day, "rows": "active"}, method), opts)
	return creditCashFigures{
		plRent: plFigure(t, pl, bp.rent), plSoftware: plFigure(t, pl, bp.software),
		plNet:     plAmount(t, plComputedRow(t, pl, "Net income")),
		bsPayable: bsFigure(t, bs, bp.payable), bsNetIncome: bsLineFigure(t, bs, "Net income"),
	}
}

// plOn is an account's Profit and Loss figure over from..to on method.
func plOn(t *testing.T, bp *billPayEnv, account *core.Record, from, to, method string) int64 {
	t.Helper()
	pl := runPL(t, bp.app, profitAndLossShipped(), bp.users.readOnly,
		withMethod(map[string]any{"period": glPeriod(from, to)}, method), reports.Options{Today: to})
	return plFigure(t, pl, account)
}

// On the Cash method a posted, unapplied vendor credit changes no figure of
// Profit and Loss or the Balance Sheet: its lines are taken out on its date. On
// Accrual it counts on its credit date and not before.
func TestVendorCreditCashBasis_AnUnappliedCreditChangesNoCashFigure(t *testing.T) {
	bp := newCreditCashBook(t)
	// A cash sale on the credit's day, so every statement has figures.
	mustPost(t, bp.app, mkDraft(t, bp.app, vendorCreditDay, ln{bp.checking, 50000, 0}, ln{bp.revenue, 0, 50000}).Id, "")
	draft := mkVendorCreditOn(t, bp.app, bp.pacificPower, nil)
	mkVendorCreditLine(t, bp.app, draft, 0, accountLine(bp.rent, 3000))
	mkVendorCreditLine(t, bp.app, draft, 1, accountLine(bp.software, 2000))

	cashBefore := readCreditCashFigures(t, bp, vendorCreditDay, "cash")
	accrualBefore := readCreditCashFigures(t, bp, vendorCreditDay, "accrual")
	tbBefore := runTB(t, bp.app, bp.users.readOnly, map[string]any{"asOf": vendorCreditDay}, reports.Options{Today: vendorCreditDay})
	earlierBefore := plOn(t, bp, bp.rent, billDay, dayBeforeVC, "accrual")

	posted := mustPostVendorCredit(t, bp.app, draft.Id, bp.users.bookkeeper.Id)
	entry := posted.GetString("entry")
	takenOut := func(account *core.Record, debit, credit int) cashRow {
		return cashRow{kind: "vendor_credit", account: account.Id, debit: debit, credit: credit,
			date: vendorCreditDay, memo: unappliedVendorCreditMemo, entry: entry}
	}
	requireCashRows(t, "the credit's taken-out rows", takenOutRows(t, bp.app, "vendor_credit", posted.Id), []cashRow{
		takenOut(bp.payable, 0, 5000),
		takenOut(bp.rent, 3000, 0),
		takenOut(bp.software, 2000, 0),
	})

	if got := readCreditCashFigures(t, bp, vendorCreditDay, "cash"); got != cashBefore {
		t.Errorf("figures on Cash after the credit posted = %+v, want %+v as before it", got, cashBefore)
	}

	accrualAfter := readCreditCashFigures(t, bp, vendorCreditDay, "accrual")
	if got := accrualBefore.plRent - accrualAfter.plRent; got != 3000 {
		t.Errorf("Profit and Loss on Accrual: 6100 Rent fell by %d on the credit date, want 3000", got)
	}
	if got := accrualBefore.plSoftware - accrualAfter.plSoftware; got != 2000 {
		t.Errorf("Profit and Loss on Accrual: 6200 fell by %d on the credit date, want 2000", got)
	}
	if got := accrualAfter.plNet - accrualBefore.plNet; got != 5000 {
		t.Errorf("Profit and Loss on Accrual: Net income rose by %d on the credit date, want 5000", got)
	}
	tbAfter := runTB(t, bp.app, bp.users.readOnly, map[string]any{"asOf": vendorCreditDay}, reports.Options{Today: vendorCreditDay})
	if got := tbNet(t, tbBefore, bp.rent) - tbNet(t, tbAfter, bp.rent); got != 3000 {
		t.Errorf("Trial Balance: 6100 debit − credit fell by %d, want 3000", got)
	}
	if got := tbNet(t, tbAfter, bp.payable) - tbNet(t, tbBefore, bp.payable); got != 5000 {
		t.Errorf("Trial Balance: 2000 Accounts Payable debit − credit rose by %d, want 5000", got)
	}
	if got := plOn(t, bp, bp.rent, billDay, dayBeforeVC, "accrual"); got != earlierBefore {
		t.Errorf("Profit and Loss on Accrual before the credit date: 6100 = %d, want %d: the credit counts on its own date", got, earlierBefore)
	}
	requireCashRowsBalancePerDate(t, bp.app)
	requireNoCashDrift(t, bp.app)
}

func TestVendorCreditCashBasis_ApplicationsBringBackTheirShares(t *testing.T) {
	bp := newCreditCashBook(t)
	credit := bp.postedCredit(t, bp.pacificPower, vendorCreditDay, billAmount{bp.rent, 3000}, billAmount{bp.software, 2000})
	bill := bp.postedBillOn(t, bp.pacificPower, billDay, billAmount{bp.designTools, 10000})
	entry, creditNo, billNo := credit.GetString("entry"), credit.GetString("number"), bill.GetString("number")
	requireNoCashDrift(t, bp.app)

	creditShare := func(account *core.Record, debit, credit int, day, paymentEntry string) cashRow {
		return cashRow{kind: "vendor_credit", account: account.Id, debit: debit, credit: credit, date: day,
			memo: creditAppliedMemo(creditNo), entry: paymentEntry, paymentEntry: paymentEntry}
	}
	billShare := func(account *core.Record, debit, credit int, day, paymentEntry string) cashRow {
		return cashRow{kind: "bill", account: account.Id, debit: debit, credit: credit, date: day,
			memo: billCreditPaidMemo(billNo), entry: paymentEntry, paymentEntry: paymentEntry}
	}

	bp.apply(t, credit, bill, 2500, cashApplyDay)
	requireCashRows(t, "the credit's rows the 25.00 application brought back",
		broughtBack(t, bp.app, "vendor_credit", credit.Id, cashApplyDay), []cashRow{
			creditShare(bp.rent, 0, 1500, cashApplyDay, entry),
			creditShare(bp.software, 0, 1000, cashApplyDay, entry),
			creditShare(bp.payable, 2500, 0, cashApplyDay, entry),
		})
	requireCashRows(t, "the bill's rows the 25.00 application brought back",
		broughtBack(t, bp.app, "bill", bill.Id, cashApplyDay), []cashRow{
			billShare(bp.designTools, 2500, 0, cashApplyDay, entry),
			billShare(bp.payable, 0, 2500, cashApplyDay, entry),
		})
	requireNoCashDrift(t, bp.app)

	// 37.34 of 50.00 applied in all: 6100 takes 2240 (2240.4) and 6200 1494
	// (1493.6, the larger remainder), less the 1500 and 1000 already back.
	second := bp.apply(t, credit, bill, 1234, cashApplyDay2)
	requireCashRows(t, "the credit's rows the 12.34 application brought back",
		broughtBack(t, bp.app, "vendor_credit", credit.Id, cashApplyDay2), []cashRow{
			creditShare(bp.rent, 0, 740, cashApplyDay2, entry),
			creditShare(bp.software, 0, 494, cashApplyDay2, entry),
			creditShare(bp.payable, 1234, 0, cashApplyDay2, entry),
		})
	requireCashRows(t, "the bill's rows the 12.34 application brought back",
		broughtBack(t, bp.app, "bill", bill.Id, cashApplyDay2), []cashRow{
			billShare(bp.designTools, 1234, 0, cashApplyDay2, entry),
			billShare(bp.payable, 0, 1234, cashApplyDay2, entry),
		})
	requireNoCashDrift(t, bp.app)

	payment := bp.payOn(t, bp.pacificPower, cashPayDay, payLine{bill, 1000})
	paymentEntry := payment.GetString("entry")
	requireCashRows(t, "the bill's rows the payment brought back", shareRows(t, bp.app, paymentEntry), []cashRow{
		{kind: "bill", account: bp.designTools.Id, debit: 1000, date: cashPayDay, memo: billPaidMemo(billNo), entry: paymentEntry, paymentEntry: paymentEntry},
		{kind: "bill", account: bp.payable.Id, credit: 1000, date: cashPayDay, memo: billPaidMemo(billNo), entry: paymentEntry, paymentEntry: paymentEntry},
	})
	requireNoCashDrift(t, bp.app)

	if a := bp.removeAs(t, bp.users.bookkeeper, second); a.status != http.StatusNoContent {
		t.Fatalf("remove the 12.34 application answered %d; body: %s", a.status, a.body)
	}
	requireCashRows(t, "the credit's rows on the removed application's day",
		broughtBack(t, bp.app, "vendor_credit", credit.Id, cashApplyDay2), []cashRow{})
	requireCashRows(t, "the bill's rows on the removed application's day",
		broughtBack(t, bp.app, "bill", bill.Id, cashApplyDay2), []cashRow{})
	requireNoCashDrift(t, bp.app)

	// The correction takes the 25.00 application: the bill's rows it brings
	// back name the correction's entry, not the void original's.
	draft := bp.creditCorrectionOf(t, credit, bp.pacificPower, billAmount{bp.rent, 3000}, billAmount{bp.software, 2000})
	corrected := mustPostVendorCredit(t, bp.app, draft.Id, bp.users.bookkeeper.Id)
	correctionEntry := corrected.GetString("entry")
	if correctionEntry == "" || correctionEntry == entry {
		t.Fatalf("the correction's entry %q, want a new entry", correctionEntry)
	}
	requireCashRows(t, "the bill's rows the moved application brings back",
		broughtBack(t, bp.app, "bill", bill.Id, cashApplyDay), []cashRow{
			billShare(bp.designTools, 2500, 0, cashApplyDay, correctionEntry),
			billShare(bp.payable, 0, 2500, cashApplyDay, correctionEntry),
		})
	requireCashRows(t, "the correction's rows the moved application brings back",
		broughtBack(t, bp.app, "vendor_credit", draft.Id, cashApplyDay), []cashRow{
			creditShare(bp.rent, 0, 1500, cashApplyDay, correctionEntry),
			creditShare(bp.software, 0, 1000, cashApplyDay, correctionEntry),
			creditShare(bp.payable, 2500, 0, cashApplyDay, correctionEntry),
		})
	requireCashRows(t, "rows that still name the void original's entry as payment_entry",
		cashRowsOf(t, bp.app, dbx.HashExp{"payment_entry": entry}), []cashRow{})
	requireCashRowsBalancePerDate(t, bp.app)
	requireNoCashDrift(t, bp.app)
	if n, err := rebuildCashBasis(bp.app); err != nil || n != 0 {
		t.Errorf("rebuildCashBasis = %d changes (err %v), want 0", n, err)
	}
}

// A bill paid by a payment and by a credit on one day takes their rows in
// entry sequence order. Two earlier bill payments put the day's payment at
// sequence 1003, after the credit's 1001, though the payment was written
// first: the credit's rows come first.
func TestVendorCreditCashBasis_APaymentAndACreditOnOneDaySortByEntrySequence(t *testing.T) {
	bp := newCreditCashBook(t)
	other := bp.postedBillOn(t, bp.summit, billDay, billAmount{bp.software, 5000})
	bp.payOn(t, bp.summit, billPayDay, payLine{other, 1000})
	bp.payOn(t, bp.summit, billPayDay, payLine{other, 1000})
	credit := bp.postedCredit(t, bp.pacificPower, vendorCreditDay, billAmount{bp.rent, 5000})
	bill := bp.postedBillOn(t, bp.pacificPower, billDay, billAmount{bp.designTools, 10000})

	payment := bp.payOn(t, bp.pacificPower, cashApplyDay, payLine{bill, 4000})
	bp.apply(t, credit, bill, 3000, cashApplyDay)
	paymentEntry, creditEntry := payment.GetString("entry"), credit.GetString("entry")
	if p, c := reload(t, bp.app, "books_journal_entries", paymentEntry).GetInt("sequence"),
		reload(t, bp.app, "books_journal_entries", creditEntry).GetInt("sequence"); p <= c {
		t.Fatalf("payment entry sequence %d, credit entry sequence %d; the case needs the credit's lower", p, c)
	}

	recs, err := bp.app.FindRecordsByFilter(cashLinesCol, "bill = {:b} && payment_entry != ''", "position", 0, 0,
		dbx.Params{"b": bill.Id})
	if err != nil {
		t.Fatal(err)
	}
	var order []string
	for _, r := range recs {
		if pe := r.GetString("payment_entry"); len(order) == 0 || order[len(order)-1] != pe {
			order = append(order, pe)
		}
	}
	if want := []string{creditEntry, paymentEntry}; fmt.Sprint(order) != fmt.Sprint(want) {
		t.Errorf("the bill's brought-back rows by position come from %v, want the credit's entry then the payment's %v", order, want)
	}
	requireNoCashDrift(t, bp.app)
}

// A credit applied in full shows, on the apply date, the bill's cost less the
// credit.
func TestVendorCreditCashBasis_ACreditAppliedInFullShowsTheBillLessTheCredit(t *testing.T) {
	t.Run("a credit and a bill of the same amount on one account", func(t *testing.T) {
		bp := newCreditCashBook(t)
		credit := bp.postedCredit(t, bp.pacificPower, vendorCreditDay, billAmount{bp.designTools, 3000})
		bill := bp.postedBillOn(t, bp.pacificPower, billDay, billAmount{bp.designTools, 3000})
		bp.apply(t, credit, bill, 3000, cashApplyDay)
		requireBillBalance(t, bp.app, bill, 0)

		onDay := append(broughtBack(t, bp.app, "bill", bill.Id, cashApplyDay),
			broughtBack(t, bp.app, "vendor_credit", credit.Id, cashApplyDay)...)
		if got := netByAccount(onDay)[bp.designTools.Id]; got != 0 {
			t.Errorf("6210 rows brought back on the apply date net %d, want 0 (the bill's 3000 less the credit's 3000)", got)
		}
		if got := len(onDay); got != 4 {
			t.Errorf("%d rows brought back on the apply date, want 4 (the bill's and the credit's 6210 and A/P)", got)
		}
		if got := plOn(t, bp, bp.designTools, cashApplyDay, cashApplyDay, "cash"); got != 0 {
			t.Errorf("Profit and Loss on Cash on the apply date: 6210 = %d, want 0", got)
		}
		requireNoCashDrift(t, bp.app)
	})

	t.Run("the rest of the bill paid on the apply date", func(t *testing.T) {
		bp := newCreditCashBook(t)
		credit := bp.postedCredit(t, bp.pacificPower, vendorCreditDay, billAmount{bp.designTools, 3000})
		bill := bp.postedBillOn(t, bp.pacificPower, billDay, billAmount{bp.designTools, 10000})
		if got := plOn(t, bp, bp.designTools, billDay, cashApplyDay, "cash"); got != 0 {
			t.Fatalf("Profit and Loss on Cash before anything is paid: 6210 = %d, want 0", got)
		}
		bp.apply(t, credit, bill, 3000, cashApplyDay)
		bp.payOn(t, bp.pacificPower, cashApplyDay, payLine{bill, 7000})
		requireBillBalance(t, bp.app, bill, 0)

		if got := netByAccount(broughtBack(t, bp.app, "bill", bill.Id, cashApplyDay))[bp.designTools.Id]; got != 10000 {
			t.Errorf("the bill's 6210 rows brought back on the apply date net %d, want its whole cost 10000", got)
		}
		if got := netByAccount(broughtBack(t, bp.app, "vendor_credit", credit.Id, cashApplyDay))[bp.designTools.Id]; got != -3000 {
			t.Errorf("the credit's 6210 rows brought back on the apply date net %d, want -3000", got)
		}
		if got := plOn(t, bp, bp.designTools, cashApplyDay, cashApplyDay, "cash"); got != 7000 {
			t.Errorf("Profit and Loss on Cash on the apply date: 6210 = %d, want 7000 (the bill's 10000 less the credit's 3000)", got)
		}
		if got := plOn(t, bp, bp.designTools, billDay, dayBeforeVC, "cash"); got != 0 {
			t.Errorf("Profit and Loss on Cash before the apply date: 6210 = %d, want 0", got)
		}
		if got := plOn(t, bp, bp.designTools, billDay, vendorCreditDay, "accrual"); got != 7000 {
			t.Errorf("Profit and Loss on Accrual through the credit date: 6210 = %d, want 7000", got)
		}
		requireNoCashDrift(t, bp.app)
		if n, err := rebuildCashBasis(bp.app); err != nil || n != 0 {
			t.Errorf("rebuildCashBasis = %d changes (err %v), want 0", n, err)
		}
	})
}
