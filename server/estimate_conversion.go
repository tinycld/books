package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Refusal texts of converting an estimate to an invoice (spec §3.7). The
// first group is shown by the client too, with the same words
// (ESTIMATE_MESSAGES, lib/document-texts.ts); tests/document-messages.test.ts
// fails when they drift. %s is an estimate's or an invoice's number, or the
// customer's name, which refuseNamedField keeps as typed.
const (
	msgEstimateAlreadyOnInvoice      = "Estimate %s is already on invoice %s."
	msgEstimateAlreadyOnDraftInvoice = "Estimate %s is already on a draft invoice."
	msgEstimateCustomer              = "An invoice from an estimate bills the estimate's customer."
	msgEstimateCustomerInactive      = "%s is inactive. Make the customer active to convert this estimate."
)

// Go-only refusal texts of the conversion.
const (
	msgEstimateRejected     = "Estimate %s is rejected. Set it to Pending or Accepted to convert it."
	msgInvoiceKeepsEstimate = "An invoice keeps the estimate it was made from."
)

// checkInvoiceEstimate is the invoice's estimate guard, run with its header
// guards on every draft write inside serialized. An update never sets,
// changes or clears the estimate, and never changes the customer of an
// invoice made from one. A create that names an estimate converts it: the
// estimate is not rejected and no other invoice that is not void names it,
// the invoice bills the estimate's customer, and that customer is active (the
// customer of an invoice from an estimate cannot change, so the shared
// "Choose an active customer" text would be a dead end). A correction carries
// its original's estimate, which stays closed on the original until the
// correction posts. stored is the row before an update, nil on a create.
func checkInvoiceEstimate(tx core.App, stored, r *core.Record) error {
	estimateID := r.GetString("estimate")
	if stored != nil {
		if stored.GetString("estimate") != estimateID {
			return refuse("%s", msgInvoiceKeepsEstimate)
		}
		if estimateID != "" && stored.GetString("customer") != r.GetString("customer") {
			return refuseField("customer", "%s", msgEstimateCustomer)
		}
		return nil
	}
	correcting, err := correctedEstimate(tx, r)
	if err != nil {
		return err
	}
	if correcting != nil && correcting.GetString("estimate") != estimateID {
		return refuse("%s", msgInvoiceKeepsEstimate)
	}
	if estimateID == "" {
		return nil
	}
	estimate, err := tx.FindRecordById("books_estimates", estimateID)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses an estimate that does not exist.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the invoice's estimate: %w", err)
	}
	if correcting == nil {
		if err := checkConvertible(tx, estimate, r); err != nil {
			return err
		}
	}
	if estimate.GetString("customer") != r.GetString("customer") {
		return refuseField("customer", "%s", msgEstimateCustomer)
	}
	if correcting != nil {
		return nil
	}
	return checkEstimateCustomerActive(tx, estimate)
}

// correctedEstimate is the invoice a create corrects (its replaces), nil for
// one that corrects none or whose original does not exist (the post refuses
// that one).
func correctedEstimate(tx core.App, r *core.Record) (*core.Record, error) {
	replaces := r.GetString("replaces")
	if replaces == "" {
		return nil, nil
	}
	original, err := tx.FindRecordById("books_invoices", replaces)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the invoice being edited: %w", err)
	}
	return original, nil
}

// checkConvertible refuses an estimate that is rejected, and one that another
// invoice that is not void names (a closed estimate always has one).
func checkConvertible(tx core.App, estimate, r *core.Record) error {
	number := estimate.GetString("number")
	if estimate.GetString("status") == statusRejected {
		return refuse(msgEstimateRejected, number)
	}
	holder, err := estimateHolder(tx, estimate.Id, r.Id)
	if err != nil {
		return err
	}
	if holder == nil && estimate.GetString("status") == statusClosed {
		holder, err = tx.FindRecordById("books_invoices", estimate.GetString("invoice"))
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("books: read the estimate's invoice: %w", err)
		}
		if holder == nil {
			return refuse(msgEstimateAlreadyOnDraftInvoice, number)
		}
	}
	if holder == nil {
		return nil
	}
	if holder.GetString("status") == statusDraft {
		return refuse(msgEstimateAlreadyOnDraftInvoice, number)
	}
	return refuse(msgEstimateAlreadyOnInvoice, number, holder.GetString("number"))
}

