import type { BooksJournalEntries } from '../types'
import type { BooksAccessState } from './access'

export type EntryActionId = 'open' | 'edit' | 'reverse' | 'void' | 'delete'

// isReversed means a POSTED reversal exists (reversalSummary's linkText); the server ignores draft and void ones.
type EntryActionState = Pick<BooksJournalEntries, 'status' | 'origin'> & { isReversed: boolean }

export function entryActions(
    entry: EntryActionState,
    access: Pick<BooksAccessState, 'canWrite'>
): EntryActionId[] {
    const actions: EntryActionId[] = ['open']
    if (!access.canWrite) return actions
    if (entry.status === 'draft') return [...actions, 'delete']
    // The server refuses to edit, reverse or void a void reversal.
    if (entry.status !== 'posted' || entry.origin === 'void_reversal') return actions
    actions.push('edit')
    if (!entry.isReversed) actions.push('reverse')
    actions.push('void')
    return actions
}

export function newEntryVisible(access: Pick<BooksAccessState, 'canWrite'>): boolean {
    return access.canWrite
}
