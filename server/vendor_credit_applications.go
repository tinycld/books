package books

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// Applying a vendor credit to bills (vendor credit spec §3.9, §3.10): a
// books_vendor_credit_applications row applies part of a posted credit to a
// posted bill of the same vendor on an apply date. The guards are the shared
// ones of credit_applications.go, with this kind.

// Refusal texts of the vendor credit's application guards. The client shows
// the bill's under that bill's row and the rest in its summary
// (APPLY_CREDIT_MESSAGES). These have their final period.
// msgApplyBeforeCreditDate is the apply date's refusal of every kind
// (checkApplicationDate), the credit memo's too.
const (
	msgApplyBeforeCreditDate = "The apply date can't be before the credit date."
	msgApplyCreditNotPosted  = "Only a posted vendor credit is applied to bills."
	msgApplyBillNotOpen      = "Bill %s is not open. Clear it to continue."
	msgApplyDraftBillNotOpen = "This bill is not open. Clear it to continue."
	msgApplyAboveBillBalance = "Bill %s: the credit is more than its open balance of %s."
	msgApplyAboveUnapplied   = "More than the unapplied credit of %s."
)

// vendorCreditApplicationKind applies a vendor credit to bills of its vendor.
// An amount above the credit's balance is refused under amount: the client
// sums its rows against the credit and shows that in its summary. The create
// and the delete of an application refresh the credit's stored payable rows
// in their transaction (AfterChange; in the delete, after the row is gone, so
// its two rows are dropped).
var vendorCreditApplicationKind = applicationKind{
	Collection:        vendorCreditApplicationsCollection,
	CreditField:       "vendor_credit",
	DocumentField:     "bill",
	Credit:            vendorCreditBalanceKind,
	Document:          billBalanceKind,
	PartyField:        "vendor",
	AboveUnappliedKey: "amount",
	Msgs: applicationMessages{
		CreditNotPosted:      msgApplyCreditNotPosted,
		DocumentNotOpen:      msgApplyBillNotOpen,
		DraftDocumentNotOpen: msgApplyDraftBillNotOpen,
		AboveDocumentBalance: msgApplyAboveBillBalance,
		AboveUnapplied: func(_ *core.Record, left string) string {
			return fmt.Sprintf(msgApplyAboveUnapplied, left)
		},
	},
	AfterChange: refreshPayableVendorCredit,
}

// registerVendorCreditApplications binds the shared application guards
// (registerCreditApplications) for the vendor credit, then the refresh of an
// application's payable rows after its update, bound after the guard so it
// runs inside the guard's transaction.
func registerVendorCreditApplications(app core.App) {
	registerCreditApplications(app, vendorCreditApplicationKind)
	bindPayableApplicationRefresh(app)
}
