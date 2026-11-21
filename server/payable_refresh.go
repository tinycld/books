package books

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// refreshPayableEntry stores the Accounts payable lines of one entry (A/P
// Aging spec §4.2, hook point 1).
func refreshPayableEntry(tx core.App, entryID string) error {
	return payableItems.refresh(tx, "entry = {:entry} AND source = '"+payableSourceLine+"'", dbx.Params{"entry": entryID},
		itemPart{payableLinesSQL, " AND l.entry = {:entry}"})
}

// refreshPayableBill stores the rows that read one bill: the line of its entry
// (its due day), the bill payment lines that pay it and both rows of each
// vendor credit application that names it (its number and due day; a bill
// correction moves the payment lines and the applications of the original to
// it). The application's credit row carries the bill's entry, so it is found
// by that entry; a bill with no entry has none.
func refreshPayableBill(tx core.App, bill *core.Record) error {
	entryID := bill.GetString("entry")
	stale := "(item = {:bill} AND source IN ('" + payableSourcePaymentLine + "', '" + payableSourceApplicationBill + "'))"
	if entryID != "" {
		if err := refreshPayableEntry(tx, entryID); err != nil {
			return err
		}
		stale += " OR (source = '" + payableSourceApplicationCredit + "' AND entry = {:entry})"
	}
	return payableItems.refresh(tx, stale, dbx.Params{"bill": bill.Id, "entry": entryID},
		itemPart{payablePaymentLinesSQL, " AND bpl.bill = {:bill}"},
		itemPart{payableApplicationsSQL, " AND pa.bill = {:bill}"})
}

// refreshPayablePayment stores the lines of one bill payment (none unless it
// is posted). A payment with no entry was never posted and has no row.
func refreshPayablePayment(tx core.App, payment *core.Record) error {
	entryID := payment.GetString("entry")
	if entryID == "" {
		return nil
	}
	return payableItems.refresh(tx, "entry = {:entry} AND source = '"+payableSourcePaymentLine+"'",
		dbx.Params{"entry": entryID, "payment": payment.Id},
		itemPart{payablePaymentLinesSQL, " AND bpl.payment = {:payment}"})
}

// refreshPayableVendorCredit stores the rows of one vendor credit: the line of
// its entry, both rows of each of its applications (none unless it is
// posted; the bill row carries the credit's entry, the credit row names the
// credit as its item) and the vendor refund lines that refund it. A credit
// with no entry was never posted and has no row. It is also the AfterChange of
// vendorCreditApplicationKind: an application's create and delete refresh it.
func refreshPayableVendorCredit(tx core.App, credit *core.Record) error {
	entryID := credit.GetString("entry")
	if entryID == "" {
		return nil
	}
	stale := "(entry = {:entry} AND source IN ('" + payableSourceLine + "', '" + payableSourceApplicationBill + "'))" +
		" OR (item = {:credit} AND source IN ('" + payableSourceApplicationCredit + "', '" + payableSourceRefundLine + "'))"
	return payableItems.refresh(tx, stale, dbx.Params{"entry": entryID, "credit": credit.Id},
		itemPart{payableLinesSQL, " AND l.entry = {:entry}"},
		itemPart{payableApplicationsSQL, " AND pa.vendor_credit = {:credit}"},
		itemPart{payableRefundLinesSQL, " AND rl.vendor_credit = {:credit}"})
}

// refreshPayableRefund stores the lines of one vendor refund (none unless it
// is posted). A refund with no entry was never posted and has no row.
func refreshPayableRefund(tx core.App, refund *core.Record) error {
	entryID := refund.GetString("entry")
	if entryID == "" {
		return nil
	}
	return payableItems.refresh(tx, "entry = {:entry} AND source = '"+payableSourceRefundLine+"'",
		dbx.Params{"entry": entryID, "refund": refund.Id},
		itemPart{payableRefundLinesSQL, " AND rl.refund = {:refund}"})
}

// bindPayableBillRefresh keeps the rows that read a bill through its post, its
// void and its replacement by a correction (each an update of the bill), and
// through a balance change. It is called from registerSalesDocGuards, after
// the bill's serialized guard. A draft has no row.
func bindPayableBillRefresh(app core.App) {
	bindItemRefresh(app, billKind.Collection, func(tx core.App, r *core.Record) error {
		if r.GetString("status") == statusDraft {
			return nil
		}
		return refreshPayableBill(tx, r)
	})
}

// bindPayableVendorCreditRefresh keeps a vendor credit's rows through its post,
// its void and its replacement by a correction (each an update of the credit).
// It is called from registerSalesDocGuards, after the credit's serialized
// guard. A draft has no row.
func bindPayableVendorCreditRefresh(app core.App) {
	bindItemRefresh(app, vendorCreditKind.Collection, func(tx core.App, r *core.Record) error {
		if r.GetString("status") == statusDraft {
			return nil
		}
		return refreshPayableVendorCredit(tx, r)
	})
}

// bindPayablePaymentRefresh keeps a bill payment's rows through its post, its
// void and its replacement by a correction (each an update of the payment),
// and the row of one payment line through a bill correction, which moves the
// line to the correction (an update of the line). It is called at the end of
// registerBillPaymentGuards, after both serialized guards.
func bindPayablePaymentRefresh(app core.App) {
	bindItemRefresh(app, billPaymentsCollection, refreshPayablePayment)
	bindItemRefresh(app, billPaymentLinesCollection, func(tx core.App, r *core.Record) error {
		return payableItems.refresh(tx, "id = {:line}", dbx.Params{"line": r.Id},
			itemPart{payablePaymentLinesSQL, " AND bpl.id = {:line}"})
	})
}

// bindPayableRefundRefresh keeps a vendor refund's rows through its post, its
// void and its replacement by a correction (each an update of the refund),
// and the row of one refund line through a vendor credit correction, which
// moves the line to the correction (an update of the line). It is called at
// the end of registerVendorRefundGuards, after both serialized guards.
func bindPayableRefundRefresh(app core.App) {
	bindItemRefresh(app, vendorRefundsCollection, refreshPayableRefund)
	bindItemRefresh(app, vendorRefundLinesCollection, func(tx core.App, r *core.Record) error {
		return payableItems.refresh(tx, "id = {:line}", dbx.Params{"line": r.Id},
			itemPart{payableRefundLinesSQL, " AND rl.id = {:line}"})
	})
}

// bindPayableApplicationRefresh keeps both rows of a vendor credit
// application through its update (a correction of its credit or its bill
// moves it). It is called from registerVendorCreditApplications, after the
// applications' serialized guard. The create and the delete refresh through
// the kind's AfterChange (refreshPayableVendorCredit).
func bindPayableApplicationRefresh(app core.App) {
	bindItemRefresh(app, vendorCreditApplicationsCollection, func(tx core.App, r *core.Record) error {
		return payableItems.refresh(tx, "id IN ({:application}, {:credit_row})",
			dbx.Params{"application": r.Id, "credit_row": r.Id + "c"},
			itemPart{payableApplicationsSQL, " AND pa.application = {:application}"})
	})
}
