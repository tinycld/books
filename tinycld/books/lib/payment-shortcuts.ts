// The receive-payment keys (spec §3.1). Pure, so the key map and when each key is
// registered are unit-tested. Core's ⇧? list shows every registered key and ignores
// `when`, so a key is registered only while its action is offered.

import { FORM_KEYS, type FormKeyAction } from './entry-shortcuts'

export type PaymentFormKey = FormKeyAction | 'clearPayments' | 'payAll' | 'toggleRow'

export const PAYMENT_FORM_KEYS: Record<PaymentFormKey, string> = {
    ...FORM_KEYS,
    clearPayments: 'Alt+Backspace',
    payAll: 'Alt+a',
    toggleRow: 'Alt+Enter',
}

export const PAYMENT_FORM_DESCRIPTIONS: Record<PaymentFormKey, string> = {
    post: 'Post',
    postAndNew: 'Post & new',
    saveDraft: 'Save draft',
    cancel: 'Cancel',
    deleteDraft: 'Delete draft',
    clearPayments: 'Clear payments',
    payAll: 'Pay every listed invoice in full',
    toggleRow: 'Pay this invoice in full, or clear it',
}

export type PaymentReadKey = 'edit' | 'void' | 'entry'

// The letters of the documents' read views (DOCUMENT_READ_KEYS).
export const PAYMENT_READ_KEYS: Record<PaymentReadKey, string> = {
    edit: 'e',
    void: 'v',
    entry: 'j',
}

export const PAYMENT_READ_DESCRIPTIONS: Record<PaymentReadKey, string> = {
    edit: 'Edit',
    void: 'Void',
    entry: 'View journal entry',
}

export type PaymentFormKeyState = {
    // The form is the screen's focused surface (no other screen holds the keys).
    holdsKeys: boolean
    canWrite: boolean
    // A save, post or delete runs (the save store holds the form).
    isWriteHeld: boolean
    // The Discard or Delete draft dialog is open.
    isDialogOpen: boolean
    // The form shows a saved draft, so More holds Delete draft.
    isSavedDraft: boolean
    // Writes are available (online, not read-only).
    writesAvailable: boolean
}

// The form keys to register in this state. Cancel and the row keys edit nothing on the
// server, so they stay while writes are unavailable; ⌘S stays too, so the browser's Save
// Page never opens (it saves only when Save draft would); Post, Post & new and Delete
// draft go with their disabled buttons.
export function paymentFormKeysOffered(state: PaymentFormKeyState): PaymentFormKey[] {
    if (!state.holdsKeys || !state.canWrite || state.isWriteHeld || state.isDialogOpen) return []
    const local: PaymentFormKey[] = ['cancel', 'saveDraft', 'clearPayments', 'payAll', 'toggleRow']
    if (!state.writesAvailable) return local
    const draft: PaymentFormKey[] = state.isSavedDraft ? ['deleteDraft'] : []
    return ['post', 'postAndNew', ...local, ...draft]
}
