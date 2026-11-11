import type { BooksJournalEntries } from '../types'
import type { BooksAccessState } from './access'

export type EntryActionId = 'open' | 'edit' | 'reverse' | 'void' | 'delete'

// isReversed means a POSTED reversal exists (reversalSummary's linkText); the server ignores draft and void ones.
type EntryActionState = Pick<BooksJournalEntries, 'status' | 'origin' | 'doc_type'> & {
    isReversed: boolean
}

export function entryActions(
    entry: EntryActionState,
    access: Pick<BooksAccessState, 'canWrite'>
): EntryActionId[] {
    const actions: EntryActionId[] = ['open']
    if (!access.canWrite) return actions
    if (entry.status === 'draft') return [...actions, 'delete']
    // The server refuses to edit, reverse or void a void reversal.
    if (entry.status !== 'posted' || entry.origin === 'void_reversal') return actions
    // A correction must keep the original's origin (server/reversal.go), and the journal
    // entry form writes only manual entries, so the server refuses every edit of a
    // reversal.
    if (entry.origin !== 'reversal' && entry.origin !== 'auto_reversal') actions.push('edit')
    // A transfer is corrected by Edit or Void, never by a one-click reversal; a document's
    // entry (an invoice's) is changed only from its document, whose Edit and Void these
    // open (entryEditHref, entryHref).
    const canReverse = entry.doc_type !== 'transfer' && entry.origin !== 'document'
    if (!entry.isReversed && canReverse) actions.push('reverse')
    actions.push('void')
    return actions
}

// A document's entry is voided from its document: its Void opens the document
// (entryHref), never the entry's void dialog, which the server would refuse.
export function voidsFromDocument(entry: Pick<BooksJournalEntries, 'origin'>): boolean {
    return entry.origin === 'document'
}

export function newEntryVisible(access: Pick<BooksAccessState, 'canWrite'>): boolean {
    return access.canWrite
}
