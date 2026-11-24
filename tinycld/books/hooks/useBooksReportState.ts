import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { type BooksReportState, booksReportState } from '../lib/books-report-route'

/**
 * What the Books report route draws for this report id (`booksReportState`). It reads the
 * one row, not the list of Books reports: the answer must not change when that list
 * reloads or fails. Core's `useReportRecord` filters the same `id`, but this query has its
 * own key and select, so it may load that subset once more.
 */
export function useBooksReportState(reportId: string): BooksReportState {
    const [reportsCollection] = useStore('reports')
    const { data } = useLiveQuery({
        query: q =>
            q
                .from({ report: reportsCollection })
                .where(({ report }) => eq(report.id, reportId))
                .select(({ report }) => ({ source: report.source }))
                .findOne(),
        queryKey: ['books', 'report-source', reportId],
    })
    return booksReportState(data)
}
