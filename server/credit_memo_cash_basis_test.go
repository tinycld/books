package books

import (
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The credit memo on the cash basis (spec §3.11, Q17): a credit memo is a
// deferred kind, as an invoice is. Each posted line of its entry is taken out
// of the cash layer on its own date, and nothing brings it back in this unit
// (nothing applies or refunds a memo yet). So on the Cash method a memo
// changes no figure; on Accrual it counts on its date.

const unappliedCreditMemoMemo = "Unapplied credit memo (cash basis)"

// creditMemoCashRows are the stored cash-basis rows of one credit memo.
func creditMemoCashRows(t testing.TB, app core.App, memoID string) []cashRow {
	t.Helper()
	return cashRowsOf(t, app, dbx.HashExp{"credit_memo": memoID})
}

// creditMemoTakenOut is the taken-out row of one line of a memo's entry: the
// line's sides turned, on the memo's day, with the unapplied memo text.
func creditMemoTakenOut(account *core.Record, debit, credit int, entry string) cashRow {
	return cashRow{
		kind: "credit_memo", account: account.Id, debit: debit, credit: credit,
		date: creditMemoDay, memo: unappliedCreditMemoMemo, entry: entry,
	}
}

func TestCreditMemoCashBasis_PostTakesEachEntryLineOut(t *testing.T) {
	ce := newCreditMemoEnv(t)
	memo := ce.denverMemo(t, nil)
	posted := mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)
	entry := posted.GetString("entry")
	if entry == "" {
		t.Fatal("the posted credit memo names no entry")
	}

	// The entry credits A/R 108710 and debits 4000 60000, 4100 40000 and the
	// three agencies' tax; each row turns its line's sides.
	requireCashRows(t, "the credit memo's taken-out rows", creditMemoCashRows(t, ce.app, memo.Id), []cashRow{
		creditMemoTakenOut(ce.receivable, 108710, 0, entry),
		creditMemoTakenOut(ce.revenue, 0, 60000, entry),
		creditMemoTakenOut(ce.hardware, 0, 40000, entry),
		creditMemoTakenOut(ce.stateTax, 0, 2900, entry),
		creditMemoTakenOut(ce.rtdTax, 0, 1000, entry),
		creditMemoTakenOut(ce.cityTax, 0, 4810, entry),
	})
	recs, err := ce.app.FindAllRecords(cashLinesCol, dbx.HashExp{"credit_memo": memo.Id})
	if err != nil {
		t.Fatalf("read the credit memo's cash rows: %v", err)
	}
	for _, r := range recs {
		if r.GetString("invoice") != "" || r.GetString("bill") != "" || r.GetString("payment_entry") != "" {
			t.Errorf("cash row %s: invoice %q bill %q payment_entry %q, want none (a taken-out row of the memo only)",
				r.Id, r.GetString("invoice"), r.GetString("bill"), r.GetString("payment_entry"))
		}
	}
	if rows := cashRowsOf(t, ce.app, dbx.And(dbx.HashExp{"credit_memo": memo.Id}, dbx.NewExp("payment_entry != ''"))); len(rows) != 0 {
		t.Errorf("rows bring the credit memo back %+v, want none (nothing applies a memo in this unit)", rows)
	}
	if got := cashNet(t, ce.app); len(got) != 0 {
		t.Errorf("an unapplied credit memo counts on the cash basis: %v, want nothing", got)
	}
	requireCashRowsBalancePerDate(t, ce.app)
	requireNoCashDrift(t, ce.app)
}

// cashTaxRecord is one stored cash-basis tax row with the fields that name its
// document.
type cashTaxRecord struct {
	invoice, creditMemo, document, paymentEntry string
}

func cashTaxRecordsOf(t testing.TB, app core.App, exp dbx.Expression) []cashTaxRecord {
	t.Helper()
	recs, err := app.FindAllRecords(cashTaxLinesCol, exp)
	if err != nil {
		t.Fatalf("read the cash-basis tax rows: %v", err)
	}
	out := make([]cashTaxRecord, len(recs))
	for i, r := range recs {
		out[i] = cashTaxRecord{
			invoice: r.GetString("invoice"), creditMemo: r.GetString("credit_memo"),
			document: r.GetString("document"), paymentEntry: r.GetString("payment_entry"),
		}
	}
	return out
}

