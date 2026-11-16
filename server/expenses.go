package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// docTypeExpense is the doc type of an expense's sequence and of the entry it
// posts; entry_type_labels.json holds how a reader sees it.
const docTypeExpense = "expense"

// The expense's collections and the forms host of its two line tables
// (tinycld/books/forms/hosts.ts).
const (
	expensesCollection     = "books_expenses"
	expenseLinesCollection = "books_expense_lines"
	expenseHostKey         = "books:expense"
)

// Refusal texts of the expense guards. This group is shown by the client too,
// with the same words (EXPENSE_MESSAGES, lib/document-texts.ts), with the
// vendor text of server/bills.go and the line texts of
// server/purchase_lines.go. PocketBase adds a final period to a text without
// one; these have theirs. The %s of the Paid from and check number texts are
// names people typed, which refuseNamedField keeps as written.
const (
	msgExpenseTotalNegative    = "An expense total cannot be below zero."
	msgExpenseZeroTotal        = "An expense total must be more than zero to post."
	msgExpenseTotalTooLarge    = "The expense total is more than Books can store."
	msgExpenseTooManyLines     = "An expense holds at most 250 lines."
	msgExpensePaidFromType     = "Choose a bank or credit card account."
	msgExpensePaidFromInactive = "%s is inactive. Choose an active account."
	msgExpenseDuplicateCheckNo = "Check no. %s from %s is already on %s."
)

// Go-only refusal texts of the expense.
const (
	msgExpenseRevisionConflict = "This expense changed after you opened it. Load it again, then review it before you save or post."
	msgExpensePostedFromForm   = "A draft expense is posted from the expense form."
	msgExpenseNotDraft         = "A posted or void expense cannot be changed."
	msgExpenseDeleteNotDraft   = "Only a draft expense can be deleted."
	msgExpenseLineStays        = "A line stays on its expense."
	msgExpenseLineNotDraft     = "Only the lines of a draft expense can change."
	msgExpenseLineRestating    = "Only a line's amount changes while Books restates its expense."
	msgExpenseLineUnknownKind  = "Line %d: an expense line is an account line or a product line."
	msgExpenseEditMissing      = "The expense being edited does not exist."
)

// expenseDraftName names, in a duplicate check number refusal, an expense that
// has no number yet.
const expenseDraftName = "a draft expense"

// expenseKind is the expense as a purchase document of the shared layer: its
// party is an optional vendor, it has no address, its lines are the bill's
// account lines and product lines, it has no sales tax, and posting credits
// the account it was paid from (expensePaidFrom) for the total and debits
// each line's expense account (expenseByAccount). Posting creates no account.
// Its BeforePost is set in init: it reads the kind's own lines, and a field of
// expenseKind that names expenseKind is an initialization cycle.
var expenseKind = salesDocKind{
	DocType:            docTypeExpense,
	Lifecycle:          lifecyclePosting,
	Collection:         expensesCollection,
	LinesCollection:    expenseLinesCollection,
	TaxLinesCollection: "",
	ParentField:        "expense",
	HostKey:            expenseHostKey,
	LineTables:         []string{purchaseAccountLinesKey, purchaseItemLinesKey},
	LineRowLabels:      purchaseLineRowLabels,
	Party:              partyVendor,
	PartyCollection:    "books_vendors",
	AddressField:       "",
	CustomerRequired:   false,
	// The vendor check is a Post check: a draft may name an inactive vendor.
	PartyCheckedOnPost: true,
	HasTax:             false,
	Msgs: salesDocMessages{
		TotalNegative:    msgExpenseTotalNegative,
		TotalTooLarge:    msgExpenseTotalTooLarge,
		TooManyLines:     msgExpenseTooManyLines,
		ZeroTotal:        msgExpenseZeroTotal,
		PostedFromForm:   msgExpensePostedFromForm,
		NotDraft:         msgExpenseNotDraft,
		DeleteNotDraft:   msgExpenseDeleteNotDraft,
		LineStays:        msgExpenseLineStays,
		LineNotDraft:     msgExpenseLineNotDraft,
		LineRestating:    msgExpenseLineRestating,
		LineUnknownKind:  msgExpenseLineUnknownKind,
		EditMissing:      msgExpenseEditMissing,
		PartyInactive:    msgVendorInactive,
		RevisionConflict: msgExpenseRevisionConflict,
	},
	CheckHeader:   checkExpenseHeader,
	CreditAccount: expensePaidFrom,
	LineAccounts:  expenseByAccount,
	// A posted correction takes every file of the expense it replaces.
	Replace: func(tx core.App, original, correction *core.Record) error {
		return moveAttachments(tx, "expense", original.Id, correction.Id)
	},
}

func init() {
	expenseKind.BeforePost = expenseBeforePost
}

// checkExpenseHeader is the expense's own header guard on a draft write: the
// payment date is a real day, Paid from is a bank or credit card account (an
// inactive one passes here; Post refuses it), and a check number is not on
// another expense or bill payment (checkCheckNo). payment_method and
// reference_no are held by the schema (a PAYMENT_METHODS key, required; at
// most 40 characters).
func checkExpenseHeader(tx core.App, _, r *core.Record) error {
	if _, err := parseDay(r.GetString("date")); err != nil {
		return refuseDocumentDay("date", err)
	}
	if _, err := checkExpensePaidFrom(tx, r, false); err != nil {
		return err
	}
	return checkCheckNo(tx, expensesCollection, r)
}

// isPaymentAccount reports whether an expense may be paid from account: a
// bank or a credit card account.
func isPaymentAccount(account *core.Record) bool {
	switch account.GetString("type") {
	case "bank", "credit_card":
		return true
	}
	return false
}

// checkExpensePaidFrom reads r's Paid from account and refuses, under
// paid_from, one that is not a bank or credit card account and, with
// requireActive, one that is inactive ("1000 Business Checking is inactive.").
// An empty or missing account returns nil with no refusal: the schema refuses
// it (paid_from is a required relation), with its own text.
func checkExpensePaidFrom(tx core.App, r *core.Record, requireActive bool) (*core.Record, error) {
	id := r.GetString("paid_from")
	if id == "" {
		return nil, nil
	}
	account, err := tx.FindRecordById("books_accounts", id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the expense's Paid from account: %w", err)
	}
	if !isPaymentAccount(account) {
		return nil, refuseField("paid_from", msgExpensePaidFromType)
	}
	if requireActive && account.GetBool("inactive") {
		return nil, refuseNamedField("paid_from", msgExpensePaidFromInactive, accountDisplayName(account))
	}
	return account, nil
}

// expenseBeforePost is the expense's BeforePost: the purchase line checks of
// Post, then Paid from read again and held to be an active bank or credit
// card account.
func expenseBeforePost(tx core.App, doc *core.Record) error {
	if err := checkPurchaseLinesToPost(tx, expenseKind, doc); err != nil {
		return err
	}
	_, err := checkExpensePaidFrom(tx, doc, true)
	return err
}

// expensePaidFrom is the expense's CreditAccount: its Paid from, read inside
// the posting transaction and checked again (it exists, is active, and is a
// bank or credit card account), so the entry credits the account as it is
// now, not as the draft's save saw it.
func expensePaidFrom(tx core.App, doc *core.Record) (string, error) {
	account, err := checkExpensePaidFrom(tx, doc, true)
	if err != nil {
		return "", err
	}
	if account == nil {
		return "", refuseField("paid_from", msgExpensePaidFromType)
	}
	return account.Id, nil
}
