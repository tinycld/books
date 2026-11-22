package books

import (
	"fmt"
	"reflect"
	"sort"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The cash-basis rows (pay-bills spec §3.10): a bill or an invoice counts on the
// cash basis when and as far as it is paid. Each posted line of its entries is
// taken out at its own date; each payment brings back its share of the
// document's lines at the payment's date. Every write that changes a
// document's entries or payments rebuilds that document's rows, and the full
// rebuild gives the same rows.

const (
	cashLinesCol = "books_cash_basis_lines"

	// The days these tests post on: a bill on cashDay1, its payments after.
	cashDay1 = "2026-03-10"
	cashDay2 = "2026-04-15"
	cashDay3 = "2026-05-20"
	cashDay4 = "2026-06-10"

	unpaidBillMemo    = "Unpaid bill (cash basis)"
	unpaidInvoiceMemo = "Unpaid invoice (cash basis)"
)

func billPaidMemo(number string) string { return fmt.Sprintf("Bill %s paid (cash basis)", number) }

func invoicePaidMemo(number string) string {
	return fmt.Sprintf("Invoice %s paid (cash basis)", number)
}

// billAmount is one account line of a bill.
type billAmount struct {
	account *core.Record
	amount  int64
}

// postedBillOn saves a bill of vendor dated day (due the same day) with one
// account line per amount, and posts it.
func (bp *billPayEnv) postedBillOn(t testing.TB, vendor *core.Record, day string, lines ...billAmount) *core.Record {
	t.Helper()
	bill := mkBill(t, bp.app, vendor, map[string]any{"date": day, "due_date": day})
	for i, l := range lines {
		mkBillLine(t, bp.app, bill, i, accountLine(l.account, l.amount))
	}
	return mustPostBill(t, bp.app, bill.Id, bp.users.bookkeeper.Id)
}

// payOn posts one bill payment of vendor dated day.
func (bp *billPayEnv) payOn(t testing.TB, vendor *core.Record, day string, lines ...payLine) *core.Record {
	t.Helper()
	return bp.pay(t, vendor, map[string]any{"date": day}, lines...)
}

// cashRow is one cash-basis row as these tests compare it.
type cashRow struct {
	kind          string
	account       string
	debit, credit int
	date          string
	memo          string
	entry         string
	paymentEntry  string
}

func cashRowsOf(t testing.TB, app core.App, exp dbx.Expression) []cashRow {
	t.Helper()
	recs, err := app.FindAllRecords(cashLinesCol, exp)
	if err != nil {
		t.Fatalf("read the cash-basis rows: %v", err)
	}
	out := make([]cashRow, len(recs))
	for i, r := range recs {
		out[i] = cashRow{
			kind: r.GetString("document_kind"), account: r.GetString("account"),
			debit: r.GetInt("debit"), credit: r.GetInt("credit"), date: r.GetString("date"),
			memo: r.GetString("memo"), entry: r.GetString("entry"), paymentEntry: r.GetString("payment_entry"),
		}
	}
	sort.Slice(out, func(i, j int) bool { return fmt.Sprint(out[i]) < fmt.Sprint(out[j]) })
	return out
}

// takenOutRows are a document's rows that no payment brought back.
func takenOutRows(t testing.TB, app core.App, field, docID string) []cashRow {
	t.Helper()
	return cashRowsOf(t, app, dbx.And(dbx.HashExp{field: docID}, dbx.HashExp{"payment_entry": ""}))
}

// shareRows are the rows a payment's entry brought back.
func shareRows(t testing.TB, app core.App, paymentEntry string) []cashRow {
	t.Helper()
	return cashRowsOf(t, app, dbx.HashExp{"payment_entry": paymentEntry})
}

func sortedRows(rows []cashRow) []cashRow {
	sort.Slice(rows, func(i, j int) bool { return fmt.Sprint(rows[i]) < fmt.Sprint(rows[j]) })
	return rows
}

func requireCashRows(t testing.TB, what string, got, want []cashRow) {
	t.Helper()
	if !reflect.DeepEqual(got, sortedRows(want)) {
		t.Errorf("%s =\n%+v\nwant\n%+v", what, got, want)
	}
}

// netByAccount is debit − credit per account over rows.
func netByAccount(rows []cashRow) map[string]int {
	out := map[string]int{}
	for _, r := range rows {
		out[r.account] += r.debit - r.credit
	}
	return out
}

// cashNet is what the cash basis reads per account over every date: every
// posted journal line plus every cash-basis row, as debit − credit. Accounts
// that net to zero are left out.
func cashNet(t testing.TB, app core.App) map[string]int {
	t.Helper()
	var lines []struct {
		Account string `db:"account"`
		Net     int    `db:"net"`
	}
	err := app.DB().NewQuery(`
		SELECT account, CAST(SUM(net) AS INTEGER) AS net FROM (
			SELECT account, debit - credit AS net FROM books_journal_lines WHERE posted = 1
			UNION ALL
			SELECT account, debit - credit AS net FROM books_cash_basis_lines WHERE posted = 1
		) GROUP BY account`).All(&lines)
	if err != nil {
		t.Fatalf("add the cash basis per account: %v", err)
	}
	out := map[string]int{}
	for _, l := range lines {
		if l.Net != 0 {
			out[l.Account] = l.Net
		}
	}
	return out
}

// requireCashRowsBalancePerDate: taken-out rows negate balanced entries and
// share rows are balanced, so the cash rows of each date add to zero.
func requireCashRowsBalancePerDate(t testing.TB, app core.App) {
	t.Helper()
	var days []struct {
		Date   string `db:"date"`
		Debit  int    `db:"debit"`
		Credit int    `db:"credit"`
	}
	err := app.DB().NewQuery(`
		SELECT date, CAST(SUM(debit) AS INTEGER) AS debit, CAST(SUM(credit) AS INTEGER) AS credit
		FROM books_cash_basis_lines GROUP BY date ORDER BY date`).All(&days)
	if err != nil {
		t.Fatalf("add the cash rows per date: %v", err)
	}
	if len(days) == 0 {
		t.Fatal("no cash-basis rows at all")
	}
	for _, d := range days {
		if d.Debit != d.Credit {
			t.Errorf("cash rows on %s: debits %d, credits %d; want equal", d.Date, d.Debit, d.Credit)
		}
	}
}

// requireNoCashDrift fails when the stored rows differ from a full rebuild.
func requireNoCashDrift(t testing.TB, app core.App) {
	t.Helper()
	drifts, err := verifyCashBasis(app)
	if err != nil {
		t.Fatalf("verifyCashBasis: %v", err)
	}
	if len(drifts) != 0 {
		t.Errorf("the cash-basis rows drift from a full rebuild: %+v", drifts)
	}
	requireCashMonthsEqualRows(t, app)
}

// cashBillEnv is a bill payment env with 6100 Office Expenses beside 6200
// Software Subscriptions, and the cashDay1 bill of Summit IT Services of
// 1000.00: 6100 700.00 and 6200 300.00.
type cashBillEnv struct {
	*billPayEnv
	office *core.Record
	bill   *core.Record
	entry  string
}

func newCashBillEnv(t *testing.T) *cashBillEnv {
	t.Helper()
	bp := newBillPayEnv(t)
	office := mkNumberedAccount(t, bp.app, "Office Expenses", "6100", "expense", "office_general")
	bill := bp.postedBillOn(t, bp.summit, cashDay1, billAmount{office, 70000}, billAmount{bp.software, 30000})
	return &cashBillEnv{billPayEnv: bp, office: office, bill: bill, entry: bill.GetString("entry")}
}

func TestLargestRemainder(t *testing.T) {
	cases := []struct {
		amounts     []int64
		paid, total int64
		want        []int64
	}{
		{[]int64{70000, 30000}, 40000, 100000, []int64{28000, 12000}},
		{[]int64{70000, 30000}, 100000, 100000, []int64{70000, 30000}},
		// 0.33333 and 33332.66667: the larger remainder takes the cent.
		{[]int64{1, 99999}, 33333, 100000, []int64{0, 33333}},
		// 0.66666 and 66665.33334.
		{[]int64{1, 99999}, 66666, 100000, []int64{1, 66665}},
		{[]int64{1, 99999}, 100000, 100000, []int64{1, 99999}},
	}
	for _, c := range cases {
		got := largestRemainder(c.amounts, c.paid, c.total)
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("largestRemainder(%v, %d, %d) = %v, want %v", c.amounts, c.paid, c.total, got, c.want)
		}
	}
}

