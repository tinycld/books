package books

import (
	"github.com/pocketbase/pocketbase/core"
)

// The invoice's forms host (tinycld/books/forms/hosts.ts).
const invoiceHostKey = "books:invoice"

// Refusal texts of the invoice guards. The first group is shown by the client
// too (tinycld/books/lib/invoice-messages.ts); tests/invoice-messages.test.ts
// fails when they drift. PocketBase adds the final period to a text without
// one. %s is the customer's name, which refuseNamedField keeps as typed.
// msgPercentTarget and msgCustomerInactive are the words of every sales
// document kind; the guards in sales_documents.go read them from here.
const (
	msgDueBeforeDate      = "The due date cannot be before the invoice date"
	msgPercentTarget      = "A percent line applies to the item or subtotal right above it"
	msgTotalNegative      = "An invoice total cannot be below zero. Use a credit memo."
	msgTotalTooLarge      = "The invoice total is more than Books can store."
	msgTooManyLines       = "An invoice can have at most 250 lines."
	msgCustomerInactive   = "%s is inactive. Choose an active customer."
	msgCustomerOnInvoices = "%s is on invoices. Make it inactive instead."
)

// Go-only refusal texts of the invoice.
const (
	msgZeroTotal             = "An invoice with a total of zero cannot be posted. Add an amount or keep it as a draft."
	msgInvoicePostedFromForm = "A draft invoice is posted from the invoice form."
	msgInvoiceNotDraft       = "A posted or void invoice cannot be changed."
	msgInvoiceDeleteNotDraft = "Only a draft invoice can be deleted."
	msgLineStaysOnInvoice    = "A line stays on its invoice."
	msgLineInvoiceNotDraft   = "Only the lines of a draft invoice can change."
	msgLineRestating         = "Only a line's amount changes while Books restates its invoice."
	msgLineUnknownKind       = "Line %d: an invoice line is an item, description, subtotal or percent line."
	msgInvoiceEditMissing    = "The invoice being edited does not exist."
)

// docTypeInvoice is the doc type of an invoice's sequence and of the entry it
// posts; entry_type_labels.json holds how a reader sees it.
const docTypeInvoice = "invoice"

// invoiceKind is the invoice as a sales document: it requires a customer,
// checks its two days and the estimate it is made from, and debits Accounts
// receivable, which posting creates when the chart has none
// (ensureReceivables). Its create closes that estimate, its draft delete or
// void reopens it, and a correction's post moves it to the correction
// (estimate_conversion.go).
var invoiceKind = salesDocKind{
	DocType:            docTypeInvoice,
	Lifecycle:          lifecyclePosting,
	Collection:         "books_invoices",
	LinesCollection:    "books_invoice_lines",
	TaxLinesCollection: "books_invoice_tax_lines",
	ParentField:        "invoice",
	HostKey:            invoiceHostKey,
	CustomerRequired:   true,
	Msgs: salesDocMessages{
		TotalNegative:   msgTotalNegative,
		TotalTooLarge:   msgTotalTooLarge,
		TooManyLines:    msgTooManyLines,
		ZeroTotal:       msgZeroTotal,
		PostedFromForm:  msgInvoicePostedFromForm,
		NotDraft:        msgInvoiceNotDraft,
		DeleteNotDraft:  msgInvoiceDeleteNotDraft,
		LineStays:       msgLineStaysOnInvoice,
		LineNotDraft:    msgLineInvoiceNotDraft,
		LineRestating:   msgLineRestating,
		LineUnknownKind: msgLineUnknownKind,
		EditMissing:     msgInvoiceEditMissing,
		CustomerOnDocs:  msgCustomerOnInvoices,
	},
	CheckHeader: func(tx core.App, stored, r *core.Record) error {
		if err := checkInvoiceDays(r); err != nil {
			return err
		}
		return checkInvoiceEstimate(tx, stored, r)
	},
	AfterCreate: closeEstimateFor,
	Withdraw:    reopenEstimate,
	Replace:     moveEstimateTo,
	DebitAccount: func(tx core.App, _ *core.Record) (string, error) {
		receivable, err := ensureReceivables(tx)
		if err != nil {
			return "", err
		}
		return receivable.Id, nil
	},
}

func checkInvoiceDays(r *core.Record) error {
	date, err := parseDay(r.GetString("date"))
	if err != nil {
		return refuseField("date", msgDocumentDay)
	}
	due, err := parseDay(r.GetString("due_date"))
	if err != nil {
		return refuseField("due_date", msgDocumentDay)
	}
	if due.Before(date) {
		return refuseField("due_date", msgDueBeforeDate)
	}
	return nil
}
