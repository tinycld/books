import { and, eq, lt } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { overdueCents } from '../lib/party-balance'
import { todayIso } from '../lib/register-range'
import { useBooksSettings } from './useBooksSettings'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * One customer's Open and Overdue figures, in cents. Open is the customer's row of the
 * `books_party_balances` view (no row: no posted A/R line, so 0); Overdue sums the totals
 * of the customer's posted invoices due before today. Both are `null` until both reads
 * and the Books settings (the currency) load; a failure of any of the three is `isError`,
 * and `retry` restarts the failed ones.
 * The view is live through its change signal, so a post or void anywhere in Books moves
 * Open on an open page.
 */
export function usePartyBalance(customerId: string) {
    const [balancesCollection, invoicesCollection] = useStore(
        'books_party_balances',
        'books_invoices'
    )
    const today = todayIso()
    const balanceQuery = useLiveQuery({
        query: q =>
            q
                .from({ b: balancesCollection })
                .where(({ b }) => eq(b.customer, customerId))
                .findOne(),
        queryKey: ['books.customer-page.balance', customerId],
    })
    const overdueQuery = useLiveQuery({
        query: q =>
            q
                .from({ i: invoicesCollection })
                .where(({ i }) =>
                    and(eq(i.customer, customerId), eq(i.status, 'posted'), lt(i.due_date, today))
                )
                .select(({ i }) => ({ total: i.total })),
        queryKey: ['books.customer-page.overdue', customerId, today],
    })
    const settings = useBooksSettings()

    const isError = balanceQuery.isError || overdueQuery.isError || settings.hasLoadError
    // The figures show together, and only in the book's currency: both read "—" until the
    // two reads and the settings are in.
    const isReady = balanceQuery.isReady && overdueQuery.isReady && settings.isReady
    const isLoading = !isError && !isReady
    const open = isReady ? (balanceQuery.data?.balance ?? 0) : null
    const overdue = isReady ? overdueCents(overdueQuery.data ?? []) : null
    // A figure shows only once the settings read is ready, so the fallback is used only
    // by a book that has no settings row yet, as in the rest of Books.
    const currency = settings.settings?.currency ?? 'USD'

    // Each part is non-empty only when its own query failed, so Retry restarts only the
    // failed read.
    const balanceRecovery: LiveRecovery = balanceQuery.isError
        ? { queries: [balanceQuery.collection], sources: [balancesCollection] }
        : NO_RECOVERY
    const overdueRecovery: LiveRecovery = overdueQuery.isError
        ? { queries: [overdueQuery.collection], sources: [invoicesCollection] }
        : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([balanceRecovery, overdueRecovery, settings.recovery]),
            onError: err => log.warn('books.customer-page', 'retry failed', { err }),
        })
    }

    return { open, overdue, currency, isLoading, isError, retry }
}
