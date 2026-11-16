import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useBillPaymentReadActions } from '../../hooks/useBillPaymentReadActions'
import { useHistoryItem } from '../../hooks/useHistoryItem'
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
 * More ends with Audit history for every Books reader (audit-log spec §3 "Entry points").
 */
export function BillPaymentReadActions({
    payment,
    canWrite,
    scopeOwner,
}: BillPaymentReadActionsProps) {
    const { offered, target } = useBillPaymentReadActions(payment, canWrite)
    const historyItem = useHistoryItem(target.collection, payment.id)
    return (
        <PaymentReadActions
            payment={payment}
            offered={offered}
            historyItem={historyItem}
            scopeOwner={scopeOwner}
            {...target}
        />
    )
}
