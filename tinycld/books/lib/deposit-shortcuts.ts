// The deposit's keys (bank deposit spec §3.2). The read view takes the letters of the
// documents' read views (DOCUMENT_READ_KEYS); the form takes the shared form keys plus the
// tick keys. Core's ⇧? list shows every registered key and ignores `when`, so a key is
// registered only while its action is offered (lib/deposit-read-actions.ts for the read
// view, `depositFormKeysOffered` below for the form).

import type { DepositReadAction } from './deposit-read-actions'
import { DOCUMENT_READ_KEYS } from './document-actions'
import { FORM_KEYS, type FormKeyAction } from './entry-shortcuts'

// The ⇧? group of every deposit key.
export const DEPOSIT_SHORTCUT_GROUP = 'Bank deposit'

export const DEPOSIT_READ_KEYS: Record<DepositReadAction, string> = {
    edit: DOCUMENT_READ_KEYS.edit,
    void: DOCUMENT_READ_KEYS.void,
    entry: DOCUMENT_READ_KEYS.entry,
}

export const DEPOSIT_READ_DESCRIPTIONS: Record<DepositReadAction, string> = {
    edit: 'Edit',
    void: 'Void',
    entry: 'View journal entry',
}

// The form's keys (spec §3.2): the shared form keys of the document bars (FORM_KEYS), and
// ⌥A (tick every listed item, or clear them when all are ticked) and ⌥⌫ (Clear selection).
export type DepositFormKeyAction = FormKeyAction | 'selectAll' | 'clearSelection'

export const DEPOSIT_FORM_KEYS: Record<DepositFormKeyAction, string> = {
    ...FORM_KEYS,
    selectAll: 'Alt+a',
    clearSelection: 'Alt+Backspace',
}

export const DEPOSIT_FORM_DESCRIPTIONS: Record<DepositFormKeyAction, string> = {
    post: 'Post',
    postAndNew: 'Post & new',
    saveDraft: 'Save draft',
    cancel: 'Cancel',
    deleteDraft: 'Delete draft',
    selectAll: 'Select all',
    clearSelection: 'Clear selection',
}

const WRITE_KEYS: readonly DepositFormKeyAction[] = ['post', 'postAndNew', 'saveDraft']

export type DepositFormKeyState = {
    // The form's scope is the top one (no other screen layer holds the keys).
    holdsKeys: boolean
    // The user may record deposits (bookkeeper or admin).
    canWrite: boolean
    // A save, post or delete runs (the save store holds the deposit).
    isWriteHeld: boolean
    // A dialog (Discard, Delete draft) is open; it pushes its own scope.
    isDialogOpen: boolean
    // The form is a stored draft, so Delete draft is offered.
    isSavedDraft: boolean
    // core useWritesAvailable: false while the server cannot be reached.
    writesAvailable: boolean
    // The phone bar draws Post & new and Delete draft in More. They stay offered there, so
    // the set below does not change with it; useDepositShortcuts registers ⌘⇧↵ itself on
    // a phone bar because no drawn button owns it.
    isPhoneBar: boolean
}

/**
 * The form keys whose action is offered right now (spec §3.2: "A key does nothing when its
 * button is hidden, disabled or busy, or the user cannot write. While a dialog is open the
 * screen's keys do nothing"). Core's ⇧? list ignores `when`, so a key is registered only
 * while this lists it. Every key is off while a write runs, as the bar's buttons are busy;
 * the write keys are off without write access or while writes are unavailable, and the
 * tick keys stay (the tick boxes stay usable offline).
 */
export function depositFormKeysOffered(state: DepositFormKeyState): DepositFormKeyAction[] {
    if (!state.holdsKeys || state.isDialogOpen || state.isWriteHeld) return []
    const canWriteNow = state.canWrite && state.writesAvailable
    const writes = canWriteNow ? [...WRITE_KEYS] : []
    const deleteDraft: DepositFormKeyAction[] =
        canWriteNow && state.isSavedDraft ? ['deleteDraft'] : []
    return [...writes, 'cancel', ...deleteDraft, 'selectAll', 'clearSelection']
}