// A memo's tax lines are stored negated; the rows that take them out turn
// them back, as an unpaid invoice's rows turn its positive lines.
func TestCreditMemoCashBasis_TaxRowsTakeTheTaxLinesOut(t *testing.T) {
	ce := newCreditMemoEnv(t)
	memo := ce.denverMemo(t, nil)
	mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)

	row := func(component, agency *core.Record, amount int) taxRow {
		return taxRow{
			rate: ce.denver.Id, component: component.Id, agency: agency.Id,
			gross: 100000, taxable: 100000, amount: amount, date: creditMemoDay,
		}
	}
	requireTaxRows(t, "the credit memo's cash tax rows", cashTaxRowsOf(t, ce.app, dbx.HashExp{"credit_memo": memo.Id}), []taxRow{
		row(ce.state, ce.stateDOR, 2900),
		row(ce.rtd, ce.rtdAgency, 1000),
		row(ce.city, ce.cityDept, 4810),
	})
	recs := cashTaxRecordsOf(t, ce.app, dbx.HashExp{"credit_memo": memo.Id})
	if len(recs) != 3 {
		t.Fatalf("%d cash tax rows name the credit memo, want 3 (one per component)", len(recs))
	}
	for _, r := range recs {
		if r != (cashTaxRecord{creditMemo: memo.Id, document: memo.Id}) {
			t.Errorf("cash tax row %+v, want credit_memo and document the memo, invoice and payment_entry empty", r)
		}
	}
	requireNoCashDrift(t, ce.app)
}

// A void memo's rows take out its entry and its void reversal, so they net to
// zero per account; it has no cash tax rows, as a void invoice has none.
func TestCreditMemoCashBasis_VoidedMemoCountsForNothing(t *testing.T) {
	ce := newCreditMemoEnv(t)
	memo := ce.denverMemo(t, nil)
	mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)
	if rows := creditMemoCashRows(t, ce.app, memo.Id); len(rows) != 6 {
		t.Fatalf("the posted credit memo has %d cash rows before its void, want 6 (one per entry line)", len(rows))
	}
	if rows := cashTaxRowsOf(t, ce.app, dbx.HashExp{"credit_memo": memo.Id}); len(rows) != 3 {
		t.Fatalf("the posted credit memo has %d cash tax rows before its void, want 3", len(rows))
	}

	if err := voidCreditMemoAs(ce.app, memo.Id, ce.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the credit memo: %v", err)
	}
	rows := creditMemoCashRows(t, ce.app, memo.Id)
	if len(rows) != 12 {
		t.Errorf("the void credit memo has %d cash rows, want 12 (its entry's and its reversal's lines)", len(rows))
	}
	if got := nonZero(netByAccount(rows)); len(got) != 0 {
		t.Errorf("the void credit memo's rows net to %v per account, want nothing", got)
	}
	if rows := cashTaxRowsOf(t, ce.app, dbx.HashExp{"credit_memo": memo.Id}); len(rows) != 0 {
		t.Errorf("the void credit memo still has cash tax rows %+v", rows)
	}
	if got := cashNet(t, ce.app); len(got) != 0 {
		t.Errorf("a void credit memo counts on the cash basis: %v, want nothing", got)
	}
	requireNoCashDrift(t, ce.app)
}

