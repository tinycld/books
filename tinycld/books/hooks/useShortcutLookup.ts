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

// The accounts that the register shortcuts name; no read when there is none.
function useShortcutAccounts(accountIds: string[]) {
    const [accountsCollection] = useStore('books_accounts')
    const query = useLiveQuery({
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
    return { accountsCollection, query }
}

// The selected fields of a row, without the `$` keys pbtsdb adds to it.
export type ShortcutAccount = Pick<
    NonNullable<ReturnType<typeof useShortcutAccounts>['query']['data']>[number],
    'id' | 'number' | 'name'
>

/**
 * What a list of shortcuts needs to become rows (`shortcutRows`): the Books reports the
 * user can open and the accounts of the list's register shortcuts. `isError` is true
 * while one of the two reads failed; `recovery` is for recoverLiveQueries. A failed read
 * gives an empty list for its kind, so the rows of the other kinds stay.
 */
export function useShortcutLookup(shortcuts: readonly Shortcut[]) {
    const orgHref = useOrgHref()
    const { canWrite } = useBooksAccess()
    const reports = useBooksReports()
    const accountIds = shortcuts
        .filter(shortcut => shortcut.kind === 'register')
        .map(shortcut => shortcut.ref)
    const { accountsCollection, query: accountsQuery } = useShortcutAccounts(accountIds)
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
