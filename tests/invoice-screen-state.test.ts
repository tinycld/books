import { describe, expect, it } from 'vitest'
import { invoiceScreenState } from '../tinycld/books/lib/invoice-screen-state'

type Input = Parameters<typeof invoiceScreenState>[0]

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

describe('invoiceScreenState', () => {
    it('is loading until every read is ready', () => {
        expect(invoiceScreenState({ ...DRAFT, isReady: false })).toBe('loading')
        expect(invoiceScreenState({ ...NEW, isReady: false })).toBe('loading')
    })

    it('is error when any read failed, even before the others are ready', () => {
        expect(invoiceScreenState({ ...DRAFT, isError: true })).toBe('error')
        expect(invoiceScreenState({ ...DRAFT, isError: true, isReady: false })).toBe('error')
        expect(invoiceScreenState({ ...NEW, isError: true, canWrite: false })).toBe('error')
    })

    it('a new invoice is the form for a writer and no-access for a reader', () => {
        expect(invoiceScreenState(NEW)).toBe('form')
        expect(invoiceScreenState({ ...NEW, canWrite: false })).toBe('no-access')
    })

    it('a draft is the form for a writer and no-access for a reader', () => {
        expect(invoiceScreenState(DRAFT)).toBe('form')
        expect(invoiceScreenState({ ...DRAFT, canWrite: false })).toBe('no-access')
    })

    it('a posted or void invoice is the read view for a reader', () => {
        expect(invoiceScreenState({ ...DRAFT, canWrite: false, status: 'posted' })).toBe('read')
        expect(invoiceScreenState({ ...DRAFT, canWrite: false, status: 'void' })).toBe('read')
    })

    it('an id whose row does not exist is not-found', () => {
        expect(invoiceScreenState({ ...DRAFT, status: null })).toBe('not-found')
        expect(invoiceScreenState({ ...DRAFT, status: null, canWrite: false })).toBe('not-found')
    })

    it('a posted invoice is the read view for a writer, unless the form is held through a post', () => {
        expect(invoiceScreenState({ ...DRAFT, status: 'posted' })).toBe('read')
        expect(invoiceScreenState({ ...DRAFT, status: 'void' })).toBe('read')
        expect(invoiceScreenState({ ...DRAFT, status: 'posted', isHeld: true })).toBe('form')
    })

    // Delete draft is optimistic: the row leaves the store before the server answers. The
    // held form stays, so a refused delete shows in its dialog and the edits survive.
    it('a draft held through a delete stays the form while its row is gone', () => {
        expect(invoiceScreenState({ ...DRAFT, status: null, isHeld: true })).toBe('form')
        expect(invoiceScreenState({ ...DRAFT, status: 'draft', isHeld: true })).toBe('form')
    })

    it('a correction of an invoice that is not posted cannot be edited', () => {
        expect(invoiceScreenState({ ...NEW, replacesStatus: 'draft' })).toBe('cannot-edit')
        expect(invoiceScreenState({ ...NEW, replacesStatus: 'void' })).toBe('cannot-edit')
    })

    it('a correction of a missing invoice is not-found', () => {
        expect(invoiceScreenState({ ...NEW, replacesStatus: null })).toBe('not-found')
    })

    it('a correction of a posted invoice is the form', () => {
        expect(invoiceScreenState({ ...NEW, replacesStatus: 'posted' })).toBe('form')
    })
})
