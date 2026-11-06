import {
    type Collection,
    coalesce,
    count,
    eq,
    type InitialQueryBuilder,
    max,
    sum,
    type UtilsRecord,
} from '@tanstack/db'
import type {
    BooksAccountBalances,
    BooksAccounts,
    BooksBankConnections,
    BooksBankFiles,
} from '../types'
import { compareNumbers, compareText } from './account-tree'

// One row per connection. The balance side and the waiting-files side are each
// aggregated to one row per account / connection, so neither left join can duplicate a
// connection; a connection with no balance rows gets 0 and 0, and one with no waiting
// file gets a count of 0. The account is an inner join, not materialize(), because the
// strip sorts by the account. The strip is in chart order, the order of
// compareNumberThenName then compareId (lib/account-tree.ts), so the sort keys reuse its
// compares instead of the default string sort, which would put a number-less account
// first and '10500' before '900': number-less last (false sorts before true), numbers
// numerically, names without case, then id by code unit. The key and insert-input type parameters follow
// accountsWithBalances (lib/accounts-query.ts): a pbtsdb collection omits server-stamped
// fields on insert, a plain collection does not; the query reads rows only.
export function bankConnectionsQuery<
    CK extends string | number,
    AK extends string | number,
    BK extends string | number,
    FK extends string | number,
    CI extends object,
    AI extends object,
    BI extends object,
    FI extends object,
>(
    connections: Collection<BooksBankConnections, CK, UtilsRecord, never, CI>,
    accounts: Collection<BooksAccounts, AK, UtilsRecord, never, AI>,
    balances: Collection<BooksAccountBalances, BK, UtilsRecord, never, BI>,
    files: Collection<BooksBankFiles, FK, UtilsRecord, never, FI>
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
        const waiting = query
            .from({ file: files })
            .where(({ file }) => eq(file.status, 'uploaded'))
            .groupBy(({ file }) => file.connection)
            .select(({ file }) => ({
                connection: file.connection,
                count: count(file.id),
                last: max(file.created),
            }))
        return query
            .from({ connection: connections })
            .innerJoin({ account: accounts }, ({ connection, account }) =>
                eq(connection.account, account.id)
            )
            .leftJoin({ total: totals }, ({ account, total }) => eq(account.id, total.account))
            .leftJoin({ files: waiting }, ({ connection, files }) =>
                eq(connection.id, files.connection)
            )
            .orderBy(({ account }) => eq(account.number, ''))
            .orderBy(({ account }) => account.number, {
                stringSort: 'custom',
                compare: compareNumbers,
            })
            .orderBy(({ account }) => account.name, { stringSort: 'custom', compare: compareText })
            .orderBy(({ account }) => account.id, { stringSort: 'lexical' })
            .select(({ connection, account, total, files }) => ({
                id: connection.id,
                account: connection.account,
                accountName: account.name,
                accountNumber: account.number,
                accountType: account.type,
                institution: connection.institution,
                accountMask: connection.account_mask,
                debitTotal: coalesce(total?.debit_total, 0),
                creditTotal: coalesce(total?.credit_total, 0),
                waitingCount: coalesce(files?.count, 0),
                lastUploadAt: files?.last,
            }))
    }
}
