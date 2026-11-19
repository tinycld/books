package books

import (
	"fmt"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The rules of a refund receipt's two source documents (spec §3.11, §3.12,
// Q13). Sales receipt: a correction moves the link of every refund that names
// the original, and is refused when it changes the customer while a draft or
// posted refund names it; a void keeps the links. Credit memo: a void is
// refused while a posted payout pays it out; a correction is refused below
// what posted payouts paid out, on a customer change, and when it is dated
// after the earliest posted payout; else every link and the posted payouts'
// credits rows move to the correction.

// The refusal texts of the source rules, as the client gets them.
const (
	wantSalesReceiptCorrectionRefunds = "Refund receipts are made from this sales receipt, so its customer cannot change."
	wantCreditMemoVoidRefunded        = "A refund receipt is recorded on this credit memo. Void the refund first."
	wantCreditMemoCorrectionCustomer  = "A refund receipt is recorded on this credit memo, so its customer cannot change."
	payoutLinkDay                     = "2026-11-15"
)

func wantCreditMemoCorrectionBelow(refunded string) string {
	return fmt.Sprintf("%s of this credit is refunded. Its total cannot be below that.", refunded)
}

func wantCreditMemoCorrectionDate(number, day string) string {
	return fmt.Sprintf("Refund receipt %s refunds this credit on %s. Date the credit memo on or before that day.", number, day)
}

// refundNamingReceipt saves a draft refund of the receipt's customer that
// names the receipt, with one line of amount, and the fields given.
func (rr *refundReceiptEnv) refundNamingReceipt(t testing.TB, receipt *core.Record, amount int64, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{"customer": receipt.GetString("customer"), "sales_receipt": receipt.Id}
	for k, v := range fields {
		all[k] = v
	}
	r := rr.mkRefundReceipt(t, all)
	mkRefundReceiptLine(t, rr.app, r, 0, item(rr.service, 1, amount, false))
	return reload(t, rr.app, refundReceiptsCollection, r.Id)
}

func (rr *refundReceiptEnv) postedRefundNamingReceipt(t testing.TB, receipt *core.Record, amount int64) *core.Record {
	t.Helper()
	r := rr.refundNamingReceipt(t, receipt, amount, nil)
	return mustPostRefundReceipt(t, rr.app, r.Id, rr.users.bookkeeper.Id)
}

func (rr *refundReceiptEnv) voidRefundNamingReceipt(t testing.TB, receipt *core.Record, amount int64) *core.Record {
	t.Helper()
	r := rr.postedRefundNamingReceipt(t, receipt, amount)
	if err := voidRefundReceiptAs(rr.app, r.Id, rr.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the refund receipt: %v", err)
	}
	return reload(t, rr.app, refundReceiptsCollection, r.Id)
}

// receiptCorrection saves a draft correction of original for customer (none
// when nil), deposited to 1000 Business Checking, with one line of total.
func (rr *refundReceiptEnv) receiptCorrection(t testing.TB, original, customer *core.Record, total int64) *core.Record {
	t.Helper()
	id := ""
	if customer != nil {
		id = customer.Id
	}
	draft := rr.mkReceipt(t, map[string]any{"replaces": original.Id, "customer": id, "deposit_to": rr.checking.Id})
	mkReceiptLine(t, rr.app, draft, 0, item(rr.service, 1, total, false))
	return draft
}

// memoCorrection saves a draft correction of the credit memo original, of
// Harborview Dental unless fields say otherwise, with one non-taxable line of
// total.
func (rr *refundReceiptEnv) memoCorrection(t testing.TB, original *core.Record, total int64, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{"replaces": original.Id, "date": payoutMemoDay, "memo": "Corrected credit"}
	for k, v := range fields {
		all[k] = v
	}
	draft := rr.mkCreditMemo(t, all)
	mkCreditMemoLine(t, rr.app, draft, 0, item(rr.service, 1, total, false))
	return draft
}

// requireOnlyRefundLinkChanged checks that the stored refund differs from
// before only in field (and the updated stamp and revision counter a save
// keeps): its status, entry, total and every other column are as they were.
func requireOnlyRefundLinkChanged(t testing.TB, app core.App, before *core.Record, field, want string) {
	t.Helper()
	after := reload(t, app, refundReceiptsCollection, before.Id)
	if got := after.GetString(field); got != want {
		t.Errorf("refund receipt %s (%s) %s = %q, want %q", before.Id, before.GetString("status"), field, got, want)
	}
	skip := map[string]bool{field: true, "updated": true, "revision": true}
	for name, was := range before.FieldsData() {
		if skip[name] {
			continue
		}
		if got, want := fmt.Sprint(after.Get(name)), fmt.Sprint(was); got != want {
			t.Errorf("refund receipt %s (%s) column %s = %s after the link moved, want %s",
				before.Id, before.GetString("status"), name, got, want)
		}
	}
}

// requireRefundUntouched checks that no column of the stored refund changed,
// its updated stamp included.
func requireRefundUntouched(t testing.TB, app core.App, before *core.Record) {
	t.Helper()
	after := reload(t, app, refundReceiptsCollection, before.Id)
	for name, was := range before.FieldsData() {
		if got, want := fmt.Sprint(after.Get(name)), fmt.Sprint(was); got != want {
			t.Errorf("refund receipt %s (%s) column %s = %s, want it untouched (%s)",
				before.Id, before.GetString("status"), name, got, want)
		}
	}
}

func requireRefundLink(t testing.TB, app core.App, refund *core.Record, field, want string) {
	t.Helper()
	if got := reload(t, app, refundReceiptsCollection, refund.Id).GetString(field); got != want {
		t.Errorf("refund receipt %s (%s) %s = %q, want %q", refund.Id, refund.GetString("status"), field, got, want)
	}
}

// receiptRefunds holds one posted sales receipt of Harborview Dental and a
// draft, a posted and a void refund that name it.
type receiptRefunds struct {
	receipt               *core.Record
	draft, posted, voided *core.Record
}

func (rr *refundReceiptEnv) threeRefundsOfAReceipt(t testing.TB) receiptRefunds {
	t.Helper()
	receipt := rr.postedReceiptFor(t, rr.customer, 45000)
	return receiptRefunds{
		receipt: receipt,
		draft:   rr.refundNamingReceipt(t, receipt, 10000, nil),
		posted:  rr.postedRefundNamingReceipt(t, receipt, 12000),
		voided:  rr.voidRefundNamingReceipt(t, receipt, 8000),
	}
}

func TestSalesReceiptCorrection_MovesEveryRefundLink(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	actor := rr.users.bookkeeper.Id
	m := rr.threeRefundsOfAReceipt(t)
	draft := rr.receiptCorrection(t, m.receipt, rr.customer, 50000)

	corrected := mustPostReceipt(t, rr.app, draft.Id, actor)
	if corrected.GetString("status") != statusPosted || corrected.GetString("number") != m.receipt.GetString("number") {
		t.Fatalf("correction status %q number %q, want posted with the original's number %q",
			corrected.GetString("status"), corrected.GetString("number"), m.receipt.GetString("number"))
	}
	if s := reload(t, rr.app, "books_sales_receipts", m.receipt.Id).GetString("status"); s != statusVoid {
		t.Errorf("original status %q, want void", s)
	}
	for _, refund := range []*core.Record{m.draft, m.posted, m.voided} {
		requireOnlyRefundLinkChanged(t, rr.app, refund, "sales_receipt", corrected.Id)
	}

	// The mark that let the move through is gone: a person's
	// sales_receipt-only change of the posted refund is refused as before.
	err := setFields(t, rr.app, refundReceiptsCollection, m.posted.Id, map[string]any{"sales_receipt": m.receipt.Id})
	requireRefusalText(t, err, wantRefundNotDraft)
	requireRefundLink(t, rr.app, m.posted, "sales_receipt", corrected.Id)
}

func TestSalesReceiptCorrection_RefusesAnotherCustomerWhileARefundNamesIt(t *testing.T) {
	cases := map[string]func(rr *refundReceiptEnv, t *testing.T, receipt *core.Record) []*core.Record{
		"a draft refund": func(rr *refundReceiptEnv, t *testing.T, receipt *core.Record) []*core.Record {
			return []*core.Record{rr.refundNamingReceipt(t, receipt, 10000, nil)}
		},
		"a posted refund": func(rr *refundReceiptEnv, t *testing.T, receipt *core.Record) []*core.Record {
			return []*core.Record{rr.postedRefundNamingReceipt(t, receipt, 12000)}
		},
		"a posted and a void refund": func(rr *refundReceiptEnv, t *testing.T, receipt *core.Record) []*core.Record {
			return []*core.Record{rr.postedRefundNamingReceipt(t, receipt, 12000), rr.voidRefundNamingReceipt(t, receipt, 8000)}
		},
	}
	for name, refundsOf := range cases {
		t.Run(name, func(t *testing.T) {
			rr := newRefundReceiptEnv(t)
			receipt := rr.postedReceiptFor(t, rr.customer, 45000)
			refunds := refundsOf(rr, t, receipt)
			draft := rr.receiptCorrection(t, receipt, rr.riverside, 45000)
			next := nextReceiptNumber(t, rr.app)

			err := postReceiptAs(rr.app, draft.Id, rr.users.bookkeeper.Id)
			requireFieldRefusal(t, err, "customer", wantSalesReceiptCorrectionRefunds)
			requireReceiptNotPosted(t, rr.app, draft.Id, next)
			if s := reload(t, rr.app, "books_sales_receipts", receipt.Id).GetString("status"); s != statusPosted {
				t.Errorf("original status %q after the refusal, want posted", s)
			}
			for _, refund := range refunds {
				requireRefundLink(t, rr.app, refund, "sales_receipt", receipt.Id)
			}
		})
	}
}

// Void refunds do not block a customer change: the correction posts and the
// void refund's link moves to it.
func TestSalesReceiptCorrection_AnotherCustomerPostsWithOnlyAVoidRefund(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	receipt := rr.postedReceiptFor(t, rr.customer, 45000)
	voided := rr.voidRefundNamingReceipt(t, receipt, 8000)
	draft := rr.receiptCorrection(t, receipt, rr.riverside, 45000)

	if err := postReceiptAs(rr.app, draft.Id, rr.users.bookkeeper.Id); err != nil {
		t.Fatalf("a correction of another customer with only a void refund was refused: %v", err)
	}
	corrected := reload(t, rr.app, "books_sales_receipts", draft.Id)
	if corrected.GetString("status") != statusPosted || corrected.GetString("customer") != rr.riverside.Id {
		t.Errorf("correction status %q customer %q, want posted for Riverside Clinic",
			corrected.GetString("status"), corrected.GetString("customer"))
	}
	requireOnlyRefundLinkChanged(t, rr.app, voided, "sales_receipt", corrected.Id)
}

// A void of the sales receipt keeps every link: the draft still saves a memo
// change, the posted refund is not touched.
func TestSalesReceiptVoid_KeepsEveryRefundLink(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	m := rr.threeRefundsOfAReceipt(t)

	if err := voidReceiptAs(rr.app, m.receipt.Id, rr.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the sales receipt: %v", err)
	}
	if s := reload(t, rr.app, "books_sales_receipts", m.receipt.Id).GetString("status"); s != statusVoid {
		t.Fatalf("sales receipt status %q, want void", s)
	}
	for _, refund := range []*core.Record{m.draft, m.posted, m.voided} {
		requireRefundLink(t, rr.app, refund, "sales_receipt", m.receipt.Id)
	}
	requireRefundUntouched(t, rr.app, m.posted)
	requireRefundUntouched(t, rr.app, m.voided)

	if err := setFields(t, rr.app, refundReceiptsCollection, m.draft.Id, map[string]any{"memo": "Kept after the void"}); err != nil {
		t.Fatalf("a memo edit of a draft whose sales receipt was voided was refused: %v", err)
	}
	after := reload(t, rr.app, refundReceiptsCollection, m.draft.Id)
	if after.GetString("memo") != "Kept after the void" || after.GetString("sales_receipt") != m.receipt.Id {
		t.Errorf("draft memo %q sales_receipt %q, want the new memo and the void receipt",
			after.GetString("memo"), after.GetString("sales_receipt"))
	}
}

// postedPayoutOn posts a payout of amount of memo dated day.
func (rr *refundReceiptEnv) postedPayoutOn(t testing.TB, memo *core.Record, amount int64, day string) *core.Record {
	t.Helper()
	r, _ := rr.draftPayout(t, memo, amount, map[string]any{"date": day})
	return mustPostRefundReceipt(t, rr.app, r.Id, rr.users.bookkeeper.Id)
}

// The payout memo of 134.67 (credit memo 1001) with a posted payout of 80.00
// dated payoutLinkDay (refund receipt 1001).
func (rr *refundReceiptEnv) memoWithAPayout(t testing.TB) (memo, payout *core.Record) {
	t.Helper()
	memo = rr.payoutMemo(t)
	payout = rr.postedPayoutOn(t, memo, 8000, payoutLinkDay)
	if payout.GetString("number") != "1001" {
		t.Fatalf("payout number %q, want 1001", payout.GetString("number"))
	}
	requireCreditMemoBalance(t, rr.app, memo.Id, 5467)
	return memo, payout
}

func TestCreditMemoVoid_RefusedWhileAPayoutIsPosted(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	actor := rr.users.bookkeeper.Id
	memo, payout := rr.memoWithAPayout(t)

	err := voidCreditMemoAs(rr.app, memo.Id, actor)
	requireMessageOnlyRefusal(t, err, wantCreditMemoVoidRefunded)
	after := reload(t, rr.app, "books_credit_memos", memo.Id)
	if after.GetString("status") != statusPosted || after.GetString("voided_at") != "" {
		t.Errorf("memo status %q voided_at %q after the refusal, want posted and no stamp",
			after.GetString("status"), after.GetString("voided_at"))
	}
	requireCreditMemoBalance(t, rr.app, memo.Id, 5467)
	requireNoDocumentDrift(t, rr.app)

	if err := voidRefundReceiptAs(rr.app, payout.Id, actor); err != nil {
		t.Fatalf("void the payout: %v", err)
	}
	if err := voidCreditMemoAs(rr.app, memo.Id, actor); err != nil {
		t.Fatalf("the memo's void after its payout was voided was refused: %v", err)
	}
	if s := reload(t, rr.app, "books_credit_memos", memo.Id).GetString("status"); s != statusVoid {
		t.Errorf("memo status %q, want void", s)
	}
	requireNoDrift(t, rr.app)
	requireNoDocumentDrift(t, rr.app)
}

func TestCreditMemoVoid_VoidsWithOnlyADraftRefund(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	memo := rr.payoutMemo(t)
	draft, _ := rr.draftPayout(t, memo, 5000, nil)

	if err := voidCreditMemoAs(rr.app, memo.Id, rr.users.bookkeeper.Id); err != nil {
		t.Fatalf("a memo with only a draft refund was refused its void: %v", err)
	}
	if s := reload(t, rr.app, "books_credit_memos", memo.Id).GetString("status"); s != statusVoid {
		t.Errorf("memo status %q, want void", s)
	}
	requireRefundLink(t, rr.app, draft, "credit_memo", memo.Id)
	requireNoDocumentDrift(t, rr.app)
}

func TestCreditMemoCorrection_RefusedWhileAPayoutIsPosted(t *testing.T) {
	cases := []struct {
		name   string
		total  int64
		fields func(rr *refundReceiptEnv) map[string]any
		check  func(t *testing.T, err error)
	}{
		{
			name: "a total below what the payouts paid out", total: 7999,
			fields: func(*refundReceiptEnv) map[string]any { return nil },
			check: func(t *testing.T, err error) {
				requireMessageOnlyRefusal(t, err, wantCreditMemoCorrectionBelow("$80.00"))
			},
		},
		{
			name: "another customer", total: 13467,
			fields: func(rr *refundReceiptEnv) map[string]any { return map[string]any{"customer": rr.riverside.Id} },
			check: func(t *testing.T, err error) {
				requireFieldRefusal(t, err, "customer", wantCreditMemoCorrectionCustomer)
			},
		},
		{
			name: "a date after the payout", total: 13467,
			fields: func(*refundReceiptEnv) map[string]any { return map[string]any{"date": "2026-11-16"} },
			check: func(t *testing.T, err error) {
				requireFieldRefusal(t, err, "date", wantCreditMemoCorrectionDate("1001", "Nov 15, 2026"))
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rr := newRefundReceiptEnv(t)
			memo, payout := rr.memoWithAPayout(t)
			draft := rr.memoCorrection(t, memo, tc.total, tc.fields(rr))
			next := nextCreditMemoNumber(t, rr.app)

			tc.check(t, postCreditMemoAs(rr.app, draft.Id, rr.users.bookkeeper.Id))
			requireCreditMemoNotPosted(t, rr.app, draft.Id, next)
			if s := reload(t, rr.app, "books_credit_memos", memo.Id).GetString("status"); s != statusPosted {
				t.Errorf("original status %q after the refusal, want posted", s)
			}
			requireCreditMemoBalance(t, rr.app, memo.Id, 5467)
			requireRefundLink(t, rr.app, payout, "credit_memo", memo.Id)
			requireNoDocumentDrift(t, rr.app)
		})
	}
}

// A correction dated the payout's own day, of the same customer and above
// what was paid out, posts: the posted, the draft and the void refund name the
// correction, the posted payout's credits row names it, and the correction's
// balance is its total less the 80.00 paid out.
func TestCreditMemoCorrection_MovesEveryRefundLinkAndThePayout(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	actor := rr.users.bookkeeper.Id
	memo, payout := rr.memoWithAPayout(t)
	voided := rr.postedPayoutOn(t, memo, 2000, "2026-11-16")
	if err := voidRefundReceiptAs(rr.app, voided.Id, actor); err != nil {
		t.Fatalf("void the second payout: %v", err)
	}
	voided = reload(t, rr.app, refundReceiptsCollection, voided.Id)
	draft, _ := rr.draftPayout(t, memo, 1000, nil)
	draft = reload(t, rr.app, refundReceiptsCollection, draft.Id)
	requireCreditMemoBalance(t, rr.app, memo.Id, 5467)

	correction := rr.memoCorrection(t, memo, 12000, map[string]any{"date": payoutLinkDay})
	posted := mustPostCreditMemo(t, rr.app, correction.Id, actor)
	if posted.GetString("status") != statusPosted || posted.GetString("number") != "1001" {
		t.Fatalf("correction status %q number %q, want posted, 1001", posted.GetString("status"), posted.GetString("number"))
	}
	if s := reload(t, rr.app, "books_credit_memos", memo.Id).GetString("status"); s != statusVoid {
		t.Errorf("original status %q, want void", s)
	}
	for _, refund := range []*core.Record{payout, draft, voided} {
		requireOnlyRefundLinkChanged(t, rr.app, refund, "credit_memo", correction.Id)
	}
	credits, err := rr.app.FindAllRecords(refundReceiptCreditsCollection, dbx.HashExp{"refund_receipt": payout.Id})
	if err != nil || len(credits) != 1 || credits[0].GetString("credit_memo") != correction.Id || credits[0].GetInt("amount") != 8000 {
		t.Errorf("the posted payout's credits rows %v (err %v), want one of 8000 naming the correction", credits, err)
	}
	requireCreditMemoBalance(t, rr.app, correction.Id, 12000-8000)
	requireNoDocumentDrift(t, rr.app)
	requireNoCashDrift(t, rr.app)

	refunded := creditMemoRefundedMemo("1001")
	onCorrection := cashRowsOf(t, rr.app, dbx.HashExp{"credit_memo": correction.Id, "memo": refunded})
	if len(onCorrection) == 0 {
		t.Errorf("no cash rows %q name the correction, want the payout's share brought back on it", refunded)
	}
	for _, row := range onCorrection {
		if row.paymentEntry != payout.GetString("entry") {
			t.Errorf("cash row %+v of the correction names payment entry %q, want the payout's %q",
				row, row.paymentEntry, payout.GetString("entry"))
		}
	}
	if rows := cashRowsOf(t, rr.app, dbx.HashExp{"credit_memo": memo.Id, "memo": refunded}); len(rows) != 0 {
		t.Errorf("the void original still has cash rows %q: %+v, want them on the correction", refunded, rows)
	}

	// The mark that let the move through is gone.
	err = setFields(t, rr.app, refundReceiptsCollection, payout.Id, map[string]any{"credit_memo": memo.Id})
	requireRefusalText(t, err, wantRefundNotDraft)
	requireRefundLink(t, rr.app, payout, "credit_memo", correction.Id)
	err = setFields(t, rr.app, refundReceiptsCollection, draft.Id, map[string]any{"credit_memo": memo.Id})
	requireRefusalText(t, err, wantRefundPayoutStays)
	requireRefundLink(t, rr.app, draft, "credit_memo", correction.Id)
}

// A correction dated the payout's day passes the date rule (on or before).
func TestCreditMemoCorrection_DatedThePayoutsDayPosts(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	memo, payout := rr.memoWithAPayout(t)
	correction := rr.memoCorrection(t, memo, 13467, map[string]any{"date": payoutLinkDay})

	if err := postCreditMemoAs(rr.app, correction.Id, rr.users.bookkeeper.Id); err != nil {
		t.Fatalf("a correction dated the payout's day was refused: %v", err)
	}
	requireRefundLink(t, rr.app, payout, "credit_memo", correction.Id)
	requireCreditMemoBalance(t, rr.app, correction.Id, 13467-8000)
}

// The link move is no draft edit by a person: a draft whose Refund from
// account was made inactive after it was saved still moves to the correction.
func TestSourceCorrection_MovesADraftWhoseRefundFromWentInactive(t *testing.T) {
	t.Run("a sales receipt correction", func(t *testing.T) {
		rr := newRefundReceiptEnv(t)
		operating := mkNumberedAccount(t, rr.app, "Operating Checking", "1030", "bank", "checking")
		receipt := rr.postedReceiptFor(t, rr.customer, 45000)
		draft := rr.refundNamingReceipt(t, receipt, 10000, map[string]any{"refund_from": operating.Id})
		makeAccountInactive(t, rr.app, operating)
		correction := rr.receiptCorrection(t, receipt, rr.customer, 45000)

		if err := postReceiptAs(rr.app, correction.Id, rr.users.bookkeeper.Id); err != nil {
			t.Fatalf("the sales receipt correction was refused: %v", err)
		}
		requireOnlyRefundLinkChanged(t, rr.app, draft, "sales_receipt", correction.Id)
	})
	t.Run("a credit memo correction", func(t *testing.T) {
		rr := newRefundReceiptEnv(t)
		operating := mkNumberedAccount(t, rr.app, "Operating Checking", "1030", "bank", "checking")
		memo := rr.payoutMemo(t)
		draft, _ := rr.draftPayout(t, memo, 5000, map[string]any{"refund_from": operating.Id})
		draft = reload(t, rr.app, refundReceiptsCollection, draft.Id)
		makeAccountInactive(t, rr.app, operating)
		correction := rr.memoCorrection(t, memo, 13467, nil)

		if err := postCreditMemoAs(rr.app, correction.Id, rr.users.bookkeeper.Id); err != nil {
			t.Fatalf("the credit memo correction was refused: %v", err)
		}
		requireOnlyRefundLinkChanged(t, rr.app, draft, "credit_memo", correction.Id)
	})
}
