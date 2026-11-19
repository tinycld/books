import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { formatHint } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
import { useState } from 'react'
import type { DocumentMoreItem } from '../components/documents/DocumentActionBar'
import type { DocumentKind } from '../components/documents/document-kinds'
import {
    applyCreditOffered,
    creditMemoOffered,
    DOCUMENT_READ_ACTION_KEYS,
    DOCUMENT_READ_LABELS,
    type DocumentReadAction,
    documentReadActions,
    payBillOffered,
    receivePaymentOffered,
    refundOffered,
} from '../lib/document-actions'
import { quoteReadActions } from '../lib/document-lifecycle'
import { documentNewHref } from '../lib/document-routes'
import { writeRefusalText } from '../lib/refusal'
import { CREDIT_MEMO_KIND, INVOICE_KIND, type SalesDocumentKind } from '../lib/sales-document-kinds'
import { useApplyCreditStore } from '../stores/apply-credit-store'
import type { DocumentRecord } from './document-data'
import { useOpenDocument } from './useOpenDocument'
import { useOpenFromReadView, useOpenInPlaceOfReadView } from './useOpenFromReadView'
import { usePdfDownload } from './usePdfDownload'
import { useVoidDocument } from './useVoidDocument'

type ReadRecord = Pick<
    DocumentRecord,
    'id' | 'status' | 'number' | 'entry' | 'customer' | 'kindFields'
>

// The invoice made from a closed estimate; '' for any other record.
function invoiceIdOf(record: ReadRecord): string {
    return record.kindFields.kind === 'estimate' ? record.kindFields.invoice : ''
}

// The vendor of a vendor credit; '' for any other record, which offers no Record refund.
function vendorIdOf(record: ReadRecord): string {
    return record.kindFields.kind === 'vendor_credit' ? record.kindFields.vendor : ''
}

// A bar or More row of the read view, with the action it runs (its key comes from it).
export type DocumentReadItem = DocumentMoreItem & { action: DocumentReadAction }

// The open balance of an invoice or a bill, the unapplied credit of a vendor credit; 0 for
// any other record, which takes no payment and is not applied.
function balanceOf(record: ReadRecord): number {
    const fields = record.kindFields
    if (fields.kind === 'invoice' || fields.kind === 'bill' || fields.kind === 'vendor_credit') {
        return fields.balance
    }
    return 0
}

// The ids that are not the action's name: Pay bill is `read-pay` (pay-bills spec test ids),
// Apply to bills `read-apply` (vendor credit spec test ids).
const READ_ACTION_IDS: Partial<Record<DocumentReadAction, string>> = {
    pay_bill: 'read-pay',
    apply_credit: 'read-apply',
}

// The bar and More row id of an action: `read-<action>`, with dashes (`read-receive-payment`).
function readActionId(action: DocumentReadAction): string {
    return READ_ACTION_IDS[action] ?? `read-${action.replaceAll('_', '-')}`
}

// The offered actions in the read view's order, by the kind's lifecycle; View journal
// entry needs the entry the post wrote; Download PDF needs a kind with a PDF.
function offeredActionsOf(
    doc: Pick<SalesDocumentKind, 'lifecycle' | 'features'>,
    record: ReadRecord,
    canWrite: boolean
): DocumentReadAction[] {
    const { kind } = record.kindFields
    const balance = balanceOf(record)
    const extra = {
        canReceivePayment: receivePaymentOffered(kind, record.status, balance),
        canPayBill: payBillOffered(kind, record.status, balance),
        canCreateCreditMemo: creditMemoOffered(kind, record.status),
        canApplyCredit: applyCreditOffered(kind, record.status, balance),
        canRecordRefund:
            kind === 'vendor_credit' && refundOffered(record.status, canWrite, balance),
    }
    const actions =
        doc.lifecycle === 'quote'
            ? quoteReadActions(record.status, canWrite, invoiceIdOf(record) !== '')
            : documentReadActions(record.status, canWrite, doc.features, extra).filter(
                  action => action !== 'entry' || record.entry !== ''
              )
    return doc.features.pdf ? actions : actions.filter(action => action !== 'pdf')
}

/**
 * The read view's actions of a posted or void sales document, or of a quote the read
 * view shows (a closed estimate, or any estimate for a reader), as rows the bar draws (a
 * button each on a wide screen; one button and a More menu on a phone, the button Pay bill
 * on a bill that offers it and Edit on the other posting documents), and the Void dialog.
 * Receive payment (a posted invoice with an open balance) pushes a new payment for its
 * customer with the invoice ticked, so Back returns to the invoice; Pay bill (a posted bill
 * with an open balance) pushes Pay bills with the bill selected, so Back returns to the bill;
 * Apply to bills (a posted vendor credit with unapplied credit) opens the apply dialog
 * through `useApplyCreditStore`; Record refund (a writer on a posted vendor credit with
 * unapplied credit) pushes a new vendor refund for its vendor with the credit ticked, so Back
 * returns to the credit. Edit and Copy (the kind's own `new` form) replace the read view (a
 * pushed screen would stay mounted under the new one); View journal entry takes the read
 * view's place, and keeps the kind's list when the list is below it in the child stack
 * (useOpenInPlaceOfReadView);
 * Download PDF saves the server's PDF through usePdfDownload.
 * Void writes `status: 'void'` through `useVoidDocument`, the write the lists share; the
 * dialog's open state lives here, on the read view, which stays mounted while the optimistic
 * void changes the document under it, so a refusal stays visible in the dialog.
 */
