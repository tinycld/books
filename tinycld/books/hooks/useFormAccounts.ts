import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'

// One query key for every account picker on a record form and the new product
// route's defaults, so they share one set of rows.
export function useFormAccounts() {
    const [accountsCollection] = useStore('books_accounts')
    const query = useLiveQuery({
        query: q => q.from({ account: accountsCollection }),
        queryKey: ['books.form.accounts'],
    })
    // A failed live query does not recover on a reload of its collection. A source is
    // cleaned only when it failed itself, so a ready accounts collection keeps its rows
    // for every other reader.
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [accountsCollection],
            onError: err => log.error('books.form.accounts', err),
        })
    }
    return { accounts: query.data ?? [], isReady: query.isReady, isError: query.isError, retry }
}

export type FormAccount = ReturnType<typeof useFormAccounts>['accounts'][number]