// A correction voids the original, whose rows then net to zero, and takes its
// own entry out; verifyCashBasis finds the memo's rows, and the full rebuild
// keeps them.
func TestCreditMemoCashBasis_CorrectionVerifyAndRebuild(t *testing.T) {
	ce := newCreditMemoEnv(t)
	actor := ce.users.bookkeeper.Id
	original := ce.denverMemo(t, nil)
	mustPostCreditMemo(t, ce.app, original.Id, actor)
	requireNoCashDrift(t, ce.app)

	draft := ce.mkCreditMemo(t, map[string]any{"replaces": original.Id, "memo": "Corrected"})
	mkCreditMemoLine(t, ce.app, draft, 0, item(ce.service, 1, 30000, false))
	corrected := mustPostCreditMemo(t, ce.app, draft.Id, actor)
	correctedEntry := corrected.GetString("entry")

	if got := nonZero(netByAccount(creditMemoCashRows(t, ce.app, original.Id))); len(got) != 0 {
		t.Errorf("the replaced credit memo's rows net to %v per account, want nothing", got)
	}
	if rows := creditMemoCashRows(t, ce.app, original.Id); len(rows) == 0 {
		t.Error("the replaced credit memo has no cash rows, want its entry's and its reversal's lines taken out")
	}
	requireCashRows(t, "the correction's taken-out rows", creditMemoCashRows(t, ce.app, corrected.Id), []cashRow{
		creditMemoTakenOut(ce.receivable, 30000, 0, correctedEntry),
		creditMemoTakenOut(ce.revenue, 0, 30000, correctedEntry),
	})
	if got := cashNet(t, ce.app); len(got) != 0 {
		t.Errorf("cash basis after the correction = %v, want nothing", got)
	}
	requireCashRowsBalancePerDate(t, ce.app)
	requireNoCashDrift(t, ce.app)

	before := cashRowsOf(t, ce.app, nil)
	n, err := rebuildCashBasis(ce.app)
	if err != nil {
		t.Fatalf("rebuildCashBasis: %v", err)
	}
	if n != 0 {
		t.Errorf("rebuildCashBasis on a book with posted credit memos = %d changes, want 0", n)
	}
	requireCashRows(t, "the rows after a rebuild", cashRowsOf(t, ce.app, nil), before)

	recs, err := ce.app.FindAllRecords(cashLinesCol, dbx.HashExp{"credit_memo": corrected.Id})
	if err != nil || len(recs) == 0 {
		t.Fatalf("read a taken-out row of the correction: %d rows, err %v", len(recs), err)
	}
	if _, err := ce.app.DB().NewQuery("DELETE FROM books_cash_basis_lines WHERE id = {:id}").
		Bind(dbx.Params{"id": recs[0].Id}).Execute(); err != nil {
		t.Fatalf("delete a cash-basis row: %v", err)
	}
	drifts, err := verifyCashBasis(ce.app)
	if err != nil {
		t.Fatalf("verifyCashBasis: %v", err)
	}
	if len(drifts) != 1 || drifts[0].Kind != "credit_memo" || drifts[0].Document != corrected.Id {
		t.Errorf("verifyCashBasis after a credit memo row was deleted = %+v, want one drift of kind credit_memo naming %s", drifts, corrected.Id)
	}
	if n, err := rebuildCashBasis(ce.app); err != nil || n != 1 {
		t.Errorf("rebuildCashBasis after one credit memo row was deleted = %d changes (err %v), want 1", n, err)
	}
	requireCashRows(t, "the rows after the rebuild restored the deleted one", cashRowsOf(t, ce.app, nil), before)
	requireNoCashDrift(t, ce.app)
}

// memoFigures are the statement figures a credit memo can move, read from one
// run of each report on one day.
type memoFigures struct {
	plRevenue, plHardware, plNet          int64
	bsReceivable, bsChecking, bsNetIncome int64
	bsStateTax, bsRTDTax, bsCityTax       int64
	tbRevenue, tbHardware, tbReceivable   int64
}

// tbNet is an account's Trial Balance debit − credit, 0 when it has no row.
func tbNet(t *testing.T, res *reports.Result, account *core.Record) int64 {
	t.Helper()
	if !hasRowFor(t, res, account) {
		return 0
	}
	r := rowFor(t, res, account)
	debit, _ := moneyCell(t, r, "debit")
	credit, _ := moneyCell(t, r, "credit")
	return debit - credit
}

// readMemoFigures runs Profit and Loss and the Balance Sheet on method, and the
// Trial Balance (accrual only), over creditMemoDay.
func readMemoFigures(t *testing.T, ce *creditMemoEnv, method string) memoFigures {
	t.Helper()
	opts := reports.Options{Today: creditMemoDay}
	reader := ce.users.readOnly
	pl := runPL(t, ce.app, profitAndLossShipped(), reader,
		withMethod(map[string]any{"period": glPeriod(creditMemoDay, creditMemoDay)}, method), opts)
	bs := runBS(t, ce.app, reader, withMethod(map[string]any{"asOf": creditMemoDay, "rows": "active"}, method), opts)
	tb := runTB(t, ce.app, reader, map[string]any{"asOf": creditMemoDay}, opts)
	return memoFigures{
		plRevenue: plFigure(t, pl, ce.revenue), plHardware: plFigure(t, pl, ce.hardware),
		plNet:        plAmount(t, plComputedRow(t, pl, "Net income")),
		bsReceivable: bsFigure(t, bs, ce.receivable), bsChecking: bsFigure(t, bs, ce.checking),
		bsNetIncome: bsLineFigure(t, bs, "Net income"),
		bsStateTax:  bsFigure(t, bs, ce.stateTax), bsRTDTax: bsFigure(t, bs, ce.rtdTax), bsCityTax: bsFigure(t, bs, ce.cityTax),
		tbRevenue: tbNet(t, tb, ce.revenue), tbHardware: tbNet(t, tb, ce.hardware), tbReceivable: tbNet(t, tb, ce.receivable),
	}
}

