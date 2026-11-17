package books

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/reports"
)

// The credit memo's post, void and correction (spec §3.4-§3.7): the mirror of
// an invoice's entry, a negated tax snapshot, and a balance the server writes.

// denverMemo saves a draft credit memo with the Denver combined rate and two
// taxable Item lines on two income accounts: Monthly bookkeeping 1 x 60000 on
// 4000 Consulting Income and Wireless access point 2 x 20000 on 4100 Hardware
// sales. Taxable 100000: state 2.9% 2900, RTD 1% 1000, city 4.81% 4810;
// total 108710.
func (ce *creditMemoEnv) denverMemo(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{"tax_rate": ce.denver.Id, "memo": "Returned hardware"}
	for k, v := range fields {
		all[k] = v
	}
	memo := ce.mkCreditMemo(t, all)
	mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, 60000, true))
	mkCreditMemoLine(t, ce.app, memo, 1, item(ce.accessPoint, 2, 20000, true))
	requireCreditMemoTotals(t, ce.app, memo.Id, 100000, 8710, 108710)
	return memo
}

func nextCreditMemoNumber(t testing.TB, app core.App) int {
	t.Helper()
	return reload(t, app, "books_doc_sequences", creditMemoSequenceID).GetInt("next_number")
}

// requireCreditMemoNotPosted checks that a refused post wrote nothing: the memo
// is a draft with no number, entry or stamp and balance 0, no entry names it,
// it has no tax lines, and the credit memo sequence did not move.
func requireCreditMemoNotPosted(t testing.TB, app core.App, memoID string, nextNumber int) {
	t.Helper()
	memo := reload(t, app, "books_credit_memos", memoID)
	if memo.GetString("status") != statusDraft || memo.GetString("number") != "" || memo.GetString("entry") != "" ||
		memo.GetString("posted_at") != "" || memo.GetInt("balance") != 0 {
		t.Errorf("credit memo after a refused post: status %q number %q entry %q posted_at %q balance %d, want a draft with none",
			memo.GetString("status"), memo.GetString("number"), memo.GetString("entry"), memo.GetString("posted_at"), memo.GetInt("balance"))
	}
	if n, err := app.CountRecords("books_journal_entries", dbx.HashExp{"document": memoID}); err != nil || n != 0 {
		t.Errorf("%d journal entries name the credit memo (err %v), want 0", n, err)
	}
	if n, err := app.CountRecords("books_credit_memo_tax_lines", dbx.HashExp{"credit_memo": memoID}); err != nil || n != 0 {
		t.Errorf("%d tax lines on the credit memo (err %v), want 0", n, err)
	}
	if got := nextCreditMemoNumber(t, app); got != nextNumber {
		t.Errorf("credit memo sequence next_number = %d after a refused post, want %d", got, nextNumber)
	}
}

func requireCreditMemoBalance(t testing.TB, app core.App, id string, want int) {
	t.Helper()
	if got := reload(t, app, "books_credit_memos", id).GetInt("balance"); got != want {
		t.Errorf("credit memo balance = %d, want %d", got, want)
	}
}

// requireNoDocumentDrift checks that every stored document balance equals what
// the server computes for it, the credit memo's included.
func requireNoDocumentDrift(t testing.TB, app core.App) {
	t.Helper()
	if drifts, err := verifyDocumentBalances(app); err != nil || len(drifts) != 0 {
		t.Fatalf("verifyDocumentBalances = %+v, err %v; want none", drifts, err)
	}
}

