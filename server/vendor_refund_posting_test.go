package books

import (
	"fmt"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/reports"
)

// Posting, correction and void of a vendor refund (vendor refund spec §3.6):
// the number comes from the vendor_refund sequence; the entry debits Refunded
// to for the amount and credits each Accounts payable account the refunded
// credits' entries debited; each credit's balance falls by its line; a
// correction takes its original's number and moves the lines; a void reverses
// the entry in the original period and gives the balances back.

// requireRefundNotPosted checks that a refused post wrote nothing: the refund
// is a draft with no number and no entry, the sequence did not move, and no
// vendor refund entry exists.
func requireRefundNotPosted(t testing.TB, app core.App, id string) {
	t.Helper()
	r := reload(t, app, refundsCol, id)
	if r.GetString("status") != statusDraft || r.GetString("number") != "" || r.GetString("entry") != "" {
		t.Errorf("refund status %q number %q entry %q after a refused post, want draft, none, none",
			r.GetString("status"), r.GetString("number"), r.GetString("entry"))
	}
	if got := nextRefundNumber(t, app); got != 1001 {
		t.Errorf("vendor refund sequence next_number = %d after a refused post, want 1001", got)
	}
	if n, err := app.CountRecords("books_journal_entries", dbx.HashExp{"doc_type": "vendor_refund"}); err != nil || n != 0 {
		t.Errorf("%d vendor refund entries stored (err %v), want 0", n, err)
	}
}

// payableDebitOf is the account of the credit entry's debit line (its Accounts
// payable line).
func payableDebitOf(t testing.TB, app core.App, credit *core.Record) string {
	t.Helper()
	for _, l := range entryLinesOf(t, app, reload(t, app, "books_vendor_credits", credit.Id).GetString("entry")) {
		if l.debit > 0 {
			return l.account
		}
	}
	return ""
}

// linesByAccount keys an entry's lines by account; it fails when two lines
// share one.
func linesByAccount(t testing.TB, lines []entryLine) map[string]entryLine {
	t.Helper()
	out := map[string]entryLine{}
	for _, l := range lines {
		if _, ok := out[l.account]; ok {
			t.Fatalf("two entry lines on account %s: %+v", l.account, lines)
		}
		out[l.account] = l
	}
	return out
}

func TestVendorRefundPost_WritesTheEntryTheNumberAndTheBalances(t *testing.T) {
	re := newRefundEnv(t)
	actor := re.users.bookkeeper.Id
	if got := nextRefundNumber(t, re.app); got != 1001 {
		t.Fatalf("a fresh book's vendor refund sequence next_number = %d, want 1001", got)
	}
	first := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 30000})
	second := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 12500})

	posted := re.refund(t, map[string]any{"memo": "Deposit returned"},
		refundLine{first, 10000}, refundLine{second, 5000})
	if posted.GetString("status") != statusPosted || posted.GetString("number") != "1001" {
		t.Errorf("refund status %q number %q, want posted 1001", posted.GetString("status"), posted.GetString("number"))
	}
	if posted.GetString("posted_by") != actor || posted.GetString("posted_at") == "" {
		t.Errorf("refund posted_by %q posted_at %q, want the poster and a time", posted.GetString("posted_by"), posted.GetString("posted_at"))
	}
	if got := nextRefundNumber(t, re.app); got != 1002 {
		t.Errorf("vendor refund sequence next_number = %d after the post, want 1002", got)
	}
	entryID := posted.GetString("entry")
	if entryID == "" {
		t.Fatal("the posted refund names no entry")
	}
	entry := reload(t, re.app, "books_journal_entries", entryID)
	if got, want := [6]string{
		entry.GetString("status"), entry.GetString("doc_type"), entry.GetString("origin"),
		entry.GetString("document"), dayOf(entry.GetString("date")), entry.GetString("memo"),
	}, [6]string{statusPosted, "vendor_refund", "document", posted.Id, refundDay, "Deposit returned"}; got != want {
		t.Errorf("entry status/doc_type/origin/document/date/memo = %v, want %v", got, want)
	}

	v := re.pacificPower.Id
	lines := entryLinesOf(t, re.app, entryID)
	if len(lines) != 2 {
		t.Fatalf("entry has %d lines, want 2 (Refunded to, Accounts payable): %+v", len(lines), lines)
	}
	byAccount := linesByAccount(t, lines)
	if got, want := byAccount[re.checking1000.Id], (entryLine{account: re.checking1000.Id, debit: 15000, vendor: v}); got != want {
		t.Errorf("Refunded to line = %+v, want %+v", got, want)
	}
	if got, want := byAccount[re.payable.Id], (entryLine{account: re.payable.Id, credit: 15000, vendor: v}); got != want {
		t.Errorf("Accounts payable line = %+v, want %+v", got, want)
	}
	requireBalancedEntry(t, lines)

	requireVendorCreditBalance(t, re.app, first.Id, 20000)
	requireVendorCreditBalance(t, re.app, second.Id, 7500)
	requireNoDrift(t, re.app)
	requireNoDocumentDrift(t, re.app)
}

