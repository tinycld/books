package books

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// docTypeBillPayment is the doc type of a bill payment's sequence and of the
// entry it posts; entry_type_labels.json holds how a reader sees it.
const docTypeBillPayment = "bill_payment"

const (
	billPaymentsCollection     = "books_bill_payments"
	billPaymentLinesCollection = "books_bill_payment_lines"
)

// maxBillPaymentLines is the most bills one bill payment pays.
const maxBillPaymentLines = 250

// Refusal texts of the bill payment guards (pay-bills spec §4.2). The texts
// that name a bill keep it as written (refuseNamedField). Paid from reuses the
// expense's texts (msgExpensePaidFromType, msgExpensePaidFromInactive) and the
// check number msgExpenseDuplicateCheckNo (checkCheckNo). PocketBase adds a
// final period to a text without one; these have theirs.
const (
	msgBillPaySelectOne       = "Select at least one bill to pay."
	msgBillPayTooManyBills    = "A bill payment can pay at most 250 bills."
	msgBillPayBillNotOpen     = "Bill %s is not open. Clear it to continue."
	msgBillPayBillTwice       = "Bill %s is already on this payment."
	msgBillPayAmountZero      = "Bill %s: enter a payment more than 0."
	msgBillPayAboveBalance    = "Bill %s: the payment is more than its open balance of %s."
	msgBillPayCorrectionVndr  = "A bill payment correction keeps its vendor."
	msgBillPayEditMissing     = "The bill payment being edited does not exist."
	msgBillPayOnlyPostedEdits = "Only a posted bill payment can be edited."
	msgBillPayPostedFixed     = "A posted or void bill payment cannot be changed."
	msgBillPayBillsFixed      = "The bills of a posted bill payment cannot change."
)

// Go-only refusal texts of the bill payment: no client write reaches them.
const (
	msgBillPayCreatedInBatch = "A bill payment is created posted, with its bills, in one batch."
	msgBillPayNoDelete       = "A bill payment cannot be deleted. Void it instead."
	msgBillPayTotalTooLarge  = "The total is more than Books can store."
)

// billPaymentNewBooksFields must be empty on a new bill payment: only posting
// writes them. posted_by is not here: the create request hook stamps it.
var billPaymentNewBooksFields = []string{
	"number", "sequence", "total", "entry", "replaced_by", "posted_at", "voided_at", "voided_by",
}

// The tx marks of a bill payment (txmarks.go). creating is set by the create
// request hook while its batch writes the payment and its lines; posting while
// postBillPayment writes the posted fields; replacing while a correction's post
// sets its original void.
const (
	billPaymentCreatingMark  = "bill_payment.creating"
	billPaymentPostingMark   = "bill_payment.posting"
	billPaymentReplacingMark = "bill_payment.replacing"
)

// billPaymentName is how a refusal and the audit log name a bill payment:
// "Bill payment 1004", or "Bill payment" before its post numbers it.
func billPaymentName(r *core.Record) string {
	noun, _, unnumbered := entryNouns(docTypeBillPayment)
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return unnumbered
}

// billRef is how a bill payment refusal names a bill: its number, or
// "(draft)" for a draft bill, which has none.
func billRef(bill *core.Record) string {
	if n := bill.GetString("number"); n != "" {
		return n
	}
	return "(draft)"
}

// billPaymentLineField is the refusal key of a bill payment line: the client
// shows it under that bill's row.
func billPaymentLineField(line *core.Record) string {
	return fmt.Sprintf("lines.%d", line.GetInt("position"))
}

