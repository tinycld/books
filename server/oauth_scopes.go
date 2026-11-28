package books

import "tinycld.org/core/oauth"

const (
	scopeRead  = "books:read"
	scopeWrite = "books:write"
)

// oauthPackage declares what an OAuth token may reach in Books. A token acts
// as its user, so the access-level rules apply to it as to a session; the
// scope only decides whether a token may use a collection at all.
//
// The ledger, the customers, the vendors, their contact people, the products
// (with their bundle rows), the sales and purchase documents with their lines,
// the bill and expense attachments, the received payments with the invoices
// they pay, the bill payments with the bills they pay, the vendor credit and
// credit memo applications, the write-offs, the
// sales tax agencies,
// rates and groups, the bank connections, their files and the imports of those
// files, the bank matches, and the reconciliations with their cleared rows are
// read-write. So are the bank transactions: their update rule lets a writer
// change only status, and only between For review and Excluded, and they have
// no create and no delete rule. A file's parsed rows, the matched lines
// and the cash-basis rows, which only the server writes, and the party
// balances, match suggestions, reconcile lines and audit log views are
// read-only. Everything that
// decides who may do what (the settings with the close date, numbering,
// overrides, admin grants) is read-only for tokens, as is a sales document's
// tax snapshot, which only posting writes: "record transactions" on a consent
// screen does not read as "reopen a closed year". The estimates' and the
// invoices' public views are read-only (nobody writes a view); the customers'
// responses are read-write, and their rules still decide who may read or
// create one. The document sends are read-only: only the send route writes
// them. The balance rebuild route is left out, so core's grant middleware
// default-denies it to every token: it is session-only. The public estimate
// and invoice PDF routes are left out too: the link token is their credential.
// A user's sidebar shortcuts are read-only: arranging a screen is done in the
// app, not by a token.
func oauthPackage() oauth.Package {
	rw := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	ro := oauth.Access{Read: []string{scopeRead}}
	return oauth.Package{
		Slug: "books",
		Scopes: []oauth.Scope{
			{ID: scopeRead, Label: "Read your company's accounts and transactions"},
			{ID: scopeWrite, Label: "Record and change transactions in your company's books"},
		},
		Collections: map[string]oauth.Access{
			"books_accounts":                   rw,
			"books_journal_entries":            rw,
			"books_journal_lines":              rw,
			"books_customers":                  rw,
			"books_vendors":                    rw,
			"books_products":                   rw,
			"books_bundle_items":               rw,
			"books_bank_connections":           rw,
			"books_bank_files":                 rw,
			"books_bank_imports":               rw,
			"books_bank_file_contents":         ro,
			"books_bank_transactions":          rw,
			bankMatchesCollection:              rw,
			bankCategorizationsCollection:      rw,
			bankMatchLinesCollection:           ro,
			"books_bank_match_suggestions":     ro,
			reconciliationsCollection:          rw,
			reconciliationLinesCollection:      rw,
			reconcileLinesView:                 ro,
			reconciledLinesView:                ro,
			"books_tax_agencies":               rw,
			"books_tax_rates":                  rw,
			"books_invoices":                   rw,
			"books_invoice_lines":              rw,
			"books_invoice_tax_lines":          ro,
			invoicePublicCollection:            ro,
			"books_sales_receipts":             rw,
			"books_sales_receipt_lines":        rw,
			"books_sales_receipt_tax_lines":    ro,
			"books_estimates":                  rw,
			"books_estimate_lines":             rw,
			"books_estimate_public":            ro,
			"books_estimate_responses":         rw,
			"books_credit_memos":               rw,
			"books_credit_memo_lines":          rw,
			"books_credit_memo_tax_lines":      ro,
			"books_refund_receipts":            rw,
			"books_refund_receipt_lines":       rw,
			"books_refund_receipt_tax_lines":   ro,
			"books_refund_receipt_credits":     ro,
			"books_refund_receipt_sale_lines":  ro,
			"books_bills":                      rw,
			"books_bill_lines":                 rw,
			"books_purchase_orders":            rw,
			"books_purchase_order_lines":       rw,
			"books_expenses":                   rw,
			"books_expense_lines":              rw,
			"books_attachments":                rw,
			"books_payments":                   rw,
			"books_payment_applications":       rw,
			"books_bill_payments":              rw,
			"books_bill_payment_lines":         rw,
			vendorCreditsCollection:            rw,
			vendorCreditLinesCollection:        rw,
			vendorCreditApplicationsCollection: rw,
			creditMemoApplicationsCollection:   rw,
			vendorRefundsCollection:            rw,
			vendorRefundLinesCollection:        rw,
			writeOffsCollection:                rw,
			depositsCollection:                 rw,
			depositItemsCollection:             rw,
			depositLinesCollection:             rw,
			inventoryAdjustmentsCollection:     rw,
			inventoryAdjustmentLinesCollection: rw,
			"books_stock_moves":                ro,
			"books_stock_layers":               ro,
			binsCollection:                     rw,
			binTransfersCollection:             rw,
			binStockCollection:                 ro,
			"books_undeposited_items":          ro,
			"books_cash_basis_lines":           ro,
			"books_cash_basis_balances":        ro,
			"books_cash_basis_tax_lines":       ro,
			"books_party_contacts":             rw,
			"books_party_balances":             ro,
			"books_invoice_due_totals":         ro,
			"books_payment_day_totals":         ro,
			"books_receivable_items":           ro,
			"books_payable_items":              ro,
			"books_audit_log":                  ro,
			"books_account_balances":           ro,
			"books_settings":                   ro,
			"books_doc_sequences":              ro,
			"books_close_overrides":            ro,
			"books_admins":                     ro,
			"books_access":                     ro,
			statementsCollection:               rw,
			documentSendsCollection:            ro,
			"books_sidebar_shortcuts":          ro,
		},
	}
}
