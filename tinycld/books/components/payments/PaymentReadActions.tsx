import type { Transaction } from '@tanstack/db'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { formatHint, type ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
import { useState } from 'react'
import type { DocumentReadItem } from '../../hooks/useDocumentReadActions'
import { useOpenFromReadView } from '../../hooks/useOpenFromReadView'
import type { PaymentRecordHeader } from '../../hooks/usePaymentRecord'
import { useVoidDocument } from '../../hooks/useVoidDocument'
import type { PaymentFlow } from '../../lib/payment-flow'
import {
    type PaymentCollectionName,
    type PaymentReadAction,
    paymentReadActions,
    voidWriteCollection,
} from '../../lib/payment-read-actions'
import { PAYMENT_READ_DESCRIPTIONS, PAYMENT_READ_KEYS } from '../../lib/payment-shortcuts'
import { writeRefusalText } from '../../lib/refusal'
import type { BooksBillPayments, BooksPayments, BooksVendorRefunds } from '../../types'
import type { DocumentMoreItem } from '../documents/DocumentActionBar'
import { DocumentReadActions } from '../documents/DocumentReadActions'
import { VoidDialog } from '../entries/VoidDialog'

type ReadField = 'id' | 'status' | 'number' | 'entry'
type ReadPayment =
    | Pick<BooksPayments, ReadField>
    | Pick<BooksBillPayments, ReadField>
    | Pick<BooksVendorRefunds, ReadField>

export interface PaymentReadTarget {
    collection: PaymentCollectionName
    // Where Edit goes: the correction form of this payment (`useOpenEdit`).
    editHref: string
    // The Void dialog's body and its confirm button's label.
    voidBody: string
    confirmLabel: string
    // What the dialog's title names before the number: "Void payment 1004?".
    entryNoun: string
}

// Void as a write to the read view's own collection (`voidWriteCollection`):
// `status: 'void'` (the server posts the reversing entry and opens the paid documents
// again). One write per collection name, so a name with no write is a type error. A
// customer payment voids through the write the sales lists share (useVoidDocument).
function useVoidWrite(collection: PaymentCollectionName) {
    const [billPaymentsCollection, vendorRefundsCollection] = useStore(
        'books_bill_payments',
        'books_vendor_refunds'
    )
    const voidSales = useVoidDocument()
    const writes: Record<PaymentCollectionName, (id: string) => Transaction> = {
        books_payments: id => voidSales('payment', id),
        books_bill_payments: id =>
            billPaymentsCollection.update(id, draft => {
                draft.status = 'void'
            }),
        books_vendor_refunds: id =>
            vendorRefundsCollection.update(id, draft => {
                draft.status = 'void'
            }),
    }
    return writes[voidWriteCollection(collection)]
}

/**
 * The read view's actions as rows, and the Void dialog. Edit opens the correction form
 * (`editHref`, `useOpenFromReadView`: the kind's own `new?replaces=` replaces the read
 * view, a bill payment's Pay Bills is pushed); View journal entry pushes the entry; Void writes
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
    const openFromReadView = useOpenFromReadView(payment.id)
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
        edit: () => openFromReadView(target.editHref),
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
    // More → Audit history (useHistoryItem), last in More; null where the read view has none.
    historyItem: DocumentMoreItem | null
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
    historyItem,
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
                historyItem={historyItem}
                isBusy={voidDialog.isPending}
                scopeOwner={scopeOwner}
            />
            <VoidDialog {...voidDialog} />
        </>
    )
}

// What a flow's read view bar receives: the flow, its header collection, the shown record,
// the role and the screen's scope.
export interface PaymentReadBarProps {
    flow: PaymentFlow
    collection: PaymentCollectionName
    payment: PaymentRecordHeader
    canWrite: boolean
    scopeOwner: ScopeOwner
}

/**
 * The read view bar from the flow's descriptor alone (the received payment): the actions
 * the read rule allows, Edit on the flow's `?replaces` route, the flow's Void texts, and no
 * Audit history row.
 */
export function PaymentFlowReadBar({
    flow,
    collection,
    payment,
    canWrite,
    scopeOwner,
}: PaymentReadBarProps) {
    const offered = paymentReadActions(payment.status, canWrite, payment.entry !== '')
    const editHref = `${flow.routeBase}/new?replaces=${payment.id}`
    return (
        <PaymentReadActions
            payment={payment}
            offered={offered}
            historyItem={null}
            scopeOwner={scopeOwner}
            collection={collection}
            editHref={editHref}
            voidBody={flow.texts.voidBody}
            confirmLabel={flow.texts.voidConfirm}
            entryNoun={flow.texts.voidNoun}
        />
    )
}
