import { describe, expect, it } from 'vitest'
import { DOCUMENT_COLLECTIONS, historyHref } from '../tinycld/books/lib/history-route'

// Vendor refund spec §3.11: a vendor refund's history is read from books_vendor_refunds,
// through the one map of kind to collection (DOCUMENT_COLLECTIONS), beside the documents.
describe('history route', () => {
    it('maps vendor_refund to books_vendor_refunds and keeps the document kinds', () => {
        const entries = Object.entries(DOCUMENT_COLLECTIONS)
        expect(entries).toContainEqual(['vendor_refund', 'books_vendor_refunds'])
        expect(entries).toContainEqual(['vendor_credit', 'books_vendor_credits'])
        expect(entries).toContainEqual(['bill', 'books_bills'])
    })

    it('opens the history screen of a vendor refund', () => {
        const collection = Object.fromEntries(Object.entries(DOCUMENT_COLLECTIONS)).vendor_refund
        expect(historyHref(collection ?? '', 'vrfd1001cascf01')).toBe(
            'books/history/books_vendor_refunds/vrfd1001cascf01'
        )
    })
})