// estimateHolder is the newest invoice other than self that names the
// estimate and is not void, nil when there is none.
func estimateHolder(tx core.App, estimateID, self string) (*core.Record, error) {
	holders, err := tx.FindRecordsByFilter("books_invoices",
		"estimate = {:estimate} && status != {:void} && id != {:self}", "-created,-id", 1, 0,
		dbx.Params{"estimate": estimateID, "void": statusVoid, "self": self})
	if err != nil {
		return nil, fmt.Errorf("books: read the invoices of the estimate: %w", err)
	}
	if len(holders) == 0 {
		return nil, nil
	}
	return holders[0], nil
}

// checkEstimateCustomerActive refuses, under the Customer field, to convert an
// estimate whose customer is inactive.
func checkEstimateCustomerActive(tx core.App, estimate *core.Record) error {
	customer, err := tx.FindRecordById("books_customers", estimate.GetString("customer"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the estimate's customer: %w", err)
	}
	if !customer.GetBool("inactive") {
		return nil
	}
	return refuseNamedField("customer", msgEstimateCustomerInactive, customer.GetString("display_name"))
}

// closeEstimateFor closes the estimate a new invoice is made from, after the
// invoice's create wrote it and in the same transaction: its status is closed
// and its invoice is the new invoice. A correction does not close it again:
// its estimate stays closed on the original until the correction posts
// (moveEstimateTo).
func closeEstimateFor(tx core.App, invoice *core.Record) error {
	estimate, err := estimateOf(tx, invoice)
	if err != nil || estimate == nil {
		return err
	}
	if replaces := invoice.GetString("replaces"); replaces != "" && estimate.GetString("invoice") == replaces {
		return nil
	}
	estimate.Set("status", statusClosed)
	estimate.Set("invoice", invoice.Id)
	return saveConverting(tx, estimate)
}

// reopenEstimate undoes a conversion when its invoice is deleted as a draft
// or voided: the estimate is accepted again when it has an accepted date, else
// pending, and names no invoice. It acts only while the estimate names this
// invoice, so a correction draft's delete leaves the estimate on its original.
func reopenEstimate(tx core.App, invoice *core.Record) error {
	estimate, err := estimateOf(tx, invoice)
	if err != nil || estimate == nil || estimate.GetString("invoice") != invoice.Id {
		return err
	}
	status := statusPending
	if estimate.GetString("accepted_date") != "" {
		status = statusAccepted
	}
	estimate.Set("status", status)
	estimate.Set("invoice", "")
	return saveConverting(tx, estimate)
}

// moveEstimateTo moves the estimate of a posted invoice to the correction
// whose post replaces it; the estimate stays closed.
func moveEstimateTo(tx core.App, original, correction *core.Record) error {
	estimate, err := estimateOf(tx, original)
	if err != nil || estimate == nil || estimate.GetString("invoice") != original.Id {
		return err
	}
	estimate.Set("invoice", correction.Id)
	return saveConverting(tx, estimate)
}

// estimateOf is the stored estimate an invoice names, nil when it names none.
func estimateOf(tx core.App, invoice *core.Record) (*core.Record, error) {
	id := invoice.GetString("estimate")
	if id == "" {
		return nil, nil
	}
	estimate, err := tx.FindRecordById("books_estimates", id)
	if err != nil {
		return nil, fmt.Errorf("books: read the invoice's estimate: %w", err)
	}
	return estimate, nil
}

// saveConverting saves an estimate under the converting mark, so its guard
// lets the status move to or from closed.
func saveConverting(tx core.App, estimate *core.Record) error {
	done := markConverting(tx, estimate.Id)
	defer done()
	return tx.Save(estimate)
}
