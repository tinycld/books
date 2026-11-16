package books

import (
	"fmt"
	"reflect"
	"sort"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The cash-basis tax rows (pay-bills spec §3.10, Q3): posting writes the
// document date on every tax line of an invoice and of a sales receipt. On
// the cash basis an invoice's tax lines are taken out at the invoice date
// (amounts negated) and come back by each payment's share (gross, taxable and
// tax amounts × paid ÷ total, cumulative, largest remainder) at the payment
// date, in books_cash_basis_tax_lines. A sales receipt has no cash tax rows:
// it counts on its own date.
//
// A tax line's gross is the document's subtotal (writeTaxSnapshot), so an
// invoice of 1080.00 (1000.00 taxable + 80.00 tax) has a tax line of gross
// 1000.00, taxable 1000.00, tax 80.00; half of it paid brings back 500.00,
// 500.00 and 40.00.

const cashTaxLinesCol = "books_cash_basis_tax_lines"

// cashTaxEnv is one book of posted invoices, sales receipts and customer
// payments: the sales tax env's accounts, products, Denver combined group
// and Harborview Dental, with the payment guards bound too, and its own 8%
// rate under its own agency.
type cashTaxEnv struct {
	*receiptEnv
	agency, eight *core.Record
	actor         string
}

func newCashTaxEnv(t *testing.T) *cashTaxEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, invoiceKind)
	registerSalesDocGuards(app, salesReceiptKind)
	registerPaymentGuards(app)
	bindSalesDocHosts(t, app)
	re := receiptEnvOn(t, app)
	agency := mkTaxAgency(t, app, "Cash tax agency", mkLiabilityAccount(t, app, "Cash tax payable"))
	return &cashTaxEnv{
		receiptEnv: re,
		agency:     agency,
		eight:      mkTaxRate(t, app, "Cash tax eight", 80000, agency),
		actor:      re.users.bookkeeper.Id,
	}
}

// taxedInvoiceOn posts an invoice of Harborview Dental dated day (due the
// same day) under rate, with one taxable line of the service at cents.
func (ce *cashTaxEnv) taxedInvoiceOn(t testing.TB, rate *core.Record, day string, cents int64) *core.Record {
	t.Helper()
	inv, err := newInvoice(ce.app, ce.customer, map[string]any{"date": day, "due_date": day, "tax_rate": rate.Id})
	if err != nil {
		t.Fatalf("save a draft invoice dated %s: %v", day, err)
	}
	mkInvoiceLine(t, ce.app, inv, 0, item(ce.service, 1, cents, true))
	return mustPostInvoice(t, ce.app, inv.Id, ce.actor)
}

// taxedReceiptOn posts a sales receipt dated day under rate, with one taxable
// line of the service at cents.
func (ce *cashTaxEnv) taxedReceiptOn(t testing.TB, rate *core.Record, day string, cents int64) *core.Record {
	t.Helper()
	r := ce.mkReceipt(t, map[string]any{"tax_rate": rate.Id, "date": day})
	mkReceiptLine(t, ce.app, r, 0, item(ce.service, 1, cents, true))
	return mustPostReceipt(t, ce.app, r.Id, ce.actor)
}

// payOn posts a customer payment dated day of amount into 1000 Business
// Checking, all of it applied to inv.
func (ce *cashTaxEnv) payOn(t testing.TB, inv *core.Record, day string, amount int64) *core.Record {
	t.Helper()
	p, err := saveNew(ce.app, "books_payments", map[string]any{
		"customer": ce.customer.Id, "status": "draft", "date": day, "amount": amount, "deposit_to": ce.checking.Id,
	})
	if err != nil {
		t.Fatalf("save a draft payment dated %s: %v", day, err)
	}
	mkApplication(t, ce.app, p, inv, 0, amount)
	posted := mustPostPayment(t, ce.app, p.Id, ce.actor)
	if posted.GetString("entry") == "" {
		t.Fatalf("the payment dated %s names no entry", day)
	}
	return posted
}

