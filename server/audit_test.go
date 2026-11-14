package books

import (
	"net/http"
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/audit"
)

// startReceiptsAt moves the sales receipt sequence forward, so the next
// receipt posted takes number next.
func startReceiptsAt(t testing.TB, re *receiptEnv, next int) {
	t.Helper()
	if err := setFields(t, re.app, "books_doc_sequences", receiptSequenceID, map[string]any{"next_number": next}); err != nil {
		t.Fatalf("move the sales receipt sequence to %d: %v", next, err)
	}
}

// Spec §4.3: a sales receipt's audit row is "Sales receipt 1004", or "Draft
// sales receipt" while it has no number; a line's row follows its receipt
// ("Sales receipt 1004: line 2").
func TestAudit_LabelsASalesReceiptAndItsLines(t *testing.T) {
	re := newReceiptEnv(t)
	audited := auditedCollections(re.app)
	receipts, ok := audited["books_sales_receipts"]
	if !ok {
		t.Fatal("books_sales_receipts is not audited")
	}
	lines, ok := audited["books_sales_receipt_lines"]
	if !ok {
		t.Fatal("books_sales_receipt_lines is not audited")
	}
	r := re.mkReceipt(t, nil)
	mkReceiptLine(t, re.app, r, 0, item(re.service, 1, 45000, false))
	line := mkReceiptLine(t, re.app, r, 1, item(re.accessPoint, 1, 18900, false))

	if got, want := receipts.ExtractLabel(reload(t, re.app, "books_sales_receipts", r.Id)), "Draft sales receipt"; got != want {
		t.Errorf("draft sales receipt label = %q, want %q", got, want)
	}
	if got, want := lines.ExtractLabel(reload(t, re.app, "books_sales_receipt_lines", line.Id)), "Draft sales receipt: line 2"; got != want {
		t.Errorf("draft sales receipt line label = %q, want %q", got, want)
	}

	startReceiptsAt(t, re, 1004)
	posted := mustPostReceipt(t, re.app, r.Id, re.users.bookkeeper.Id)
	if got, want := receipts.ExtractLabel(posted), "Sales receipt 1004"; got != want {
		t.Errorf("posted sales receipt label = %q, want %q", got, want)
	}
	if got, want := lines.ExtractLabel(reload(t, re.app, "books_sales_receipt_lines", line.Id)), "Sales receipt 1004: line 2"; got != want {
		t.Errorf("posted sales receipt line label = %q, want %q", got, want)
	}
}

// Spec §3.11: an estimate's audit row is "Estimate 1001"; a line's row follows
// its estimate ("Estimate 1001: line 2"). An estimate has its number from its
// first save, so it has no draft label.
func TestAudit_LabelsAnEstimateAndItsLines(t *testing.T) {
	ee := newEstimateEnv(t)
	audited := auditedCollections(ee.app)
	estimates, ok := audited["books_estimates"]
	if !ok {
		t.Fatal("books_estimates is not audited")
	}
	lines, ok := audited["books_estimate_lines"]
	if !ok {
		t.Fatal("books_estimate_lines is not audited")
	}
	r := ee.mkEstimate(t, nil)
	mkEstimateLine(t, ee.app, r, 0, item(ee.service, 1, 45000, false))
	line := mkEstimateLine(t, ee.app, r, 1, item(ee.accessPoint, 1, 18900, false))

	if got, want := estimates.ExtractLabel(reload(t, ee.app, "books_estimates", r.Id)), "Estimate 1001"; got != want {
		t.Errorf("estimate label = %q, want %q", got, want)
	}
	if got, want := lines.ExtractLabel(reload(t, ee.app, "books_estimate_lines", line.Id)), "Estimate 1001: line 2"; got != want {
		t.Errorf("estimate line label = %q, want %q", got, want)
	}
}

