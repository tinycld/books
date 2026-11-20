package books

import (
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	memoApplyCashFirstDay  = "2026-11-16"
	memoApplyCashSecondDay = "2026-11-17"
	memoApplyCashInvMemo   = "Invoice 1001 paid by credit memo (cash basis)"
	memoApplyCashMemoMemo  = "Credit memo 1001 applied (cash basis)"
)

// memoApplyCashBook is the credit memo application env with one tax rate of
// 19.0476% on its own agency and liability, so a 420.00 line carries 80.00 of
// tax and a 210.00 line 40.00.
type memoApplyCashBook struct {
	*memoApplyEnv
	taxPayable, agency, rate *core.Record
}

func newMemoApplyCashBook(t *testing.T) *memoApplyCashBook {
	t.Helper()
	me := newMemoApplyEnv(t)
	payable := mkLiabilityAccount(t, me.app, "Apply tax payable")
	agency := mkTaxAgency(t, me.app, "Apply tax agency", payable)
	return &memoApplyCashBook{
		memoApplyEnv: me, taxPayable: payable, agency: agency,
		rate: mkTaxRate(t, me.app, "Apply tax", cashWriteOffRatePPM, agency),
	}
}

// taxedInvoice posts invoice 1001: 420.00 income and 80.00 tax, 500.00.
func (b *memoApplyCashBook) taxedInvoice(t *testing.T) *core.Record {
	t.Helper()
	draft, err := newInvoice(b.app, b.customer, map[string]any{
		"date": memoApplyInvoiceDay, "due_date": memoApplyInvoiceDay, "tax_rate": b.rate.Id,
	})
	if err != nil {
		t.Fatalf("save the taxed draft invoice: %v", err)
	}
	mkInvoiceLine(t, b.app, draft, 0, item(b.service, 1, 42000, true))
	inv := mustPostInvoice(t, b.app, draft.Id, b.users.bookkeeper.Id)
	if got := [3]int{inv.GetInt("subtotal"), inv.GetInt("tax_total"), inv.GetInt("total")}; got != [3]int{42000, 8000, 50000} {
		t.Fatalf("invoice subtotal/tax/total = %v, want [42000 8000 50000]", got)
	}
	return inv
}

// taxedMemo posts credit memo 1001: 210.00 income and 40.00 tax, 250.00.
func (b *memoApplyCashBook) taxedMemo(t *testing.T) *core.Record {
	t.Helper()
	memo := b.mkCreditMemo(t, map[string]any{"date": memoApplyCreditDay, "tax_rate": b.rate.Id})
	mkCreditMemoLine(t, b.app, memo, 0, item(b.service, 1, 21000, true))
	requireCreditMemoTotals(t, b.app, memo.Id, 21000, 4000, 25000)
	return mustPostCreditMemo(t, b.app, memo.Id, b.users.bookkeeper.Id)
}

// memoApplySharesOf are the rows of a document that an application or payment brought
// back, on any date.
func memoApplySharesOf(t testing.TB, app core.App, field, docID string) []cashRow {
	t.Helper()
	return cashRowsOf(t, app, dbx.And(dbx.HashExp{field: docID}, dbx.Not(dbx.HashExp{"payment_entry": ""})))
}

func taxSharesOf(t testing.TB, app core.App, field, docID string) []taxRow {
	t.Helper()
	return cashTaxRowsOf(t, app, dbx.And(dbx.HashExp{field: docID}, dbx.Not(dbx.HashExp{"payment_entry": ""})))
}