// taxRow is one cash-basis tax row as these tests compare it.
type taxRow struct {
	rate, component, agency string
	gross, taxable, amount  int
	date                    string
	paymentEntry            string
}

func cashTaxRowsOf(t testing.TB, app core.App, exp dbx.Expression) []taxRow {
	t.Helper()
	recs, err := app.FindAllRecords(cashTaxLinesCol, exp)
	if err != nil {
		t.Fatalf("read the cash-basis tax rows: %v", err)
	}
	out := make([]taxRow, len(recs))
	for i, r := range recs {
		out[i] = taxRow{
			rate: r.GetString("rate"), component: r.GetString("component"), agency: r.GetString("agency"),
			gross: r.GetInt("gross_amount"), taxable: r.GetInt("taxable_amount"), amount: r.GetInt("amount"),
			date: r.GetString("date"), paymentEntry: r.GetString("payment_entry"),
		}
	}
	return sortedTaxRows(out)
}

func sortedTaxRows(rows []taxRow) []taxRow {
	sort.Slice(rows, func(i, j int) bool { return fmt.Sprint(rows[i]) < fmt.Sprint(rows[j]) })
	return rows
}

// takenOutTaxRows are an invoice's tax rows that no payment brought back.
func takenOutTaxRows(t testing.TB, app core.App, invoiceID string) []taxRow {
	t.Helper()
	return cashTaxRowsOf(t, app, dbx.HashExp{"invoice": invoiceID, "payment_entry": ""})
}

// shareTaxRows are the tax rows a payment's entry brought back.
func shareTaxRows(t testing.TB, app core.App, paymentEntry string) []taxRow {
	t.Helper()
	return cashTaxRowsOf(t, app, dbx.HashExp{"payment_entry": paymentEntry})
}

func requireTaxRows(t testing.TB, what string, got, want []taxRow) {
	t.Helper()
	if !reflect.DeepEqual(got, sortedTaxRows(want)) {
		t.Errorf("%s =\n%+v\nwant\n%+v", what, got, want)
	}
}

func TestCashBasisTax_PostingWritesTheDocumentDate(t *testing.T) {
	ce := newCashTaxEnv(t)
	inv := ce.taxedInvoiceOn(t, ce.denver, cashDay1, 100000)
	rct := ce.taxedReceiptOn(t, ce.denver, cashDay2, 50000)

	for _, d := range []struct {
		what string
		kind salesDocKind
		doc  *core.Record
		day  string
	}{{"the invoice", invoiceKind, inv, cashDay1}, {"the sales receipt", salesReceiptKind, rct, cashDay2}} {
		lines := docTaxLinesOf(t, ce.app, d.kind, d.doc.Id)
		if len(lines) != 3 {
			t.Fatalf("%s under Denver combined has %d tax lines, want 3 (one per component)", d.what, len(lines))
		}
		for _, l := range lines {
			if got := l.GetString("date"); got != d.day {
				t.Errorf("%s's tax line of component %s: date %q, want the document date %q", d.what, l.GetString("component"), got, d.day)
			}
		}
	}
}

func TestCashBasisTax_PartPaymentBringsBackItsShare(t *testing.T) {
	ce := newCashTaxEnv(t)
	inv := ce.taxedInvoiceOn(t, ce.eight, cashDay1, 100000)
	if got := inv.GetInt("total"); got != 108000 {
		t.Fatalf("the invoice's total = %d, want 108000 (1000.00 + 80.00 tax)", got)
	}
	taken := taxRow{
		rate: ce.eight.Id, component: ce.eight.Id, agency: ce.agency.Id,
		gross: -100000, taxable: -100000, amount: -8000, date: cashDay1,
	}
	requireTaxRows(t, "the unpaid invoice's taken-out tax rows", takenOutTaxRows(t, ce.app, inv.Id), []taxRow{taken})

	payment := ce.payOn(t, inv, cashDay2, 54000)
	payEntry := payment.GetString("entry")
	requireTaxRows(t, "the 540.00 payment's tax share", shareTaxRows(t, ce.app, payEntry), []taxRow{{
		rate: ce.eight.Id, component: ce.eight.Id, agency: ce.agency.Id,
		gross: 50000, taxable: 50000, amount: 4000, date: cashDay2, paymentEntry: payEntry,
	}})
	requireTaxRows(t, "the taken-out tax rows after the payment", takenOutTaxRows(t, ce.app, inv.Id), []taxRow{taken})
	requireNoCashDrift(t, ce.app)
}

