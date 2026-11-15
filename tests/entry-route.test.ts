import { describe, expect, it } from 'vitest'
import { entryActions } from '../tinycld/books/lib/entry-actions'
import { entryEditHref, entryHref } from '../tinycld/books/lib/entry-route'
import type { BooksJournalEntries } from '../tinycld/books/types'

const entry = (
    doc_type: BooksJournalEntries['doc_type'],
    origin: BooksJournalEntries['origin'],
    document = ''
) => ({ id: 'a', doc_type, origin, document })

describe('entryHref', () => {
    it('opens a transfer on the transfer screen', () => {
        expect(entryHref(entry('transfer', 'manual'))).toBe('books/transfers/a')
    })

    it("opens a transfer's void reversal and a journal entry on the entry screen", () => {
        expect(entryHref(entry('transfer', 'void_reversal'))).toBe('books/entries/a')
        expect(entryHref(entry('journal', 'manual'))).toBe('books/entries/a')
    })

    it("opens an invoice's entry on its invoice", () => {
        expect(entryHref(entry('invoice', 'document', 'invc1'))).toBe('books/invoices/invc1')
    })

    it("opens an invoice's void reversal on the entry screen", () => {
        expect(entryHref(entry('invoice', 'void_reversal'))).toBe('books/entries/a')
    })
})

describe('entryEditHref', () => {
    it('edits a transfer in the transfer form', () => {
        expect(entryEditHref(entry('transfer', 'manual'))).toBe('books/transfers/new?replaces=a')
    })

    it('edits a journal entry in the entry form', () => {
        expect(entryEditHref(entry('journal', 'manual'))).toBe('books/entries/new?replaces=a')
    })

    it('edits an opening balance entry on the opening balances screen', () => {
        expect(entryEditHref(entry('journal', 'opening_balance'))).toBe(
            'books/opening-balances?edit=1'
        )
    })

    it("edits an invoice's entry as a correction of its invoice", () => {
        expect(entryEditHref(entry('invoice', 'document', 'invc1'))).toBe(
            'books/invoices/new?replaces=invc1'
        )
    })
})

// A sales receipt's entry (spec §3.10): it opens on its receipt, is edited as a
// correction of it, and is never reversed by itself.
describe('a sales receipt entry', () => {
    it('opens on its sales receipt', () => {
        expect(entryHref(entry('sales_receipt', 'document', 'r1'))).toBe('books/sales-receipts/r1')
    })

    it('edits as a correction of its sales receipt', () => {
        expect(entryEditHref(entry('sales_receipt', 'document', 'r1'))).toBe(
            'books/sales-receipts/new?replaces=r1'
        )
    })

    it('opens its void reversal as an entry', () => {
        expect(entryHref(entry('sales_receipt', 'void_reversal'))).toBe('books/entries/a')
    })

    it('offers Open and Edit, and no Reverse', () => {
        const actions = entryActions(
            { status: 'posted', origin: 'document', doc_type: 'sales_receipt', isReversed: false },
            { canWrite: true }
        )
        expect(actions).toContain('open')
        expect(actions).toContain('edit')
        expect(actions).not.toContain('reverse')
    })
})

// A bill's entry (spec §3.10): it opens on its bill, is edited as a correction of it,
// and is never reversed by itself.
describe('a bill entry', () => {
    it('opens on its bill', () => {
        expect(entryHref(entry('bill', 'document', 'b1'))).toBe('books/bills/b1')
    })

    it('edits as a correction of its bill', () => {
        expect(entryEditHref(entry('bill', 'document', 'b1'))).toBe('books/bills/new?replaces=b1')
    })

    it('opens its void reversal as an entry', () => {
        expect(entryHref(entry('bill', 'void_reversal'))).toBe('books/entries/a')
    })

    it('offers Open and Edit, and no Reverse', () => {
        const actions = entryActions(
            { status: 'posted', origin: 'document', doc_type: 'bill', isReversed: false },
            { canWrite: true }
        )
        expect(actions).toContain('open')
        expect(actions).toContain('edit')
        expect(actions).not.toContain('reverse')
    })
})
