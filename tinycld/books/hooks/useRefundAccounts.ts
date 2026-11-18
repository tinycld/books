import { coalesce, eq, or, sum } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useMemo } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'
import type { RefundAccountRow } from '../lib/refund-accounts'
import { transferAccountBalance } from '../lib/transfer'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * The accounts a vendor refund's Refunded to may name (vendor refund spec §3.3, Q3): every
 * bank and credit card account and every Undeposited funds account
 * (lib/refund-accounts.ts keeps the active ones in chart order), each with its posted
 * totals, so the field shows the picked account's balance from the same read. Inactive
 * rows stay, so a stored account that became inactive is still named. One query key, so
 * the screen's read and the field's are one set of rows; a failed read joins the screen's
 * merged recovery.
 */
export function useRefundAccounts(): {
    rows: RefundAccountRow[]
    // The account's own posted balance (null: not exact); undefined for an id not listed.
    balanceOf: (id: string) => number | null | undefined
    isReady: boolean
    isError: boolean
    recovery: LiveRecovery
} {
    const [accountsCollection, balancesCollection] = useStore(
        'books_accounts',
        'books_account_balances'
    )
    const query = useLiveQuery({
        query: q => {
            // One row per account, so the left join cannot duplicate an account.
            const totals = q
                .from({ balance: balancesCollection })
                .groupBy(({ balance }) => balance.account)
                .select(({ balance }) => ({
                    account: balance.account,
                    debit_total: sum(balance.debit_total),
                    credit_total: sum(balance.credit_total),
                }))
            return q
                .from({ account: accountsCollection })
                .where(({ account }) =>
                    or(
                        eq(account.type, 'bank'),
                        eq(account.type, 'credit_card'),
                        eq(account.detail_type, 'undeposited_funds')
                    )
                )
                .leftJoin({ total: totals }, ({ account, total }) => eq(account.id, total.account))
                .select(({ account, total }) => ({
                    id: account.id,
                    number: account.number,
                    name: account.name,
                    type: account.type,
                    detail_type: account.detail_type,
                    parent: account.parent,
                    inactive: account.inactive,
                    debit_total: coalesce(total?.debit_total, 0),
                    credit_total: coalesce(total?.credit_total, 0),
                }))
        },
        queryKey: ['books.form.refundAccounts'],
    })
    const data = query.data
    const byId = useMemo(() => new Map((data ?? []).map(row => [row.id, row])), [data])
    // Non-empty only when the read failed, so one Retry recovers exactly that read.
    const recovery: LiveRecovery = query.isError
        ? { queries: [query.collection], sources: [accountsCollection, balancesCollection] }
        : NO_RECOVERY
    return {
        rows: data ?? [],
        balanceOf: id => {
            const row = byId.get(id)
            return row ? transferAccountBalance(row) : undefined
        },
        isReady: query.isReady,
        isError: query.isError,
        recovery,
    }
}
