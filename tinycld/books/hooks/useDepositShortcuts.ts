import { type ScopeOwner, type Shortcut, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useId, useMemo, useRef } from 'react'
import {
    DEPOSIT_FORM_DESCRIPTIONS,
    DEPOSIT_FORM_KEYS,
    DEPOSIT_SHORTCUT_GROUP,
    type DepositFormKeyAction,
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
    run: {
        selectAll: () => void
        deleteDraft: () => void
        postAndNew: () => void
    }
}

// The keys this hook holds: the ones no drawn button holds. Cancel, Save draft, Post and
// (wide) Post & new are the bar's ShortcutButtons; ⌥⌫ is the Clear selection
// ShortcutButton's.
const OWN_KEYS: readonly ('selectAll' | 'deleteDraft')[] = ['selectAll', 'deleteDraft']

type OwnKey = keyof DepositShortcutsInput['run']

/**
 * The deposit form's keys that have no button of their own (bank deposit spec §3.2, Do
 * step 6), in the screen's `compose` scope (a dialog pushes a modal scope above it): ⌥A
 * Select all, ⌘⌫ Delete draft (its row sits in More) and, on a phone, ⌘⇧↵ Post & new; all
 * in the ⇧? group "Bank deposit". Each is registered only while offered
 * (`depositFormKeysOffered`), as core's ⇧? list ignores `when`, so no key is registered
 * twice. ⌘S is always taken: while the bar's Save draft is idle (a write runs, or offline)
 * an idle registration takes it, so the browser's Save Page never opens. Returns the
 * offered keys: DepositForm disables Clear selection (and so its ⌥⌫) when they leave out
 * `clearSelection`.
 */
export function useDepositShortcuts({
    scopeOwner,
    canWrite,
    isPending,
    isDialogOpen,
    isSavedDraft,
    isPhone,
    run,
}: DepositShortcutsInput) {
    const instance = useId()
    const writes = useWritesAvailable()
    const offered: DepositFormKeyAction[] = depositFormKeysOffered({
        holdsKeys: true,
        canWrite,
        isWriteHeld: isPending,
        isDialogOpen,
        isSavedDraft,
        writesAvailable: writes.available,
        isPhoneBar: isPhone,
    })
    const runRef = useRef(run)
    runRef.current = run
    const idleRef = useRef(false)
    idleRef.current = isPending || !writes.available
    const ownKeys: OwnKey[] = OWN_KEYS.filter(key => offered.includes(key))
    const withPostAndNew = isPhone && offered.includes('postAndNew')
    const names = [...ownKeys, ...(withPostAndNew ? ['postAndNew' as const] : [])].join(',')
    const shortcuts = useMemo<Shortcut[]>(() => {
        const base = `books.deposit.form.${instance}`
        const keys = names === '' ? [] : (names.split(',') as OwnKey[])
        const own: Shortcut[] = keys.map(key => ({
            id: `${base}.${key}`,
            keys: DEPOSIT_FORM_KEYS[key],
            scope: 'compose',
            description: DEPOSIT_FORM_DESCRIPTIONS[key],
            group: DEPOSIT_SHORTCUT_GROUP,
            allowInInputs: true,
            run: () => runRef.current[key](),
        }))
        const idleSave: Shortcut = {
            id: `${base}.saveIdle`,
            keys: DEPOSIT_FORM_KEYS.saveDraft,
            scope: 'compose',
            description: DEPOSIT_FORM_DESCRIPTIONS.saveDraft,
            group: DEPOSIT_SHORTCUT_GROUP,
            allowInInputs: true,
            when: () => idleRef.current,
            run: () => {},
        }
        return [...own, idleSave]
    }, [instance, names])
    useRegisterShortcuts(shortcuts, scopeOwner)
    return { offered }
}
