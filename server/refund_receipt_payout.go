package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// A payout (refund receipt spec §3.3, §4.3) is a refund receipt that names a
// posted credit memo: it gives the customer the money of a credit they hold.
// It posts against Accounts receivable, not against income, writes no tax
// snapshot (the memo lowered income and tax already), and is a payer of the
// memo's balance: its post writes one books_refund_receipt_credits row of its
// total and lowers the memo's balance (applyToDocuments), its void and its
// correction give the credit back (releaseLines), and each rebuilds the memo's
// cash-basis rows, which bring back the payout's share at the refund date.
// A refund with no credit_memo passes every hook here unchanged.

// refundPayoutRefusal is the payout's rule on its total and its date, as the
// client's payoutRefusal (lib/refund-payout.ts); both run
// testdata/refund_payout_cases.json. The cap comes first: a total above the
// memo's unapplied credit (for a correction, the balance plus what its
// original paid out) is refused under credit_memo. Then a refund dated before
// the memo is refused under date. "", "" when both pass.
func refundPayoutRefusal(total, unapplied int64, memoNumber, memoDate, refundDate, currency string) (field, message string) {
	if total > unapplied {
		return "credit_memo", fmt.Sprintf(msgRefundAboveCredit, formatMoney(unapplied, currency), memoNumber)
	}
	if refundDate < memoDate {
		return "date", fmt.Sprintf(msgRefundBeforeCredit, formatDay(memoDate))
	}
	return "", ""
}

// payoutMemo re-reads, in tx, the credit memo a payout names, and refuses
// under credit_memo one that is gone, not posted, or another customer's.
func payoutMemo(tx core.App, doc *core.Record) (*core.Record, error) {
	memo, err := tx.FindRecordById(creditMemoBalanceKind.Collection, doc.GetString("credit_memo"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, refuseField("credit_memo", msgRefundCreditMemo)
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the payout's credit memo: %w", err)
	}
	if memo.GetString("status") != statusPosted || memo.GetString("customer") != doc.GetString("customer") {
		return nil, refuseField("credit_memo", msgRefundCreditMemo)
	}
	return memo, nil
}

// refundPayoutBeforePost re-reads the payout's memo inside the posting
// transaction and refuses one that is not posted or is another customer's.
// For a correction of a posted payout it gives the original's credit back
// first (releaseLines), so the memo's stored balance is the cap the
// correction's total is held to; the original's void (voidReplacedSalesDoc)
// does not run Withdraw, so the credit is given back once.
func refundPayoutBeforePost(tx core.App, doc *core.Record) error {
	if doc.GetString("credit_memo") != "" {
		if _, err := payoutMemo(tx, doc); err != nil {
			return err
		}
	}
	original, err := replacedPayout(tx, doc)
	if err != nil || original == nil {
		return err
	}
	return releaseLines(tx, creditMemoBalanceKind, original.Id)
}

// replacedPayout is the posted payout a correction replaces, nil for a refund
// that replaces none or whose original is no posted payout.
func replacedPayout(tx core.App, doc *core.Record) (*core.Record, error) {
	id := doc.GetString("replaces")
	if id == "" {
		return nil, nil
	}
	original, err := tx.FindRecordById(refundReceiptKind.Collection, id)
	if errors.Is(err, sql.ErrNoRows) {
		// postSalesDoc refuses a correction of a refund that is gone.
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the refund receipt being edited: %w", err)
	}
	if original.GetString("status") != statusPosted || original.GetString("credit_memo") == "" {
		return nil, nil
	}
	return original, nil
}

// refundPayoutPostingLines is the kind's PostingLines: nil, false for a plain
// refund, which posts the Credit kind's lines and tax snapshot. For a payout
// it holds the total to the memo's balance (the cap, after BeforePost gave a
// corrected original's credit back) and the date to the memo's date, writes
// the payout's credits row, lowers the memo's balance, and answers the two
// lines: a debit of the total to the Accounts receivable account the memo's
// entry credited, and a credit of the total to Refund from.
func refundPayoutPostingLines(tx core.App, doc *core.Record, totals documentTotalsResult) ([]postingLine, bool, error) {
	if doc.GetString("credit_memo") == "" {
		return nil, false, nil
	}
	memo, err := payoutMemo(tx, doc)
	if err != nil {
		return nil, false, err
	}
	field, message := refundPayoutRefusal(totals.Total, int64(memo.GetInt("balance")), memo.GetString("number"),
		memo.GetString("date"), doc.GetString("date"), memo.GetString("currency"))
	if field != "" {
		return nil, false, refuseField(field, "%s", message)
	}
	receivable, err := memoReceivableAccount(tx, memo)
	if err != nil {
		return nil, false, err
	}
	if err := writePayoutCredit(tx, doc, memo, totals.Total); err != nil {
		return nil, false, err
	}
	if err := applyToDocuments(tx, creditMemoBalanceKind, doc.Id); err != nil {
		return nil, false, err
	}
	return []postingLine{
		{Account: receivable, Debit: totals.Total},
		{Account: doc.GetString("refund_from"), Credit: totals.Total},
	}, true, nil
}

// memoReceivableAccount is the Accounts receivable account the memo's posted
// entry credited for its total: its first credit line on an accounts
// receivable account. The payout debits the same account, so the customer's
// receivable the memo lowered rises by what is paid out.
func memoReceivableAccount(tx core.App, memo *core.Record) (string, error) {
	var row struct {
		Account string `db:"account"`
	}
	err := tx.DB().NewQuery(`
		SELECT l.account AS account
		FROM books_journal_lines l
		JOIN books_accounts a ON a.id = l.account
		WHERE l.entry = {:entry} AND a.type = 'accounts_receivable' AND l.credit > 0
		ORDER BY l.position, l.id
		LIMIT 1`).
		Bind(dbx.Params{"entry": memo.GetString("entry")}).One(&row)
	if errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("books: credit memo %s has no Accounts receivable line in its entry", memo.Id)
	}
	if err != nil {
		return "", fmt.Errorf("books: read the Accounts receivable line of credit memo %s: %w", memo.Id, err)
	}
	return row.Account, nil
}

