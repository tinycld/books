import { like } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useMemo } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'
import { REPORT_GROUPS, reportGroup } from '../lib/report-groups'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// A report's source key starts with its package's slug and a dot.
const BOOKS_SOURCES = 'books.%'

// Every `reports` row of a Books source that core's rules let the reader see.
function useBooksReportsQuery() {
    const [reportsCollection] = useStore('reports')
    const query = useLiveQuery({
        query: q =>
            q
                .from({ report: reportsCollection })
                .where(({ report }) => like(report.source, BOOKS_SOURCES))
                .select(({ report }) => ({
                    id: report.id,
                    title: report.title,
                    shippedKey: report.shipped_key,
                })),
        queryKey: ['books', 'reports'],
    })
    return { reportsCollection, query }
}

// The selected fields of a row, without the `$` keys pbtsdb adds to it.
type ReportRow = Pick<
    NonNullable<ReturnType<typeof useBooksReportsQuery>['query']['data']>[number],
    'id' | 'title' | 'shippedKey'
>

// The reports in the order of their groups (lib/report-groups.ts): the shipped ones first,
// then the saved ones; each group by title.
export function sortBooksReports(rows: readonly ReportRow[]) {
    // Named fields, not a spread: a live query row also carries pbtsdb's own `$` keys.
    return rows
        .map(row => ({
            id: row.id,
            title: row.title,
            shippedKey: row.shippedKey,
            isShipped: row.shippedKey !== '',
            group: reportGroup(row.shippedKey),
        }))
        .sort(
            (a, b) =>
                REPORT_GROUPS.indexOf(a.group) - REPORT_GROUPS.indexOf(b.group) ||
                a.title.localeCompare(b.title) ||
                a.id.localeCompare(b.id)
        )
}

/**
 * Every Books report the reader can open: the shipped ones, the reader's own, and the ones
 * shared with the reader or published (core's rules on `reports` decide). `reports` is
 * empty until the read is ready and when it failed; a failed read returns `isError` and the
 * `recovery` for recoverLiveQueries.
 */
export function useBooksReports() {
    const {
        reportsCollection,
        query: { data, isReady, isError, collection: query },
    } = useBooksReportsQuery()
    const reports = useMemo(() => sortBooksReports(isError ? [] : (data ?? [])), [data, isError])
    const recovery: LiveRecovery =
        isError && query ? { queries: [query], sources: [reportsCollection] } : NO_RECOVERY
    return { reports, isReady, isError, recovery }
}

export type BooksReport = ReturnType<typeof useBooksReports>['reports'][number]
