import { count, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { AccountRow } from './useAccountsQuery'

// What stops an account's type from changing: journal lines posted to it and
// sub-accounts under it (active or not, as the server counts them).
export function useAccountUsage(accountId: string | null, accounts: AccountRow[]) {
    const [linesCollection] = useStore('books_journal_lines')
    const { data, isReady } = useLiveQuery({
        query: query => {
            if (accountId === null) return undefined
            return query
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.account, accountId))
                .groupBy(({ line }) => line.account)
                .select(({ line }) => ({ lines: count(line.id) }))
        },
    })
    const children = accountId === null ? 0 : accounts.filter(a => a.parent === accountId).length
    return { lines: data?.[0]?.lines ?? 0, children, isReady: accountId === null || isReady }
}
