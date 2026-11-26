import { describe, expect, it } from 'vitest'
import {
    entryActions,
    entryChangeNote,
    newEntryVisible,
    voidsFromDocument,
} from '../tinycld/books/lib/entry-actions'
import { entryEditHref, entryHref } from '../tinycld/books/lib/entry-route'

const writer = { canWrite: true }
const reader = { canWrite: false }
const posted = {
    status: 'posted',
    origin: 'manual',
    doc_type: 'journal',
    isReversed: false,
} as const
const postedTransfer = { ...posted, doc_type: 'transfer' } as const

describe('entryActions', () => {
    it('gives a writer on a posted manual entry open, edit, reverse and void', () => {
        expect(entryActions(posted, writer)).toEqual(['open', 'edit', 'reverse', 'void'])
    })

    it('removes reverse once reversed', () => {
        expect(entryActions({ ...posted, isReversed: true }, writer)).toEqual([
            'open',
            'edit',
            'void',
        ])
    })

    it('gives a draft open and delete', () => {
        expect(
            entryActions(
                { status: 'draft', origin: 'manual', doc_type: 'journal', isReversed: false },
                writer
            )
        ).toEqual(['open', 'delete'])
    })

    it('gives a void entry open only', () => {
        expect(
            entryActions(
                { status: 'void', origin: 'manual', doc_type: 'journal', isReversed: false },
                writer
            )
        ).toEqual(['open'])
    })

    it('gives a void_reversal entry open only', () => {
        expect(
            entryActions(
                {
                    status: 'posted',
                    origin: 'void_reversal',
                    doc_type: 'journal',
                    isReversed: false,
                },
                writer
            )
        ).toEqual(['open'])
    })

    it('gives a reader open only for any entry', () => {
        for (const status of ['draft', 'posted', 'void'] as const) {
            expect(
                entryActions(
                    { status, origin: 'manual', doc_type: 'journal', isReversed: false },
                    reader
                )
            ).toEqual(['open'])
        }
    })
})

// The server refuses a correction whose origin differs from the original's
// ("A correction must have the same origin as the entry it replaces.", server/reversal.go),
// so a posted reversal never offers Edit.
describe('entryActions for a posted reversal', () => {
    it('gives a writer on a posted reversal open, reverse and void, no edit', () => {
        expect(entryActions({ ...posted, origin: 'reversal' }, writer)).toEqual([
            'open',
            'reverse',
            'void',
        ])
    })

    it('gives a writer on a posted auto reversal open, reverse and void, no edit', () => {
        expect(entryActions({ ...posted, origin: 'auto_reversal' }, writer)).toEqual([
            'open',
            'reverse',
            'void',
        ])
    })

    it('gives a writer on a reversed reversal open and void', () => {
        expect(entryActions({ ...posted, origin: 'reversal', isReversed: true }, writer)).toEqual([
            'open',
            'void',
        ])
    })
})

describe('entryActions for a transfer', () => {
    it('gives a writer on a posted transfer open, edit and void, never reverse', () => {
        expect(entryActions(postedTransfer, writer)).toEqual(['open', 'edit', 'void'])
    })

    it('gives a draft transfer open and delete', () => {
        expect(entryActions({ ...postedTransfer, status: 'draft' }, writer)).toEqual([
            'open',
            'delete',
        ])
    })

    it('gives a reader open only on a transfer', () => {
        expect(entryActions(postedTransfer, reader)).toEqual(['open'])
    })
})

// A document's entry is changed from its document (Edit or Void there); the
// server refuses a reversal or correction that names it.
describe('entryActions for an invoice entry', () => {
    const postedInvoiceEntry = { ...posted, origin: 'document', doc_type: 'invoice' } as const

    it('gives a writer on a posted invoice entry open, edit and void, never reverse', () => {
        expect(entryActions(postedInvoiceEntry, writer)).toEqual(['open', 'edit', 'void'])
    })

    it('gives a reader open only on an invoice entry', () => {
        expect(entryActions(postedInvoiceEntry, reader)).toEqual(['open'])
    })
})

// Spec §3.9: a payment's entry opens and is edited on the payment screen (Open goes to
// `books/payments/<document>`, Edit to its correction); Reverse is never offered.
describe('entryActions for a payment entry', () => {
    it('gives a writer on a posted payment entry Open and Edit on the payment, never Reverse', () => {
        const entry = {
            id: 'jepaymentpin001',
            status: 'posted',
            origin: 'document',
            doc_type: 'payment',
            document: 'pmntpinpayment1',
            sequence: 0,
            isReversed: false,
        } as const
        const actions = entryActions(entry, writer)
        expect(actions).toEqual(['open', 'edit', 'void'])
        expect(actions).not.toContain('reverse')
        expect(entryHref(entry)).toBe('books/payments/pmntpinpayment1')
        expect(entryEditHref(entry)).toBe('books/payments/new?replaces=pmntpinpayment1')
    })
})

// Write-off spec §3.6: a write-off has no form, so its entry offers no Edit; Void stays
// and opens the write-off, where the void runs.
describe('entryActions for a write-off entry', () => {
    const postedWriteOffEntry = { ...posted, origin: 'document', doc_type: 'write_off' } as const

    it('gives a writer on a posted write-off entry open and void, never edit or reverse', () => {
        expect(entryActions(postedWriteOffEntry, writer)).toEqual(['open', 'void'])
        expect(voidsFromDocument(postedWriteOffEntry)).toBe(true)
    })

    it('gives a reader open only on a write-off entry', () => {
        expect(entryActions(postedWriteOffEntry, reader)).toEqual(['open'])
    })
})

// Books makes an inventory adjustment's entry itself (an item's opening stock, a
// re-cost): it has no form and no void, and changes only with its item or document.
describe('entryActions for an inventory adjustment entry', () => {
    const adjustmentEntry = {
        ...posted,
        origin: 'document',
        doc_type: 'inventory_adjustment',
    } as const

    it('gives a writer open only, never edit, reverse or void', () => {
        expect(entryActions(adjustmentEntry, writer)).toEqual(['open'])
    })

    it('says the entry changes with its item or document', () => {
        expect(entryChangeNote(adjustmentEntry)).toBe(
            'Books posts this entry for an inventory item. It changes only when the opening stock of the item or the document it re-costs changes.'
        )
    })

    it('has no note for an entry a person edits', () => {
        expect(entryChangeNote(posted)).toBeNull()
        expect(entryChangeNote({ doc_type: 'invoice' })).toBeNull()
    })
})

describe('newEntryVisible', () => {
    it('follows canWrite', () => {
        expect(newEntryVisible({ canWrite: false })).toBe(false)
        expect(newEntryVisible({ canWrite: true })).toBe(true)
    })
})
