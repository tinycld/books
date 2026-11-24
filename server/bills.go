package books

import (
	"github.com/pocketbase/pocketbase/core"
)

// The bill's forms host (tinycld/books/forms/hosts.ts) and its lines
// collection; its two line tables are the purchase tables of
// server/purchase_lines.go.
const (
	billHostKey         = "books:bill"
	billLinesCollection = "books_bill_lines"
)

// docTypeBill is the doc type of a bill's sequence and of the entry it posts;
// entry_type_labels.json holds how a reader sees it.
const docTypeBill = "bill"

// Refusal texts of the bill guards. This group is shown by the client too,
// with the same words (BILL_MESSAGES, lib/document-texts.ts), with the line
// texts of server/purchase_lines.go. PocketBase adds a final period to a text
// without one; these have theirs. The first %s of a party text is a name
// people typed, which refuseNamedField keeps as written.
const (
	msgBillTotalNegative    = "A bill total cannot be below zero. Use a vendor credit."
	msgBillZeroTotal        = "A bill total must be more than zero to post."
	msgBillTotalTooLarge    = "The bill total is more than Books can store."
	msgBillTooManyLines     = "A bill holds at most 250 lines."
	msgVendorInactive       = "%s is inactive. Choose an active vendor."
	msgBillDueBeforeDate    = "Due date can't be before the bill date."
	msgBillDuplicateRef     = "%s already has bill no. %s (%s)."
	msgBillRevisionConflict = "This bill changed after you opened it. Load it again, then review it before you save or post."
)

// Go-only refusal texts of the bill.
const (
	msgBillPostedFromForm  = "A draft bill is posted from the bill form."
	msgBillNotDraft        = "A posted or void bill cannot be changed."
	msgBillDeleteNotDraft  = "Only a draft bill can be deleted."
	msgBillLineStays       = "A line stays on its bill."
	msgBillLineNotDraft    = "Only the lines of a draft bill can change."
	msgBillLineRestating   = "Only a line's amount changes while Books restates its bill."
	msgBillLineUnknownKind = "Line %d: a bill line is an account line or a product line."
	msgBillEditMissing     = "The bill being edited does not exist."
)

// billDraftName names, in a duplicate bill no. refusal, a bill that has no
// number yet.
const billDraftName = "a draft bill"

// billKind is the bill as a purchase document of the shared layer: its party
// is the vendor, its lines are account lines and product lines, it has no
// sales tax, and posting credits Accounts payable (which posting creates when
// the chart has none, ensurePayables) for the total and debits each line's
// expense account (expenseByAccount). Its balance is what bill payments and
// vendor credits have not paid (billBalanceKind); a void is refused while a
// posted bill payment pays it or a credit is applied to it, and a correction
// takes its payments and credits over. Its BeforePost is set in
// init: it reads the kind's own lines, and a field of billKind that names
// billKind is an initialization cycle.
var billKind = salesDocKind{
	DocType:            docTypeBill,
	Lifecycle:          lifecyclePosting,
	Collection:         "books_bills",
	LinesCollection:    billLinesCollection,
	TaxLinesCollection: "",
	ParentField:        "bill",
	HostKey:            billHostKey,
	LineTables:         []string{purchaseAccountLinesKey, purchaseItemLinesKey},
	LineRowLabels:      purchaseLineRowLabels,
	Party:              partyVendor,
	PartyCollection:    "books_vendors",
	AddressField:       "mailing_address",
	CustomerRequired:   true,
	HasTax:             false,
	Msgs: salesDocMessages{
		TotalNegative:    msgBillTotalNegative,
		TotalTooLarge:    msgBillTotalTooLarge,
		TooManyLines:     msgBillTooManyLines,
		ZeroTotal:        msgBillZeroTotal,
		PostedFromForm:   msgBillPostedFromForm,
		NotDraft:         msgBillNotDraft,
		DeleteNotDraft:   msgBillDeleteNotDraft,
		LineStays:        msgBillLineStays,
		LineNotDraft:     msgBillLineNotDraft,
		LineRestating:    msgBillLineRestating,
		LineUnknownKind:  msgBillLineUnknownKind,
		EditMissing:      msgBillEditMissing,
		PartyInactive:    msgVendorInactive,
		RevisionConflict: msgBillRevisionConflict,
	},
	CheckHeader: checkBillHeader,
	CreditAccount: func(tx core.App, _ *core.Record) (string, error) {
		payable, err := ensurePayables(tx)
		if err != nil {
			return "", err
		}
		return payable.Id, nil
	},
	LineAccounts:  stockInByAccount,
	Stock:         stockReceipt,
	TracksBalance: true,
	CheckVoid:     refuseBillVoidApplied,
	Replace:       replaceBill,
}

