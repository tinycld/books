import { useHistoryItem } from '../../hooks/useHistoryItem'
import { useVendorRefundReadActions } from '../../hooks/useVendorRefundReadActions'
import { PaymentReadActions, type PaymentReadBarProps } from '../payments/PaymentReadActions'

/**
 * The vendor refund read view's bar (vendor refund spec §3.7, §3.2): the shared
 * PaymentReadActions with the refund's actions, routes and Void text. A writer on a posted
 * refund gets Edit E, Void V and View journal entry J; a writer on a void refund and a
 * reader View journal entry only; a hidden action's key is not registered. More ends with
 * Audit history for every Books reader, as on the bill payment.
 */
export function VendorRefundReadActions({ payment, canWrite, scopeOwner }: PaymentReadBarProps) {
    const { offered, target } = useVendorRefundReadActions(payment, canWrite)
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
