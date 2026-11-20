import { and, eq, gt } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// The notice names at most this many payments; the rest are a count (apply credit spec §3.1).
const NAMED_PAYMENTS = 3

/**
 * A customer's posted payments with an amount that is not applied to an invoice (apply
 * credit spec §3.1, Q2): one live query on `books_payments` for the customer, posted, with
 * `credited` above zero, by date, then sequence, with no limit (a customer has few such
 * payments). `payments` is the oldest three, `moreCount` the number of the rest. With `''`
 * the query is off and ready with no rows. A failed read hands its `recovery` on.
 */
export function useUnappliedPayments(customerId: string) {
    const [paymentsCollection] = useStore('books_payments')
    const isEnabled = customerId !== ''
    const query = useLiveQuery({
        query: q => {
            if (!isEnabled) return undefined
            return q
                .from({ p: paymentsCollection })
                .where(({ p }) =>
                    and(eq(p.customer, customerId), eq(p.status, 'posted'), gt(p.credited, 0))
                )
                .orderBy(({ p }) => p.date)
                .orderBy(({ p }) => p.sequence)
                .select(({ p }) => ({
                    id: p.id,
                    number: p.number,
                    credited: p.credited,
                    currency: p.currency,
                }))
        },
        queryKey: ['books.unappliedPayments', customerId],
    })
    const rows = (isEnabled ? query.data : undefined) ?? []
    const isError = isEnabled && query.isError
    const recovery: LiveRecovery =
        isError && query.collection
            ? { queries: [query.collection], sources: [paymentsCollection] }
            : NO_RECOVERY
    return {
        payments: rows.slice(0, NAMED_PAYMENTS),
        moreCount: Math.max(0, rows.length - NAMED_PAYMENTS),
        isReady: !isEnabled || query.isReady,
        isError,
        recovery,
    }
}

// One named payment, as the query's `select` gives it.
export type UnappliedPayment = ReturnType<typeof useUnappliedPayments>['payments'][number]
