import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { formatHint } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
import { useState } from 'react'
import type { DocumentMoreItem } from '../components/documents/DocumentActionBar'
import type { DocumentKind } from '../components/documents/document-kinds'
import { applyCreditLabel } from '../lib/credit-application-kinds'
import { type DepositRead, depositedOffer } from '../lib/deposit'
import {
    applyCreditOffered,
    applyInvoiceCreditOffered,
    creditMemoOffered,
    DOCUMENT_READ_ACTION_KEYS,
    DOCUMENT_READ_LABELS,
    type DocumentReadAction,
    documentReadActionDisabled,
    documentReadActions,
    payBillOffered,
    receivePaymentOffered,
    refundCreditOffered,
    refundOffered,
    refundReceiptOffered,
    writeOffOffered,
} from '../lib/document-actions'
import { orderCloseBody, orderReadActions, quoteReadActions } from '../lib/document-lifecycle'
import { documentEditPath, documentNewHref } from '../lib/document-routes'
import { isSendKind, sendOffered } from '../lib/document-send'
import { purchaseTabOf } from '../lib/purchase-lists'
import { isOrderLineOpen, orderHasOpenLine } from '../lib/purchase-order-status'
import { documentKey } from '../lib/record-key'
import { payoutVoidBodyOf } from '../lib/refund-payout'
import { writeRefusalText } from '../lib/refusal'
import {
    CREDIT_MEMO_KIND,
    type DocumentLifecycle,
    INVOICE_KIND,
    REFUND_RECEIPT_KIND,
    type SalesDocumentKind,
} from '../lib/sales-document-kinds'
import { useApplyCreditStore } from '../stores/apply-credit-store'
import { useDocumentSendStore } from '../stores/document-send-store'
import { useWriteOffStore } from '../stores/write-off-store'
import type { DocumentRecord } from './document-data'
import { useBooksAccess } from './useBooksAccess'
import { useCopyDocumentLink } from './useCopyDocumentLink'
import { useCopyToBill } from './useCopyToBill'
import { deleteDialogTexts, useDocumentDelete, useScreenHoldRelease } from './useDocumentDelete'
import { useOpenDocument } from './useOpenDocument'
import { useOpenFromReadView, useOpenInPlaceOfReadView } from './useOpenFromReadView'
import { usePdfDownload } from './usePdfDownload'
import { usePurchaseOrderStatus } from './usePurchaseOrderStatus'
import { useUnappliedCreditMemos } from './useUnappliedCreditMemos'
import { useVoidDocument } from './useVoidDocument'

type ReadRecord = Pick<
    DocumentRecord,
    | 'id'
    | 'status'
    | 'number'
    | 'entry'
    | 'customer'
    | 'email'
    | 'kindFields'
    | 'sequence'
    | 'replaced_by'
    | 'currency'
    | 'revision'
>

// A purchase order's Close body (orderCloseBody): its open lines and its open amount; ''
// for any other record, which offers no Close.
function closeBodyOf(record: ReadRecord): string {
    const fields = record.kindFields
    if (fields.kind !== 'purchase_order') return ''
    const openLines = fields.lineReceipts.filter(isOrderLineOpen).length
    return orderCloseBody(openLines, fields.open_amount, record.currency)
}

// The customer link's token of an invoice; '' for any other record, which offers no Copy
// customer link on its read view (an estimate's is on its form).
function invoiceTokenOf(record: ReadRecord): string {
    return record.kindFields.kind === 'invoice' ? record.kindFields.public_token : ''
}

// The invoice made from a closed estimate; '' for any other record.
function invoiceIdOf(record: ReadRecord): string {
    return record.kindFields.kind === 'estimate' ? record.kindFields.invoice : ''
}

