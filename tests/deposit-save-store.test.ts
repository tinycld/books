import { beforeEach, describe, expect, it } from 'vitest'
import { DEPOSIT_IDS, UNDEPOSITED_LINE_IDS } from '../tinycld/books/lib/bank-deposit-fixture'
import { useDepositSaveStore } from '../tinycld/books/stores/deposit-save-store'

// The deposit save store (the payment save store without the flow key). The screen's held
// flag is `holding !== null`: a store updates synchronously, so the hold set before the
// mutation is seen by the render the optimistic status flip triggers, and the form stays up.

const store = () => useDepositSaveStore.getState()

beforeEach(() => {
    useDepositSaveStore.setState({ holding: null, correcting: null, refused: null })
})

describe('useDepositSaveStore: hold and release', () => {
    it('holds nothing at first', () => {
        expect(store().holding).toBeNull()
    })

    it('holds the deposit whose save runs, at once', () => {
        store().hold({ id: DEPOSIT_IDS.draft, purpose: 'save' })
        expect(store().holding).toEqual({ id: DEPOSIT_IDS.draft, purpose: 'save' })
        expect(store().holding !== null).toBe(true)
    })

    it('holds a delete by its purpose', () => {
        store().hold({ id: DEPOSIT_IDS.draft, purpose: 'delete' })
        expect(store().holding).toEqual({ id: DEPOSIT_IDS.draft, purpose: 'delete' })
    })

    it('releases the hold', () => {
        store().hold({ id: DEPOSIT_IDS.draft, purpose: 'save' })
        store().release()
        expect(store().holding).toBeNull()
    })
})

describe('useDepositSaveStore: hand-off', () => {
    const values = {
        deposit_to: 'acctfixcheck001',
        date: '2026-11-20',
        memo: 'Friday drop',
        items: [{ line: UNDEPOSITED_LINE_IDS.payment }],
        lines: [],
    }
    const refused = {
        id: DEPOSIT_IDS.draft,
        values,
        error: new Error('The deposit date is on or before the close date.'),
        stored: [],
    }

    it('hands the refused save to the draft’s route', () => {
        store().handOff(refused)
        expect(store().refused).toEqual(refused)
        expect(store().refused?.values.items).toEqual([{ line: UNDEPOSITED_LINE_IDS.payment }])
    })

    it('clears the hand-off once the draft’s form has taken it', () => {
        store().handOff(refused)
        store().clearRefused()
        expect(store().refused).toBeNull()
    })
})

describe('useDepositSaveStore: correcting', () => {
    it('marks the posted deposit a correction corrects', () => {
        store().startCorrecting(DEPOSIT_IDS.posted)
        expect(store().correcting).toBe(DEPOSIT_IDS.posted)
    })

    it('stops only for the same original', () => {
        store().startCorrecting(DEPOSIT_IDS.posted)
        store().stopCorrecting(DEPOSIT_IDS.voided)
        expect(store().correcting).toBe(DEPOSIT_IDS.posted)
        store().stopCorrecting(DEPOSIT_IDS.posted)
        expect(store().correcting).toBeNull()
    })
})
