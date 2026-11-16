import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { formatHint, type ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
import { useState } from 'react'
import type { DocumentReadItem } from '../../hooks/useDocumentReadActions'
import type { PaymentReadAction } from '../../lib/payment-read-actions'
import { PAYMENT_READ_DESCRIPTIONS, PAYMENT_READ_KEYS } from '../../lib/payment-shortcuts'
import { writeRefusalText } from '../../lib/refusal'
import type { BooksBillPayments, BooksPayments } from '../../types'
import { DocumentReadActions } from '../documents/DocumentReadActions'
import { VoidDialog } from '../entries/VoidDialog'

type ReadField = 'id' | 'status' | 'number' | 'entry'
type ReadPayment = Pick<BooksPayments, ReadField> | Pick<BooksBillPayments, ReadField>

// The payment collections a read view voids: a customer payment or a bill payment.
export type PaymentCollectionName = 'books_payments' | 'books_bill_payments'

export interface PaymentReadTarget {
    collection: PaymentCollectionName
    // Where Edit goes (replacing the read view): the correction form of this payment.
    editHref: string
    // The Void dialog's body and its confirm button's label.
    voidBody: string
    confirmLabel: string
    // What the dialog's title names before the number: "Void payment 1004?".
    entryNoun: string
}

// Void as a write to the named collection: `status: 'void'` (the server posts the
// reversing entry and opens the paid documents again).
function useVoidWrite(collection: PaymentCollectionName) {
    const [paymentsCollection, billPaymentsCollection] = useStore(
        'books_payments',
        'books_bill_payments'
    )
    return (id: string) => {
        if (collection === 'books_payments') {
            return paymentsCollection.update(id, draft => {
                draft.status = 'void'
            })
        }
        return billPaymentsCollection.update(id, draft => {
            draft.status = 'void'
        })
    }
}

/**
 * The read view's actions as rows, and the Void dialog. Edit replaces the read view with
 * the correction form (`editHref`); View journal entry pushes the entry; Void writes
 * `status: 'void'`. The dialog's open state lives here, on the read view, which stays
 * mounted while the optimistic void changes the payment under it, so a refusal stays in
 * the dialog.
 */
function usePaymentReadItems(
    payment: ReadPayment,
    offered: readonly PaymentReadAction[],
    target: PaymentReadTarget
) {
    const orgHref = useOrgHref()
    const markVoid = useVoidWrite(target.collection)
    const [isVoidOpen, setVoidOpen] = useState(false)
    const voidPayment = useMutation({
        mutationFn: function* (id: string) {
            yield markVoid(id)
        },
        onSuccess: () => setVoidOpen(false),
        // The dialog shows the refusal; without this core reports it again as a toast.
        onError: () => {},
    })
    const isVoiding = voidPayment.isPending
    const voidState = useServerActionState({ isDisabled: isVoiding })
    const run: Record<PaymentReadAction, () => void> = {
        edit: () => router.replace(orgHref(target.editHref)),
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
        entryNumber: `${target.entryNoun} ${payment.number}`,
        confirmLabel: target.confirmLabel,
        body: target.voidBody,
        isPending: isVoiding,
        errorMessage: voidPayment.error ? writeRefusalText(voidPayment.error) : null,
        onConfirm: () => voidPayment.mutate(payment.id),
        onCancel: () => setVoidOpen(false),
    }
    return { items, voidDialog }
}

interface PaymentReadActionsProps extends PaymentReadTarget {
    payment: ReadPayment
    // The actions the caller offers (paymentReadActions, billPaymentReadActions).
    offered: readonly PaymentReadAction[]
    scopeOwner: ScopeOwner
}

/**
 * A payment read view's bar (receive-payment §3.7, pay-bills §3.8), drawn by the shared
 * DocumentReadActions from the chrome: wide, a ShortcutButton per action (Edit E, Void V,
 * View journal entry J); phone, Edit beside a More menu that holds the rest. The caller
 * names the actions offered (a writer on a void payment and a reader get View journal
 * entry only); a hidden action's key is not registered.
 */
export function PaymentReadActions({
    payment,
    offered,
    scopeOwner,
    ...target
}: PaymentReadActionsProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const { items, voidDialog } = usePaymentReadItems(payment, offered, target)
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
