import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { accountOptionList } from '../lib/account-options'

export function useAccountOptions() {
    const [accountsCollection] = useStore('books_accounts')
    const query = useLiveQuery({
        query: q => q.from({ account: accountsCollection }),
        queryKey: ['books.entry-form.accounts'],
    })
    const { options, names } = accountOptionList(query.data ?? [])

    // A source is cleaned only when it failed itself, so a ready accounts collection keeps
    // its rows for every other reader.
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [accountsCollection],
            onError: err => log.error('books.accounts', err),
        })
    }
    // What a screen with other failed reads merges into its one recovery call.
    const recovery = query.isError
        ? { queries: [query.collection], sources: [accountsCollection] }
        : { queries: [], sources: [] }

    return { options, names, isReady: query.isReady, isError: query.isError, retry, recovery }
}

export type AccountChoice = ReturnType<typeof useAccountOptions>['options'][number]
