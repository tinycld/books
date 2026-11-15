import { useOrgHref } from '@tinycld/core/lib/org-routes'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { router } from 'expo-router'
import { View } from 'react-native'
import { PAYMENT_CHROME } from '../../lib/payment-kind'
import { paymentReadActions } from '../../lib/payment-read-actions'
import { PAYMENT_READ_DESCRIPTIONS, PAYMENT_READ_KEYS } from '../../lib/payment-shortcuts'
import type { BooksPayments } from '../../types'

const BAR =
    'flex-row flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-4 py-2'

const ENTRY_SHORTCUT = {
    keys: PAYMENT_READ_KEYS.entry,
    scope: 'compose',
    group: PAYMENT_CHROME.shortcutGroup,
} as const

interface PaymentReadActionsProps {
    status: BooksPayments['status']
    canWrite: boolean
    // The payment's journal entry; '' draws no View journal entry.
    entryId: string
    scopeOwner: ScopeOwner
}

/**
 * The read view's bar. This checkpoint draws View journal entry (J, pushed) only; Edit (E)
 * and Void (V), which `paymentReadActions` also lists for a writer on a posted payment,
 * come with the correction and void screens.
 */
export function PaymentReadActions({
    status,
    canWrite,
    entryId,
    scopeOwner,
}: PaymentReadActionsProps) {
    const orgHref = useOrgHref()
    const hasEntry = paymentReadActions(status, canWrite).includes('entry') && entryId !== ''
    if (!hasEntry) return null
    const openEntry = () => router.push(orgHref(`books/entries/${entryId}`))
    return (
        <View testID="payment-read-actions" className={BAR}>
            <ShortcutButton
                label={PAYMENT_READ_DESCRIPTIONS.entry}
                shortcut={ENTRY_SHORTCUT}
                onPress={openEntry}
                variant="outline"
                testID="payment-read-entry"
                scopeOwner={scopeOwner}
            />
        </View>
    )
}
