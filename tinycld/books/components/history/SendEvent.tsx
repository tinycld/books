import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useId } from 'react'
import { Text, View } from 'react-native'
import { eventWords, snapshotFieldRows } from '../../lib/audit-fields'
import type { AuditLogRow } from '../../lib/audit-log'
import { useReportHistoryRead } from '../../stores/history-reads-store'
import { FieldChanges } from './FieldChanges'

const SENDS = 'books_document_sends'
const TITLE_CLASS = 'text-sm font-semibold text-foreground'

// The send row of a history event, by the event's `record_id`.
function useSendRow(recordId: string) {
    const [sends] = useStore(SENDS)
    const read = useLiveQuery({
        query: query =>
            query
                .from({ send: sends })
                .where(({ send }) => eq(send.id, recordId))
                .findOne(),
        queryKey: ['books.history.send', recordId],
    })
    return { ...read, sends }
}

type SendRow = NonNullable<ReturnType<typeof useSendRow>['data']>

// What the event shows of a send: the address of its title, and its Subject and its
// Message as text (email-share spec §3.6; the audit field map labels them).
type SentView = Pick<SendRow, 'to' | 'subject' | 'body_text'>

function textOf(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

// A send that is gone (its document deleted) has only its delete snapshot, whose values
// are untyped JSON.
function sentViewOf(live: SendRow | undefined, snapshot: AuditLogRow['snapshot']): SentView | null {
    if (live) return { to: live.to, subject: live.subject, body_text: live.body_text }
    if (!snapshot) return null
    return {
        to: textOf(snapshot.to),
        subject: textOf(snapshot.subject),
        body_text: textOf(snapshot.body_text),
    }
}

// "Sent to <to>" names the send itself; any other event (a delete) has its own words.
function titleOf(row: AuditLogRow, sent: SentView | null): string {
    if (row.event === 'added' && sent && sent.to !== '') return `Sent to ${sent.to}`
    return eventWords(row.event, row.record_type)
}

interface SendEventProps {
    row: AuditLogRow
    // The event's date and user, drawn at the right of the title.
    meta: string
    // The history this event is shown in (historyKey): a failed read reports to it.
    history: string
    currency: string
}

function SentFields({
    sent,
    history,
    currency,
}: {
    sent: SentView | null
    history: string
    currency: string
}) {
    if (!sent) return null
    const rows = snapshotFieldRows(SENDS, { subject: sent.subject, body_text: sent.body_text })
    return <FieldChanges rows={rows} isSnapshot currency={currency} history={history} />
}

/**
 * The event of a `books_document_sends` row in its document's Audit history (plan decision
 * 2): core writes no values on a created audit row, so the event reads the send row itself
 * (its own live query by `record_id`) for the title "Sent to <address>" and its Subject and
 * Message (`body_text`), drawn as a snapshot by FieldChanges. A send that is gone (its
 * estimate deleted) reads its delete snapshot, and its title is the event's words. While
 * the row loads the title is "Sent"; a failed read keeps that title and reports to the
 * history, whose Retry recovers it.
 */
export function SendEvent({ row, meta, history, currency }: SendEventProps) {
    const { data, isError, collection, sends } = useSendRow(row.record_id)
    const read = useId()
    const failed = isError && collection ? { query: collection, source: sends } : null
    useReportHistoryRead(history, read, failed)
    const sent = sentViewOf(data, row.snapshot)
    const title = titleOf(row, sent)
    return (
        <>
            <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Text className={TITLE_CLASS}>{title}</Text>
                <Text className="text-xs text-muted-foreground">{meta}</Text>
            </View>
            <SentFields sent={sent} history={history} currency={currency} />
        </>
    )
}
