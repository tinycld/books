package books

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// markReplacingPayment marks the posted payment a correction is replacing, so
// its own update hook lets Books set it void with replaced_by while its entry
// is already voided by the correction's post (voidReplaced). The returned
// func clears the mark, which belongs to the posting transaction.
func markReplacingPayment(tx core.App, paymentID string) func() {
	return setTxMark(tx, "payment.replacing", paymentID)
}

func isReplacingPayment(tx core.App, paymentID string) bool {
	return hasTxMark(tx, "payment.replacing", paymentID)
}

// postPayment posts a draft payment while its update moves it from draft to
// posted, inside the update's transaction: any refusal rolls back every row
// it wrote (the Undeposited funds account it creates, the entry, the number,
// the invoice balances). The header guards have already run on p. In order:
// the posted original of a correction; the customer is active (a correction
// keeps its original's); an empty Deposit to becomes Undeposited funds
// (created when the chart has none), a set one is still an active deposit
// account; a correction releases its original's applications; each
// application still names a posted invoice of the customer and is at most
// that invoice's stored balance, read again now; the applications add up to
// at most the amount. The entry (debit Deposit to, credit Accounts receivable,
// both naming the customer, the payment's memo) posts through postDocument,
// so postEntry runs every ledger rule; then the payment takes its number,
// applied and credited, its applications come off their invoices' balances,
// and a correction's original becomes void with replaced_by.
func postPayment(tx core.App, p *core.Record, now time.Time) error {
	original, err := correctedPayment(tx, p)
	if err != nil {
		return err
	}
	if err := refuseInactivePaymentCustomer(tx, p); err != nil {
		return err
	}
	if err := settlePaymentDeposit(tx, p); err != nil {
		return err
	}
	if original != nil {
		if err := releaseApplications(tx, original.Id); err != nil {
			return err
		}
	}
	applied, err := checkPaymentApplications(tx, p)
	if err != nil {
		return err
	}
	amount := int64(p.GetInt("amount"))
	currency := p.GetString("currency")
	if applied > amount {
		return refuse(msgPaymentOverApplied, formatMoney(applied, currency), formatMoney(amount, currency))
	}
	receivable, err := ensureReceivables(tx)
	if err != nil {
		return err
	}
	actor := p.GetString("posted_by")
	post := documentPost{
		DocType:    docTypePayment,
		DocumentID: p.Id,
		Date:       p.GetString("date"),
		Memo:       p.GetString("memo"),
		Actor:      actor,
		Customer:   p.GetString("customer"),
		Lines: []postingLine{
			{Account: p.GetString("deposit_to"), Debit: amount},
			{Account: receivable.Id, Credit: amount},
		},
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
	p.Set("entry", entry.Id)
	p.Set("applied", applied)
	p.Set("credited", amount-applied)
	p.Set("posted_at", now)
	p.Set("sort_key", salesDocSortKey(p))
	if err := applyToInvoices(tx, p.Id); err != nil {
		return err
	}
	if original == nil {
		return nil
	}
	return voidReplacedPayment(tx, original, p, actor, now)
}

// correctedPayment is the posted payment a correction replaces, nil for a
// payment that replaces none. Only a posted payment with its entry can be
// corrected: a void one is already replaced or voided.
func correctedPayment(tx core.App, p *core.Record) (*core.Record, error) {
	id := p.GetString("replaces")
	if id == "" {
		return nil, nil
	}
	original, err := tx.FindRecordById(paymentsCollection, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, refuse(msgPaymentEditMissing)
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the payment being edited: %w", err)
	}
	if original.GetString("status") != statusPosted {
		return nil, refuse(msgSalesDocEditNotPosted, paymentName(original), original.GetString("status"))
	}
	if original.GetString("entry") == "" {
		return nil, refuse(msgSalesDocNoEntry, paymentName(original))
	}
	// Checked again here, inside the posting transaction: a write that skipped
	// the draft guard must not post a correction for another customer.
	if original.GetString("customer") != p.GetString("customer") {
		return nil, refuseField("customer", msgPaymentCorrectionCustomer)
	}
	return original, nil
}

// settlePaymentDeposit fills an empty Deposit to with the Undeposited funds
// account, which it creates when the chart has none (Q6), and checks a set
// one again: it may have become inactive since the draft chose it.
func settlePaymentDeposit(tx core.App, p *core.Record) error {
	if id := p.GetString("deposit_to"); id != "" {
		return checkDepositAccount(tx, id)
	}
	undeposited, err := ensureUndepositedFunds(tx)
	if err != nil {
		return err
	}
	p.Set("deposit_to", undeposited.Id)
	return nil
}

// checkPaymentApplications reads the payment's applications and each one's
// invoice again, refuses an application whose invoice is no longer a posted
// invoice of the payment's customer or whose amount is above that invoice's
// stored balance (keyed applications.<position>), and returns their sum.
func checkPaymentApplications(tx core.App, p *core.Record) (int64, error) {
	apps, err := paymentApplications(tx, p.Id)
	if err != nil {
		return 0, err
	}
	currency := p.GetString("currency")
	var applied int64
	for _, a := range apps {
		inv, err := tx.FindRecordById("books_invoices", a.GetString("invoice"))
		if err != nil {
			return 0, fmt.Errorf("books: read the invoice of a payment application: %w", err)
		}
		field := applicationField(a)
		if inv.GetString("status") != statusPosted || inv.GetString("customer") != p.GetString("customer") {
			return 0, refuseNamedField(field, msgPaymentInvoiceNotOpen, invoiceRef(inv))
		}
		amount, balance := int64(a.GetInt("amount")), int64(inv.GetInt("balance"))
		if amount > balance {
			return 0, refuseNamedField(field, msgPaymentAboveBalance, invoiceRef(inv), formatMoney(balance, currency))
		}
		applied += amount
	}
	return applied, nil
}

// voidReplacedPayment sets the original of a posted correction void with
// replaced_by. Its entry is already void (the correction's entry replaced it)
// and its applications were released before the correction's were checked.
func voidReplacedPayment(tx core.App, original, correction *core.Record, actor string, now time.Time) error {
	defer markReplacingPayment(tx, original.Id)()
	fresh, err := tx.FindRecordById(paymentsCollection, original.Id)
	if err != nil {
		return err
	}
	fresh.Set("status", statusVoid)
	fresh.Set("replaced_by", correction.Id)
	fresh.Set("voided_by", actor)
	fresh.Set("voided_at", now)
	return tx.Save(fresh)
}

// voidPayment voids a posted payment's entry while the payment moves from
// posted to void, inside the update's transaction: the entry's own hook posts
// the void reversal in the original period under the same number (voidEntry),
// and the close date applies to it as to any post. The invoices it paid are
// open again (releaseApplications).
func voidPayment(tx core.App, p *core.Record, now time.Time) error {
	entryID := p.GetString("entry")
	if entryID == "" {
		return refuse(msgSalesDocNoEntry, paymentName(p))
	}
	entry, err := tx.FindRecordById("books_journal_entries", entryID)
	if err != nil {
		return fmt.Errorf("books: read the payment's journal entry: %w", err)
	}
	entry.Set("status", statusVoid)
	entry.Set("voided_by", p.GetString("voided_by"))
	if err := tx.Save(entry); err != nil {
		return err
	}
	p.Set("voided_at", now)
	return releaseApplications(tx, p.Id)
}
