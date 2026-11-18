// The keys of a payment form and its read view (receive-payment spec §3.1, vendor refund
// spec §3.2). Pure, so the key map and when each key is registered are unit-tested. The
// keys are the same for every flow; the ⇧? group is the flow's chrome's and the three
// descriptions that name the document are the flow's texts. Core's ⇧? list shows every
// registered key and ignores `when`, so a key is registered only while its action is
// offered.

import { FORM_KEYS, type FormKeyAction } from './entry-shortcuts'
import type { PaymentFlowTexts } from './payment-flow'

export type PaymentFormKey = FormKeyAction | 'clearPayments' | 'payAll' | 'toggleRow'

export const PAYMENT_FORM_KEYS: Record<PaymentFormKey, string> = {
    ...FORM_KEYS,
    clearPayments: 'Alt+Backspace',
    payAll: 'Alt+a',
    toggleRow: 'Alt+Enter',
}

type DescriptionTexts = Pick<
    PaymentFlowTexts,
    'payAllDescription' | 'clearDescription' | 'toggleRowDescription'
>

// The ⇧? description of each form key, with the flow's words for the document.
export function paymentFormDescriptions(texts: DescriptionTexts): Record<PaymentFormKey, string> {
    return {
        post: 'Post',
        postAndNew: 'Post & new',
        saveDraft: 'Save draft',
        cancel: 'Cancel',
        deleteDraft: 'Delete draft',
        clearPayments: texts.clearDescription,
        payAll: texts.payAllDescription,
        toggleRow: texts.toggleRowDescription,
    }
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