// A refund over two credits whose entries debited two different Accounts
// payable accounts credits each account for the sum of its credits' lines.
func TestVendorRefundPost_CreditsEachPayableTheCreditsDebited(t *testing.T) {
	re := newRefundEnv(t)
	first := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 30000})
	// With 2000 inactive, the second credit debits 2010, the only active A/P
	// account; 2000 is active again before the refund posts.
	makeAccountInactive(t, re.app, re.payable)
	ap2010 := mkNumberedAccount(t, re.app, "Payables Clearing", "2010", "accounts_payable", "accounts_payable")
	second := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 12500})
	third := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 4000})
	if err := setFields(t, re.app, "books_accounts", re.payable.Id, map[string]any{"inactive": false}); err != nil {
		t.Fatalf("make 2000 active again: %v", err)
	}
	for credit, account := range map[*core.Record]*core.Record{first: re.payable, second: ap2010, third: ap2010} {
		if got := payableDebitOf(t, re.app, credit); got != account.Id {
			t.Fatalf("credit %s debits %s, want %s", credit.GetString("number"), got, account.GetString("number"))
		}
	}

	posted := re.refund(t, nil, refundLine{first, 10000}, refundLine{second, 5000}, refundLine{third, 2500})
	v := re.pacificPower.Id
	lines := entryLinesOf(t, re.app, posted.GetString("entry"))
	if len(lines) != 3 {
		t.Fatalf("entry has %d lines, want 3 (Refunded to, 2000, 2010): %+v", len(lines), lines)
	}
	byAccount := linesByAccount(t, lines)
	for _, w := range []entryLine{
		{account: re.checking1000.Id, debit: 17500, vendor: v},
		{account: re.payable.Id, credit: 10000, vendor: v},
		{account: ap2010.Id, credit: 7500, vendor: v},
	} {
		if got := byAccount[w.account]; got != w {
			t.Errorf("entry line on %s = %+v, want %+v", w.account, got, w)
		}
	}
	requireBalancedEntry(t, lines)
	requireNoDrift(t, re.app)
	requireNoDocumentDrift(t, re.app)
}

// postRefundCase is a draft refund of 150.00 with one line on a posted credit
// of 50.00 (Pacific Power, vendorCreditDay) for 50.00, and a second line on a
// credit of 100.00 for 100.00.
type postRefundCase struct {
	draft, small, large *core.Record
}

func newPostRefundCase(t *testing.T, re *refundEnv) postRefundCase {
	t.Helper()
	small := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 5000})
	large := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 10000})
	draft := re.mkRefund(t, map[string]any{"amount": 15000})
	mkRefundLine(t, re.app, draft, small, 0, 5000)
	mkRefundLine(t, re.app, draft, large, 1, 10000)
	return postRefundCase{draft: draft, small: small, large: large}
}

func TestVendorRefundPost_RefusesACreditVoidedSinceTheDraft(t *testing.T) {
	re := newRefundEnv(t)
	c := newPostRefundCase(t, re)
	if err := voidVendorCreditAs(re.app, c.small.Id, re.users.bookkeeper.Id); err != nil {
		t.Fatalf("void a credit that only a draft refund names: %v", err)
	}

	err := postRefundAs(re.app, c.draft.Id, re.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "lines.0", wantRefundNotOpen(c.small.GetString("number")))
	requireRefundNotPosted(t, re.app, c.draft.Id)
	requireVendorCreditBalance(t, re.app, c.large.Id, 10000)
}

