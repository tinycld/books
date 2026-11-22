import { type ScopeOwner, type Shortcut, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useId, useMemo, useRef } from 'react'
import {
    DEPOSIT_FORM_DESCRIPTIONS,
    DEPOSIT_FORM_KEYS,
    DEPOSIT_SHORTCUT_GROUP,
    type DepositFormKeyAction,
    type DepositFormMode,
    depositFormKeysOffered,
} from '../lib/deposit-shortcuts'

interface DepositShortcutsInput {
    scopeOwner: ScopeOwner
    canWrite: boolean
    // A save, post or delete runs.
    isPending: boolean
    // The Discard or Delete draft dialog is open.
    isDialogOpen: boolean
    // The form shows a saved draft, so More holds Delete draft.
    isSavedDraft: boolean
    // A phone puts Post & new in More, so its key is registered here.
    isPhone: boolean
    // A new deposit or a draft, or a correction (`?replaces`).
    mode: DepositFormMode
    // The other funds lines the form holds.
    lineCount: number
    // The focus is inside an other funds line now (read from a ref when the key fires).
    isLineFocused: () => boolean
    run: {
        selectAll: () => void
        deleteDraft: () => void
        postAndNew: () => void
        // Removes the line that holds the focus.
        removeLine: () => void
    }
}

// The keys this hook holds: the ones no drawn button holds. Cancel, Save draft, Post and
// (wide) Post & new are the bar's ShortcutButtons; ⌥⌫ is the Clear selection
// ShortcutButton's and ⌥↵ the Add line ShortcutButton's.
const OWN_KEYS: readonly ('selectAll' | 'deleteDraft' | 'removeLine')[] = [
    'selectAll',
    'deleteDraft',
    'removeLine',
]

type OwnKey = keyof DepositShortcutsInput['run']

// Core's ⇧? list shows a lone registration whatever its `when` says, so a correction's
// ⌘S catch is listed; its text says that ⌘S saves nothing there.
const NO_DRAFT_DESCRIPTION = 'Save draft (not on a correction)'

/**
 * The deposit form's keys that have no button of their own (bank deposit spec §3.2, Do
 * step 6), in the screen's `compose` scope (a dialog pushes a modal scope above it): ⌥A
 * Select all, ⌘⌫ Delete draft (its row sits in More), ⌘⌥⌫ Remove line and, on a phone,
 * ⌘⇧↵ Post & new; all in the ⇧? group "Bank deposit". Each is registered only while
 * offered (`depositFormKeysOffered`), as core's ⇧? list ignores `when`, so no key is
 * registered twice. The line focus moves with every Tab, so ⌘⌥⌫ is registered while a
 * line exists and its `when` reads the focus (`isLineFocused`) when the key fires. ⌘S is
 * always taken, so the browser's Save Page never opens: in a new deposit or a draft an idle
 * registration takes it while the bar's Save draft is idle (a write runs, or offline); a
 * correction has no Save draft, so the same registration takes it at all times and does
 * nothing (it stays out of the offered keys). Returns the offered keys:
 * DepositForm disables Clear selection (and so its ⌥⌫) when they leave out
 * `clearSelection`, and Add line (and so its ⌥↵) when they leave out `addLine`.
 */
export function useDepositShortcuts({
    scopeOwner,
    canWrite,
    isPending,
    isDialogOpen,
    isSavedDraft,
    isPhone,
    mode,
    lineCount,
    isLineFocused,
    run,
}: DepositShortcutsInput) {
    const instance = useId()
    const writes = useWritesAvailable()
    // isLineFocused true: the set that may hold ⌘⌥⌫; its `when` checks the focus.
    const offered: DepositFormKeyAction[] = depositFormKeysOffered({
        holdsKeys: true,
        canWrite,
        isWriteHeld: isPending,
        isDialogOpen,
        isSavedDraft,
        writesAvailable: writes.available,
        isPhoneBar: isPhone,
        mode,
        lineCount,
        isLineFocused: true,
    })
    const runRef = useRef(run)
    runRef.current = run
    const focusRef = useRef(isLineFocused)
    focusRef.current = isLineFocused
    const idleRef = useRef(false)
    // A correction has no Save draft button, so its catch always takes ⌘S.
    idleRef.current = mode === 'replaces' || isPending || !writes.available
    const idleDescription =
        mode === 'replaces' ? NO_DRAFT_DESCRIPTION : DEPOSIT_FORM_DESCRIPTIONS.saveDraft
    const ownKeys: OwnKey[] = OWN_KEYS.filter(key => offered.includes(key))
    const withPostAndNew = isPhone && offered.includes('postAndNew')
    const names = [...ownKeys, ...(withPostAndNew ? ['postAndNew' as const] : [])].join(',')
    const shortcuts = useMemo<Shortcut[]>(() => {
        const base = `books.deposit.form.${instance}`
        const keys = names === '' ? [] : (names.split(',') as OwnKey[])
        const whenOf = (key: OwnKey) =>
            key === 'removeLine' ? { when: () => focusRef.current() } : {}
        const own: Shortcut[] = keys.map(key => ({
            id: `${base}.${key}`,
            keys: DEPOSIT_FORM_KEYS[key],
            scope: 'compose',
            description: DEPOSIT_FORM_DESCRIPTIONS[key],
            group: DEPOSIT_SHORTCUT_GROUP,
            allowInInputs: true,
            ...whenOf(key),
            run: () => runRef.current[key](),
        }))
        const idleSave: Shortcut = {
            id: `${base}.saveIdle`,
            keys: DEPOSIT_FORM_KEYS.saveDraft,
            scope: 'compose',
            description: idleDescription,
            group: DEPOSIT_SHORTCUT_GROUP,
            allowInInputs: true,
            when: () => idleRef.current,
            run: () => {},
        }
        return [...own, idleSave]
    }, [instance, names, idleDescription])
    useRegisterShortcuts(shortcuts, scopeOwner)
    return { offered }
}
