import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useBillPaymentReadActions } from '../../hooks/useBillPaymentReadActions'
import type { BooksBillPayments } from '../../types'
import { PaymentReadActions } from '../payments/PaymentReadActions'

interface BillPaymentReadActionsProps {
    payment: Pick<BooksBillPayments, 'id' | 'status' | 'number' | 'entry'>
    canWrite: boolean
    scopeOwner: ScopeOwner
}

/**
 * The bill payment read view's bar (spec §3.8): receive-payment's PaymentReadActions with
 * the bill payment's actions, routes and Void text. Wide, Edit E, Void V and View journal
 * entry J; phone, Edit beside More. Every key is in the ⇧? group "Pay bills" (the chrome).
 */
export function BillPaymentReadActions({
    payment,
    canWrite,
    scopeOwner,
}: BillPaymentReadActionsProps) {
    const { offered, target } = useBillPaymentReadActions(payment, canWrite)
    return (
        <PaymentReadActions
            payment={payment}
            offered={offered}
            scopeOwner={scopeOwner}
            {...target}
        />
    )
}
