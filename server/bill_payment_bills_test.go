package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// A bill's balance (pay-bills spec §4.1, §4.3, Q22) and the rules a bill
// payment puts on its bill: no void while a posted payment pays it, and a
// correction takes the payments over.

const (
	wantBillVoidWithPayments     = "Payments are applied to this bill. Void or edit those payments first."
	wantBillCorrectionBelow30000 = "Payments of $300.00 are applied to this bill. Its total cannot be below that."
	wantBillCorrectionVendor     = "Payments are applied to this bill, so its vendor cannot change."
)

// paidBill posts a bill of 50000 for Summit IT Services and a bill payment of
// 30000 on it.
func (bp *billPayEnv) paidBill(t testing.TB) (bill, payment *core.Record) {
	t.Helper()
	bill = bp.postedBill(t, bp.summit, 50000)
	payment = bp.pay(t, bp.summit, nil, payLine{bill, 30000})
	requireBillBalance(t, bp.app, bill, 20000)
	return bill, payment
}

// billCorrectionOf saves a draft correction of original for vendor with one
// account line of total.
func (bp *billPayEnv) billCorrectionOf(t testing.TB, original, vendor *core.Record, total int64) *core.Record {
	t.Helper()
	draft, err := newBill(bp.app, vendor, map[string]any{"replaces": original.Id})
	if err != nil {
		t.Fatalf("save the correction draft: %v", err)
	}
	mkBillLine(t, bp.app, draft, 0, accountLine(bp.software, total))
	return draft
}

