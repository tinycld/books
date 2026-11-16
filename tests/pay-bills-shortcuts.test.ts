import { describe, expect, it } from 'vitest'
import { BILL_PAYMENT_CHROME, PAY_BILLS_CHROME } from '../tinycld/books/lib/pay-bills-kind'
import {
    type PayBillsKeyState,
    payBillsKeysOffered,
} from '../tinycld/books/lib/pay-bills-shortcuts'

// Which Pay Bills keys are registered (spec §3.1): core's ⇧? list shows every registered
// key, so a key is registered only while its action is offered. Pay ⌘↵ (Save on
// `replaces`), Pay & new ⌘⇧↵, Cancel Esc, ⌥A, ⌥⌫, ⌥↵ — all in the group "Pay bills".

// A writer's new Pay Bills screen that holds the keys, idle, with shown and paid rows.
const IDLE: PayBillsKeyState = {
    holdsKeys: true,
    canWrite: true,
    isWriteHeld: false,
    isDialogOpen: false,
    writesAvailable: true,
    mode: 'new',
    hasShownRows: true,
    hasPaidRows: true,
}

function offered(state: Partial<PayBillsKeyState>) {
    return [...payBillsKeysOffered({ ...IDLE, ...state })].sort()
}

describe('the Pay Bills key group', () => {
    it('is Pay bills on the screen and on the bill payment read view', () => {
        expect(PAY_BILLS_CHROME.shortcutGroup).toBe('Pay bills')
        expect(BILL_PAYMENT_CHROME.shortcutGroup).toBe('Pay bills')
    })
})

describe('payBillsKeysOffered', () => {
    it('offers Pay, Pay & new, Cancel, ⌥A, ⌥⌫ and ⌥↵ on an idle new screen, and no draft key', () => {
        expect(offered({})).toEqual(
            ['post', 'postAndNew', 'cancel', 'payAll', 'clearPayments', 'toggleRow'].sort()
        )
    })

    it('offers no key to a reader', () => {
        expect(offered({ canWrite: false })).toEqual([])
    })

    it('offers no Pay or Pay & new while writes are unavailable, but keeps Cancel', () => {
        const keys = offered({ writesAvailable: false })
        expect(keys).not.toContain('post')
        expect(keys).not.toContain('postAndNew')
        expect(keys).toContain('cancel')
    })

    it('offers no key while a Pay runs', () => {
        expect(offered({ isWriteHeld: true })).toEqual([])
    })

    it('never offers Pay & new on replaces, but offers Save', () => {
        const keys = offered({ mode: 'replaces' })
        expect(keys).not.toContain('postAndNew')
        expect(keys).toContain('post')
    })

    it('offers no ⌥A with no shown row', () => {
        expect(offered({ hasShownRows: false })).not.toContain('payAll')
    })

    it('offers no ⌥⌫ with no paid row', () => {
        expect(offered({ hasPaidRows: false })).not.toContain('clearPayments')
        expect(offered({ hasPaidRows: false })).toContain('payAll')
    })

    it('offers no key while a dialog is open', () => {
        expect(offered({ isDialogOpen: true })).toEqual([])
    })

    it('offers no key while the screen does not hold the keys', () => {
        expect(offered({ holdsKeys: false })).toEqual([])
    })
})
