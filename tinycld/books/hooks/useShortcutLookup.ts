import { inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import type { ShortcutRowsInput } from '../lib/shortcut-rows'
import type { Shortcut } from '../lib/sidebar-shortcuts'
import { useBooksAccess } from './useBooksAccess'
import { useBooksReports } from './useBooksReports'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * What a list of shortcuts needs to become rows (`shortcutRows`): the Books reports the
 * user can open and the accounts of the list's register shortcuts. `isError` is true
 * while one of the two reads failed; `recovery` is for recoverLiveQueries. A failed read
 * gives an empty list for its kind, so the rows of the other kinds stay.
 */
export function useShortcutLookup(shortcuts: readonly Shortcut[]) {
    const [accountsCollection] = useStore('books_accounts')
    const orgHref = useOrgHref()
    const { canWrite } = useBooksAccess()
    const reports = useBooksReports()
    const accountIds = shortcuts
        .filter(shortcut => shortcut.kind === 'register')
        .map(shortcut => shortcut.ref)
    const accountsQuery = useLiveQuery({
        query: q => {
            if (accountIds.length === 0) return undefined
            return q
                .from({ account: accountsCollection })
                .where(({ account }) => inArray(account.id, accountIds))
                .select(({ account }) => ({
                    id: account.id,
                    number: account.number,
                    name: account.name,
                }))
        },
        queryKey: ['books', 'shortcut-accounts', accountIds.join(',')],
    })
    const accountsFailed = accountIds.length > 0 && accountsQuery.isError

    const input: ShortcutRowsInput = {
        canWrite,
        reports: reports.reports,
        accounts: accountsFailed ? [] : (accountsQuery.data ?? []),
        orgHref,
    }
    const recovery = mergeRecoveries([
        reports.recovery,
        accountsFailed
            ? { queries: [accountsQuery.collection], sources: [accountsCollection] }
            : NO_RECOVERY,
    ])

    return { input, isError: reports.isError || accountsFailed, recovery }
}
