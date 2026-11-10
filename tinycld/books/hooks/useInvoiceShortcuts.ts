import { type Shortcut, useRegisterShortcuts, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useId, useMemo, useRef } from 'react'
import { FORM_KEYS } from '../lib/entry-shortcuts'

export const INVOICE_SHORTCUT_GROUP = 'Invoice'

interface InvoiceShortcutsInput {
    isSaving: boolean
    // The form is a saved draft the user may delete.
    canDeleteDraft: boolean
    deleteDraft: () => void
}

type KeyState = { isSaving: boolean; canDeleteDraft: boolean; writesAvailable: boolean }

/**
 * The invoice form's keys that have no button of their own, in the form's `compose`
 * scope: core dialogs and sheets push a `modal` scope above it, so none fires while one
 * is open, and Escape closes only the top layer. Cancel (Esc) and Save draft (⌘S) are
 * ShortcutButtons on the bar.
 *
 * - ⌘⌫ Delete draft: the row sits in More on every width, so the key is registered here
 *   and does what the row does.
 * - ⌘S while the Save draft button cannot take it (offline, or a save runs): the button's
 *   own key is idle then, and the browser's Save Page would open. This one takes the key
 *   and does nothing. The ⇧? list shows Save draft for both registrations, as it groups
 *   by keys and does not read `when`.
 *
 * The state is read at press time through a ref, so a render never re-registers; the id
 * is per instance, so a form replacing another cannot unregister the new one's keys.
 */
export function useInvoiceShortcuts({
    isSaving,
    canDeleteDraft,
    deleteDraft,
}: InvoiceShortcutsInput) {
    const scopeOwner = useShortcutScope('compose')
    const instance = useId()
    const writes = useWritesAvailable()
    const stateRef = useRef<KeyState>({
        isSaving,
        canDeleteDraft,
        writesAvailable: writes.available,
    })
    stateRef.current = { isSaving, canDeleteDraft, writesAvailable: writes.available }
    const deleteRef = useRef(deleteDraft)
    deleteRef.current = deleteDraft
    const shortcuts = useMemo<Shortcut[]>(
        () => [
            {
                id: `books.invoice.form.${instance}.deleteDraft`,
                keys: FORM_KEYS.deleteDraft,
                scope: 'compose',
                description: 'Delete draft',
                group: INVOICE_SHORTCUT_GROUP,
                allowInInputs: true,
                when: () => {
                    const state = stateRef.current
                    return state.canDeleteDraft && state.writesAvailable && !state.isSaving
                },
                run: () => deleteRef.current(),
            },
            {
                id: `books.invoice.form.${instance}.saveDraftIdle`,
                keys: FORM_KEYS.saveDraft,
                scope: 'compose',
                description: 'Save draft',
                group: INVOICE_SHORTCUT_GROUP,
                allowInInputs: true,
                when: () => {
                    const state = stateRef.current
                    return state.isSaving || !state.writesAvailable
                },
                run: () => {},
            },
        ],
        [instance]
    )
    useRegisterShortcuts(shortcuts, scopeOwner)
    return { scopeOwner }
}
