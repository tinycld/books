import { count, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'

// What stops an account's type from changing or the account from being deleted:
// journal lines posted to it and sub-accounts under it (active or not, as the
// server counts them).
export function useAccountUsage(accountId: string | null) {
    const [linesCollection, accountsCollection] = useStore('books_journal_lines', 'books_accounts')
    const lineUsage = useLiveQuery({
        queryKey: ['books-account-line-usage', accountId],
        query: query => {
            if (accountId === null) return undefined
            return query
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.account, accountId))
                .groupBy(({ line }) => line.account)
                .select(({ line }) => ({ lines: count(line.id) }))
        },
    })
    const childUsage = useLiveQuery({
        queryKey: ['books-account-child-usage', accountId],
        query: query => {
            if (accountId === null) return undefined
            return query
                .from({ child: accountsCollection })
                .where(({ child }) => eq(child.parent, accountId))
                .groupBy(({ child }) => child.parent)
                .select(({ child }) => ({ children: count(child.id) }))
        },
    })
    return {
        lines: lineUsage.data?.[0]?.lines ?? 0,
        children: childUsage.data?.[0]?.children ?? 0,
        isReady: accountId === null || (lineUsage.isReady && childUsage.isReady),
    }
}
