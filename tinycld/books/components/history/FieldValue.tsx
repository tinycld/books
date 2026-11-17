import { eq, inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useId } from 'react'
import { Text, View } from 'react-native'
import {
    type AuditedCollection,
    type AuditField,
    fieldValueText,
    isAuditedCollection,
    REMOVED_TEXT,
} from '../../lib/audit-fields'
import { recordTypeLabel } from '../../lib/audit-log'
import { useReportHistoryRead } from '../../stores/history-reads-store'

const VALUE_CLASS = 'text-sm text-foreground'

// Collections whose records are named by their type and number ("Invoice 1001").
const NUMBERED = new Set([
    'books_invoices',
    'books_sales_receipts',
    'books_credit_memos',
    'books_estimates',
    'books_bills',
    'books_expenses',
    'books_journal_entries',
])

function textField(row: Record<string, unknown>, key: string): string {
    const value = row[key]
    return typeof value === 'string' ? value.trim() : ''
}

// A related record's current name, as the Books screens name it: an account "<number>
// <name>", a document or entry its type and number, a person or party its name.
function relatedRecordName(target: string, row: Record<string, unknown>): string {
    const name = textField(row, 'name')
    const number = textField(row, 'number')
    if (target === 'books_accounts') return number ? `${number} ${name}` : name
    if (NUMBERED.has(target)) {
        return number ? `${recordTypeLabel(target)} ${number}` : recordTypeLabel(target)
    }
    const named =
        textField(row, 'display_name') ||
        name ||
        textField(row, 'institution') ||
        textField(row, 'reason')
    return named || recordTypeLabel(target)
}

function relationIds(value: unknown): string[] {
    const list = Array.isArray(value) ? value : [value]
    return list.filter((item): item is string => typeof item === 'string' && item !== '')
}

// A relation target the history can read: an audited Books collection or core's users.
type RelationTarget = AuditedCollection | 'users'

function isReadableTarget(target: string | undefined): target is RelationTarget {
    return target === 'users' || (target !== undefined && isAuditedCollection(target))
}

// A store must be named on every render (hooks run in a fixed order); a value with no
// readable target keeps its query disabled.
const NO_TARGET_STORE = 'books_settings'

// The stored ids in their stored order, each by its record's current name, or "Removed
// record" for one the read did not return (gone, or not readable).
function relationNames(target: string, ids: readonly string[], rows: Record<string, unknown>[]) {
    return ids
        .map(id => {
            const row = rows.find(record => record.id === id)
            return row ? relatedRecordName(target, row) : REMOVED_TEXT
        })
        .join(', ')
}

interface FieldValueProps {
    field: AuditField
    value: unknown
    currency: string
    // The history this value is shown in (historyKey): a failed read reports to it.
    history: string
}

// A relation's value: its target's current name, read through its own live query, or
// "Removed record" once the read answers with no row (gone, or not readable) or fails. A
// failed read is reported to the history, whose Retry recovers it.
function RelationValue({ field, value, currency, history }: FieldValueProps) {
    const target = field.target
    const readable = isReadableTarget(target)
    const ids = relationIds(value)
    const [records] = useStore(readable && target ? target : NO_TARGET_STORE)
    const read = useId()
    const { data, isReady, isError, collection } = useLiveQuery({
        query: query => {
            if (!readable || ids.length === 0) return undefined
            const [only] = ids
            if (ids.length === 1 && only) {
                return query.from({ record: records }).where(({ record }) => eq(record.id, only))
            }
            return query.from({ record: records }).where(({ record }) => inArray(record.id, ids))
        },
        queryKey: ['books.history.relation', target ?? '', ...ids],
    })
    const failed = isError && collection ? { query: collection, source: records } : null
    useReportHistoryRead(history, read, failed)
    const rows: Record<string, unknown>[] = data ?? []
    const isLoading = readable && ids.length > 0 && !isReady && !isError
    if (isLoading) return <View className="h-4 w-24 rounded bg-muted" />
    const relationName = readable && !isError ? relationNames(target, ids, rows) : null
    const text = fieldValueText(field, value, { currency, relationName })
    return <Text className={VALUE_CLASS}>{text}</Text>
}

/** One value of an event's table in words (spec §3 Events). */
export function FieldValue({ field, value, currency, history }: FieldValueProps) {
    const isRelation = field.kind === 'relation' && relationIds(value).length > 0
    if (isRelation) {
        return <RelationValue field={field} value={value} currency={currency} history={history} />
    }
    const text = fieldValueText(field, value, { currency })
    return <Text className={VALUE_CLASS}>{text}</Text>
}
