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
