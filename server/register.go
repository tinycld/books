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
	registerSalesDocGuards(app, billKind)
	registerEstimateResponses(app)
	// Declare the public view's source tables so CheckViews and the change
	// signals for signed-in clients know them. The signed-out customer page
	// gets no signal; it re-reads on foreground, network back or reload.
	changesignal.RegisterView("books_estimate_public", "books_estimates", "books_customers", "books_settings")
	for _, s := range reportSources() {
		reports.RegisterSource(s)
	}
	reports.RegisterShipped(trialBalanceShipped())
	reports.RegisterShipped(generalLedgerShipped())
	reports.RegisterShipped(balanceSheetShipped())
	reports.RegisterShipped(journalShipped())
	reports.RegisterShipped(profitAndLossShipped())
	reports.RegisterShipped(profitAndLossByMonthShipped())
	registerReportShares(app)
	registerAudit(app)
	oauth.RegisterPackage(oauthPackage())
	registerSearchIndex(app)
	search.RegisterSources(searchSource())
	quota.RegisterSources(quotaSources()...)
	registerOffboard()
	registerAutoReverseSweep(app)
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		bindBalanceRoutes(e)
		bindPDFRoutes(e)
		return e.Next()
	})
}
