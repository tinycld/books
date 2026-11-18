package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// The refund receipt's forms host (tinycld/books/forms/hosts.ts).
const refundReceiptHostKey = "books:refund_receipt"

// refundReceiptCreditsCollection holds the payer row of each posted payout: the
// credit memo it pays out and the amount (refund_receipt_payout.go).
const refundReceiptCreditsCollection = "books_refund_receipt_credits"

// docTypeRefundReceipt is the doc type of a refund receipt's sequence and of
// the entry it posts; entry_type_labels.json holds how a reader sees it.
const docTypeRefundReceipt = "refund_receipt"

// Refusal texts of the refund receipt guards. This group is shown by the client
// too, with the same words (REFUND_RECEIPT_MESSAGES, lib/document-texts.ts).
// PocketBase adds the final period to a text without one. An inactive customer
// is refused with msgCustomerInactive (invoices.go), as on every sales kind.
// msgRefundAboveCredit takes the unapplied credit as money and the memo's
// number; msgRefundBeforeCredit the memo's day as "Nov 12, 2026".
const (
	msgRefundTotalNegative = "A refund receipt total cannot be below zero. Use a sales receipt."
	msgRefundTotalTooLarge = "The refund receipt total is more than Books can store."
	msgRefundTooManyLines  = "A refund receipt can have at most 250 lines."
	msgRefundZeroTotal     = "A refund receipt with a total of zero cannot be posted. Add an amount or keep it as a draft."
	msgRefundFromInvalid   = "Choose an active bank or Undeposited funds account"
	msgRefundAboveCredit   = "The refund is more than the unapplied credit of %s on credit memo %s."
	msgRefundBeforeCredit  = "Date the refund on or after the credit memo's date, %s."
)

// Go-only refusal texts of the refund receipt.
const (
	msgRefundOneSource          = "A refund receipt has one source."
	msgRefundSalesReceipt       = "Choose a posted sales receipt of this customer."
	msgRefundCreditMemo         = "Choose a posted credit memo of this customer with unapplied credit."
	msgRefundPayoutStays        = "A payout stays with its credit memo."
	msgCustomerOnRefundReceipts = "%s is on refund receipts. Make it inactive instead."
	msgRefundPostedFromForm     = "A draft refund receipt is posted from the refund receipt form."
	msgRefundNotDraft           = "A posted or void refund receipt cannot be changed."
	msgRefundDeleteNotDraft     = "Only a draft refund receipt can be deleted."
	msgRefundLineStays          = "A line stays on its refund receipt."
	msgRefundLineNotDraft       = "Only the lines of a draft refund receipt can change."
	msgRefundLineRestating      = "Only a line's amount changes while Books restates its refund receipt."
	msgRefundLineUnknownKind    = "Line %d: a refund receipt line is an item, description, subtotal or percent line."
	msgRefundEditMissing        = "The refund receipt being edited does not exist."
	msgRefundRevisionConflict   = "This refund receipt changed after you opened it. Load it again, then review it before you save or post."
	// A plain refund whose taxable lines net below zero (checkTaxableNotNegative).
	msgRefundTaxableNegative = "The taxable lines of a refund receipt cannot total below zero. Make a negative line not taxable, or lower it."
	// A plain refund with tax whose subtotal is below zero (checkTaxableNotNegative).
	msgRefundSubtotalNegative = "The subtotal of a refund receipt cannot be below zero. Lower the negative lines."
	// checkAccountDelete's texts for the Refund from account of refund receipts.
	msgAccountRefundOfOneRefundReceipt = "This account is the refund account of 1 refund receipt and cannot be deleted. Make it inactive instead."
	msgAccountRefundOfRefundReceipts   = "This account is the refund account of %d refund receipts and cannot be deleted. Make it inactive instead."
)

