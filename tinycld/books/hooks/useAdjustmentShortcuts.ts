import { type ScopeOwner, type Shortcut, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useId, useMemo, useRef } from 'react'
import { ADJUSTMENT_SHORTCUT_GROUP } from '../lib/adjustment-kind'
import {
    ADJUSTMENT_FORM_DESCRIPTIONS,
    ADJUSTMENT_FORM_KEYS,
    ADJUSTMENT_LINES_GROUP,
    type AdjustmentFormKeyAction,
    adjustmentFormKeysOffered,
    isAdjustmentLineKey,
} from '../lib/adjustment-shortcuts'

// The keys this hook may hold: the ones no drawn button holds. Cancel, Post, and on a wide
// screen Save draft and Post & new are the bar's ShortcutButtons; ⌥↵ is the Add line
// ShortcutButton's.
type OwnKey = 'saveDraft' | 'postAndNew' | 'deleteDraft' | 'removeLine'

// The keys a phone's bar moves into More, whose rows hold no key.
const PHONE_KEYS: readonly OwnKey[] = ['saveDraft', 'postAndNew']

interface AdjustmentShortcutsInput {
    scopeOwner: ScopeOwner
    canWrite: boolean
    // A save runs (the save store holds the adjustment).
    isPending: boolean
    // The Discard (or, from checkpoint 5, Delete draft) dialog is open.
    isDialogOpen: boolean
    // The form shows a saved draft, so More holds Delete draft.
    isSavedDraft: boolean
    // A phone puts Save draft and Post & new in More, so their keys are registered here.
    isPhone: boolean
    lineCount: number
    // The focus is inside a line now (read from a ref when the key fires).
    isLineFocused: () => boolean
    run: {
        saveDraft: () => void
        postAndNew: () => void
        // Removes the line that holds the focus.
        removeLine: () => void
        // Delete draft's dialog; undefined until the form has one, and then ⌘⌫ is not taken.
        deleteDraft?: () => void
    }
}

// The own keys in the order they register.
const OWN_KEYS: readonly OwnKey[] = ['saveDraft', 'postAndNew', 'deleteDraft', 'removeLine']

type OwnKeyFlags = Record<OwnKey, boolean>

// Which own keys this hook registers now: plain booleans, so the registration's memo is
// keyed by them.
function ownKeyFlagsOf(
    offered: readonly AdjustmentFormKeyAction[],
    isPhone: boolean,
    hasDeleteDraft: boolean
): OwnKeyFlags {
    const isPhoneKey = (key: OwnKey) => isPhone && PHONE_KEYS.includes(key) && offered.includes(key)
    return {
        saveDraft: isPhoneKey('saveDraft'),
        postAndNew: isPhoneKey('postAndNew'),
        deleteDraft: hasDeleteDraft && offered.includes('deleteDraft'),
        removeLine: offered.includes('removeLine'),
    }
}

/**
 * The adjustment form's keys that have no button of their own (inventory-adjust spec §3.4,
 * Do step 6), in the screen's `compose` scope: ⌘⌥⌫ Remove line (group "Lines"), ⌘⌫ Delete
 * draft once the form passes it, and on a phone ⌘S Save draft and ⌘⇧↵ Post & new (their
 * More rows hold no key); the bar's keys are in the group "Inventory adjustment". Each is
 * registered only while offered (`adjustmentFormKeysOffered`), as core's ⇧? list ignores
 * `when`. The line focus moves with every Tab, so ⌘⌥⌫ is registered while a line exists
 * and its `when` reads the focus when the key fires. ⌘S is always taken, so the browser's
 * Save Page never opens: an idle registration (`isUnlisted`, so ⇧? never lists it) takes
 * it while Save draft is not offered (a write runs, writes are unavailable). Returns the
 * offered keys: the form disables Add
 * line (and so its ⌥↵) when they leave out `addLine`.
 */
export function useAdjustmentShortcuts({
    scopeOwner,
    canWrite,
    isPending,
    isDialogOpen,
    isSavedDraft,
    isPhone,
    lineCount,
    isLineFocused,
    run,
}: AdjustmentShortcutsInput) {
    const instance = useId()
    const writes = useWritesAvailable()
    const offered = adjustmentFormKeysOffered({
        holdsKeys: true,
        canWrite,
        writesAvailable: writes.available,
        isWriteHeld: isPending,
        isDialogOpen,
        isSavedDraft,
        lineCount,
        isLineFocused: true,
    })
    const runRef = useRef(run)
    runRef.current = run
    const focusRef = useRef(isLineFocused)
    focusRef.current = isLineFocused
    const idleRef = useRef(false)
    idleRef.current = !offered.includes('saveDraft')
    const { saveDraft, postAndNew, deleteDraft, removeLine } = ownKeyFlagsOf(
        offered,
        isPhone,
        run.deleteDraft !== undefined
    )
    const shortcuts = useMemo<Shortcut[]>(() => {
        const base = `books.inventory-adjustment.form.${instance}`
        const registers: OwnKeyFlags = { saveDraft, postAndNew, deleteDraft, removeLine }
        const keys = OWN_KEYS.filter(key => registers[key])
        const own: Shortcut[] = keys.map(key => ({
            id: `${base}.${key}`,
            keys: ADJUSTMENT_FORM_KEYS[key],
            scope: 'compose',
            description: ADJUSTMENT_FORM_DESCRIPTIONS[key],
            group: isAdjustmentLineKey(key) ? ADJUSTMENT_LINES_GROUP : ADJUSTMENT_SHORTCUT_GROUP,
            allowInInputs: true,
            ...(key === 'removeLine' ? { when: () => focusRef.current() } : {}),
            run: () => runRef.current[key]?.(),
        }))
        const idleSave: Shortcut = {
            id: `${base}.saveIdle`,
            keys: ADJUSTMENT_FORM_KEYS.saveDraft,
            scope: 'compose',
            description: ADJUSTMENT_FORM_DESCRIPTIONS.saveDraft,
            group: ADJUSTMENT_SHORTCUT_GROUP,
            // A guard, not an action: ⇧? lists ⌘S only through Save draft's own
            // registration, which exists only while Save draft is offered.
            isUnlisted: true,
            allowInInputs: true,
            when: () => idleRef.current,
            run: () => {},
        }
        return [...own, idleSave]
    }, [instance, saveDraft, postAndNew, deleteDraft, removeLine])
    useRegisterShortcuts(shortcuts, scopeOwner)
    return { offered }
}
