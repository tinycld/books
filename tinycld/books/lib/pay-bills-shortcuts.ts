// The Pay Bills keys (spec §3.1): the receive-payment form keys (PAYMENT_FORM_KEYS) with
// the Pay Bills words, all in the ⇧? group "Pay bills". Pure, so when each key is
// registered is unit-tested: core's ⇧? list shows every registered key and ignores
// `when`, so a key is registered only while its action is offered.

import type { PaymentFormKey } from './payment-shortcuts'

export const PAY_BILLS_KEY_DESCRIPTIONS: Record<
    Exclude<PaymentFormKey, 'saveDraft' | 'deleteDraft'>,
    string
> = {
    post: 'Pay',
    postAndNew: 'Pay & new',
    cancel: 'Cancel',
    payAll: 'Pay every shown bill in full, or clear them',
    clearPayments: 'Clear payments',
    toggleRow: 'Pay this row in full, or clear it',
}

// On `?replaces` the primary action is Save.
export const PAY_BILLS_SAVE_DESCRIPTION = 'Save'

export type PayBillsKeyState = {
    // The form is the screen's focused surface (no other screen holds the keys).
    holdsKeys: boolean
    canWrite: boolean
    // A Pay runs (the store holds the form).
    isWriteHeld: boolean
    // The Discard dialog is open.
    isDialogOpen: boolean
    // Writes are available (online, not read-only).
    writesAvailable: boolean
    mode: 'new' | 'replaces'
    // The filters keep at least one row: ⌥A and ⌥↵ have a row to pay.
    hasShownRows: boolean
    // A row has a payment: ⌥⌫ has something to clear.
    hasPaidRows: boolean
}

// The keys to register in this state. Cancel and the row keys write nothing, so they stay
// while writes are unavailable; Pay and Pay & new go with their disabled buttons. There is
// no draft, so no Save draft or Delete draft key.
export function payBillsKeysOffered(state: PayBillsKeyState): PaymentFormKey[] {
    if (!state.holdsKeys || !state.canWrite || state.isWriteHeld || state.isDialogOpen) return []
    const rows: PaymentFormKey[] = state.hasShownRows ? ['payAll', 'toggleRow'] : []
    const clear: PaymentFormKey[] = state.hasPaidRows ? ['clearPayments'] : []
    const local: PaymentFormKey[] = ['cancel', ...rows, ...clear]
    if (!state.writesAvailable) return local
    const writes: PaymentFormKey[] = state.mode === 'new' ? ['post', 'postAndNew'] : ['post']
    return [...writes, ...local]
}
