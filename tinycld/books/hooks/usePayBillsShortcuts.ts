import { type ScopeOwner, type Shortcut, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useId, useMemo, useRef } from 'react'
import { PAY_BILLS_CHROME } from '../lib/pay-bills-kind'
import { PAY_BILLS_KEY_DESCRIPTIONS, payBillsKeysOffered } from '../lib/pay-bills-shortcuts'
import { PAYMENT_FORM_KEYS, type PaymentFormKey } from '../lib/payment-shortcuts'

export type PayBillsShortcutsInput = {
    scopeOwner: ScopeOwner
    canWrite: boolean
    // A Pay runs (the store holds the form).
    isPending: boolean
    // The Discard dialog is open.
    isDialogOpen: boolean
    mode: 'new' | 'replaces'
    hasShownRows: boolean
    hasPaidRows: boolean
    // A phone puts Pay & new in More, so its key is registered here.
    isPhone: boolean
    run: {
        payAll: () => void
        toggleRow: () => void
        postAndNew: () => void
    }
}

type OwnKey = keyof PayBillsShortcutsInput['run']

// The keys this hook holds: the ones no button holds. Cancel, Pay and (wide) Pay & new
// are the bar's ShortcutButtons; ⌥⌫ is the Clear payments link's.
const OWN_KEYS: readonly OwnKey[] = ['payAll', 'toggleRow']

/**
 * The Pay Bills keys with no button of their own, in the screen's `compose` scope (a
 * dialog pushes a modal scope above it), group "Pay bills": ⌥A pays every shown row or
 * clears them, ⌥↵ toggles the focused row and, on a phone, ⌘⇧↵ Pay & new (its row sits in
 * More). Each is registered only while offered (`payBillsKeysOffered`), as core's ⇧? list
 * ignores `when`. Returns the offered keys, so the bar and the Clear payments link follow
 * the same rule.
 */
export function usePayBillsShortcuts({
    scopeOwner,
    canWrite,
    isPending,
    isDialogOpen,
    mode,
    hasShownRows,
    hasPaidRows,
    isPhone,
    run,
}: PayBillsShortcutsInput) {
    const instance = useId()
    const writes = useWritesAvailable()
    const offered: PaymentFormKey[] = payBillsKeysOffered({
        holdsKeys: true,
        canWrite,
        isWriteHeld: isPending,
        isDialogOpen,
        writesAvailable: writes.available,
        mode,
        hasShownRows,
        hasPaidRows,
    })
    const runRef = useRef(run)
    runRef.current = run
    const ownKeys = OWN_KEYS.filter(key => offered.includes(key))
    const withPostAndNew = isPhone && offered.includes('postAndNew')
    const keys: OwnKey[] = withPostAndNew ? [...ownKeys, 'postAndNew'] : ownKeys
    const names = keys.join(',')
    const shortcuts = useMemo<Shortcut[]>(() => {
        const listed = names === '' ? [] : (names.split(',') as OwnKey[])
        return listed.map(key => ({
            id: `books.payBills.form.${instance}.${key}`,
            keys: PAYMENT_FORM_KEYS[key],
            scope: 'compose',
            description: PAY_BILLS_KEY_DESCRIPTIONS[key],
            group: PAY_BILLS_CHROME.shortcutGroup,
            allowInInputs: true,
            run: () => runRef.current[key](),
        }))
    }, [instance, names])
    useRegisterShortcuts(shortcuts, scopeOwner)
    return { offered }
}
