import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { bankConnectionsQuery } from '../lib/bank-connections-query'
import type { LiveRecovery } from '../lib/live-recovery'

// Every connection in chart order, with its account, its posted totals and its count of
// files waiting to import: the cards of the account strip.
export function useBankConnections() {
    const [connectionsCollection, accountsCollection, balancesCollection, filesCollection] =
        useStore(
            'books_bank_connections',
            'books_accounts',
            'books_account_balances',
            'books_bank_files'
        )
    const query = useLiveQuery({
        query: bankConnectionsQuery(
            connectionsCollection,
            accountsCollection,
            balancesCollection,
            filesCollection
        ),
        queryKey: ['books.banking.connections'],
    })
    // What the screen merges into its one recovery call. A source is cleaned only when it
    // failed itself, so the ready collections keep their rows.
    const recovery: LiveRecovery = query.isError
        ? {
              queries: [query.collection],
              sources: [
                  connectionsCollection,
                  accountsCollection,
                  balancesCollection,
                  filesCollection,
              ],
          }
        : { queries: [], sources: [] }
    return {
        rows: query.data ?? [],
        isReady: query.isReady,
        isError: query.isError,
        recovery,
    }
}

export type BankConnectionRow = ReturnType<typeof useBankConnections>['rows'][number]
