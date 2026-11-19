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
    refundCreditOffered,
    refundOffered,
    refundReceiptOffered,
    writeOffOffered,
} from '../lib/document-actions'
import { quoteReadActions } from '../lib/document-lifecycle'
import { documentNewHref } from '../lib/document-routes'
import { transactionKindOf } from '../lib/party-transactions'
import { payoutVoidBodyOf } from '../lib/refund-payout'
import { writeRefusalText } from '../lib/refusal'
import {
    CREDIT_MEMO_KIND,
    INVOICE_KIND,
    REFUND_RECEIPT_KIND,
    type SalesDocumentKind,
} from '../lib/sales-document-kinds'
import { useApplyCreditStore } from '../stores/apply-credit-store'
import { useWriteOffStore } from '../stores/write-off-store'
import type { DocumentRecord } from './document-data'
import { useOpenDocument } from './useOpenDocument'
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

// The open balance of an invoice or a bill, the unapplied credit of a credit memo or a
// vendor credit; 0 for any other record, which takes no payment and is not applied.
function balanceOf(record: ReadRecord): number {
    const fields = record.kindFields
    switch (fields.kind) {
        case 'invoice':
        case 'bill':
        case 'credit_memo':
        case 'vendor_credit':
            return fields.balance
        default:
            return 0
    }
}

// A payout's void dialog says its credit memo's credit is unapplied again (payoutVoidBodyOf);
// every other record shows the dialog's own text.
function voidBodyOf(record: ReadRecord): string | undefined {
    const fields = record.kindFields
    if (fields.kind !== 'refund_receipt') return undefined
    return payoutVoidBodyOf(fields.credit_memo)
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
        canRefund: refundReceiptOffered(kind, record.status),
        canRefundCredit: refundCreditOffered(kind, record.status, balance),
        canWriteOff: writeOffOffered(kind, record.status, balance),
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
 * returns to the credit. Refund (a writer on a posted sales receipt) and Refund credit (a
 * writer on a posted credit memo with unapplied credit) push a new refund receipt made from
 * the record, so Back returns to it; a payout's Void dialog says the credit memo's credit is
 * unapplied again. Write off (a writer on a posted invoice with an open balance) opens the
 * write-off dialog through `useWriteOffStore` with `owner`, the `useId()` of the read view
 * that mounts the dialog. Edit, Copy and View journal entry replace the read view (a pushed screen would stay
 * mounted under the new one); Download PDF saves the server's PDF through usePdfDownload.
 * Void writes `status: 'void'` through the kind's data source; the dialog's open state
 * lives here, on the read view, which stays mounted while the optimistic void changes the
 * document under it, so a refusal stays visible in the dialog.
 */
export function useDocumentReadActions(
    documentKind: DocumentKind,
    record: ReadRecord,
    canWrite: boolean,
    owner: string
) {
    const { doc } = documentKind
    const orgHref = useOrgHref()
    const writes = documentKind.data.useWrites()
    const voidSales = useVoidDocument()
    // A sales kind voids through the write the sales lists share; a purchase kind (bill,
    // expense) through its own data source.
    const salesKind = transactionKindOf(doc)
    const [isVoidOpen, setVoidOpen] = useState(false)
    const voidDocument = useMutation({
        mutationFn: function* (id: string) {
            yield salesKind === null ? writes.voidRecord(id) : voidSales(salesKind, id)
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
    const openWriteOff = useWriteOffStore(state => state.open)
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
        edit: () => router.replace(orgHref(documentNewHref(doc, { replaces: record.id }))),
        void: () => {
            voidDocument.reset()
            setVoidOpen(true)
        },
        copy: () => router.replace(orgHref(documentNewHref(doc, { copy: record.id }))),
        // Pushed, so the memo's link goes back to the invoice below it (useOpenDocument).
        credit_memo: () =>
            router.push(orgHref(documentNewHref(CREDIT_MEMO_KIND, { invoice: record.id }))),
        // The write-off dialog over this read view (write-off spec §3.2).
        write_off: () => openWriteOff(record.id, owner),
        // Pushed, so Back returns to the sales receipt or the credit memo (refund receipt
        // spec §3.11, §3.12).
        refund: () =>
            router.push(
                orgHref(documentNewHref(REFUND_RECEIPT_KIND, { sales_receipt: record.id }))
            ),
        refund_credit: () =>
            router.push(orgHref(documentNewHref(REFUND_RECEIPT_KIND, { credit_memo: record.id }))),
        entry: () => router.replace(orgHref(`books/entries/${record.entry}`)),
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
        body: voidBodyOf(record),
        isPending: isVoiding,
        errorMessage: voidDocument.error ? writeRefusalText(voidDocument.error) : null,
        onConfirm: () => voidDocument.mutate(record.id),
        onCancel: () => setVoidOpen(false),
    }
    return { actions, voidDialog }
}
