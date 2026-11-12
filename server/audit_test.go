package books

import (
	"net/http"
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase/tests"
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
