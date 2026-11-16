import { and, eq, or } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { auditWindowSize, hasMoreAuditPages } from '@tinycld/core/lib/audit-log-page'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useRef, useState } from 'react'
import { isAuditedCollection } from '../lib/audit-fields'
import { type AuditEvent, type AuditLogRow, recordTypeLabel } from '../lib/audit-log'
import { auditRecordHref, auditRecordOpenLabel } from '../lib/audit-record-route'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { historyKey, useHistoryReadFailures } from '../stores/history-reads-store'
import type { BooksAuditLog } from '../types'
import { useBooksSettings } from './useBooksSettings'

export type RecordHistoryHeader = {
    // The record_label of the record's own newest audit row ("Invoice 1001").
    title: string
    // The record type in words ("Invoice").
    typeWords: string
    // The record's screen while it exists and the reader can read it.
    openHref: string | null
    openLabel: string
    // The `created` instant of the record's Deleted row, once its live read has answered
    // with no record; null while it loads or while the record exists.
    deletedOn: string | null
}

const EVENTS: readonly AuditEvent[] = ['added', 'changed', 'posted', 'voided', 'deleted']

function eventOf(value: string): AuditEvent {
    return EVENTS.find(event => event === value) ?? 'changed'
}

// A JSON column's object, or null for a blank or malformed one.
function jsonObject<T>(value: T): T | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
}

// The view row with its event and JSON columns narrowed (the generator types JSON as any).
function historyEvent(row: BooksAuditLog): AuditLogRow {
    return {
        ...row,
        event: eventOf(row.event),
        changes: jsonObject(row.changes),
        snapshot: jsonObject(row.snapshot),
    }
}

// A collection the history reads no live record of (not audited): a store must still be
// named, as hooks run in a fixed order; its query stays disabled.
const NO_RECORD_STORE = 'books_settings'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * A record's history (spec §3 Record history): the audit rows of the record and of its
 * lines, newest first, 50 at a time, live; and its header, from the record's own newest
 * row and its live row.
 */
export function useRecordHistory(collection: string, id: string) {
    const [page, setPage] = useState(1)
    const audited = isAuditedCollection(collection)
    const [auditLog, records] = useStore('books_audit_log', audited ? collection : NO_RECORD_STORE)
    const settings = useBooksSettings()

    // The record's own rows and its lines' (the view names a line's parent).
    const eventsQuery = useLiveQuery({
        query: query =>
            query
                .from({ row: auditLog })
                .where(({ row }) =>
                    or(
                        and(eq(row.record_type, collection), eq(row.record_id, id)),
                        and(eq(row.parent_type, collection), eq(row.parent_id, id))
                    )
                )
                .orderBy(({ row }) => row.created, 'desc')
                .orderBy(({ row }) => row.id, 'desc')
                .limit(auditWindowSize(page)),
        queryKey: ['books.history', collection, id, page],
    })

    // The record's own newest row names it, and is its Deleted row once it is gone (a
    // record's last own event), however many line rows came after it.
    const newestOwnQuery = useLiveQuery({
        query: query =>
            query
                .from({ row: auditLog })
                .where(({ row }) => and(eq(row.record_type, collection), eq(row.record_id, id)))
                .orderBy(({ row }) => row.created, 'desc')
                .orderBy(({ row }) => row.id, 'desc')
                .findOne(),
        queryKey: ['books.history.own', collection, id],
    })

    const recordQuery = useLiveQuery({
        query: query => {
            if (!audited) return undefined
            return query
                .from({ record: records })
                .where(({ record }) => eq(record.id, id))
                .findOne()
        },
        queryKey: ['books.history.record', collection, id],
    })

    // A larger window is a new query, empty until its read lands: until then the events
    // already on screen stay (the last window that was ready for this record).
    const key = historyKey(collection, id)
    const windowEvents = (eventsQuery.data ?? []).map(historyEvent)
    const lastReady = useRef<{ key: string; events: AuditLogRow[] } | null>(null)
    if (eventsQuery.isReady) lastReady.current = { key, events: windowEvents }
    const kept = lastReady.current?.key === key ? lastReady.current.events : null
    const isLoadingMore = !eventsQuery.isReady && kept !== null
    const events = isLoadingMore && kept ? kept : windowEvents
    const eventsReady = eventsQuery.isReady || isLoadingMore

    const newestOwn = newestOwnQuery.data ? historyEvent(newestOwnQuery.data) : undefined
    const live: Record<string, unknown> | undefined = recordQuery.data
    const recordReady = !audited || recordQuery.isReady
    const isGone = recordReady && !live && newestOwn?.event === 'deleted'
    const typeWords = recordTypeLabel(collection)

    const header: RecordHistoryHeader = {
        title: newestOwn?.record_label || typeWords,
        typeWords,
        openHref: recordReady ? auditRecordHref(collection, id, live) : null,
        openLabel: auditRecordOpenLabel(collection, live),
        deletedOn: isGone && newestOwn ? newestOwn.created : null,
    }

    // A value's own read (a relation's name, a line's position) that failed.
    const readFailures = useHistoryReadFailures(key)

    const recovery = mergeRecoveries([
        ...readFailures,
        eventsQuery.isError
            ? { queries: [eventsQuery.collection], sources: [auditLog] }
            : NO_RECOVERY,
        newestOwnQuery.isError
            ? { queries: [newestOwnQuery.collection], sources: [auditLog] }
            : NO_RECOVERY,
        recordQuery.isError && recordQuery.collection
            ? { queries: [recordQuery.collection], sources: [records] }
            : NO_RECOVERY,
        settings.recovery,
    ])
    const isError =
        eventsQuery.isError ||
        newestOwnQuery.isError ||
        recordQuery.isError ||
        settings.hasLoadError
    const isReady = eventsReady && newestOwnQuery.isReady && recordReady && settings.isReady

    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: error => log.error('books.history', error, { collection, id }),
        })
    }

    return {
        events,
        isLoading: !isError && !isReady,
        isError,
        // A value's read failed: the events stay on screen with an error and Retry.
        readsFailed: readFailures.length > 0,
        retry,
        // While the next window loads, Show 50 more stays, pending.
        hasMore: isLoadingMore || hasMoreAuditPages(events.length, page),
        isLoadingMore,
        showMore: () => setPage(current => current + 1),
        header,
        // Where this history's values report a failed read (FieldValue, HistoryEvent).
        historyKey: key,
        // The Books currency: an event's money is in the record's own currency when the
        // event carries one (eventCurrency in lib/audit-fields.ts), else this.
        currency: settings.settings?.currency ?? 'USD',
    }
}
