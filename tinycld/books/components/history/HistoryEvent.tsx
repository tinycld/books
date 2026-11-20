import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { dateTimeText } from '@tinycld/core/reports/lib/date-time'
import { useId } from 'react'
import { Text, View } from 'react-native'
import {
    changedFieldRows,
    eventCurrency,
    eventWords,
    isAuditedCollection,
    isLineEvent,
    lineEventTitle,
    snapshotFieldRows,
} from '../../lib/audit-fields'
import type { AuditLogRow } from '../../lib/audit-log'
import { useReportHistoryRead } from '../../stores/history-reads-store'
import { FieldChanges } from './FieldChanges'

const TITLE_CLASS = 'text-sm font-semibold text-foreground'

// A store must be named on every render; a line of a collection that is not audited
// keeps its query disabled.
const NO_LINE_STORE = 'books_settings'

interface RowProps {
    row: AuditLogRow
    // The history this event is shown in (historyKey): a failed read reports to it.
    history: string
}

// A line event's title, "Line 2 — Changed": the line's position from its live row (its
// own live query), else the snapshot's, else the record label. A failed read keeps that
// fallback and reports to the history, whose Retry recovers it.
function LineEventTitle({ row, history }: RowProps) {
    const lineType = row.record_type
    const audited = isAuditedCollection(lineType)
    const [lines] = useStore(audited ? lineType : NO_LINE_STORE)
    const read = useId()
    const { data, isError, collection } = useLiveQuery({
        query: query => {
            if (!audited) return undefined
            return query
                .from({ line: lines })
                .where(({ line }) => eq(line.id, row.record_id))
                .findOne()
        },
        queryKey: ['books.history.line', lineType, row.record_id],
    })
    const failed = isError && collection ? { query: collection, source: lines } : null
    useReportHistoryRead(history, read, failed)
    const live: Record<string, unknown> | undefined = data
    const position = typeof live?.position === 'number' ? live.position : undefined
    const title = lineEventTitle(row, position)
    return <Text className={TITLE_CLASS}>{title}</Text>
}

function EventTitle({ row, collection, history }: RowProps & { collection: string }) {
    if (isLineEvent(row, collection)) return <LineEventTitle row={row} history={history} />
    const title = eventWords(row.event, row.record_type)
    return <Text className={TITLE_CLASS}>{title}</Text>
}

function EventBody({ row, currency, history }: RowProps & { currency: string }) {
    if (row.event === 'added') {
        return <Text className="text-sm text-muted-foreground">{`Added ${row.record_label}`}</Text>
    }
    const isSnapshot = row.event === 'deleted'
    const rows = isSnapshot
        ? snapshotFieldRows(row.record_type, row.snapshot)
        : changedFieldRows(row.record_type, row.changes)
    return (
        <FieldChanges rows={rows} isSnapshot={isSnapshot} currency={currency} history={history} />
    )
}

interface HistoryEventProps extends RowProps {
    // The collection whose history is shown: a row of another type is one of its lines.
    collection: string
    // The Books currency; an event that carries the record's own currency uses that.
    booksCurrency: string
}

/** One event of a record's history: date, user, event, then its fields or "Added …". */
export function HistoryEvent({ row, collection, booksCurrency, history }: HistoryEventProps) {
    const meta = `${dateTimeText(row.created)} · ${row.actor_name}`
    const currency = eventCurrency(row, booksCurrency)
    return (
        <View
            testID={`history-event-${row.id}`}
            className="gap-2 rounded-lg border border-border bg-card p-3"
        >
            <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <EventTitle row={row} collection={collection} history={history} />
                <Text className="text-xs text-muted-foreground">{meta}</Text>
            </View>
            <EventBody row={row} currency={currency} history={history} />
        </View>
    )
}
