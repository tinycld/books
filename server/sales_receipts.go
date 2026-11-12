package books

import (
	"github.com/pocketbase/pocketbase/core"
)

// The sales receipt's forms host (tinycld/books/forms/hosts.ts).
const salesReceiptHostKey = "books:sales_receipt"

// Refusal texts of the sales receipt guards. This group is shown by the client
// too, with the same words. PocketBase adds the final period to a text without
// one. %s is the customer's name, which refuseNamedField keeps as typed. The
// customer guards of every kind refuse with msgCustomerInactive (invoices.go),
// whose words msgReceiptCustomerInactive repeats so this list holds every text
// the receipt's client shows.
const (
	msgReceiptTotalNegative    = "A sales receipt total cannot be below zero. Use a refund receipt."
	msgReceiptTotalTooLarge    = "The sales receipt total is more than Books can store."
	msgReceiptTooManyLines     = "A sales receipt can have at most 250 lines."
	msgReceiptCustomerInactive = "%s is inactive. Choose an active customer."
	msgCustomerOnSalesReceipts = "%s is on sales receipts. Make it inactive instead."
	msgReceiptDepositInvalid   = "Choose an active bank or Undeposited funds account"
	msgReceiptDepositNone      = "Add a bank account or an Undeposited funds account to the chart of accounts"
)

// Go-only refusal texts of the sales receipt.
const (
	msgReceiptZeroTotal       = "A sales receipt with a total of zero cannot be posted. Add an amount or keep it as a draft."
	msgReceiptPostedFromForm  = "A draft sales receipt is posted from the sales receipt form."
	msgReceiptNotDraft        = "A posted or void sales receipt cannot be changed."
	msgReceiptDeleteNotDraft  = "Only a draft sales receipt can be deleted."
	msgReceiptLineStays       = "A line stays on its sales receipt."
	msgReceiptLineNotDraft    = "Only the lines of a draft sales receipt can change."
	msgReceiptLineRestating   = "Only a line's amount changes while Books restates its sales receipt."
	msgReceiptLineUnknownKind = "Line %d: a sales receipt line is an item, description, subtotal or percent line."
	msgReceiptEditMissing     = "The sales receipt being edited does not exist."
)

// docTypeSalesReceipt is the doc type of a sales receipt's sequence and of the
// entry it posts; entry_type_labels.json holds how a reader sees it.
const docTypeSalesReceipt = "sales_receipt"

// salesReceiptKind is the sales receipt as a sales document: an optional
// customer, one date, a deposit account (sales_deposit.go) that the posting
// debits for the total. Posting never creates an account.
var salesReceiptKind = salesDocKind{
	DocType:            docTypeSalesReceipt,
	Collection:         "books_sales_receipts",
	LinesCollection:    "books_sales_receipt_lines",
	TaxLinesCollection: "books_sales_receipt_tax_lines",
	ParentField:        "sales_receipt",
	HostKey:            salesReceiptHostKey,
	CustomerRequired:   false,
	Msgs: salesDocMessages{
		TotalNegative:   msgReceiptTotalNegative,
		TotalTooLarge:   msgReceiptTotalTooLarge,
		TooManyLines:    msgReceiptTooManyLines,
		ZeroTotal:       msgReceiptZeroTotal,
		PostedFromForm:  msgReceiptPostedFromForm,
		NotDraft:        msgReceiptNotDraft,
		DeleteNotDraft:  msgReceiptDeleteNotDraft,
		LineStays:       msgReceiptLineStays,
		LineNotDraft:    msgReceiptLineNotDraft,
		LineRestating:   msgReceiptLineRestating,
		LineUnknownKind: msgReceiptLineUnknownKind,
		EditMissing:     msgReceiptEditMissing,
		CustomerOnDocs:  msgCustomerOnSalesReceipts,
	},
	CheckHeader:  checkSalesReceiptHeader,
	BeforePost:   checkReceiptDepositToPost,
	DebitAccount: func(_ core.App, doc *core.Record) (string, error) { return doc.GetString("deposit_to"), nil },
}

// checkSalesReceiptHeader is the receipt's own header guard on a draft write:
// the sale date is a real day, and the deposit account follows "Sales
// deposited to" (checkReceiptDeposit). reference_no and payment_method are
// held by the schema (at most 40 characters; a PAYMENT_METHODS key).
func checkSalesReceiptHeader(tx core.App, stored, r *core.Record) error {
	if _, err := parseDay(r.GetString("date")); err != nil {
		return refuseField("date", msgDocumentDay)
	}
	return checkReceiptDeposit(tx, stored, r)
}