func TestCreditMemoPost_WritesTheMirrorEntry(t *testing.T) {
	ce := newCreditMemoEnv(t)
	actor := ce.users.bookkeeper.Id
	memo := ce.denverMemo(t, nil)

	posted := mustPostCreditMemo(t, ce.app, memo.Id, actor)
	if posted.GetString("status") != statusPosted || posted.GetString("number") != "1001" || posted.GetInt("sequence") != 1001 {
		t.Errorf("credit memo status %q number %q sequence %d, want posted, 1001, 1001",
			posted.GetString("status"), posted.GetString("number"), posted.GetInt("sequence"))
	}
	if posted.GetString("posted_by") != actor || posted.GetString("posted_at") == "" {
		t.Errorf("credit memo posted_by %q posted_at %q, want the poster and a time", posted.GetString("posted_by"), posted.GetString("posted_at"))
	}
	if posted.GetInt("balance") != 108710 {
		t.Errorf("posted credit memo balance = %d, want its total 108710", posted.GetInt("balance"))
	}
	entryID := posted.GetString("entry")
	if entryID == "" {
		t.Fatal("the posted credit memo names no entry")
	}
	entry := reload(t, ce.app, "books_journal_entries", entryID)
	if got, want := [6]string{
		entry.GetString("status"), entry.GetString("doc_type"), entry.GetString("origin"),
		entry.GetString("document"), entry.GetString("number"), entry.GetString("date"),
	}, [6]string{statusPosted, docTypeCreditMemo, "document", memo.Id, "1001", creditMemoDay}; got != want {
		t.Errorf("entry status/doc_type/origin/document/number/date = %v, want %v", got, want)
	}
	if docTypeCreditMemo != "credit_memo" {
		t.Errorf("docTypeCreditMemo = %q, want credit_memo", docTypeCreditMemo)
	}

	// A/R credited first; each income account debited with its lines' sum, in
	// chart order; each tax component debited to its agency's liability.
	c := ce.customer.Id
	want := []entryLine{
		{account: ce.receivable.Id, credit: 108710, customer: c},
		{account: ce.revenue.Id, debit: 60000, customer: c},
		{account: ce.hardware.Id, debit: 40000, customer: c},
		{account: ce.stateTax.Id, debit: 2900, customer: c},
		{account: ce.rtdTax.Id, debit: 1000, customer: c},
		{account: ce.cityTax.Id, debit: 4810, customer: c},
	}
	got := entryLinesOf(t, ce.app, entryID)
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("entry lines =\n%v\nwant\n%v", got, want)
	}
	debits, credits := 0, 0
	for _, l := range got {
		debits += l.debit
		credits += l.credit
	}
	if debits != credits || debits != 108710 || entry.GetInt("total") != 108710 {
		t.Errorf("debits %d credits %d entry total %d, want 108710 each", debits, credits, entry.GetInt("total"))
	}
	requireNoDrift(t, ce.app)
	requireNoDocumentDrift(t, ce.app)

	t.Run("the next post gets 1002", func(t *testing.T) {
		second := ce.mkCreditMemo(t, nil)
		mkCreditMemoLine(t, ce.app, second, 0, item(ce.service, 1, 5000, false))
		if got := mustPostCreditMemo(t, ce.app, second.Id, actor); got.GetString("number") != "1002" || got.GetInt("sequence") != 1002 {
			t.Errorf("second credit memo number %q sequence %d, want 1002", got.GetString("number"), got.GetInt("sequence"))
		}
	})
}

func TestCreditMemoPost_AnAccountThatNetsBelowZeroTakesACredit(t *testing.T) {
	ce := newCreditMemoEnv(t)
	discounts := mkNumberedAccount(t, ce.app, "Sales discounts", "4900", "income", "discounts_refunds")
	promo, err := newProduct(ce.app, map[string]any{"type": "service", "name": "Promo discount", "income_account": discounts.Id})
	if err != nil {
		t.Fatalf("save the promo product: %v", err)
	}
	memo := ce.mkCreditMemo(t, nil)
	mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, 45000, false))
	mkCreditMemoLine(t, ce.app, memo, 1, percentLine(promo, -100000))
	requireCreditMemoTotals(t, ce.app, memo.Id, 40500, 0, 40500)

	posted := mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)
	c := ce.customer.Id
	want := []entryLine{
		{account: ce.receivable.Id, credit: 40500, customer: c},
		{account: ce.revenue.Id, debit: 45000, customer: c},
		{account: discounts.Id, credit: 4500, customer: c},
	}
	if got := entryLinesOf(t, ce.app, posted.GetString("entry")); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("entry lines =\n%v\nwant\n%v", got, want)
	}
}

