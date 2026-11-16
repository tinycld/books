import { describe, expect, it } from 'vitest'
import { paymentScreenState } from '../tinycld/books/lib/payment-screen-state'

// The receive-payment screen's states (spec §3.8, §3.6 Writers only, §2): which of loading,
// error, not-found, no-access, cannot-edit, the form or the read view it shows.

type Input = Parameters<typeof paymentScreenState>[0]

// A writer at `books/payments/new` with every read ready.
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

// A writer at `books/payments/new?replaces=<id>`.
const CORRECTION: Input = { ...NEW, replacesStatus: 'posted' }

describe('paymentScreenState', () => {
    it('gives a non-writer at new the no-access state, a writer the form', () => {
        expect(paymentScreenState(NEW)).toBe('form')
        expect(paymentScreenState({ ...NEW, canWrite: false })).toBe('no-access')
    })

    it('is loading while any read is not ready', () => {
        expect(paymentScreenState({ ...NEW, isReady: false })).toBe('loading')
        expect(paymentScreenState({ ...DRAFT, isReady: false })).toBe('loading')
    })

    it('is the error when any read failed, even before the others are ready', () => {
        expect(paymentScreenState({ ...DRAFT, isError: true })).toBe('error')
        expect(paymentScreenState({ ...DRAFT, isError: true, isReady: false })).toBe('error')
    })

    it('gives an id with no row the not-found state', () => {
        expect(paymentScreenState({ ...DRAFT, status: null })).toBe('not-found')
    })

    it('opens a draft id in the form', () => {
        expect(paymentScreenState(DRAFT)).toBe('form')
    })

    it('opens a posted or void id in the read view for every user', () => {
        for (const status of ['posted', 'void'] as const) {
            expect(paymentScreenState({ ...DRAFT, status })).toBe('read')
            expect(paymentScreenState({ ...DRAFT, status, canWrite: false })).toBe('read')
        }
    })

    // The optimistic `posted` status would swap the form for the read view and lose a
    // refusal; the store's hold keeps the form through the post.
    it('keeps a draft held through its post in the form', () => {
        expect(paymentScreenState({ ...DRAFT, status: 'posted', isHeld: true })).toBe('form')
    })

    it('gives ?replaces of a draft or void payment the cannot-edit state', () => {
        expect(paymentScreenState({ ...CORRECTION, replacesStatus: 'draft' })).toBe('cannot-edit')
        expect(paymentScreenState({ ...CORRECTION, replacesStatus: 'void' })).toBe('cannot-edit')
        expect(paymentScreenState(CORRECTION)).toBe('form')
    })

    it('is loading while the ?replaces original is loading, and the error when it failed', () => {
        expect(
            paymentScreenState({ ...CORRECTION, replacesStatus: null, replacesReady: false })
        ).toBe('loading')
        expect(
            paymentScreenState({
                ...CORRECTION,
                replacesStatus: null,
                replacesReady: false,
                replacesError: true,
            })
        ).toBe('error')
    })
})
