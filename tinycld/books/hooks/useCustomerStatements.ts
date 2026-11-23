import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * One customer's statements for the Statements tab (statements spec §3.7, §4.1 Tab): one
 * live query on `books_statements` where `customer` is the page's customer, newest statement
 * date first, then newest created first. `recovery` is non-empty only when the query failed,
 * for the tab's Retry (`recoverLiveQueries`).
 */
export function useCustomerStatements(customerId: string) {
    const [statementsCollection] = useStore('books_statements')
    const query = useLiveQuery({
        // A blank id would match the rows whose customer is empty: no query runs for it.
        query: q =>
            customerId === ''
                ? null
                : q
                      .from({ statement: statementsCollection })
                      .where(({ statement }) => eq(statement.customer, customerId))
                      .orderBy(({ statement }) => statement.statement_date, 'desc')
                      .orderBy(({ statement }) => statement.created, 'desc')
                      // `created` ties to the millisecond when two statements are stored in one batch;
                      // the server-given `sequence` is unique and follows store order.
                      .orderBy(({ statement }) => statement.sequence, 'desc'),
        queryKey: ['books.customer.statements', customerId],
    })
    const rows = query.data ?? []
    const isError = query.isError
    const isLoading = customerId !== '' && !isError && !query.isReady
    const recovery: LiveRecovery = isError
        ? { queries: [query.collection], sources: [statementsCollection] }
        : NO_RECOVERY
    return { rows, isLoading, isError, recovery }
}