func TestCashBasis_BillPostTakesOutItsEntry(t *testing.T) {
	ce := newCashBillEnv(t)
	if ce.entry == "" {
		t.Fatal("the posted bill names no entry")
	}
	if n := reload(t, ce.app, "books_journal_entries", ce.entry).GetString("number"); n != ce.bill.GetString("number") {
		t.Fatalf("the bill entry's number %q, want the bill's %q", n, ce.bill.GetString("number"))
	}
	row := func(account *core.Record, debit, credit int) cashRow {
		return cashRow{kind: "bill", account: account.Id, debit: debit, credit: credit, date: cashDay1,
			memo: unpaidBillMemo, entry: ce.entry}
	}
	requireCashRows(t, "the bill's taken-out rows", takenOutRows(t, ce.app, "bill", ce.bill.Id), []cashRow{
		row(ce.office, 0, 70000),
		row(ce.software, 0, 30000),
		row(ce.payable, 100000, 0),
	})
	if got := cashNet(t, ce.app); len(got) != 0 {
		t.Errorf("an unpaid bill counts on the cash basis: %v, want nothing", got)
	}
	requireCashRowsBalancePerDate(t, ce.app)
	requireNoCashDrift(t, ce.app)
}

func TestCashBasis_PaymentsBringBackTheirShare(t *testing.T) {
	ce := newCashBillEnv(t)
	number := ce.bill.GetString("number")

	first := ce.payOn(t, ce.summit, cashDay2, payLine{ce.bill, 40000})
	firstEntry := first.GetString("entry")
	share := func(account *core.Record, debit, credit int, day, paymentEntry string) cashRow {
		return cashRow{kind: "bill", account: account.Id, debit: debit, credit: credit, date: day,
			memo: billPaidMemo(number), entry: paymentEntry, paymentEntry: paymentEntry}
	}
	// A share row's entry is the payment's entry, so the row reads its number.
	requireCashRows(t, "the 400.00 payment's share", shareRows(t, ce.app, firstEntry), []cashRow{
		share(ce.office, 28000, 0, cashDay2, firstEntry),
		share(ce.software, 12000, 0, cashDay2, firstEntry),
		share(ce.payable, 0, 40000, cashDay2, firstEntry),
	})
	if got, want := cashNet(t, ce.app), map[string]int{
		ce.office.Id: 28000, ce.software.Id: 12000, ce.checking1000.Id: -40000,
	}; !reflect.DeepEqual(got, want) {
		t.Errorf("cash basis after 400.00 paid = %v, want %v", got, want)
	}

	second := ce.payOn(t, ce.summit, cashDay3, payLine{ce.bill, 60000})
	secondEntry := second.GetString("entry")
	requireCashRows(t, "the 600.00 payment's share", shareRows(t, ce.app, secondEntry), []cashRow{
		share(ce.office, 42000, 0, cashDay3, secondEntry),
		share(ce.software, 18000, 0, cashDay3, secondEntry),
		share(ce.payable, 0, 60000, cashDay3, secondEntry),
	})
	all := append(shareRows(t, ce.app, firstEntry), shareRows(t, ce.app, secondEntry)...)
	if got, want := netByAccount(all), map[string]int{
		ce.office.Id: 70000, ce.software.Id: 30000, ce.payable.Id: -100000,
	}; !reflect.DeepEqual(got, want) {
		t.Errorf("the shares of the bill paid in full = %v, want exactly its lines %v", got, want)
	}
	if got, want := cashNet(t, ce.app), map[string]int{
		ce.office.Id: 70000, ce.software.Id: 30000, ce.checking1000.Id: -100000,
	}; !reflect.DeepEqual(got, want) {
		t.Errorf("cash basis of the bill paid in full = %v, want %v", got, want)
	}
	requireCashRowsBalancePerDate(t, ce.app)
	requireNoCashDrift(t, ce.app)
}

