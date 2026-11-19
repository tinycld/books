package books

import (
	"net/http"
	"reflect"
	"testing"

	"github.com/pocketbase/dbx"
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

// Credit memo spec §4.1: a credit memo's audit row is "Credit memo 1001", or
// "Draft credit memo" while it has no number; a line's row follows its memo
// ("Credit memo 1001: line 2").
func TestAudit_LabelsACreditMemoAndItsLines(t *testing.T) {
	ce := newCreditMemoEnv(t)
	audited := auditedCollections(ce.app)
	memos, ok := audited["books_credit_memos"]
	if !ok {
		t.Fatal("books_credit_memos is not audited")
	}
	lines, ok := audited["books_credit_memo_lines"]
	if !ok {
		t.Fatal("books_credit_memo_lines is not audited")
	}
	memo := ce.mkCreditMemo(t, nil)
	mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, 45000, false))
	line := mkCreditMemoLine(t, ce.app, memo, 1, item(ce.accessPoint, 1, 18900, false))

	if got, want := memos.ExtractLabel(reload(t, ce.app, "books_credit_memos", memo.Id)), "Draft credit memo"; got != want {
		t.Errorf("draft credit memo label = %q, want %q", got, want)
	}
	if got, want := lines.ExtractLabel(reload(t, ce.app, "books_credit_memo_lines", line.Id)), "Draft credit memo: line 2"; got != want {
		t.Errorf("draft credit memo line label = %q, want %q", got, want)
	}

	posted := mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)
	if got, want := memos.ExtractLabel(posted), "Credit memo 1001"; got != want {
		t.Errorf("posted credit memo label = %q, want %q", got, want)
	}
	if got, want := lines.ExtractLabel(reload(t, ce.app, "books_credit_memo_lines", line.Id)), "Credit memo 1001: line 2"; got != want {
		t.Errorf("posted credit memo line label = %q, want %q", got, want)
	}
}

// Refund receipt spec §3.13: a refund receipt's audit row is "Refund receipt
// 1001", or "Draft refund receipt" while it has no number; a line's row
// follows its refund ("Refund receipt 1001: line 2").
func TestAudit_LabelsARefundReceiptAndItsLines(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	audited := auditedCollections(rr.app)
	refunds, ok := audited["books_refund_receipts"]
	if !ok {
		t.Fatal("books_refund_receipts is not audited")
	}
	lines, ok := audited["books_refund_receipt_lines"]
	if !ok {
		t.Fatal("books_refund_receipt_lines is not audited")
	}
	r := rr.mkRefundReceipt(t, nil)
	mkRefundReceiptLine(t, rr.app, r, 0, item(rr.service, 1, 45000, false))
	line := mkRefundReceiptLine(t, rr.app, r, 1, item(rr.accessPoint, 1, 18900, false))

	if got, want := refunds.ExtractLabel(reload(t, rr.app, "books_refund_receipts", r.Id)), "Draft refund receipt"; got != want {
		t.Errorf("draft refund receipt label = %q, want %q", got, want)
	}
	if got, want := lines.ExtractLabel(reload(t, rr.app, "books_refund_receipt_lines", line.Id)), "Draft refund receipt: line 2"; got != want {
		t.Errorf("draft refund receipt line label = %q, want %q", got, want)
	}

	posted := mustPostRefundReceipt(t, rr.app, r.Id, rr.users.bookkeeper.Id)
	if got, want := refunds.ExtractLabel(posted), "Refund receipt 1001"; got != want {
		t.Errorf("posted refund receipt label = %q, want %q", got, want)
	}
	if got, want := lines.ExtractLabel(reload(t, rr.app, "books_refund_receipt_lines", line.Id)), "Refund receipt 1001: line 2"; got != want {
		t.Errorf("posted refund receipt line label = %q, want %q", got, want)
	}
}

