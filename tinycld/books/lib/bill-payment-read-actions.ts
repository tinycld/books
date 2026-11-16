// The bill payment read view's actions (pay-bills spec §3.8): a writer on a posted payment
// may Edit, Void and View journal entry; a writer on a void payment and every reader only
// View journal entry. There is no draft bill payment, so every stored payment has its entry.

import type { BooksBillPayments } from '../types'
import type { PaymentReadAction } from './payment-read-actions'

export type BillPaymentReadAction = PaymentReadAction

export function billPaymentReadActions(
    status: BooksBillPayments['status'],
    canWrite: boolean
): BillPaymentReadAction[] {
    return status === 'posted' && canWrite ? ['edit', 'void', 'entry'] : ['entry']
}
