package books

import (
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// postVendorRefund posts a draft vendor refund while its update moves it from
// draft to posted, inside the update's transaction: any refusal rolls back
// every row it wrote (the entry, the number, the credit balances). The header
// guards have already run on r. In order (vendor refund spec §3.6): the
// posted original of a correction (it exists, is posted, and has the same
// vendor); the vendor is active (a correction keeps its original's); Refunded
// to is still an active refund account; a correction releases its original's
// lines, so it may refund again what the original refunded; each line still
// names a posted vendor credit of the vendor, dated on or before the refund,
// and is at most that credit's stored balance, read again now; the lines add
// up to the amount. The entry (debit Refunded to for the amount, credit each
// Accounts payable account the refunded credits' entries debited, the vendor
// on every line, the refund's memo) posts through postDocument, so postEntry
// runs every ledger rule (the close date among them) and numbers it from the
// vendor_refund sequence; then the refund takes its number and entry, its
// lines come off their credits' balances, a correction's original becomes
// void with replaced_by, and the cash-basis rows of every credit it or its
// original refunds are rebuilt.
func postVendorRefund(tx core.App, r *core.Record, now time.Time) error {
	original, err := correctedVendorRefund(tx, r)
	if err != nil {
		return err
	}
	if err := refuseInactiveRefundVendor(tx, r); err != nil {
		return err
	}
	account, err := checkRefundAccount(tx, r)
	if err != nil {
		return err
	}
	if account == nil {
		return refuseField("refunded_to", msgVendorRefundAccountType)
	}
	if original != nil {
		if err := releaseLines(tx, vendorCreditBalanceKind, original.Id); err != nil {
			return err
		}
	}
	lines, credits, err := checkVendorRefundLines(tx, r)
	if err != nil {
		return err
	}
	var refunded int64
	for _, l := range lines {
		refunded += int64(l.GetInt("amount"))
	}
	amount := int64(r.GetInt("amount"))
	if len(lines) == 0 || refunded != amount {
		return refuse(msgVendorRefundSumNotAmount)
	}
	payables, err := vendorRefundEntryCredits(tx, lines, credits)
	if err != nil {
		return err
	}
	actor := r.GetString("posted_by")
	post := documentPost{
		DocType:    docTypeVendorRefund,
		DocumentID: r.Id,
		Date:       r.GetString("date"),
		Memo:       r.GetString("memo"),
		Actor:      actor,
		Vendor:     r.GetString("vendor"),
		Lines:      append([]postingLine{{Account: account.Id, Debit: amount}}, payables...),
	}
	if original != nil {
		post.Replaces = original.GetString("entry")
	}
	entry, err := postDocument(tx, post)
	if err != nil {
		return err
	}
	r.Set("number", entry.GetString("number"))
	r.Set("sequence", entry.GetInt("sequence"))
	r.Set("entry", entry.Id)
	r.Set("posted_at", now)
	r.Set("sort_key", salesDocSortKey(r))
	if err := applyToDocuments(tx, vendorCreditBalanceKind, r.Id); err != nil {
		return err
	}
	if original == nil {
		return rebuildPaidCashBasis(tx, vendorCreditBalanceKind, r.Id)
	}
	if err := voidReplacedVendorRefund(tx, original, r, actor, now); err != nil {
		return err
	}
	return rebuildPaidCashBasis(tx, vendorCreditBalanceKind, r.Id, original.Id)
}

// correctedVendorRefund is the posted vendor refund a correction replaces,
// nil for a refund that replaces none. Only a posted refund with its entry can
// be corrected: a void one is already replaced or voided. The draft guard and
// the post both check it, the post inside the posting transaction.
func correctedVendorRefund(tx core.App, r *core.Record) (*core.Record, error) {
	id := r.GetString("replaces")
	if id == "" {
		return nil, nil
	}
	original, err := tx.FindRecordById(vendorRefundsCollection, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, refuse(msgVendorRefundEditMissing)
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the vendor refund being edited: %w", err)
	}
	if original.GetString("status") != statusPosted {
		return nil, refuse(msgVendorRefundOnlyPostedEdits)
	}
	if original.GetString("entry") == "" {
		return nil, refuse(msgSalesDocNoEntry, vendorRefundName(original))
	}
	if original.GetString("vendor") != r.GetString("vendor") {
		return nil, refuseField("vendor", msgVendorRefundCorrectionVendor)
	}
	return original, nil
}

// checkVendorRefundLines reads the refund's lines and each one's vendor credit
// again, refuses more than maxVendorRefundLines, a line whose credit is no
// longer a posted credit of the vendor, is dated after the refund, or holds
// less than the line in its stored balance (keyed lines.<position>). It
// returns the lines and their credits, in line order.
func checkVendorRefundLines(tx core.App, r *core.Record) ([]*core.Record, []*core.Record, error) {
	lines, err := paymentLines(tx, vendorCreditBalanceKind, r.Id)
	if err != nil {
		return nil, nil, err
	}
	if len(lines) > maxVendorRefundLines {
		return nil, nil, refuse(msgVendorRefundTooManyCredits)
	}
	currency := r.GetString("currency")
	credits := make([]*core.Record, len(lines))
	for i, l := range lines {
		credit, err := tx.FindRecordById(vendorCreditsCollection, l.GetString("vendor_credit"))
		if err != nil {
			return nil, nil, fmt.Errorf("books: read the vendor credit of a vendor refund line: %w", err)
		}
		field := vendorRefundLineField(l)
		if credit.GetString("status") != statusPosted || credit.GetString("vendor") != r.GetString("vendor") {
			return nil, nil, refuseNamedField(field, msgVendorRefundCreditNotOpen, vendorCreditRef(credit))
		}
		// Both are stored YYYY-MM-DD text, so they compare as days.
		if credit.GetString("date") > r.GetString("date") {
			return nil, nil, refuseNamedField(field, msgVendorRefundCreditAfter, vendorCreditRef(credit))
		}
		if amount, balance := int64(l.GetInt("amount")), int64(credit.GetInt("balance")); amount > balance {
			return nil, nil, refuseNamedField(field, msgVendorRefundAboveUnapplied, vendorCreditRef(credit),
				formatMoney(balance, currency))
		}
		credits[i] = credit
	}
	return lines, credits, nil
}

// vendorRefundEntryCredits builds the credits of a vendor refund's entry:
// each line's amount on the Accounts payable account its vendor credit's entry
// debited (vendorCreditPayableOf), summed per account, in chart order, as a
// bill payment's debits follow its bills (billPaymentEntryLines).
func vendorRefundEntryCredits(tx core.App, lines, credits []*core.Record) ([]postingLine, error) {
	sums := map[string]int64{}
	var payables []billPayable
	for i, l := range lines {
		payable, err := vendorCreditPayableOf(tx, credits[i])
		if err != nil {
			return nil, err
		}
		if _, seen := sums[payable.ID]; !seen {
			payables = append(payables, payable)
		}
		sums[payable.ID] += int64(l.GetInt("amount"))
	}
	slices.SortFunc(payables, func(a, b billPayable) int {
		return compareChartOrder(a.Number, a.ID, b.Number, b.ID)
	})
	out := make([]postingLine, len(payables))
	for i, a := range payables {
		out[i] = postingLine{Account: a.ID, Credit: sums[a.ID]}
	}
	return out, nil
}

// vendorCreditPayableOf is the Accounts payable account the vendor credit's
// posted entry debited: the mirror of billPayableOf.
func vendorCreditPayableOf(tx core.App, credit *core.Record) (billPayable, error) {
	var payable billPayable
	err := tx.DB().NewQuery(`
		SELECT a.id AS id, a.number AS number
		FROM books_journal_lines l
		JOIN books_accounts a ON a.id = l.account
		WHERE l.entry = {:entry} AND l.debit > 0 AND a.type = 'accounts_payable'
		ORDER BY l.position, l.id
		LIMIT 1`).Bind(dbx.Params{"entry": credit.GetString("entry")}).One(&payable)
	if errors.Is(err, sql.ErrNoRows) {
		return payable, refuse(msgSalesDocNoEntry, vendorCreditLabel(credit))
	}
	if err != nil {
		return payable, fmt.Errorf("books: read the payable account of %s: %w", vendorCreditLabel(credit), err)
	}
	return payable, nil
}

// voidReplacedVendorRefund sets the original of a posted correction void with
// replaced_by. Its entry is already void (the correction's entry replaced it)
// and its lines were released before the correction's were checked.
func voidReplacedVendorRefund(tx core.App, original, correction *core.Record, actor string, now time.Time) error {
	defer setTxMark(tx, vendorRefundReplacingMark, original.Id)()
	fresh, err := tx.FindRecordById(vendorRefundsCollection, original.Id)
	if err != nil {
		return err
	}
	fresh.Set("status", statusVoid)
	fresh.Set("replaced_by", correction.Id)
	fresh.Set("voided_by", actor)
	fresh.Set("voided_at", now)
	return tx.Save(fresh)
}

// voidVendorRefund voids a posted vendor refund's entry while the refund
// moves from posted to void, inside the update's transaction: the entry's own
// hook posts the void reversal in the original period under the same number
// (voidEntry), and the close date applies to it as to any post. The vendor
// credits it refunded are unapplied again (releaseLines), and their cash-basis
// rows lose its share.
func voidVendorRefund(tx core.App, r *core.Record, now time.Time) error {
	entryID := r.GetString("entry")
	if entryID == "" {
		return refuse(msgSalesDocNoEntry, vendorRefundName(r))
	}
	entry, err := tx.FindRecordById("books_journal_entries", entryID)
	if err != nil {
		return fmt.Errorf("books: read the vendor refund's journal entry: %w", err)
	}
	entry.Set("status", statusVoid)
	entry.Set("voided_by", r.GetString("voided_by"))
	if err := tx.Save(entry); err != nil {
		return err
	}
	r.Set("voided_at", now)
	if err := releaseLines(tx, vendorCreditBalanceKind, r.Id); err != nil {
		return err
	}
	return rebuildPaidCashBasis(tx, vendorCreditBalanceKind, r.Id)
}
