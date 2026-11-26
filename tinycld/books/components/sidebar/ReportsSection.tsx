import { useBooksReportList } from '../../hooks/useBooksReportList'
import { useBooksUIStore } from '../../stores/books-ui-store'
import { BooksReportList } from '../reports/BooksReportList'
import { FoldHeading } from './FoldHeading'

// The Reports section of the Books sidebar: every Books report the reader can open, the
// shipped ones first, each on the Books report route. Folded until the user opens it (the
// state is kept): Books ships more reports than the sidebar has room for.
export function ReportsSection() {
    const list = useBooksReportList()
    const isOpen = useBooksUIStore(s => s.isReportsOpen)
    const toggle = useBooksUIStore(s => s.toggleReports)

    return (
        <>
            <FoldHeading
                title="Reports"
                isOpen={isOpen}
                onToggle={toggle}
                testID="books-sidebar-reports-toggle"
            />
            <BooksReportList
                isVisible={isOpen}
                scope="sidebar"
                reports={list.reports}
                isLoading={list.isLoading}
                isError={list.isError}
                onRetry={list.retry}
            />
        </>
    )
}
