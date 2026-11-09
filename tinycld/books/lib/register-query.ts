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
    BooksCustomers,
    BooksJournalEntries,
    BooksJournalLines,
    BooksVendors,
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

export type RegisterParties<CI extends object, VI extends object> = {
    customers: Rows<BooksCustomers, CI>
    vendors: Rows<BooksVendors, VI>
}

// The entry comes through materialize, so the lines side always drives the query
// and a missing entry cannot drop a line. Each entry line materializes its customer's
// and vendor's display name (the entry drawer's Name).
export function registerLinesQuery<
    LI extends object,
    EI extends object,
    CI extends object,
    VI extends object,
>(
    lines: Rows<BooksJournalLines, LI>,
    entries: Rows<BooksJournalEntries, EI>,
    accountId: string,
    range: RegisterRange,
    parties: RegisterParties<CI, VI>
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
                    query
                        .from({ l: lines })
                        .where(({ l }) => eq(l.entry, line.entry))
                        .select(({ l }) => ({
                            ...l,
                            customerRow: materialize(
                                query
                                    .from({ c: parties.customers })
                                    .where(({ c }) => eq(c.id, l.customer))
                                    .select(({ c }) => ({ display_name: c.display_name }))
                                    .findOne()
                            ),
                            vendorRow: materialize(
                                query
                                    .from({ v: parties.vendors })
                                    .where(({ v }) => eq(v.id, l.vendor))
                                    .select(({ v }) => ({ display_name: v.display_name }))
                                    .findOne()
                            ),
                        }))
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
