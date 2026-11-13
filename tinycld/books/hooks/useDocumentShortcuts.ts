import { type Shortcut, useRegisterShortcuts, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useId, useMemo, useRef } from 'react'
import { DOCUMENT_PDF_KEY } from '../lib/document-actions'
import { FORM_KEYS, QUOTE_FORM_KEYS } from '../lib/entry-shortcuts'
import type { SalesDocumentKind } from '../lib/sales-document-kinds'

interface DocumentShortcutsInput {
    // The kind's shortcut group, the prefix of the key ids, and its lifecycle (which bar
    // the form draws).
    kind: Pick<SalesDocumentKind, 'key' | 'shortcutGroup' | 'lifecycle'>
    isSaving: boolean
    // The form is a saved draft the user may delete.
    canDeleteDraft: boolean
    deleteDraft: () => void
    // On a phone, Post & new (a quote's Save and Save & new) is a row of More, not a bar
    // button.
    isPhone: boolean
    postAndNew: () => void
    // A quote's Save and Save & new.
    save: () => void
    saveAndNew: () => void
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

type KeyRuns = Pick<
    DocumentShortcutsInput,
    'deleteDraft' | 'postAndNew' | 'save' | 'saveAndNew' | 'downloadPdf'
>

interface KeyListInput {
    idOf: (name: string) => string
    group: string
    isPhone: boolean
    state: { current: KeyState }
    run: { current: KeyRuns }
}

// A More row's key: it fires while the row would take a press.
function writeKey(
    { idOf, group, state }: KeyListInput,
    name: string,
    keys: string,
    description: string,
    run: () => void
): Shortcut {
    return {
        id: idOf(name),
        keys,
        scope: 'compose',
        description,
        group,
        allowInInputs: true,
        when: () => state.current.writesAvailable && !state.current.isSaving,
        run,
    }
}

// ⌘S while the bar's (or the More row's) save cannot take it: offline, or a save runs.
function idleSaveKey(
    { idOf, group, state }: KeyListInput,
    keys: string,
    description: string
): Shortcut {
    return {
        id: idOf('saveIdle'),
        keys,
        scope: 'compose',
        description,
        group,
        allowInInputs: true,
        when: () => state.current.isSaving || !state.current.writesAvailable,
        run: () => {},
    }
}

function downloadPdfKey({ idOf, group, state, run }: KeyListInput): Shortcut {
    return {
        id: idOf('downloadPdf'),
        keys: DOCUMENT_PDF_KEY,
        scope: 'compose',
        description: 'Download PDF',
        group,
        allowInInputs: true,
        run: () => {
            if (state.current.canDownloadPdf) run.current.downloadPdf()
        },
    }
}

function postingKeys(input: KeyListInput): Shortcut[] {
    const { idOf, group, state, run, isPhone } = input
    const deleteDraft: Shortcut = {
        id: idOf('deleteDraft'),
        keys: FORM_KEYS.deleteDraft,
        scope: 'compose',
        description: 'Delete draft',
        group,
        allowInInputs: true,
        when: () => {
            const current = state.current
            return current.canDeleteDraft && current.writesAvailable && !current.isSaving
        },
        run: () => run.current.deleteDraft(),
    }
    const keys = [
        deleteDraft,
        idleSaveKey(input, FORM_KEYS.saveDraft, 'Save draft'),
        downloadPdfKey(input),
    ]
    if (!isPhone) return keys
    const postAndNew = writeKey(input, 'postAndNew', FORM_KEYS.postAndNew, 'Post & new', () =>
        run.current.postAndNew()
    )
    return [...keys, postAndNew]
}

function quoteKeys(input: KeyListInput): Shortcut[] {
    const { run, isPhone } = input
    const keys = [idleSaveKey(input, QUOTE_FORM_KEYS.save, 'Save'), downloadPdfKey(input)]
    if (!isPhone) return keys
    const save = writeKey(input, 'save', QUOTE_FORM_KEYS.save, 'Save', () => run.current.save())
    const saveAndNew = writeKey(input, 'saveAndNew', QUOTE_FORM_KEYS.saveAndNew, 'Save & new', () =>
        run.current.saveAndNew()
    )
    return [...keys, save, saveAndNew]
}

/**
 * A sales document form's keys that have no button of their own, in the form's `compose`
 * scope: core dialogs and sheets push a `modal` scope above it, so none fires while one
 * is open, and Escape closes only the top layer. The bar's buttons hold their own keys
 * (DocumentActionBar, DocumentSaveBar); a key is never held by a button and here both.
 *
 * Posting kinds (Cancel Esc, Save draft ⌘S, Post ⌘↵ and, on a wide screen, Post & new ⌘⇧↵
 * are bar buttons):
 * - ⌘⌫ Delete draft: the row sits in More on every width, so the key is registered here
 *   and does what the row does.
 * - ⌘⇧↵ Post & new on a phone, where its row sits in More: registered only there.
 *
 * A quote (Cancel Esc and Save & close ⌘↵ are bar buttons on every width; Save ⌘S and
 * Save & new ⌘⇧↵ on a wide screen):
 * - ⌘S Save and ⌘⇧↵ Save & new on a phone, where their rows sit in More: registered only
 *   there.
 *
 * Both:
 * - ⌘S while the save that holds it cannot take it (offline, or a save runs): that key is
 *   idle then, and the browser's Save Page would open. This one takes the key and does
 *   nothing. The ⇧? list shows the save for both registrations, as it groups by keys and
 *   does not read `when`.
 * - ⌘P Download PDF: the row sits in More. The key is always taken, so the browser's
 *   Print never opens; it downloads only when the row would take a press.
 *
 * The state is read at press time through a ref, so a render never re-registers; the id
 * is per instance, so a form replacing another cannot unregister the new one's keys.
 */
export function useDocumentShortcuts({
    kind,
    isSaving,
    canDeleteDraft,
    deleteDraft,
    isPhone,
    postAndNew,
    save,
    saveAndNew,
    canDownloadPdf,
    downloadPdf,
}: DocumentShortcutsInput) {
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
    const runRef = useRef<KeyRuns>({ deleteDraft, postAndNew, save, saveAndNew, downloadPdf })
    runRef.current = { deleteDraft, postAndNew, save, saveAndNew, downloadPdf }
    const { key: kindKey, shortcutGroup: group, lifecycle } = kind
    const shortcuts = useMemo<Shortcut[]>(() => {
        const input: KeyListInput = {
            idOf: name => `books.${kindKey}.form.${instance}.${name}`,
            group,
            isPhone,
            state: stateRef,
            run: runRef,
        }
        return lifecycle === 'quote' ? quoteKeys(input) : postingKeys(input)
    }, [instance, isPhone, kindKey, group, lifecycle])
    useRegisterShortcuts(shortcuts, scopeOwner)
    return { scopeOwner }
}
