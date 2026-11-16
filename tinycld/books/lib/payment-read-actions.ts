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
