import { and, eq, lte, or } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'
import type { BooksReconciliations } from '../types'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * The work screen's one lines query (reconcile spec §4 "Reads", key
 * `books.reconcile.lines`): the account's rows of the view books_reconcile_lines dated on or
 * before the statement date that no other reconciliation holds, in date, number and id
 * order, each with its books_reconciliation_lines row through `materialize()` (by `line`),
 * which is what says "cleared" and follows an optimistic press at once. Not paged: the sums
 * need every row. It does not run before the reconciliation is loaded (`reconciliation`
 * undefined) nor for a finished one, whose band reads the stamped sums.
 */
export function useReconcileLines(
    reconciliation:
        | Pick<BooksReconciliations, 'id' | 'account' | 'statement_date' | 'status'>
        | undefined
) {
    const [linesCollection, clearedCollection] = useStore(
        'books_reconcile_lines',
        'books_reconciliation_lines'
    )
    const isEnabled = reconciliation !== undefined && reconciliation.status === 'in_progress'
    const id = reconciliation?.id ?? ''
    const account = reconciliation?.account ?? ''
    const statementDate = reconciliation?.statement_date ?? ''
    const query = useLiveQuery({
        query: q => {
            if (!isEnabled) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) =>
                    and(
                        eq(line.account, account),
                        lte(line.date, statementDate),
                        or(eq(line.reconciliation, ''), eq(line.reconciliation, id))
                    )
                )
                .orderBy(({ line }) => line.date)
                .orderBy(({ line }) => line.number)
                .orderBy(({ line }) => line.id)
                .select(({ line }) => ({
                    ...line,
                    cleared: materialize(
                        q
                            .from({ c: clearedCollection })
                            .where(({ c }) => eq(c.line, line.id))
                            .select(({ c }) => ({ id: c.id }))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.reconcile.lines', id, account, statementDate, isEnabled],
    })
    const rows = useMemo(
        () =>
            (query.data ?? []).map(row => ({
                ...row,
                isCleared: row.cleared !== undefined,
                clearedId: row.cleared?.id ?? '',
            })),
        [query.data]
    )
    const isError = isEnabled && query.isError
    const recovery: LiveRecovery = isError
        ? { queries: [query.collection], sources: [linesCollection, clearedCollection] }
        : NO_RECOVERY
    return {
        rows,
        isLoading: isEnabled && !query.isReady && !query.isError,
        isError,
        recovery,
    }
}

export type ReconcileLineRow = ReturnType<typeof useReconcileLines>['rows'][number]
