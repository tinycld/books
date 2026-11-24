import type { BooksJournalEntries } from '../types'
import type { BooksAccessState } from './access'

export type EntryActionId = 'open' | 'edit' | 'reverse' | 'void' | 'delete'

const INVENTORY_ADJUSTMENT = 'inventory_adjustment'

// What the read view says of an entry that offers no Edit or Void because Books keeps it
// in step with something else; null for any other entry.
export function entryChangeNote(entry: Pick<BooksJournalEntries, 'doc_type'>): string | null {
    if (entry.doc_type !== INVENTORY_ADJUSTMENT) return null
    return 'Books posts this entry for an inventory item. It changes only when the opening stock of the item or the document it re-costs changes.'
}

// isReversed means a POSTED reversal exists (reversedByText, lib/entry-display.ts); the server ignores draft and void ones.
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
    // Books posts an inventory adjustment's entry itself (an item's opening stock, a
    // re-cost) and no screen edits or voids one: the server refuses the manual form's
    // correction, and the entry has no document screen to void it on (entryChangeNote).
    if (entry.doc_type === INVENTORY_ADJUSTMENT) return actions
    // A correction must keep the original's origin (server/reversal.go), and the journal
    // entry form writes only manual entries, so the server refuses every edit of a
    // reversal. A write-off has no form (it is voided and written off again), so its
    // entry offers no Edit.
    const canEdit =
        entry.origin !== 'reversal' &&
        entry.origin !== 'auto_reversal' &&
        entry.doc_type !== 'write_off'
    if (canEdit) actions.push('edit')
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
