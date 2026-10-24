import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useMemo } from 'react'
import { canWriteAccounts } from '../lib/account-access'
import { useAccountImport } from './useAccountImport'
import { useBooksAccess } from './useBooksAccess'

// The import only needs each account's identity, so it reads books_accounts alone and
// skips the balances join the Chart of Accounts screen runs.
export function useAccountsImportScreen() {
    const access = useBooksAccess()
    const [accountsCollection] = useStore('books_accounts')
    const canWrite = canWriteAccounts(access)
    // A query that returns undefined is disabled, so a reader's collection is never subscribed.
    const { data, isReady, isError } = useLiveQuery({
        queryKey: ['books-import-accounts', canWrite],
        query: query => (canWrite ? query.from({ account: accountsCollection }) : undefined),
    })
    const existing = useMemo(
        () =>
            (data ?? []).map(({ id, name, number, type, parent }) => ({
                id,
                name,
                number,
                type,
                parent,
            })),
        [data]
    )
    const flow = useAccountImport(existing)
    // The query is off for a user without write access, so their load state is moot.
    const needsAccounts = canWrite && !isError
    const retry = async () => {
        try {
            await accountsCollection.reload()
        } catch (error) {
            log.error('books.import', error)
        }
    }
    const loadError = canWrite && isError ? { retry } : undefined

    return {
        canWrite,
        isReady: access.isReady && (!needsAccounts || isReady),
        loadError,
        flow,
    }
}