func TestVendorRefundPost_RefusesALineAboveTheCreditsBalance(t *testing.T) {
	re := newRefundEnv(t)
	credit := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 5000})
	draft := re.mkRefund(t, map[string]any{"amount": 4000})
	mkRefundLine(t, re.app, draft, credit, 0, 4000)
	// Another refund takes 20.00 of the credit, so 30.00 is left.
	re.refund(t, nil, refundLine{credit, 2000})
	requireVendorCreditBalance(t, re.app, credit.Id, 3000)

	err := postRefundAs(re.app, draft.Id, re.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "lines.0", wantRefundAboveUnapplied(credit.GetString("number"), "$30.00"))
	r := reload(t, re.app, refundsCol, draft.Id)
	if r.GetString("status") != statusDraft || r.GetString("number") != "" || r.GetString("entry") != "" {
		t.Errorf("refund status %q number %q entry %q, want draft, none, none", r.GetString("status"), r.GetString("number"), r.GetString("entry"))
	}
	if got := nextRefundNumber(t, re.app); got != 1002 {
		t.Errorf("vendor refund sequence next_number = %d after a refused post, want 1002", got)
	}
	requireVendorCreditBalance(t, re.app, credit.Id, 3000)
}

func TestVendorRefundPost_RefusesACreditDatedAfterTheRefund(t *testing.T) {
	re := newRefundEnv(t)
	c := newPostRefundCase(t, re)
	// The refund date moves before the credits' date past every guard, so the
	// posting step itself must check it.
	if _, err := re.app.DB().NewQuery("UPDATE books_vendor_refunds SET date = {:d} WHERE id = {:id}").
		Bind(dbx.Params{"d": "2026-11-11 00:00:00.000Z", "id": c.draft.Id}).Execute(); err != nil {
		t.Fatalf("move the refund date: %v", err)
	}

	err := postRefundAs(re.app, c.draft.Id, re.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "lines.0", wantRefundCreditAfterRefund(c.small.GetString("number")))
	requireRefundNotPosted(t, re.app, c.draft.Id)
	requireVendorCreditBalance(t, re.app, c.small.Id, 5000)
	requireVendorCreditBalance(t, re.app, c.large.Id, 10000)
}

func TestVendorRefundPost_RefusesLinesThatDoNotAddUpToTheAmount(t *testing.T) {
	re := newRefundEnv(t)
	credit := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 30000})
	draft := re.mkRefund(t, map[string]any{"amount": 15000})
	mkRefundLine(t, re.app, draft, credit, 0, 13000)

	requireRefusalText(t, postRefundAs(re.app, draft.Id, re.users.bookkeeper.Id), wantRefundSumNotAmount)
	requireRefundNotPosted(t, re.app, draft.Id)
	requireVendorCreditBalance(t, re.app, credit.Id, 30000)

	empty := re.mkRefund(t, nil)
	requireRefusalText(t, postRefundAs(re.app, empty.Id, re.users.bookkeeper.Id), wantRefundSumNotAmount)
	requireRefundNotPosted(t, re.app, empty.Id)
}

func TestVendorRefundPost_RefusesAnInactiveVendorOrAccount(t *testing.T) {
	re := newRefundEnv(t)
	c := newPostRefundCase(t, re)
	makeVendorInactive(t, re.app, re.pacificPower)

	err := postRefundAs(re.app, c.draft.Id, re.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "vendor", "Pacific Power is inactive. Choose an active vendor.")
	requireRefundNotPosted(t, re.app, c.draft.Id)
	requireVendorCreditBalance(t, re.app, c.small.Id, 5000)

	if err := setFields(t, re.app, "books_vendors", re.pacificPower.Id, map[string]any{"inactive": false}); err != nil {
		t.Fatalf("make Pacific Power active again: %v", err)
	}
	makeAccountInactive(t, re.app, re.checking1000)
	err = postRefundAs(re.app, c.draft.Id, re.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "refunded_to", wantRefundAccountInactive("1000 Business Checking"))
	requireRefundNotPosted(t, re.app, c.draft.Id)
	requireVendorCreditBalance(t, re.app, c.small.Id, 5000)
	requireVendorCreditBalance(t, re.app, c.large.Id, 10000)
}

