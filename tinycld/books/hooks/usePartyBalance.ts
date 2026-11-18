import { and, eq, gt, lt } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { overdueCents, partyBalanceSources } from '../lib/party-balance'
import type { PartyRef } from '../lib/party-page-tabs'
import { todayIso } from '../lib/register-range'
import { useBooksSettings } from './useBooksSettings'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * One party's Open and Overdue figures, in cents. Open is the party's row of the
 * `books_party_balances` view (no row: no posted A/R or A/P line, so 0); Overdue sums the
 * open balances (`balance`) of the party's posted documents due before today that are
 * not paid in full: invoices for a customer, bills for a vendor (`partyBalanceSources`).
 * The other party's overdue query is off (its callback returns `undefined`): it is not
 * loading and has no error. Both figures are `null` until the enabled reads and the
 * Books settings (the currency) load; a failure of any of them is `isError`, and `retry`
 * restarts the failed ones.
 * The view is live through its change signal, so a post or void anywhere in Books moves
 * Open on an open page.
 */
export function usePartyBalance({ party, id }: PartyRef) {
    const [balancesCollection, invoicesCollection, billsCollection] = useStore(
        'books_party_balances',
        'books_invoices',
        'books_bills'
    )
    const sources = partyBalanceSources(party)
    const runsInvoices = sources.overdueCollection === 'books_invoices'
    const runsBills = sources.overdueCollection === 'books_bills'
    const today = todayIso()
    const balanceQuery = useLiveQuery({
        query: q =>
            q
                .from({ b: balancesCollection })
                .where(({ b }) => eq(b[sources.balanceField], id))
                .findOne(),
        queryKey: [`books.${party}-page.balance`, id],
    })
    const invoicesQuery = useLiveQuery({
        query: q => {
            // An invoice names its party in `customer` only, so the field narrows to it.
            const field = sources.overdueField
            if (!runsInvoices || field !== 'customer') return undefined
            return q
                .from({ i: invoicesCollection })
                .where(({ i }) =>
                    and(
                        eq(i[field], id),
                        eq(i.status, 'posted'),
                        lt(i.due_date, today),
                        gt(i.balance, 0)
                    )
                )
                .select(({ i }) => ({ balance: i.balance }))
        },
        queryKey: [`books.${party}-page.overdue`, 'books_invoices', id, today],
    })
    const billsQuery = useLiveQuery({
        query: q => {
            // A bill names its party in `vendor` only, so the field narrows to it.
            const field = sources.overdueField
            if (!runsBills || field !== 'vendor') return undefined
            return q
                .from({ bill: billsCollection })
                .where(({ bill }) =>
                    and(
                        eq(bill[field], id),
                        eq(bill.status, 'posted'),
                        lt(bill.due_date, today),
                        gt(bill.balance, 0)
                    )
                )
                .select(({ bill }) => ({ balance: bill.balance }))
        },
        queryKey: [`books.${party}-page.overdue`, 'books_bills', id, today],
    })
    const settings = useBooksSettings()

    const overdueRows = runsInvoices ? invoicesQuery.data : billsQuery.data
    const overdueError = runsInvoices ? invoicesQuery.isError : billsQuery.isError
    const overdueReady = runsInvoices ? invoicesQuery.isReady : billsQuery.isReady

    const isError = balanceQuery.isError || overdueError || settings.hasLoadError
    // The figures show together, and only in the book's currency: both read "—" until the
    // two reads and the settings are in.
    const isReady = balanceQuery.isReady && overdueReady && settings.isReady
    const isLoading = !isError && !isReady
    const open = isReady ? (balanceQuery.data?.balance ?? 0) : null
    const overdue = isReady ? overdueCents(overdueRows ?? []) : null
    // A figure shows only once the settings read is ready, so the fallback is used only
    // by a book that has no settings row yet, as in the rest of Books.
    const currency = settings.settings?.currency ?? 'USD'

    // Each part is non-empty only when its own enabled query failed, so Retry restarts
    // only the failed read.
    const balanceRecovery: LiveRecovery = balanceQuery.isError
        ? { queries: [balanceQuery.collection], sources: [balancesCollection] }
        : NO_RECOVERY
    const invoicesRecovery: LiveRecovery =
        runsInvoices && invoicesQuery.isError
            ? { queries: [invoicesQuery.collection], sources: [invoicesCollection] }
            : NO_RECOVERY
    const billsRecovery: LiveRecovery =
        runsBills && billsQuery.isError
            ? { queries: [billsQuery.collection], sources: [billsCollection] }
            : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([
                balanceRecovery,
                invoicesRecovery,
                billsRecovery,
                settings.recovery,
            ]),
            onError: err => log.warn(`books.${party}-page`, 'retry failed', { err }),
        })
    }

    return { open, overdue, currency, isLoading, isError, retry }
}
