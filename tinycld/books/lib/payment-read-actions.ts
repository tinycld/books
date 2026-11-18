// The read view's actions (spec §3.7): a writer on a posted payment may Edit, Void and
// View journal entry; a writer on a void payment and every reader only View journal
// entry. A draft opens in the form, so it has no read action. View journal entry needs
// the entry the post wrote.

import type { BooksPayments } from '../types'

export type PaymentReadAction = 'edit' | 'void' | 'entry'

export function paymentReadActions(
    status: BooksPayments['status'],
    canWrite: boolean,
    hasEntry = true
): PaymentReadAction[] {
    if (status === 'draft') return []
    const actions: PaymentReadAction[] =
        status === 'posted' && canWrite ? ['edit', 'void', 'entry'] : ['entry']
    return hasEntry ? actions : actions.filter(action => action !== 'entry')
}

// The payment collections a read view voids: a customer payment, a bill payment or a
// vendor refund.
export type PaymentCollectionName =
    | 'books_payments'
    | 'books_bill_payments'
    | 'books_vendor_refunds'

// The collection Void writes `status: 'void'` to, for a read view of each collection: its
// own, so a void never lands on another payment collection (vendor refund spec §3.7).
const VOID_WRITE_COLLECTION: Record<PaymentCollectionName, PaymentCollectionName> = {
    books_payments: 'books_payments',
    books_bill_payments: 'books_bill_payments',
    books_vendor_refunds: 'books_vendor_refunds',
}

export function voidWriteCollection(collection: PaymentCollectionName): PaymentCollectionName {
    return VOID_WRITE_COLLECTION[collection]
}