// An application of 123.45 brings back 123.45 ÷ 500.00 of the invoice's
// deferred lines and 123.45 ÷ 250.00 of the memo's, at the apply date, under
// the memo's entry: 420.00 → 103.70 and 80.00 → 19.75 on the invoice, 210.00
// → 103.70 and 40.00 → 19.75 on the memo (largest remainder). A second
// application of 126.55 takes the memo's rest, so the memo's shares add up to
// its deferred lines.
func TestCreditMemoApplicationCashBasis_BothDocumentsBringBackTheirShare(t *testing.T) {
	b := newMemoApplyCashBook(t)
	inv := b.taxedInvoice(t)
	memo := b.taxedMemo(t)
	if inv.GetString("number") != "1001" || memo.GetString("number") != "1001" {
		t.Fatalf("invoice %q and memo %q, want both numbered 1001", inv.GetString("number"), memo.GetString("number"))
	}
	memoEntry := memo.GetString("entry")
	if memoEntry == "" {
		t.Fatal("the posted memo names no entry")
	}

	// An unapplied memo, and an invoice nothing paid, have no row brought back.
	requireCashRows(t, "the unapplied memo's brought-back rows", memoApplySharesOf(t, b.app, "credit_memo", memo.Id), []cashRow{})
	requireCashRows(t, "the unpaid invoice's brought-back rows", memoApplySharesOf(t, b.app, "invoice", inv.Id), []cashRow{})
	requireNoCashDrift(t, b.app)

	first := b.apply(t, memo, inv, 12345, memoApplyCashFirstDay)
	invShare := func(account *core.Record, debit, credit int) cashRow {
		return cashRow{kind: "invoice", account: account.Id, debit: debit, credit: credit, date: memoApplyCashFirstDay,
			memo: memoApplyCashInvMemo, entry: memoEntry, paymentEntry: memoEntry}
	}
	memoShare := func(account *core.Record, debit, credit int) cashRow {
		return cashRow{kind: "credit_memo", account: account.Id, debit: debit, credit: credit, date: memoApplyCashFirstDay,
			memo: memoApplyCashMemoMemo, entry: memoEntry, paymentEntry: memoEntry}
	}
	requireCashRows(t, "the invoice's rows the application brought back", memoApplySharesOf(t, b.app, "invoice", inv.Id), []cashRow{
		invShare(b.receivable, 12345, 0),
		invShare(b.revenue, 0, 10370),
		invShare(b.taxPayable, 0, 1975),
	})
	requireCashRows(t, "the memo's rows the application brought back", memoApplySharesOf(t, b.app, "credit_memo", memo.Id), []cashRow{
		memoShare(b.receivable, 0, 12345),
		memoShare(b.revenue, 10370, 0),
		memoShare(b.taxPayable, 1975, 0),
	})
	// The tax rows take their share by the payers' tax rule: for each figure
	// apart, the floor of figure × paid ÷ total, largest remainder over the tax
	// lines only. One tax line: invoice 42000 → 10369, 8000 → 1975; the memo's
	// negated lines -21000 → -10370, -4000 → -1976.
	taxShare := func(gross, taxable, amount int) taxRow {
		return taxRow{
			rate: b.rate.Id, component: b.rate.Id, agency: b.agency.Id,
			gross: gross, taxable: taxable, amount: amount, date: memoApplyCashFirstDay, paymentEntry: memoEntry,
		}
	}
	requireTaxRows(t, "the invoice's cash tax rows the application brought back", taxSharesOf(t, b.app, "invoice", inv.Id), []taxRow{taxShare(10369, 10369, 1975)})
	requireTaxRows(t, "the memo's cash tax rows the application brought back", taxSharesOf(t, b.app, "credit_memo", memo.Id), []taxRow{taxShare(-10370, -10370, -1976)})
	requireCashRowsBalancePerDate(t, b.app)
	requireNoCashDrift(t, b.app)

	second := b.apply(t, memo, inv, 12655, memoApplyCashSecondDay)
	memoNet := netByAccount(memoApplySharesOf(t, b.app, "credit_memo", memo.Id))
	if got, want := [3]int{memoNet[b.receivable.Id], memoNet[b.revenue.Id], memoNet[b.taxPayable.Id]}, [3]int{-25000, 21000, 4000}; got != want {
		t.Errorf("the memo's two shares net A/R/income/tax = %v, want its whole deferred lines %v", got, want)
	}
	invNet := netByAccount(memoApplySharesOf(t, b.app, "invoice", inv.Id))
	if got, want := [3]int{invNet[b.receivable.Id], invNet[b.revenue.Id], invNet[b.taxPayable.Id]}, [3]int{25000, -21000, -4000}; got != want {
		t.Errorf("the invoice's two shares net A/R/income/tax = %v, want half its deferred lines %v", got, want)
	}
	memoTax := 0
	for _, r := range taxSharesOf(t, b.app, "credit_memo", memo.Id) {
		memoTax += r.amount
	}
	if memoTax != -4000 {
		t.Errorf("the memo's cash tax shares add up to %d, want its whole tax -4000", memoTax)
	}
	requireCashRowsBalancePerDate(t, b.app)
	requireNoCashDrift(t, b.app)

	b.remove(t, second)
	b.remove(t, first)
	requireCashRows(t, "the memo's brought-back rows after the deletes", memoApplySharesOf(t, b.app, "credit_memo", memo.Id), []cashRow{})
	requireCashRows(t, "the invoice's brought-back rows after the deletes", memoApplySharesOf(t, b.app, "invoice", inv.Id), []cashRow{})
	if rows := cashTaxRowsOf(t, b.app, dbx.HashExp{"payment_entry": memoEntry}); len(rows) != 0 {
		t.Errorf("cash tax rows under the memo's entry after the deletes %+v, want none", rows)
	}
	requireNoCashDrift(t, b.app)
	requireMemoApplyClean(t, b.app)
}
