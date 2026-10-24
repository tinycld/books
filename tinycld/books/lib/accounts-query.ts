import {
    type Collection,
    coalesce,
    eq,
    type InitialQueryBuilder,
    sum,
    type UtilsRecord,
} from '@tanstack/db'
import type { BooksAccountBalances, BooksAccounts } from '../types'

// The balance side is aggregated to one row per account, so the left join
// cannot duplicate an account; an account with no balance rows gets 0 and 0.
// The insert-input parameters are generic because a pbtsdb collection omits server-stamped
// fields on insert while a plain collection does not; the query reads rows only.
export function accountsWithBalances<
    A extends string | number,
    B extends string | number,
    AI extends object,
    BI extends object,
>(
    accounts: Collection<BooksAccounts, A, UtilsRecord, never, AI>,
    balances: Collection<BooksAccountBalances, B, UtilsRecord, never, BI>
) {
    return (query: InitialQueryBuilder) => {
        const totals = query
            .from({ balance: balances })
            .groupBy(({ balance }) => balance.account)
            .select(({ balance }) => ({
                account: balance.account,
                debit_total: sum(balance.debit_total),
                credit_total: sum(balance.credit_total),
            }))
        return query
            .from({ account: accounts })
            .leftJoin({ total: totals }, ({ account, total }) => eq(account.id, total.account))
            .select(({ account, total }) => ({
                id: account.id,
                name: account.name,
                number: account.number,
                type: account.type,
                parent: account.parent,
                inactive: account.inactive,
                description: account.description,
                detail_type: account.detail_type,
                currency: account.currency,
                debit_total: coalesce(total?.debit_total, 0),
                credit_total: coalesce(total?.credit_total, 0),
            }))
    }
}
