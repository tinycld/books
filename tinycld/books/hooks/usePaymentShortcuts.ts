import { type ScopeOwner, type Shortcut, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useId, useMemo, useRef } from 'react'
import type { PaymentFlow } from '../lib/payment-flow'
import {
    PAYMENT_FORM_KEYS,
    type PaymentFormKey,
    paymentFormDescriptions,
    paymentFormKeysOffered,
} from '../lib/payment-shortcuts'

interface PaymentShortcutsInput {
    flow: PaymentFlow
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
        payAll: () => void
        toggleRow: () => void
        deleteDraft: () => void
        postAndNew: () => void
    }
}

// The keys this hook holds: the ones no button of the bar holds. Cancel, Save draft, Post
// and (wide) Post & new are the bar's ShortcutButtons; ⌥⌫ is ClearPaymentsLink's.
const OWN_KEYS: readonly PaymentFormKey[] = ['payAll', 'toggleRow', 'deleteDraft']

/**
 * A payment form's keys that have no button of their own, in the screen's `compose`
 * scope (a dialog pushes a modal scope above it): ⌥A pay all, ⌥↵ toggle the focused row,
 * ⌘⌫ Delete draft (its row sits in More) and, on a phone, ⌘⇧↵ Post & new; the ⇧? group
 * is the flow's chrome's and the descriptions name the flow's document. Each is
 * registered only while offered (`paymentFormKeysOffered`), as core's ⇧? list ignores
 * `when`. ⌘S is always taken: while the bar's Save draft is idle (a save runs, or
 * offline) an idle registration takes it, so the browser's Save Page never opens.
 * Returns the offered keys, so ClearPaymentsLink follows the same rule.
 */
export function usePaymentShortcuts({
    flow,
    scopeOwner,
    canWrite,
    isPending,
    isDialogOpen,
    isSavedDraft,
    isPhone,
    run,
}: PaymentShortcutsInput) {
    const instance = useId()
    const writes = useWritesAvailable()
    const offered = paymentFormKeysOffered({
        holdsKeys: true,
        canWrite,
        isWriteHeld: isPending,
        isDialogOpen,
        isSavedDraft,
        writesAvailable: writes.available,
    })
    const runRef = useRef(run)
    runRef.current = run
    const idleRef = useRef(false)
    idleRef.current = isPending || !writes.available
    const ownKeys = OWN_KEYS.filter(key => offered.includes(key))
    const withPostAndNew = isPhone && offered.includes('postAndNew')
    const names = [...ownKeys, ...(withPostAndNew ? ['postAndNew' as const] : [])].join(',')
    const shortcuts = useMemo<Shortcut[]>(() => {
        const group = flow.chrome.shortcutGroup
        const descriptions = paymentFormDescriptions(flow.texts)
        const base = `books.${flow.key}.form.${instance}`
        const keys =
            names === '' ? [] : (names.split(',') as (keyof PaymentShortcutsInput['run'])[])
        const own: Shortcut[] = keys.map(key => ({
            id: `${base}.${key}`,
            keys: PAYMENT_FORM_KEYS[key],
            scope: 'compose',
            description: descriptions[key],
            group,
            allowInInputs: true,
            run: () => runRef.current[key](),
        }))
        const idleSave: Shortcut = {
            id: `${base}.saveIdle`,
            keys: PAYMENT_FORM_KEYS.saveDraft,
            scope: 'compose',
            description: descriptions.saveDraft,
            group,
            allowInInputs: true,
            when: () => idleRef.current,
            run: () => {},
        }
        return [...own, idleSave]
    }, [instance, names, flow])
    useRegisterShortcuts(shortcuts, scopeOwner)
    return { offered }
}
