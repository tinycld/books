package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

// paymentPostStatements posts, in one batch as the CLI sends it, one payment
// that pays each of `invoices` posted invoices 1.00, and returns the
// statements of the batch.
func paymentPostStatements(t *testing.T, invoices int) []string {
	t.Helper()
	env := newPaymentEnv(t)
	enableBatch(t, env.app)
	ids := make([]string, invoices)
	for i := range ids {
		ids[i] = env.postedInvoice(t, env.customer, 100).Id
	}
	const payment = "clipaymentcost1"
	ops := []string{cliOp("POST", "books_payments", "", fmt.Sprintf(`{"amount":%d,"customer":%q,"date":"2026-11-04","id":%q,"status":"draft"}`, 100*invoices, env.customer.Id, payment))}
	for position, id := range ids {
		ops = append(ops, rowOp("books_payment_applications", "payment", payment, position, fmt.Sprintf(`"amount":100,"invoice":%q`, id)))
	}
	ops = append(ops, cliOp("PATCH", "books_payments", payment, `{"status":"posted"}`))
	took, statements := statementsOf(t, env.app, apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, env.users.bookkeeper),
		body: batchBody(ops...), want: http.StatusOK,
	})
	t.Logf("post of a payment of %d invoices in one batch: %s, %d statements", invoices, took, len(statements))
	requireNoDrift(t, env.app)
	return statements
}

// isCashMonthSum matches the read that sums one account's cash rows of one
// month (cashMonthSumSQL), which reads every cash row of that month.
func isCashMonthSum(statement string) bool {
	return strings.Contains(statement, "COUNT(*) AS n") && strings.Contains(statement, "FROM books_cash_basis_lines")
}

func countMatching(statements []string, match func(string) bool) int {
	n := 0
	for _, s := range statements {
		if match(s) {
			n++
		}
	}
	return n
}

// A payment of many invoices is one batch, and PocketBase ends a batch after
// its timeout (3s), so the post of each invoice must stay cheap. Every invoice
// of one payment writes its cash rows in the same accounts and month: the
// stored cash month is summed again one time for each write, not one time for
// each invoice, or each invoice reads every cash row of that month and the
// post reads N*N rows.
func TestBatchCost_PaymentPostSumsEachCashMonthOnce(t *testing.T) {
	small := countMatching(paymentPostStatements(t, 50), isCashMonthSum)
	large := countMatching(paymentPostStatements(t, 100), isCashMonthSum)
	if large != small {
		t.Fatalf("cash month sums: %d for 50 invoices, %d for 100, want the same count: the post sums a cash month again for each invoice", small, large)
	}
}

// isReceivableInvoiceRefresh matches the reads and writes of the stored
// receivable rows of one invoice (refreshReceivableInvoice).
func isReceivableInvoiceRefresh(statement string) bool {
	return strings.Contains(statement, "FROM books_receivable_items WHERE item = ")
}

// The post lowers the balance of each invoice the payment pays. A receivable
// row reads no balance, and the payment's own update stores its rows on every
// invoice (refreshReceivablePayment), so that balance save stores no
// receivable row of the invoice again: the post of N invoices does not run N
// refreshes that write what the payment's one refresh writes.
func TestBatchCost_PaymentPostRefreshesNoInvoiceReceivables(t *testing.T) {
	if n := countMatching(paymentPostStatements(t, 50), isReceivableInvoiceRefresh); n != 0 {
		t.Fatalf("%d statements refresh the receivable rows of an invoice in the post of a payment of 50 invoices, want 0", n)
	}
}

// isPayableBillRefresh matches the reads and writes of the stored payable rows
// of one bill (refreshPayableBill).
func isPayableBillRefresh(statement string) bool {
	return strings.Contains(statement, "FROM books_payable_items WHERE (item = ")
}

// The post and the void of a bill payment move the balance of each bill it
// pays. A payable row reads no balance, and the payment's own update stores
// its lines on every bill (refreshPayablePayment), so those balance saves
// store no payable row of the bill again.
func TestBatchCost_BillPaymentPostAndVoidRefreshNoBillPayables(t *testing.T) {
	const bills = 50
	env := newBillPayEnv(t)
	ids := make([]string, bills)
	for i := range ids {
		ids[i] = env.postedBill(t, env.summit, 100).Id
	}
	const payment = "clibillpaycost1"
	ops := []string{cliOp("POST", "books_bill_payments", "", fmt.Sprintf(`{"date":"2026-11-10","id":%q,"paid_from":%q,"payment_method":"check","status":"posted","vendor":%q}`,
		payment, env.checking1000.Id, env.summit.Id))}
	for position, id := range ids {
		ops = append(ops, rowOp("books_bill_payment_lines", "payment", payment, position, fmt.Sprintf(`"amount":100,"bill":%q`, id)))
	}
	token := tokenFor(t, env.users.bookkeeper)
	_, post := statementsOf(t, env.app, apiReq{
		method: http.MethodPost, url: "/api/batch", token: token, body: batchBody(ops...), want: http.StatusOK,
	})
	requireNoDrift(t, env.app)
	_, void := statementsOf(t, env.app, apiReq{
		method: http.MethodPatch, url: recordURL("books_bill_payments", payment), token: token, body: `{"status":"void"}`, want: http.StatusOK,
	})
	requireNoDrift(t, env.app)
	if n := countMatching(post, isPayableBillRefresh); n != 0 {
		t.Errorf("%d statements refresh the payable rows of a bill in the post of a bill payment of %d bills, want 0", n, bills)
	}
	if n := countMatching(void, isPayableBillRefresh); n != 0 {
		t.Errorf("%d statements refresh the payable rows of a bill in the void of a bill payment of %d bills, want 0", n, bills)
	}
}
