import { describe, expect, it } from 'vitest'
import { auditRecordHref } from '../tinycld/books/lib/audit-record-route'
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

    // Refund receipt spec §3.13: a refund receipt's history is read from
    // books_refund_receipts, and a history item of the refund or of one of its lines (filed
    // under the refund's id) opens books/refund-receipts/<id>.
    it('maps refund_receipt to books_refund_receipts', () => {
        expect(Object.entries(DOCUMENT_COLLECTIONS)).toContainEqual([
            'refund_receipt',
            'books_refund_receipts',
        ])
        const collection = Object.fromEntries(Object.entries(DOCUMENT_COLLECTIONS)).refund_receipt
        expect(historyHref(collection ?? '', 'rfrp1001every01')).toBe(
            'books/history/books_refund_receipts/rfrp1001every01'
        )
    })

    it('a history item of a refund receipt and of one of its lines opens books/refund-receipts/<id>', () => {
        const refund = 'rfrp1001every01'
        expect(auditRecordHref('books_refund_receipts', refund, { id: refund })).toBe(
            `books/refund-receipts/${refund}`
        )
        // A line's audit rows carry parent_type books_refund_receipts and parent_id the
        // refund id; the history item opens through that parent.
        // A line reaches the client already filed under its parent (the server's audit view files it; Go tests cover that), so this is the record call again, not coverage of a client line route.
        const line = { parent_type: 'books_refund_receipts', parent_id: refund }
        expect(auditRecordHref(line.parent_type, line.parent_id, { id: line.parent_id })).toBe(
            `books/refund-receipts/${refund}`
        )
    })

    // Write-off spec §3.6: a write-off's history is read from books_write_offs.
    it('maps write_off to books_write_offs and opens its history screen', () => {
        expect(Object.entries(DOCUMENT_COLLECTIONS)).toContainEqual([
            'write_off',
            'books_write_offs',
        ])
        const collection = Object.fromEntries(Object.entries(DOCUMENT_COLLECTIONS)).write_off
        expect(historyHref(collection ?? '', 'wofx1001delta01')).toBe(
            'books/history/books_write_offs/wofx1001delta01'
        )
    })

    // Bank deposit spec §3.7: a deposit's history is read from books_deposits.
    it('maps deposit to books_deposits and opens its history screen', () => {
        expect(Object.entries(DOCUMENT_COLLECTIONS)).toContainEqual(['deposit', 'books_deposits'])
        const collection = Object.fromEntries(Object.entries(DOCUMENT_COLLECTIONS)).deposit
        expect(historyHref(collection ?? '', 'dpst1001frida01')).toBe(
            'books/history/books_deposits/dpst1001frida01'
        )
    })

    it('opens the history screen of a vendor refund', () => {
        const collection = Object.fromEntries(Object.entries(DOCUMENT_COLLECTIONS)).vendor_refund
        expect(historyHref(collection ?? '', 'vrfd1001cascf01')).toBe(
            'books/history/books_vendor_refunds/vrfd1001cascf01'
        )
    })
})
