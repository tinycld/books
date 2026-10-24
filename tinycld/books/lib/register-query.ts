import {
    and,
    type Collection,
    eq,
    gte,
    type InitialQueryBuilder,
    inArray,
    lt,
    lte,
    sum,
    type UtilsRecord,
} from '@tanstack/db'
import { materialize } from 'pbtsdb'
import type {
    BooksAccountBalances,
    BooksAccounts,
    BooksJournalEntries,
    BooksJournalLines,
} from '../types'
import { monthStartOf, periodOf, type RegisterRange } from './register-range'

// The insert-input parameters are generic because a pbtsdb collection omits server-stamped
// fields on insert while a plain collection does not; the queries read rows only.
type Rows<T extends object, I extends object> = Collection<
    T,
    string | number,
    UtilsRecord,
    never,
    I
>

// The entry comes through materialize, so the lines side always drives the query
// and a missing entry cannot drop a line.
export function registerLinesQuery<LI extends object, EI extends object>(
    lines: Rows<BooksJournalLines, LI>,
    entries: Rows<BooksJournalEntries, EI>,
    accountId: string,
    range: RegisterRange
) {
    return (query: InitialQueryBuilder) =>
        query
            .from({ line: lines })
            .where(({ line }) =>
                and(
                    eq(line.account, accountId),
                    eq(line.posted, true),
                    gte(line.date, monthStartOf(range.start)),
                    lte(line.date, range.end)
                )
            )
            .select(({ line }) => ({
                ...line,
                entryRecord: materialize(
                    query
                        .from({ e: entries })
                        .where(({ e }) => eq(e.id, line.entry))
                        .findOne()
                ),
                entryLines: materialize(
                    query.from({ l: lines }).where(({ l }) => eq(l.entry, line.entry))
                ),
            }))
}

export function openingTotalsQuery<BI extends object>(
    balances: Rows<BooksAccountBalances, BI>,
    accountId: string,
    range: RegisterRange
) {
    return (query: InitialQueryBuilder) =>
        query
            .from({ balance: balances })
            .where(({ balance }) =>
                and(eq(balance.account, accountId), lt(balance.period, periodOf(range.start)))
            )
            .groupBy(({ balance }) => balance.account)
            .select(({ balance }) => ({
                account: balance.account,
                debit_total: sum(balance.debit_total),
                credit_total: sum(balance.credit_total),
            }))
}

export function reversalOriginsQuery<EI extends object>(
    entries: Rows<BooksJournalEntries, EI>,
    ids: readonly string[]
) {
    return (query: InitialQueryBuilder) =>
        query
            .from({ e: entries })
            .where(({ e }) => inArray(e.id, [...ids]))
            .select(({ e }) => ({ id: e.id, number: e.number }))
}

export function subAccountQuery<AI extends object>(
    accounts: Rows<BooksAccounts, AI>,
    accountId: string
) {
    return (query: InitialQueryBuilder) =>
        query
            .from({ account: accounts })
            .where(({ account }) => eq(account.parent, accountId))
            .orderBy(({ account }) => account.id)
            .select(({ account }) => ({ id: account.id }))
            .limit(1)
}

export function anyActivityQuery<BI extends object>(
    balances: Rows<BooksAccountBalances, BI>,
    accountId: string
) {
    return (query: InitialQueryBuilder) =>
        query
            .from({ balance: balances })
            .where(({ balance }) => eq(balance.account, accountId))
            .orderBy(({ balance }) => balance.id)
            .select(({ balance }) => ({ account: balance.account }))
            .limit(1)
}