type creditMemoTaxSnap struct {
	rate, component, agency, date string
	ppm, gross, taxable, amount   int
	position                      int
}

func TestCreditMemoPost_WritesANegatedTaxSnapshot(t *testing.T) {
	ce := newCreditMemoEnv(t)
	memo := ce.denverMemo(t, nil)
	mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)

	rows, err := ce.app.FindRecordsByFilter("books_credit_memo_tax_lines", "credit_memo = {:id}", "position", 0, 0, dbx.Params{"id": memo.Id})
	if err != nil {
		t.Fatalf("read the tax lines: %v", err)
	}
	want := []creditMemoTaxSnap{
		{ce.denver.Id, ce.state.Id, ce.stateDOR.Id, creditMemoDay, 29000, -100000, -100000, -2900, 0},
		{ce.denver.Id, ce.rtd.Id, ce.rtdAgency.Id, creditMemoDay, 10000, -100000, -100000, -1000, 1},
		{ce.denver.Id, ce.city.Id, ce.cityDept.Id, creditMemoDay, 48100, -100000, -100000, -4810, 2},
	}
	got := make([]creditMemoTaxSnap, len(rows))
	sum := 0
	for i, r := range rows {
		got[i] = creditMemoTaxSnap{
			r.GetString("rate"), r.GetString("component"), r.GetString("agency"), dayOf(r.GetString("date")),
			r.GetInt("rate_ppm"), r.GetInt("gross_amount"), r.GetInt("taxable_amount"), r.GetInt("amount"), r.GetInt("position"),
		}
		sum += r.GetInt("amount")
	}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("tax lines =\n%+v\nwant\n%+v", got, want)
	}
	if sum != -8710 {
		t.Errorf("tax line amounts sum to %d, want -8710 (the negated tax_total)", sum)
	}
}

// A memo whose taxable sum is below zero (a taxable Percent discount on a
// non-taxable item) while its total stays above zero posts, and its snapshot
// stores the negated figures: the taxable amount and each component's tax above
// zero, the gross (its subtotal) below zero. Lines: Monthly bookkeeping
// 1 x 50000 not taxable; a taxable -10% of it, -5000. Subtotal 45000, taxable
// -5000: state 2.9% -145, RTD 1% -50, city 4.81% -240.5 -> -241; tax -436,
// total 44564.
func TestCreditMemoPost_ANegativeTaxableSumStoresPositiveSnapshotFigures(t *testing.T) {
	ce := newCreditMemoEnv(t)
	memo := ce.mkCreditMemo(t, map[string]any{"tax_rate": ce.denver.Id})
	mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, 50000, false))
	discount := percentLine(ce.service, -100000)
	discount["taxable"] = true
	mkCreditMemoLine(t, ce.app, memo, 1, discount)
	requireCreditMemoTotals(t, ce.app, memo.Id, 45000, -436, 44564)

	posted := mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)
	if posted.GetString("status") != statusPosted || posted.GetInt("balance") != 44564 {
		t.Errorf("credit memo status %q balance %d, want posted, 44564", posted.GetString("status"), posted.GetInt("balance"))
	}

	rows, err := ce.app.FindRecordsByFilter("books_credit_memo_tax_lines", "credit_memo = {:id}", "position", 0, 0, dbx.Params{"id": memo.Id})
	if err != nil {
		t.Fatalf("read the tax lines: %v", err)
	}
	want := []creditMemoTaxSnap{
		{ce.denver.Id, ce.state.Id, ce.stateDOR.Id, creditMemoDay, 29000, -45000, 5000, 145, 0},
		{ce.denver.Id, ce.rtd.Id, ce.rtdAgency.Id, creditMemoDay, 10000, -45000, 5000, 50, 1},
		{ce.denver.Id, ce.city.Id, ce.cityDept.Id, creditMemoDay, 48100, -45000, 5000, 241, 2},
	}
	got := make([]creditMemoTaxSnap, len(rows))
	sum := 0
	for i, r := range rows {
		got[i] = creditMemoTaxSnap{
			r.GetString("rate"), r.GetString("component"), r.GetString("agency"), dayOf(r.GetString("date")),
			r.GetInt("rate_ppm"), r.GetInt("gross_amount"), r.GetInt("taxable_amount"), r.GetInt("amount"), r.GetInt("position"),
		}
		sum += r.GetInt("amount")
	}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("tax lines =\n%+v\nwant\n%+v", got, want)
	}
	if sum != 436 {
		t.Errorf("tax line amounts sum to %d, want 436 (the negated tax_total)", sum)
	}
	requireNoDrift(t, ce.app)
	requireNoDocumentDrift(t, ce.app)
}

