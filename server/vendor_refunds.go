package books

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// docTypeVendorRefund is the doc type of a vendor refund's sequence and of the
// entry it posts; entry_type_labels.json holds how a reader sees it.
const docTypeVendorRefund = "vendor_refund"

const (
	vendorRefundsCollection     = "books_vendor_refunds"
	vendorRefundLinesCollection = "books_vendor_refund_lines"
)

// maxVendorRefundLines is the most vendor credits one vendor refund refunds.
const maxVendorRefundLines = 500

// Refusal texts of the vendor refund guards (vendor refund spec §3.5, §3.6).
// The texts that name a vendor credit or an account keep the name as written
// (refuseNamedField). An inactive vendor is refused with the shared
// msgVendorInactive (bills.go), and an amount above the stored limit with
// msgPaymentAmountTooLarge (payments.go). PocketBase adds a final period to a
// text without one; these have theirs.
const (
	msgVendorRefundVendorRequired   = "Choose a vendor."
	msgVendorRefundAmountRequired   = "Enter the amount refunded."
	msgVendorRefundCreditNotOpen    = "Vendor credit %s is not open. Clear it to continue."
	msgVendorRefundAboveUnapplied   = "Vendor credit %s: the refund is more than its unapplied credit of %s."
	msgVendorRefundCreditAfter      = "Vendor credit %s is dated after the refund date."
	msgVendorRefundCreditTwice      = "Vendor credit %s is already on this refund."
	msgVendorRefundLineZero         = "Vendor credit %s: enter a refund more than 0."
	msgVendorRefundTooManyCredits   = "A vendor refund can refund at most 500 vendor credits."
	msgVendorRefundSumNotAmount     = "The refunds must add up to the amount refunded."
	msgVendorRefundAccountType      = "Choose a bank, credit card or Undeposited funds account."
	msgVendorRefundAccountInactive  = "%s is inactive. Choose an active account."
	msgVendorRefundCorrectionVendor = "A vendor refund correction keeps its vendor."
	msgVendorRefundEditMissing      = "The vendor refund being edited does not exist."
	msgVendorRefundOnlyPostedEdits  = "Only a posted vendor refund can be edited."
	msgVendorRefundPostedFixed      = "A posted or void vendor refund cannot be changed."
	msgVendorRefundLinesFixed       = "The vendor credits of a posted vendor refund cannot change."
	// The vendor refunds whose Refunded to is an account being deleted.
	msgAccountRefundOfOneRefund = "This account is the refund account of 1 vendor refund and cannot be deleted. Make it inactive instead."
	msgAccountRefundOfRefunds   = "This account is the refund account of %d vendor refunds and cannot be deleted. Make it inactive instead."
)

// Go-only refusal texts of the vendor refund: the rules refuse these writes
// for a person first.
const (
	msgVendorRefundPostedFromForm = "A draft vendor refund is posted from the vendor refund form."
	msgVendorRefundDeleteNotDraft = "Only a draft vendor refund can be deleted."
	msgVendorRefundLineStays      = "A vendor credit row stays on its vendor refund."
)

// The vendor refund fields only Books writes. vendorRefundNewBooksFields must
// be empty on a new refund; vendorRefundKeptBooksFields cannot change while a
// person edits a draft. posted_by is not kept: a Go caller names the poster
// with the post, as for a received payment. The rules pin them for a person;
// these checks hold for Go and a superuser too.
var (
	vendorRefundNewBooksFields = []string{
		"number", "sequence", "entry", "replaced_by", "posted_at", "posted_by", "voided_at", "voided_by",
	}
	vendorRefundKeptBooksFields = []string{
		"number", "sequence", "currency", "entry", "replaces", "replaced_by", "posted_at", "voided_at", "voided_by",
	}
)

// vendorRefundReplacingMark is set while a correction's post sets its
// original void with replaced_by (txmarks.go).
const vendorRefundReplacingMark = "vendor_refund.replacing"

// vendorRefundName is how a refusal and the audit log name a vendor refund:
// "Vendor refund 1001", or "Draft vendor refund" while it has no number.
func vendorRefundName(r *core.Record) string {
	noun, _, draft := entryNouns(docTypeVendorRefund)
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return draft
}

