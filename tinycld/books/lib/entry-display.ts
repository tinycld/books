import type { BooksJournalEntries } from '../types'
import { ENTRY_TYPE_LABELS } from './entry-messages'
import { formatMoney } from './money'
import { DOC_TYPE_LABELS, reversalOrigins } from './register'
import { formatDay } from './register-range'

type EntryStatus = BooksJournalEntries['status']
type EntryOrigin = BooksJournalEntries['origin']

const STATUS_LABELS: Record<EntryStatus, string> = {
    draft: 'Draft',
    posted: 'Posted',
    void: 'Void',
}

// A draft has no number yet; a void entry keeps the number it was posted with.
export function entryNumberText(entry: { number: string; status: string }): string {
    if (entry.number === '' && entry.status === 'draft') return 'Draft'
    return entry.number
}

// The server stamps a draft's total after its lines are written, so a row just created in this
// session has none yet. The list shows a dash until the total arrives, without a warning.
export function entryTotalText(entry: { total?: number }, currency: string): string {
    if (entry.total === undefined) return '\u2014'
    return formatMoney(entry.total, currency)
}

export function entryStatusText(status: EntryStatus): string {
    return STATUS_LABELS[status]
}

// An entry whose doc type DOC_TYPE_LABELS names (a transfer, an invoice's entry) is
// labelled by its doc type; a reversal keeps its doc type but is labelled by its origin.
export function entryTypeText(
    origin: EntryOrigin,
    docType: BooksJournalEntries['doc_type'] = 'journal'
): string {
    const docTypeLabel = Object.hasOwn(DOC_TYPE_LABELS, docType)
        ? DOC_TYPE_LABELS[docType]
        : undefined
    if (docTypeLabel && !reversalOrigins.has(origin)) return docTypeLabel
    // Every document entry has a doc type the table names; this is only a fallback.
    if (origin === 'document') return ENTRY_TYPE_LABELS.manual
    return ENTRY_TYPE_LABELS[origin]
}

export function reversesText(number: string | undefined): string {
    return number ? `Reverses ${number}` : 'Reverses …'
}

// Stamps are stored as UTC "YYYY-MM-DD HH:MM:SS.sssZ"; the reader sees them in local time.
export function formatDateTime(stamp: string): string {
    const when = new Date(stamp.replace(' ', 'T'))
    if (Number.isNaN(when.getTime())) return ''
    return when.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })
}

export function stampText(userName: string | undefined, at: string): string {
    const when = formatDateTime(at)
    if (when === '') return ''
    return userName ? `${userName}, ${when}` : when
}

// The state of an entry's automatic reversal. It mirrors the server's
// pendingAutoReversals (server/auto_reverse.go): only a posted entry with a
// date is reversed; a reversal that is posted or void settles it (a void one
// is a person's void, which the server does not undo by reversing again); a
// draft reversal settles nothing.
export type AutoReversalState = 'none' | 'reversed' | 'canceled' | 'scheduled' | 'overdue'

// The journal list's mark for an overdue reversal.
export const OVERDUE_MARK_TEXT = 'Reversal overdue'

const HOUR_MS = 60 * 60 * 1000
// Time for the sweep to post and for its rows to reach the client.
const SWEEP_GRACE_MS = 5 * 60 * 1000

// The first moment the reversal counts as overdue, in epoch ms, or null for no
// date. The server sweeps at the top of every hour, UTC (autoReverseSchedule,
// server/auto_reverse.go), and posts a reversal whose day has come. So the
// sweep that can post it is the first full hour at or after the later of the
// start of that day and the moment the entry was posted. Before that the
// reversal is still on its way and is not an error.
export function autoReversalOverdueAt(entry: {
    auto_reverse_on: string
    posted_at: string
}): number | null {
    if (!entry.auto_reverse_on) return null
    const dayStart = Date.parse(`${entry.auto_reverse_on}T00:00:00Z`)
    if (Number.isNaN(dayStart)) return null
    const postedAt = new Date(entry.posted_at.replace(' ', 'T')).getTime()
    const due = Number.isNaN(postedAt) ? dayStart : Math.max(dayStart, postedAt)
    return Math.ceil(due / HOUR_MS) * HOUR_MS + SWEEP_GRACE_MS
}

export function autoReversalState(
    entry: { status: string; auto_reverse_on: string; posted_at: string },
    reversals: readonly { status: string }[],
    nowMs: number
): AutoReversalState {
    if (!entry.auto_reverse_on || entry.status !== 'posted') return 'none'
    if (reversals.some(row => row.status === 'posted')) return 'reversed'
    if (reversals.some(row => row.status === 'void')) return 'canceled'
    const overdueAt = autoReversalOverdueAt(entry)
    return overdueAt !== null && nowMs >= overdueAt ? 'overdue' : 'scheduled'
}

// The reversal rows that settle an entry: a posted one is the entry's reversal;
// a void one was posted and then voided.
export function settledReversal<R extends { status: string }>(
    reversals: readonly R[]
): { posted: R | undefined; voided: R | undefined } {
    return {
        posted: reversals.find(row => row.status === 'posted'),
        voided: reversals.find(row => row.status === 'void'),
    }
}

// The value of the entry view's "Auto-reverse on". "Will reverse on" is only
// for a scheduled reversal: it is a promise the other states do not keep.
export function autoReversalText(
    state: AutoReversalState,
    entry: { status: string; auto_reverse_on: string },
    posted: { number: string; date: string } | undefined
): string {
    if (!entry.auto_reverse_on) return 'None'
    const day = formatDay(entry.auto_reverse_on)
    if (state === 'reversed') {
        return posted ? `Reversed on ${formatDay(posted.date)} by ${posted.number}` : 'Reversed'
    }
    if (state === 'canceled') {
        return `Not reversed. The reversal of ${day} was voided, and Books does not reverse this entry again.`
    }
    if (state === 'scheduled') return `Will reverse on ${day}`
    if (state === 'overdue') {
        return `The automatic reversal of ${day} did not post. Reverse or void this entry.`
    }
    if (entry.status === 'draft') return `${day}, after the entry is posted`
    return `${day}. The entry is void, so Books does not reverse it.`
}

// Only a posted reversal is linked: the server ignores a draft, and a void one
// frees the entry to be reversed again by a person.
export function reversedByText(posted: { number: string } | undefined): string | undefined {
    return posted ? `Reversed by ${posted.number}` : undefined
}
