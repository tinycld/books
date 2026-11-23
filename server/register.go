package books

import (
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/changesignal"
	"tinycld.org/core/oauth"
	"tinycld.org/core/quota"
	"tinycld.org/core/reports"
	"tinycld.org/core/search"
)

// Register wires the Books server. Core's generator calls it once from
// server/package_extensions.go; it is the only place the parts below are
// bound, so each hook and the route exist once (registrations_test.go pins
// that against the parts bound by hand).
//
// Authorization is rule-first: the collection rules (pb-migrations) decide
// who may read and write, by Books access level. The Go here adds what a rule
// cannot express: posting validation, immutability, numbering, balance rows
// and reversals, and the PDF routes (pdf_routes.go). Core learns what Books
// provides through its registries and never names Books.
func Register(app *pocketbase.PocketBase) {
	registerLedger(app)
	registerSalesDocGuards(app, invoiceKind)
	registerSalesDocGuards(app, salesReceiptKind)
	registerSalesDocGuards(app, estimateKind)
	registerSalesDocGuards(app, creditMemoKind)
	registerSalesDocGuards(app, billKind)
	registerSalesDocGuards(app, expenseKind)
	registerSalesDocGuards(app, vendorCreditKind)
	registerSalesDocGuards(app, refundReceiptKind)
	registerPaymentGuards(app)
	registerBillPaymentGuards(app)
	registerVendorCreditApplications(app)
	registerCreditMemoApplications(app)
	registerVendorRefundGuards(app)
	registerWriteOffGuards(app)
	registerDepositGuards(app)
	registerPartyBalances()
	registerEstimateResponses(app)
	// Declare the public views' source tables so CheckViews and the change
	// signals for signed-in clients know them. The signed-out customer page
	// gets no signal; it re-reads on foreground, network back or reload.
	changesignal.RegisterView("books_estimate_public", "books_estimates", "books_customers", "books_settings")
	changesignal.RegisterView(invoicePublicCollection, "books_invoices", "books_customers", "books_settings",
		creditMemoApplicationsCollection)
	// The audit log view reads core's audit rows, the actor's name from users
	// and a line row's document from the live line, so a write to any of them
	// can change its rows.
	changesignal.RegisterView("books_audit_log", append([]string{"audit_logs", "users"}, auditLineCollections()...)...)
	// The sale-lines view reads the refund lines and, for the payout filter,
	// their refund's credit_memo.
	changesignal.RegisterView("books_refund_receipt_sale_lines", "books_refund_receipt_lines", "books_refund_receipts")
	// The match suggestions read the bank transactions with their connection,
	// the journal lines with their entry, and the matched lines.
	changesignal.RegisterView("books_bank_match_suggestions", "books_bank_transactions", "books_journal_lines",
		"books_journal_entries", "books_bank_match_lines", "books_bank_connections")
	// The reconcile lines read the journal lines with their account, entry and
	// party, the cleared rows, and the matched lines.
	changesignal.RegisterView(reconcileLinesView, "books_journal_lines", "books_journal_entries", "books_accounts",
		"books_customers", "books_vendors", reconciliationLinesCollection, reconciliationsCollection,
		bankMatchLinesCollection)
	// The reconciled lines read the cleared rows with their finished
	// reconciliation, journal line and entry, and the line's party.
	changesignal.RegisterView(reconciledLinesView, reconciliationLinesCollection, reconciliationsCollection,
		"books_journal_lines", "books_journal_entries", "books_customers", "books_vendors")
	// The undeposited items read the journal lines with their entry and account,
	// the posted deposit items, and each source document's payment method and
	// reference no.
	changesignal.RegisterView("books_undeposited_items", "books_journal_lines", "books_journal_entries", "books_accounts",
		"books_deposit_items", "books_payments", "books_sales_receipts", "books_vendor_refunds", "books_refund_receipts")
	for _, s := range reportSources() {
		reports.RegisterSource(s)
	}
	reports.RegisterShipped(trialBalanceShipped())
	reports.RegisterShipped(generalLedgerShipped())
	reports.RegisterShipped(balanceSheetShipped())
	reports.RegisterShipped(journalShipped())
	reports.RegisterShipped(profitAndLossShipped())
	reports.RegisterShipped(profitAndLossByMonthShipped())
	reports.RegisterShipped(transactionDetailShipped())
	reports.RegisterShipped(salesTaxLiabilityShipped())
	reports.RegisterShipped(customerBalanceShipped())
	reports.RegisterShipped(arAgingShipped())
	reports.RegisterShipped(apAgingShipped())
	reports.RegisterShipped(vendorBalanceShipped())
	reports.RegisterShipped(expensesByVendorShipped())
	reports.RegisterShipped(salesByCustomerShipped())
	reports.RegisterShipped(salesByProductShipped())
	reports.RegisterShipped(auditLogShipped())
	reports.RegisterShipped(statementBalanceForwardShipped())
	reports.RegisterShipped(statementOpenItemsShipped())
	reports.RegisterShipped(reconciliationReportShipped())
	registerReportShares(app)
	registerAudit(app)
	oauth.RegisterPackage(oauthPackage())
	registerSearchIndex(app)
	search.RegisterSources(searchSource())
	quota.RegisterSources(quotaSources()...)
	registerOffboard()
	registerAutoReverseSweep(app)
	registerStatementGuards(app)
	registerReconcile(app)
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		bindBalanceRoutes(e)
		bindPDFRoutes(e)
		bindStatementRoutes(e)
		bindDocumentSendRoutes(e)
		return e.Next()
	})
}
