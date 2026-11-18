package books

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// A payout (spec §3.3, §4.3): a refund receipt that names a posted credit memo
// pays out its unapplied credit. It posts against Accounts receivable, writes
// no tax lines, writes one books_refund_receipt_credits row and lowers the
// memo's balance; its void and correction give the credit back.

// refundPayoutCase is one row of testdata/refund_payout_cases.json, which
// tests/refund-payout.test.ts runs against the client's payoutRefusal.
type refundPayoutCase struct {
	Name       string `json:"name"`
	Total      int64  `json:"total"`
	Unapplied  int64  `json:"unapplied"`
	MemoNumber string `json:"memoNumber"`
	MemoDate   string `json:"memoDate"`
	RefundDate string `json:"refundDate"`
	Currency   string `json:"currency"`
	Want       *struct {
		Field   string `json:"field"`
		Message string `json:"message"`
	} `json:"want"`
}

func TestRefundPayoutRefusal_CaseTable(t *testing.T) {
	src, err := os.ReadFile("testdata/refund_payout_cases.json")
	if err != nil {
		t.Fatalf("read the payout case table: %v", err)
	}
	var cases []refundPayoutCase
	if err := json.Unmarshal(src, &cases); err != nil {
		t.Fatalf("parse the payout case table: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("the payout case table is empty")
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			field, message := refundPayoutRefusal(c.Total, c.Unapplied, c.MemoNumber, c.MemoDate, c.RefundDate, c.Currency)
			wantField, wantMessage := "", ""
			if c.Want != nil {
				wantField, wantMessage = c.Want.Field, c.Want.Message
			}
			if field != wantField || message != wantMessage {
				t.Errorf("refundPayoutRefusal = (%q, %q), want (%q, %q)", field, message, wantField, wantMessage)
			}
		})
	}
}

const payoutMemoDay = "2026-11-12"

// payoutMemo posts a credit memo of 134.67 for Harborview Dental, dated
// payoutMemoDay, with two taxable lines under Denver combined: Monthly
// bookkeeping 1 x 10000 and Wireless access point 1 x 2388. Taxable 12388:
// state 2.9% 359.25 -> 359, RTD 1% 123.88 -> 124, city 4.81% 595.86 -> 596;
// tax 1079, total 13467. It is the env's first memo, so its number is 1001.
func (rr *refundReceiptEnv) payoutMemo(t testing.TB) *core.Record {
	t.Helper()
	memo := rr.mkCreditMemo(t, map[string]any{"date": payoutMemoDay, "tax_rate": rr.denver.Id})
	mkCreditMemoLine(t, rr.app, memo, 0, item(rr.service, 1, 10000, true))
	mkCreditMemoLine(t, rr.app, memo, 1, item(rr.accessPoint, 1, 2388, true))
	requireCreditMemoTotals(t, rr.app, memo.Id, 12388, 1079, 13467)
	posted := mustPostCreditMemo(t, rr.app, memo.Id, rr.users.bookkeeper.Id)
	if posted.GetString("number") != "1001" || posted.GetInt("balance") != 13467 {
		t.Fatalf("payout memo number %q balance %d, want 1001 and 13467", posted.GetString("number"), posted.GetInt("balance"))
	}
	return posted
}

// draftPayout saves a draft refund that pays out memo with one non-taxable
// line of amount, with the fields given over the default.
func (rr *refundReceiptEnv) draftPayout(t testing.TB, memo *core.Record, amount int64, fields map[string]any) (*core.Record, *core.Record) {
	t.Helper()
	all := map[string]any{"credit_memo": memo.Id, "memo": "Credit paid out"}
	for k, v := range fields {
		all[k] = v
	}
	r := rr.mkRefundReceipt(t, all)
	line := mkRefundReceiptLine(t, rr.app, r, 0, item(rr.service, 1, amount, false))
	return r, line
}

