import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { LiveRecovery } from '../lib/live-recovery'
import { NO_RECOVERY } from './document-data'

/**
 * The refund receipts that name a sales receipt or a credit memo in `field` (refund receipt
 * spec §3.11, §3.12), oldest first: one live query of `books_refund_receipts` where the field
 * is the id and `replaced_by` is empty, so a corrected refund shows once, as its correction.
 * `refunded` is the sum of the posted rows' totals in cents. With no id the query is off and
 * ready with no rows. A failed read hands its `recovery` to the read view's one Retry.
 */
export function useLinkedRefundReceipts(field: 'sales_receipt' | 'credit_memo', id: string) {
    const [refundsCollection] = useStore('books_refund_receipts')
    const isEnabled = id !== ''
    const query = useLiveQuery({
        query: q => {
            if (!isEnabled) return undefined
            return q
                .from({ r: refundsCollection })
                .where(({ r }) =>
                    and(
                        field === 'sales_receipt' ? eq(r.sales_receipt, id) : eq(r.credit_memo, id),
                        eq(r.replaced_by, '')
                    )
                )
                .orderBy(({ r }) => r.date)
                .select(({ r }) => ({
                    id: r.id,
                    number: r.number,
                    date: r.date,
                    total: r.total,
                    status: r.status,
                    currency: r.currency,
                }))
        },
        queryKey: ['books.linkedRefundReceipts', field, id],
    })
    const rows = (isEnabled ? query.data : undefined) ?? []
    const refunded = rows
        .filter(row => row.status === 'posted')
        .reduce((sum, row) => sum + row.total, 0)
    const isError = isEnabled && query.isError
    const recovery: LiveRecovery =
        isError && query.collection
            ? { queries: [query.collection], sources: [refundsCollection] }
            : NO_RECOVERY
    return { rows, refunded, isReady: !isEnabled || query.isReady, isError, recovery }
}

export type LinkedRefundReceipts = ReturnType<typeof useLinkedRefundReceipts>
