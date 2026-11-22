import { describe, expect, it } from 'vitest'
import { depositScreenState } from '../tinycld/books/lib/deposit-screen-state'

// The deposit screen's states (bank deposit spec §2, §3.6 Writers only, §3.9): which of
// loading, error, not-found, no-access, cannot-edit, the form or the read view it shows.

type Input = Parameters<typeof depositScreenState>[0]

// A writer at `books/deposits/new` with every read ready.
const NEW: Input = {
    isReady: true,
    isError: false,
    canWrite: true,
    isNew: true,
    status: null,
    isHeld: false,
    replacesStatus: undefined,
    replacesReady: true,
    replacesError: false,
}

// A writer on a saved draft.
const DRAFT: Input = { ...NEW, isNew: false, status: 'draft' }

// A writer at `books/deposits/new?replaces=<id>` of a posted deposit.
const CORRECTION: Input = { ...NEW, replacesStatus: 'posted' }

describe('depositScreenState', () => {
    it('is loading while any read is not ready', () => {
        expect(depositScreenState({ ...NEW, isReady: false })).toBe('loading')
        expect(depositScreenState({ ...DRAFT, isReady: false })).toBe('loading')
        expect(depositScreenState({ ...DRAFT, status: 'posted', isReady: false })).toBe('loading')
    })

    it('is the error when a read failed, before loading even while others are not ready', () => {
        expect(depositScreenState({ ...DRAFT, isError: true })).toBe('error')
        expect(depositScreenState({ ...DRAFT, isError: true, isReady: false })).toBe('error')
    })

    it('gives an id with no row the not-found state', () => {
        expect(depositScreenState({ ...DRAFT, status: null })).toBe('not-found')
        expect(depositScreenState({ ...DRAFT, status: null, canWrite: false })).toBe('not-found')
    })

    it('opens a posted or a void deposit in the read view, for a writer and a reader', () => {
        for (const status of ['posted', 'void'] as const) {
            expect(depositScreenState({ ...DRAFT, status })).toBe('read')
            expect(depositScreenState({ ...DRAFT, status, canWrite: false })).toBe('read')
        }
    })

    it('opens a draft in the form for a writer, and gives a reader no-access', () => {
        expect(depositScreenState(DRAFT)).toBe('form')
        expect(depositScreenState({ ...DRAFT, canWrite: false })).toBe('no-access')
    })

    it('opens the new form for a writer, and gives a reader no-access', () => {
        expect(depositScreenState(NEW)).toBe('form')
        expect(depositScreenState({ ...NEW, canWrite: false })).toBe('no-access')
    })

    it('gives ?replaces of a deposit that is not posted the cannot-edit state', () => {
        expect(depositScreenState(CORRECTION)).toBe('form')
        expect(depositScreenState({ ...CORRECTION, replacesStatus: 'draft' })).toBe('cannot-edit')
        expect(depositScreenState({ ...CORRECTION, replacesStatus: 'void' })).toBe('cannot-edit')
        expect(depositScreenState({ ...CORRECTION, replacesStatus: null })).toBe('cannot-edit')
    })

    it('is loading while the ?replaces original loads, and the error when it failed', () => {
        expect(
            depositScreenState({ ...CORRECTION, replacesStatus: null, replacesReady: false })
        ).toBe('loading')
        expect(
            depositScreenState({
                ...CORRECTION,
                replacesStatus: null,
                replacesReady: false,
                replacesError: true,
            })
        ).toBe('error')
    })

    // The optimistic `posted` status would swap the form for the read view and lose a
    // refusal; the save store's hold keeps the form through the post.
    it('keeps a draft held through its post in the form', () => {
        expect(depositScreenState({ ...DRAFT, status: 'posted', isHeld: true })).toBe('form')
        expect(depositScreenState({ ...DRAFT, status: 'posted', isHeld: false })).toBe('read')
    })
})
