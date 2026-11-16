import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { formatHint, type ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
import { useState } from 'react'
import type { DocumentReadItem } from '../../hooks/useDocumentReadActions'
import { type PaymentReadAction, paymentReadActions } from '../../lib/payment-read-actions'
import { PAYMENT_READ_DESCRIPTIONS, PAYMENT_READ_KEYS } from '../../lib/payment-shortcuts'
import { PAYMENT_MESSAGES } from '../../lib/payment-texts'
import { writeRefusalText } from '../../lib/refusal'
import type { BooksPayments } from '../../types'
import { DocumentReadActions } from '../documents/DocumentReadActions'
import { VoidDialog } from '../entries/VoidDialog'

type ReadPayment = Pick<BooksPayments, 'id' | 'status' | 'number' | 'entry'>

/**
 * The read view's actions as rows, and the Void dialog. Edit replaces the read view with
 * the correction form (`?replaces`); View journal entry pushes the entry; Void writes
 * `status: 'void'` (the server posts the reversing entry and opens the invoices again).
 * The dialog's open state lives here, on the read view, which stays mounted while the
 * optimistic void changes the payment under it, so a refusal stays in the dialog.
 */
function usePaymentReadItems(payment: ReadPayment, canWrite: boolean) {
    const orgHref = useOrgHref()
    const [paymentsCollection] = useStore('books_payments')
    const [isVoidOpen, setVoidOpen] = useState(false)
    const voidPayment = useMutation({
        mutationFn: function* (id: string) {
            yield paymentsCollection.update(id, draft => {
                draft.status = 'void'
            })
        },
        onSuccess: () => setVoidOpen(false),
        // The dialog shows the refusal; without this core reports it again as a toast.
        onError: () => {},
    })
    const isVoiding = voidPayment.isPending
    const voidState = useServerActionState({ isDisabled: isVoiding })
    const run: Record<PaymentReadAction, () => void> = {
        edit: () => router.replace(orgHref(`books/payments/new?replaces=${payment.id}`)),
        void: () => {
            voidPayment.reset()
            setVoidOpen(true)
        },
        entry: () => router.push(orgHref(`books/entries/${payment.entry}`)),
    }
    // Void writes, so it waits for the server and for writes to be available; the others
    // only open a screen, and wait for a running void.
    const disabledOf = (action: PaymentReadAction) =>
        action === 'void' ? voidState.isDisabled : isVoiding
    const offered = paymentReadActions(payment.status, canWrite, payment.entry !== '')
    const items: DocumentReadItem[] = offered.map(action => ({
        action,
        id: `read-${action}`,
        label: PAYMENT_READ_DESCRIPTIONS[action],
        keys: formatHint(PAYMENT_READ_KEYS[action]).text,
        isDisabled: disabledOf(action),
        isDestructive: action === 'void',
        onSelect: run[action],
    }))
    // The dialog closes when Void stops being offered (the payment was voided or replaced
    // elsewhere while it was open), unless this dialog's own void runs.
    const isVoidOffered = offered.includes('void')
    const voidDialog = {
        isVisible: isVoidOpen && (isVoidOffered || isVoiding),
        entryNumber: `payment ${payment.number}`,
        confirmLabel: 'Void payment',
        body: PAYMENT_MESSAGES.voidBody,
        isPending: isVoiding,
        errorMessage: voidPayment.error ? writeRefusalText(voidPayment.error) : null,
        onConfirm: () => voidPayment.mutate(payment.id),
        onCancel: () => setVoidOpen(false),
    }
    return { items, voidDialog }
}

interface PaymentReadActionsProps {
    payment: ReadPayment
    canWrite: boolean
    scopeOwner: ScopeOwner
}

/**
 * The read view's bar (spec §3.7), drawn by the shared DocumentReadActions from the
 * payment chrome: wide, a ShortcutButton per action (Edit E, Void V, View journal entry
 * J); phone, Edit beside a More menu that holds the rest. A writer on a void payment and
 * a reader get View journal entry only; a hidden action's key is not registered.
 */
export function PaymentReadActions({ payment, canWrite, scopeOwner }: PaymentReadActionsProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const { items, voidDialog } = usePaymentReadItems(payment, canWrite)
    return (
        <>
            <DocumentReadActions
                actions={items}
                isPhone={isPhone}
                historyItem={null}
                isBusy={voidDialog.isPending}
                scopeOwner={scopeOwner}
            />
            <VoidDialog {...voidDialog} />
        </>
    )
}
