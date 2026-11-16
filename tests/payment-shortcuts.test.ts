import { describe, expect, it } from 'vitest'
import { FORM_KEYS } from '../tinycld/books/lib/entry-shortcuts'
import { PAYMENT_CHROME } from '../tinycld/books/lib/payment-kind'
import {
    PAYMENT_FORM_KEYS,
    PAYMENT_READ_KEYS,
    type PaymentFormKeyState,
    paymentFormKeysOffered,
} from '../tinycld/books/lib/payment-shortcuts'

// The receive-payment keys (spec §3.1): the key map, its ⇧? group, and which form keys are
// registered in which state (a key is registered only while its action is offered).

// A writer's new form that holds the keys, idle, no dialog, writes available.
const IDLE: PaymentFormKeyState = {
    holdsKeys: true,
    canWrite: true,
    isWriteHeld: false,
    isDialogOpen: false,
    isSavedDraft: false,
    writesAvailable: true,
}

function offered(state: Partial<PaymentFormKeyState>) {
    return [...paymentFormKeysOffered({ ...IDLE, ...state })].sort()
}

describe('the payment key map', () => {
    it('is ⌘↵, ⌘⇧↵, ⌘S, Esc, ⌘⌫, ⌥⌫, ⌥A and ⌥↵ on the form', () => {
        expect(PAYMENT_FORM_KEYS).toEqual({
            post: '$mod+Enter',
            postAndNew: '$mod+Shift+Enter',
            saveDraft: '$mod+s',
            cancel: 'Escape',
            deleteDraft: '$mod+Backspace',
            clearPayments: 'Alt+Backspace',
            payAll: 'Alt+a',
            toggleRow: 'Alt+Enter',
        })
        expect(PAYMENT_FORM_KEYS).toMatchObject(FORM_KEYS)
    })

    it('is E, V and J on the read view', () => {
        expect(PAYMENT_READ_KEYS).toEqual({ edit: 'e', void: 'v', entry: 'j' })
    })

    it('is listed in the group Receive payment', () => {
        expect(PAYMENT_CHROME.shortcutGroup).toBe('Receive payment')
    })
})

describe('paymentFormKeysOffered', () => {
    it('offers every form key but Delete draft on a new form', () => {
        expect(offered({})).toEqual(
            [
                'post',
                'postAndNew',
                'saveDraft',
                'cancel',
                'clearPayments',
                'payAll',
                'toggleRow',
            ].sort()
        )
    })

    it('offers Delete draft only on a saved draft', () => {
        expect(offered({})).not.toContain('deleteDraft')
        expect(offered({ isSavedDraft: true })).toContain('deleteDraft')
    })

    it('offers no form key while a write is held', () => {
        expect(offered({ isWriteHeld: true, isSavedDraft: true })).toEqual([])
    })

    it('offers no form key while the Discard or Delete draft dialog is open', () => {
        expect(offered({ isDialogOpen: true, isSavedDraft: true })).toEqual([])
    })

    it('offers no form key to a user who cannot write', () => {
        expect(offered({ canWrite: false, isSavedDraft: true })).toEqual([])
    })

    it('offers no form key while the form does not hold the keys', () => {
        expect(offered({ holdsKeys: false, isSavedDraft: true })).toEqual([])
    })

    // ⌘S is always taken while the form holds the keys, so the browser's Save Page never
    // opens; Post and Post & new go with their disabled buttons.
    it('keeps ⌘S while writes are unavailable, but not Post or Post & new', () => {
        const keys = offered({ writesAvailable: false })
        expect(keys).toContain('saveDraft')
        expect(keys).toContain('cancel')
        expect(keys).not.toContain('post')
        expect(keys).not.toContain('postAndNew')
    })
})
