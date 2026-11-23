import { gte } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import {
    type InvoicesModel,
    invoicesModel,
    type Loadable,
    paidWindowStart,
    undepositedBalance,
} from '../lib/dashboard-figures'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { todayIso } from '../lib/register-range'
import { useAccountsQuery } from './useAccountsQuery'
import { useBooksSettings } from './useBooksSettings'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * The Invoices widget's figures (spec §3 "Invoices widget"): the open balances by due
 * date, the payments of the last 30 days, the Undeposited funds balance and the book's
 * currency. Both views are live through their change signal, so a post, a void or a
 * payment anywhere in Books moves an open dashboard. `state` is `error` when any read
 * failed, `loading` until all are ready; `retry` restarts only the failed reads.
 */
export function useInvoicesWidget() {
    const [dueTotalsCollection, paymentTotalsCollection] = useStore(
        'books_invoice_due_totals',
        'books_payment_day_totals'
    )
    const today = todayIso()
    const windowStart = paidWindowStart(today)
    const dueQuery = useLiveQuery({
        query: q => q.from({ due: dueTotalsCollection }),
        queryKey: ['books.dashboard.due-totals'],
    })
    const paymentQuery = useLiveQuery({
        query: q =>
            q
                .from({ paid: paymentTotalsCollection })
                .where(({ paid }) => gte(paid.date, windowStart)),
        queryKey: ['books.dashboard.payment-totals', windowStart],
    })
    const accounts = useAccountsQuery()
    const settings = useBooksSettings()
    // A figure shows only once the settings read is ready, so the fallback is used only
    // by a book that has no settings row yet, as in the rest of Books.
    const currency = settings.settings?.currency ?? 'USD'

    const isError =
        dueQuery.isError || paymentQuery.isError || accounts.isError || settings.hasLoadError
    const isReady = dueQuery.isReady && paymentQuery.isReady && accounts.isReady && settings.isReady
    const state = invoicesState({
        isError,
        isReady,
        dueTotals: dueQuery.data ?? [],
        paymentTotals: paymentQuery.data ?? [],
        undepositedCents: undepositedBalance(accounts.data ?? []),
        today,
    })

    // Each part is non-empty only when its own query failed, so Retry restarts only the
    // failed reads.
    const dueRecovery: LiveRecovery = dueQuery.isError
        ? { queries: [dueQuery.collection], sources: [dueTotalsCollection] }
        : NO_RECOVERY
    const paymentRecovery: LiveRecovery = paymentQuery.isError
        ? { queries: [paymentQuery.collection], sources: [paymentTotalsCollection] }
        : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([dueRecovery, paymentRecovery, settings.recovery]),
            onError: err => log.warn('books.dashboard.invoices', 'retry failed', { err }),
        })
        if (accounts.isError) accounts.retry()
    }

    return { state, retry, currency }
}

function invoicesState({
    isError,
    isReady,
    ...input
}: Parameters<typeof invoicesModel>[0] & {
    isError: boolean
    isReady: boolean
}): Loadable<InvoicesModel> {
    if (isError) return { status: 'error' }
    if (!isReady) return { status: 'loading' }
    return { status: 'ready', model: invoicesModel(input) }
}