// Receive payment spec §4.3: a payment's audit row is "Payment 1004", or "Draft
// payment" while it has no number; an application's row names its payment and
// its invoice ("Payment 1004: Invoice 1009").
func TestAudit_LabelsAPaymentAndItsApplications(t *testing.T) {
	pe := newPaymentEnv(t)
	audited := auditedCollections(pe.app)
	payments, ok := audited["books_payments"]
	if !ok {
		t.Fatal("books_payments is not audited")
	}
	applications, ok := audited["books_payment_applications"]
	if !ok {
		t.Fatal("books_payment_applications is not audited")
	}
	if err := setFields(t, pe.app, "books_doc_sequences", "booksseqinvoice", map[string]any{"next_number": 1009}); err != nil {
		t.Fatalf("move the invoice sequence to 1009: %v", err)
	}
	inv := pe.postedInvoice(t, pe.customer, 45000)
	if inv.GetString("number") != "1009" {
		t.Fatalf("invoice number %q, want 1009", inv.GetString("number"))
	}
	p := pe.mkPayment(t, map[string]any{"amount": 45000})
	application := mkApplication(t, pe.app, p, inv, 0, 45000)

	draft := reload(t, pe.app, "books_payments", p.Id)
	if got, want := payments.ExtractLabel(draft), "Draft payment"; got != want {
		t.Errorf("draft payment label = %q, want %q", got, want)
	}
	if got, want := paymentName(draft), "Draft payment"; got != want {
		t.Errorf("paymentName of a draft = %q, want %q", got, want)
	}
	if got, want := applications.ExtractLabel(reload(t, pe.app, "books_payment_applications", application.Id)), "Draft payment: Invoice 1009"; got != want {
		t.Errorf("draft payment application label = %q, want %q", got, want)
	}

	if err := setFields(t, pe.app, "books_doc_sequences", paymentSequenceID, map[string]any{"next_number": 1004}); err != nil {
		t.Fatalf("move the payment sequence to 1004: %v", err)
	}
	posted := mustPostPayment(t, pe.app, p.Id, pe.users.bookkeeper.Id)
	if got, want := payments.ExtractLabel(posted), "Payment 1004"; got != want {
		t.Errorf("posted payment label = %q, want %q", got, want)
	}
	if got, want := paymentName(posted), "Payment 1004"; got != want {
		t.Errorf("paymentName of a posted payment = %q, want %q", got, want)
	}
	if got, want := applications.ExtractLabel(reload(t, pe.app, "books_payment_applications", application.Id)), "Payment 1004: Invoice 1009"; got != want {
		t.Errorf("posted payment application label = %q, want %q", got, want)
	}
}

