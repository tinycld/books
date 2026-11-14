package books

import (
	"fmt"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// The decisions of a customer's response (books_estimate_responses.decision).
const (
	decisionAccepted = "accepted"
	decisionDeclined = "declined"
)

// Refusal texts of the response guard. The client shows them as the server
// sends them (the public page's refusal box, the accept step's name field).
// %s of msgResponseExpired is the expiration day as "Oct 31, 2026".
const (
	msgResponseNotPending     = "This estimate is no longer waiting for an answer."
	msgResponseExpired        = "This estimate expired on %s."
	msgResponseReasonOnAccept = "A reason is only for a decline."
	msgResponseNameRequired   = "Enter your name."
)

// registerEstimateResponses binds the guard of a customer's answer through
// the estimate link. It is a model hook, so it runs for every create: the
// public page's REST create (the create rule has already matched the share
// token to the estimate) and the seed's create as the app. The check, the
// response's write and the estimate's new status share one transaction, so a
// refusal or a failed estimate save stores no response.
func registerEstimateResponses(app core.App) {
	app.OnRecordCreate("books_estimate_responses").BindFunc(func(e *core.RecordEvent) error {
		return serializedThen(e,
			func(tx core.App) error { return checkEstimateResponse(tx, e.Record) },
			func(tx core.App) error { return applyEstimateResponse(tx, e.Record) })
	})
}

// checkEstimateResponse trims the name and the reason on the record, refuses
// a reason or a blank name on an accept, and refuses unless the estimate is
// pending and not expired against the server's today (UTC). Inside the
// transaction, one answer settles the estimate, so a second one meets a status
// that is no longer pending.
func checkEstimateResponse(tx core.App, r *core.Record) error {
	name := strings.TrimSpace(r.GetString("name"))
	reason := strings.TrimSpace(r.GetString("reason"))
	r.Set("name", name)
	r.Set("reason", reason)
	if r.GetString("decision") == decisionAccepted {
		if reason != "" {
			return refuse("%s", msgResponseReasonOnAccept)
		}
		if name == "" {
			return refuseField("name", "%s", msgResponseNameRequired)
		}
	}
	estimateID := r.GetString("estimate")
	if estimateID == "" {
		// The schema refuses the missing estimate in the write.
		return nil
	}
	estimate, err := tx.FindRecordById("books_estimates", estimateID)
	if err != nil {
		return fmt.Errorf("books: read the estimate of a response: %w", err)
	}
	if estimate.GetString("status") != statusPending {
		return refuse("%s", msgResponseNotPending)
	}
	expiration := estimate.GetString("expiration_date")
	if expiration == "" {
		return nil
	}
	// The estimate's guard stores only real days, so this refuses only a row
	// written around it.
	day, err := parseDay(expiration)
	if err != nil {
		return refuse("%v", err)
	}
	if day.Format(dayLayout) < todayUTC(time.Now()) {
		return refuse(msgResponseExpired, day.Format("Jan 2, 2006"))
	}
	return nil
}

// applyEstimateResponse sets the estimate's status from the decision and
// saves it as the app in the response's transaction: an accept stores the
// typed name and the server's today as the acceptance; a decline sets
// Rejected, and transitionQuote clears the acceptance. The estimate's guard
// takes the transaction's one revision increase.
func applyEstimateResponse(tx core.App, r *core.Record) error {
	estimate, err := tx.FindRecordById("books_estimates", r.GetString("estimate"))
	if err != nil {
		return fmt.Errorf("books: read the estimate of a response: %w", err)
	}
	switch r.GetString("decision") {
	case decisionAccepted:
		estimate.Set("status", statusAccepted)
		estimate.Set("accepted_by", r.GetString("name"))
		estimate.Set("accepted_date", todayUTC(time.Now()))
	case decisionDeclined:
		estimate.Set("status", statusRejected)
	default:
		return fmt.Errorf("books: a response with the decision %q", r.GetString("decision"))
	}
	return tx.Save(estimate)
}

// estimateResponseLabel names a response by its estimate and its decision:
// "Estimate 1001: declined". An estimate that cannot be read (deleted with its
// responses) falls back to its id, so the audit row is still written.
func estimateResponseLabel(app core.App, r *core.Record) string {
	estimate := r.GetString("estimate")
	if rec, err := app.FindRecordById("books_estimates", estimate); err == nil {
		estimate = estimateLabel(rec)
	}
	return estimate + ": " + r.GetString("decision")
}
