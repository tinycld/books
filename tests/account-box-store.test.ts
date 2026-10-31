import { describe, expect, it } from 'vitest'
import { heldAccountIds, visibleRefusal } from '../tinycld/books/stores/account-box-store'

const REFUSED = 'You do not have permission to change 1099 boxes.'

describe('visibleRefusal', () => {
    it('shows nothing for an account with no refusal', () => {
        expect(visibleRefusal(undefined, '')).toBeNull()
        expect(visibleRefusal(undefined, 'nec_1')).toBeNull()
    })

    it('shows the refusal while the live box is still the box the write started from', () => {
        // A refused choice on an account with no box: the rollback puts the box back to ''.
        expect(visibleRefusal({ message: REFUSED, fromBox: '' }, '')).toBe(REFUSED)
        // A refused clear on a mapped account: the rollback puts its box back.
        expect(visibleRefusal({ message: REFUSED, fromBox: 'misc_8' }, 'misc_8')).toBe(REFUSED)
    })

    it('hides the refusal once the live box moves off the box the write started from', () => {
        // Another device sets a box on the account whose choice was refused.
        expect(visibleRefusal({ message: REFUSED, fromBox: '' }, 'misc_1')).toBeNull()
        // Another device clears the box whose clear was refused.
        expect(visibleRefusal({ message: REFUSED, fromBox: 'misc_8' }, '')).toBeNull()
    })
})

describe('heldAccountIds', () => {
    it('holds only the accounts whose write is pending, never a refused one', () => {
        const state = {
            pending: { software: 'nec_1' as const },
            refusals: { petty: { message: REFUSED, fromBox: 'misc_8' } },
        }
        const held = heldAccountIds(state)
        expect(held.has('software')).toBe(true)
        expect(held.has('petty')).toBe(false)
    })
})