// Pay-bills spec §4.2: a bill payment's audit row is "Bill payment 1004"; a
// line's row names its payment and its bill ("Bill payment 1004: Bill 1003").
// The rows asserted are the ones the audit hooks store for the batch that
// creates and posts the payment, bound as Register binds them (registerAudit
// after registerBillPaymentGuards, so the audit's create request hook runs
// inside bindBillPaymentCreate's e.Next()).
func TestAudit_LabelsABillPaymentAndItsLines(t *testing.T) {
	bp := newBillPayEnv(t)
	audited := auditedCollections(bp.app)
	if _, ok := audited[billPaymentsCol]; !ok {
		t.Fatal("books_bill_payments is not audited")
	}
	if _, ok := audited[billPayLinesCol]; !ok {
		t.Fatal("books_bill_payment_lines is not audited")
	}
	registerAudit(&pocketbase.PocketBase{App: bp.app})
	if err := setFields(t, bp.app, "books_doc_sequences", "booksseqbill000", map[string]any{"next_number": 1003}); err != nil {
		t.Fatalf("move the bill sequence to 1003: %v", err)
	}
	bill := bp.postedBill(t, bp.summit, 45000)
	if bill.GetString("number") != "1003" {
		t.Fatalf("bill number %q, want 1003", bill.GetString("number"))
	}
	if err := setFields(t, bp.app, "books_doc_sequences", billPaySequenceID, map[string]any{"next_number": 1004}); err != nil {
		t.Fatalf("move the bill payment sequence to 1004: %v", err)
	}
	p := bp.pay(t, bp.summit, nil, payLine{bill, 45000})

	if got := p.GetString("number"); got != "1004" {
		t.Fatalf("bill payment number %q, want 1004", got)
	}
	row := awaitAuditRow(t, bp.app, billPaymentsCol, "created", p.Id)
	if got, want := row.GetString("resource_label"), "Bill payment 1004"; got != want {
		t.Errorf("stored bill payment audit label = %q, want %q", got, want)
	}
	if got := row.GetString("actor"); got != bp.users.bookkeeper.Id {
		t.Errorf("bill payment audit actor = %q, want the bookkeeper", got)
	}
	line := linesOfBillPayment(t, bp.app, p.Id)[0]
	lineRow := awaitAuditRow(t, bp.app, billPayLinesCol, "created", line.Id)
	if got, want := lineRow.GetString("resource_label"), "Bill payment 1004: Bill 1003"; got != want {
		t.Errorf("stored bill payment line audit label = %q, want %q", got, want)
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

// Spec §3.10: a bill's audit row is "Bill 1003", or "Draft bill" while it has
// no number; a line's row follows its bill and names its table and its place
// in that table, as the refusals do ("Bill 1003: Account line 2", "Bill 1003:
// Product line 1"; settled in checkpoint 1, reviewer B 7).
func TestAudit_LabelsABillAndItsLines(t *testing.T) {
	be := newBillEnv(t)
	audited := auditedCollections(be.app)
	bills, ok := audited["books_bills"]
	if !ok {
		t.Fatal("books_bills is not audited")
	}
	lines, ok := audited["books_bill_lines"]
	if !ok {
		t.Fatal("books_bill_lines is not audited")
	}
	bill := mkBill(t, be.app, be.summit, nil)
	mkBillLine(t, be.app, bill, 0, accountLine(be.software, 12500))
	accountLine2 := mkBillLine(t, be.app, bill, 1, accountLine(be.designTools, 2500))
	productLine1 := mkBillLine(t, be.app, bill, 2, productLine(be.patchCable, 2, 310))

	label := func(collection string, id string) string {
		t.Helper()
		r := reload(t, be.app, collection, id)
		if collection == "books_bills" {
			return bills.ExtractLabel(r)
		}
		return lines.ExtractLabel(r)
	}
	if got, want := label("books_bills", bill.Id), "Draft bill"; got != want {
		t.Errorf("draft bill label = %q, want %q", got, want)
	}
	if got, want := label("books_bill_lines", accountLine2.Id), "Draft bill: Account line 2"; got != want {
		t.Errorf("draft bill line label = %q, want %q", got, want)
	}

	if err := setFields(t, be.app, "books_doc_sequences", "booksseqbill000", map[string]any{"next_number": 1003}); err != nil {
		t.Fatalf("move the bill sequence to 1003: %v", err)
	}
	mustPostBill(t, be.app, bill.Id, be.users.bookkeeper.Id)
	if got, want := label("books_bills", bill.Id), "Bill 1003"; got != want {
		t.Errorf("posted bill label = %q, want %q", got, want)
	}
	if got, want := label("books_bill_lines", accountLine2.Id), "Bill 1003: Account line 2"; got != want {
		t.Errorf("posted bill account line label = %q, want %q", got, want)
	}
	if got, want := label("books_bill_lines", productLine1.Id), "Bill 1003: Product line 1"; got != want {
		t.Errorf("posted bill product line label = %q, want %q", got, want)
	}
}

// Spec §3.11: an expense's audit row is "Expense 1004", or "Draft expense"
// while it has no number; a line's row follows its expense and names its
// table and its place in that table, as lineRowLabel(expenseKind, …) does
// ("Expense 1004: Account line 2").
func TestAudit_LabelsAnExpenseAndItsLines(t *testing.T) {
	ee := newExpenseEnv(t)
	audited := auditedCollections(ee.app)
	expenses, ok := audited["books_expenses"]
	if !ok {
		t.Fatal("books_expenses is not audited")
	}
	lines, ok := audited["books_expense_lines"]
	if !ok {
		t.Fatal("books_expense_lines is not audited")
	}
	exp := ee.mkExpense(t, map[string]any{"vendor": ee.officeSupply.Id})
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.software, 12500))
	accountLine2 := mkExpenseLine(t, ee.app, exp, 1, accountLine(ee.designTools, 2500))
	productLine1 := mkExpenseLine(t, ee.app, exp, 2, productLine(ee.patchCable, 2, 310))

	if got, want := expenseLabel(reload(t, ee.app, "books_expenses", exp.Id)), "Draft expense"; got != want {
		t.Errorf("expenseLabel of a draft = %q, want %q", got, want)
	}
	if got, want := expenses.ExtractLabel(reload(t, ee.app, "books_expenses", exp.Id)), "Draft expense"; got != want {
		t.Errorf("draft expense audit label = %q, want %q", got, want)
	}
	if got, want := lines.ExtractLabel(reload(t, ee.app, "books_expense_lines", accountLine2.Id)), "Draft expense: Account line 2"; got != want {
		t.Errorf("draft expense line label = %q, want %q", got, want)
	}

	if err := setFields(t, ee.app, "books_doc_sequences", "booksseqexpense", map[string]any{"next_number": 1004}); err != nil {
		t.Fatalf("move the expense sequence to 1004: %v", err)
	}
	mustPostExpense(t, ee.app, exp.Id, ee.users.bookkeeper.Id)
	posted := reload(t, ee.app, "books_expenses", exp.Id)
	if got, want := expenseLabel(posted), "Expense 1004"; got != want {
		t.Errorf("expenseLabel of a posted expense = %q, want %q", got, want)
	}
	if got, want := expenses.ExtractLabel(posted), "Expense 1004"; got != want {
		t.Errorf("posted expense audit label = %q, want %q", got, want)
	}
	second := reload(t, ee.app, "books_expense_lines", accountLine2.Id)
	if got, want := expenseLineLabel(ee.app, second), "Expense 1004: Account line 2"; got != want {
		t.Errorf("expenseLineLabel of the second account line = %q, want %q", got, want)
	}
	if got, want := lines.ExtractLabel(second), "Expense 1004: Account line 2"; got != want {
		t.Errorf("posted expense account line audit label = %q, want %q", got, want)
	}
	if got, want := lines.ExtractLabel(reload(t, ee.app, "books_expense_lines", productLine1.Id)), "Expense 1004: Product line 1"; got != want {
		t.Errorf("posted expense product line audit label = %q, want %q", got, want)
	}
}

