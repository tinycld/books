package books

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The invoice's forms host (tinycld/books/forms/hosts.ts).
const invoiceHostKey = "books:invoice"

// Refusal texts of the invoice guards. The first group is shown by the client
// too (tinycld/books/lib/invoice-messages.ts); tests/invoice-messages.test.ts
// fails when they drift. PocketBase adds the final period to a text without
// one. %s is the customer's name, which refuseNamedField keeps as typed.
// msgPercentTarget and msgCustomerInactive are the words of every sales
// document kind: the guards in sales_documents.go read msgPercentTarget from
// here, and each sales kind's Msgs.PartyInactive is msgCustomerInactive.
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
	msgZeroTotal               = "An invoice with a total of zero cannot be posted. Add an amount or keep it as a draft."
	msgInvoicePostedFromForm   = "A draft invoice is posted from the invoice form."
	msgInvoiceNotDraft         = "A posted or void invoice cannot be changed."
	msgInvoiceDeleteNotDraft   = "Only a draft invoice can be deleted."
	msgLineStaysOnInvoice      = "A line stays on its invoice."
	msgLineInvoiceNotDraft     = "Only the lines of a draft invoice can change."
	msgLineRestating           = "Only a line's amount changes while Books restates its invoice."
	msgLineUnknownKind         = "Line %d: an invoice line is an item, description, subtotal or percent line."
	msgInvoiceEditMissing      = "The invoice being edited does not exist."
	msgInvoiceRevisionConflict = "This invoice changed after you opened it. Load it again, then review it before you save or post."
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
	LineTables:         []string{salesDocLinesKey},
	Party:              partyCustomer,
	PartyCollection:    "books_customers",
	AddressField:       "bill_to",
	CustomerRequired:   true,
	HasTax:             true,
	Msgs: salesDocMessages{
		TotalNegative:    msgTotalNegative,
		TotalTooLarge:    msgTotalTooLarge,
		TooManyLines:     msgTooManyLines,
		ZeroTotal:        msgZeroTotal,
		PostedFromForm:   msgInvoicePostedFromForm,
		NotDraft:         msgInvoiceNotDraft,
		DeleteNotDraft:   msgInvoiceDeleteNotDraft,
		LineStays:        msgLineStaysOnInvoice,
		LineNotDraft:     msgLineInvoiceNotDraft,
		LineRestating:    msgLineRestating,
		LineUnknownKind:  msgLineUnknownKind,
		EditMissing:      msgInvoiceEditMissing,
		CustomerOnDocs:   msgCustomerOnInvoices,
		RevisionConflict: msgInvoiceRevisionConflict,
		PartyInactive:    msgCustomerInactive,
	},
	CheckHeader: func(tx core.App, stored, r *core.Record) error {
		if err := checkInvoiceDays(r); err != nil {
			return err
		}
		return checkInvoiceEstimate(tx, stored, r)
	},
	TracksBalance: true,
	AfterCreate:   closeEstimateFor,
	Withdraw:      reopenEstimate,
	CheckVoid:     refuseVoidWithPayments,
	Replace: func(tx core.App, original, correction *core.Record) error {
		if err := moveInvoicePayments(tx, original, correction); err != nil {
			return err
		}
		return moveEstimateTo(tx, original, correction)
	},
	DebitAccount: func(tx core.App, _ *core.Record) (string, error) {
		receivable, err := ensureReceivables(tx)
		if err != nil {
			return "", err
		}
		return receivable.Id, nil
	},
}

// Refusals of an invoice that payments pay (receive payment spec §3.9, Q5).
// %s is the amount applied.
const (
	msgInvoiceVoidWithPayments    = "Payments are applied to this invoice. Void or edit those payments first."
	msgInvoiceCorrectionBelowPaid = "Payments of %s are applied to this invoice. Its total cannot be below that."
	msgInvoiceCorrectionCustomer  = "Payments are applied to this invoice, so its customer cannot change."
)

// refuseVoidWithPayments is the invoice's CheckVoid: an invoice that a posted
// payment pays stays posted until that payment is voided or edited. A draft
// payment's application does not hold it.
func refuseVoidWithPayments(tx core.App, doc *core.Record) error {
	var row struct {
		N int `db:"n"`
	}
	err := tx.DB().NewQuery(`
		SELECT COUNT(*) AS n FROM books_payment_applications a
		JOIN books_payments p ON p.id = a.payment
		WHERE a.invoice = {:invoice} AND p.status = 'posted'`).
		Bind(dbx.Params{"invoice": doc.Id}).One(&row)
	if err != nil {
		return fmt.Errorf("books: count the payments applied to the invoice: %w", err)
	}
	if row.N > 0 {
		return refuse(msgInvoiceVoidWithPayments)
	}
	return nil
}

// moveInvoicePayments is the payment part of an invoice correction's Replace
// step: while posted payments apply to the original, the correction keeps its
// customer and a total of at least what they apply; then every application
// of the original (a draft payment's too) moves to the correction, except a
// void payment's, which stays on the original.
func moveInvoicePayments(tx core.App, original, correction *core.Record) error {
	applied, err := postedAppliedTo(tx, invoiceBalanceKind, original.Id)
	if err != nil {
		return err
	}
	if applied > 0 {
		if correction.GetString("customer") != original.GetString("customer") {
			return refuse(msgInvoiceCorrectionCustomer)
		}
		if int64(correction.GetInt("total")) < applied {
			return refuse(msgInvoiceCorrectionBelowPaid, formatMoney(applied, correction.GetString("currency")))
		}
	}
	return moveUnvoidedLines(tx, invoiceBalanceKind, original, correction)
}

func checkInvoiceDays(r *core.Record) error {
	date, err := parseDay(r.GetString("date"))
	if err != nil {
		return refuseDocumentDay("date", err)
	}
	due, err := parseDay(r.GetString("due_date"))
	if err != nil {
		return refuseDocumentDay("due_date", err)
	}
	if due.Before(date) {
		return refuseField("due_date", msgDueBeforeDate)
	}
	return nil
}
