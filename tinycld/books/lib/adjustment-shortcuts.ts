// The inventory adjustment form's keys (inventory-adjust spec §3.4): the shared form keys
// of the document bars (FORM_KEYS) in the ⇧? group "Inventory adjustment", and the
// deposit's line keys, ⌥↵ (Add line) and ⌘⌥⌫ (Remove the line that holds the focus), in
// the group "Lines". Core's ⇧? list shows every registered key and ignores `when`, so a
// key is registered only while `adjustmentFormKeysOffered` lists it.

import { canAddAdjustmentLine } from './adjustment-values'
import { DEPOSIT_FORM_KEYS } from './deposit-shortcuts'
import { FORM_KEYS, type FormKeyAction } from './entry-shortcuts'

// The ⇧? group of the line keys; the bar's keys take ADJUSTMENT_SHORTCUT_GROUP
// (lib/adjustment-kind.ts).
export const ADJUSTMENT_LINES_GROUP = 'Lines'

export type AdjustmentLineKeyAction = 'addLine' | 'removeLine'

export type AdjustmentFormKeyAction = FormKeyAction | AdjustmentLineKeyAction

export const ADJUSTMENT_FORM_KEYS: Record<AdjustmentFormKeyAction, string> = {
    ...FORM_KEYS,
    addLine: DEPOSIT_FORM_KEYS.addLine,
    removeLine: DEPOSIT_FORM_KEYS.removeLine,
}

export const ADJUSTMENT_FORM_DESCRIPTIONS: Record<AdjustmentFormKeyAction, string> = {
    post: 'Post',
    postAndNew: 'Post & new',
    saveDraft: 'Save draft',
    cancel: 'Cancel',
    deleteDraft: 'Delete draft',
    addLine: 'Add line',
    removeLine: 'Remove line',
}

const LINE_KEYS: ReadonlySet<AdjustmentFormKeyAction> = new Set(['addLine', 'removeLine'])

/** Whether a key belongs to the ⇧? group "Lines" (else "Inventory adjustment"). */
export function isAdjustmentLineKey(action: AdjustmentFormKeyAction): boolean {
    return LINE_KEYS.has(action)
}

export type AdjustmentFormKeyState = {
    // The form's scope is the top one (no other screen layer holds the keys).
    holdsKeys: boolean
    // The user may record inventory adjustments (bookkeeper or admin).
    canWrite: boolean
    // core useWritesAvailable: false while the server cannot be reached.
    writesAvailable: boolean
    // A save, post or delete runs (stores/adjustment-save-store.ts holds the adjustment).
    isWriteHeld: boolean
    // A dialog (Discard, Delete draft) is open; it pushes its own scope.
    isDialogOpen: boolean
    // The form is a stored draft, so Delete draft is offered.
    isSavedDraft: boolean
    // The lines the form holds.
    lineCount: number
    // The focus is inside a line (the line container's focus events).
    isLineFocused: boolean
}

/**
 * The form keys whose action is offered right now. Every key is off while a write runs
 * (the bar's buttons are busy), while a dialog is open, and while another layer holds the
 * keys. The write keys (Post, Post & new, Save draft, Delete draft) are off without write
 * access or while writes are unavailable; Cancel stays. ⌘⌫ is offered on a saved draft
 * only. ⌥↵ is offered to a writer while the form holds fewer than 500 lines, also offline
 * (adding a line writes nothing); ⌘⌥⌫ only while the focus is inside a line.
 */
export function adjustmentFormKeysOffered(
    state: AdjustmentFormKeyState
): AdjustmentFormKeyAction[] {
    if (!state.holdsKeys || state.isDialogOpen || state.isWriteHeld) return []
    const canWriteNow = state.canWrite && state.writesAvailable
    const writes: AdjustmentFormKeyAction[] = canWriteNow ? ['post', 'postAndNew', 'saveDraft'] : []
    const deleteDraft: AdjustmentFormKeyAction[] =
        canWriteNow && state.isSavedDraft ? ['deleteDraft'] : []
    const addLine: AdjustmentFormKeyAction[] =
        state.canWrite && canAddAdjustmentLine(state.lineCount) ? ['addLine'] : []
    const removeLine: AdjustmentFormKeyAction[] =
        state.canWrite && state.isLineFocused && state.lineCount > 0 ? ['removeLine'] : []
    return [...writes, 'cancel', ...deleteDraft, ...addLine, ...removeLine]
}
