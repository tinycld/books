import { eq, gte, type WithoutVirtualProps } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { earliestMonth } from '../lib/dashboard-periods'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { fiscalStartMonth, todayIso } from '../lib/register-range'
import { useBooksSettings } from './useBooksSettings'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * The monthly balance rows the Expenses, Profit and loss and Sales widgets sum (spec §4):
 * one live query of `books_account_balances` joined to its account (the widgets filter by
 * the account's type), from the earliest month any period choice can need (plan D15). The
 * first month does not follow the chosen periods, so a period change starts no read. The
 * query is off until the settings are ready, because the first month needs the fiscal
 * start month. `retry` restarts only the failed reads.
 */
export function useDashboardBalances() {
    const settings = useBooksSettings()
    const today = todayIso()
    const fiscalStart = fiscalStartMonth(settings.settings)
    // A figure shows only once the settings read is ready, so the fallback is used only
    // by a book that has no settings row yet, as in the rest of Books.
    const currency = settings.settings?.currency ?? 'USD'
    const fromMonth = earliestMonth(today, fiscalStart)
    const isEnabled = settings.isReady
    const { query, balancesCollection, accountsCollection } = useBalancesQuery(fromMonth, isEnabled)

    const isQueryError = isEnabled && query.isError
    const isError = isQueryError || settings.hasLoadError
    const isReady = isEnabled && query.isReady
    const queryRecovery: LiveRecovery =
        isQueryError && query.collection
            ? { queries: [query.collection], sources: [balancesCollection, accountsCollection] }
            : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([queryRecovery, settings.recovery]),
            onError: err => log.error('books.dashboard.balances', err),
        })
    }
    const rows: BalanceRow[] = (isEnabled ? query.data : undefined) ?? []

    return { rows, isReady, isError, retry, today, fiscalStart, currency }
}

// The one query: the balance rows from `fromMonth` on, each with the account fields the
// widgets filter, roll up and label by.
function useBalancesQuery(fromMonth: string, isEnabled: boolean) {
    const [balancesCollection, accountsCollection] = useStore(
        'books_account_balances',
        'books_accounts'
    )
    const query = useLiveQuery({
        query: q => {
            if (!isEnabled) return undefined
            return q
                .from({ balance: balancesCollection })
                .innerJoin({ account: accountsCollection }, ({ balance, account }) =>
                    eq(balance.account, account.id)
                )
                .where(({ balance }) => gte(balance.month_start, fromMonth))
                .select(({ balance, account }) => ({
                    account: balance.account,
                    month_start: balance.month_start,
                    debit_total: balance.debit_total,
                    credit_total: balance.credit_total,
                    type: account.type,
                    parent: account.parent,
                    name: account.name,
                    number: account.number,
                }))
        },
        queryKey: ['books.dashboard.balances', fromMonth],
    })
    return { query, balancesCollection, accountsCollection }
}

type BalanceQueryRow = NonNullable<ReturnType<typeof useBalancesQuery>['query']['data']>[number]

// The row of the query above, without the store's virtual fields, which the widgets do
// not read.
export type BalanceRow = WithoutVirtualProps<BalanceQueryRow>
