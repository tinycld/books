import { type Shortcut, useRegisterShortcuts, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useId, useMemo, useRef } from 'react'
import { DOCUMENT_PDF_KEY } from '../lib/document-actions'
import { FORM_KEYS, QUOTE_FORM_KEYS } from '../lib/entry-shortcuts'
import type { SalesDocumentKind } from '../lib/sales-document-kinds'

interface DocumentShortcutsInput {
    // The kind's shortcut group, the prefix of the key ids, and its lifecycle (which bar
    // the form draws), and its features (⌘P only with a PDF).
    kind: Pick<SalesDocumentKind, 'key' | 'shortcutGroup' | 'lifecycle' | 'noun' | 'features'>
    isSaving: boolean
    // The form's Delete is offered: a saved posting draft (Delete draft), or a saved
    // quote that is not closed (Delete estimate).
    canDelete: boolean
    deleteRecord: () => void
    // On a phone, Post & new (a quote's Save, Save & new, Convert and Delete) is a row of
    // More, not a bar button.
    isPhone: boolean
    postAndNew: () => void
    // A quote's Save and Save & new.
    save: () => void
    saveAndNew: () => void
    // A quote's Convert to invoice, and whether it is offered now.
    canConvert: boolean
    convert: () => void
    // A stored estimate's Copy customer link, and whether it is offered now.
    canCopyLink: boolean
    copyLink: () => void
    // A saved draft and no download running: the Download PDF row takes a press.
    canDownloadPdf: boolean
    downloadPdf: () => void
}

type KeyState = {
    isSaving: boolean
    canDelete: boolean
    canConvert: boolean
    canCopyLink: boolean
    canDownloadPdf: boolean
    writesAvailable: boolean
}

type KeyRuns = Pick<
    DocumentShortcutsInput,
    'deleteRecord' | 'postAndNew' | 'save' | 'saveAndNew' | 'convert' | 'copyLink' | 'downloadPdf'
>

interface KeyListInput {
    idOf: (name: string) => string
    group: string
    // The kind's noun ("Estimate"), which names its Delete.
    noun: string
    isPhone: boolean
    // The kind has a PDF: only then is ⌘P registered.
    hasPdf: boolean
    // Whether a quote's Convert, Copy customer link and Delete are offered now: their keys
    // are registered only then, as the ⇧? list ignores `when`.
    canConvert: boolean
    canCopyLink: boolean
    canDelete: boolean
    state: { current: KeyState }
    run: { current: KeyRuns }
}

