import type { BooksJournalEntries } from '../types'

// Paths without the org prefix; callers pass them through `useOrgHref`.
type RoutedEntry = Pick<BooksJournalEntries, 'id' | 'doc_type' | 'origin' | 'document'>

// A document's entry (origin 'document') is posted from its document and opens there.
function isInvoiceEntry(entry: RoutedEntry): boolean {
    return entry.doc_type === 'invoice' && entry.origin === 'document' && entry.document !== ''
}

// A transfer's or an invoice's void reversal keeps its doc_type, yet no one made it as
// that document: its own screen would show it with the sides swapped, so it opens as an
// entry.
export function entryHref(entry: RoutedEntry): string {
    if (isInvoiceEntry(entry)) return `books/invoices/${entry.document}`
    if (entry.doc_type === 'transfer' && entry.origin === 'manual') {
        return `books/transfers/${entry.id}`
    }
    return `books/entries/${entry.id}`
}

// The server refuses a correction whose type or origin differs from the original's, so
// each kind is edited in its own form. An invoice's entry is corrected by editing the
// invoice, which posts the correction under the same number.
export function entryEditHref(entry: RoutedEntry): string {
    if (isInvoiceEntry(entry)) return `books/invoices/new?replaces=${entry.document}`
    if (entry.doc_type === 'transfer') return `books/transfers/new?replaces=${entry.id}`
    if (entry.origin === 'opening_balance') return 'books/opening-balances?edit=1'
    return `books/entries/new?replaces=${entry.id}`
}
