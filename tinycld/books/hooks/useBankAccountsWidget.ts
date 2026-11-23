import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { type BankAccountsModel, bankAccountsModel, type Loadable } from '../lib/dashboard-figures'
import { mergeRecoveries } from '../lib/live-recovery'
import { useAccountsQuery } from './useAccountsQuery'
import { useBankConnections } from './useBankConnections'
import { useBooksSettings } from './useBooksSettings'

/**
 * The Bank accounts widget's rows (spec §3 "Bank accounts widget"): the chart's accounts
 * with their books balances (plan D14: the read the Chart of Accounts holds), the bank
 * connections with their for-review counts, and the book's currency. `state` is `error`
 * when any of the three reads failed, `loading` until all are ready; `retry` restarts
 * only the failed reads.
 */
export function useBankAccountsWidget() {
    const accounts = useAccountsQuery()
    const connections = useBankConnections()
    const settings = useBooksSettings()
    // A figure shows only once the settings read is ready, so the fallback is used only
    // by a book that has no settings row yet, as in the rest of Books.
    const currency = settings.settings?.currency ?? 'USD'

    const state = bankAccountsState({
        isError: accounts.isError || connections.isError || settings.hasLoadError,
        isReady: accounts.isReady && connections.isReady && settings.isReady,
        accounts: accounts.data ?? [],
        connections: connections.rows,
    })

    const retry = () => {
        if (accounts.isError) accounts.retry()
        void recoverLiveQueries({
            ...mergeRecoveries([connections.recovery, settings.recovery]),
            onError: err => log.error('books.dashboard.bank', err),
        })
    }

    return { state, retry, currency }
}

function bankAccountsState({
    isError,
    isReady,
    accounts,
    connections,
}: {
    isError: boolean
    isReady: boolean
    accounts: Parameters<typeof bankAccountsModel>[0]
    connections: Parameters<typeof bankAccountsModel>[1]
}): Loadable<BankAccountsModel> {
    if (isError) return { status: 'error' }
    if (!isReady) return { status: 'loading' }
    return { status: 'ready', model: bankAccountsModel(accounts, connections) }
}
