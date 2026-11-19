package books

import (
	"reflect"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The write-off on the cash basis (write-off spec §3.6, Q5): a write-off is no
// payment. The written-off part of the invoice never comes back into the cash
// layer, and the write-off's own entry (and its void reversal) is taken out at
// its date, so its account and Accounts receivable show nothing for it.

const (
	cashWriteOffPayDay  = "2026-11-05"
	cashWriteOffInvDay  = "2026-11-04"
	writeOffUnpaidMemo  = "Write-off (cash basis)"
	cashWriteOffRatePPM = 190476 // 420.00 × 19.0476% = 80.00
)

// cashWriteOffBook is the write-off env with its own tax agency, liability and
// rate, so a 420.00 line carries 80.00 of tax.
type cashWriteOffBook struct {
	*writeOffEnv
	taxPayable, agency, rate *core.Record
}

func newCashWriteOffBook(t *testing.T) *cashWriteOffBook {
	t.Helper()
	we := newWriteOffEnv(t)
	payable := mkLiabilityAccount(t, we.app, "Write-off tax payable")
	agency := mkTaxAgency(t, we.app, "Write-off tax agency", payable)
	return &cashWriteOffBook{
		writeOffEnv: we, taxPayable: payable, agency: agency,
		rate: mkTaxRate(t, we.app, "Write-off tax", cashWriteOffRatePPM, agency),
	}
}

// taxedInvoice posts the 500.00 invoice: 420.00 income and 80.00 sales tax.
func (b *cashWriteOffBook) taxedInvoice(t *testing.T) *core.Record {
	t.Helper()
	draft, err := newInvoice(b.app, b.customer, map[string]any{
		"date": cashWriteOffInvDay, "due_date": cashWriteOffInvDay, "tax_rate": b.rate.Id,
	})
	if err != nil {
		t.Fatalf("save the taxed draft invoice: %v", err)
	}
	mkInvoiceLine(t, b.app, draft, 0, item(b.service, 1, 42000, true))
	inv := mustPostInvoice(t, b.app, draft.Id, b.actor)
	if got := [3]int{inv.GetInt("subtotal"), inv.GetInt("tax_total"), inv.GetInt("total")}; got != [3]int{42000, 8000, 50000} {
		t.Fatalf("invoice subtotal/tax/total = %v, want [42000 8000 50000]", got)
	}
	return inv
}

// cashNetOn is what the cash basis reads per account on one date: the posted
// journal lines and the cash-basis rows of that date, debit − credit, accounts
// that net to zero left out.
func cashNetOn(t testing.TB, app core.App, day string) map[string]int {
	t.Helper()
	var lines []struct {
		Account string `db:"account"`
		Net     int    `db:"net"`
	}
	err := app.DB().NewQuery(`
		SELECT account, CAST(SUM(net) AS INTEGER) AS net FROM (
			SELECT account, debit - credit AS net FROM books_journal_lines WHERE posted = 1 AND date = {:d}
			UNION ALL
			SELECT account, debit - credit AS net FROM books_cash_basis_lines WHERE posted = 1 AND date = {:d}
		) GROUP BY account`).Bind(dbx.Params{"d": day}).All(&lines)
	if err != nil {
		t.Fatalf("add the cash basis per account on %s: %v", day, err)
	}
	out := map[string]int{}
	for _, l := range lines {
		if l.Net != 0 {
			out[l.Account] = l.Net
		}
	}
	return out
}

func (b *cashWriteOffBook) requireNothingOn(t *testing.T, what, day string) {
	t.Helper()
	net := cashNetOn(t, b.app, day)
	for _, a := range []*core.Record{b.badDebts, b.receivable} {
		if got, ok := net[a.Id]; ok {
			t.Errorf("%s: %s counts %d on the cash basis on %s, want nothing", what, a.GetString("name"), got, day)
		}
	}
}

func (b *cashWriteOffBook) requirePaidShareOnly(t *testing.T, what string) {
	t.Helper()
	want := map[string]int{b.checking.Id: 10000, b.revenue.Id: -8400, b.taxPayable.Id: -1600}
	if got := cashNet(t, b.app); !reflect.DeepEqual(got, want) {
		t.Errorf("%s: cash basis per account = %v, want %v (checking 100.00, income 84.00, tax 16.00)", what, got, want)
	}
}

func TestWriteOffCashBasis_APartPaidInvoiceBringsBackOnlyThePaidShare(t *testing.T) {
	b := newCashWriteOffBook(t)
	inv := b.taxedInvoice(t)
	payment := b.pay(t, inv, cashWriteOffPayDay, 10000)
	payEntry := payment.GetString("entry")
	b.requirePaidShareOnly(t, "after the payment")
	invoiceRows := cashRowsOf(t, b.app, dbx.HashExp{"invoice": inv.Id})
	requireNoCashDrift(t, b.app)

	wo := b.mkWriteOff(t, inv, nil)
	if got := wo.GetInt("amount"); got != 40000 {
		t.Fatalf("the write-off took %d, want 40000", got)
	}
	b.requirePaidShareOnly(t, "after the write-off")
	b.requireNothingOn(t, "the posted write-off", writeOffDay)
	shares := shareTaxRows(t, b.app, payEntry)
	if len(shares) != 1 || taxMeasures(shares[0]) != [3]int{8400, 8400, 1600} {
		t.Errorf("the payment's tax share = %+v, want one row of gross 8400, taxable 8400, tax 1600", shares)
	}
	rows := cashRowsOf(t, b.app, dbx.HashExp{"write_off": wo.Id})
	if len(rows) != 2 {
		t.Errorf("the write-off has %d cash rows, want 2 (its entry's lines taken out)", len(rows))
	}
	for _, r := range rows {
		if r.kind != "write_off" || r.memo != writeOffUnpaidMemo || r.date != writeOffDay || r.paymentEntry != "" {
			t.Errorf("write-off cash row %+v, want kind write_off, memo %q, date %s, no payment entry", r, writeOffUnpaidMemo, writeOffDay)
		}
	}
	requireCashRowsBalancePerDate(t, b.app)
	requireNoCashDrift(t, b.app)

	if err := voidWriteOffAs(b.app, wo.Id, b.actor); err != nil {
		t.Fatalf("void the write-off: %v", err)
	}
	b.requirePaidShareOnly(t, "after the write-off's void")
	b.requireNothingOn(t, "the void write-off and its reversal", writeOffDay)
	requireCashRows(t, "the invoice's rows after the void (an invoice with 400.00 open)",
		cashRowsOf(t, b.app, dbx.HashExp{"invoice": inv.Id}), invoiceRows)
	if got := nonZero(netByAccount(cashRowsOf(t, b.app, dbx.HashExp{"write_off": wo.Id}))); len(got) != 0 {
		t.Errorf("the void write-off's rows net to %v per account, want nothing", got)
	}
	requireCashRowsBalancePerDate(t, b.app)
	requireNoCashDrift(t, b.app)
}

func TestWriteOffCashBasis_AWholeWriteOffGivesNoIncome(t *testing.T) {
	b := newCashWriteOffBook(t)
	inv := b.taxedInvoice(t)
	b.mkWriteOff(t, inv, nil)

	if got := cashNet(t, b.app); len(got) != 0 {
		t.Errorf("an invoice written off whole counts on the cash basis: %v, want nothing", got)
	}
	if rows := cashTaxRowsOf(t, b.app, dbx.And(dbx.HashExp{"invoice": inv.Id}, dbx.NewExp("payment_entry != ''"))); len(rows) != 0 {
		t.Errorf("tax rows bring the written-off invoice back %+v, want none", rows)
	}
	b.requireNothingOn(t, "the whole write-off", writeOffDay)
	requireNoCashDrift(t, b.app)
}

// documentPayments lists what pays the invoice on the cash basis: the payment,
// never the write-off.
func TestWriteOffCashBasis_DocumentPaymentsLeaveTheWriteOffOut(t *testing.T) {
	b := newCashWriteOffBook(t)
	inv := b.taxedInvoice(t)
	payment := b.pay(t, inv, cashWriteOffPayDay, 10000)
	wo := b.mkWriteOff(t, inv, nil)

	payments, err := documentPayments(b.app, invoiceCashDeferral, inv.Id)
	if err != nil {
		t.Fatalf("documentPayments: %v", err)
	}
	if len(payments) != 1 || payments[0].Entry != payment.GetString("entry") || payments[0].Amount != 10000 {
		t.Errorf("documentPayments of the invoice = %+v, want the one 10000 payment of entry %s", payments, payment.GetString("entry"))
	}
	for _, p := range payments {
		if p.Entry == wo.GetString("entry") || p.ID == wo.Id {
			t.Errorf("documentPayments lists the write-off: %+v", p)
		}
	}
}