// writePayoutCredit writes the payout's one credits row: the memo it pays out
// and its total, at position 0. A correction writes its own row; its original
// keeps its row, which no longer counts once the original is void.
func writePayoutCredit(tx core.App, doc, memo *core.Record, total int64) error {
	collection, err := tx.FindCachedCollectionByNameOrId(refundReceiptCreditsCollection)
	if err != nil {
		return fmt.Errorf("books: find %s: %w", refundReceiptCreditsCollection, err)
	}
	row := core.NewRecord(collection)
	row.Set("refund_receipt", doc.Id)
	row.Set("credit_memo", memo.Id)
	row.Set("amount", total)
	row.Set("position", 0)
	if err := tx.Save(row); err != nil {
		return fmt.Errorf("books: write the payout's credits row: %w", err)
	}
	return nil
}

// refundPayoutAfterPost is the kind's AfterPost: once the payout's entry is
// posted (and a corrected original is void), it rebuilds the cash-basis rows
// of the memos the payout and its original pay out. A plain refund that
// replaces no payout has none.
func refundPayoutAfterPost(tx core.App, doc, original *core.Record) error {
	originalID := ""
	if original != nil {
		originalID = original.Id
	}
	return rebuildPaidCashBasis(tx, creditMemoBalanceKind, doc.Id, originalID)
}

// refundPayoutWithdraw is the kind's Withdraw: a voided payout gives its
// credit back to the memo and rebuilds the memo's cash-basis rows, which no
// longer count the void payout's entry. A deleted draft and a plain refund
// have no credits row, so nothing changes.
func refundPayoutWithdraw(tx core.App, doc *core.Record) error {
	lines, err := paymentLines(tx, creditMemoBalanceKind, doc.Id)
	if err != nil || len(lines) == 0 {
		return err
	}
	if err := releaseLines(tx, creditMemoBalanceKind, doc.Id); err != nil {
		return err
	}
	return rebuildPaidCashBasis(tx, creditMemoBalanceKind, doc.Id)
}