// vendorCreditRef is how a vendor refund refusal names a vendor credit: its
// number, or "(draft)" for a draft credit, which has none.
func vendorCreditRef(credit *core.Record) string {
	if n := credit.GetString("number"); n != "" {
		return n
	}
	return "(draft)"
}

// vendorRefundLineField is the refusal key of a refund line: the client shows
// it under that credit's row.
func vendorRefundLineField(line *core.Record) string {
	return fmt.Sprintf("lines.%d", line.GetInt("position"))
}

// isRefundAccount reports whether a vendor refund may arrive in account (Q3):
// a bank or credit card account, or an Undeposited funds account. Whether it
// is active is checked apart, with its own text.
func isRefundAccount(account *core.Record) bool {
	switch account.GetString("type") {
	case "bank", "credit_card":
		return true
	}
	return account.GetString("detail_type") == "undeposited_funds"
}

// registerVendorRefundGuards binds the vendor refund and line guards inside
// serialized, so no other write can commit between a check and the write it
// allows. A vendor refund's lifecycle is a received payment's: a draft is
// edited and posted (postVendorRefund), a posted refund is voided
// (voidVendorRefund) or replaced by its correction's post, and a draft alone
// is deleted. Its lines change only while it is a draft, except when a vendor
// credit correction moves them (movePostedLines).
func registerVendorRefundGuards(app core.App) {
	bindSerializedGuard(app, vendorRefundsCollection, func(tx core.App, stored, r *core.Record) error {
		if stored == nil {
			return createVendorRefund(tx, r)
		}
		return transitionVendorRefund(tx, stored, r, time.Now())
	})
	app.OnRecordDelete(vendorRefundsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			stored, err := tx.FindRecordById(vendorRefundsCollection, e.Record.Id)
			if err != nil {
				return err
			}
			if stored.GetString("status") != statusDraft {
				return refuse(msgVendorRefundDeleteNotDraft)
			}
			return nil
		})
	})
	// A person's post or void is stamped with who did it, on the transition
	// only; the update rule refuses these fields in a person's body.
	app.OnRecordUpdateRequest(vendorRefundsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
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

	bindSerializedGuard(app, vendorRefundLinesCollection, validateVendorRefundLine)
	app.OnRecordDelete(vendorRefundLinesCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			// A draft refund's delete cascades its lines after the refund row is
			// gone: nothing is left to hold them.
			refund, err := tx.FindRecordById(vendorRefundsCollection, e.Record.GetString("refund"))
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			if err != nil {
				return fmt.Errorf("books: read the line's vendor refund: %w", err)
			}
			if refund.GetString("status") != statusDraft {
				return refuse(msgVendorRefundLinesFixed)
			}
			return nil
		})
	})
	bindPayableRefundRefresh(app)
}

