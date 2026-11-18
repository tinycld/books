package books

import "tinycld.org/core/changesignal"

const (
	receivableLinesView        = "books_receivable_lines"
	receivableApplicationsView = "books_receivable_applications"
)

// Both views give A/R lines and payment applications to their open items: a
// post or void moves lines, entries and applications; an account type change
// moves which lines are A/R; a payment's status and credited and an invoice's
// due day are read into the rows.
func registerReceivableItems() {
	sources := []string{
		"books_journal_lines", "books_journal_entries", "books_accounts",
		"books_invoices", "books_payments", "books_payment_applications",
	}
	changesignal.RegisterView(receivableLinesView, sources...)
	changesignal.RegisterView(receivableApplicationsView, sources...)
}