// dayOf is the YYYY-MM-DD of a stored date, whether it is stored as a day or
// as a date-time.
func dayOf(stored string) string {
	if len(stored) >= 10 {
		return stored[:10]
	}
	return stored
}

func TestCreditMemoPost_RefusesZeroTotal(t *testing.T) {
	ce := newCreditMemoEnv(t)
	memo := ce.mkCreditMemo(t, nil)
	mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, 0, false))
	requireCreditMemoTotals(t, ce.app, memo.Id, 0, 0, 0)

	err := postCreditMemoAs(ce.app, memo.Id, ce.users.bookkeeper.Id)
	requireRefusalText(t, err, wantCreditMemoZeroTotal)
	requireCreditMemoNotPosted(t, ce.app, memo.Id, 1001)
}

func TestCreditMemoPost_RefusesInactiveCustomer(t *testing.T) {
	ce := newCreditMemoEnv(t)
	memo := ce.denverMemo(t, nil)
	if err := setCustomer(t, ce.app, ce.customer.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make the customer inactive: %v", err)
	}
	err := postCreditMemoAs(ce.app, memo.Id, ce.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "customer", wantCustomerInactive("Harborview Dental"))
	requireCreditMemoNotPosted(t, ce.app, memo.Id, 1001)
}

func TestCreditMemoPost_HonorsCloseDate(t *testing.T) {
	ce := newCreditMemoEnv(t)
	memo := ce.denverMemo(t, nil)
	setCloseDate(t, ce.app, creditMemoDay)

	err := postCreditMemoAs(ce.app, memo.Id, ce.users.bookkeeper.Id)
	requireRefusalText(t, err,
		"The books are closed through 2026-11-10. Ask a Books admin for a close-date override to post on 2026-11-10.")
	requireCreditMemoNotPosted(t, ce.app, memo.Id, 1001)
}