// createVendorRefund guards a new vendor refund: it starts as a draft with
// none of the fields Books writes, takes the books currency, and passes the
// header guards.
func createVendorRefund(tx core.App, r *core.Record) error {
	ensureRecordID(r)
	if r.GetString("status") != statusDraft {
		return refuse(msgVendorRefundPostedFromForm)
	}
	var set []string
	for _, name := range vendorRefundNewBooksFields {
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
	return checkVendorRefundHeader(tx, nil, r)
}

// replaceVendorRefundEditable are the only fields a correction's post changes
// on the refund it replaces; voidVendorRefundEditable the only fields a void
// changes.
var (
	voidVendorRefundEditable    = map[string]bool{"status": true, "voided_by": true, "voided_at": true}
	replaceVendorRefundEditable = map[string]bool{"status": true, "voided_by": true, "voided_at": true, "replaced_by": true}
)

// transitionVendorRefund is the vendor refund's lifecycle. stored is the row
// before the update. A posted refund changes only to void, and a void one
// never, except for a link PocketBase clears because its row is gone.
func transitionVendorRefund(tx core.App, stored, r *core.Record, now time.Time) error {
	from, to := stored.GetString("status"), r.GetString("status")
	switch {
	case from == statusDraft && to == statusDraft:
		if err := checkVendorRefundBooksFieldsKept(stored, r); err != nil {
			return err
		}
		return checkVendorRefundHeader(tx, stored, r)
	case from == statusDraft && to == statusPosted:
		if err := checkVendorRefundBooksFieldsKept(stored, r); err != nil {
			return err
		}
		if err := checkVendorRefundHeader(tx, stored, r); err != nil {
			return err
		}
		return postVendorRefund(tx, r, now)
	case from == statusPosted && to == statusVoid && hasTxMark(tx, vendorRefundReplacingMark, r.Id):
		if len(changedFields(stored, r, replaceVendorRefundEditable)) > 0 {
			return refuse(msgVendorRefundPostedFixed)
		}
		return nil
	case from == statusPosted && to == statusVoid:
		if len(changedFields(stored, r, voidVendorRefundEditable)) > 0 {
			return refuse(msgVendorRefundPostedFixed)
		}
		return voidVendorRefund(tx, r, now)
	case from == to:
		unlinks, err := onlySalesDocUnlinks(tx, stored, r)
		if err != nil || unlinks {
			return err
		}
		return refuse(msgVendorRefundPostedFixed)
	case from != statusDraft:
		return refuse(msgVendorRefundPostedFixed)
	}
	return refuse(msgSalesDocCannotGo, vendorRefundName(stored), from, to)
}

func checkVendorRefundBooksFieldsKept(stored, r *core.Record) error {
	var changed []string
	for _, name := range vendorRefundKeptBooksFields {
		if stored.GetString(name) != r.GetString(name) {
			changed = append(changed, name)
		}
	}
	return refuseServerFields(changed)
}

// checkVendorRefundHeader runs the header guards of a draft write and sets the
// sort key: a vendor is chosen, and is active when the write chooses it (a
// draft keeps a vendor that became inactive after it was chosen, and a
// correction its original's); a correction names a posted vendor refund of the
// same vendor; the date is a real day when the write sets it; the amount is
// above 0 and at most maxStoredAmount; a Refunded to account the write chooses
// is an active refund account (isRefundAccount). Post checks the vendor and the
// account again (postVendorRefund). reference_no and payment_method are held
// by the schema, and so are a vendor or an account that does not exist. stored
// is the row before an update, nil on a create.
func checkVendorRefundHeader(tx core.App, stored, r *core.Record) error {
	if err := checkVendorRefundVendor(tx, stored, r); err != nil {
		return err
	}
	if _, err := correctedVendorRefund(tx, r); err != nil {
		return err
	}
	if day := r.GetString("date"); stored == nil || stored.GetString("date") != day {
		if _, err := parseDay(day); err != nil {
			return refuseDocumentDay("date", err)
		}
	}
	amount := r.GetFloat("amount")
	if amount <= 0 {
		return refuseField("amount", msgVendorRefundAmountRequired)
	}
	if amount > maxStoredAmount {
		return refuseField("amount", msgPaymentAmountTooLarge)
	}
	if account := r.GetString("refunded_to"); stored == nil || stored.GetString("refunded_to") != account {
		if _, err := checkRefundAccount(tx, r); err != nil {
			return err
		}
	}
	r.Set("sort_key", salesDocSortKey(r))
	return nil
}

// checkVendorRefundVendor refuses an empty vendor, and an inactive one when
// the write chooses it, unless the refund corrects a posted refund of that
// vendor.
func checkVendorRefundVendor(tx core.App, stored, r *core.Record) error {
	id := r.GetString("vendor")
	if id == "" {
		return refuseField("vendor", msgVendorRefundVendorRequired)
	}
	if stored == nil || stored.GetString("vendor") != id {
		return refuseInactiveRefundVendor(tx, r)
	}
	return nil
}

// refuseInactiveRefundVendor refuses the refund's vendor when it is inactive
// and the refund does not correct a posted refund of the same vendor (the
// user did not choose it again). A vendor that does not exist is the schema's
// refusal.
func refuseInactiveRefundVendor(tx core.App, r *core.Record) error {
	id := r.GetString("vendor")
	vendor, err := tx.FindRecordById("books_vendors", id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the vendor refund's vendor: %w", err)
	}
	if !vendor.GetBool("inactive") {
		return nil
	}
	if replaces := r.GetString("replaces"); replaces != "" {
		original, err := tx.FindRecordById(vendorRefundsCollection, replaces)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("books: read the vendor refund being edited: %w", err)
		}
		if err == nil && original.GetString("status") == statusPosted && original.GetString("vendor") == id {
			return nil
		}
	}
	return refuseNamedField("vendor", msgVendorInactive, vendor.GetString("display_name"))
}

