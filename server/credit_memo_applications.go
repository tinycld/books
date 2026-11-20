package books

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// Applying a credit memo to invoices (apply credit spec §3.4, §4.3): a
// books_credit_memo_applications row applies part of a posted credit memo to
// a posted invoice of the same customer on an apply date. The guards are the
// shared ones of credit_applications.go, with this kind; the memo's applied
// holds the sum of its applications.

const creditMemoApplicationsCollection = "books_credit_memo_applications"

// Refusal texts of the credit memo's application guards. The client shows the
// invoice's and the memo's under the row of the refused insert and the rest in
// its summary. These have their final period.
const (
	msgApplyMemoNotPosted       = "Only a posted credit memo is applied to invoices."
	msgApplyInvoiceNotOpen      = "Invoice %s is not open. Clear it to continue."
	msgApplyDraftInvoiceNotOpen = "This invoice is not open. Clear it to continue."
	msgApplyAboveInvoiceBalance = "Invoice %s: the credit is more than its open balance of %s."
	msgApplyAboveMemoUnapplied  = "Credit memo %s has %s of unapplied credit. Clear it or lower the amount."
)

// Refusals of a credit memo or an invoice that applications name (apply
// credit spec §3.5, §3.6). The below-total texts take money; the apply-date
// text the invoice's number and the day as "Nov 16, 2026".
const (
	msgCreditMemoVoidApplied               = "This credit is applied to invoices. Remove it from those invoices first."
	msgCreditMemoCorrectionBelowApplied    = "%s of this credit is applied to invoices. Its total cannot be below that."
	msgCreditMemoCorrectionBelowAll        = "%s of this credit is applied or refunded. Its total cannot be below that."
	msgCreditMemoCorrectionCustomerApplied = "This credit is applied to invoices, so its customer cannot change."
	msgCreditMemoCorrectionApplyDate       = "This credit is applied to invoice %s on %s. Date the credit memo on or before that day."
	msgInvoiceVoidCredited                 = "Credit memos are applied to this invoice. Remove them first."
	msgInvoiceCorrectionBelowAll           = "Payments and credits of %s are applied to this invoice. Its total cannot be below that."
	msgInvoiceCorrectionCustomerCredited   = "Credit memos are applied to this invoice, so its customer cannot change."
)

// creditMemoApplicationKind applies a credit memo to invoices of its customer
// (not a sub-customer's, Q9). An amount above the memo's balance is refused
// under credit_memo, with the memo's number: the client shows it under the row
// of that insert. The create and the delete of an application refresh the
// memo's stored receivable rows in their transaction (AfterChange; in the
// delete, after the row is gone, so its rows are dropped). The save of the
// memo's new balance (saveDocumentBalance) is an update of the memo, so
// bindReceivableCreditMemoRefresh refreshes the same rows earlier in that
// transaction; AfterChange's refresh repeats it and writes the same rows.
var creditMemoApplicationKind = applicationKind{
	Collection:        creditMemoApplicationsCollection,
	CreditField:       "credit_memo",
	DocumentField:     "invoice",
	Credit:            creditMemoBalanceKind,
	Document:          invoiceBalanceKind,
	PartyField:        "customer",
	AppliedField:      "applied",
	AboveUnappliedKey: "credit_memo",
	Msgs: applicationMessages{
		CreditNotPosted:      msgApplyMemoNotPosted,
		DocumentNotOpen:      msgApplyInvoiceNotOpen,
		DraftDocumentNotOpen: msgApplyDraftInvoiceNotOpen,
		AboveDocumentBalance: msgApplyAboveInvoiceBalance,
		AboveUnapplied: func(memo *core.Record, left string) string {
			return fmt.Sprintf(msgApplyAboveMemoUnapplied, memo.GetString("number"), left)
		},
	},
	AfterChange: refreshReceivableCreditMemo,
}

// registerCreditMemoApplications binds the shared application guards
// (registerCreditApplications) for the credit memo, then the refresh of the
// memo's receivable rows after an application's update, bound after the
// guard so it runs inside the guard's transaction.
func registerCreditMemoApplications(app core.App) {
	registerCreditApplications(app, creditMemoApplicationKind)
	bindReceivableCreditMemoApplicationRefresh(app)
}