// threeCentBill is a bill of 1000.00 over lines of 0.01 (6100) and 999.99
// (6200), paid by 333.33, 333.33 and 333.34 on cashDay2, cashDay3, cashDay4.
func threeCentBill(t *testing.T) (ce *cashBillEnv, bill *core.Record, payments []*core.Record) {
	t.Helper()
	ce = newCashBillEnv(t)
	bill = ce.postedBillOn(t, ce.summit, cashDay1, billAmount{ce.office, 1}, billAmount{ce.software, 99999})
	for i, p := range []struct {
		day    string
		amount int64
	}{{cashDay2, 33333}, {cashDay3, 33333}, {cashDay4, 33334}} {
		payments = append(payments, ce.payOn(t, ce.summit, p.day, payLine{bill, p.amount}))
		if payments[i].GetString("entry") == "" {
			t.Fatalf("payment %d names no entry", i+1)
		}
	}
	return ce, bill, payments
}

// requireShare checks one payment's shares: its expense rows add to amount,
// its A/P row is −amount, and the split is the want per account.
func requireShare(t testing.TB, ce *cashBillEnv, payment *core.Record, amount int, office, software int) {
	t.Helper()
	net := netByAccount(shareRows(t, ce.app, payment.GetString("entry")))
	if net[ce.office.Id]+net[ce.software.Id] != amount || net[ce.payable.Id] != -amount {
		t.Errorf("payment %s of %d: shares %v do not add to its amount", payment.GetString("number"), amount, net)
	}
	if net[ce.office.Id] != office || net[ce.software.Id] != software {
		t.Errorf("payment %s of %d: 6100 %d, 6200 %d; want %d and %d (largest remainder, cumulative)",
			payment.GetString("number"), amount, net[ce.office.Id], net[ce.software.Id], office, software)
	}
}

func TestCashBasis_LargestRemainderAssignsEveryCent(t *testing.T) {
	ce, bill, payments := threeCentBill(t)
	requireShare(t, ce, payments[0], 33333, 0, 33333)
	requireShare(t, ce, payments[1], 33333, 1, 33332)
	requireShare(t, ce, payments[2], 33334, 0, 33334)

	var all []cashRow
	for _, p := range payments {
		all = append(all, shareRows(t, ce.app, p.GetString("entry"))...)
	}
	if got, want := netByAccount(all), map[string]int{ce.office.Id: 1, ce.software.Id: 99999, ce.payable.Id: -100000}; !reflect.DeepEqual(got, want) {
		t.Errorf("the three shares = %v, want exactly the bill's lines %v", got, want)
	}
	for _, r := range all {
		if r.memo != billPaidMemo(bill.GetString("number")) {
			t.Errorf("share row memo %q, want %q", r.memo, billPaidMemo(bill.GetString("number")))
		}
	}
	requireCashRowsBalancePerDate(t, ce.app)
	requireNoCashDrift(t, ce.app)
}

