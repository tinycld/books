import { describe, expect, it } from 'vitest'
import { entryActions, newEntryVisible } from '../tinycld/books/lib/entry-actions'

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

describe('newEntryVisible', () => {
    it('follows canWrite', () => {
        expect(newEntryVisible({ canWrite: false })).toBe(false)
        expect(newEntryVisible({ canWrite: true })).toBe(true)
    })
})
