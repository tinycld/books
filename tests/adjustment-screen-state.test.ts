import { describe, expect, it } from 'vitest'
import { adjustmentScreenState } from '../tinycld/books/lib/adjustment-screen-state'

// The inventory adjustment screen's states (inventory-adjust spec §3.4 Writers only, §3.5,
// §3.13): which of loading, error, not-found, no-access, cannot-edit, the form or the read
// view it shows. The rules are the deposit's, with one change: a reader opens a draft in the
// read view (its stored lines and the Draft badge), not the no-access notice.

type Input = Parameters<typeof adjustmentScreenState>[0]

// A writer at `books/inventory-adjustments/new` with every read ready.
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

// A writer at `books/inventory-adjustments/new?replaces=<id>` of a posted adjustment.
const CORRECTION: Input = { ...NEW, replacesStatus: 'posted' }

describe('adjustmentScreenState', () => {
    it('is loading while a read loads', () => {
        expect(adjustmentScreenState({ ...NEW, isReady: false })).toBe('loading')
        expect(adjustmentScreenState({ ...DRAFT, isReady: false })).toBe('loading')
        expect(adjustmentScreenState({ ...DRAFT, status: 'posted', isReady: false })).toBe(
            'loading'
        )
    })

    it('is the error when a read failed, even while another read loads', () => {
        expect(adjustmentScreenState({ ...DRAFT, isError: true })).toBe('error')
        expect(adjustmentScreenState({ ...DRAFT, isError: true, isReady: false })).toBe('error')
    })

    it('is not-found for an id with no record after the load', () => {
        expect(adjustmentScreenState({ ...DRAFT, status: null })).toBe('not-found')
        expect(adjustmentScreenState({ ...DRAFT, status: null, canWrite: false })).toBe('not-found')
    })

    it('gives /new without write access no-access, and a writer the form', () => {
        expect(adjustmentScreenState({ ...NEW, canWrite: false })).toBe('no-access')
        expect(adjustmentScreenState(NEW)).toBe('form')
    })

    it('opens a draft in the form for a writer and in the read view for a reader', () => {
        expect(adjustmentScreenState(DRAFT)).toBe('form')
        expect(adjustmentScreenState({ ...DRAFT, canWrite: false })).toBe('read')
    })

    it('opens a posted or a void adjustment in the read view, for a writer and a reader', () => {
        for (const status of ['posted', 'void'] as const) {
            expect(adjustmentScreenState({ ...DRAFT, status })).toBe('read')
            expect(adjustmentScreenState({ ...DRAFT, status, canWrite: false })).toBe('read')
        }
    })

    it('keeps a saved draft in the form while its post is held, also once the status reads posted', () => {
        // The optimistic `posted` of a held post, which the server may still refuse.
        expect(adjustmentScreenState({ ...DRAFT, status: 'posted', isHeld: true })).toBe('form')
        expect(adjustmentScreenState({ ...DRAFT, status: 'draft', isHeld: true })).toBe('form')
    })

    it('gives ?replaces of a draft or a void adjustment cannot-edit', () => {
        expect(adjustmentScreenState(CORRECTION)).toBe('form')
        expect(adjustmentScreenState({ ...CORRECTION, replacesStatus: 'draft' })).toBe(
            'cannot-edit'
        )
        expect(adjustmentScreenState({ ...CORRECTION, replacesStatus: 'void' })).toBe('cannot-edit')
    })
})
