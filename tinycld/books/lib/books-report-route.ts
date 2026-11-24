// Books draws core's report view on its own routes, so a person who reads a Books report
// stays in Books, with the Books sidebar. Core's view takes the base route and builds its
// drill, Back and Save as links under it.

// The base route core's report view gets (`basePath`), without the org prefix. Back with
// no history opens it, so Books owns this route too: the Books reports screen
// (screens/reports/index.tsx).
export const BOOKS_REPORT_BASE = 'books/reports'

// One report: `orgHref(BOOKS_REPORT_ROUTE, { id })`.
export const BOOKS_REPORT_ROUTE = 'books/reports/[id]'

// Core's Reports hub, and the params that make it list only the Books reports:
// `orgHref(REPORTS_HUB_ROUTE, BOOKS_HUB_PARAMS)`.
export const REPORTS_HUB_ROUTE = 'reports'
export const BOOKS_HUB_PARAMS: Record<string, string> = { package: 'books' }

// A report's source key starts with its package's slug and a dot.
const BOOKS_SOURCE_PREFIX = 'books.'

// `report`: draw core's report view. `foreign`: the report belongs to another package.
export type BooksReportState = 'report' | 'foreign'

// What the Books report route draws for the `reports` row of its id. Only a row that is
// loaded and names another package's source is foreign. No row (still loading, a failed
// read, no access, a deleted report) is `report`: core's view has its own frames for those,
// and the route must never take the view away while a person edits the report in it.
export function booksReportState(row: { source: string } | undefined): BooksReportState {
    if (row && !row.source.startsWith(BOOKS_SOURCE_PREFIX)) return 'foreign'
    return 'report'
}
