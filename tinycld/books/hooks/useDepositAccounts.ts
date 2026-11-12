import { eq, or } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { DepositAccountRow } from '../lib/deposit-accounts'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * The accounts a sales receipt's Deposit to may name: every bank account and every
 * Undeposited funds account (lib/deposit-accounts.ts keeps the active ones in chart
 * order). Inactive rows stay, so a stored account that became inactive is still named.
 * One query key, so the screen's read and the field's are one set of rows.
 */
export function useDepositAccounts(): {
    rows: DepositAccountRow[]
    isReady: boolean
    isError: boolean
    recovery: LiveRecovery
} {
    const [accountsCollection] = useStore('books_accounts')
    const query = useLiveQuery({
        query: q =>
            q
                .from({ account: accountsCollection })
                .where(({ account }) =>
                    or(eq(account.type, 'bank'), eq(account.detail_type, 'undeposited_funds'))
                ),
        queryKey: ['books.form.depositAccounts'],
    })
    // Non-empty only when the read failed, so one Retry recovers exactly that read.
    const recovery: LiveRecovery = query.isError
        ? { queries: [query.collection], sources: [accountsCollection] }
        : NO_RECOVERY
    return {
        rows: query.data ?? [],
        isReady: query.isReady,
        isError: query.isError,
        recovery,
    }
}
