package books

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// docTypePayment is the doc type of a received payment's sequence and of the
// entry it posts; entry_type_labels.json holds how a reader sees it.
const docTypePayment = "payment"

const (
	paymentsCollection     = "books_payments"
	applicationsCollection = "books_payment_applications"
)

// maxPaymentApplications is the most invoices one payment applies to.
const maxPaymentApplications = 500

// Refusal texts of the payment guards (receive payment spec §4.3). The texts
// that name a customer or an invoice keep the name as written
// (refuseNamedField). The deposit account's text is the sales receipt's
// (msgReceiptDepositInvalid), and an inactive customer's is every sales kind's
// (msgCustomerInactive).
const (
	msgPaymentCustomerRequired = "Choose a customer."
	msgPaymentAmountRequired   = "Enter the amount received."
	msgPaymentAmountTooLarge   = "The amount is more than Books can store."
	msgPaymentInvoiceNotOpen   = "Invoice %s is not a posted invoice of this customer."
	msgPaymentInvoiceTwice     = "Invoice %s is already on this payment."
	msgPaymentApplicationZero  = "Invoice %s: enter a payment more than 0."
	msgPaymentAboveBalance     = "Invoice %s: the payment is more than its open balance of %s."
	msgPaymentTooManyInvoices  = "A payment can apply to at most 500 invoices."
	msgPaymentOverApplied      = "The payments add up to %s, more than the %s received."
	msgPaymentInvoicesNotDraft = "Only the invoices of a draft payment can change."
	msgPaymentApplicationStays = "An invoice row stays on its payment."
	msgPaymentNotDraft         = "A posted or void payment cannot be changed."
	msgPaymentDeleteNotDraft   = "Only a draft payment can be deleted."
	msgPaymentPostedFromForm   = "A draft payment is posted from the payment form."
	msgPaymentEditMissing      = "The payment being edited does not exist."
	// A correction (a payment with `replaces`) keeps its original's customer
	// (spec §3.6).
	msgPaymentCorrectionCustomer = "An edited payment keeps the customer of the payment it replaces."
	// %s is the customer's name (refuseNamed).
	msgCustomerOnPayments = "%s is on payments. Make it inactive instead."
	// The payments whose Deposit to is an account being deleted.
	msgAccountDepositOfOnePayment = "This account is the deposit account of 1 payment and cannot be deleted. Make it inactive instead."
	msgAccountDepositOfPayments   = "This account is the deposit account of %d payments and cannot be deleted. Make it inactive instead."
)

// The payment fields only Books writes. paymentNewBooksFields must be empty on
// a new payment; paymentKeptBooksFields cannot change while a person edits a
// draft. posted_by is not kept: a Go caller names the poster with the post, as
// for a sales document. The rules pin them for a person; these checks hold for
// Go and a superuser too.
var (
	paymentNewBooksFields = []string{
		"number", "sequence", "applied", "credited", "entry", "replaced_by", "posted_at", "posted_by", "voided_at", "voided_by",
	}
	paymentKeptBooksFields = []string{
		"number", "sequence", "applied", "credited", "currency", "entry", "replaces", "replaced_by", "posted_at", "voided_at", "voided_by",
	}
)

// paymentName is how a refusal and the audit log name a payment: "Payment
// 1004", or "Draft payment" while it has no number.
func paymentName(r *core.Record) string {
	noun, _, draft := entryNouns(docTypePayment)
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return draft
}

// invoiceRef is how a payment refusal names an invoice: its number, or
// "(draft)" for a draft invoice, which has none.
func invoiceRef(inv *core.Record) string {
	if n := inv.GetString("number"); n != "" {
		return n
	}
	return "(draft)"
}

// applicationField is the refusal key of an application: the client shows it
// under that row's Payment cell.
func applicationField(application *core.Record) string {
	return fmt.Sprintf("applications.%d", application.GetInt("position"))
}

// registerPaymentGuards binds the payment and application guards inside
// serialized, so no other write can commit between a check and the write it
// allows. A payment's lifecycle is a sales document's: a draft is edited and
// posted (postPayment), a posted payment is voided (voidPayment) or replaced
// by its correction's post, and a draft alone is deleted. Its applications
// change only while it is a draft, except when an invoice correction moves
// them (moveUnvoidedLines).
func registerPaymentGuards(app core.App) {
	bindSerializedGuard(app, paymentsCollection, func(tx core.App, stored, r *core.Record) error {
		if stored == nil {
			return createPayment(tx, r)
		}
		return transitionPayment(tx, stored, r, time.Now())
	})
	app.OnRecordDelete(paymentsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			stored, err := tx.FindRecordById(paymentsCollection, e.Record.Id)
			if err != nil {
				return err
			}
			if stored.GetString("status") != statusDraft {
				return refuse(msgPaymentDeleteNotDraft)
			}
			return nil
		})
	})
	// A person's post or void is stamped with who did it, on the transition
	// only; the update rule refuses these fields in a person's body.
	app.OnRecordUpdateRequest(paymentsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		from, to := e.Record.Original().GetString("status"), e.Record.GetString("status")
		if from != to {
			switch to {
			case statusPosted:
				stampActor(e.Record, "posted_by", e.Auth)
			case statusVoid:
				stampActor(e.Record, "voided_by", e.Auth)
			}
		}
		return e.Next()
	})

	bindSerializedGuard(app, applicationsCollection, validatePaymentApplication)
	app.OnRecordDelete(applicationsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			// A draft payment's delete cascades its applications after the
			// payment row is gone: nothing is left to hold them.
			payment, err := tx.FindRecordById(paymentsCollection, e.Record.GetString("payment"))
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			if err != nil {
				return fmt.Errorf("books: read the application's payment: %w", err)
			}
			if payment.GetString("status") != statusDraft {
				return refuse(msgPaymentInvoicesNotDraft)
			}
			return nil
		})
	})
	bindReceivablePaymentRefresh(app)
}

