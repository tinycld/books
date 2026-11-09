import { describe, expect, it } from 'vitest'
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