// The id of a purchase order, whose Copy to bill reads it (useCopyToBill); '' for any other
// record, which reads nothing.
function orderIdOf(record: ReadRecord): string {
    return record.kindFields.kind === 'purchase_order' ? record.id : ''
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

// The customer whose credit memos an invoice's Apply credit reads: a writer's posted invoice
// with an open balance only; '' (the read is off) for every other record and for a reader.
function creditCustomerOf(record: ReadRecord, canWrite: boolean): string {
    const fields = record.kindFields
    if (fields.kind !== 'invoice') return ''
    const isOpen = record.status === 'posted' && fields.balance > 0
    return canWrite && isOpen ? record.customer : ''
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

// An order's actions (orderReadActions): by its status, how it closed, the user's access
// and whether a line is still open; no action for any other record.
function orderActionsOf(
    record: ReadRecord,
    canWrite: boolean,
    isAdmin: boolean
): DocumentReadAction[] {
    const fields = record.kindFields
    if (fields.kind !== 'purchase_order') return []
    const status = record.status === 'closed' ? 'closed' : 'open'
    return orderReadActions({
        status,
        closedReason: fields.closed_reason,
        canWrite,
        isAdmin,
        hasOpenLine: orderHasOpenLine(fields.lineReceipts),
    })
}

// The offered actions in the read view's order, by the kind's lifecycle (an exhaustive
// switch); View journal entry needs the entry the post wrote; Download PDF needs a kind
// with a PDF.
function offeredActionsOf(
    doc: Pick<SalesDocumentKind, 'lifecycle' | 'features'>,
    record: ReadRecord,
    access: { canWrite: boolean; isAdmin: boolean },
    hasUnappliedCredit: boolean,
    isDeposited: boolean
): DocumentReadAction[] {
    const { canWrite } = access
    const { kind } = record.kindFields
    const balance = balanceOf(record)
    const extra = {
        isDeposited,
        canReceivePayment: receivePaymentOffered(kind, record.status, balance),
        canPayBill: payBillOffered(kind, record.status, balance),
        canCreateCreditMemo: creditMemoOffered(kind, record.status),
        canApplyCredit: applyCreditOffered(kind, record.status, balance),
        canApplyInvoiceCredit: applyInvoiceCreditOffered(
            kind,
            record.status,
            balance,
            hasUnappliedCredit
        ),
        canRecordRefund:
            kind === 'vendor_credit' && refundOffered(record.status, canWrite, balance),
        canRefund: refundReceiptOffered(kind, record.status),
        canRefundCredit: refundCreditOffered(kind, record.status, balance),
        canWriteOff: writeOffOffered(kind, record.status, balance),
        canSend: sendOffered(kind, record.status),
        canCopyLink:
            kind === 'invoice' && record.status === 'posted' && invoiceTokenOf(record) !== '',
    }
    const actions = lifecycleActionsOf(doc.lifecycle, {
        quote: () => quoteReadActions(record.status, canWrite, invoiceIdOf(record) !== ''),
        order: () => orderActionsOf(record, canWrite, access.isAdmin),
        posting: () =>
            documentReadActions(record.status, canWrite, doc.features, extra).filter(
                action => action !== 'entry' || record.entry !== ''
            ),
    })
    return doc.features.pdf ? actions : actions.filter(action => action !== 'pdf')
}

// Whether the read view's Edit opens the record's own form (`?edit=1`, purchase order spec
// §3.2) and Delete holds the record while it runs: an order's. A posting document's Edit
// opens its correction; a quote's read view has no Edit. Keyed by DocumentLifecycle, so a
// new lifecycle fails tsc until it has its answer.
const EDITS_OWN_RECORD: Record<DocumentLifecycle, boolean> = {
    posting: false,
    quote: false,
    order: true,
}

// The actions of the kind's lifecycle; keyed by DocumentLifecycle, so a new lifecycle fails
// tsc until it has its actions.
function lifecycleActionsOf(
    lifecycle: DocumentLifecycle,
    byLifecycle: Record<DocumentLifecycle, () => DocumentReadAction[]>
): DocumentReadAction[] {
    return byLifecycle[lifecycle]()
}

/**
 * The read view's actions of a posted or void sales document, or of a quote the read
 * view shows (a closed estimate, or any estimate for a reader), as rows the bar draws (a
 * button each on a wide screen; one button and a More menu on a phone, the button Pay bill
 * on a bill that offers it and Edit on the other posting documents), and the Void dialog.
 * Receive payment (a posted invoice with an open balance) pushes a new payment for its
 * customer with the invoice ticked, so Back returns to the invoice; Pay bill (a posted bill
 * with an open balance) pushes Pay bills with the bill selected, so Back returns to the bill;
 * Apply (Apply to bills on a posted vendor credit, Apply to invoices on a posted credit memo,
 * each with unapplied credit, and Apply credit on a writer's posted invoice with an open
 * balance while useUnappliedCreditMemos finds its customer's unapplied credit; its words from
 * applyCreditLabel) opens the apply dialog with the record's id through `useApplyCreditStore`; Record refund (a writer on a posted vendor credit with
 * unapplied credit) pushes a new vendor refund for its vendor with the credit ticked, so Back
 * returns to the credit. Refund (a writer on a posted sales receipt) and Refund credit (a
 * writer on a posted credit memo with unapplied credit) push a new refund receipt made from
 * the record, so Back returns to it; a payout's Void dialog says the credit memo's credit is
 * unapplied again. Write off (a writer on a posted invoice with an open balance) opens the
 * write-off dialog through `useWriteOffStore` with `owner`, the `useId()` of the read view
 * that mounts the dialog. Copy to bill (a writer on an open purchase order with an open
 * line) opens the Copy to bill dialog through `useCopyToBill(orderId).open` with the same
 * `owner`.
 * Send… (a writer on a sent-able document, sendOffered) opens the
 * Send dialog through `useDocumentSendStore` with the same `owner`; Copy customer link (a
 * writer on a posted invoice with a token) copies its link through useCopyDocumentLink and
 * is disabled while writes are not available. Edit and Copy (the kind's own `new` form) replace the read view (a
 * pushed screen would stay mounted under the new one); View journal entry takes the read
 * view's place, and keeps the kind's list when the list is below it in the child stack
 * (useOpenInPlaceOfReadView);
 * Download PDF saves the server's PDF through usePdfDownload.
 * Edit and Void are not offered while a posted deposit holds the record's entry, or while
 * that read (`depositRead`) is not ready (depositedOffer; bank deposit spec §3.10).
 * Void writes `status: 'void'` through `useVoidDocument`, the write the lists share; the
 * dialog's open state lives here, on the read view, which stays mounted while the optimistic
 * void changes the document under it, so a refusal stays visible in the dialog.
 */
export function useDocumentReadActions(
    documentKind: DocumentKind,
    record: ReadRecord,
    canWrite: boolean,
    owner: string,
    // The posted deposit that holds the record's entry (useDepositOf; off for a kind that no
    // deposit holds).
    depositRead: DepositRead
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
    // Writes alone (no own flag): documentReadActionDisabled adds the void's.
    const writeState = useServerActionState()
    const download = usePdfDownload()
    const openInvoice = useOpenDocument(INVOICE_KIND, invoiceIdOf(record))
    const openApplyDialog = useApplyCreditStore(state => state.open)
    const openWriteOff = useWriteOffStore(state => state.open)
    const openSend = useDocumentSendStore(state => state.open)
    const copyToBill = useCopyToBill(orderIdOf(record))
    const copyLink = useCopyDocumentLink('invoice', invoiceTokenOf(record))
    const sendKind = record.kindFields.kind
    // Close and Reopen are a Books admin's (spec §3.6); the access row is the one every Books
    // screen reads, so this serves it from the store.
    const { isAdmin } = useBooksAccess()
    // Close asks first (the Close dialog, which the read view draws); Reopen has no confirm.
    const [isCloseOpen, setCloseOpen] = useState(false)
    const status = usePurchaseOrderStatus(() => setCloseOpen(false))
    // Delete (an order's More row): the confirm dialog, the hold of the record while the
    // delete runs, and All purchases after it (the record is gone; spec §3.6). A push, so the
    // browser's back reaches the deleted order's route, which says it does not exist.
    const listHref = orgHref(purchaseTabOf('all').path)
    const deletion = useDocumentDelete(doc, record.id, () => router.push(listHref))
    const editsOwnRecord = EDITS_OWN_RECORD[doc.lifecycle]
    useScreenHoldRelease(editsOwnRecord ? record.id : undefined)
    // An order's form is its own route with `?edit=1` (spec §3.2), in the read view's place.
    const editOrder = () => router.replace(orgHref(documentEditPath(doc, documentKey(record))))
    // The same query key as the invoice's read frame, so one request serves both.
    const unappliedCredits = useUnappliedCreditMemos(creditCustomerOf(record, canWrite))
    const hasUnappliedCredit = unappliedCredits.credits.length > 0
    // The Send dialog over this read view (email-share spec §3.2), which the read view mounts
    // with the same `owner`. Only a kind the server sends (isSendKind) has the handler, so
    // Send… is not drawn and its key is not registered for any other kind.
    const sendRun: Partial<Record<DocumentReadAction, () => void>> = isSendKind(sendKind)
        ? { send: () => openSend({ kind: sendKind, id: record.id }, owner) }
        : {}
    // The actions this read view has a handler for; an offered action without one is not
    // drawn.
    const run: Partial<Record<DocumentReadAction, () => void>> = {
        ...sendRun,
        // A purchase order's Close (its confirm, spec §3.6) and Reopen (no confirm).
        close: () => setCloseOpen(true),
        reopen: () => status.reopen(record.id),
        // The Copy to bill dialog over this read view (spec §3.7), which the read view mounts
        // with the same `owner`; its Create bill pushes the bill form, so Back returns here.
        copy_to_bill: () => copyToBill.open(owner),
        // The apply dialog, drawn by the credit's or the invoice's read frame (vendor credit
        // spec §3.9, apply credit spec §3.2, §3.3), opened with this record's id.
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
        // The invoice's customer link on the clipboard, with a toast (email-share spec §3.5).
        link: copyLink.copy,
        // A posted document's Edit opens its correction; an order's opens its own form.
        edit: editsOwnRecord
            ? editOrder
            : () => openFromReadView(documentNewHref(doc, { replaces: record.id })),
        delete: deletion.open,
        void: () => {
            voidDocument.reset()
            setVoidOpen(true)
        },
        copy: () => openFromReadView(documentNewHref(doc, { copy: record.id })),
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
    // documentReadActionDisabled: an action that writes waits for writes to be available,
    // Void also for its own void; Download PDF waits for its download; Copy customer link
    // waits for writes to be available (useCopyDocumentLink); the others only open a screen
    // or a dialog.
    const disabledState = {
        writesAvailable: !writeState.isDisabled,
        isVoiding,
        isDownloading: download.isPending,
        isLinkOffered: copyLink.isOffered,
    }
    const disabledOf = (action: DocumentReadAction) =>
        documentReadActionDisabled(action, disabledState)
    // Apply's words follow the record's kind: "Apply to bills", "Apply to invoices", "Apply
    // credit".
    // Delete names the kind: "Delete purchase order".
    const labelOf = (action: DocumentReadAction) => {
        if (action === 'apply_credit') return applyCreditLabel(record.kindFields.kind)
        if (action === 'delete') return `${DOCUMENT_READ_LABELS.delete} ${doc.noun.toLowerCase()}`
        return DOCUMENT_READ_LABELS[action]
    }
    const isDeposited = depositedOffer({ hasEntry: record.entry !== '', ...depositRead })
    const offered = offeredActionsOf(
        doc,
        record,
        { canWrite, isAdmin },
        hasUnappliedCredit,
        isDeposited
    )
    const actions: DocumentReadItem[] = offered.flatMap(action => {
        const onSelect = run[action]
        if (!onSelect) return []
        const key = DOCUMENT_READ_ACTION_KEYS[action]
        return [
            {
                action,
                id: readActionId(action),
                label: labelOf(action),
                keys: key ? formatHint(key).text : '',
                isDisabled: disabledOf(action),
                isDestructive: action === 'void' || action === 'delete',
                onSelect,
            },
        ]
    })
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
    // The delete confirm (DeleteDraftDialog) with the kind's words; the server's refusal
    // ("Purchase order 1004 has bills. Close it instead.") shows in it.
    const deleteDialog = {
        isVisible: deletion.isOpen,
        onConfirm: deletion.confirm,
        onCancel: deletion.cancel,
        isPending: deletion.isPending,
        errorMessage: deletion.errorMessage,
        ...deleteDialogTexts(doc, record.number),
    }
    // The Close confirm closes when Close stops being offered (the order closed, or the user
    // lost admin or write access, while it was open), unless its own Close runs.
    const isCloseOffered = actions.some(item => item.action === 'close')
    const closeDialog = {
        isVisible: isCloseOpen && (isCloseOffered || status.isClosing),
        number: record.number,
        body: closeBodyOf(record),
        isPending: status.isClosing,
        // The revision this read view shows: the server refuses the Close when the order
        // changed after it (usePurchaseOrderStatus).
        onConfirm: () => status.close({ id: record.id, revision: record.revision }),
        onCancel: () => setCloseOpen(false),
    }
    // A list row's Copy to bill opens its dialog here only while this read view offers it
    // (useCopyToBillStore `claim`).
    const isCopyToBillOffered = actions.some(item => item.action === 'copy_to_bill')
    return {
        actions,
        voidDialog,
        deleteDialog,
        closeDialog,
        isReopening: status.isReopening,
        isCopyToBillOffered,
    }
}
