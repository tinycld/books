import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * The write-offs that name an invoice (write-off spec §3.4, §4.4), posted and void, by date
 * and then by creation: one live query of `books_write_offs` by `invoice`. With no id the
 * query is off and ready with no rows. A failed read hands its `recovery` to a merged
 * Retry; `retry` recovers it alone.
 */
export function useInvoiceWriteOffs(invoiceId: string) {
    const [writeOffsCollection] = useStore('books_write_offs')
    const isEnabled = invoiceId !== ''
    const query = useLiveQuery({
        query: q => {
            if (!isEnabled) return undefined
            return q
                .from({ w: writeOffsCollection })
                .where(({ w }) => eq(w.invoice, invoiceId))
                .orderBy(({ w }) => w.date)
                .orderBy(({ w }) => w.created)
                .select(({ w }) => ({
                    id: w.id,
                    number: w.number,
                    date: w.date,
                    amount: w.amount,
                    status: w.status,
                    currency: w.currency,
                }))
        },
        queryKey: ['books.invoice.writeOffs', invoiceId],
    })
    const isError = isEnabled && query.isError
    const recovery: LiveRecovery =
        isError && query.collection
            ? { queries: [query.collection], sources: [writeOffsCollection] }
            : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.invoice', err, { operation: 'write-offs' }),
        })
    }
    return {
        rows: isEnabled ? (query.data ?? []) : [],
        isReady: !isEnabled || query.isReady,
        isError,
        recovery,
        retry,
    }
}

export type InvoiceWriteOffRow = ReturnType<typeof useInvoiceWriteOffs>['rows'][number]