// refundReceiptKind is the refund receipt as a sales document: an optional
// customer, one date, and a Refund from account the posting credits for the
// total. A plain refund posts the mirror of a sales receipt (Credit): the
// income accounts and the tax liability accounts are debited, and its tax
// snapshot holds the figures negated. A payout (credit_memo set) posts against
// Accounts receivable instead, writes no tax snapshot, and is a payer of its
// credit memo's balance and cash-basis rows: its hooks are set in init
// (refund_receipt_payout.go), because they read the kind.
var refundReceiptKind = salesDocKind{
	DocType:            docTypeRefundReceipt,
	Lifecycle:          lifecyclePosting,
	Collection:         "books_refund_receipts",
	LinesCollection:    "books_refund_receipt_lines",
	TaxLinesCollection: "books_refund_receipt_tax_lines",
	ParentField:        "refund_receipt",
	HostKey:            refundReceiptHostKey,
	LineTables:         []string{salesDocLinesKey},
	Party:              partyCustomer,
	PartyCollection:    "books_customers",
	AddressField:       "bill_to",
	CustomerRequired:   false,
	HasTax:             true,
	Credit:             true,
	Msgs: salesDocMessages{
		TotalNegative:    msgRefundTotalNegative,
		TotalTooLarge:    msgRefundTotalTooLarge,
		TooManyLines:     msgRefundTooManyLines,
		ZeroTotal:        msgRefundZeroTotal,
		PostedFromForm:   msgRefundPostedFromForm,
		NotDraft:         msgRefundNotDraft,
		DeleteNotDraft:   msgRefundDeleteNotDraft,
		LineStays:        msgRefundLineStays,
		LineNotDraft:     msgRefundLineNotDraft,
		LineRestating:    msgRefundLineRestating,
		LineUnknownKind:  msgRefundLineUnknownKind,
		EditMissing:      msgRefundEditMissing,
		CustomerOnDocs:   msgCustomerOnRefundReceipts,
		RevisionConflict: msgRefundRevisionConflict,
		PartyInactive:    msgCustomerInactive,
		TaxableNegative:  msgRefundTaxableNegative,
		SubtotalNegative: msgRefundSubtotalNegative,
	},
	CheckHeader:   checkRefundReceiptHeader,
	CreditAccount: func(_ core.App, doc *core.Record) (string, error) { return doc.GetString("refund_from"), nil },
}

func init() {
	refundReceiptKind.BeforePost = refundReceiptBeforePost
	refundReceiptKind.PostingLines = refundPayoutPostingLines
	refundReceiptKind.AfterPost = refundPayoutAfterPost
	refundReceiptKind.Withdraw = refundPayoutWithdraw
}

// checkRefundReceiptHeader is the refund receipt's own header guard on a draft
// write: the refund date is a real day, Refund from is an active bank or
// Undeposited funds account, then the source links. Refund from is checked on
// a create and on an update that changes it, so a later write of a draft whose
// account went inactive (a memo change) is not refused; Post checks it again
// (refundReceiptBeforePost). reference_no and payment_method are held by the
// schema (at most 40 characters; a PAYMENT_METHODS key).
func checkRefundReceiptHeader(tx core.App, stored, r *core.Record) error {
	if _, err := parseDay(r.GetString("date")); err != nil {
		return refuseDocumentDay("date", err)
	}
	if id := r.GetString("refund_from"); stored == nil || stored.GetString("refund_from") != id {
		if err := checkRefundFromAccount(tx, id); err != nil {
			return err
		}
	}
	return checkRefundReceiptLinks(tx, stored, r)
}

// refundReceiptBeforePost is the kind's BeforePost: it checks the Refund from
// account the refund posts to, changed or not, then the payout's credit memo.
func refundReceiptBeforePost(tx core.App, doc *core.Record) error {
	if err := checkRefundFromAccount(tx, doc.GetString("refund_from")); err != nil {
		return err
	}
	return refundPayoutBeforePost(tx, doc)
}

// checkRefundFromAccount refuses, under refund_from, an account money cannot be
// refunded from: none, one that does not exist, is inactive, or is neither a
// bank nor an Undeposited funds account (isDepositAccount). It runs before
// PocketBase's own required check, so its text is the one the client shows.
func checkRefundFromAccount(tx core.App, id string) error {
	if id == "" {
		return refuseField("refund_from", msgRefundFromInvalid)
	}
	account, err := tx.FindRecordById("books_accounts", id)
	if errors.Is(err, sql.ErrNoRows) {
		return refuseField("refund_from", msgRefundFromInvalid)
	}
	if err != nil {
		return fmt.Errorf("books: read the refund's Refund from account: %w", err)
	}
	if !isDepositAccount(account) {
		return refuseField("refund_from", msgRefundFromInvalid)
	}
	return nil
}

