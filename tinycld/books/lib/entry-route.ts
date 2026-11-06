import type { BooksJournalEntries } from '../types'

// Paths without the org prefix; callers pass them through `useOrgHref`.
type RoutedEntry = Pick<BooksJournalEntries, 'id' | 'doc_type' | 'origin'>

// A transfer's void reversal keeps doc_type 'transfer', yet no one made it as a transfer:
// the transfer view would show it with From and To swapped, so it opens as an entry.
export function entryHref(entry: RoutedEntry): string {
    if (entry.doc_type === 'transfer' && entry.origin === 'manual') {
        return `books/transfers/${entry.id}`
    }
    return `books/entries/${entry.id}`
}

// The server refuses a correction whose type or origin differs from the original's, so
// each kind is edited in its own form.
export function entryEditHref(entry: RoutedEntry): string {
    if (entry.doc_type === 'transfer') return `books/transfers/new?replaces=${entry.id}`
    if (entry.origin === 'opening_balance') return 'books/opening-balances?edit=1'
    return `books/entries/new?replaces=${entry.id}`
}