func TestCashBasis_VoidedPaymentLosesItsShare(t *testing.T) {
	ce, _, payments := threeCentBill(t)
	if err := voidBillPaymentAs(ce.app, payments[0].Id, ce.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the first payment: %v", err)
	}

	if rows := shareRows(t, ce.app, payments[0].GetString("entry")); len(rows) != 0 {
		t.Errorf("the voided payment still has share rows %+v", rows)
	}
	// The two left are rebuilt over 333.33 then 666.67 paid: each still adds to
	// its amount, and the cent of 6100 may move to another payment.
	var all []cashRow
	for i, p := range payments[1:] {
		rows := shareRows(t, ce.app, p.GetString("entry"))
		net := netByAccount(rows)
		amount := []int{33333, 33334}[i]
		if net[ce.office.Id]+net[ce.software.Id] != amount || net[ce.payable.Id] != -amount {
			t.Errorf("payment %s of %d after the void: shares %v do not add to its amount", p.GetString("number"), amount, net)
		}
		all = append(all, rows...)
	}
	if got, want := netByAccount(all), map[string]int{ce.office.Id: 1, ce.software.Id: 66666, ce.payable.Id: -66667}; !reflect.DeepEqual(got, want) {
		t.Errorf("the shares left = %v, want %v (largest remainder over 666.67 paid)", got, want)
	}
	requireCashRowsBalancePerDate(t, ce.app)
	requireNoCashDrift(t, ce.app)
}

// A bill payment correction rebuilds the bill: the original's share goes, the
// correction's comes in.
func TestCashBasis_BillPaymentCorrectionRebuildsTheShare(t *testing.T) {
	ce := newCashBillEnv(t)
	original := ce.payOn(t, ce.summit, cashDay2, payLine{ce.bill, 40000})
	correction := ce.pay(t, ce.summit, map[string]any{"date": cashDay3, "replaces": original.Id}, payLine{ce.bill, 50000})

	if rows := shareRows(t, ce.app, original.GetString("entry")); len(rows) != 0 {
		t.Errorf("the replaced payment still has share rows %+v", rows)
	}
	if got, want := netByAccount(shareRows(t, ce.app, correction.GetString("entry"))),
		map[string]int{ce.office.Id: 35000, ce.software.Id: 15000, ce.payable.Id: -50000}; !reflect.DeepEqual(got, want) {
		t.Errorf("the correction's share = %v, want %v", got, want)
	}
	if got, want := cashNet(t, ce.app), map[string]int{
		ce.office.Id: 35000, ce.software.Id: 15000, ce.checking1000.Id: -50000,
	}; !reflect.DeepEqual(got, want) {
		t.Errorf("cash basis after the correction = %v, want %v", got, want)
	}
	requireCashRowsBalancePerDate(t, ce.app)
	requireNoCashDrift(t, ce.app)
}

// A bill payment correction that drops one of the two bills its original paid
// rebuilds the dropped bill too: the original's share of it goes, and the bill
// is unpaid again on the cash basis.
func TestCashBasis_BillPaymentCorrectionDropsABill(t *testing.T) {
	ce := newCashBillEnv(t)
	dropped := ce.postedBillOn(t, ce.summit, cashDay1, billAmount{ce.office, 20000})
	original := ce.payOn(t, ce.summit, cashDay2, payLine{ce.bill, 40000}, payLine{dropped, 20000})
	if got := netByAccount(cashRowsOf(t, ce.app, dbx.HashExp{"bill": dropped.Id, "payment_entry": original.GetString("entry")})); got[ce.office.Id] != 20000 {
		t.Fatalf("the original's share of the second bill = %v, want 6100 20000 before the correction", got)
	}
	correction := ce.pay(t, ce.summit, map[string]any{"date": cashDay3, "replaces": original.Id}, payLine{ce.bill, 50000})

	if rows := shareRows(t, ce.app, original.GetString("entry")); len(rows) != 0 {
		t.Errorf("the replaced payment still has share rows %+v", rows)
	}
	droppedEntry := dropped.GetString("entry")
	requireCashRows(t, "the dropped bill's rows", cashRowsOf(t, ce.app, dbx.HashExp{"bill": dropped.Id}), []cashRow{
		{kind: "bill", account: ce.office.Id, credit: 20000, date: cashDay1, memo: unpaidBillMemo, entry: droppedEntry},
		{kind: "bill", account: ce.payable.Id, debit: 20000, date: cashDay1, memo: unpaidBillMemo, entry: droppedEntry},
	})
	if got, want := netByAccount(shareRows(t, ce.app, correction.GetString("entry"))),
		map[string]int{ce.office.Id: 35000, ce.software.Id: 15000, ce.payable.Id: -50000}; !reflect.DeepEqual(got, want) {
		t.Errorf("the correction's share = %v, want %v", got, want)
	}
	if got, want := cashNet(t, ce.app), map[string]int{
		ce.office.Id: 35000, ce.software.Id: 15000, ce.checking1000.Id: -50000,
	}; !reflect.DeepEqual(got, want) {
		t.Errorf("cash basis after the correction = %v, want %v (the dropped bill unpaid)", got, want)
	}
	requireCashRowsBalancePerDate(t, ce.app)
	requireNoCashDrift(t, ce.app)
}

