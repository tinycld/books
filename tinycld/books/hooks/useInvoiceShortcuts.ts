import { type Shortcut, useRegisterShortcuts, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useId, useMemo, useRef } from 'react'
import { FORM_KEYS } from '../lib/entry-shortcuts'
import { INVOICE_PDF_KEY } from '../lib/invoice-actions'

export const INVOICE_SHORTCUT_GROUP = 'Invoice'

interface InvoiceShortcutsInput {
    isSaving: boolean
    // The form is a saved draft the user may delete.
    canDeleteDraft: boolean
    deleteDraft: () => void
    // On a phone, Post & new is a row of More, not a bar button.
    isPhone: boolean
    postAndNew: () => void
    // A saved draft and no download running: the Download PDF row takes a press.
    canDownloadPdf: boolean
    downloadPdf: () => void
}

type KeyState = {
    isSaving: boolean
    canDeleteDraft: boolean
    canDownloadPdf: boolean
    writesAvailable: boolean
}

/**
 * The invoice form's keys that have no button of their own, in the form's `compose`
 * scope: core dialogs and sheets push a `modal` scope above it, so none fires while one
 * is open, and Escape closes only the top layer. Cancel (Esc), Save draft (⌘S), Post (⌘↵)
 * and, on a wide screen, Post & new (⌘⇧↵) are ShortcutButtons on the bar.
 *
 * - ⌘⌫ Delete draft: the row sits in More on every width, so the key is registered here
 *   and does what the row does.
 * - ⌘⇧↵ Post & new on a phone, where its row sits in More: registered only there, so the
 *   wide bar's button and this key never both hold it.
 * - ⌘S while the Save draft button cannot take it (offline, or a save runs): the button's
 *   own key is idle then, and the browser's Save Page would open. This one takes the key
 *   and does nothing. The ⇧? list shows Save draft for both registrations, as it groups
 *   by keys and does not read `when`.
 * - ⌘P Download PDF: the row sits in More. The key is always taken, so the browser's
 *   Print never opens; it downloads only when the row would take a press.
 *
 * The state is read at press time through a ref, so a render never re-registers; the id
 * is per instance, so a form replacing another cannot unregister the new one's keys.
 */
export function useInvoiceShortcuts({
    isSaving,
    canDeleteDraft,
    deleteDraft,
    isPhone,
    postAndNew,
    canDownloadPdf,
    downloadPdf,
}: InvoiceShortcutsInput) {
    const scopeOwner = useShortcutScope('compose')
    const instance = useId()
    const writes = useWritesAvailable()
    const stateRef = useRef<KeyState>({
        isSaving,
        canDeleteDraft,
        canDownloadPdf,
        writesAvailable: writes.available,
    })
    stateRef.current = {
        isSaving,
        canDeleteDraft,
        canDownloadPdf,
        writesAvailable: writes.available,
    }
    const runRef = useRef({ deleteDraft, postAndNew, downloadPdf })
    runRef.current = { deleteDraft, postAndNew, downloadPdf }
    const shortcuts = useMemo<Shortcut[]>(() => {
        const keys: Shortcut[] = [
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
                run: () => runRef.current.deleteDraft(),
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
            {
                id: `books.invoice.form.${instance}.downloadPdf`,
                keys: INVOICE_PDF_KEY,
                scope: 'compose',
                description: 'Download PDF',
                group: INVOICE_SHORTCUT_GROUP,
                allowInInputs: true,
                run: () => {
                    if (stateRef.current.canDownloadPdf) runRef.current.downloadPdf()
                },
            },
        ]
        if (!isPhone) return keys
        const postAndNewKey: Shortcut = {
            id: `books.invoice.form.${instance}.postAndNew`,
            keys: FORM_KEYS.postAndNew,
            scope: 'compose',
            description: 'Post & new',
            group: INVOICE_SHORTCUT_GROUP,
            allowInInputs: true,
            when: () => {
                const state = stateRef.current
                return state.writesAvailable && !state.isSaving
            },
            run: () => runRef.current.postAndNew(),
        }
        return [...keys, postAndNewKey]
    }, [instance, isPhone])
    useRegisterShortcuts(shortcuts, scopeOwner)
    return { scopeOwner }
}