// taxMeasures are a tax row's three figures.
func taxMeasures(r taxRow) [3]int { return [3]int{r.gross, r.taxable, r.amount} }

func TestCashBasisTax_ThirdsAssignEveryCent(t *testing.T) {
	ce := newCashTaxEnv(t)
	// Denver combined on 1000.00: 29.00 + 10.00 + 48.10 tax, total 1087.10.
	inv := ce.taxedInvoiceOn(t, ce.denver, cashDay1, 100000)
	total := int64(inv.GetInt("total"))
	if total != 108710 {
		t.Fatalf("the invoice's total = %d, want 108710", total)
	}
	stored := map[string][3]int{}
	for _, l := range docTaxLinesOf(t, ce.app, invoiceKind, inv.Id) {
		stored[l.GetString("component")] = [3]int{l.GetInt("gross_amount"), l.GetInt("taxable_amount"), l.GetInt("amount")}
	}
	if len(stored) != 3 {
		t.Fatalf("the invoice has tax lines of %d components, want 3", len(stored))
	}

	payments := []struct {
		day    string
		amount int64
	}{{cashDay2, 36237}, {cashDay3, 36237}, {cashDay4, 36236}}
	cumulative := map[string][3]int{}
	var paid int64
	for i, p := range payments {
		payment := ce.payOn(t, inv, p.day, p.amount)
		paid += p.amount
		rows := shareTaxRows(t, ce.app, payment.GetString("entry"))
		seen := map[string]bool{}
		for _, r := range rows {
			if r.date != p.day {
				t.Errorf("payment %d's share of component %s is dated %q, want the payment date %q", i+1, r.component, r.date, p.day)
			}
			if seen[r.component] {
				t.Errorf("payment %d has two share rows of component %s", i+1, r.component)
			}
			seen[r.component] = true
			c := cumulative[r.component]
			for m, v := range taxMeasures(r) {
				c[m] += v
			}
			cumulative[r.component] = c
		}
		// Cumulative: after each payment, what came back of each figure is
		// within a cent of figure × paid ÷ total.
		for component, figures := range stored {
			for m, figure := range figures {
				exact := int64(figure) * paid
				got := int64(cumulative[component][m]) * total
				if diff := got - exact; diff <= -total || diff >= total {
					t.Errorf("after payment %d (%d of %d paid): component %s figure %d brought back %d in all, want within a cent of %d × %d ÷ %d",
						i+1, paid, total, component, m, cumulative[component][m], figure, paid, total)
				}
			}
		}
		// Largest remainder: after each payment, what came back of each figure over
		// all the tax lines is the floor of (the figure's sum) × paid ÷ total, not
		// the sum of each line's floor.
		for m := range 3 {
			var storedSum, cameBack int64
			for component, figures := range stored {
				storedSum += int64(figures[m])
				cameBack += int64(cumulative[component][m])
			}
			if want := storedSum * paid / total; cameBack != want {
				t.Errorf("after payment %d (%d of %d paid): figure %d brought back %d over the tax lines, want floor(%d × %d ÷ %d) = %d",
					i+1, paid, total, m, cameBack, storedSum, paid, total, want)
			}
		}
	}
	// Paid in full: every cent of every figure came back.
	if !reflect.DeepEqual(cumulative, stored) {
		t.Errorf("the three payments' shares per component (gross, taxable, tax) = %v, want exactly the tax lines %v", cumulative, stored)
	}
	requireNoCashDrift(t, ce.app)
}