func TestVendorRefundPost_HonorsCloseDate(t *testing.T) {
	re := newRefundEnv(t)
	c := newPostRefundCase(t, re)
	setCloseDate(t, re.app, refundDay)

	requireRefusalText(t, postRefundAs(re.app, c.draft.Id, re.users.bookkeeper.Id), wantClosedThrough(refundDay))
	requireRefundNotPosted(t, re.app, c.draft.Id)
	requireVendorCreditBalance(t, re.app, c.small.Id, 5000)
	requireVendorCreditBalance(t, re.app, c.large.Id, 10000)
}

// A correction posts under its original's number, voids the original with
// replaced_by, reverses the original's entry in the original period, releases
// the original's lines before it applies its own.
func TestVendorRefundCorrection_TakesTheNumberAndMovesTheLines(t *testing.T) {
	re := newRefundEnv(t)
	first := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 30000})
	second := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 12500})
	original := re.refund(t, nil, refundLine{first, 30000})
	originalEntry := original.GetString("entry")
	requireVendorCreditBalance(t, re.app, first.Id, 0)

	// The correction may refund again what the original refunded.
	correction := re.refund(t, map[string]any{"replaces": original.Id, "date": "2026-11-20"},
		refundLine{first, 20000}, refundLine{second, 2500})

	if got, want := [3]any{correction.GetString("status"), correction.GetString("number"), correction.GetInt("amount")},
		[3]any{statusPosted, "1001", 22500}; got != want {
		t.Errorf("correction status/number/amount = %v, want %v", got, want)
	}
	if got := nextRefundNumber(t, re.app); got != 1002 {
		t.Errorf("vendor refund sequence next_number = %d after a correction, want 1002 (the number is kept)", got)
	}
	old := reload(t, re.app, refundsCol, original.Id)
	if old.GetString("status") != statusVoid || old.GetString("replaced_by") != correction.Id || old.GetString("number") != "1001" {
		t.Errorf("original status %q replaced_by %q number %q, want void, the correction, 1001",
			old.GetString("status"), old.GetString("replaced_by"), old.GetString("number"))
	}
	if s := reload(t, re.app, "books_journal_entries", originalEntry).GetString("status"); s != statusVoid {
		t.Errorf("the original's entry status %q, want void", s)
	}
	if got := dayOf(findReversal(t, re.app, originalEntry).GetString("date")); got != refundDay {
		t.Errorf("the original's reversal is dated %s, want the original's day %s", got, refundDay)
	}
	requireVendorCreditBalance(t, re.app, first.Id, 10000)
	requireVendorCreditBalance(t, re.app, second.Id, 10000)
	requireNoDrift(t, re.app)
	requireNoDocumentDrift(t, re.app)
}

// refuseRefund saves a draft refund with lines and posts it, and returns the
// first refusal: a correction may be refused when its draft is saved, when a
// line is saved, or when it posts.
func (re *refundEnv) refuseRefund(fields map[string]any, lines ...refundLine) error {
	var amount int64
	for _, l := range lines {
		amount += l.amount
	}
	all := map[string]any{"amount": amount}
	for k, v := range fields {
		all[k] = v
	}
	r, err := re.newRefund(all)
	if err != nil {
		return err
	}
	for i, l := range lines {
		if _, err := newRefundLine(re.app, r, l.credit, i, l.amount); err != nil {
			return err
		}
	}
	return postRefundAs(re.app, r.Id, re.users.bookkeeper.Id)
}

func TestVendorRefundCorrection_Refusals(t *testing.T) {
	re := newRefundEnv(t)
	credit := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 30000})
	officeCredit := re.postedCredit(t, re.officeSupply, vendorCreditDay, billAmount{re.rent, 30000})
	original := re.refund(t, nil, refundLine{credit, 10000})
	voided := re.refund(t, nil, refundLine{credit, 5000})
	if err := voidRefundAs(re.app, voided.Id, re.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the second refund: %v", err)
	}
	draft := re.mkRefund(t, map[string]any{"amount": 5000})
	mkRefundLine(t, re.app, draft, credit, 0, 5000)

	for _, c := range []struct {
		name   string
		fields map[string]any
		lines  []refundLine
		want   string
	}{
		{"another vendor", map[string]any{"replaces": original.Id, "vendor": re.officeSupply.Id},
			[]refundLine{{officeCredit, 10000}}, wantRefundCorrectionVendor},
		{"a draft original", map[string]any{"replaces": draft.Id}, []refundLine{{credit, 10000}}, wantRefundOnlyPostedEdits},
		{"a void original", map[string]any{"replaces": voided.Id}, []refundLine{{credit, 10000}}, wantRefundOnlyPostedEdits},
		{"a missing original", map[string]any{"replaces": "zzzzzzzzzzzzzzz"}, []refundLine{{credit, 10000}}, wantRefundEditMissing},
	} {
		t.Run(c.name, func(t *testing.T) {
			requireRefusalText(t, re.refuseRefund(c.fields, c.lines...), c.want)
			if s := reload(t, re.app, refundsCol, original.Id).GetString("status"); s != statusPosted {
				t.Errorf("original status %q after a refused correction, want posted", s)
			}
			requireVendorCreditBalance(t, re.app, credit.Id, 20000)
			requireVendorCreditBalance(t, re.app, officeCredit.Id, 30000)
			if got := nextRefundNumber(t, re.app); got != 1003 {
				t.Errorf("vendor refund sequence next_number = %d, want 1003", got)
			}
		})
	}
}