// checkRefundReceiptLinks holds the refund's source, inside the guards'
// serialized transaction: at most one of sales_receipt and credit_memo, and a
// stored row, or a correction, keeps the credit_memo of the row it stores or
// replaces (a plain refund never becomes a payout, nor a payout a plain refund
// or a payout of another memo). The link itself is checked only when the link or
// the customer is chosen: an update that changes none of sales_receipt,
// credit_memo and customer passes, so a draft whose source was voided after
// the link was stored still saves (a void keeps the link, spec Q13). A
// correction that keeps its original's three fields passes for the same
// reason. A link a source correction moves (refund_receipt_links.go) passes
// too: that Replace step runs before the correction is posted, so the link
// names a source that is not posted yet.
func checkRefundReceiptLinks(tx core.App, stored, r *core.Record) error {
	if isMovingRefundLink(tx, r.Id) {
		return nil
	}
	receiptID, memoID, customer := r.GetString("sales_receipt"), r.GetString("credit_memo"), r.GetString("customer")
	if receiptID != "" && memoID != "" {
		return refuse("%s", msgRefundOneSource)
	}
	if stored != nil && stored.GetString("credit_memo") != memoID {
		return refuse("%s", msgRefundPayoutStays)
	}
	if stored != nil && stored.GetString("sales_receipt") == receiptID && stored.GetString("customer") == customer {
		return nil
	}
	if stored == nil {
		original, err := refundOriginal(tx, r)
		if err != nil {
			return err
		}
		if original != nil && original.GetString("credit_memo") != memoID {
			return refuse("%s", msgRefundPayoutStays)
		}
		if keepsOriginalRefundSource(original, r) {
			return nil
		}
	}
	if receiptID != "" {
		return checkRefundSalesReceipt(tx, receiptID, customer)
	}
	if memoID != "" {
		return checkRefundCreditMemo(tx, memoID, customer)
	}
	return nil
}

// refundOriginal reads the refund receipt that the correction r replaces, or
// nil when r replaces none or its original does not exist.
func refundOriginal(tx core.App, r *core.Record) (*core.Record, error) {
	replaces := r.GetString("replaces")
	if replaces == "" {
		return nil, nil
	}
	// The collection by name: refundReceiptKind names this guard, so reading
	// the kind here would be an initialization cycle.
	original, err := tx.FindRecordById("books_refund_receipts", replaces)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the refund receipt being edited: %w", err)
	}
	return original, nil
}

// keepsOriginalRefundSource reports whether the correction r names the same
// sales receipt, credit memo and customer as its original: the user did not
// choose that source again, so it holds even when the source was voided since.
func keepsOriginalRefundSource(original, r *core.Record) bool {
	if original == nil {
		return false
	}
	for _, field := range []string{"sales_receipt", "credit_memo", "customer"} {
		if original.GetString(field) != r.GetString(field) {
			return false
		}
	}
	return true
}

// checkRefundSalesReceipt refuses, under sales_receipt, a sales receipt that
// does not exist, is not posted, or is another customer's (both may have none).
func checkRefundSalesReceipt(tx core.App, receiptID, customer string) error {
	receipt, err := tx.FindRecordById("books_sales_receipts", receiptID)
	if errors.Is(err, sql.ErrNoRows) {
		return refuseField("sales_receipt", msgRefundSalesReceipt)
	}
	if err != nil {
		return fmt.Errorf("books: read the refund's sales receipt: %w", err)
	}
	if receipt.GetString("status") != statusPosted || receipt.GetString("customer") != customer {
		return refuseField("sales_receipt", msgRefundSalesReceipt)
	}
	return nil
}

// checkRefundCreditMemo refuses, under credit_memo, a credit memo that does not
// exist, is not posted, is another customer's, or has no unapplied credit.
func checkRefundCreditMemo(tx core.App, memoID, customer string) error {
	memo, err := tx.FindRecordById("books_credit_memos", memoID)
	if errors.Is(err, sql.ErrNoRows) {
		return refuseField("credit_memo", msgRefundCreditMemo)
	}
	if err != nil {
		return fmt.Errorf("books: read the refund's credit memo: %w", err)
	}
	if memo.GetString("status") != statusPosted || memo.GetString("customer") != customer || memo.GetInt("balance") <= 0 {
		return refuseField("credit_memo", msgRefundCreditMemo)
	}
	return nil
}