// Refusals of a bill that bill payments pay (pay-bills spec §3.9) or vendor
// credits are applied to (vendor credit spec §3.10). %s is the amount the
// posted payments pay, or that they and the credits apply together.
const (
	msgBillVoidWithPayments          = "Payments are applied to this bill. Void or edit those payments first."
	msgBillCorrectionBelowPaid       = "Payments of %s are applied to this bill. Its total cannot be below that."
	msgBillCorrectionVendor          = "Payments are applied to this bill, so its vendor cannot change."
	msgBillVoidCreditsApplied        = "Vendor credits are applied to this bill. Remove them first."
	msgBillCorrectionBelowPaidCredit = "Payments and credits of %s are applied to this bill. Its total cannot be below that."
	msgBillCorrectionCreditVendor    = "Vendor credits are applied to this bill, so its vendor cannot change."
)

// billAppliedTo splits what is applied to a bill: what its posted bill
// payments pay (the payment payer), and what vendor credits apply (every other
// payer). Each payer's rows are summed once.
func billAppliedTo(tx core.App, billID string) (paid, credited int64, err error) {
	for _, p := range billBalanceKind.Payers {
		n, err := appliedByPayer(tx, billBalanceKind, p, billID)
		if err != nil {
			return 0, 0, err
		}
		if p.PaymentCollection != "" {
			paid += n
		} else {
			credited += n
		}
	}
	return paid, credited, nil
}

// refuseBillVoidApplied is the bill's CheckVoid: a bill that a posted bill
// payment pays stays posted until that payment is voided or edited, and one
// that a vendor credit is applied to until the credit is removed from it. The
// payments are named first.
func refuseBillVoidApplied(tx core.App, doc *core.Record) error {
	paid, credited, err := billAppliedTo(tx, doc.Id)
	if err != nil {
		return err
	}
	if paid > 0 {
		return refuse(msgBillVoidWithPayments)
	}
	if credited > 0 {
		return refuse(msgBillVoidCreditsApplied)
	}
	return nil
}

// replaceBill is the bill's Replace step: while posted bill payments or
// vendor credits apply to the original, the correction keeps a total of at
// least what they apply (named as payments only while no credit is applied)
// and keeps the vendor (the payments' text first); then the lines of the
// posted payments and the credit applications move to the correction, whose
// balance postSalesDoc then sets to its total less them. A void payment's
// lines stay on the original, which keeps its history: the correction may
// name another vendor, and a line must name a bill of its payment's vendor.
// The correction also takes every file of the original.
func replaceBill(tx core.App, original, correction *core.Record) error {
	paid, credited, err := billAppliedTo(tx, original.Id)
	if err != nil {
		return err
	}
	currency := correction.GetString("currency")
	if applied := paid + credited; int64(correction.GetInt("total")) < applied {
		if credited > 0 {
			return refuse(msgBillCorrectionBelowPaidCredit, formatMoney(applied, currency))
		}
		return refuse(msgBillCorrectionBelowPaid, formatMoney(paid, currency))
	}
	if correction.GetString("vendor") != original.GetString("vendor") {
		if paid > 0 {
			return refuse(msgBillCorrectionVendor)
		}
		if credited > 0 {
			return refuse(msgBillCorrectionCreditVendor)
		}
	}
	if err := movePostedLines(tx, billBalanceKind, original, correction); err != nil {
		return err
	}
	return moveAttachments(tx, "bill", original.Id, correction.Id)
}

func init() {
	billKind.BeforePost = func(tx core.App, doc *core.Record) error {
		return checkPurchaseLinesToPost(tx, billKind, doc)
	}
}

// checkBillHeader is the bill's own header guard on a draft write: the bill
// date and the due date are real days, the due date is not before the bill
// date, and no other bill of the vendor has its vendor's bill no.
func checkBillHeader(tx core.App, _, r *core.Record) error {
	date, err := parseDay(r.GetString("date"))
	if err != nil {
		return refuseField("date", msgDocumentDay)
	}
	due, err := parseDay(r.GetString("due_date"))
	if err != nil {
		return refuseField("due_date", msgDocumentDay)
	}
	if due.Before(date) {
		return refuseField("due_date", msgBillDueBeforeDate)
	}
	return checkBillRef(tx, r)
}

// checkBillRef refuses a vendor's bill no. that another bill of the same
// vendor already has (checkVendorRef).
func checkBillRef(tx core.App, r *core.Record) error {
	return checkVendorRef(tx, r, "books_bills", docTypeBill, billDraftName, msgBillDuplicateRef)
}