func requirePaymentLinesName(t testing.TB, app core.App, payment, bill *core.Record) {
	t.Helper()
	rows, err := app.FindAllRecords(billPayLinesCol, dbx.HashExp{"payment": payment.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) == 0 {
		t.Fatal("the bill payment has no lines")
	}
	for _, r := range rows {
		if got := r.GetString("bill"); got != bill.Id {
			t.Errorf("bill payment line %s names bill %q, want %q", r.Id, got, bill.Id)
		}
	}
}

func TestBillBalance_PostedIsTheTotalAndADraftIsZero(t *testing.T) {
	bp := newBillPayEnv(t)
	bill := mkBill(t, bp.app, bp.summit, nil)
	mkBillLine(t, bp.app, bill, 0, accountLine(bp.software, 45000))
	requireBillTotal(t, bp.app, bill.Id, 45000)
	requireBillBalance(t, bp.app, bill, 0)

	mustPostBill(t, bp.app, bill.Id, bp.users.bookkeeper.Id)
	requireBillBalance(t, bp.app, bill, 45000)
}

// balance is a server field: a person's write of it is refused.
func TestBillBalance_APersonCannotSetIt(t *testing.T) {
	t.Run("an update of a posted bill", func(t *testing.T) {
		bp := newBillPayEnv(t)
		bill := bp.postedBill(t, bp.summit, 45000)
		if err := setFields(t, bp.app, "books_bills", bill.Id, map[string]any{"balance": 100}); err == nil {
			t.Error("a person's update of a posted bill's balance was saved")
		}
		requireBillBalance(t, bp.app, bill, 45000)
	})

	t.Run("a create over REST", func(t *testing.T) {
		bp := newBillPayEnv(t)
		status, body := bp.rest(t).send(t, bp.users.bookkeeper, http.MethodPost, "/api/collections/books_bills/records",
			fmt.Sprintf(`{"vendor":%q,"status":"draft","date":%q,"due_date":%q,"balance":100}`, bp.summit.Id, billDay, billDueDay))
		if status != http.StatusBadRequest {
			t.Errorf("a create that sets balance answered %d %s, want 400", status, body)
		}
		if n, _ := bp.app.CountRecords("books_bills"); n != 0 {
			t.Errorf("%d bills after a create that set balance, want 0", n)
		}
	})
}

func TestBillVoid_RefusedWhileAPostedPaymentPays(t *testing.T) {
	bp := newBillPayEnv(t)
	actor := bp.users.bookkeeper.Id
	bill, payment := bp.paidBill(t)

	requireRefusalText(t, voidBillAs(bp.app, bill.Id, actor), wantBillVoidWithPayments)
	if s := reload(t, bp.app, "books_bills", bill.Id).GetString("status"); s != statusPosted {
		t.Errorf("bill status %q after the refusal, want posted", s)
	}

	if err := voidBillPaymentAs(bp.app, payment.Id, actor); err != nil {
		t.Fatalf("void the bill payment: %v", err)
	}
	if err := voidBillAs(bp.app, bill.Id, actor); err != nil {
		t.Fatalf("void the bill after its payment was voided: %v", err)
	}
	voided := reload(t, bp.app, "books_bills", bill.Id)
	if voided.GetString("status") != statusVoid || voided.GetInt("balance") != 0 {
		t.Errorf("bill status %q balance %d, want void and 0", voided.GetString("status"), voided.GetInt("balance"))
	}
}

func TestBillCorrection_TakesOverThePayments(t *testing.T) {
	bp := newBillPayEnv(t)
	bill, payment := bp.paidBill(t)
	draft := bp.billCorrectionOf(t, bill, bp.summit, 45000)

	corrected := mustPostBill(t, bp.app, draft.Id, bp.users.bookkeeper.Id)
	if corrected.GetString("status") != statusPosted || corrected.GetString("number") != bill.GetString("number") {
		t.Errorf("correction status %q number %q, want posted with the original's number %q",
			corrected.GetString("status"), corrected.GetString("number"), bill.GetString("number"))
	}
	original := reload(t, bp.app, "books_bills", bill.Id)
	if original.GetString("status") != statusVoid || original.GetInt("balance") != 0 {
		t.Errorf("original status %q balance %d, want void and 0", original.GetString("status"), original.GetInt("balance"))
	}
	requirePaymentLinesName(t, bp.app, payment, draft)
	requireBillBalance(t, bp.app, corrected, 15000)
	if got, err := documentBalance(bp.app, billBalanceKind, draft.Id); err != nil || got != 15000 {
		t.Errorf("documentBalance of the correction = %d, err %v; want 15000", got, err)
	}
	requireNoDrift(t, bp.app)
}

func TestBillCorrection_RefusedBelowThePayments(t *testing.T) {
	bp := newBillPayEnv(t)
	bill, payment := bp.paidBill(t)
	draft := bp.billCorrectionOf(t, bill, bp.summit, 20000)
	next := nextBillNumber(t, bp.app)

	requireRefusalText(t, postBillAs(bp.app, draft.Id, bp.users.bookkeeper.Id), wantBillCorrectionBelow30000)
	requireBillNotPosted(t, bp.app, draft.Id, next)
	if s := reload(t, bp.app, "books_bills", bill.Id).GetString("status"); s != statusPosted {
		t.Errorf("original status %q after the refusal, want posted", s)
	}
	requirePaymentLinesName(t, bp.app, payment, bill)
	requireBillBalance(t, bp.app, bill, 20000)
}

func TestBillCorrection_RefusesAnotherVendor(t *testing.T) {
	bp := newBillPayEnv(t)
	bill, payment := bp.paidBill(t)
	draft := bp.billCorrectionOf(t, bill, bp.officeSupply, 50000)
	next := nextBillNumber(t, bp.app)

	requireRefusalText(t, postBillAs(bp.app, draft.Id, bp.users.bookkeeper.Id), wantBillCorrectionVendor)
	requireBillNotPosted(t, bp.app, draft.Id, next)
	if s := reload(t, bp.app, "books_bills", bill.Id).GetString("status"); s != statusPosted {
		t.Errorf("original status %q after the refusal, want posted", s)
	}
	requirePaymentLinesName(t, bp.app, payment, bill)
}

// A void bill payment keeps its history on the bill it paid: a correction takes
// over only the lines of posted payments. Bill B of vendor V is paid by P, P is
// voided, and B is corrected with vendor W: the correction posts (no posted
// payment pays B, so the vendor may change), and P's line still names B, not
// the correction, so no line names a bill of another vendor than its payment's.
func TestBillCorrection_LeavesAVoidPaymentOnTheOriginal(t *testing.T) {
	bp := newBillPayEnv(t)
	bill, payment := bp.paidBill(t)
	if err := voidBillPaymentAs(bp.app, payment.Id, bp.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the bill payment: %v", err)
	}
	requireBillBalance(t, bp.app, bill, 50000)
	draft := bp.billCorrectionOf(t, bill, bp.officeSupply, 45000)

	corrected := mustPostBill(t, bp.app, draft.Id, bp.users.bookkeeper.Id)
	if corrected.GetString("vendor") != bp.officeSupply.Id {
		t.Errorf("correction vendor %q, want Office Supply World %q", corrected.GetString("vendor"), bp.officeSupply.Id)
	}
	requirePaymentLinesName(t, bp.app, payment, bill)
	requireBillBalance(t, bp.app, corrected, 45000)
	requireBillBalance(t, bp.app, bill, 0)
	requireNoDrift(t, bp.app)
}

// A correction of a bill no payment pays posts as before, and the original's
// balance becomes 0.
func TestBillCorrection_WithoutPaymentsPostsAsBefore(t *testing.T) {
	bp := newBillPayEnv(t)
	bill := bp.postedBill(t, bp.summit, 50000)
	draft := bp.billCorrectionOf(t, bill, bp.officeSupply, 20000)

	corrected := mustPostBill(t, bp.app, draft.Id, bp.users.bookkeeper.Id)
	if corrected.GetString("number") != bill.GetString("number") {
		t.Errorf("correction number %q, want the original's %q", corrected.GetString("number"), bill.GetString("number"))
	}
	requireBillBalance(t, bp.app, corrected, 20000)
	requireBillBalance(t, bp.app, bill, 0)
}
