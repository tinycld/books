package books

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// refreshReceivableEntry stores the Accounts receivable lines of one entry.
func refreshReceivableEntry(tx core.App, entryID string) error {
	return receivableItems.refresh(tx, "entry = {:entry} AND source = '"+receivableSourceLine+"'", dbx.Params{"entry": entryID},
		itemPart{receivableLinesSQL, " AND l.entry = {:entry}"})
}

// refreshReceivablePayment stores the rows of one payment: the line of its
// own entry (its credit is the payment's credited while the payment is
// posted) and its applications (none unless it is posted). A payment with no
// entry was never posted and has no row.
func refreshReceivablePayment(tx core.App, payment *core.Record) error {
	entryID := payment.GetString("entry")
	if entryID == "" {
		return nil
	}
	return receivableItems.refresh(tx, "entry = {:entry}", dbx.Params{"entry": entryID, "payment": payment.Id},
		itemPart{receivableLinesSQL, " AND l.entry = {:entry}"},
		itemPart{receivableApplicationsSQL, " AND pa.payment = {:payment}"})
}

// refreshReceivableCreditMemo stores the rows of one credit memo: the line of
// its entry (its full credit at its date) and both rows of each of its
// applications (none unless it is posted), which carry the memo's entry. A
// memo with no entry was never posted and has no row.
func refreshReceivableCreditMemo(tx core.App, memo *core.Record) error {
	entryID := memo.GetString("entry")
	if entryID == "" {
		return nil
	}
	return receivableItems.refresh(tx, "entry = {:entry}", dbx.Params{"entry": entryID},
		itemPart{receivableLinesSQL, " AND l.entry = {:entry}"},
		itemPart{receivableCreditApplicationsSQL, " AND ca.entry = {:entry}"})
}

// refreshReceivableInvoice stores the rows that read one invoice: the line of
// its entry (its due day) and the payments' and credit memos' applications
// that pay it (its number and due day; an invoice correction moves the
// applications of the original to it before it has its entry).
func refreshReceivableInvoice(tx core.App, invoice *core.Record) error {
	if entryID := invoice.GetString("entry"); entryID != "" {
		if err := refreshReceivableEntry(tx, entryID); err != nil {
			return err
		}
	}
	return receivableItems.refresh(tx, "item = {:invoice} AND source = '"+receivableSourceApplication+"'", dbx.Params{"invoice": invoice.Id},
		itemPart{receivableApplicationsSQL, " AND pa.invoice = {:invoice}"},
		itemPart{receivableCreditApplicationsSQL, " AND ca.item = {:invoice}"})
}

// bindReceivableEntryRefresh keeps the rows of an entry's lines: a post
// stamps the lines and numbers the entry (manual entries, documents,
// reversals, void reversals, auto-reverse, opening balances all post through
// this update). A draft has no row.
func bindReceivableEntryRefresh(app core.App) {
	bindItemRefresh(app, "books_journal_entries", func(tx core.App, r *core.Record) error {
		if r.GetString("status") == statusDraft {
			return nil
		}
		return refreshReceivableEntry(tx, r.Id)
	})
}

// bindReceivablePaymentRefresh keeps a payment's rows through its post, its
// void and its replacement by a correction (each an update of the payment),
// and through an invoice correction, which moves its applications to the
// correction (an update of the application).
func bindReceivablePaymentRefresh(app core.App) {
	bindItemRefresh(app, paymentsCollection, refreshReceivablePayment)
	bindItemRefresh(app, "books_payment_applications", func(tx core.App, r *core.Record) error {
		payment, err := tx.FindRecordById(paymentsCollection, r.GetString("payment"))
		if err != nil {
			return err
		}
		return refreshReceivablePayment(tx, payment)
	})
}

// bindReceivableInvoiceRefresh keeps the rows that read an invoice through
// its post: the entry is posted before the invoice row holds its due day and
// its entry.
func bindReceivableInvoiceRefresh(app core.App) {
	bindItemRefresh(app, invoiceKind.Collection, func(tx core.App, r *core.Record) error {
		if r.GetString("status") == statusDraft {
			return nil
		}
		return refreshReceivableInvoice(tx, r)
	})
}

// bindReceivableCreditMemoRefresh keeps a credit memo's rows through its post
// and its replacement by a correction (each an update of the memo). It is
// called from registerSalesDocGuards, after the memo's serialized guard. A
// draft has no row.
func bindReceivableCreditMemoRefresh(app core.App) {
	bindItemRefresh(app, creditMemoKind.Collection, func(tx core.App, r *core.Record) error {
		if r.GetString("status") == statusDraft {
			return nil
		}
		return refreshReceivableCreditMemo(tx, r)
	})
}

// bindReceivableCreditMemoApplicationRefresh keeps the rows of the memo an
// application names after the application's update (a credit memo
// correction moves its applications to the correction). It is called from
// registerCreditMemoApplications, after the applications' serialized guard.
// The create and the delete refresh through the kind's AfterChange.
func bindReceivableCreditMemoApplicationRefresh(app core.App) {
	bindItemRefresh(app, creditMemoApplicationsCollection, func(tx core.App, r *core.Record) error {
		memo, err := tx.FindRecordById(creditMemoKind.Collection, r.GetString("credit_memo"))
		if err != nil {
			return err
		}
		return refreshReceivableCreditMemo(tx, memo)
	})
}

// msgReceivableItemsReadOnly refuses a REST write of a stored receivable row.
const msgReceivableItemsReadOnly = "Books writes the receivable items itself. They cannot be changed."