func TestCashBasisTax_VoidedPaymentLosesItsShare(t *testing.T) {
	ce := newCashTaxEnv(t)
	inv := ce.taxedInvoiceOn(t, ce.eight, cashDay1, 100000)
	payment := ce.payOn(t, inv, cashDay2, 54000)
	payEntry := payment.GetString("entry")
	if rows := shareTaxRows(t, ce.app, payEntry); len(rows) != 1 {
		t.Fatalf("the payment has %d tax share rows before its void, want 1", len(rows))
	}

	if err := voidPaymentAs(ce.app, payment.Id, ce.actor); err != nil {
		t.Fatalf("void the payment: %v", err)
	}
	if rows := shareTaxRows(t, ce.app, payEntry); len(rows) != 0 {
		t.Errorf("the voided payment still has tax share rows %+v", rows)
	}
	requireTaxRows(t, "the invoice's taken-out tax rows after the void", takenOutTaxRows(t, ce.app, inv.Id), []taxRow{{
		rate: ce.eight.Id, component: ce.eight.Id, agency: ce.agency.Id,
		gross: -100000, taxable: -100000, amount: -8000, date: cashDay1,
	}})
	requireNoCashDrift(t, ce.app)
}

func TestCashBasisTax_VoidedInvoiceHasNoTaxRows(t *testing.T) {
	ce := newCashTaxEnv(t)
	inv := ce.taxedInvoiceOn(t, ce.eight, cashDay1, 100000)
	if rows := cashTaxRowsOf(t, ce.app, dbx.HashExp{"invoice": inv.Id}); len(rows) != 1 {
		t.Fatalf("the posted invoice has %d cash tax rows before its void, want 1", len(rows))
	}
	if err := voidInvoiceAs(ce.app, inv.Id, ce.actor); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	if rows := cashTaxRowsOf(t, ce.app, dbx.HashExp{"invoice": inv.Id}); len(rows) != 0 {
		t.Errorf("the voided invoice still has cash tax rows %+v", rows)
	}
	requireNoCashDrift(t, ce.app)
}

func TestRebuildCashBasis_RestoresADeletedTaxRow(t *testing.T) {
	ce := newCashTaxEnv(t)
	inv := ce.taxedInvoiceOn(t, ce.eight, cashDay1, 100000)
	ce.payOn(t, inv, cashDay2, 54000)
	ce.taxedReceiptOn(t, ce.eight, cashDay3, 50000)
	before := cashTaxRowsOf(t, ce.app, nil)
	if len(before) != 2 {
		t.Fatalf("the book has %d cash tax rows, want 2 (the invoice's taken-out row and the payment's share)", len(before))
	}

	recs, err := ce.app.FindAllRecords(cashTaxLinesCol, dbx.HashExp{"invoice": inv.Id, "payment_entry": ""})
	if err != nil || len(recs) != 1 {
		t.Fatalf("read the invoice's taken-out tax row: %d rows, err %v", len(recs), err)
	}
	if _, err := ce.app.DB().NewQuery("DELETE FROM books_cash_basis_tax_lines WHERE id = {:id}").
		Bind(dbx.Params{"id": recs[0].Id}).Execute(); err != nil {
		t.Fatalf("delete a cash tax row: %v", err)
	}
	drifts, err := verifyCashBasis(ce.app)
	if err != nil {
		t.Fatalf("verifyCashBasis: %v", err)
	}
	if len(drifts) == 0 {
		t.Error("verifyCashBasis reports no drift after a cash tax row was deleted")
	}

	if _, err := rebuildCashBasis(ce.app); err != nil {
		t.Fatalf("rebuildCashBasis: %v", err)
	}
	requireTaxRows(t, "the cash tax rows after the rebuild restored the deleted one", cashTaxRowsOf(t, ce.app, nil), before)
	requireNoCashDrift(t, ce.app)
}
