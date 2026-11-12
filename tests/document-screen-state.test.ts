import { describe, expect, it } from 'vitest'
import { SALES_RECEIPT_MESSAGES } from '../tinycld/books/lib/document-messages'
import { documentScreenState } from '../tinycld/books/lib/document-screen-state'
import { SALES_RECEIPT_KIND } from '../tinycld/books/lib/sales-document-kinds'

type Input = Parameters<typeof documentScreenState>[0]

// A writer on a loaded draft.
const DRAFT: Input = {
    isReady: true,
    isError: false,
    canWrite: true,
    isNew: false,
    status: 'draft',
    isHeld: false,
    replacesStatus: undefined,
}

// A writer on `books/invoices/new`.
const NEW: Input = { ...DRAFT, isNew: true, status: null }

describe('documentScreenState', () => {
    it('is loading until every read is ready', () => {
        expect(documentScreenState({ ...DRAFT, isReady: false })).toBe('loading')
        expect(documentScreenState({ ...NEW, isReady: false })).toBe('loading')
    })

    it('is error when any read failed, even before the others are ready', () => {
        expect(documentScreenState({ ...DRAFT, isError: true })).toBe('error')
        expect(documentScreenState({ ...DRAFT, isError: true, isReady: false })).toBe('error')
        expect(documentScreenState({ ...NEW, isError: true, canWrite: false })).toBe('error')
    })

    it('a new invoice is the form for a writer and no-access for a reader', () => {
        expect(documentScreenState(NEW)).toBe('form')
        expect(documentScreenState({ ...NEW, canWrite: false })).toBe('no-access')
    })

    it('a draft is the form for a writer and no-access for a reader', () => {
        expect(documentScreenState(DRAFT)).toBe('form')
        expect(documentScreenState({ ...DRAFT, canWrite: false })).toBe('no-access')
    })

    it('a posted or void invoice is the read view for a reader', () => {
        expect(documentScreenState({ ...DRAFT, canWrite: false, status: 'posted' })).toBe('read')
        expect(documentScreenState({ ...DRAFT, canWrite: false, status: 'void' })).toBe('read')
    })

    it('an id whose row does not exist is not-found', () => {
        expect(documentScreenState({ ...DRAFT, status: null })).toBe('not-found')
        expect(documentScreenState({ ...DRAFT, status: null, canWrite: false })).toBe('not-found')
    })

    it('a posted invoice is the read view for a writer, unless the form is held through a post', () => {
        expect(documentScreenState({ ...DRAFT, status: 'posted' })).toBe('read')
        expect(documentScreenState({ ...DRAFT, status: 'void' })).toBe('read')
        expect(documentScreenState({ ...DRAFT, status: 'posted', isHeld: true })).toBe('form')
    })

    // Delete draft is optimistic: the row leaves the store before the server answers. The
    // held form stays, so a refused delete shows in its dialog and the edits survive.
    it('a draft held through a delete stays the form while its row is gone', () => {
        expect(documentScreenState({ ...DRAFT, status: null, isHeld: true })).toBe('form')
        expect(documentScreenState({ ...DRAFT, status: 'draft', isHeld: true })).toBe('form')
    })

    it('a correction of an invoice that is not posted cannot be edited', () => {
        expect(documentScreenState({ ...NEW, replacesStatus: 'draft' })).toBe('cannot-edit')
        expect(documentScreenState({ ...NEW, replacesStatus: 'void' })).toBe('cannot-edit')
    })

    it('a correction of a missing invoice is not-found', () => {
        expect(documentScreenState({ ...NEW, replacesStatus: null })).toBe('not-found')
    })

    it('a correction of a posted invoice is the form', () => {
        expect(documentScreenState({ ...NEW, replacesStatus: 'posted' })).toBe('form')
    })
})

// The sales receipt's states (spec §3.9) and the texts its screen shows for them.
describe('documentScreenState for a sales receipt', () => {
    // Read inside each test, so a missing kind fails those tests and not the file.
    const texts = () => SALES_RECEIPT_KIND.messages

    it('a non-writer at new gets no-access with the receipt text', () => {
        expect(documentScreenState({ ...NEW, canWrite: false })).toBe('no-access')
        expect(SALES_RECEIPT_MESSAGES.noAccess).toBe(
            'You need bookkeeper access to create sales receipts'
        )
        expect(texts().noAccess).toBe(SALES_RECEIPT_MESSAGES.noAccess)
    })

    it('an id with no row is not-found with the receipt text', () => {
        expect(documentScreenState({ ...DRAFT, status: null })).toBe('not-found')
        expect(texts().notFound).toBe('This sales receipt does not exist')
    })

    it('a correction of a draft cannot be edited, with the receipt text', () => {
        expect(documentScreenState({ ...NEW, replacesStatus: 'draft' })).toBe('cannot-edit')
        expect(texts().cannotEdit).toBe('This sales receipt cannot be edited')
    })

    it('a failed load is the error with the receipt text', () => {
        expect(documentScreenState({ ...DRAFT, isError: true })).toBe('error')
        expect(texts().loadFailed).toBe('Books could not load this sales receipt.')
    })

    it('is loading while the reads are not ready', () => {
        expect(documentScreenState({ ...NEW, isReady: false })).toBe('loading')
    })
})
