import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { filteredAccountOptions } from '../lib/account-options'
import { accountsWithBalances } from '../lib/accounts-query'
import { connectEmptyReason, isConnectable } from '../lib/bank-connections'

// The Connect dialog's account choices: active bank and credit card accounts with no
// connection, in chart order and depth, and why there are none when the list is empty.
export function useConnectableAccounts(connectedAccountIds: ReadonlySet<string>) {
    const [accountsCollection, balancesCollection] = useStore(
        'books_accounts',
        'books_account_balances'
    )
    const query = useLiveQuery({
        query: accountsWithBalances(accountsCollection, balancesCollection),
        queryKey: ['books.banking.accounts'],
    })
    // A chart that is still loading or failed to load is not an empty chart, so no
    // empty reason is given until the rows are in.
    const isReady = query.isReady && !query.isError
    const accounts = isReady ? (query.data ?? []) : []
    const { options } = filteredAccountOptions(accounts, '', account =>
        isConnectable(account, connectedAccountIds)
    )
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [accountsCollection, balancesCollection],
            onError: err => log.error('books.banking', err),
        })
    }
    return {
        options,
        emptyReason: isReady ? connectEmptyReason(accounts, connectedAccountIds) : null,
        isReady,
        isError: query.isError,
        retry,
    }
}
