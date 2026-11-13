import { statusBadgeOf } from '../../lib/document-lifecycle'
import type { BooksJournalEntries } from '../../types'
import { StatusBadge } from '../StatusBadge'

type Status = BooksJournalEntries['status']

// An entry's status: the posting lifecycle's words and tones (Draft muted, Posted
// success, Void destructive).
export function EntryStatusBadge({ entryId, status }: { entryId?: string; status: Status }) {
    const badge = statusBadgeOf('posting', status)
    if (!badge) return null
    const testID = entryId ? `entries-status-${entryId}` : undefined
    return <StatusBadge label={badge.label} tone={badge.tone} testID={testID} />
}
