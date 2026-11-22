// The read view's actions (spec §3.7): a writer on a posted payment may Edit, Void and
// View journal entry; a writer on a void payment and every reader only View journal
// entry. A draft opens in the form, so it has no read action. View journal entry needs
// the entry the post wrote. A payment or vendor refund that a posted deposit holds
// (`isDeposited`, bank deposit spec §3.10) offers only View journal entry: it is removed
// from the deposit before it is edited or voided.

import type { BooksPayments } from '../types'

export type PaymentReadAction = 'edit' | 'void' | 'entry'

export function paymentReadActions(
    status: BooksPayments['status'],
    canWrite: boolean,
    hasEntry = true,
    isDeposited = false
): PaymentReadAction[] {
    if (status === 'draft') return []
    const actions: PaymentReadAction[] =
        status === 'posted' && canWrite && !isDeposited ? ['edit', 'void', 'entry'] : ['entry']
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
