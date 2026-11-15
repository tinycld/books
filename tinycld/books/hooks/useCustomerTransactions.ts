import { and, eq, not, or } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useMemo, useState } from 'react'
import { type KeptRows, keepRows } from '../lib/entries-query'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import {
    estimateRow,
    invoiceRow,
    mergeTransactions,
    type PartyTransactionRow,
    salesReceiptRow,
    TRANSACTION_PAGE,
    type TransactionFilter,
    type TransactionKind,
} from '../lib/party-transactions'
import { todayIso } from '../lib/register-range'
import { useBooksSettings } from './useBooksSettings'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

function runs(filter: TransactionFilter, kind: TransactionKind) {
    return filter === 'all' || filter === kind
}

/**
 * One customer's invoices, estimates and sales receipts, newest first, `n` at a time
 * (spec §3.5). Three live queries, each this customer's first `n` rows of its kind by date
 * desc then created desc, feed the pure merge; a filter other than `all` runs only its
 * kind's query. A void original that a correction replaced is left out in the query, so
 * each source's `n` rows are all listed rows. `loadMore` grows the window by 50 while a
 * source may have more; the rows shown stay on screen while the larger window loads.
 * Totals draw in the Books settings' currency, so that read is one more the tab waits for.
 */
export function useCustomerTransactions(customerId: string, filter: TransactionFilter) {
    const [invoicesCollection, estimatesCollection, receiptsCollection] = useStore(
        'books_invoices',
        'books_estimates',
        'books_sales_receipts'
    )
    const [n, setN] = useState(TRANSACTION_PAGE)
    const today = todayIso()
    const runsInvoices = runs(filter, 'invoice')
    const runsEstimates = runs(filter, 'estimate')
    const runsReceipts = runs(filter, 'sales_receipt')

    const invoicesQuery = useLiveQuery({
        query: q => {
            if (!runsInvoices) return undefined
            return q
                .from({ i: invoicesCollection })
                .where(({ i }) =>
                    and(
                        eq(i.customer, customerId),
                        or(not(eq(i.status, 'void')), eq(i.replaced_by, ''))
                    )
                )
                .orderBy(({ i }) => i.date, 'desc')
                .orderBy(({ i }) => i.created, 'desc')
                .limit(n)
        },
        queryKey: ['books.customer-page.invoices', customerId, runsInvoices, n],
    })
    const estimatesQuery = useLiveQuery({
        query: q => {
            if (!runsEstimates) return undefined
            return q
                .from({ e: estimatesCollection })
                .where(({ e }) => eq(e.customer, customerId))
                .orderBy(({ e }) => e.date, 'desc')
                .orderBy(({ e }) => e.created, 'desc')
                .limit(n)
        },
        queryKey: ['books.customer-page.estimates', customerId, runsEstimates, n],
    })
    const receiptsQuery = useLiveQuery({
        query: q => {
            if (!runsReceipts) return undefined
            return q
                .from({ r: receiptsCollection })
                .where(({ r }) =>
                    and(
                        eq(r.customer, customerId),
                        or(not(eq(r.status, 'void')), eq(r.replaced_by, ''))
                    )
                )
                .orderBy(({ r }) => r.date, 'desc')
                .orderBy(({ r }) => r.created, 'desc')
                .limit(n)
        },
        queryKey: ['books.customer-page.sales-receipts', customerId, runsReceipts, n],
    })

    const invoices = runsInvoices ? invoicesQuery.data : undefined
    const estimates = runsEstimates ? estimatesQuery.data : undefined
    const receipts = runsReceipts ? receiptsQuery.data : undefined
    const merged = useMemo(
        () =>
            mergeTransactions(
                [
                    (invoices ?? []).map(row => invoiceRow(row, today)),
                    (estimates ?? []).map(row => estimateRow(row, today)),
                    (receipts ?? []).map(row => salesReceiptRow(row)),
                ],
                n
            ),
        [invoices, estimates, receipts, today, n]
    )

    const settings = useBooksSettings()

    const invoicesError = runsInvoices && invoicesQuery.isError
    const estimatesError = runsEstimates && estimatesQuery.isError
    const receiptsError = runsReceipts && receiptsQuery.isError
    const anyError = invoicesError || estimatesError || receiptsError || settings.hasLoadError
    const isPending =
        (runsInvoices && !invoicesQuery.isReady && !invoicesQuery.isError) ||
        (runsEstimates && !estimatesQuery.isReady && !estimatesQuery.isError) ||
        (runsReceipts && !receiptsQuery.isReady && !receiptsQuery.isError) ||
        (!settings.isReady && !settings.hasLoadError)
    // The settings read gives the currency every total draws in, so the rows wait for it.
    const isReady =
        (!runsInvoices || invoicesQuery.isReady) &&
        (!runsEstimates || estimatesQuery.isReady) &&
        (!runsReceipts || receiptsQuery.isReady) &&
        settings.isReady

    // A larger window is a new query: the rows of the last ready window stay on screen
    // while it loads, but only under the same customer and filter.
    const [kept, setKept] = useState<KeptRows<PartyTransactionRow>>()
    const shown = keepRows(kept, {
        isReady,
        key: `${customerId}:${filter}`,
        rows: isReady ? merged.rows : undefined,
        limit: n,
    })
    if (shown.next !== kept) setKept(shown.next)
    const rows = shown.rows
    // The tab waits for every read it runs: while one still loads it shows the loading
    // state, and a failed read shows its error once the others are in.
    const isLoading = rows === undefined && isPending
    const isError = !isLoading && anyError

    const hasMore = isReady && merged.hasMore
    const loadMore = () => {
        if (hasMore) setN(n + TRANSACTION_PAGE)
    }

    // Each part is non-empty only when its own query failed, so Retry restarts only the
    // failed reads.
    const invoicesRecovery: LiveRecovery = invoicesError
        ? { queries: [invoicesQuery.collection], sources: [invoicesCollection] }
        : NO_RECOVERY
    const estimatesRecovery: LiveRecovery = estimatesError
        ? { queries: [estimatesQuery.collection], sources: [estimatesCollection] }
        : NO_RECOVERY
    const receiptsRecovery: LiveRecovery = receiptsError
        ? { queries: [receiptsQuery.collection], sources: [receiptsCollection] }
        : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([
                invoicesRecovery,
                estimatesRecovery,
                receiptsRecovery,
                settings.recovery,
            ]),
            onError: err => log.warn('books.customer-page', 'retry failed', { err }),
        })
    }
    // Rows show only once the settings read is ready, so the fallback is used only by a
    // book that has no settings row yet, as in the rest of Books.
    const currency = settings.settings?.currency ?? 'USD'

    return { rows: rows ?? [], currency, isLoading, isError, retry, loadMore, hasMore }
}
