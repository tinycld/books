import { and, eq, not, or } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'

/**
 * The credit memos that name an invoice (spec §3.10, §4.5), oldest first: one live query
 * of `books_credit_memos` by `invoice`. A void original that a correction replaced is left
 * out in the query (the rule of useCustomerTransactions' sources), so a corrected memo
 * shows once, as its correction. Retry recovers the query and its collection.
 */
export function useInvoiceCreditMemos(invoiceId: string) {
    const [memosCollection] = useStore('books_credit_memos')
    const query = useLiveQuery({
        query: q => {
            if (!invoiceId) return undefined
            return q
                .from({ m: memosCollection })
                .where(({ m }) =>
                    and(
                        eq(m.invoice, invoiceId),
                        or(not(eq(m.status, 'void')), eq(m.replaced_by, ''))
                    )
                )
                .orderBy(({ m }) => m.date)
                .select(({ m }) => ({
                    id: m.id,
                    number: m.number,
                    date: m.date,
                    total: m.total,
                    balance: m.balance,
                    status: m.status,
                    currency: m.currency,
                }))
        },
        queryKey: ['books.invoice.creditMemos', invoiceId],
    })
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [memosCollection],
            onError: err => log.error('books.invoice', err, { operation: 'credit-memos' }),
        })
    }
    return {
        rows: query.data ?? [],
        isReady: Boolean(invoiceId) && query.isReady,
        isError: query.isError,
        retry,
    }
}

export type InvoiceCreditMemoRow = ReturnType<typeof useInvoiceCreditMemos>['rows'][number]
