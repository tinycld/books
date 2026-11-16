import { type ReportPanelProps, usePanelTitle } from '@tinycld/core/reports/hooks/usePanelTitle'
import { HistoryEmpty, RecordHistory } from './RecordHistory'

// A path that is not books/history/<collection>/<id> names no record: the empty state,
// under a header that still says what the panel is.
function MalformedPath() {
    usePanelTitle('Record history')
    return <HistoryEmpty />
}

/**
 * A record's history in core's side panel beside a report (manifest `reportPanels`,
 * core D5). Core passes the row's `open` after `books/history/`: `[collection, id]`.
 */
export default function RecordHistoryPanel({ segments }: ReportPanelProps) {
    if (segments.length !== 2) return <MalformedPath />
    const [collection, id] = segments
    // Another row replaces the history, so its page count must start afresh. Core's
    // RecordBoundary (key={open}) already remounts the panel per record; this key is a
    // safeguard beside that remount, so the reset does not hang on core's markup.
    const recordKey = `${collection}/${id}`
    return <RecordHistory key={recordKey} collection={collection} id={id} surface="panel" />
}
