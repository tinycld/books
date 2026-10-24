import type { BooksJournalEntries } from '../types'
import { ENTRY_TYPE_LABELS } from './entry-messages'

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
    if (at === '') return ''
    const when = formatDateTime(at)
    return userName ? `${userName}, ${when}` : when
}