// bindBillPaymentCreate binds the create request hook that owns a bill
// payment's post. A bill payment has no draft: the client writes it with
// status posted and its lines in one batch, and the post runs once the lines
// exist. In a batch, operation N+1 runs inside operation N's e.Next(), in one
// transaction, so after e.Next() returns every line of the batch is written
// and nothing is committed; a refusal of the post fails this payment's
// operation and rolls the whole batch back. A single REST create (no
// transaction) has no lines and is refused before anything is stored. The post
// writes a copy read again from the store, so its fields are loaded onto
// e.Record: the request's response and the audit row (labelled from e.Record
// after the commit) see the posted payment with its number.
func bindBillPaymentCreate(app core.App) {
	app.OnRecordCreateRequest(billPaymentsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		if e.App.TxInfo() == nil {
			return refuse(msgBillPaySelectOne)
		}
		ensureRecordID(e.Record)
		stampActor(e.Record, "posted_by", e.Auth)
		id := e.Record.Id
		setTxMark(e.App, billPaymentCreatingMark, id)
		defer clearTxMark(e.App, billPaymentCreatingMark, id)
		if err := e.Next(); err != nil {
			return err
		}
		var posted *core.Record
		err := e.App.RunInTransaction(func(tx core.App) error {
			p, err := tx.FindRecordById(billPaymentsCollection, id)
			if err != nil {
				return fmt.Errorf("books: read the bill payment to post: %w", err)
			}
			if err := postBillPayment(tx, p, time.Now()); err != nil {
				return err
			}
			posted = p
			return nil
		})
		if err != nil {
			return err
		}
		e.Record.Load(posted.FieldsData())
		return nil
	})
}

// registerBillPaymentGuards binds the bill payment's create request hook and
// the payment and line guards inside serialized, so no other write can commit
// between a check and the write it allows. A bill payment is created posted
// (bindBillPaymentCreate), voided (voidBillPayment) or replaced by its
// correction's post, and never deleted. Its lines are written only inside the
// batch that creates it, before its post, and changed only while a bill
// correction moves them (moveLines).
func registerBillPaymentGuards(app core.App) {
	bindBillPaymentCreate(app)
	bindSerializedGuard(app, billPaymentsCollection, func(tx core.App, stored, r *core.Record) error {
		if stored == nil {
			return createBillPayment(tx, r)
		}
		return transitionBillPayment(tx, stored, r, time.Now())
	})
	app.OnRecordDelete(billPaymentsCollection).BindFunc(func(e *core.RecordEvent) error {
		return refuse(msgBillPayNoDelete)
	})
	// A person's void is stamped with who did it, on the transition only; the
	// update rule refuses voided_by in a person's body.
	app.OnRecordUpdateRequest(billPaymentsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		from, to := e.Record.Original().GetString("status"), e.Record.GetString("status")
		if from != to && to == statusVoid {
			stampActor(e.Record, "voided_by", e.Auth)
		}
		return e.Next()
	})

	bindSerializedGuard(app, billPaymentLinesCollection, validateBillPaymentLine)
	app.OnRecordDelete(billPaymentLinesCollection).BindFunc(func(e *core.RecordEvent) error {
		return refuse(msgBillPayBillsFixed)
	})
}