// A customer's answer through the link is audited, named by its estimate and
// its decision ("Estimate 1001: declined").
func TestAudit_LabelsAnEstimateResponse(t *testing.T) {
	pe := newPublicEnv(t)
	responses, ok := auditedCollections(pe.app)["books_estimate_responses"]
	if !ok {
		t.Fatal("books_estimate_responses is not audited")
	}
	declined := mustSaveResponse(t, pe.app, pe.a.Id, "declined", "", "Too early")
	accepted := mustSaveResponse(t, pe.app, pe.b.Id, "accepted", "Dana Whitfield", "")
	for _, tc := range []struct {
		r    *core.Record
		want string
	}{
		{reload(t, pe.app, "books_estimate_responses", declined.Id), "Estimate 1001: declined"},
		{reload(t, pe.app, "books_estimate_responses", accepted.Id), "Estimate 1002: accepted"},
	} {
		if got := responses.ExtractLabel(tc.r); got != tc.want {
			t.Errorf("audit label = %q, want %q", got, tc.want)
		}
		if got := estimateResponseLabel(pe.app, tc.r); got != tc.want {
			t.Errorf("estimateResponseLabel = %q, want %q", got, tc.want)
		}
	}
}

// The public token is a credential: a change of it is logged redacted, and a
// deleted estimate's snapshot does not hold it.
func TestAudit_RedactsTheEstimatePublicToken(t *testing.T) {
	ee := newEstimateEnv(t)
	config, ok := auditedCollections(ee.app)["books_estimates"]
	if !ok {
		t.Fatal("books_estimates is not audited")
	}
	est := ee.mkEstimate(t, nil)
	stored := reload(t, ee.app, "books_estimates", est.Id)
	token := stored.GetString("public_token")
	if token == "" {
		t.Fatal("the estimate has no public token")
	}
	changed := stored.Clone()
	changed.Set("public_token", publicUnknownToken)
	changes := audit.ComputeDiff(stored, changed, config.Redact...)
	if !reflect.DeepEqual(changes["public_token"], redactedChange) {
		t.Errorf("changes.public_token = %#v, want %#v", changes["public_token"], redactedChange)
	}

	registerAudit(&pocketbase.PocketBase{App: ee.app})
	apiReq{
		method: http.MethodDelete,
		url:    "/api/collections/books_estimates/records/" + est.Id,
		token:  tokenFor(t, ee.users.bookkeeper),
		want:   http.StatusNoContent,
		after: func(t testing.TB, app *tests.TestApp) {
			row := awaitAuditRow(t, app, "books_estimates", "deleted", est.Id)
			snapshot := auditJSONField(t, row, "snapshot")
			if snapshot["public_token"] != audit.RedactedValue {
				t.Errorf("snapshot.public_token = %#v, want %q", snapshot["public_token"], audit.RedactedValue)
			}
			requireNoLeak(t, row, token)
		},
	}.run(t, ee.app)
}

// Spec §3.11: an edit of "Sales deposited to" shows in the audit log as other
// settings edits do: a books_settings row naming the change.
func TestAudit_LogsASalesDepositAccountChange(t *testing.T) {
	app, users := newAuditedApp(t)
	undeposited := mkNumberedAccount(t, app, "Undeposited funds", "1200", "other_current_asset", "undeposited_funds")
	apiReq{
		method: http.MethodPatch,
		url:    "/api/collections/books_settings/records/" + settingsID,
		token:  tokenFor(t, users.admin),
		body:   `{"sales_deposit_account":"` + undeposited.Id + `"}`,
		want:   http.StatusOK,
		after: func(t testing.TB, app *tests.TestApp) {
			row := awaitAuditRow(t, app, "books_settings", "updated", settingsID)
			if got := row.GetString("resource_label"); got != "Books settings" {
				t.Errorf("resource_label = %q, want Books settings", got)
			}
			if got := row.GetString("actor"); got != users.admin.Id {
				t.Errorf("actor = %q, want the admin", got)
			}
			changes := auditJSONField(t, row, "changes")
			if want := map[string]any{"before": "", "after": undeposited.Id}; !reflect.DeepEqual(changes["sales_deposit_account"], want) {
				t.Errorf("changes.sales_deposit_account = %#v, want %#v", changes["sales_deposit_account"], want)
			}
		},
	}.run(t, app)
}
