import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { formatHint, type ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
import type { DocumentReadItem } from '../../hooks/useDocumentReadActions'
import { useOpenFromReadView } from '../../hooks/useOpenFromReadView'
import type { PaymentRecordHeader } from '../../hooks/usePaymentRecord'
import { useVoidPayment } from '../../hooks/useVoidPayment'
import type { PaymentFlow } from '../../lib/payment-flow'
import {
    type PaymentCollectionName,
    type PaymentReadAction,
    paymentReadActions,
} from '../../lib/payment-read-actions'
import { PAYMENT_READ_DESCRIPTIONS, PAYMENT_READ_KEYS } from '../../lib/payment-shortcuts'
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

/**
 * The read view's actions as rows, and the Void dialog. Edit opens the correction form
 * (`editHref`, `useOpenFromReadView`: the kind's own `new?replaces=` replaces the read
 * view, a bill payment's Pay Bills is pushed); View journal entry pushes the entry; Void
 * writes `status: 'void'` (useVoidPayment). The dialog's open state lives on the read view,
 * which stays mounted while the optimistic void changes the payment under it. The dialog
 * stays visible through its own void because the mutation reports `isPending` before the
 * optimistic write runs, so a refusal shows in the dialog.
 */
function usePaymentReadItems(
    payment: ReadPayment,
    offered: readonly PaymentReadAction[],
    target: PaymentReadTarget
) {
    const orgHref = useOrgHref()
    const openFromReadView = useOpenFromReadView(payment.id)
    const voidPayment = useVoidPayment(target.collection)
    const confirmVoid = () => voidPayment.confirm(payment.id)
    const isVoiding = voidPayment.isPending
    const voidState = useServerActionState({ isDisabled: isVoiding })
    const run: Record<PaymentReadAction, () => void> = {
        edit: () => openFromReadView(target.editHref),
        void: voidPayment.open,
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
        isVisible: voidPayment.isOpen && (isVoidOffered || isVoiding),
        entryNumber: `${target.entryNoun} ${payment.number}`,
        confirmLabel: target.confirmLabel,
        body: target.voidBody,
        isPending: isVoiding,
        errorMessage: voidPayment.errorMessage,
        onConfirm: confirmVoid,
        onCancel: voidPayment.close,
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