// A customer payment correction that drops one of the two invoices its
// original paid rebuilds the dropped invoice too.
func TestCashBasis_PaymentCorrectionDropsAnInvoice(t *testing.T) {
	pe := newPaymentEnv(t)
	kept := pe.postedInvoice(t, pe.customer, 50000)
	dropped := pe.postedInvoice(t, pe.customer, 30000)
	p := pe.mkPayment(t, map[string]any{"amount": 80000, "deposit_to": pe.checking.Id})
	mkApplication(t, pe.app, p, kept, 0, 50000)
	mkApplication(t, pe.app, p, dropped, 1, 30000)
	original := mustPostPayment(t, pe.app, p.Id, pe.users.bookkeeper.Id)
	if got := netByAccount(cashRowsOf(t, pe.app, dbx.HashExp{"invoice": dropped.Id, "payment_entry": original.GetString("entry")})); got[pe.revenue.Id] != -30000 {
		t.Fatalf("the original's share of the second invoice = %v, want 4000 −30000 before the correction", got)
	}

	draft := pe.mkPayment(t, map[string]any{"replaces": original.Id, "amount": 50000, "deposit_to": pe.checking.Id})
	mkApplication(t, pe.app, draft, kept, 0, 50000)
	correction := mustPostPayment(t, pe.app, draft.Id, pe.users.bookkeeper.Id)

	if rows := shareRows(t, pe.app, original.GetString("entry")); len(rows) != 0 {
		t.Errorf("the replaced payment still has share rows %+v", rows)
	}
	droppedEntry := dropped.GetString("entry")
	droppedDay := dropped.GetString("date")
	requireCashRows(t, "the dropped invoice's rows", cashRowsOf(t, pe.app, dbx.HashExp{"invoice": dropped.Id}), []cashRow{
		{kind: "invoice", account: pe.revenue.Id, debit: 30000, date: droppedDay, memo: unpaidInvoiceMemo, entry: droppedEntry},
		{kind: "invoice", account: pe.receivable.Id, credit: 30000, date: droppedDay, memo: unpaidInvoiceMemo, entry: droppedEntry},
	})
	payEntry := correction.GetString("entry")
	paid := invoicePaidMemo(kept.GetString("number"))
	requireCashRows(t, "the correction's share of the kept invoice", shareRows(t, pe.app, payEntry), []cashRow{
		{kind: "invoice", account: pe.revenue.Id, credit: 50000, date: paymentTestDay, memo: paid, entry: payEntry, paymentEntry: payEntry},
		{kind: "invoice", account: pe.receivable.Id, debit: 50000, date: paymentTestDay, memo: paid, entry: payEntry, paymentEntry: payEntry},
	})
	if got, want := cashNet(t, pe.app), map[string]int{pe.checking.Id: 50000, pe.revenue.Id: -50000}; !reflect.DeepEqual(got, want) {
		t.Errorf("cash basis after the correction = %v, want %v (the dropped invoice unpaid)", got, want)
	}
	requireCashRowsBalancePerDate(t, pe.app)
	requireNoCashDrift(t, pe.app)
}

