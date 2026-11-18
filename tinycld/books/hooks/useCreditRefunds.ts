import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * The posted vendor refunds of a vendor credit (vendor refund spec §3.9): one live query on
 * `books_vendor_refund_lines` where `vendor_credit` is the credit, with the refund's number,
 * date and status through `materialize()`. A line whose refund is not posted (a draft, a
 * void) or whose refund row is missing is dropped after the query (the useMailboxes
 * pattern). Each refund is `{ id, refundId, number, date, amount }` (`id` the line's, the
 * date the refund's day); `refunded` is their sum in cents. With no id the query is off and
 * ready with no rows. A failed read hands its `recovery` to the section's one Retry.
 */
export function useCreditRefunds(creditId: string) {
    const [linesCollection, refundsCollection] = useStore(
        'books_vendor_refund_lines',
        'books_vendor_refunds'
    )
    const isEnabled = creditId !== ''
    const query = useLiveQuery({
        query: q => {
            if (!isEnabled) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.vendor_credit, creditId))
                .orderBy(({ line }) => line.created)
                .select(({ line }) => ({
                    id: line.id,
                    amount: line.amount,
                    refundId: line.refund,
                    refundRow: materialize(
                        q
                            .from({ r: refundsCollection })
                            .where(({ r }) => eq(r.id, line.refund))
                            .select(({ r }) => ({
                                number: r.number,
                                date: r.date,
                                status: r.status,
                            }))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.creditRefunds', creditId],
    })
    const data = isEnabled ? query.data : undefined
    const refunds = useMemo(
        () =>
            (data ?? []).flatMap(({ refundRow, ...line }) => {
                if (refundRow?.status !== 'posted') return []
                return [
                    {
                        id: line.id,
                        refundId: line.refundId,
                        number: refundRow.number,
                        date: refundRow.date.slice(0, 10),
                        amount: line.amount,
                    },
                ]
            }),
        [data]
    )
    const refunded = refunds.reduce((sum, refund) => sum + refund.amount, 0)
    const isError = isEnabled && query.isError
    const recovery: LiveRecovery =
        isError && query.collection
            ? { queries: [query.collection], sources: [linesCollection, refundsCollection] }
            : NO_RECOVERY
    return {
        refunds,
        refunded,
        isReady: !isEnabled || query.isReady,
        isError,
        recovery,
    }
}

export type CreditRefunds = ReturnType<typeof useCreditRefunds>

export type CreditRefundRow = CreditRefunds['refunds'][number]
