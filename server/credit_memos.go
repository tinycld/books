package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// The credit memo's forms host (tinycld/books/forms/hosts.ts).
const creditMemoHostKey = "books:credit_memo"

// Refusal texts of the credit memo guards. This group is shown by the client
// too, with the same words (CREDIT_MEMO_MESSAGES, lib/document-texts.ts).
// PocketBase adds the final period to a text without one. %s is the
// customer's name, which refuseNamedField keeps as typed; an inactive customer
// is refused with msgCustomerInactive (invoices.go), as on every sales kind.
const (
	msgCreditMemoTotalNegative = "A credit memo total cannot be below zero. Use an invoice."
	msgCreditMemoTotalTooLarge = "The credit memo total is more than Books can store."
	msgCreditMemoTooManyLines  = "A credit memo can have at most 250 lines."
	msgCreditMemoZeroTotal     = "A credit memo with a total of zero cannot be posted. Add an amount or keep it as a draft."
)

// Go-only refusal texts of the credit memo.
const (
	msgCreditMemoInvoice          = "Choose a posted invoice of this customer."
	msgCustomerOnCreditMemos      = "%s is on credit memos. Make it inactive instead."
	msgCreditMemoPostedFromForm   = "A draft credit memo is posted from the credit memo form."
	msgCreditMemoNotDraft         = "A posted or void credit memo cannot be changed."
	msgCreditMemoDeleteNotDraft   = "Only a draft credit memo can be deleted."
	msgCreditMemoLineStays        = "A line stays on its credit memo."
	msgCreditMemoLineNotDraft     = "Only the lines of a draft credit memo can change."
	msgCreditMemoLineRestating    = "Only a line's amount changes while Books restates its credit memo."
	msgCreditMemoLineUnknownKind  = "Line %d: a credit memo line is an item, description, subtotal or percent line."
	msgCreditMemoEditMissing      = "The credit memo being edited does not exist."
	msgCreditMemoRevisionConflict = "This credit memo changed after you opened it. Load it again, then review it before you save or post."
)

// docTypeCreditMemo is the doc type of a credit memo's sequence and of the
// entry it posts; entry_type_labels.json holds how a reader sees it.
const docTypeCreditMemo = "credit_memo"

// creditMemoKind is the credit memo as a sales document: it requires a
// customer, checks its date and the invoice it names, and posts the mirror of
// an invoice (Credit): Accounts receivable, which posting creates when the
// chart has none (ensureReceivables), is credited for the total, the income
// accounts and the tax liability accounts are debited. Its balance is the
// credit not yet refunded (creditMemoBalanceKind): the total at posting less
// the posted refund receipts that pay it out, 0 on a draft or a void memo. It
// has no CheckVoid and no Replace.
var creditMemoKind = salesDocKind{
	DocType:            docTypeCreditMemo,
	Lifecycle:          lifecyclePosting,
	Collection:         "books_credit_memos",
	LinesCollection:    "books_credit_memo_lines",
	TaxLinesCollection: "books_credit_memo_tax_lines",
	ParentField:        "credit_memo",
	HostKey:            creditMemoHostKey,
	LineTables:         []string{salesDocLinesKey},
	Party:              partyCustomer,
	PartyCollection:    "books_customers",
	AddressField:       "bill_to",
	CustomerRequired:   true,
	HasTax:             true,
	TracksBalance:      true,
	Credit:             true,
	Msgs: salesDocMessages{
		TotalNegative:    msgCreditMemoTotalNegative,
		TotalTooLarge:    msgCreditMemoTotalTooLarge,
		TooManyLines:     msgCreditMemoTooManyLines,
		ZeroTotal:        msgCreditMemoZeroTotal,
		PostedFromForm:   msgCreditMemoPostedFromForm,
		NotDraft:         msgCreditMemoNotDraft,
		DeleteNotDraft:   msgCreditMemoDeleteNotDraft,
		LineStays:        msgCreditMemoLineStays,
		LineNotDraft:     msgCreditMemoLineNotDraft,
		LineRestating:    msgCreditMemoLineRestating,
		LineUnknownKind:  msgCreditMemoLineUnknownKind,
		EditMissing:      msgCreditMemoEditMissing,
		CustomerOnDocs:   msgCustomerOnCreditMemos,
		RevisionConflict: msgCreditMemoRevisionConflict,
		PartyInactive:    msgCustomerInactive,
	},
	CheckHeader: checkCreditMemoHeader,
	CreditAccount: func(tx core.App, _ *core.Record) (string, error) {
		receivable, err := ensureReceivables(tx)
		if err != nil {
			return "", err
		}
		return receivable.Id, nil
	},
}

// checkCreditMemoHeader is the credit memo's own header guard on a draft
// write: the date is a real day, then the invoice it names.
func checkCreditMemoHeader(tx core.App, stored, r *core.Record) error {
	if _, err := parseDay(r.GetString("date")); err != nil {
		return refuseDocumentDay("date", err)
	}
	return checkCreditMemoInvoice(tx, stored, r)
}

// checkCreditMemoInvoice holds the memo's invoice link to a posted invoice of
// the memo's customer, inside the guards' serialized transaction. It runs only
// when the link or the customer is chosen: an update that changes neither
// passes, so a draft whose invoice was voided after the link was stored still
// saves and posts (a void keeps the link, spec Q18). A correction that keeps
// its original's invoice and customer passes for the same reason. A link an
// invoice correction moves (moveCreditMemoLinks) passes too: that Replace step
// runs before the correction is posted, so the link names an invoice that is
// not posted yet.
func checkCreditMemoInvoice(tx core.App, stored, r *core.Record) error {
	invoiceID := r.GetString("invoice")
	if invoiceID == "" || isMovingCreditMemoLink(tx, r.Id) {
		return nil
	}
	customer := r.GetString("customer")
	if stored != nil && stored.GetString("invoice") == invoiceID && stored.GetString("customer") == customer {
		return nil
	}
	if stored == nil {
		keeps, err := keepsOriginalInvoice(tx, r, invoiceID, customer)
		if err != nil || keeps {
			return err
		}
	}
	invoice, err := tx.FindRecordById("books_invoices", invoiceID)
	if errors.Is(err, sql.ErrNoRows) {
		return refuseField("invoice", msgCreditMemoInvoice)
	}
	if err != nil {
		return fmt.Errorf("books: read the credit memo's invoice: %w", err)
	}
	if invoice.GetString("status") != statusPosted || invoice.GetString("customer") != customer {
		return refuseField("invoice", msgCreditMemoInvoice)
	}
	return nil
}

// keepsOriginalInvoice reports whether r is a correction whose original
// names the same invoice and customer: the user did not choose that link
// again, so it holds even when the invoice was voided since.
func keepsOriginalInvoice(tx core.App, r *core.Record, invoiceID, customer string) (bool, error) {
	replaces := r.GetString("replaces")
	if replaces == "" {
		return false, nil
	}
	// The collection by name: creditMemoKind names this guard, so reading the
	// kind here would be an initialization cycle.
	original, err := tx.FindRecordById("books_credit_memos", replaces)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("books: read the credit memo being edited: %w", err)
	}
	return original.GetString("invoice") == invoiceID && original.GetString("customer") == customer, nil
}
