import type { BooksJournalEntries } from '../types'
import { ENTRY_TYPE_LABELS } from './entry-messages'
import { formatMoney } from './money'
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

export function entryTypeText(origin: EntryOrigin): string {
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

interface ReversalRow {
    id: string
    number: string
    status: string
    date: string
}

// Only a posted reversal counts: the server ignores a draft, and a void one frees the entry to be reversed again.
export function reversalSummary(reversedBy: ReversalRow | undefined, autoReverseOn: string) {
    const posted = reversedBy?.status === 'posted' ? reversedBy : undefined
    const linkText = posted ? `Reversed by ${posted.number}` : undefined
    let autoReverseText: string | undefined
    if (autoReverseOn) {
        autoReverseText = posted
            ? `Reversed on ${formatDay(posted.date)} by ${posted.number}`
            : `Will reverse on ${formatDay(autoReverseOn)}`
    }
    return { linkText, autoReverseText }
}