func TestCashBasis_VoidedInvoiceCountsForNothing(t *testing.T) {
	pe := newPaymentEnv(t)
	inv := pe.postedInvoice(t, pe.customer, 100000)
	if rows := takenOutRows(t, pe.app, "invoice", inv.Id); len(rows) != 2 {
		t.Fatalf("the posted invoice has %d taken-out rows before its void, want 2", len(rows))
	}
	if err := voidInvoiceAs(pe.app, inv.Id, pe.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	if got := nonZero(netByAccount(cashRowsOf(t, pe.app, dbx.HashExp{"invoice": inv.Id}))); len(got) != 0 {
		t.Errorf("the voided invoice's rows net to %v per account, want nothing", got)
	}
	if got := cashNet(t, pe.app); len(got) != 0 {
		t.Errorf("a voided invoice counts on the cash basis: %v, want nothing", got)
	}
	requireNoCashDrift(t, pe.app)
}

// An invoice correction takes over the applied payment: both invoices are
// rebuilt, and the payment's share now comes from the correction's lines.
func TestCashBasis_InvoiceCorrectionRebuildsBothInvoices(t *testing.T) {
	pe := newPaymentEnv(t)
	inv := pe.postedInvoice(t, pe.customer, 50000)
	p := pe.mkPayment(t, map[string]any{"amount": 30000, "deposit_to": pe.checking.Id})
	mkApplication(t, pe.app, p, inv, 0, 30000)
	payment := mustPostPayment(t, pe.app, p.Id, pe.users.bookkeeper.Id)
	payEntry := payment.GetString("entry")
	if rows := cashRowsOf(t, pe.app, dbx.HashExp{"invoice": inv.Id, "payment_entry": payEntry}); len(rows) == 0 {
		t.Fatal("the payment has no share of the invoice before the correction")
	}

	draft := pe.correctionOf(t, inv, pe.customer, 45000)
	corrected := mustPostInvoice(t, pe.app, draft.Id, pe.users.bookkeeper.Id)

	for _, r := range cashRowsOf(t, pe.app, dbx.HashExp{"invoice": inv.Id}) {
		if r.paymentEntry != "" {
			t.Errorf("the replaced invoice still has a share row %+v", r)
		}
	}
	if got := nonZero(netByAccount(cashRowsOf(t, pe.app, dbx.HashExp{"invoice": inv.Id}))); len(got) != 0 {
		t.Errorf("the replaced invoice's rows net to %v per account, want nothing", got)
	}
	correctedEntry := corrected.GetString("entry")
	correctedDay := corrected.GetString("date")
	requireCashRows(t, "the correction's taken-out rows", takenOutRows(t, pe.app, "invoice", corrected.Id), []cashRow{
		{kind: "invoice", account: pe.revenue.Id, debit: 45000, date: correctedDay, memo: unpaidInvoiceMemo, entry: correctedEntry},
		{kind: "invoice", account: pe.receivable.Id, credit: 45000, date: correctedDay, memo: unpaidInvoiceMemo, entry: correctedEntry},
	})
	paid := invoicePaidMemo(corrected.GetString("number"))
	requireCashRows(t, "the payment's share on the correction",
		cashRowsOf(t, pe.app, dbx.HashExp{"invoice": corrected.Id, "payment_entry": payEntry}), []cashRow{
			{kind: "invoice", account: pe.revenue.Id, credit: 30000, date: paymentTestDay, memo: paid, entry: payEntry, paymentEntry: payEntry},
			{kind: "invoice", account: pe.receivable.Id, debit: 30000, date: paymentTestDay, memo: paid, entry: payEntry, paymentEntry: payEntry},
		})
	if got, want := cashNet(t, pe.app), map[string]int{pe.checking.Id: 30000, pe.revenue.Id: -30000}; !reflect.DeepEqual(got, want) {
		t.Errorf("cash basis after the correction = %v, want %v (only the paid 300.00, on the correction's line)", got, want)
	}
	requireCashRowsBalancePerDate(t, pe.app)
	requireNoCashDrift(t, pe.app)
}

// A bill correction moves the payment lines to the correction (moveLines): the
// rows of both bills are rebuilt, so the payment's share now comes from the
// correction's lines.
func TestCashBasis_BillCorrectionRebuildsBothBills(t *testing.T) {
	ce := newCashBillEnv(t)
	payment := ce.payOn(t, ce.summit, cashDay2, payLine{ce.bill, 40000})
	draft := mkBill(t, ce.app, ce.summit, map[string]any{"date": cashDay1, "due_date": cashDay1, "replaces": ce.bill.Id})
	mkBillLine(t, ce.app, draft, 0, accountLine(ce.software, 80000))
	corrected := mustPostBill(t, ce.app, draft.Id, ce.users.bookkeeper.Id)

	paymentEntry := payment.GetString("entry")
	for _, r := range cashRowsOf(t, ce.app, dbx.HashExp{"bill": ce.bill.Id}) {
		if r.paymentEntry != "" {
			t.Errorf("the replaced bill still has a share row %+v", r)
		}
	}
	if got := netByAccount(cashRowsOf(t, ce.app, dbx.HashExp{"bill": ce.bill.Id})); len(nonZero(got)) != 0 {
		t.Errorf("the replaced bill's rows net to %v per account, want nothing", nonZero(got))
	}
	shares := cashRowsOf(t, ce.app, dbx.And(dbx.HashExp{"bill": corrected.Id}, dbx.HashExp{"payment_entry": paymentEntry}))
	if got, want := netByAccount(shares), map[string]int{ce.software.Id: 40000, ce.payable.Id: -40000}; !reflect.DeepEqual(nonZero(got), want) {
		t.Errorf("the payment's share on the correction = %v, want %v", got, want)
	}
	if got, want := cashNet(t, ce.app), map[string]int{ce.software.Id: 40000, ce.checking1000.Id: -40000}; !reflect.DeepEqual(got, want) {
		t.Errorf("cash basis after the correction = %v, want %v (only the paid 400.00, on the correction's line)", got, want)
	}
	requireCashRowsBalancePerDate(t, ce.app)
	requireNoCashDrift(t, ce.app)
}

func TestCashBasis_VoidedBillCountsForNothing(t *testing.T) {
	ce := newCashBillEnv(t)
	if rows := takenOutRows(t, ce.app, "bill", ce.bill.Id); len(rows) != 3 {
		t.Fatalf("the posted bill has %d taken-out rows before its void, want 3", len(rows))
	}
	if err := voidBillAs(ce.app, ce.bill.Id, ce.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the bill: %v", err)
	}
	if got := nonZero(netByAccount(cashRowsOf(t, ce.app, dbx.HashExp{"bill": ce.bill.Id}))); len(got) != 0 {
		t.Errorf("the voided bill's rows net to %v per account, want nothing", got)
	}
	if got := cashNet(t, ce.app); len(got) != 0 {
		t.Errorf("a voided bill counts on the cash basis: %v, want nothing", got)
	}
	requireNoCashDrift(t, ce.app)
}

func nonZero(m map[string]int) map[string]int {
	out := map[string]int{}
	for k, v := range m {
		if v != 0 {
			out[k] = v
		}
	}
	return out
}

// An invoice is deferred as a bill is, on the A/R side; a customer payment's
// unapplied credit counts on its own date.
func TestCashBasis_InvoicePaidWithUnappliedCredit(t *testing.T) {
	pe := newPaymentEnv(t)
	inv := pe.postedInvoice(t, pe.customer, 100000)
	invEntry := inv.GetString("entry")
	invDay := inv.GetString("date")
	number := inv.GetString("number")

	requireCashRows(t, "the invoice's taken-out rows", takenOutRows(t, pe.app, "invoice", inv.Id), []cashRow{
		{kind: "invoice", account: pe.revenue.Id, debit: 100000, date: invDay, memo: unpaidInvoiceMemo, entry: invEntry},
		{kind: "invoice", account: pe.receivable.Id, credit: 100000, date: invDay, memo: unpaidInvoiceMemo, entry: invEntry},
	})

	p := pe.mkPayment(t, map[string]any{"amount": 45000, "deposit_to": pe.checking.Id})
	mkApplication(t, pe.app, p, inv, 0, 40000)
	posted := mustPostPayment(t, pe.app, p.Id, pe.users.bookkeeper.Id)
	payEntry := posted.GetString("entry")

	requireCashRows(t, "the payment's share of the invoice", shareRows(t, pe.app, payEntry), []cashRow{
		{kind: "invoice", account: pe.revenue.Id, credit: 40000, date: paymentTestDay, memo: invoicePaidMemo(number), entry: payEntry, paymentEntry: payEntry},
		{kind: "invoice", account: pe.receivable.Id, debit: 40000, date: paymentTestDay, memo: invoicePaidMemo(number), entry: payEntry, paymentEntry: payEntry},
	})
	// 450.00 received: 400.00 of the invoice's income, and 50.00 of credit that
	// stays on A/R on the payment's day.
	if got, want := cashNet(t, pe.app), map[string]int{
		pe.checking.Id: 45000, pe.revenue.Id: -40000, pe.receivable.Id: -5000,
	}; !reflect.DeepEqual(got, want) {
		t.Errorf("cash basis after the payment = %v, want %v", got, want)
	}
	requireCashRowsBalancePerDate(t, pe.app)
	requireNoCashDrift(t, pe.app)

	if err := voidPaymentAs(pe.app, posted.Id, pe.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the customer payment: %v", err)
	}
	if rows := shareRows(t, pe.app, payEntry); len(rows) != 0 {
		t.Errorf("the voided customer payment still has share rows %+v", rows)
	}
	if got := cashNet(t, pe.app); len(got) != 0 {
		t.Errorf("cash basis after the payment is voided = %v, want nothing", got)
	}
	requireNoCashDrift(t, pe.app)
}

// cashBook builds a book through the write paths: the cashDay1 bill paid 400.00
// then voided and paid again, a second bill paid in full, and an unpaid bill.
func cashBook(t *testing.T) *cashBillEnv {
	t.Helper()
	ce := newCashBillEnv(t)
	voided := ce.payOn(t, ce.summit, cashDay2, payLine{ce.bill, 40000})
	if err := voidBillPaymentAs(ce.app, voided.Id, ce.users.bookkeeper.Id); err != nil {
		t.Fatalf("void a payment: %v", err)
	}
	ce.payOn(t, ce.summit, cashDay3, payLine{ce.bill, 25000})
	second := ce.postedBillOn(t, ce.officeSupply, cashDay2, billAmount{ce.office, 12345})
	ce.payOn(t, ce.officeSupply, cashDay3, payLine{second, 12345})
	ce.postedBillOn(t, ce.officeSupply, cashDay3, billAmount{ce.software, 999})
	return ce
}

func TestRebuildCashBasis_MatchesTheIncrementalRows(t *testing.T) {
	ce := cashBook(t)
	before := cashRowsOf(t, ce.app, nil)
	if len(before) == 0 {
		t.Fatal("the book has no cash-basis rows")
	}

	n, err := rebuildCashBasis(ce.app)
	if err != nil {
		t.Fatalf("rebuildCashBasis: %v", err)
	}
	if n != 0 {
		t.Errorf("rebuildCashBasis on a book built through the write paths = %d changes, want 0", n)
	}
	requireCashRows(t, "the rows after a rebuild", cashRowsOf(t, ce.app, nil), before)
	requireNoCashDrift(t, ce.app)

	recs, err := ce.app.FindAllRecords(cashLinesCol, dbx.HashExp{"bill": ce.bill.Id, "payment_entry": ""})
	if err != nil || len(recs) == 0 {
		t.Fatalf("read a taken-out row of the bill: %d rows, err %v", len(recs), err)
	}
	if _, err := ce.app.DB().NewQuery("DELETE FROM books_cash_basis_lines WHERE id = {:id}").
		Bind(dbx.Params{"id": recs[0].Id}).Execute(); err != nil {
		t.Fatalf("delete a cash-basis row: %v", err)
	}
	drifts, err := verifyCashBasis(ce.app)
	if err != nil {
		t.Fatalf("verifyCashBasis: %v", err)
	}
	if len(drifts) == 0 {
		t.Error("verifyCashBasis reports no drift after a row was deleted")
	}

	n, err = rebuildCashBasis(ce.app)
	if err != nil {
		t.Fatalf("rebuildCashBasis: %v", err)
	}
	if n != 1 {
		t.Errorf("rebuildCashBasis after one row was deleted = %d changes, want 1", n)
	}
	requireCashRows(t, "the rows after the rebuild restored the deleted one", cashRowsOf(t, ce.app, nil), before)
	requireNoCashDrift(t, ce.app)
}

// The ledger rebuild (the admin's rebuild route) also rebuilds the cash rows.
func TestRebuildBalances_RebuildsTheCashRows(t *testing.T) {
	ce := cashBook(t)
	before := cashRowsOf(t, ce.app, nil)
	if len(cashRowsOf(t, ce.app, dbx.HashExp{"bill": ce.bill.Id})) == 0 {
		t.Fatal("the bill has no cash-basis rows to delete")
	}
	if _, err := ce.app.DB().NewQuery("DELETE FROM books_cash_basis_lines WHERE bill = {:b}").
		Bind(dbx.Params{"b": ce.bill.Id}).Execute(); err != nil {
		t.Fatalf("delete the bill's cash-basis rows: %v", err)
	}
	if _, err := rebuildBalances(ce.app); err != nil {
		t.Fatalf("rebuildBalances: %v", err)
	}
	requireCashRows(t, "the rows after rebuildBalances", cashRowsOf(t, ce.app, nil), before)
}

// The refund payer of a vendor credit sets its own memo on the rows it brings
// back; a bill paid on the same day keeps "Bill <n> paid (cash basis)" on the
// rows its payment brings back (the invoice's "Invoice <n> paid (cash basis)"
// is pinned by TestCashBasis_InvoicePaidWithUnappliedCredit).
func TestCashBasis_ABillPaidBesideARefundKeepsItsMemo(t *testing.T) {
	re := newRefundCashBook(t)
	bill := re.postedBillOn(t, re.pacificPower, billDay, billAmount{re.designTools, 10000})
	credit := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 5000})
	payment := re.payOn(t, re.pacificPower, refundDay, payLine{bill, 4000})
	refund := re.refund(t, nil, refundLine{credit, 5000})
	payEntry, refundEntry := payment.GetString("entry"), refund.GetString("entry")

	requireCashRows(t, "the bill's rows the payment brought back", shareRows(t, re.app, payEntry), []cashRow{
		{kind: "bill", account: re.designTools.Id, debit: 4000, date: refundDay, memo: billPaidMemo(bill.GetString("number")), entry: payEntry, paymentEntry: payEntry},
		{kind: "bill", account: re.payable.Id, credit: 4000, date: refundDay, memo: billPaidMemo(bill.GetString("number")), entry: payEntry, paymentEntry: payEntry},
	})
	requireCashRows(t, "the credit's rows the refund brought back", shareRows(t, re.app, refundEntry), []cashRow{
		{kind: "vendor_credit", account: re.rent.Id, credit: 5000, date: refundDay, memo: creditRefundedMemo(credit.GetString("number")), entry: refundEntry, paymentEntry: refundEntry},
		{kind: "vendor_credit", account: re.payable.Id, debit: 5000, date: refundDay, memo: creditRefundedMemo(credit.GetString("number")), entry: refundEntry, paymentEntry: refundEntry},
	})
	requireCashRowsBalancePerDate(t, re.app)
	requireNoCashDrift(t, re.app)
}

