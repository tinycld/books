import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { accountsWithBalances, reloadCollections } from '../lib/accounts-query'

export function useAccountsQuery() {
    const [accountsCollection, balancesCollection] = useStore(
        'books_accounts',
        'books_account_balances'
    )
    const { data, isReady, isError } = useLiveQuery(
        accountsWithBalances(accountsCollection, balancesCollection)
    )
    const retry = () => {
        void reloadCollections([accountsCollection, balancesCollection], err =>
            log.error('books.accounts', err)
        )
    }
    return { data, isReady, isError, retry }
}

export type AccountRow = NonNullable<ReturnType<typeof useAccountsQuery>['data']>[number]
