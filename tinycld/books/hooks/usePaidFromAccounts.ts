import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useMemo } from 'react'
import { accountLabel } from '../lib/account-options'
import { accountsWithBalances } from '../lib/accounts-query'
import type { LiveRecovery } from '../lib/live-recovery'
import { isPaidFromAccount, paidFromOptions } from '../lib/paid-from'
import { transferAccountBalance } from '../lib/transfer'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * The chart with each account's posted totals, for an expense's Paid from (spec §3.3):
 * the names the read view shows, the select's options (the active bank and credit card
 * accounts, lib/paid-from.ts), the balance under the picked account, and the ids of the
 * accounts a copy may keep. Inactive rows stay, so a stored account that became inactive
 * is still named. One query key, so the screen's read and the field's are one set of
 * rows.
 */
export function usePaidFromAccounts() {
    const [accountsCollection, balancesCollection] = useStore(
        'books_accounts',
        'books_account_balances'
    )
    const query = useLiveQuery({
        query: accountsWithBalances(accountsCollection, balancesCollection),
        queryKey: ['books.form.paymentAccounts'],
    })
    const rows = query.data
    // Kept between renders while the rows do not change: a copy's values (new line ids)
    // are memoised on the form start that holds `activeIds`.
    const { accounts, byId, names, activeIds } = useMemo(() => {
        const list = rows ?? []
        const active: ReadonlySet<string> = new Set(
            list.filter(isPaidFromAccount).map(account => account.id)
        )
        return {
            accounts: list,
            byId: new Map(list.map(account => [account.id, account])),
            names: new Map(list.map(account => [account.id, accountLabel(account)])),
            activeIds: active,
        }
    }, [rows])
    // What the screen merges into its one recovery call. A source is cleaned only when it
    // failed itself, so the ready collections keep their rows.
    const recovery: LiveRecovery = query.isError
        ? { queries: [query.collection], sources: [accountsCollection, balancesCollection] }
        : NO_RECOVERY

    return {
        accounts,
        names,
        activeIds,
        optionsFor: (storedId: string) => paidFromOptions(accounts, storedId),
        balanceOf: (id: string) => {
            const row = byId.get(id)
            return row ? transferAccountBalance(row) : undefined
        },
        isReady: query.isReady,
        isError: query.isError,
        recovery,
    }
}
