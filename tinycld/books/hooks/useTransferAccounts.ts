import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { accountsWithBalances } from '../lib/accounts-query'
import type { LiveRecovery } from '../lib/live-recovery'
import { transferAccountBalance, transferAccountOptions } from '../lib/transfer'

// The chart with each account's posted totals: the names the read view shows, the
// choices of the From and To pickers, and the balance under each picked account.
export function useTransferAccounts() {
    const [accountsCollection, balancesCollection] = useStore(
        'books_accounts',
        'books_account_balances'
    )
    const query = useLiveQuery({
        query: accountsWithBalances(accountsCollection, balancesCollection),
        queryKey: ['books.transfer.accounts'],
    })
    const accounts = query.data ?? []
    const byId = new Map(accounts.map(account => [account.id, account]))
    const names = new Map(
        accounts.map(account => [account.id, `${account.number} ${account.name}`.trim()])
    )
    // What a screen with other failed reads merges into its one recovery call. A source
    // is cleaned only when it failed itself, so the ready collections keep their rows.
    const recovery: LiveRecovery = query.isError
        ? { queries: [query.collection], sources: [accountsCollection, balancesCollection] }
        : { queries: [], sources: [] }

    return {
        accounts,
        names,
        balanceOf: (id: string) => {
            const row = byId.get(id)
            return row ? transferAccountBalance(row) : undefined
        },
        optionsFor: (storedId: string) => transferAccountOptions(accounts, storedId),
        isReady: query.isReady,
        isError: query.isError,
        recovery,
    }
}
