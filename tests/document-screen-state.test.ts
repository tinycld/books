import { describe, expect, it } from 'vitest'
import { documentScreenState } from '../tinycld/books/lib/document-screen-state'

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