// A More row's key: it fires while the row would take a press (and, for a row shown only
// sometimes, while `isOffered` says it is shown).
function writeKey(
    { idOf, group, state }: KeyListInput,
    name: string,
    keys: string,
    description: string,
    run: () => void,
    isOffered: (current: KeyState) => boolean = () => true
): Shortcut {
    return {
        id: idOf(name),
        keys,
        scope: 'compose',
        description,
        group,
        allowInInputs: true,
        when: () => {
            const current = state.current
            return current.writesAvailable && !current.isSaving && isOffered(current)
        },
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

// ⌘P, as a list of none or one: a kind without a PDF leaves the key to the browser.
function downloadPdfKeys({ idOf, group, state, run, hasPdf }: KeyListInput): Shortcut[] {
    if (!hasPdf) return []
    const key: Shortcut = {
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
    return [key]
}

function postingKeys(input: KeyListInput): Shortcut[] {
    const { run, isPhone } = input
    const deleteDraft = writeKey(
        input,
        'deleteDraft',
        FORM_KEYS.deleteDraft,
        'Delete draft',
        () => run.current.deleteRecord(),
        current => current.canDelete
    )
    const keys = [
        deleteDraft,
        idleSaveKey(input, FORM_KEYS.saveDraft, 'Save draft'),
        ...downloadPdfKeys(input),
    ]
    if (!isPhone) return keys
    const postAndNew = writeKey(input, 'postAndNew', FORM_KEYS.postAndNew, 'Post & new', () =>
        run.current.postAndNew()
    )
    return [...keys, postAndNew]
}

function quoteKeys(input: KeyListInput): Shortcut[] {
    const { run, isPhone, canConvert, canCopyLink, canDelete } = input
    const keys = [idleSaveKey(input, QUOTE_FORM_KEYS.save, 'Save'), ...downloadPdfKeys(input)]
    if (!isPhone) return keys
    const save = writeKey(input, 'save', QUOTE_FORM_KEYS.save, 'Save', () => run.current.save())
    const saveAndNew = writeKey(input, 'saveAndNew', QUOTE_FORM_KEYS.saveAndNew, 'Save & new', () =>
        run.current.saveAndNew()
    )
    const phoneKeys = [...keys, save, saveAndNew]
    const convert = writeKey(
        input,
        'convert',
        QUOTE_FORM_KEYS.convert,
        'Convert to invoice',
        () => run.current.convert(),
        current => current.canConvert
    )
    const copyLink = writeKey(
        input,
        'copyLink',
        QUOTE_FORM_KEYS.copyLink,
        'Copy customer link',
        () => run.current.copyLink(),
        current => current.canCopyLink
    )
    const remove = writeKey(
        input,
        'deleteRecord',
        QUOTE_FORM_KEYS.deleteRecord,
        `Delete ${input.noun.toLowerCase()}`,
        () => run.current.deleteRecord(),
        current => current.canDelete
    )
    if (canConvert) phoneKeys.push(convert)
    if (canCopyLink) phoneKeys.push(copyLink)
    if (canDelete) phoneKeys.push(remove)
    return phoneKeys
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
 * - ⌘S Save, ⌘⇧↵ Save & new, ⌥I Convert to invoice, ⌥L Copy customer link and ⌘⌫
 *   Delete on a phone, where their rows sit in More: registered only there, ⌥I, ⌥L and
 *   ⌘⌫ only while their rows are offered (`canConvert`, `canCopyLink`, `canDelete`). On
 *   a wide screen the Convert, Copy customer link and Delete buttons hold ⌥I, ⌥L and
 *   ⌘⌫, while they are offered.
 *
 * Both:
 * - ⌘S while the save that holds it cannot take it (offline, or a save runs): that key is
 *   idle then, and the browser's Save Page would open. This one takes the key and does
 *   nothing. The ⇧? list shows the save for both registrations, as it groups by keys and
 *   does not read `when`.
 * - ⌘P Download PDF, on a kind with a PDF (`features.pdf`): the row sits in More. The
 *   key is always taken, so the browser's Print never opens; it downloads only when the
 *   row would take a press. A kind without a PDF registers no ⌘P.
 *
 * The state is read at press time through a ref, so a render never re-registers; the id
 * is per instance, so a form replacing another cannot unregister the new one's keys.
 */
export function useDocumentShortcuts({
    kind,
    isSaving,
    canDelete,
    deleteRecord,
    isPhone,
    postAndNew,
    save,
    saveAndNew,
    canConvert,
    convert,
    canCopyLink,
    copyLink,
    canDownloadPdf,
    downloadPdf,
}: DocumentShortcutsInput) {
    const scopeOwner = useShortcutScope('compose')
    const instance = useId()
    const writes = useWritesAvailable()
    const keyState: KeyState = {
        isSaving,
        canDelete,
        canConvert,
        canCopyLink,
        canDownloadPdf,
        writesAvailable: writes.available,
    }
    const stateRef = useRef<KeyState>(keyState)
    stateRef.current = keyState
    const runs: KeyRuns = {
        deleteRecord,
        postAndNew,
        save,
        saveAndNew,
        convert,
        copyLink,
        downloadPdf,
    }
    const runRef = useRef<KeyRuns>(runs)
    runRef.current = runs
    const { key: kindKey, shortcutGroup: group, lifecycle, noun } = kind
    const hasPdf = kind.features.pdf
    const shortcuts = useMemo<Shortcut[]>(() => {
        const input: KeyListInput = {
            idOf: name => `books.${kindKey}.form.${instance}.${name}`,
            group,
            noun,
            isPhone,
            hasPdf,
            canConvert,
            canCopyLink,
            canDelete,
            state: stateRef,
            run: runRef,
        }
        return lifecycle === 'quote' ? quoteKeys(input) : postingKeys(input)
    }, [
        instance,
        isPhone,
        hasPdf,
        kindKey,
        group,
        noun,
        lifecycle,
        canConvert,
        canCopyLink,
        canDelete,
    ])
    useRegisterShortcuts(shortcuts, scopeOwner)
    return { scopeOwner }
}
