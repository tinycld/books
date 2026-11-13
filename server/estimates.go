package books

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The estimate's forms host (tinycld/books/forms/hosts.ts).
const estimateHostKey = "books:estimate"

// docTypeEstimate is the doc type of an estimate's number sequence. An
// estimate never posts, so no journal entry has it (documentDocTypes).
const docTypeEstimate = "estimate"

// The statuses of an estimate (the quote lifecycle). A person moves an
// estimate freely among pending, accepted and rejected; only Books closes it,
// when an invoice is made from it.
const (
	statusPending  = "pending"
	statusAccepted = "accepted"
	statusRejected = "rejected"
	statusClosed   = "closed"
)

// Refusal texts of the estimate guards. This group is shown by the client
// too, with the same words. PocketBase adds the final period to a text without
// one. %s is the customer's name, which refuseNamedField keeps as typed. The
// customer guards of every kind refuse with msgCustomerInactive (invoices.go).
const (
	msgEstimateTotalNegative = "An estimate total cannot be below zero."
	msgEstimateTotalTooLarge = "The estimate total is more than Books can store."
	msgEstimateTooManyLines  = "An estimate can have at most 250 lines."
	msgCustomerOnEstimates   = "%s is on estimates. Make it inactive instead."
	msgExpirationBeforeDate  = "Expiration date can't be before the estimate date"
	msgAcceptedDateRequired  = "Enter the accepted date"
	// The delete refusals of an estimate an invoice names (spec §3.6): the
	// first %s is the estimate's number, the second the invoice's; a draft
	// invoice has none yet.
	msgEstimateHasInvoice      = "Estimate %s has invoice %s. Set it to Rejected instead."
	msgEstimateHasDraftInvoice = "Estimate %s has a draft invoice. Set it to Rejected instead."
)

// Go-only refusal texts of the estimate.
const (
	msgEstimateClosesFromInvoice = "An estimate closes only when an invoice is made from it."
	msgEstimateClosedUnchanged   = "A closed estimate cannot be changed."
	msgEstimateClosedNoDelete    = "A closed estimate cannot be deleted."
	msgEstimateLineStays         = "A line stays on its estimate."
	msgEstimateLineClosed        = "The lines of a closed estimate cannot change."
	msgEstimateLineRestating     = "Only a line's amount changes while Books restates its estimate."
	msgEstimateLineUnknownKind   = "Line %d: an estimate line is an item, description, subtotal or percent line."
	// An estimate has no post: the text names the one write a person makes.
	msgEstimateRevisionConflict = "This estimate changed after you opened it. Load it again, then review it before you save."
)

// estimateKind is the estimate as a sales document of the quote lifecycle: it
// requires a customer, takes its number when it is created, checks its days
// and its acceptance, and never posts (no tax lines, no debit account).
var estimateKind = salesDocKind{
	DocType:            docTypeEstimate,
	Lifecycle:          lifecycleQuote,
	Collection:         "books_estimates",
	LinesCollection:    "books_estimate_lines",
	TaxLinesCollection: "",
	ParentField:        "estimate",
	HostKey:            estimateHostKey,
	CustomerRequired:   true,
	Msgs: salesDocMessages{
		TotalNegative:    msgEstimateTotalNegative,
		TotalTooLarge:    msgEstimateTotalTooLarge,
		TooManyLines:     msgEstimateTooManyLines,
		NotDraft:         msgEstimateClosedUnchanged,
		DeleteNotDraft:   msgEstimateClosedNoDelete,
		LineStays:        msgEstimateLineStays,
		LineNotDraft:     msgEstimateLineClosed,
		LineRestating:    msgEstimateLineRestating,
		LineUnknownKind:  msgEstimateLineUnknownKind,
		CustomerOnDocs:   msgCustomerOnEstimates,
		RevisionConflict: msgEstimateRevisionConflict,
	},
	CheckHeader:  checkEstimateHeader,
	CheckDelete:  checkEstimateDelete,
	BeforePost:   nil,
	DebitAccount: nil,
}

// checkEstimateDelete refuses to delete an estimate any invoice names, void
// ones included, before the closed check, so the refusal says what to do. It
// names the newest such invoice. Refusing here also keeps PocketBase from
// unlinking the deleted estimate from a posted or void invoice, which the
// invoice's guard would refuse.
func checkEstimateDelete(tx core.App, stored *core.Record) error {
	invoices, err := tx.FindRecordsByFilter("books_invoices", "estimate = {:estimate}", "-created,-id", 1, 0,
		dbx.Params{"estimate": stored.Id})
	if err != nil {
		return fmt.Errorf("books: read the invoices of the estimate: %w", err)
	}
	if len(invoices) == 0 {
		return nil
	}
	number := stored.GetString("number")
	if invoices[0].GetString("status") == statusDraft {
		return refuse(msgEstimateHasDraftInvoice, number)
	}
	return refuse(msgEstimateHasInvoice, number, invoices[0].GetString("number"))
}

