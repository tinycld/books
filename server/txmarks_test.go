package books

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// A mark says that Books itself writes a document's rows in this transaction.
// A write of another request runs in another transaction, or in none before
// its own begins, and must not read it.
func TestSalesDocMarks_BelongToOneTransaction(t *testing.T) {
	ie := newInvoiceEnv(t)
	const doc = "docmarktest0001"
	err := ie.app.RunInTransaction(func(tx core.App) error {
		marks := map[string]struct {
			set  func() func()
			read func(app core.App) bool
		}{
			"restating": {
				set:  func() func() { return markRestating(tx, invoiceKind, doc) },
				read: func(app core.App) bool { return isRestating(app, invoiceKind, doc) },
			},
			"deleting": {
				set:  func() func() { return markDeleting(tx, invoiceKind, doc) },
				read: func(app core.App) bool { return isDeleting(app, invoiceKind, doc) },
			},
			"replacing": {
				set:  func() func() { return markReplacing(tx, invoiceKind, doc) },
				read: func(app core.App) bool { return isReplacing(app, invoiceKind, doc) },
			},
			"converting": {
				set:  func() func() { return markConverting(tx, doc) },
				read: func(app core.App) bool { return isConverting(app, doc) },
			},
		}
		for name, mark := range marks {
			done := mark.set()
			if !mark.read(tx) {
				t.Errorf("%s: the transaction that set the mark does not read it", name)
			}
			if mark.read(ie.app) {
				t.Errorf("%s: a caller outside the transaction reads the mark", name)
			}
			done()
			if mark.read(tx) {
				t.Errorf("%s: the mark is still set after its clear", name)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// Two kinds can hold a document of the same id; a mark of one is not the other's.
func TestSalesDocMarks_AreByKind(t *testing.T) {
	ie := newInvoiceEnv(t)
	err := ie.app.RunInTransaction(func(tx core.App) error {
		done := markRestating(tx, invoiceKind, "sameid000000001")
		defer done()
		if isRestating(tx, salesReceiptKind, "sameid000000001") {
			t.Error("a sales receipt reads the invoice's mark")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
