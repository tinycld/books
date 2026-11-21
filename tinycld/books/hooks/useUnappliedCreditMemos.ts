import { and, eq, gt } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useMemo } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * A customer's credit memos with unapplied credit (apply credit spec §3.3, §4.4 Reads): one
 * live query on `books_credit_memos` for the customer, posted, with a `balance` above zero,
 * by date, then sequence (the index (customer, status, balance) serves it). The apply
 * dialog from an invoice lists them; the invoice's read view and Receive payment read them
 * for their notices. With `''` the query is off and ready with no rows. A failed read
 * hands its `recovery` to the screen's one Retry.
 */
export function useUnappliedCreditMemos(customerId: string) {
    const [memosCollection] = useStore('books_credit_memos')
    const isEnabled = customerId !== ''
    const query = useLiveQuery({
        query: q => {
            if (!isEnabled) return undefined
            return q
                .from({ m: memosCollection })
                .where(({ m }) =>
                    and(eq(m.customer, customerId), eq(m.status, 'posted'), gt(m.balance, 0))
                )
                .orderBy(({ m }) => m.date)
                .orderBy(({ m }) => m.sequence)
                .select(({ m }) => ({
                    id: m.id,
                    number: m.number,
                    date: m.date,
                    balance: m.balance,
                    total: m.total,
                    invoice: m.invoice,
                    currency: m.currency,
                }))
        },
        queryKey: ['books.unappliedCreditMemos', customerId],
    })
    const data = isEnabled ? query.data : undefined
    const credits = useMemo(
        () => (data ?? []).map(memo => ({ ...memo, date: memo.date.slice(0, 10) })),
        [data]
    )
    const isError = isEnabled && query.isError
    const recovery: LiveRecovery =
        isError && query.collection
            ? { queries: [query.collection], sources: [memosCollection] }
            : NO_RECOVERY
    return {
        credits,
        isReady: !isEnabled || query.isReady,
        isError,
        recovery,
    }
}

// One credit memo of the list, as the query's `select` gives it.
export type UnappliedCreditMemo = ReturnType<typeof useUnappliedCreditMemos>['credits'][number]
