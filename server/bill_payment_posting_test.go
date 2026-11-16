package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/reports"
)

// postingPair posts two bills of 30000 and 40000 for Summit IT Services: the
// first credits 2000 Accounts Payable, the second 2010 Payables Clearing, a
// second A/P account (posting credits the first active A/P account in chart
// order, so 2010 exists alone when the second bill posts).
func postingPair(t *testing.T) (bp *billPayEnv, ap2000, ap2010, first, second *core.Record) {
	t.Helper()
	bp = newBillPayEnvWithoutPayable(t)
	ap2010 = mkNumberedAccount(t, bp.app, "Payables Clearing", "2010", "accounts_payable", "accounts_payable")
	second = bp.postedBill(t, bp.summit, 40000)
	ap2000 = mkNumberedAccount(t, bp.app, "Accounts Payable", "2000", "accounts_payable", "accounts_payable")
	bp.payable = ap2000
	first = bp.postedBill(t, bp.summit, 30000)
	for bill, account := range map[*core.Record]*core.Record{first: ap2000, second: ap2010} {
		if got := billCreditAccount(t, bp.app, bill); got != account.Id {
			t.Fatalf("bill %s credits %s, want %s", bill.GetString("number"), got, account.GetString("number"))
		}
	}
	return bp, ap2000, ap2010, first, second
}

// billCreditAccount is the account of the bill entry's credit line.
func billCreditAccount(t testing.TB, app core.App, bill *core.Record) string {
	t.Helper()
	for _, l := range entryLinesOf(t, app, reload(t, app, "books_bills", bill.Id).GetString("entry")) {
		if l.credit > 0 {
			return l.account
		}
	}
	return ""
}

func TestBillPaymentPost_WritesTheEntryAndTheBalances(t *testing.T) {
	bp, ap2000, ap2010, first, second := postingPair(t)

	p := bp.pay(t, bp.summit, nil, payLine{first, 30000}, payLine{second, 25000})
	entryID := p.GetString("entry")
	if entryID == "" {
		t.Fatal("the posted bill payment names no entry")
	}
	if n, err := bp.app.CountRecords("books_journal_entries", dbx.HashExp{"document": p.Id}); err != nil || n != 1 {
		t.Errorf("%d entries name the bill payment (err %v), want 1", n, err)
	}
	entry := reload(t, bp.app, "books_journal_entries", entryID)
	wantMemo := fmt.Sprintf("Payment of Bill %s, Bill %s", first.GetString("number"), second.GetString("number"))
	if got, want := [6]string{
		entry.GetString("status"), entry.GetString("doc_type"), entry.GetString("origin"),
		entry.GetString("document"), entry.GetString("number"), entry.GetString("memo"),
	}, [6]string{statusPosted, "bill_payment", "document", p.Id, "1001", wantMemo}; got != want {
		t.Errorf("entry status/doc_type/origin/document/number/memo = %v, want %v", got, want)
	}
	if got := entry.GetString("date"); got != billPayDay {
		t.Errorf("entry date %q, want %s", got, billPayDay)
	}
	v := bp.summit.Id
	want := []entryLine{
		{account: ap2000.Id, debit: 30000, vendor: v},
		{account: ap2010.Id, debit: 25000, vendor: v},
		{account: bp.checking1000.Id, credit: 55000, vendor: v},
	}
	if got := entryLinesOf(t, bp.app, entryID); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("entry lines =\n%v\nwant\n%v", got, want)
	}
	requireBillBalance(t, bp.app, first, 0)
	requireBillBalance(t, bp.app, second, 15000)
	requireNoDrift(t, bp.app)
}

