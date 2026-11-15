package books

import (
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// newSalesTaxEnv is one book that holds posted invoices and posted sales
// receipts together, for the sales tax tests that read both kinds: the
// ledger hooks, the guards of both document kinds, both forms hosts in one
// bind (core keeps one set of bound hosts per app), then the receipt env's
// accounts (1000/1010/1100/1200/3900/4000/4100), Harborview Dental, the
// products and the Denver combined group over three agencies. Invoices are
// made on it with newInvoice(app, env.customer, …) + mkInvoiceLine, receipts
// with env.mkReceipt + mkReceiptLine.
func newSalesTaxEnv(t *testing.T) *receiptEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, invoiceKind)
	registerSalesDocGuards(app, salesReceiptKind)
	bindSalesDocHosts(t, app)
	return receiptEnvOn(t, app)
}

// docTaxLinesOf reads the tax lines of one document of kind, in position
// order.
func docTaxLinesOf(t testing.TB, app core.App, kind salesDocKind, docID string) []*core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter(kind.TaxLinesCollection, kind.ParentField+" = {:id}", "position", 0, 0, dbx.Params{"id": docID})
	if err != nil {
		t.Fatalf("read the tax lines of %s %s: %v", kind.Collection, docID, err)
	}
	return rows
}
