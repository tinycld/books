package books

import (
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The move of a corrected document's files (spec §3.6): when a correction
// posts, every attachment of the original (section rows and custom File field
// rows) is re-pointed to the correction in the posting transaction. Files are
// moved, not copied: the rows keep their ids and stored files.

// movedRow is what a move must keep of a row.
type movedRow struct {
	id, file, name, field string
}

func snapshotRows(rows []*core.Record) map[string]movedRow {
	out := map[string]movedRow{}
	for _, r := range rows {
		out[r.Id] = movedRow{id: r.Id, file: r.GetString("file"), name: r.GetString("name"), field: r.GetString("field")}
	}
	return out
}

// threeFilesOn stores two section rows and one W-9 custom-field row on the
// parent.
func threeFilesOn(t testing.TB, app core.App, parent map[string]any) map[string]movedRow {
	t.Helper()
	return snapshotRows([]*core.Record{
		mustStoreAttachment(t, app, parent, "", "OSW-invoice-1002.pdf"),
		mustStoreAttachment(t, app, parent, "", "packing-slip.pdf"),
		mustStoreAttachment(t, app, parent, "w9_form", "office-supply-world-w9.pdf"),
	})
}

// requireMoved checks that the rows of before now sit on the correction with
// their ids, names, fields and stored files unchanged, the original holds
// none, and no row was added.
func requireMoved(t testing.TB, app core.App, column, originalID, correctionID string, before map[string]movedRow) {
	t.Helper()
	after := attachmentsOn(t, app, column, correctionID)
	if got := snapshotRows(after); !reflect.DeepEqual(got, before) {
		t.Errorf("rows on the correction = %+v, want the original's %+v", got, before)
	}
	for _, r := range after {
		if !storedFileExists(t, app, r) {
			t.Errorf("%s has no stored file after the move", r.GetString("name"))
		}
	}
	requireAttachmentCount(t, app, column, originalID, 0)
	if n, err := app.CountRecords("books_attachments"); err != nil || n != int64(len(before)) {
		t.Errorf("%d attachments stored after the move (err %v), want %d (moved, not copied)", n, err, len(before))
	}
}

func TestAttachmentMove_ABillCorrectionTakesEveryFile(t *testing.T) {
	ae := newAttachEnv(t)
	actor := ae.users.bookkeeper.Id
	original := ae.postedBill(t)
	before := threeFilesOn(t, ae.app, onBill(original.Id))

	correction := mkBill(t, ae.app, ae.officeSupply, map[string]any{"replaces": original.Id, "memo": "Corrected"})
	mkBillLine(t, ae.app, correction, 0, accountLine(ae.designTools, 20000))
	if err := postBillAs(ae.app, correction.Id, actor); err != nil {
		t.Fatalf("post the correction: %v", err)
	}

	voided := reload(t, ae.app, "books_bills", original.Id)
	if voided.GetString("status") != statusVoid || voided.GetString("replaced_by") != correction.Id {
		t.Errorf("original status %q replaced_by %q, want void and the correction", voided.GetString("status"), voided.GetString("replaced_by"))
	}
	requireMoved(t, ae.app, "bill", original.Id, correction.Id, before)
}

func TestAttachmentMove_AnExpenseCorrectionTakesEveryFile(t *testing.T) {
	ae := newAttachEnv(t)
	actor := ae.users.bookkeeper.Id
	original := ae.postedExpense(t)
	before := threeFilesOn(t, ae.app, onExpense(original.Id))

	correction := ae.mkExpense(t, map[string]any{"vendor": ae.officeSupply.Id, "replaces": original.Id, "memo": "Corrected"})
	mkExpenseLine(t, ae.app, correction, 0, accountLine(ae.designTools, 20000))
	if err := postExpenseAs(ae.app, correction.Id, actor); err != nil {
		t.Fatalf("post the correction: %v", err)
	}

	voided := reload(t, ae.app, "books_expenses", original.Id)
	if voided.GetString("status") != statusVoid || voided.GetString("replaced_by") != correction.Id {
		t.Errorf("original status %q replaced_by %q, want void and the correction", voided.GetString("status"), voided.GetString("replaced_by"))
	}
	requireMoved(t, ae.app, "expense", original.Id, correction.Id, before)
}

// The move runs in the posting transaction: a refused post moves nothing.
func TestAttachmentMove_ARefusedCorrectionPostMovesNothing(t *testing.T) {
	ae := newAttachEnv(t)
	original := ae.postedBill(t)
	before := threeFilesOn(t, ae.app, onBill(original.Id))
	correction := mkBill(t, ae.app, ae.officeSupply, map[string]any{"replaces": original.Id, "memo": "Corrected"})
	mkBillLine(t, ae.app, correction, 0, accountLine(ae.designTools, 20000))
	setCloseDate(t, ae.app, billDay)

	requireRefused(t, postBillAs(ae.app, correction.Id, ae.users.bookkeeper.Id), "The books are closed through 2026-11-04")

	if got := snapshotRows(attachmentsOn(t, ae.app, "bill", original.Id)); !reflect.DeepEqual(got, before) {
		t.Errorf("rows on the original after a refused post = %+v, want %+v", got, before)
	}
	requireAttachmentCount(t, ae.app, "bill", correction.Id, 0)
	if s := reload(t, ae.app, "books_bills", original.Id).GetString("status"); s != statusPosted {
		t.Errorf("original status %q after a refused correction post, want posted", s)
	}
}

func TestAttachmentMove_FromADocumentWithNoFilesIsANoOp(t *testing.T) {
	ae := newAttachEnv(t)
	empty := ae.draftBill(t)
	target := ae.draftBill(t)
	kept := mustStoreAttachment(t, ae.app, onBill(target.Id), "", "OSW-invoice-1002.pdf")
	if err := moveAttachments(ae.app, "bill", empty.Id, target.Id); err != nil {
		t.Fatalf("move from a bill with no files: %v", err)
	}
	rows := attachmentsOn(t, ae.app, "bill", target.Id)
	if len(rows) != 1 || rows[0].Id != kept.Id {
		t.Errorf("target rows = %v, want only its own %s", rows, kept.Id)
	}
	requireAttachmentCount(t, ae.app, "bill", empty.Id, 0)
}

// The bill and expense corrections move their files; an invoice correction
// still moves its estimate link, and nothing else.
func TestAttachmentMove_KindsReplaceSteps(t *testing.T) {
	if billKind.Replace == nil || expenseKind.Replace == nil {
		t.Fatalf("bill Replace set %v, expense Replace set %v; want both to move attachments",
			billKind.Replace != nil, expenseKind.Replace != nil)
	}
	if reflect.ValueOf(invoiceKind.Replace).Pointer() != reflect.ValueOf(moveEstimateTo).Pointer() {
		t.Error("invoiceKind.Replace is no longer moveEstimateTo")
	}
}
