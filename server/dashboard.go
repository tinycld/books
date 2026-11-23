package books

import "tinycld.org/core/changesignal"

const (
	invoiceDueTotalsView = "books_invoice_due_totals"
	paymentDayTotalsView = "books_payment_day_totals"
)

// The dashboard views sum posted invoices by due date and posted payments by
// date; a write to an invoice or a payment can move any of their rows.
func registerDashboardViews() {
	changesignal.RegisterView(invoiceDueTotalsView, "books_invoices")
	changesignal.RegisterView(paymentDayTotalsView, "books_payments")
}