// A correction keeps its original's vendor, so it posts after that vendor
// became inactive.
func TestVendorRefundCorrection_PostsForAnInactiveVendor(t *testing.T) {
	re := newRefundEnv(t)
	credit := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 30000})
	original := re.refund(t, nil, refundLine{credit, 10000})
	makeVendorInactive(t, re.app, re.pacificPower)

	correction := re.refund(t, map[string]any{"replaces": original.Id}, refundLine{credit, 12000})
	if correction.GetString("status") != statusPosted || correction.GetString("number") != "1001" {
		t.Errorf("correction status %q number %q, want posted 1001", correction.GetString("status"), correction.GetString("number"))
	}
	requireVendorCreditBalance(t, re.app, credit.Id, 18000)
	for i, l := range entryLinesOf(t, re.app, correction.GetString("entry")) {
		if l.vendor != re.pacificPower.Id {
			t.Errorf("correction entry line %d vendor %q, want the original's vendor", i+1, l.vendor)
		}
	}
}

// A void writes the reversing entry in the original period (the General
// Ledger reads "Void reversal of 1001" on it), keeps the number and gives each
// credit its line back.
func TestVendorRefundVoid_ReversesAndRaisesTheBalances(t *testing.T) {
	re := newRefundEnv(t)
	registerBooksSources(t)
	first := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 30000})
	second := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 12500})
	posted := re.refund(t, nil, refundLine{first, 10000}, refundLine{second, 5000})
	entryID := posted.GetString("entry")

	if err := voidRefundAs(re.app, posted.Id, re.users.admin.Id); err != nil {
		t.Fatalf("void the refund: %v", err)
	}
	voided := reload(t, re.app, refundsCol, posted.Id)
	if voided.GetString("status") != statusVoid || voided.GetString("number") != "1001" ||
		voided.GetString("voided_by") != re.users.admin.Id || voided.GetString("voided_at") == "" {
		t.Errorf("refund status %q number %q voided_by %q voided_at %q, want void, 1001, the voider and a time",
			voided.GetString("status"), voided.GetString("number"), voided.GetString("voided_by"), voided.GetString("voided_at"))
	}
	if s := reload(t, re.app, "books_journal_entries", entryID).GetString("status"); s != statusVoid {
		t.Errorf("the refund's entry status %q, want void", s)
	}
	rev := findReversal(t, re.app, entryID)
	if got, want := [4]string{rev.GetString("origin"), rev.GetString("doc_type"), rev.GetString("number"), dayOf(rev.GetString("date"))},
		[4]string{originVoidReversal, "vendor_refund", "1001", refundDay}; got != want {
		t.Errorf("reversal origin/doc_type/number/date = %v, want %v", got, want)
	}
	requireVendorCreditBalance(t, re.app, first.Id, 30000)
	requireVendorCreditBalance(t, re.app, second.Id, 12500)
	requireNoDrift(t, re.app)
	requireNoDocumentDrift(t, re.app)

	res := runGL(t, re.app, re.users.readOnly, map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")}, reports.Options{Today: glToday})
	row := lineRow(t, res, entryLineOn(t, re.app, rev.Id, re.checking1000))
	if got, want := fmt.Sprint(textCell(t, row, "type"), " | ", textCell(t, row, "number"), " | ", textCell(t, row, "name")),
		"Void reversal of 1001 | 1001 | Pacific Power"; got != want {
		t.Errorf("the void reversal's Refunded to line type | number | name = %q, want %q", got, want)
	}
}
