import { eq, inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { EXPENSE_GROUP_TYPES, form1099Controls } from '../lib/form-1099'
import type { LiveRecovery } from '../lib/report-definition'
import { mergeRecoveries } from '../lib/report-state'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// The accounts a box can be set on; the Settings list summary counts the mapped ones.
export function useExpenseGroupAccounts() {
    const [accountsCollection] = useStore('books_accounts')
    const query = useLiveQuery({
        query: q =>
            q
                .from({ account: accountsCollection })
                .where(({ account }) => inArray(account.type, [...EXPENSE_GROUP_TYPES])),
        queryKey: ['books', 'form-1099', 'accounts'],
    })
    const rows: NonNullable<typeof query.data> = query.data ?? []
    const recovery: LiveRecovery = query.isError
        ? { queries: [query.collection], sources: [accountsCollection] }
        : NO_RECOVERY
    return { rows, isReady: query.isReady, isError: query.isError, recovery }
}

function sectionPart(states: { isReady: boolean; isError: boolean }[]) {
    if (states.some(state => state.isError)) return 'error' as const
    if (states.some(state => !state.isReady)) return 'loading' as const
    return 'ready' as const
}

export function useForm1099Section() {
    const access = useBooksAccess()
    const booksSettings = useBooksSettings()
    const accounts = useExpenseGroupAccounts()
    const [vendorsCollection] = useStore('books_vendors')
    const vendorsQuery = useLiveQuery({
        query: q =>
            q
                .from({ vendor: vendorsCollection })
                .where(({ vendor }) => eq(vendor.track_1099, true))
                .orderBy(({ vendor }) => vendor.display_name, 'asc'),
        queryKey: ['books', 'form-1099', 'vendors'],
    })
    const vendors: NonNullable<typeof vendorsQuery.data> = vendorsQuery.data ?? []
    const vendorsRecovery: LiveRecovery = vendorsQuery.isError
        ? { queries: [vendorsQuery.collection], sources: [vendorsCollection] }
        : NO_RECOVERY

    return {
        part: sectionPart([
            { isReady: booksSettings.isReady, isError: booksSettings.hasLoadError },
            accounts,
            { isReady: vendorsQuery.isReady, isError: vendorsQuery.isError },
        ]),
        settings: booksSettings.settings,
        accounts: accounts.rows,
        vendors,
        controls: form1099Controls(access),
        // One call over every failed query, so a retry rebuilds them together.
        retry: () => {
            void recoverLiveQueries({
                ...mergeRecoveries([booksSettings.recovery, accounts.recovery, vendorsRecovery]),
                onError: error => log.error('books.form-1099', error),
            })
        },
    }
}