// A void writes a reversal of the same doc_type, keeps the number and sets the
// balance to 0; the General Ledger reads "Credit memo" on the memo's entry and
// "Void reversal of 1001" on its reversal.
func TestCreditMemoVoid_ReversesAndZeroesTheBalance(t *testing.T) {
	ce := newCreditMemoEnv(t)
	registerBooksSources(t)
	memo := ce.denverMemo(t, nil)
	entryID := mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id).GetString("entry")
	requireNoDocumentDrift(t, ce.app)

	if err := voidCreditMemoAs(ce.app, memo.Id, ce.users.admin.Id); err != nil {
		t.Fatalf("void the credit memo: %v", err)
	}
	voided := reload(t, ce.app, "books_credit_memos", memo.Id)
	if voided.GetString("status") != statusVoid || voided.GetString("number") != "1001" ||
		voided.GetString("voided_by") != ce.users.admin.Id || voided.GetString("voided_at") == "" {
		t.Errorf("credit memo status %q number %q voided_by %q voided_at %q, want void, 1001, the voider and a time",
			voided.GetString("status"), voided.GetString("number"), voided.GetString("voided_by"), voided.GetString("voided_at"))
	}
	requireCreditMemoBalance(t, ce.app, memo.Id, 0)
	rev := findReversal(t, ce.app, entryID)
	if got, want := [3]string{rev.GetString("origin"), rev.GetString("doc_type"), rev.GetString("number")},
		[3]string{originVoidReversal, "credit_memo", "1001"}; got != want {
		t.Errorf("reversal origin/doc_type/number = %v, want %v", got, want)
	}
	revLines := entryLinesOf(t, ce.app, rev.Id)
	if len(revLines) == 0 || revLines[0].account != ce.receivable.Id || revLines[0].debit != 108710 {
		t.Errorf("reversal lines %v, want line 1 a 108710 debit to 1100 Accounts receivable", revLines)
	}
	requireNoDrift(t, ce.app)
	requireNoDocumentDrift(t, ce.app)

	res := runGL(t, ce.app, ce.users.readOnly, map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")}, reports.Options{Today: glToday})
	type cols struct{ typ, number, name string }
	read := func(row reports.Row) cols {
		return cols{typ: textCell(t, row, "type"), number: textCell(t, row, "number"), name: textCell(t, row, "name")}
	}
	for _, w := range []struct {
		what  string
		entry string
		want  cols
	}{
		{"the credit memo's A/R line", entryID, cols{"Credit memo", "1001", "Harborview Dental"}},
		{"the void reversal's A/R line", rev.Id, cols{"Void reversal of 1001", "1001", "Harborview Dental"}},
	} {
		if got := read(lineRow(t, res, entryLineOn(t, ce.app, w.entry, ce.receivable))); got != w.want {
			t.Errorf("%s = %+v, want %+v", w.what, got, w.want)
		}
	}
}

func TestCreditMemoCorrection_KeepsTheNumberAndVoidsTheOriginal(t *testing.T) {
	ce := newCreditMemoEnv(t)
	actor := ce.users.bookkeeper.Id
	original := ce.denverMemo(t, nil)
	mustPostCreditMemo(t, ce.app, original.Id, actor)
	requireNoDocumentDrift(t, ce.app)

	correction := ce.mkCreditMemo(t, map[string]any{"replaces": original.Id, "memo": "Corrected"})
	mkCreditMemoLine(t, ce.app, correction, 0, item(ce.service, 1, 30000, false))
	posted := mustPostCreditMemo(t, ce.app, correction.Id, actor)
	if posted.GetString("number") != "1001" || posted.GetString("status") != statusPosted || posted.GetInt("balance") != 30000 {
		t.Errorf("correction number %q status %q balance %d, want 1001, posted, 30000",
			posted.GetString("number"), posted.GetString("status"), posted.GetInt("balance"))
	}
	after := reload(t, ce.app, "books_credit_memos", original.Id)
	if after.GetString("status") != statusVoid || after.GetString("replaced_by") != correction.Id || after.GetInt("balance") != 0 {
		t.Errorf("original status %q replaced_by %q balance %d, want void, the correction, 0",
			after.GetString("status"), after.GetString("replaced_by"), after.GetInt("balance"))
	}
	if got := nextCreditMemoNumber(t, ce.app); got != 1002 {
		t.Errorf("credit memo sequence next_number = %d after a correction, want 1002", got)
	}
	requireNoDrift(t, ce.app)
	requireNoDocumentDrift(t, ce.app)
}