// Vendor refund spec §3.11: a vendor refund's audit row is "Vendor refund
// 1001", or "Draft vendor refund" while it has no number; a line's row names
// the refund and the credit it refunds ("Vendor refund 1001: Vendor credit
// 1002").
func TestAudit_LabelsAVendorRefundAndItsLines(t *testing.T) {
	re := newRefundEnv(t)
	audited := auditedCollections(re.app)
	refunds, ok := audited[refundsCol]
	if !ok {
		t.Fatal("books_vendor_refunds is not audited")
	}
	lines, ok := audited[refundLinesCol]
	if !ok {
		t.Fatal("books_vendor_refund_lines is not audited")
	}
	if err := setFields(t, re.app, "books_doc_sequences", vendorCreditSequenceID, map[string]any{"next_number": 1002}); err != nil {
		t.Fatalf("move the vendor credit sequence to 1002: %v", err)
	}
	credit := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 30000})
	if got := credit.GetString("number"); got != "1002" {
		t.Fatalf("the credit's number %q, want 1002", got)
	}
	r := re.mkRefund(t, nil)
	line := mkRefundLine(t, re.app, r, credit, 0, 15000)

	if got, want := refunds.ExtractLabel(reload(t, re.app, refundsCol, r.Id)), "Draft vendor refund"; got != want {
		t.Errorf("draft vendor refund audit label = %q, want %q", got, want)
	}
	posted := mustPostRefund(t, re.app, r.Id, re.users.bookkeeper.Id)
	if got, want := refunds.ExtractLabel(posted), "Vendor refund 1001"; got != want {
		t.Errorf("posted vendor refund audit label = %q, want %q", got, want)
	}
	if got, want := lines.ExtractLabel(reload(t, re.app, refundLinesCol, line.Id)), "Vendor refund 1001: Vendor credit 1002"; got != want {
		t.Errorf("posted vendor refund line audit label = %q, want %q", got, want)
	}
}