// checkRefundAccount reads r's Refunded to account and refuses, under
// refunded_to, one that is not a refund account (isRefundAccount) or is
// inactive ("1000 Business Checking is inactive. Choose an active account.").
// An empty or missing account returns nil with no refusal: the schema refuses
// it (refunded_to is a required relation), with its own text.
func checkRefundAccount(tx core.App, r *core.Record) (*core.Record, error) {
	id := r.GetString("refunded_to")
	if id == "" {
		return nil, nil
	}
	account, err := tx.FindRecordById("books_accounts", id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the vendor refund's Refunded to account: %w", err)
	}
	if !isRefundAccount(account) {
		return nil, refuseField("refunded_to", msgVendorRefundAccountType)
	}
	if account.GetBool("inactive") {
		return nil, refuseNamedField("refunded_to", msgVendorRefundAccountInactive, accountDisplayName(account))
	}
	return account, nil
}

// validateVendorRefundLine guards one line write: it stays on its refund,
// which is a draft; it names a posted vendor credit of the refund's vendor
// that the refund does not already name, with an amount above 0; and a refund
// holds at most maxVendorRefundLines. While a vendor credit correction moves
// the lines of a posted refund (isMovingLines), an update that changes only
// the vendor credit passes. The sum, the credits' balances and their dates
// are checked when the refund posts (postVendorRefund): a draft writes its
// header and its lines as separate records. stored is the row before an
// update, nil on a create.
func validateVendorRefundLine(tx core.App, stored, r *core.Record) error {
	refundID := r.GetString("refund")
	if stored != nil && stored.GetString("refund") != refundID {
		return refuseField("refund", msgVendorRefundLineStays)
	}
	if stored != nil && isMovingLines(tx, vendorCreditBalanceKind, refundID) &&
		len(changedFields(stored, r, map[string]bool{"vendor_credit": true})) == 0 {
		return nil
	}
	refund, err := tx.FindRecordById(vendorRefundsCollection, refundID)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses a line whose refund does not exist.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the line's vendor refund: %w", err)
	}
	if refund.GetString("status") != statusDraft {
		return refuse(msgVendorRefundLinesFixed)
	}
	if stored == nil {
		ensureRecordID(r)
	}
	field := vendorRefundLineField(r)
	credit, err := tx.FindRecordById(vendorCreditsCollection, r.GetString("vendor_credit"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the line's vendor credit: %w", err)
	}
	if credit.GetString("status") != statusPosted || credit.GetString("vendor") != refund.GetString("vendor") {
		return refuseNamedField(field, msgVendorRefundCreditNotOpen, vendorCreditRef(credit))
	}
	twice, err := tx.CountRecords(vendorRefundLinesCollection,
		dbx.HashExp{"refund": refundID, "vendor_credit": credit.Id}, dbx.Not(dbx.HashExp{"id": r.Id}))
	if err != nil {
		return fmt.Errorf("books: count the vendor refund's lines: %w", err)
	}
	if twice > 0 {
		return refuseNamedField(field, msgVendorRefundCreditTwice, vendorCreditRef(credit))
	}
	if r.GetFloat("amount") <= 0 {
		return refuseNamedField(field, msgVendorRefundLineZero, vendorCreditRef(credit))
	}
	if r.GetFloat("amount") > maxStoredAmount {
		return refuseField(field, msgPaymentAmountTooLarge)
	}
	if stored != nil {
		return nil
	}
	n, err := tx.CountRecords(vendorRefundLinesCollection, dbx.HashExp{"refund": refundID})
	if err != nil {
		return fmt.Errorf("books: count the vendor refund's lines: %w", err)
	}
	if n >= maxVendorRefundLines {
		return refuse(msgVendorRefundTooManyCredits)
	}
	return nil
}
