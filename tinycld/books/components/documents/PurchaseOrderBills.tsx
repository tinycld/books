import { usePurchaseOrderBills } from '../../hooks/usePurchaseOrderBills'
import { PURCHASE_ORDER_MESSAGES } from '../../lib/document-texts'
import { BILL_KIND } from '../../lib/sales-document-kinds'
import type { DocumentReadSectionProps } from './document-kinds'
import { type LinkedDocumentsIds, LinkedDocumentsSection } from './LinkedDocumentsSection'

const IDS: LinkedDocumentsIds = {
    section: 'purchase-order-bills',
    table: 'purchase-order-bills-table',
    cards: 'purchase-order-bills-cards',
    error: 'purchase-order-bills-error',
    retry: 'purchase-order-bills-retry',
    row: id => `purchase-order-bill-${id}`,
    link: id => `purchase-order-bill-link-${id}`,
}

/**
 * The purchase order read view's "Bills" section (spec §3.6, the kind's ReadSection): the
 * bills that name the order and are not void and not replaced, each with "Draft bill" or "Bill <n>" (a
 * link to the bill), its date, the amount of its lines from this order and its status
 * (orderBillsSummary, LinkedDocumentsSection). Not drawn while the read loads or when no
 * bill is listed; a failed read shows its own error row with Retry, and the rest of the
 * read view still shows.
 */
export function PurchaseOrderBills({ record }: DocumentReadSectionProps) {
    const bills = usePurchaseOrderBills(record.id)
    const rows = bills.isReady ? bills.rows : []
    const error = {
        isError: bills.isError,
        message: PURCHASE_ORDER_MESSAGES.billsLoadFailed,
        onRetry: bills.retry,
    }
    return (
        <LinkedDocumentsSection
            ids={IDS}
            title="Bills"
            rows={rows}
            kind={BILL_KIND}
            currency={record.currency}
            error={error}
        />
    )
}