func (rr *refundReceiptEnv) postedPayout(t testing.TB, memo *core.Record, amount int64) *core.Record {
	t.Helper()
	r, _ := rr.draftPayout(t, memo, amount, nil)
	return mustPostRefundReceipt(t, rr.app, r.Id, rr.users.bookkeeper.Id)
}

func wantRefundAboveCredit(unapplied, number string) string {
	return fmt.Sprintf("The refund is more than the unapplied credit of %s on credit memo %s.", unapplied, number)
}

func TestRefundReceiptPayout_OfTheWholeCredit(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	memo := rr.payoutMemo(t)
	c := rr.customer.Id
	before := partyBalances(t, rr.app)[c]

	payout := rr.postedPayout(t, memo, 13467)
	if payout.GetString("status") != statusPosted || payout.GetString("number") != "1001" || payout.GetInt("total") != 13467 {
		t.Errorf("payout status %q number %q total %d, want posted, 1001, 13467",
			payout.GetString("status"), payout.GetString("number"), payout.GetInt("total"))
	}
	entry := reload(t, rr.app, "books_journal_entries", payout.GetString("entry"))
	if entry.GetString("doc_type") != "refund_receipt" {
		t.Errorf("payout entry doc_type %q, want refund_receipt", entry.GetString("doc_type"))
	}
	// Exactly two lines: Accounts receivable (the account the memo's entry
	// credited) debited, Refund from credited, both naming the customer.
	got := entryLinesOf(t, rr.app, entry.Id)
	if len(got) != 2 {
		t.Errorf("the payout's entry has %d lines %v, want exactly 2", len(got), got)
	}
	requireEntryLineSet(t, "payout entry lines", got, []entryLine{
		{account: rr.receivable.Id, debit: 13467, customer: c},
		{account: rr.checking.Id, credit: 13467, customer: c},
	})
	memoLines := entryLinesOf(t, rr.app, memo.GetString("entry"))
	if len(memoLines) == 0 || memoLines[0].account != rr.receivable.Id || memoLines[0].credit != 13467 {
		t.Errorf("the memo's entry lines %v, want its first line a 13467 credit to 1100 Accounts receivable", memoLines)
	}

	if n, err := rr.app.CountRecords("books_refund_receipt_tax_lines", dbx.HashExp{"refund_receipt": payout.Id}); err != nil || n != 0 {
		t.Errorf("%d tax lines on the payout (err %v), want 0", n, err)
	}
	credits, err := rr.app.FindAllRecords(refundReceiptCreditsCollection, dbx.HashExp{"refund_receipt": payout.Id})
	if err != nil {
		t.Fatalf("read the payout's credits rows: %v", err)
	}
	if len(credits) != 1 || credits[0].GetInt("amount") != 13467 || credits[0].GetString("credit_memo") != memo.Id ||
		credits[0].GetInt("position") != 0 {
		t.Errorf("credits rows %v, want one with amount 13467, the memo, position 0", credits)
	}
	requireCreditMemoBalance(t, rr.app, memo.Id, 0)
	if after := partyBalances(t, rr.app)[c]; after != before+13467 {
		t.Errorf("Harborview Dental party balance = %d after the payout, want %d (%d plus the payout's 13467)", after, before+13467, before)
	}
	if rows, err := rr.app.FindAllRecords("books_refund_receipt_sale_lines", dbx.HashExp{"refund_receipt": payout.Id}); err != nil || len(rows) != 0 {
		t.Errorf("the sale-lines view lists %d lines of the payout (err %v), want none", len(rows), err)
	}
	requireNoDrift(t, rr.app)
	requireNoDocumentDrift(t, rr.app)
}

