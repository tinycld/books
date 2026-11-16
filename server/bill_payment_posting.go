package books

import (
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// maxEntryMemo is the most characters a journal entry's memo holds (the
// schema's max): a payment of many bills names them up to it.
const maxEntryMemo = 4000

// postBillPayment posts a bill payment its batch has just created with its
// lines, inside the batch's transaction: any refusal rolls back every row the
// batch wrote. The header guards ran on the create. In order: the posted
// original of a correction (it exists, is posted, and has the same vendor);
// Paid from is still an active bank or credit card account; a correction
// releases its original's lines, so it may pay again what the original paid;
// the payment has 1 to maxBillPaymentLines lines, each still naming a posted
// bill of the vendor and at most that bill's stored balance, read again now;
// the check number is on no other expense or bill payment (checkCheckNo). The
// entry (billPaymentEntryLines, the vendor on every line, the memo naming the
// bills) posts through postDocument, so postEntry runs every ledger rule (the
// close date among them) and numbers it from the bill_payment sequence; then
// the payment takes its number, total and entry, its lines come off their
// bills' balances, a correction's original becomes void with replaced_by, and
// the cash-basis rows of every bill it or its original pays are rebuilt.
func postBillPayment(tx core.App, p *core.Record, now time.Time) error {
	original, err := correctedBillPayment(tx, p)
	if err != nil {
		return err
	}
	account, err := checkExpensePaidFrom(tx, p, true)
	if err != nil {
		return err
	}
	if account == nil {
		return refuseField("paid_from", msgExpensePaidFromType)
	}
	if original != nil {
		if err := releaseLines(tx, billBalanceKind, original.Id); err != nil {
			return err
		}
	}
	lines, bills, err := checkBillPaymentLines(tx, p)
	if err != nil {
		return err
	}
	if err := checkCheckNo(tx, billPaymentsCollection, p); err != nil {
		return err
	}
	debits, total, err := billPaymentEntryLines(tx, lines, bills)
	if err != nil {
		return err
	}
	if total > maxStoredAmount {
		return refuse(msgBillPayTotalTooLarge)
	}
	actor := p.GetString("posted_by")
	post := documentPost{
		DocType:    docTypeBillPayment,
		DocumentID: p.Id,
		Date:       p.GetString("date"),
		Memo:       billPaymentMemo(bills),
		Actor:      actor,
		Vendor:     p.GetString("vendor"),
		Lines:      append(debits, postingLine{Account: account.Id, Credit: total}),
	}
	if original != nil {
		post.Replaces = original.GetString("entry")
	}
	entry, err := postDocument(tx, post)
	if err != nil {
		return err
	}
	p.Set("number", entry.GetString("number"))
	p.Set("sequence", entry.GetInt("sequence"))
	p.Set("total", total)
	p.Set("entry", entry.Id)
	p.Set("posted_at", now)
	p.Set("sort_key", salesDocSortKey(p))
	if err := saveBillPaymentPost(tx, p); err != nil {
		return err
	}
	if err := applyToDocuments(tx, billBalanceKind, p.Id); err != nil {
		return err
	}
	if original == nil {
		return rebuildPaidCashBasis(tx, billBalanceKind, p.Id)
	}
	if err := voidReplacedBillPayment(tx, original, p, actor, now); err != nil {
		return err
	}
	return rebuildPaidCashBasis(tx, billBalanceKind, p.Id, original.Id)
}

// saveBillPaymentPost saves the posted fields under the posting mark, which
// the payment's guard lets through.
func saveBillPaymentPost(tx core.App, p *core.Record) error {
	defer setTxMark(tx, billPaymentPostingMark, p.Id)()
	if err := tx.Save(p); err != nil {
		return fmt.Errorf("books: save the posted bill payment: %w", err)
	}
	return nil
}

// correctedBillPayment is the posted bill payment a correction replaces, nil
// for a payment that replaces none. Only a posted payment with its entry can
// be corrected: a void one is already replaced or voided. The create guard
// and the post both check it, the post inside the posting transaction.
func correctedBillPayment(tx core.App, p *core.Record) (*core.Record, error) {
	id := p.GetString("replaces")
	if id == "" {
		return nil, nil
	}
	original, err := tx.FindRecordById(billPaymentsCollection, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, refuse(msgBillPayEditMissing)
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the bill payment being edited: %w", err)
	}
	if original.GetString("status") != statusPosted {
		return nil, refuse(msgBillPayOnlyPostedEdits)
	}
	if original.GetString("entry") == "" {
		return nil, refuse(msgSalesDocNoEntry, billPaymentName(original))
	}
	if original.GetString("vendor") != p.GetString("vendor") {
		return nil, refuseField("vendor", msgBillPayCorrectionVndr)
	}
	return original, nil
}

// checkBillPaymentLines reads the payment's lines and each one's bill again,
// refuses a payment with no line or more than maxBillPaymentLines, a line
// whose bill is no longer a posted bill of the vendor, and a line above its
// bill's stored balance (keyed lines.<position>). It returns the lines and
// their bills, in line order.
func checkBillPaymentLines(tx core.App, p *core.Record) ([]*core.Record, []*core.Record, error) {
	lines, err := paymentLines(tx, billBalanceKind, p.Id)
	if err != nil {
		return nil, nil, err
	}
	if len(lines) == 0 {
		return nil, nil, refuse(msgBillPaySelectOne)
	}
	if len(lines) > maxBillPaymentLines {
		return nil, nil, refuse(msgBillPayTooManyBills)
	}
	currency := p.GetString("currency")
	bills := make([]*core.Record, len(lines))
	for i, l := range lines {
		bill, err := tx.FindRecordById("books_bills", l.GetString("bill"))
		if err != nil {
			return nil, nil, fmt.Errorf("books: read the bill of a bill payment line: %w", err)
		}
		field := billPaymentLineField(l)
		if bill.GetString("status") != statusPosted || bill.GetString("vendor") != p.GetString("vendor") {
			return nil, nil, refuseNamedField(field, msgBillPayBillNotOpen, billRef(bill))
		}
		if amount, balance := int64(l.GetInt("amount")), int64(bill.GetInt("balance")); amount > balance {
			return nil, nil, refuseNamedField(field, msgBillPayAboveBalance, billRef(bill), formatMoney(balance, currency))
		}
		bills[i] = bill
	}
	return lines, bills, nil
}

// billPayable is one Accounts payable account a paid bill credited.
type billPayable struct {
	ID     string `db:"id"`
	Number string `db:"number"`
}

// billPaymentEntryLines builds the debits of a bill payment's entry: each
// line's amount on the Accounts payable account its bill's entry credited,
// summed per account, in chart order. It returns them with the payment's
// total, the sum of the lines.
func billPaymentEntryLines(tx core.App, lines, bills []*core.Record) ([]postingLine, int64, error) {
	sums := map[string]int64{}
	var payables []billPayable
	var total int64
	for i, l := range lines {
		payable, err := billPayableOf(tx, bills[i])
		if err != nil {
			return nil, 0, err
		}
		if _, seen := sums[payable.ID]; !seen {
			payables = append(payables, payable)
		}
		amount := int64(l.GetInt("amount"))
		sums[payable.ID] += amount
		total += amount
	}
	slices.SortFunc(payables, func(a, b billPayable) int {
		return compareChartOrder(a.Number, a.ID, b.Number, b.ID)
	})
	debits := make([]postingLine, len(payables))
	for i, a := range payables {
		debits[i] = postingLine{Account: a.ID, Debit: sums[a.ID]}
	}
	return debits, total, nil
}

// billPayableOf is the Accounts payable account the bill's entry credited.
func billPayableOf(tx core.App, bill *core.Record) (billPayable, error) {
	var payable billPayable
	err := tx.DB().NewQuery(`
		SELECT a.id AS id, a.number AS number
		FROM books_journal_lines l
		JOIN books_accounts a ON a.id = l.account
		WHERE l.entry = {:entry} AND l.credit > 0 AND a.type = 'accounts_payable'
		ORDER BY l.position, l.id
		LIMIT 1`).Bind(dbx.Params{"entry": bill.GetString("entry")}).One(&payable)
	if errors.Is(err, sql.ErrNoRows) {
		return payable, refuse(msgSalesDocNoEntry, billLabel(bill))
	}
	if err != nil {
		return payable, fmt.Errorf("books: read the payable account of %s: %w", billLabel(bill), err)
	}
	return payable, nil
}

// billPaymentMemo is the entry's memo: "Payment of Bill 1003, Bill 1004", the
// bills in line order, cut to what a memo holds.
func billPaymentMemo(bills []*core.Record) string {
	names := make([]string, len(bills))
	for i, b := range bills {
		names[i] = billLabel(b)
	}
	memo := "Payment of " + strings.Join(names, ", ")
	if runes := []rune(memo); len(runes) > maxEntryMemo {
		return string(runes[:maxEntryMemo-1]) + "…"
	}
	return memo
}

// voidReplacedBillPayment sets the original of a posted correction void with
// replaced_by. Its entry is already void (the correction's entry replaced it)
// and its lines were released before the correction's were checked.
func voidReplacedBillPayment(tx core.App, original, correction *core.Record, actor string, now time.Time) error {
	defer setTxMark(tx, billPaymentReplacingMark, original.Id)()
	fresh, err := tx.FindRecordById(billPaymentsCollection, original.Id)
	if err != nil {
		return err
	}
	fresh.Set("status", statusVoid)
	fresh.Set("replaced_by", correction.Id)
	fresh.Set("voided_by", actor)
	fresh.Set("voided_at", now)
	return tx.Save(fresh)
}

// voidBillPayment voids a posted bill payment's entry while the payment moves
// from posted to void, inside the update's transaction: the entry's own hook
// posts the void reversal in the original period under the same number
// (voidEntry), and the close date applies to it as to any post. The bills it
// paid are open again (releaseLines), and their cash-basis rows lose its share.
func voidBillPayment(tx core.App, p *core.Record, now time.Time) error {
	entryID := p.GetString("entry")
	if entryID == "" {
		return refuse(msgSalesDocNoEntry, billPaymentName(p))
	}
	entry, err := tx.FindRecordById("books_journal_entries", entryID)
	if err != nil {
		return fmt.Errorf("books: read the bill payment's journal entry: %w", err)
	}
	entry.Set("status", statusVoid)
	entry.Set("voided_by", p.GetString("voided_by"))
	if err := tx.Save(entry); err != nil {
		return err
	}
	p.Set("voided_at", now)
	if err := releaseLines(tx, billBalanceKind, p.Id); err != nil {
		return err
	}
	return rebuildPaidCashBasis(tx, billBalanceKind, p.Id)
}
