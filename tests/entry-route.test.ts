import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { entryActions } from '../tinycld/books/lib/entry-actions'
import { DOCUMENT_ROUTES, entryEditHref, entryHref } from '../tinycld/books/lib/entry-route'
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

// server/entry_routes.json is the one table of document routes (Go reads it for the
// reports' open path); read here, so a row added to it is covered with no test change.
function entryRoutesFile(): Record<string, string> {
    const file = join(__dirname, '..', 'server', 'entry_routes.json')
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
}

describe('entry routes match server/entry_routes.json', () => {
    it('routes each document type in the JSON to books/<route>', () => {
        const routes = entryRoutesFile()
        expect(Object.keys(routes).length).toBeGreaterThan(0)
        for (const [docType, route] of Object.entries(routes)) {
            expect(DOCUMENT_ROUTES.get(docType)).toBe(`books/${route}`)
            const documentEntry = {
                id: 'e1',
                doc_type: docType as BooksJournalEntries['doc_type'],
                origin: 'document' as const,
                document: 'd1',
            }
            expect(entryHref(documentEntry)).toBe(`books/${route}/d1`)
        }
    })

    it('has exactly the JSON keys', () => {
        expect([...DOCUMENT_ROUTES.keys()].sort()).toEqual(Object.keys(entryRoutesFile()).sort())
    })

    it('opens a manual transfer, a journal entry and an unrouted document entry by the entry', () => {
        // An estimate posts no entry, so the JSON has no route for it.
        expect(Object.keys(entryRoutesFile())).not.toContain('estimate')
        expect(entryHref({ id: 'e1', doc_type: 'transfer', origin: 'manual', document: '' })).toBe(
            'books/transfers/e1'
        )
        expect(entryHref({ id: 'e1', doc_type: 'journal', origin: 'manual', document: '' })).toBe(
            'books/entries/e1'
        )
        const unrouted = {
            id: 'e1',
            doc_type: 'estimate' as BooksJournalEntries['doc_type'],
            origin: 'document' as const,
            document: 'd1',
        }
        expect(entryHref(unrouted)).toBe('books/entries/e1')
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

// An expense's entry (expense form spec §3.11): it opens on its expense and is
// edited as a correction of it.
describe('an expense entry', () => {
    it('opens on its expense', () => {
        expect(entryHref(entry('expense', 'document', 'e1'))).toBe('books/expenses/e1')
    })

    it('edits as a correction of its expense', () => {
        expect(entryEditHref(entry('expense', 'document', 'e1'))).toBe(
            'books/expenses/new?replaces=e1'
        )
    })
})

// A payment's entry (receive payment spec §3.9): it opens on its payment and is
// edited as a correction of it.
describe('a payment entry', () => {
    it('opens on its payment', () => {
        expect(entryHref(entry('payment', 'document', 'p1'))).toBe('books/payments/p1')
    })

    it('edits as a correction of its payment', () => {
        expect(entryEditHref(entry('payment', 'document', 'p1'))).toBe(
            'books/payments/new?replaces=p1'
        )
    })
})

// A bill payment's entry (pay-bills spec §4.2): it opens on its bill payment.
describe('a bill payment entry', () => {
    it('opens on its bill payment', () => {
        expect(entryHref(entry('bill_payment', 'document', 'bp1'))).toBe('books/bill-payments/bp1')
    })
})