// Vendor credit spec §4: a vendor credit's audit row is "Vendor credit 1002",
// or "Draft vendor credit" while it has no number; a line's row follows its
// credit and names its table and its place in that table ("Vendor credit
// 1002: Account line 2"); an application's row names the credit and the bill
// ("Vendor credit 1002: Bill 1003").
func TestAudit_LabelsAVendorCreditItsLinesAndItsApplications(t *testing.T) {
	ve := newBillAndVendorCreditEnv(t)
	audited := auditedCollections(ve.app)
	credits, ok := audited["books_vendor_credits"]
	if !ok {
		t.Fatal("books_vendor_credits is not audited")
	}
	lines, ok := audited["books_vendor_credit_lines"]
	if !ok {
		t.Fatal("books_vendor_credit_lines is not audited")
	}
	applications, ok := audited["books_vendor_credit_applications"]
	if !ok {
		t.Fatal("books_vendor_credit_applications is not audited")
	}
	vc := ve.mkVendorCredit(t, ve.officeSupply, nil)
	mkVendorCreditLine(t, ve.app, vc, 0, accountLine(ve.software, 12500))
	accountLine2 := mkVendorCreditLine(t, ve.app, vc, 1, accountLine(ve.designTools, 2500))
	productLine1 := mkVendorCreditLine(t, ve.app, vc, 2, productLine(ve.patchCable, 2, 310))

	draft := reload(t, ve.app, "books_vendor_credits", vc.Id)
	if got, want := vendorCreditLabel(draft), "Draft vendor credit"; got != want {
		t.Errorf("vendorCreditLabel of a draft = %q, want %q", got, want)
	}
	if got, want := credits.ExtractLabel(draft), "Draft vendor credit"; got != want {
		t.Errorf("draft vendor credit audit label = %q, want %q", got, want)
	}
	if got, want := lines.ExtractLabel(reload(t, ve.app, "books_vendor_credit_lines", accountLine2.Id)), "Draft vendor credit: Account line 2"; got != want {
		t.Errorf("draft vendor credit line label = %q, want %q", got, want)
	}

	if err := setFields(t, ve.app, "books_doc_sequences", vendorCreditSequenceID, map[string]any{"next_number": 1002}); err != nil {
		t.Fatalf("move the vendor credit sequence to 1002: %v", err)
	}
	posted := mustPostVendorCredit(t, ve.app, vc.Id, ve.users.bookkeeper.Id)
	if got, want := vendorCreditLabel(posted), "Vendor credit 1002"; got != want {
		t.Errorf("vendorCreditLabel of a posted credit = %q, want %q", got, want)
	}
	if got, want := credits.ExtractLabel(posted), "Vendor credit 1002"; got != want {
		t.Errorf("posted vendor credit audit label = %q, want %q", got, want)
	}
	second := reload(t, ve.app, "books_vendor_credit_lines", accountLine2.Id)
	if got, want := vendorCreditLineLabel(ve.app, second), "Vendor credit 1002: Account line 2"; got != want {
		t.Errorf("vendorCreditLineLabel of the second account line = %q, want %q", got, want)
	}
	if got, want := lines.ExtractLabel(second), "Vendor credit 1002: Account line 2"; got != want {
		t.Errorf("posted vendor credit account line audit label = %q, want %q", got, want)
	}
	if got, want := lines.ExtractLabel(reload(t, ve.app, "books_vendor_credit_lines", productLine1.Id)), "Vendor credit 1002: Product line 1"; got != want {
		t.Errorf("posted vendor credit product line audit label = %q, want %q", got, want)
	}

	// The application row is written by the test app: no guard of this
	// checkpoint writes one.
	if err := setFields(t, ve.app, "books_doc_sequences", "booksseqbill000", map[string]any{"next_number": 1003}); err != nil {
		t.Fatalf("move the bill sequence to 1003: %v", err)
	}
	bill := mkBill(t, ve.app, ve.officeSupply, nil)
	mkBillLine(t, ve.app, bill, 0, accountLine(ve.software, 20000))
	mustPostBill(t, ve.app, bill.Id, ve.users.bookkeeper.Id)
	application := saveRecord(t, ve.app, "books_vendor_credit_applications", map[string]any{
		"vendor_credit": vc.Id, "bill": bill.Id, "amount": 3000, "date": "2026-11-16",
	})
	if got, want := vendorCreditApplicationLabel(ve.app, application), "Vendor credit 1002: Bill 1003"; got != want {
		t.Errorf("vendorCreditApplicationLabel = %q, want %q", got, want)
	}
	if got, want := applications.ExtractLabel(reload(t, ve.app, "books_vendor_credit_applications", application.Id)), "Vendor credit 1002: Bill 1003"; got != want {
		t.Errorf("vendor credit application audit label = %q, want %q", got, want)
	}
}

