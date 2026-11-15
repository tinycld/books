// The read view's actions (spec §3.7): a writer on a posted payment may Edit, Void and
// View journal entry; a writer on a void payment and every reader only View journal
// entry. A draft opens in the form, so it has no read action.

import type { BooksPayments } from '../types'

export type PaymentReadAction = 'edit' | 'void' | 'entry'

export function paymentReadActions(
    status: BooksPayments['status'],
    canWrite: boolean
): PaymentReadAction[] {
    if (status === 'draft') return []
    if (status === 'posted' && canWrite) return ['edit', 'void', 'entry']
    return ['entry']
}
