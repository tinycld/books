import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useBooksReports } from './useBooksReports'

/**
 * The Books reports the reader can open, with the states a list of them draws. The Reports
 * section of the sidebar and the Books reports screen each call it: each is its own read,
 * so each has its own error and its own Retry.
 */
export function useBooksReportList() {
    const { reports, isReady, isError, recovery } = useBooksReports()
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.reports.list', err),
        })
    }
    return { reports, isLoading: !isReady && !isError, isError, retry }
}
