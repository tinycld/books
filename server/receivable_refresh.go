package books

import (
	"errors"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/changesignal"
)

// receivablePart is one of the three queries narrowed to the rows a refresh
// writes again.
type receivablePart struct{ query, where string }

// refreshReceivables replaces the stored rows that match stale (a condition on
// books_receivable_items) with the rows parts give, then settles every
// customer and item that lost or gained a row. stale must match every row parts can
// give, so no row is stored twice. It must run in the transaction of the
// write that changed the rows: a refresh outside one could commit without
// that write.
func refreshReceivables(tx core.App, stale string, params dbx.Params, parts ...receivablePart) error {
	if !tx.IsTransactional() {
		return errors.New("books: receivable rows are refreshed only inside the transaction of the write")
	}
	touched := map[receivablePair]bool{}
	collect := func() error {
		var pairs []receivablePair
		err := tx.DB().NewQuery("SELECT DISTINCT customer, item FROM " + receivableItemsCollection + " WHERE " + stale).Bind(params).All(&pairs)
		if err != nil {
			return fmt.Errorf("books: read the items of receivable rows: %w", err)
		}
		for _, p := range pairs {
			touched[p] = true
		}
		return nil
	}
	if err := collect(); err != nil {
		return err
	}
	res, err := tx.DB().NewQuery("DELETE FROM " + receivableItemsCollection + " WHERE " + stale).Bind(params).Execute()
	if err != nil {
		return fmt.Errorf("books: clear stale receivable rows: %w", err)
	}
	changed, err := res.RowsAffected()
	if err != nil {
		return err
	}
	for _, part := range parts {
		n, err := insertReceivables(tx, part.query, part.where, params)
		if err != nil {
			return err
		}
		changed += n
	}
	if changed == 0 {
		return nil
	}
	if err := collect(); err != nil {
		return err
	}
	pairs := make([]receivablePair, 0, len(touched))
	for p := range touched {
		pairs = append(pairs, p)
	}
	if _, err := settleReceivables(tx, pairs); err != nil {
		return err
	}
	changesignal.Touch(tx, receivableItemsCollection)
	return nil
}

// refreshReceivableEntry stores the Accounts receivable lines of one entry.
func refreshReceivableEntry(tx core.App, entryID string) error {
	return refreshReceivables(tx, "entry = {:entry} AND source = '"+receivableSourceLine+"'", dbx.Params{"entry": entryID},
		receivablePart{receivableLinesSQL, " AND l.entry = {:entry}"})
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
	return refreshReceivables(tx, "entry = {:entry}", dbx.Params{"entry": entryID, "payment": payment.Id},
		receivablePart{receivableLinesSQL, " AND l.entry = {:entry}"},
		receivablePart{receivableApplicationsSQL, " AND pa.payment = {:payment}"})
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
	return refreshReceivables(tx, "entry = {:entry}", dbx.Params{"entry": entryID},
		receivablePart{receivableLinesSQL, " AND l.entry = {:entry}"},
		receivablePart{receivableCreditApplicationsSQL, " AND ca.entry = {:entry}"})
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
	return refreshReceivables(tx, "item = {:invoice} AND source = '"+receivableSourceApplication+"'", dbx.Params{"invoice": invoice.Id},
		receivablePart{receivableApplicationsSQL, " AND pa.invoice = {:invoice}"},
		receivablePart{receivableCreditApplicationsSQL, " AND ca.item = {:invoice}"})
}

// bindReceivableRefresh binds refresh after each update of collection. Bind it
// after the collection's serialized guard: e.App is then the guard's
// transaction and the record is written.
func bindReceivableRefresh(app core.App, collection string, refresh func(tx core.App, r *core.Record) error) {
	app.OnRecordUpdate(collection).BindFunc(func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		return refresh(e.App, e.Record)
	})
}

// bindReceivableEntryRefresh keeps the rows of an entry's lines: a post
// stamps the lines and numbers the entry (manual entries, documents,
// reversals, void reversals, auto-reverse, opening balances all post through
// this update). A draft has no row.
func bindReceivableEntryRefresh(app core.App) {
	bindReceivableRefresh(app, "books_journal_entries", func(tx core.App, r *core.Record) error {
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
	bindReceivableRefresh(app, paymentsCollection, refreshReceivablePayment)
	bindReceivableRefresh(app, "books_payment_applications", func(tx core.App, r *core.Record) error {
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
	bindReceivableRefresh(app, invoiceKind.Collection, func(tx core.App, r *core.Record) error {
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
	bindReceivableRefresh(app, creditMemoKind.Collection, func(tx core.App, r *core.Record) error {
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
	bindReceivableRefresh(app, creditMemoApplicationsCollection, func(tx core.App, r *core.Record) error {
		memo, err := tx.FindRecordById(creditMemoKind.Collection, r.GetString("credit_memo"))
		if err != nil {
			return err
		}
		return refreshReceivableCreditMemo(tx, memo)
	})
}

// msgReceivableItemsReadOnly refuses a REST write of a stored receivable row.
const msgReceivableItemsReadOnly = "Books writes the receivable items itself. They cannot be changed."

// registerReceivableWriteGuard refuses every REST write of the stored rows,
// a superuser's too: the collection's rules stop everyone else, and a row a
// person wrote would disagree with the book until the next rebuild.
func registerReceivableWriteGuard(app core.App) {
	refuseWrite := func(e *core.RecordRequestEvent) error { return refuse(msgReceivableItemsReadOnly) }
	app.OnRecordCreateRequest(receivableItemsCollection).BindFunc(refuseWrite)
	app.OnRecordUpdateRequest(receivableItemsCollection).BindFunc(refuseWrite)
	app.OnRecordDeleteRequest(receivableItemsCollection).BindFunc(refuseWrite)
}

// repairReceivables rebuilds the stored rows when they disagree with the book.
func repairReceivables(tx core.App) error {
	drifts, err := verifyReceivables(tx)
	if err != nil || len(drifts) == 0 {
		return err
	}
	return rebuildReceivables(tx)
}