// createPayment guards a new payment: it starts as a draft with none of the
// fields Books writes, takes the books currency, and passes the header guards.
func createPayment(tx core.App, r *core.Record) error {
	ensureRecordID(r)
	if r.GetString("status") != statusDraft {
		return refuse(msgPaymentPostedFromForm)
	}
	var set []string
	for _, name := range paymentNewBooksFields {
		// An empty number field reads "0".
		if v := r.GetString(name); v != "" && v != "0" {
			set = append(set, name)
		}
	}
	if err := refuseServerFields(set); err != nil {
		return err
	}
	if err := stampCurrency(tx, r); err != nil {
		return err
	}
	return checkPaymentHeader(tx, nil, r)
}

// replacePaymentEditable are the only fields a correction's post changes on
// the payment it replaces; voidPaymentEditable the only fields a void changes.
var (
	voidPaymentEditable    = map[string]bool{"status": true, "voided_by": true, "voided_at": true}
	replacePaymentEditable = map[string]bool{"status": true, "voided_by": true, "voided_at": true, "replaced_by": true}
)

// transitionPayment is the payment's lifecycle. stored is the row before the
// update.
func transitionPayment(tx core.App, stored, r *core.Record, now time.Time) error {
	from, to := stored.GetString("status"), r.GetString("status")
	switch {
	case from == statusDraft && to == statusDraft:
		if err := checkPaymentBooksFieldsKept(stored, r); err != nil {
			return err
		}
		return checkPaymentHeader(tx, stored, r)
	case from == statusDraft && to == statusPosted:
		if err := checkPaymentBooksFieldsKept(stored, r); err != nil {
			return err
		}
		if err := checkPaymentHeader(tx, stored, r); err != nil {
			return err
		}
		return postPayment(tx, r, now)
	case from == statusPosted && to == statusVoid && isReplacingPayment(tx, r.Id):
		if len(changedFields(stored, r, replacePaymentEditable)) > 0 {
			return refuse(msgPaymentNotDraft)
		}
		return nil
	case from == statusPosted && to == statusVoid:
		if len(changedFields(stored, r, voidPaymentEditable)) > 0 {
			return refuse(msgPaymentNotDraft)
		}
		return voidPayment(tx, r, now)
	case from == to:
		unlinks, err := onlySalesDocUnlinks(tx, stored, r)
		if err != nil || unlinks {
			return err
		}
		return refuse(msgPaymentNotDraft)
	}
	return refuse(msgSalesDocCannotGo, paymentName(stored), from, to)
}

func checkPaymentBooksFieldsKept(stored, r *core.Record) error {
	var changed []string
	for _, name := range paymentKeptBooksFields {
		if stored.GetString(name) != r.GetString(name) {
			changed = append(changed, name)
		}
	}
	return refuseServerFields(changed)
}

// checkPaymentHeader runs the header guards of a draft write and sets the sort
// key: a customer is chosen, and is active when the write chooses it (a draft
// keeps a customer that became inactive after it was chosen, and a correction
// its original's); the date is a real day; the amount is above 0 and at most
// maxStoredAmount; a deposit account the write chooses is an active bank or
// Undeposited funds account (empty is filled in at posting). reference_no and
// payment_method are held by the schema. stored is the row before an update,
// nil on a create.
func checkPaymentHeader(tx core.App, stored, r *core.Record) error {
	if err := checkPaymentCustomer(tx, stored, r); err != nil {
		return err
	}
	if _, err := parseDay(r.GetString("date")); err != nil {
		return refuseDocumentDay("date", err)
	}
	amount := r.GetFloat("amount")
	if amount <= 0 {
		return refuseField("amount", msgPaymentAmountRequired)
	}
	if amount > maxStoredAmount {
		return refuseField("amount", msgPaymentAmountTooLarge)
	}
	deposit := r.GetString("deposit_to")
	if deposit != "" && (stored == nil || stored.GetString("deposit_to") != deposit) {
		if err := checkDepositAccount(tx, deposit); err != nil {
			return err
		}
	}
	r.Set("sort_key", salesDocSortKey(r))
	return nil
}

