import type { BooksJournalEntries } from '../types'

// Paths without the org prefix; callers pass them through `useOrgHref`.
type RoutedEntry = Pick<BooksJournalEntries, 'id' | 'doc_type' | 'origin' | 'document'>

// The screen of each posting document type, by the entry's doc_type. An estimate
// posts no entry, so it has none.
const DOCUMENT_ROUTES = new Map<string, string>([
    ['invoice', 'books/invoices'],
    ['sales_receipt', 'books/sales-receipts'],
    ['bill', 'books/bills'],
])

// A document's entry (origin 'document') is posted from its document and opens there:
// the document's route, or null for an entry no document screen owns.
function documentRoute(entry: RoutedEntry): string | null {
    if (entry.origin !== 'document' || entry.document === '') return null
    return DOCUMENT_ROUTES.get(entry.doc_type) ?? null
}

// A transfer's or a document's (invoice, sales receipt, bill) void reversal keeps its doc_type, yet no one made
// it as that document: its own screen would show it with the sides swapped, so it opens
// as an entry.
export function entryHref(entry: RoutedEntry): string {
    const route = documentRoute(entry)
    if (route) return `${route}/${entry.document}`
    if (entry.doc_type === 'transfer' && entry.origin === 'manual') {
        return `books/transfers/${entry.id}`
    }
    return `books/entries/${entry.id}`
}

// The server refuses a correction whose type or origin differs from the original's, so
// each kind is edited in its own form. A document's entry is corrected by editing
// the document, which posts the correction under the same number.
export function entryEditHref(entry: RoutedEntry): string {
    const route = documentRoute(entry)
    if (route) return `${route}/new?replaces=${entry.document}`
    if (entry.doc_type === 'transfer') return `books/transfers/new?replaces=${entry.id}`
    if (entry.origin === 'opening_balance') return 'books/opening-balances?edit=1'
    return `books/entries/new?replaces=${entry.id}`
}
