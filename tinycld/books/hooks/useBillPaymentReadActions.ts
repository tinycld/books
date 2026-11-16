import type { PaymentReadTarget } from '../components/payments/PaymentReadActions'
import { billPaymentReadActions } from '../lib/bill-payment-read-actions'
import { PAY_BILLS_MESSAGES } from '../lib/pay-bills-texts'
import type { BooksBillPayments } from '../types'

/**
 * The bill payment read view's actions (pay-bills spec §3.8): the offered ones
 * (`billPaymentReadActions`: Edit, Void and View journal entry for a writer on a posted
 * payment, else View journal entry), and the bill payment routes and texts the shared
 * PaymentReadActions bar uses: Edit opens Pay Bills on `?replaces`, Void writes
 * `status: 'void'` to books_bill_payments with the bill payment's dialog text. View
 * journal entry (and its J) waits for the entry: a correction landed from the batch answer
 * has no entry id until the collection reloads (spec §3.1: a hidden button's key does
 * nothing).
 */
export function useBillPaymentReadActions(
    payment: Pick<BooksBillPayments, 'id' | 'status' | 'entry'>,
    canWrite: boolean
) {
    const hasEntry = payment.entry !== ''
    const offered = billPaymentReadActions(payment.status, canWrite).filter(
        action => action !== 'entry' || hasEntry
    )
    const target: PaymentReadTarget = {
        collection: 'books_bill_payments',
        editHref: `books/pay-bills?replaces=${payment.id}`,
        voidBody: PAY_BILLS_MESSAGES.voidBody,
        confirmLabel: PAY_BILLS_MESSAGES.voidConfirm,
        entryNoun: 'bill payment',
    }
    return { offered, target }
}