// Spec §3.9: an attachment's audit row names the file and its document
// ("Attachment OSW-invoice-1002.pdf on Bill 1002", "Attachment receipt.jpg on
// Draft expense"), and the file alone once its document is gone (the delete
// snapshot of a cascade after Delete draft).
func TestAudit_LabelsAnAttachment(t *testing.T) {
	ae := newAttachEnv(t)
	config, ok := auditedCollections(ae.app)["books_attachments"]
	if !ok {
		t.Fatal("books_attachments is not audited")
	}
	label := func(r *core.Record) string {
		t.Helper()
		byConfig, byFunc := config.ExtractLabel(r), attachmentLabel(ae.app, r)
		if byConfig != byFunc {
			t.Errorf("audit label %q differs from attachmentLabel %q", byConfig, byFunc)
		}
		return byFunc
	}

	if err := setFields(t, ae.app, "books_doc_sequences", "booksseqbill000", map[string]any{"next_number": 1002}); err != nil {
		t.Fatalf("move the bill sequence to 1002: %v", err)
	}
	bill := ae.postedBill(t)
	pdf := mustStoreAttachment(t, ae.app, onBill(bill.Id), "", "OSW-invoice-1002.pdf")
	if got, want := label(pdf), "Attachment OSW-invoice-1002.pdf on Bill 1002"; got != want {
		t.Errorf("posted bill attachment label = %q, want %q", got, want)
	}

	draft := ae.draftExpense(t)
	receipt := mustStoreAttachment(t, ae.app, onExpense(draft.Id), "", "receipt.jpg")
	if got, want := label(receipt), "Attachment receipt.jpg on Draft expense"; got != want {
		t.Errorf("draft expense attachment label = %q, want %q", got, want)
	}

	if err := ae.app.Delete(reload(t, ae.app, "books_expenses", draft.Id)); err != nil {
		t.Fatalf("delete the draft expense: %v", err)
	}
	if got, want := label(receipt), "Attachment receipt.jpg"; got != want {
		t.Errorf("attachment label after its expense is gone = %q, want %q", got, want)
	}
}

// An attachment's create and delete each write one audit row.
func TestAudit_LogsAnAttachmentCreateAndDelete(t *testing.T) {
	countRows := func(t testing.TB, app core.App, action string) int64 {
		t.Helper()
		n, err := app.CountRecords("audit_logs", dbx.HashExp{"resource_type": "books_attachments", "action": action})
		if err != nil {
			t.Fatalf("count audit rows: %v", err)
		}
		return n
	}
	t.Run("create", func(t *testing.T) {
		ae := newAttachEnv(t)
		registerAudit(&pocketbase.PocketBase{App: ae.app})
		bill := ae.postedBill(t)
		req := ae.attach(t, "bill", bill.Id, "OSW-invoice-1002.pdf", pdfBytes(2048))
		req.want = http.StatusOK
		req.after = func(t testing.TB, app *tests.TestApp) {
			row := onlyAttachment(t, app, "bill", bill.Id)
			logged := awaitAuditRow(t, app, "books_attachments", "created", row.Id)
			if got := logged.GetString("actor"); got != ae.users.bookkeeper.Id {
				t.Errorf("audit actor = %q, want the bookkeeper", got)
			}
			if got, want := logged.GetString("resource_label"), "Attachment OSW-invoice-1002.pdf on "+billLabel(bill); got != want {
				t.Errorf("resource_label = %q, want %q", got, want)
			}
			if n := countRows(t, app, "created"); n != 1 {
				t.Errorf("%d created audit rows, want 1", n)
			}
		}
		req.run(t, ae.app)
	})
	t.Run("delete", func(t *testing.T) {
		ae := newAttachEnv(t)
		registerAudit(&pocketbase.PocketBase{App: ae.app})
		bill := ae.postedBill(t)
		row := mustStoreAttachment(t, ae.app, onBill(bill.Id), "", "OSW-invoice-1002.pdf")
		apiReq{
			method: http.MethodDelete,
			url:    attachmentsURL + "/" + row.Id,
			token:  tokenFor(t, ae.users.bookkeeper),
			want:   http.StatusNoContent,
			after: func(t testing.TB, app *tests.TestApp) {
				awaitAuditRow(t, app, "books_attachments", "deleted", row.Id)
				if n := countRows(t, app, "deleted"); n != 1 {
					t.Errorf("%d deleted audit rows, want 1", n)
				}
			},
		}.run(t, ae.app)
	})
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