func TestRefundReceiptPayout_OfPartAndASecondAboveTheRest(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	memo := rr.payoutMemo(t)

	rr.postedPayout(t, memo, 8000)
	requireCreditMemoBalance(t, rr.app, memo.Id, 5467)
	requireNoDocumentDrift(t, rr.app)

	second, _ := rr.draftPayout(t, memo, 5468, nil)
	err := postRefundReceiptAs(rr.app, second.Id, rr.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "credit_memo", wantRefundAboveCredit("$54.67", "1001"))
	requireRefundReceiptNotPosted(t, rr.app, second.Id, 1002)
	requireCreditMemoBalance(t, rr.app, memo.Id, 5467)
	requireNoDocumentDrift(t, rr.app)

	rest, _ := rr.draftPayout(t, memo, 5467, nil)
	mustPostRefundReceipt(t, rr.app, rest.Id, rr.users.bookkeeper.Id)
	requireCreditMemoBalance(t, rr.app, memo.Id, 0)
	requireNoDocumentDrift(t, rr.app)
}

func TestRefundReceiptPayout_RefusesADateBeforeTheMemo(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	memo := rr.payoutMemo(t)

	r, _ := rr.draftPayout(t, memo, 5000, map[string]any{"date": "2026-11-11"})
	err := postRefundReceiptAs(rr.app, r.Id, rr.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "date", "Date the refund on or after the credit memo's date, Nov 12, 2026.")
	requireRefundReceiptNotPosted(t, rr.app, r.Id, 1001)
	requireCreditMemoBalance(t, rr.app, memo.Id, 13467)
	requireNoDocumentDrift(t, rr.app)
}

func TestRefundReceiptPayout_RefusesAMemoVoidedSinceTheDraft(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	memo := rr.payoutMemo(t)
	r, _ := rr.draftPayout(t, memo, 5000, nil)
	if err := voidCreditMemoAs(rr.app, memo.Id, rr.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the credit memo: %v", err)
	}

	err := postRefundReceiptAs(rr.app, r.Id, rr.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "credit_memo", wantRefundCreditMemo)
	requireRefundReceiptNotPosted(t, rr.app, r.Id, 1001)
	requireNoDocumentDrift(t, rr.app)
}

// The memo is re-read at Post: a refund whose customer is not the memo's is
// refused. The customer is written past the hooks, as the link guard refuses
// that change on a save.
func TestRefundReceiptPayout_RefusesAMemoOfAnotherCustomer(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	memo := rr.payoutMemo(t)
	r, _ := rr.draftPayout(t, memo, 5000, nil)
	if _, err := rr.app.DB().NewQuery("UPDATE books_refund_receipts SET customer = {:c} WHERE id = {:id}").
		Bind(dbx.Params{"c": rr.riverside.Id, "id": r.Id}).Execute(); err != nil {
		t.Fatalf("set the refund's customer: %v", err)
	}

	err := postRefundReceiptAs(rr.app, r.Id, rr.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "credit_memo", wantRefundCreditMemo)
	requireRefundReceiptNotPosted(t, rr.app, r.Id, 1001)
	requireCreditMemoBalance(t, rr.app, memo.Id, 13467)
}

func TestRefundReceiptPayout_VoidGivesTheCreditBack(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	memo := rr.payoutMemo(t)
	payout := rr.postedPayout(t, memo, 8000)
	requireCreditMemoBalance(t, rr.app, memo.Id, 5467)

	if err := voidRefundReceiptAs(rr.app, payout.Id, rr.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the payout: %v", err)
	}
	if got := reload(t, rr.app, refundReceiptsCollection, payout.Id).GetString("status"); got != statusVoid {
		t.Errorf("payout status %q after the void, want void", got)
	}
	requireCreditMemoBalance(t, rr.app, memo.Id, 13467)
	credits, err := rr.app.FindAllRecords(refundReceiptCreditsCollection, dbx.HashExp{"refund_receipt": payout.Id})
	if err != nil || len(credits) != 1 || credits[0].GetInt("amount") != 8000 {
		t.Errorf("credits rows of the void payout %v (err %v), want its one row of 8000 kept", credits, err)
	}
	requireNoDrift(t, rr.app)
	requireNoDocumentDrift(t, rr.app)
}

