package books

import (
	"github.com/pocketbase/pocketbase/core"
)

// The vendor credit's forms host (tinycld/books/forms/hosts.ts), its
// collections and the doc type of its sequence and of the entry it posts;
// entry_type_labels.json holds how a reader sees the doc type. Its two line
// tables are the purchase tables of server/purchase_lines.go.
const (
	docTypeVendorCredit                = "vendor_credit"
	vendorCreditHostKey                = "books:vendor_credit"
	vendorCreditsCollection            = "books_vendor_credits"
	vendorCreditLinesCollection        = "books_vendor_credit_lines"
	vendorCreditApplicationsCollection = "books_vendor_credit_applications"
)

// Refusal texts of the vendor credit guards. This group is shown by the client
// too, with the same words (VENDOR_CREDIT_MESSAGES, lib/document-texts.ts),
// with the line texts of server/purchase_lines.go; an inactive vendor is
// refused with the shared msgVendorInactive (bills.go). PocketBase adds a
// final period to a text without one; these have theirs. The first %s of the
// duplicate text is a name people typed, which refuseNamedField keeps as
// written.
const (
	msgVendorCreditTotalNegative = "A vendor credit total cannot be below zero. Use a bill."
	msgVendorCreditZeroTotal     = "A vendor credit total must be more than zero to post."
	msgVendorCreditTotalTooLarge = "The vendor credit total is more than Books can store."
	msgVendorCreditTooManyLines  = "A vendor credit holds at most 250 lines."
	msgVendorCreditDuplicateRef  = "%s already has credit no. %s (%s)."
)

// Go-only refusal texts of the vendor credit.
const (
	msgVendorCreditRevisionConflict = "This vendor credit changed after you opened it. Load it again, then review it before you save or post."
	msgVendorCreditPostedFromForm   = "A draft vendor credit is posted from the vendor credit form."
	msgVendorCreditNotDraft         = "A posted or void vendor credit cannot be changed."
	msgVendorCreditDeleteNotDraft   = "Only a draft vendor credit can be deleted."
	msgVendorCreditLineStays        = "A line stays on its vendor credit."
	msgVendorCreditLineNotDraft     = "Only the lines of a draft vendor credit can change."
	msgVendorCreditLineRestating    = "Only a line's amount changes while Books restates its vendor credit."
	msgVendorCreditLineUnknownKind  = "Line %d: a vendor credit line is an account line or a product line."
	msgVendorCreditEditMissing      = "The vendor credit being edited does not exist."
)

// vendorCreditDraftName names, in a duplicate credit no. refusal, a vendor
// credit that has no number yet.
const vendorCreditDraftName = "a draft vendor credit"

// vendorCreditKind is the vendor credit as a purchase document of the shared
// layer, the mirror of a bill (Credit): its party is the vendor, its lines
// are account lines and product lines, it has no sales tax and no address,
// and posting debits Accounts payable (which posting creates when the chart
// has none, ensurePayables) for the total and credits each line's expense
// account (expenseByAccount, mirrored). Its balance is the credit not yet
// applied to bills (vendorCreditBalanceKind). A correction takes its
// original's files (replaceVendorCredit). Its BeforePost is set in init: it
// reads the kind's own lines, and a field of vendorCreditKind that names
// vendorCreditKind is an initialization cycle.
var vendorCreditKind = salesDocKind{
	DocType:            docTypeVendorCredit,
	Lifecycle:          lifecyclePosting,
	Collection:         vendorCreditsCollection,
	LinesCollection:    vendorCreditLinesCollection,
	TaxLinesCollection: "",
	ParentField:        "vendor_credit",
	HostKey:            vendorCreditHostKey,
	LineTables:         []string{purchaseAccountLinesKey, purchaseItemLinesKey},
	LineRowLabels:      purchaseLineRowLabels,
	Party:              partyVendor,
	PartyCollection:    "books_vendors",
	AddressField:       "",
	CustomerRequired:   true,
	HasTax:             false,
	TracksBalance:      true,
	Credit:             true,
	Msgs: salesDocMessages{
		TotalNegative:    msgVendorCreditTotalNegative,
		TotalTooLarge:    msgVendorCreditTotalTooLarge,
		TooManyLines:     msgVendorCreditTooManyLines,
		ZeroTotal:        msgVendorCreditZeroTotal,
		PostedFromForm:   msgVendorCreditPostedFromForm,
		NotDraft:         msgVendorCreditNotDraft,
		DeleteNotDraft:   msgVendorCreditDeleteNotDraft,
		LineStays:        msgVendorCreditLineStays,
		LineNotDraft:     msgVendorCreditLineNotDraft,
		LineRestating:    msgVendorCreditLineRestating,
		LineUnknownKind:  msgVendorCreditLineUnknownKind,
		EditMissing:      msgVendorCreditEditMissing,
		PartyInactive:    msgVendorInactive,
		RevisionConflict: msgVendorCreditRevisionConflict,
	},
	CheckHeader: checkVendorCreditHeader,
	DebitAccount: func(tx core.App, _ *core.Record) (string, error) {
		payable, err := ensurePayables(tx)
		if err != nil {
			return "", err
		}
		return payable.Id, nil
	},
	LineAccounts: expenseByAccount,
	Replace:      replaceVendorCredit,
}

func init() {
	vendorCreditKind.BeforePost = func(tx core.App, doc *core.Record) error {
		return checkPurchaseLinesToPost(tx, vendorCreditKind, doc)
	}
}

// replaceVendorCredit is the vendor credit's Replace step: the correction
// takes every file of the original.
func replaceVendorCredit(tx core.App, original, correction *core.Record) error {
	return moveAttachments(tx, "vendor_credit", original.Id, correction.Id)
}

// checkVendorCreditHeader is the vendor credit's own header guard on a draft
// write: the credit date is a real day, then the vendor's credit no.
func checkVendorCreditHeader(tx core.App, _, r *core.Record) error {
	if _, err := parseDay(r.GetString("date")); err != nil {
		return refuseField("date", msgDocumentDay)
	}
	return checkVendorCreditRef(tx, r)
}

// checkVendorCreditRef refuses a vendor's credit no. that another vendor
// credit of the same vendor already has (checkVendorRef). A bill's number of
// the same vendor never clashes with it.
func checkVendorCreditRef(tx core.App, r *core.Record) error {
	return checkVendorRef(tx, r, vendorCreditsCollection, docTypeVendorCredit, vendorCreditDraftName, msgVendorCreditDuplicateRef)
}
