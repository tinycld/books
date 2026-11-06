import { describe, expect, it } from 'vitest'
import { entryEditHref, entryHref } from '../tinycld/books/lib/entry-route'

describe('entryHref', () => {
    it('opens a transfer on the transfer screen', () => {
        expect(entryHref({ id: 'a', doc_type: 'transfer', origin: 'manual' })).toBe(
            'books/transfers/a'
        )
    })

    it("opens a transfer's void reversal and a journal entry on the entry screen", () => {
        expect(entryHref({ id: 'a', doc_type: 'transfer', origin: 'void_reversal' })).toBe(
            'books/entries/a'
        )
        expect(entryHref({ id: 'a', doc_type: 'journal', origin: 'manual' })).toBe(
            'books/entries/a'
        )
    })
})

describe('entryEditHref', () => {
    it('edits a transfer in the transfer form', () => {
        expect(entryEditHref({ id: 'a', doc_type: 'transfer', origin: 'manual' })).toBe(
            'books/transfers/new?replaces=a'
        )
    })

    it('edits a journal entry in the entry form', () => {
        expect(entryEditHref({ id: 'a', doc_type: 'journal', origin: 'manual' })).toBe(
            'books/entries/new?replaces=a'
        )
    })

    it('edits an opening balance entry on the opening balances screen', () => {
        expect(entryEditHref({ id: 'a', doc_type: 'journal', origin: 'opening_balance' })).toBe(
            'books/opening-balances?edit=1'
        )
    })
})