// checkEstimateHeader is the estimate's own header guard on every write of an
// estimate that is not closed: the estimate date is a real day; the
// expiration date is empty or a real day not before it; an accepted estimate
// has a real accepted date.
func checkEstimateHeader(_ core.App, _, r *core.Record) error {
	date, err := parseDay(r.GetString("date"))
	if err != nil {
		return refuseField("date", msgDocumentDay)
	}
	if expiration := r.GetString("expiration_date"); expiration != "" {
		day, err := parseDay(expiration)
		if err != nil {
			return refuseField("expiration_date", msgDocumentDay)
		}
		if day.Before(date) {
			return refuseField("expiration_date", msgExpirationBeforeDate)
		}
	}
	if r.GetString("status") != statusAccepted {
		return nil
	}
	accepted := r.GetString("accepted_date")
	if accepted == "" {
		return refuseField("accepted_date", msgAcceptedDateRequired)
	}
	if _, err := parseDay(accepted); err != nil {
		return refuseField("accepted_date", msgDocumentDay)
	}
	return nil
}

// createQuote guards a quote's create. There is no draft: the create stamps
// the id and the currency, takes the next number of the kind's sequence, and
// runs the header guards. It runs inside serialized, so a refusal rolls the
// sequence back and a refused create takes no number. A person never creates
// a closed quote.
func createQuote(tx core.App, kind salesDocKind, r *core.Record) error {
	ensureRecordID(r)
	if r.GetString("status") == statusClosed {
		return refuse("%s", msgEstimateClosesFromInvoice)
	}
	if err := stampCurrency(tx, r); err != nil {
		return err
	}
	sequence, number, err := allocateNumber(tx, kind.DocType)
	if err != nil {
		return err
	}
	r.Set("sequence", sequence)
	r.Set("number", number)
	startRevision(tx, kind, r)
	clearAcceptance(r)
	return checkDraftSalesDoc(tx, kind, nil, r)
}

// transitionQuote guards a quote's update. A closed quote does not change
// (except PocketBase unlinking a deleted form) and no update closes one, both
// unless Books is converting it (markConverting). Otherwise the status moves
// freely among pending, accepted and rejected, and the header guards run. A
// write to an estimate that is not closed takes the transaction's one revision
// increase (revision.go).
func transitionQuote(tx core.App, kind salesDocKind, stored, r *core.Record) error {
	converting := isConverting(tx, r.Id)
	if stored.GetString("status") == statusClosed && !converting {
		unlinks, err := onlySalesDocUnlinks(tx, stored, r)
		if err != nil || unlinks {
			return err
		}
		return refuse("%s", kind.Msgs.NotDraft)
	}
	if r.GetString("status") == statusClosed && !converting {
		return refuse("%s", msgEstimateClosesFromInvoice)
	}
	// A write to an estimate a person can edit takes the transaction's one
	// increase: a save, a line's restatement, and the close an invoice's create
	// makes. The reopen of a closed estimate changes one nobody edits, as a
	// void does, and adds none.
	if kind.isEditableStatus(stored.GetString("status")) {
		if err := settleRevision(tx, stored, r, kind.Msgs.RevisionConflict); err != nil {
			return err
		}
	}
	// Books' own save of the totals after a line write (restateSalesDoc).
	if isOwnWrite(tx, kind.Collection, stored.Id) {
		return nil
	}
	clearAcceptance(r)
	return checkDraftSalesDoc(tx, kind, stored, r)
}

// clearAcceptance empties Accepted by and Accepted date on a pending or
// rejected estimate. A closed estimate keeps them: undoing its conversion
// reads the accepted date to choose between accepted and pending.
func clearAcceptance(r *core.Record) {
	switch r.GetString("status") {
	case statusPending, statusRejected:
		r.Set("accepted_by", "")
		r.Set("accepted_date", "")
	}
}

// markConverting marks estimateID as written by Books' conversion to an
// invoice, or the undoing of one, so the estimate guard lets its status move
// to or from closed; the returned func clears the mark, which belongs to the
// converting transaction (txmarks.go).
func markConverting(tx core.App, estimateID string) func() {
	return setTxMark(tx, docMark(estimateKind, "converting"), estimateID)
}

func isConverting(tx core.App, estimateID string) bool {
	return hasTxMark(tx, docMark(estimateKind, "converting"), estimateID)
}