// A void (posted → void, a bookkeeper's update) writes the void reversal in
// the original period, keeps the number and opens the bills again; the General
// Ledger reads Type "Bill payment" on the payment's line and "Void reversal of
// <n>" on its reversal's.
func TestBillPaymentVoid_ReversesKeepsTheNumberAndRestoresTheBalances(t *testing.T) {
	bp, _, _, first, second := postingPair(t)
	registerBooksSources(t)
	p := bp.pay(t, bp.summit, nil, payLine{first, 30000}, payLine{second, 25000})
	entryID := p.GetString("entry")

	if err := voidBillPaymentAs(bp.app, p.Id, bp.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the bill payment: %v", err)
	}
	voided := reload(t, bp.app, billPaymentsCol, p.Id)
	if voided.GetString("status") != statusVoid || voided.GetString("number") != "1001" ||
		voided.GetString("voided_by") != bp.users.bookkeeper.Id || voided.GetString("voided_at") == "" {
		t.Errorf("bill payment status %q number %q voided_by %q voided_at %q, want void, 1001, the bookkeeper and a time",
			voided.GetString("status"), voided.GetString("number"), voided.GetString("voided_by"), voided.GetString("voided_at"))
	}
	if s := reload(t, bp.app, "books_journal_entries", entryID).GetString("status"); s != statusVoid {
		t.Errorf("the payment's entry status %q, want void", s)
	}
	rev := findReversal(t, bp.app, entryID)
	if got, want := [4]string{rev.GetString("origin"), rev.GetString("doc_type"), rev.GetString("number"), rev.GetString("date")},
		[4]string{originVoidReversal, "bill_payment", "1001", billPayDay}; got != want {
		t.Errorf("reversal origin/doc_type/number/date = %v, want %v", got, want)
	}
	requireBillBalance(t, bp.app, first, 30000)
	requireBillBalance(t, bp.app, second, 40000)
	requireNoDrift(t, bp.app)

	res := runGL(t, bp.app, bp.users.readOnly, map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")}, reports.Options{Today: glToday})
	type cols struct{ typ, number, name string }
	read := func(row reports.Row) cols {
		return cols{typ: textCell(t, row, "type"), number: textCell(t, row, "number"), name: textCell(t, row, "name")}
	}
	for _, w := range []struct {
		what  string
		entry string
		want  cols
	}{
		{"the payment's Paid from line", entryID, cols{"Bill payment", "1001", "Summit IT Services"}},
		{"the void reversal's Paid from line", rev.Id, cols{"Void reversal of 1001", "1001", "Summit IT Services"}},
	} {
		if got := read(lineRow(t, res, entryLineOn(t, bp.app, w.entry, bp.checking1000))); got != w.want {
			t.Errorf("%s = %+v, want %+v", w.what, got, w.want)
		}
	}
}

func TestBillPaymentVoid_HonorsCloseDate(t *testing.T) {
	bp := newBillPayEnv(t)
	bill := bp.postedBill(t, bp.summit, 30000)
	p := bp.pay(t, bp.summit, nil, payLine{bill, 10000})
	setCloseDate(t, bp.app, billPayDay)

	requireRefusalText(t, voidBillPaymentAs(bp.app, p.Id, bp.users.bookkeeper.Id), wantClosedOnPayDay)
	if s := reload(t, bp.app, billPaymentsCol, p.Id).GetString("status"); s != statusPosted {
		t.Errorf("status %q after a refused void, want posted", s)
	}
	requireBillBalance(t, bp.app, bill, 20000)
}

// A correction posts under the original's number, releases the original's
// lines before it checks its own against the balances (so it may pay again
// what the original paid), applies its own, and voids the original with
// replaced_by.
func TestBillPaymentCorrection_TakesTheNumberAndMovesTheLines(t *testing.T) {
	bp := newBillPayEnv(t)
	first := bp.postedBill(t, bp.summit, 30000)
	second := bp.postedBill(t, bp.summit, 40000)
	original := bp.pay(t, bp.summit, nil, payLine{first, 30000})
	requireBillBalance(t, bp.app, first, 0)

	correction := bp.pay(t, bp.summit, map[string]any{"replaces": original.Id},
		payLine{first, 30000}, payLine{second, 10000})

	if got, want := [3]any{correction.GetString("status"), correction.GetString("number"), correction.GetInt("total")},
		[3]any{statusPosted, "1001", 40000}; got != want {
		t.Errorf("correction status/number/total = %v, want %v", got, want)
	}
	old := reload(t, bp.app, billPaymentsCol, original.Id)
	if old.GetString("status") != statusVoid || old.GetString("replaced_by") != correction.Id {
		t.Errorf("original status %q replaced_by %q, want void and the correction %q",
			old.GetString("status"), old.GetString("replaced_by"), correction.Id)
	}
	if s := reload(t, bp.app, "books_journal_entries", original.GetString("entry")).GetString("status"); s != statusVoid {
		t.Errorf("the original's entry status %q, want void", s)
	}
	if got := nextBillPaymentNumber(t, bp.app); got != 1002 {
		t.Errorf("bill payment sequence next_number = %d after a correction, want 1002 (the number is kept)", got)
	}
	requireBillBalance(t, bp.app, first, 0)
	requireBillBalance(t, bp.app, second, 30000)
	requireNoDrift(t, bp.app)
}

func TestBillPaymentCorrection_Refusals(t *testing.T) {
	bp := newBillPayEnv(t)
	summitBill := bp.postedBill(t, bp.summit, 30000)
	officeBill := bp.postedBill(t, bp.officeSupply, 30000)
	original := bp.pay(t, bp.summit, nil, payLine{summitBill, 10000})
	voided := bp.pay(t, bp.summit, nil, payLine{summitBill, 5000})
	if err := voidBillPaymentAs(bp.app, voided.Id, bp.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the second payment: %v", err)
	}

	cases := []struct {
		name  string
		body  map[string]any
		lines []payLine
		want  string
	}{
		{"another vendor", bp.payBody(bp.officeSupply, map[string]any{"replaces": original.Id}),
			[]payLine{{officeBill, 10000}}, wantBillPayCorrectionVndr},
		{"a void original", bp.payBody(bp.summit, map[string]any{"replaces": voided.Id}),
			[]payLine{{summitBill, 10000}}, wantBillPayOnlyPostedEdits},
		{"a missing original", bp.payBody(bp.summit, map[string]any{"replaces": "zzzzzzzzzzzzzzz"}),
			[]payLine{{summitBill, 10000}}, wantBillPayEditMissing},
		{"no line", bp.payBody(bp.summit, map[string]any{"replaces": original.Id}), nil, wantBillPaySelectOne},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			bp.batch(t, bp.users.bookkeeper, payOps(t, c.body, c.lines...)...).failure(t).requireMessage(t, c.want)
			requireBillPaymentCount(t, bp.app, 2)
			if s := reload(t, bp.app, billPaymentsCol, original.Id).GetString("status"); s != statusPosted {
				t.Errorf("original status %q after a refused correction, want posted", s)
			}
			requireBillBalance(t, bp.app, summitBill, 20000)
			requireBillBalance(t, bp.app, officeBill, 30000)
		})
	}
}

func TestCreate_BillPaymentEntryOverRESTIsRefused(t *testing.T) {
	bp := newBillPayEnv(t)
	status, body := bp.rest(t).send(t, bp.users.bookkeeper, http.MethodPost,
		"/api/collections/books_journal_entries/records",
		`{"date":"2026-11-10","doc_type":"bill_payment","status":"draft","origin":"manual"}`)
	if status != http.StatusBadRequest || !strings.Contains(body, wantBillPayEntryFromPost) {
		t.Errorf("a bill payment entry create = %d %s, want 400 with %q", status, body, wantBillPayEntryFromPost)
	}
	if n, _ := bp.app.CountRecords("books_journal_entries", dbx.HashExp{"doc_type": "bill_payment"}); n != 0 {
		t.Errorf("%d bill payment entries stored, want 0", n)
	}
}