// checkPaymentCustomer refuses an empty customer, and an inactive one when the
// write chooses it, unless the payment corrects a posted payment of that
// customer. A correction is refused when its customer is not its original's;
// the inactive check runs first, so an inactive customer chosen on a
// correction reads as inactive. A customer that does not exist is the
// schema's refusal.
func checkPaymentCustomer(tx core.App, stored, r *core.Record) error {
	id := r.GetString("customer")
	if id == "" {
		return refuseField("customer", msgPaymentCustomerRequired)
	}
	if stored == nil || stored.GetString("customer") != id {
		if err := refuseInactivePaymentCustomer(tx, r); err != nil {
			return err
		}
	}
	return refuseCorrectionCustomer(tx, r)
}

// refuseCorrectionCustomer refuses a correction whose customer is not the
// customer of the payment it replaces. An original that does not exist is
// refused at posting (msgPaymentEditMissing).
func refuseCorrectionCustomer(tx core.App, r *core.Record) error {
	replaces := r.GetString("replaces")
	if replaces == "" {
		return nil
	}
	original, err := tx.FindRecordById(paymentsCollection, replaces)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the payment being edited: %w", err)
	}
	if original.GetString("customer") != r.GetString("customer") {
		return refuseField("customer", msgPaymentCorrectionCustomer)
	}
	return nil
}

// refuseInactivePaymentCustomer refuses the payment's customer when it is
// inactive and the payment does not correct a posted payment of the same
// customer (the user did not choose it again).
func refuseInactivePaymentCustomer(tx core.App, r *core.Record) error {
	id := r.GetString("customer")
	customer, err := tx.FindRecordById("books_customers", id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the payment's customer: %w", err)
	}
	if !customer.GetBool("inactive") {
		return nil
	}
	if replaces := r.GetString("replaces"); replaces != "" {
		original, err := tx.FindRecordById(paymentsCollection, replaces)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("books: read the payment being edited: %w", err)
		}
		if err == nil && original.GetString("status") == statusPosted && original.GetString("customer") == id {
			return nil
		}
	}
	return refuseNamedField("customer", msgCustomerInactive, customer.GetString("display_name"))
}

// validatePaymentApplication guards one application write: it stays on its
// payment, which is a draft; it names a posted invoice of the payment's
// customer that the payment does not already name, with an amount above 0;
// and a payment holds at most maxPaymentApplications. While an invoice
// correction moves its original's applications (isMovingLines), an
// update that changes only the invoice passes. The sum and the invoices' open
// balances are checked when the payment posts (postPayment): a draft writes
// its header and applications as separate records. stored is the row before
// an update, nil on a create.
func validatePaymentApplication(tx core.App, stored, r *core.Record) error {
	paymentID := r.GetString("payment")
	if stored != nil && stored.GetString("payment") != paymentID {
		return refuseField("payment", msgPaymentApplicationStays)
	}
	if stored != nil && isMovingLines(tx, invoiceBalanceKind, paymentID) &&
		len(changedFields(stored, r, map[string]bool{"invoice": true})) == 0 {
		return nil
	}
	payment, err := tx.FindRecordById(paymentsCollection, paymentID)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses an application whose payment does not exist.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the application's payment: %w", err)
	}
	if payment.GetString("status") != statusDraft {
		return refuse(msgPaymentInvoicesNotDraft)
	}
	if stored == nil {
		ensureRecordID(r)
	}
	field := applicationField(r)
	invoice, err := tx.FindRecordById("books_invoices", r.GetString("invoice"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the application's invoice: %w", err)
	}
	if invoice.GetString("status") != statusPosted || invoice.GetString("customer") != payment.GetString("customer") {
		return refuseNamedField(field, msgPaymentInvoiceNotOpen, invoiceRef(invoice))
	}
	twice, err := tx.CountRecords(applicationsCollection,
		dbx.HashExp{"payment": paymentID, "invoice": invoice.Id}, dbx.Not(dbx.HashExp{"id": r.Id}))
	if err != nil {
		return fmt.Errorf("books: count the payment's applications: %w", err)
	}
	if twice > 0 {
		return refuseNamedField(field, msgPaymentInvoiceTwice, invoiceRef(invoice))
	}
	if r.GetFloat("amount") <= 0 {
		return refuseNamedField(field, msgPaymentApplicationZero, invoiceRef(invoice))
	}
	if r.GetFloat("amount") > maxStoredAmount {
		return refuseField(field, msgPaymentAmountTooLarge)
	}
	if stored != nil {
		return nil
	}
	n, err := tx.CountRecords(applicationsCollection, dbx.HashExp{"payment": paymentID})
	if err != nil {
		return fmt.Errorf("books: count the payment's applications: %w", err)
	}
	if n >= maxPaymentApplications {
		return refuse(msgPaymentTooManyInvoices)
	}
	return nil
}
