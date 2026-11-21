import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * One statement for its screen (statements spec §3.8, §4.1 One statement): one live query
 * on `books_statements` with `materialize()` of its customer. `notFound` is a loaded query
 * with no row: the statement does not exist, or the rules hide it from the user.
 * `recovery` is non-empty only when the query failed, for the screen's Retry.
 */
export function useStatementRecord(id: string) {
    const [statementsCollection, customersCollection] = useStore(
        'books_statements',
        'books_customers'
    )
    const query = useLiveQuery({
        query: q =>
            id === ''
                ? null
                : q
                      .from({ statement: statementsCollection })
                      .where(({ statement }) => eq(statement.id, id))
                      .select(({ statement }) => ({
                          ...statement,
                          customerRow: materialize(
                              q
                                  .from({ customer: customersCollection })
                                  .where(({ customer }) => eq(customer.id, statement.customer))
                                  .findOne()
                          ),
                      }))
                      .findOne(),
        queryKey: ['books.statement.record', id],
    })
    const row = query.data ?? null
    const isError = query.isError
    const isLoading = id !== '' && !isError && !query.isReady
    const notFound = !isError && !isLoading && row === null
    const recovery: LiveRecovery = isError
        ? { queries: [query.collection], sources: [statementsCollection, customersCollection] }
        : NO_RECOVERY
    const statement = row === null ? null : withoutCustomerRow(row)
    const customer = row?.customerRow ?? null
    return { statement, customer, isLoading, isError, notFound, recovery }
}

// The statement's own fields, without the materialized customer.
function withoutCustomerRow<T extends { customerRow: unknown }>(row: T): Omit<T, 'customerRow'> {
    const { customerRow: _customerRow, ...statement } = row
    return statement
}