// A payout's correction is capped by the memo's balance plus what the
// original pays out: 80.00 paid out of 134.67 leaves 54.67, so a correction to
// 140.00 is refused with a cap of 134.67 and one to 100.00 passes.
func TestRefundReceiptPayout_CorrectionCapIsTheBalancePlusTheOriginal(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	actor := rr.users.bookkeeper.Id
	memo := rr.payoutMemo(t)
	original := rr.postedPayout(t, memo, 8000)
	requireCreditMemoBalance(t, rr.app, memo.Id, 5467)

	correction, line := rr.draftPayout(t, memo, 14000, map[string]any{"replaces": original.Id, "memo": "Corrected payout"})
	err := postRefundReceiptAs(rr.app, correction.Id, actor)
	requireFieldRefusal(t, err, "credit_memo", wantRefundAboveCredit("$134.67", "1001"))
	requireRefundReceiptNotPosted(t, rr.app, correction.Id, 1002)
	if got := reload(t, rr.app, refundReceiptsCollection, original.Id).GetString("status"); got != statusPosted {
		t.Errorf("the original payout's status %q after a refused correction, want posted", got)
	}
	requireCreditMemoBalance(t, rr.app, memo.Id, 5467)
	requireNoDocumentDrift(t, rr.app)

	if err := setFields(t, rr.app, refundReceiptLinesCol, line.Id, map[string]any{"rate": 10000}); err != nil {
		t.Fatalf("lower the correction's line to 100.00: %v", err)
	}
	posted := mustPostRefundReceipt(t, rr.app, correction.Id, actor)
	if posted.GetString("number") != "1001" || posted.GetInt("total") != 10000 {
		t.Errorf("correction number %q total %d, want 1001 and 10000", posted.GetString("number"), posted.GetInt("total"))
	}
	if got := reload(t, rr.app, refundReceiptsCollection, original.Id); got.GetString("status") != statusVoid || got.GetString("replaced_by") != correction.Id {
		t.Errorf("original status %q replaced_by %q, want void and the correction", got.GetString("status"), got.GetString("replaced_by"))
	}
	requireCreditMemoBalance(t, rr.app, memo.Id, 13467-10000)
	if n, err := rr.app.CountRecords(refundReceiptsCollection, dbx.HashExp{"credit_memo": memo.Id, "status": statusPosted}); err != nil || n != 1 {
		t.Errorf("%d posted refunds name the memo (err %v), want 1", n, err)
	}
	credits, err := rr.app.FindAllRecords(refundReceiptCreditsCollection, dbx.HashExp{"refund_receipt": correction.Id})
	if err != nil || len(credits) != 1 || credits[0].GetInt("amount") != 10000 || credits[0].GetString("credit_memo") != memo.Id {
		t.Errorf("the correction's credits rows %v (err %v), want one of 10000 naming the memo", credits, err)
	}
	requireNoDrift(t, rr.app)
	requireNoDocumentDrift(t, rr.app)

	t.Run("a raw write of a wrong memo balance is found and repaired", func(t *testing.T) {
		setDocumentBalanceRaw(t, rr.app, "books_credit_memos", memo.Id, 1)
		drifts, err := verifyDocumentBalances(rr.app)
		if err != nil {
			t.Fatalf("verifyDocumentBalances: %v", err)
		}
		if len(drifts) != 1 || !strings.Contains(fmt.Sprintf("%+v", drifts[0]), memo.Id) {
			t.Fatalf("drifts = %+v, want one that names credit memo %s", drifts, memo.Id)
		}
		fixed, err := rebuildDocumentBalances(rr.app)
		if err != nil || fixed != 1 {
			t.Fatalf("rebuildDocumentBalances fixed %d, err %v; want 1", fixed, err)
		}
		requireCreditMemoBalance(t, rr.app, memo.Id, 13467-10000)
		requireNoDocumentDrift(t, rr.app)
	})
}
