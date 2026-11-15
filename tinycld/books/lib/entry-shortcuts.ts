import type { Shortcut } from '@tinycld/core/lib/shortcuts'
import type { EntryActionId } from './entry-actions'

// The keys of the transfer and journal entry forms (both draw EntryActionBar) and of their
// read views. Pure, so the key map and when each key may fire are unit-tested.

// A group name in a shortcut id: `Journal entry` → `journal-entry`.
export function shortcutGroupSlug(group: string): string {
    return group.toLowerCase().replace(/\s+/g, '-')
}

export type FormKeyAction = 'post' | 'postAndNew' | 'saveDraft' | 'cancel' | 'deleteDraft'

export const FORM_KEYS: Record<FormKeyAction, string> = {
    post: '$mod+Enter',
    postAndNew: '$mod+Shift+Enter',
    saveDraft: '$mod+s',
    cancel: 'Escape',
    deleteDraft: '$mod+Backspace',
}

// The keys of a quote form (the estimate's DocumentSaveBar): no draft and no post, so the
// save keys take Post's places. ⌥I for Convert follows the line keys ⌥T / ⌥S
// (lib/document-line-columns.ts); ⌘⇧I opens the browser's tools. ⌥L for Copy customer
// link uses the same modifier.
export type QuoteKeyAction =
    | 'saveAndClose'
    | 'saveAndNew'
    | 'save'
    | 'cancel'
    | 'deleteRecord'
    | 'convert'
    | 'copyLink'

export const QUOTE_FORM_KEYS: Record<QuoteKeyAction, string> = {
    saveAndClose: '$mod+Enter',
    saveAndNew: '$mod+Shift+Enter',
    save: '$mod+s',
    cancel: 'Escape',
    deleteRecord: '$mod+Backspace',
    convert: 'Alt+i',
    copyLink: 'Alt+l',
}

const FORM_DESCRIPTIONS: Record<FormKeyAction, string> = {
    post: 'Post',
    postAndNew: 'Post & new',
    saveDraft: 'Save draft',
    cancel: 'Cancel',
    deleteDraft: 'Delete draft',
}

const FORM_ACTIONS = Object.keys(FORM_KEYS) as FormKeyAction[]

export interface FormKeyState {
    // A save, post or delete runs (the action bar's `isPending`).
    isPending: boolean
    // Writes are unavailable (core useServerActionState with no own flag).
    isWriteBlocked: boolean
    // The form is a saved draft and was given a delete.
    hasDraft: boolean
}

// A key is available exactly when its button (or More item) would take a press.
export function formKeyAvailable(action: FormKeyAction, state: FormKeyState): boolean {
    if (state.isPending) return false
    if (action === 'cancel') return true
    if (action === 'deleteDraft') return state.hasDraft
    return !state.isWriteBlocked
}

interface FormShortcutsInput {
    id: string
    group: string
    read: () => FormKeyState
    run: Record<FormKeyAction, () => void>
}

function formShortcut(
    action: FormKeyAction,
    { id, group, read, run }: FormShortcutsInput
): Shortcut {
    const base = {
        id: `${id}.${action}`,
        keys: FORM_KEYS[action],
        scope: 'compose' as const,
        description: FORM_DESCRIPTIONS[action],
        group,
        allowInInputs: true,
    }
    // ⌘S has no `when`, so the form always takes it and the browser's Save Page never
    // opens; it saves only when Save draft would.
    if (action === 'saveDraft') {
        return {
            ...base,
            run: () => {
                if (formKeyAvailable(action, read())) run.saveDraft()
            },
        }
    }
    return {
        ...base,
        when: () => formKeyAvailable(action, read()),
        run: () => run[action](),
    }
}

export function formShortcuts(input: FormShortcutsInput): Shortcut[] {
    return FORM_ACTIONS.map(action => formShortcut(action, input))
}

export type ReadKeyAction = 'edit' | 'void' | 'reverse'

export const READ_KEYS: Record<ReadKeyAction, string> = { edit: 'e', void: 'v', reverse: 'r' }

const READ_DESCRIPTIONS: Record<ReadKeyAction, string> = {
    edit: 'Edit',
    void: 'Void',
    reverse: 'Reverse',
}

const READ_ACTIONS = Object.keys(READ_KEYS) as ReadKeyAction[]

export interface ReadKeyState {
    actions: readonly EntryActionId[]
    // A void or reversal runs.
    isBusy: boolean
}

export function readKeyAvailable(action: ReadKeyAction, state: ReadKeyState): boolean {
    return !state.isBusy && state.actions.includes(action)
}

// The read key actions among `names`, in READ_KEYS order. It takes plain names, so a
// hook can pass back the joined names it memoises on.
export function offeredReadActions(names: readonly string[]): ReadKeyAction[] {
    return READ_ACTIONS.filter(action => names.includes(action))
}

interface ReadShortcutsInput {
    id: string
    group: string
    // The view's actions when it registers.
    offered: readonly EntryActionId[]
    read: () => ReadKeyState
    run: Record<ReadKeyAction, () => void>
}

// Single letters, so they never fire while a text field has focus (no allowInInputs).
// A key is built only for an offered action, because core's shortcut list shows every
// registered key of the active scope and does not read `when`: so R stays off the list of
// a transfer, and E and V off the list of a reader or a void entry. `when` still reads the
// state at press time, so a key does nothing while a void or reversal runs.
export function readShortcuts({ id, group, offered, read, run }: ReadShortcutsInput): Shortcut[] {
    return offeredReadActions(offered).map(action => ({
        id: `${id}.${action}`,
        keys: READ_KEYS[action],
        scope: 'thread',
        description: READ_DESCRIPTIONS[action],
        group,
        when: () => readKeyAvailable(action, read()),
        run: () => run[action](),
    }))
}