// createBillPayment guards a new bill payment: its batch's request hook
// created it (the creating mark), it is posted with none of the fields Books
// writes, it takes the books currency, and its header passes. The lines and
// the balances are checked when it posts, after the batch wrote the lines.
func createBillPayment(tx core.App, r *core.Record) error {
	ensureRecordID(r)
	if r.GetString("status") != statusPosted || !hasTxMark(tx, billPaymentCreatingMark, r.Id) {
		return refuse(msgBillPayCreatedInBatch)
	}
	var set []string
	for _, name := range billPaymentNewBooksFields {
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
	return checkBillPaymentHeader(tx, r)
}

// checkBillPaymentHeader runs the header rules of a bill payment: the date is
// a real day, Paid from is an active bank or credit card account, and a
// correction names a posted bill payment of the same vendor. It sets the sort
// key. The vendor may be inactive: its bills were posted while it was active.
// payment_method and reference_no are held by the schema; the check number and
// the close date are checked when it posts.
func checkBillPaymentHeader(tx core.App, r *core.Record) error {
	if _, err := parseDay(r.GetString("date")); err != nil {
		return refuseDocumentDay("date", err)
	}
	if _, err := checkExpensePaidFrom(tx, r, true); err != nil {
		return err
	}
	if _, err := correctedBillPayment(tx, r); err != nil {
		return err
	}
	r.Set("sort_key", salesDocSortKey(r))
	return nil
}

// voidBillPaymentEditable are the only fields a void changes;
// replaceBillPaymentEditable the only fields a correction's post changes on
// the payment it replaces.
var (
	voidBillPaymentEditable    = map[string]bool{"status": true, "voided_by": true, "voided_at": true}
	replaceBillPaymentEditable = map[string]bool{"status": true, "voided_by": true, "voided_at": true, "replaced_by": true}
)

// transitionBillPayment is the bill payment's lifecycle after its create.
// stored is the row before the update.
func transitionBillPayment(tx core.App, stored, r *core.Record, now time.Time) error {
	from, to := stored.GetString("status"), r.GetString("status")
	switch {
	case from == statusPosted && to == statusPosted && hasTxMark(tx, billPaymentPostingMark, r.Id):
		return nil
	case from == statusPosted && to == statusVoid && hasTxMark(tx, billPaymentReplacingMark, r.Id):
		if len(changedFields(stored, r, replaceBillPaymentEditable)) > 0 {
			return refuse(msgBillPayPostedFixed)
		}
		return nil
	case from == statusPosted && to == statusVoid:
		if len(changedFields(stored, r, voidBillPaymentEditable)) > 0 {
			return refuse(msgBillPayPostedFixed)
		}
		return voidBillPayment(tx, r, now)
	case from == to:
		unlinks, err := onlySalesDocUnlinks(tx, stored, r)
		if err != nil || unlinks {
			return err
		}
	}
	return refuse(msgBillPayPostedFixed)
}

// validateBillPaymentLine guards one line write. A create is admitted only
// inside the batch that creates its payment, before the payment posts (the
// creating mark, no number yet); it names a posted bill of the payment's
// vendor that the payment does not already name, with an amount above 0; and a
// payment holds at most maxBillPaymentLines. An update passes only while a
// bill correction moves the payment's lines (isMovingLines) and changes only
// the bill. The bills' open balances are checked when the payment posts. stored
// is the row before an update, nil on a create.
func validateBillPaymentLine(tx core.App, stored, r *core.Record) error {
	paymentID := r.GetString("payment")
	if stored != nil {
		if stored.GetString("payment") == paymentID && isMovingLines(tx, billBalanceKind, paymentID) &&
			len(changedFields(stored, r, map[string]bool{"bill": true})) == 0 {
			return nil
		}
		return refuse(msgBillPayBillsFixed)
	}
	payment, err := tx.FindRecordById(billPaymentsCollection, paymentID)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses a line whose payment does not exist.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the line's bill payment: %w", err)
	}
	if !hasTxMark(tx, billPaymentCreatingMark, paymentID) || payment.GetString("number") != "" {
		return refuse(msgBillPayBillsFixed)
	}
	ensureRecordID(r)
	field := billPaymentLineField(r)
	bill, err := tx.FindRecordById("books_bills", r.GetString("bill"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the line's bill: %w", err)
	}
	if bill.GetString("status") != statusPosted || bill.GetString("vendor") != payment.GetString("vendor") {
		return refuseNamedField(field, msgBillPayBillNotOpen, billRef(bill))
	}
	twice, err := tx.CountRecords(billPaymentLinesCollection,
		dbx.HashExp{"payment": paymentID, "bill": bill.Id}, dbx.Not(dbx.HashExp{"id": r.Id}))
	if err != nil {
		return fmt.Errorf("books: count the bill payment's lines: %w", err)
	}
	if twice > 0 {
		return refuseNamedField(field, msgBillPayBillTwice, billRef(bill))
	}
	if r.GetFloat("amount") <= 0 {
		return refuseNamedField(field, msgBillPayAmountZero, billRef(bill))
	}
	if r.GetFloat("amount") > maxStoredAmount {
		return refuseField(field, msgPaymentAmountTooLarge)
	}
	n, err := tx.CountRecords(billPaymentLinesCollection, dbx.HashExp{"payment": paymentID})
	if err != nil {
		return fmt.Errorf("books: count the bill payment's lines: %w", err)
	}
	if n >= maxBillPaymentLines {
		return refuse(msgBillPayTooManyBills)
	}
	return nil
}