export function useDocumentReadActions(
    documentKind: DocumentKind,
    record: ReadRecord,
    canWrite: boolean
) {
    const { doc } = documentKind
    const orgHref = useOrgHref()
    const openFromReadView = useOpenFromReadView(record.id)
    const openInPlace = useOpenInPlaceOfReadView()
    // Every kind voids through the write the lists share.
    const voidWrite = useVoidDocument()
    const [isVoidOpen, setVoidOpen] = useState(false)
    const voidDocument = useMutation({
        mutationFn: function* (id: string) {
            yield voidWrite(doc.key, id)
        },
        onSuccess: () => setVoidOpen(false),
        // The dialog shows the refusal; without this core reports it again as a toast.
        onError: () => {},
    })
    const isVoiding = voidDocument.isPending
    const voidState = useServerActionState({ isDisabled: isVoiding })
    const download = usePdfDownload()
    const openInvoice = useOpenDocument(INVOICE_KIND, invoiceIdOf(record))
    const openApplyDialog = useApplyCreditStore(state => state.open)
    const run: Record<DocumentReadAction, () => void> = {
        // The apply dialog, drawn by the vendor credit's read section (vendor credit spec
        // §3.9).
        apply_credit: () => openApplyDialog(record.id),
        // Pushed, so Back returns to the vendor credit (vendor refund spec §3.9): the refund
        // form opens with the credit's vendor and the credit ticked.
        record_refund: () =>
            router.push(
                orgHref(`books/vendor-refunds/new?vendor=${vendorIdOf(record)}&credit=${record.id}`)
            ),
        // Pushed, so Back returns to the bill (pay-bills spec §2): Pay bills opens with the
        // bill paid in full and its vendor filtered.
        pay_bill: () => router.push(orgHref(`books/pay-bills?bill=${record.id}`)),
        // Pushed, so Back returns to the invoice (receive-payment spec §2).
        receive_payment: () =>
            router.push(
                orgHref(`books/payments/new?customer=${record.customer}&invoice=${record.id}`)
            ),
        edit: () => openFromReadView(documentNewHref(doc, { replaces: record.id })),
        void: () => {
            voidDocument.reset()
            setVoidOpen(true)
        },
        copy: () => openFromReadView(documentNewHref(doc, { copy: record.id })),
        // Pushed, so the memo's link goes back to the invoice below it (useOpenDocument).
        credit_memo: () =>
            router.push(orgHref(documentNewHref(CREDIT_MEMO_KIND, { invoice: record.id }))),
        entry: () => openInPlace(`books/entries/${record.entry}`),
        // Back to the invoice's screen when it is below; else pushed, so Back returns to
        // the estimate.
        invoice: openInvoice,
        pdf: () =>
            download.mutate({
                kind: doc.key,
                id: record.id,
                fallbackName: doc.pdfStem(record.number),
            }),
    }
    // Void writes, so it waits for the server; Download PDF waits for its download; the
    // others only open a screen.
    const disabledOf = (action: DocumentReadAction) => {
        if (action === 'void') return voidState.isDisabled
        if (action === 'pdf') return download.isPending
        return isVoiding
    }
    const actions: DocumentReadItem[] = offeredActionsOf(doc, record, canWrite).map(action => ({
        action,
        id: readActionId(action),
        label: DOCUMENT_READ_LABELS[action],
        keys: formatHint(DOCUMENT_READ_ACTION_KEYS[action]).text,
        isDisabled: disabledOf(action),
        isDestructive: action === 'void',
        onSelect: run[action],
    }))
    // The dialog closes when Void stops being offered (the document was voided or
    // replaced elsewhere while it was open), unless this dialog's own void runs.
    const isVoidOffered = actions.some(item => item.id === 'read-void')
    const noun = doc.noun.toLowerCase()
    const voidDialog = {
        isVisible: isVoidOpen && (isVoidOffered || isVoiding),
        entryNumber: `${noun} ${record.number}`,
        confirmLabel: `Void ${noun}`,
        isPending: isVoiding,
        errorMessage: voidDocument.error ? writeRefusalText(voidDocument.error) : null,
        onConfirm: () => voidDocument.mutate(record.id),
        onCancel: () => setVoidOpen(false),
    }
    return { actions, voidDialog }
}