// A deposit is not a deferred kind: its entry counts as posted on the cash
// basis, so the bank reads the deposit's total there too, and the deposit
// writes no cash-basis row of its own.
func TestCashBasis_ADepositCountsAsPosted(t *testing.T) {
	src := depositSourcePosters["payment"](t)
	d := src.depositOf(t)
	if _, deferred := cashDeferralOf(depositsCol); deferred {
		t.Error("books_deposits is a deferred kind of the cash basis")
	}
	if rows := cashRowsOf(t, src.app, dbx.HashExp{"entry": d.GetString("entry")}); len(rows) != 0 {
		t.Errorf("the deposit's entry has cash-basis rows %+v, want none", rows)
	}
	if rows := cashRowsOf(t, src.app, dbx.HashExp{"payment_entry": d.GetString("entry")}); len(rows) != 0 {
		t.Errorf("the deposit's entry brought back cash-basis rows %+v, want none", rows)
	}
	net := cashNet(t, src.app)
	if got := net[src.bank.Id]; got != 55000 {
		t.Errorf("the bank's cash-basis net = %d, want the deposit total 55000", got)
	}
	if got := net[src.undeposited.Id]; got != 0 {
		t.Errorf("Undeposited funds' cash-basis net = %d, want 0 after the deposit", got)
	}
	requireNoCashDrift(t, src.app)
}
