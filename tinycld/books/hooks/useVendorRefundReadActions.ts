import type { PaymentReadTarget } from '../components/payments/PaymentReadActions'
import { paymentReadActions } from '../lib/payment-read-actions'
import { VENDOR_REFUND_FLOW } from '../lib/vendor-refund-flow'
import type { BooksVendorRefunds } from '../types'

const FLOW = VENDOR_REFUND_FLOW

/**
 * The vendor refund read view's actions (vendor refund spec §3.7): the offered ones
 * (Edit, Void and View journal entry for a writer on a posted refund, else View journal
 * entry; View journal entry waits for the entry), and the refund's routes and texts the
 * shared PaymentReadActions bar uses: Edit opens the correction form on `?replaces`, Void
 * writes `status: 'void'` to books_vendor_refunds with the refund's dialog text.
 */
export function useVendorRefundReadActions(
    refund: Pick<BooksVendorRefunds, 'id' | 'status' | 'entry'>,
    canWrite: boolean
) {
    const offered = paymentReadActions(refund.status, canWrite, refund.entry !== '')
    const target: PaymentReadTarget = {
        collection: 'books_vendor_refunds',
        editHref: `${FLOW.routeBase}/new?replaces=${refund.id}`,
        voidBody: FLOW.texts.voidBody,
        confirmLabel: FLOW.texts.voidConfirm,
        entryNoun: FLOW.texts.voidNoun,
    }
    return { offered, target }
}
