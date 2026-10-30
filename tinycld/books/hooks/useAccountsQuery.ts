import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { accountsWithBalances } from '../lib/accounts-query'

export function useAccountsQuery() {
    const [accountsCollection, balancesCollection] = useStore(
        'books_accounts',
        'books_account_balances'
    )
    // An explicit key: the IR of this join is costly to rebuild and hash on every render.
    const { data, isReady, isError, collection } = useLiveQuery({
        queryKey: ['books-accounts-with-balances'],
        query: accountsWithBalances(accountsCollection, balancesCollection),
    })
    const retry = () => {
        void recoverLiveQueries({
            queries: [collection],
            sources: [accountsCollection, balancesCollection],
            onError: err => log.error('books.accounts', err),
        })
    }
    return { data, isReady, isError, retry }
}

export type AccountRow = NonNullable<ReturnType<typeof useAccountsQuery>['data']>[number]