func TestVerifyDocumentBalances_FindsAndRebuildFixesACreditMemoDrift(t *testing.T) {
	ce := newCreditMemoEnv(t)
	draft := ce.mkCreditMemo(t, nil)
	mkCreditMemoLine(t, ce.app, draft, 0, item(ce.service, 1, 5000, false))
	memo := ce.denverMemo(t, nil)
	mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)
	requireNoDocumentDrift(t, ce.app)

	for _, tc := range []struct {
		what string
		id   string
		want int
	}{
		{"a posted memo", memo.Id, 108710},
		{"a draft memo", draft.Id, 0},
	} {
		t.Run(tc.what, func(t *testing.T) {
			setDocumentBalanceRaw(t, ce.app, "books_credit_memos", tc.id, 1)
			drifts, err := verifyDocumentBalances(ce.app)
			if err != nil {
				t.Fatalf("verifyDocumentBalances: %v", err)
			}
			if len(drifts) != 1 || !strings.Contains(fmt.Sprintf("%+v", drifts[0]), tc.id) {
				t.Fatalf("drifts = %+v, want one that names credit memo %s", drifts, tc.id)
			}
			fixed, err := rebuildDocumentBalances(ce.app)
			if err != nil || fixed != 1 {
				t.Fatalf("rebuildDocumentBalances fixed %d, err %v; want 1", fixed, err)
			}
			requireCreditMemoBalance(t, ce.app, tc.id, tc.want)
			requireNoDocumentDrift(t, ce.app)
		})
	}
}

// Spec §3.6, Q1: a memo that names an invoice does not apply to it; the
// customer's open figure falls by the memo's total.
func TestCreditMemoPost_LeavesTheLinkedInvoiceAndLowersThePartyBalance(t *testing.T) {
	ce := newCreditMemoEnv(t)
	inv := ce.postedInvoiceFor(t, ce.customer, 200000)
	requireInvoiceBalance(t, ce.app, inv, 200000)
	before := partyBalances(t, ce.app)[ce.customer.Id]

	memo := ce.denverMemo(t, map[string]any{"invoice": inv.Id})
	mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)

	requireInvoiceBalance(t, ce.app, inv, 200000)
	if after := partyBalances(t, ce.app)[ce.customer.Id]; after != before-108710 {
		t.Errorf("Harborview Dental party balance = %d after the memo, want %d (%d less the memo's 108710)", after, before-108710, before)
	}
	requireNoDocumentDrift(t, ce.app)
}

// The Credit flag changes only the credit kind: an invoice with the memo's
// amounts posts its old sides and a positive tax snapshot.
func TestCreditMemoPost_AnInvoiceOfTheSameAmountsKeepsItsSides(t *testing.T) {
	ce := newCreditMemoEnv(t)
	inv, err := newInvoice(ce.app, ce.customer, map[string]any{"tax_rate": ce.denver.Id})
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	mkInvoiceLine(t, ce.app, inv, 0, item(ce.service, 1, 60000, true))
	mkInvoiceLine(t, ce.app, inv, 1, item(ce.accessPoint, 2, 20000, true))
	posted := mustPostInvoice(t, ce.app, inv.Id, ce.users.bookkeeper.Id)

	c := ce.customer.Id
	want := []entryLine{
		{account: ce.receivable.Id, debit: 108710, customer: c},
		{account: ce.revenue.Id, credit: 60000, customer: c},
		{account: ce.hardware.Id, credit: 40000, customer: c},
		{account: ce.stateTax.Id, credit: 2900, customer: c},
		{account: ce.rtdTax.Id, credit: 1000, customer: c},
		{account: ce.cityTax.Id, credit: 4810, customer: c},
	}
	if got := entryLinesOf(t, ce.app, posted.GetString("entry")); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("invoice entry lines =\n%v\nwant\n%v", got, want)
	}
	rows, err := ce.app.FindRecordsByFilter("books_invoice_tax_lines", "invoice = {:id}", "position", 0, 0, dbx.Params{"id": inv.Id})
	if err != nil {
		t.Fatalf("read the invoice tax lines: %v", err)
	}
	got := make([][3]int, len(rows))
	for i, r := range rows {
		got[i] = [3]int{r.GetInt("gross_amount"), r.GetInt("taxable_amount"), r.GetInt("amount")}
	}
	if want := [][3]int{{100000, 100000, 2900}, {100000, 100000, 1000}, {100000, 100000, 4810}}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("invoice tax lines gross/taxable/amount = %v, want %v", got, want)
	}
}