// On the Cash method a posted credit memo changes no figure of Profit and Loss
// or the Balance Sheet; on Accrual its income falls by the memo's subtotal.
// The Trial Balance runs on Accrual only, so there the income falls too.
func TestCreditMemoCashBasis_StatementsOnCashAndAccrual(t *testing.T) {
	ce := newCreditMemoEnv(t)
	registerBooksSources(t)
	saveSettings(t, ce.app, map[string]any{"fiscal_year_start_month": 1})
	// A cash sale on the memo's day, so every statement has figures.
	mustPost(t, ce.app, mkDraft(t, ce.app, creditMemoDay, ln{ce.checking, 50000, 0}, ln{ce.revenue, 0, 50000}).Id, "")
	memo := ce.denverMemo(t, nil)

	cashBefore := readMemoFigures(t, ce, "cash")
	accrualBefore := readMemoFigures(t, ce, "accrual")
	if cashBefore.plRevenue != 50000 || accrualBefore.plRevenue != 50000 {
		t.Fatalf("4000 Consulting Income before the memo: Cash %d, Accrual %d; want 50000 on both", cashBefore.plRevenue, accrualBefore.plRevenue)
	}
	mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)

	cashAfter := readMemoFigures(t, ce, "cash")
	if cashAfter.plRevenue != cashBefore.plRevenue || cashAfter.plHardware != cashBefore.plHardware || cashAfter.plNet != cashBefore.plNet {
		t.Errorf("Profit and Loss on Cash: 4000 %d, 4100 %d, Net income %d after the memo; want %d, %d, %d as before it",
			cashAfter.plRevenue, cashAfter.plHardware, cashAfter.plNet, cashBefore.plRevenue, cashBefore.plHardware, cashBefore.plNet)
	}
	cashBS := func(f memoFigures) [6]int64 {
		return [6]int64{f.bsReceivable, f.bsChecking, f.bsNetIncome, f.bsStateTax, f.bsRTDTax, f.bsCityTax}
	}
	if got, want := cashBS(cashAfter), cashBS(cashBefore); got != want {
		t.Errorf("Balance Sheet on Cash (A/R, Checking, Net income, three tax payables) = %v after the memo, want %v as before it", got, want)
	}

	accrualAfter := readMemoFigures(t, ce, "accrual")
	if got := accrualBefore.plRevenue - accrualAfter.plRevenue; got != 60000 {
		t.Errorf("Profit and Loss on Accrual: 4000 Consulting Income fell by %d, want the memo's 60000", got)
	}
	if got := accrualBefore.plHardware - accrualAfter.plHardware; got != 40000 {
		t.Errorf("Profit and Loss on Accrual: 4100 Hardware sales fell by %d, want the memo's 40000", got)
	}
	if got := accrualBefore.plNet - accrualAfter.plNet; got != 100000 {
		t.Errorf("Profit and Loss on Accrual: Net income fell by %d, want the memo's subtotal 100000", got)
	}
	// Income is credit-normal: a debit of the memo's lines raises debit − credit.
	if got := accrualAfter.tbRevenue - accrualBefore.tbRevenue; got != 60000 {
		t.Errorf("Trial Balance: 4000 debit − credit rose by %d, want the memo's 60000", got)
	}
	if got := accrualAfter.tbHardware - accrualBefore.tbHardware; got != 40000 {
		t.Errorf("Trial Balance: 4100 debit − credit rose by %d, want the memo's 40000", got)
	}
	if got := accrualBefore.tbReceivable - accrualAfter.tbReceivable; got != 108710 {
		t.Errorf("Trial Balance: 1100 Accounts receivable fell by %d, want the memo's total 108710", got)
	}
}
