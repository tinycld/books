// The "More actions" menu of a purchase list's row (spec §3 "Row menu"): Open, then the
// actions the document's read view offers for its status and the user's access, in the
// read view's order and with its labels, never Edit. A draft opens in its form, so its
// menu holds Open and, for a writer, Delete draft. View journal entry shows only when the
// document has an entry. A purchase order's menu is its own (purchase order spec §3.9,
// `orderRowMenuItems`). Pure, so each rule is unit-tested.

import { billPaymentReadActions } from './bill-payment-read-actions'
import {
    applyCreditOffered,
    DOCUMENT_READ_LABELS,
    type DocumentReadAction,
    documentReadActions,
    payBillOffered,
    refundOffered,
} from './document-actions'
import { type OrderStatus, orderReadActions } from './document-lifecycle'
import { type DocumentListRow, isSalesKind, listDocumentHref } from './document-list'
import { documentEditPath, documentNewHref } from './document-routes'
import { ROW_MENU_LABELS } from './document-row-menu'
import { PAY_BILLS_MESSAGES } from './pay-bills-texts'
import { paymentReadActions } from './payment-read-actions'
import {
    BILL_KIND,
    EXPENSE_KIND,
    PURCHASE_ORDER_KIND,
    VENDOR_CREDIT_KIND,
} from './sales-document-kinds'
import { VENDOR_REFUND_FLOW } from './vendor-refund-flow'
import type { VendorTransactionKind } from './vendor-transactions'

export type PurchaseRowMenuAction =
    | 'open'
    | 'copy_to_bill'
    | 'edit'
    | 'send'
    | 'pay_bill'
    | 'apply_credit'
    | 'record_refund'
    | 'void'
    | 'pdf'
    | 'copy'
    | 'close'
    | 'entry'
    | 'delete'
    | 'delete_draft'

export const PURCHASE_ROW_MENU_LABELS: Record<PurchaseRowMenuAction, string> = {
    open: ROW_MENU_LABELS.open,
    copy_to_bill: DOCUMENT_READ_LABELS.copy_to_bill,
    edit: DOCUMENT_READ_LABELS.edit,
    send: DOCUMENT_READ_LABELS.send,
    pay_bill: DOCUMENT_READ_LABELS.pay_bill,
    apply_credit: DOCUMENT_READ_LABELS.apply_credit,
    record_refund: DOCUMENT_READ_LABELS.record_refund,
    void: DOCUMENT_READ_LABELS.void,
    pdf: DOCUMENT_READ_LABELS.pdf,
    copy: DOCUMENT_READ_LABELS.copy,
    close: DOCUMENT_READ_LABELS.close,
    entry: DOCUMENT_READ_LABELS.entry,
    delete: DOCUMENT_READ_LABELS.delete,
    delete_draft: ROW_MENU_LABELS.delete_draft,
}

// The purchase kinds that have a document read view (lines, Copy); a bill payment and a
// vendor refund have a payment read view.
const DOCUMENT_KINDS = {
    bill: BILL_KIND,
    expense: EXPENSE_KIND,
    vendor_credit: VENDOR_CREDIT_KIND,
} as const

type PurchaseDocumentKind = keyof typeof DOCUMENT_KINDS

function isDocumentKind(kind: VendorTransactionKind): kind is PurchaseDocumentKind {
    return kind in DOCUMENT_KINDS
}

type StoredStatus = 'posted' | 'void'

// A stored (not draft) document's status; null for any other text.
function storedStatusOf(text: string): StoredStatus | null {
    if (text === 'posted' || text === 'void') return text
    return null
}

// A read-view action as a purchase row-menu action: every one but Edit and the sales
// actions (Receive payment, Create credit memo, Open invoice, Download PDF), which no
// purchase read view offers.
function isPurchaseRowMenuAction(
    action: DocumentReadAction
): action is Extract<PurchaseRowMenuAction, DocumentReadAction> {
    return (
        action !== 'edit' &&
        action !== 'receive_payment' &&
        action !== 'credit_memo' &&
        action !== 'invoice' &&
        action !== 'pdf'
    )
}

// The read view's actions of a stored purchase row, as that kind's read view picks them.
function readActionsOf(
    kind: Exclude<VendorTransactionKind, 'purchase_order'>,
    row: DocumentListRow,
    status: StoredStatus,
    canWrite: boolean
): DocumentReadAction[] {
    if (kind === 'bill_payment') return billPaymentReadActions(status, canWrite)
    if (kind === 'vendor_refund') return paymentReadActions(status, canWrite)
    const extra = {
        canReceivePayment: false,
        canPayBill: payBillOffered(kind, status, row.balance),
        canCreateCreditMemo: false,
        canApplyCredit: applyCreditOffered(kind, status, row.balance),
        canRecordRefund: kind === 'vendor_credit' && refundOffered(status, canWrite, row.balance),
    }
    return documentReadActions(status, canWrite, DOCUMENT_KINDS[kind].features, extra)
}

// A purchase order's menu, in the spec's order (§3.9 "Row menu"): the actions the read
// view offers (`orderReadActions`), with Copy to bill while the order's stored open amount
// is above zero and Delete only when no bill names the order (the server refuses the
// delete of one that a bill names). No Reopen: it stays on the read view.
const ORDER_ROW_MENU: readonly Extract<PurchaseRowMenuAction, DocumentReadAction>[] = [
    'copy_to_bill',
    'edit',
    'send',
    'pdf',
    'copy',
    'close',
    'delete',
]

function orderStatusOf(text: string): OrderStatus | null {
    if (text === 'open' || text === 'closed') return text
    return null
}

function orderRowMenuItems(
    row: DocumentListRow,
    canWrite: boolean,
    isAdmin: boolean
): PurchaseRowMenuAction[] {
    const status = orderStatusOf(row.recordStatus)
    if (status === null) return ['open']
    const offered = orderReadActions({
        status,
        // Only Reopen reads the reason, and the row menu has none.
        closedReason: '',
        canWrite,
        isAdmin,
        // A line is open by its quantities, not its amount: a rate-0 product line is open
        // with an open amount of 0 (`isOrderLineOpen`, counted into `openLines`).
        hasOpenLine: (row.openLines ?? 0) > 0,
    })
    const isShown = (action: (typeof ORDER_ROW_MENU)[number]) =>
        offered.includes(action) && (action !== 'delete' || row.hasBills === false)
    return ['open', ...ORDER_ROW_MENU.filter(isShown)]
}

// `isAdmin` (a Books admin, `useBooksAccess`) is read by a purchase order's Close only.
export function purchaseRowMenuItems(
    row: DocumentListRow,
    canWrite: boolean,
    isAdmin = false
): PurchaseRowMenuAction[] {
    const { kind } = row
    if (isSalesKind(kind)) return ['open']
    if (kind === 'purchase_order') return orderRowMenuItems(row, canWrite, isAdmin)
    if (row.recordStatus === 'draft') {
        const canDelete = canWrite && kind !== 'bill_payment'
        return canDelete ? ['open', 'delete_draft'] : ['open']
    }
    const status = storedStatusOf(row.recordStatus)
    if (status === null) return ['open']
    const offered = readActionsOf(kind, row, status, canWrite)
        .filter(action => action !== 'entry' || row.entry !== '')
        .filter(isPurchaseRowMenuAction)
    return ['open', ...offered]
}

// The route a navigating action pushes (without the org prefix); null for the actions that
// stay on the list (Void, Delete draft) and for Apply to bills, which the row actions run
// themselves (`useOpenCreditWithApply`: they push the vendor credit and open its apply dialog).
export function purchaseRowActionHref(
    row: DocumentListRow,
    action: PurchaseRowMenuAction
): string | null {
    const { kind } = row
    if (action === 'open') return listDocumentHref(kind, row.key)
    if (isSalesKind(kind)) return null
    switch (action) {
        case 'pay_bill':
            return `books/pay-bills?bill=${row.id}`
        case 'record_refund':
            return `books/vendor-refunds/new?vendor=${row.partyId}&credit=${row.id}`
        case 'edit':
            return kind === 'purchase_order' ? documentEditPath(PURCHASE_ORDER_KIND, row.key) : null
        case 'copy':
            return copyHref(kind, row.id)
        case 'entry':
            return `books/entries/${row.entry}`
        // Copy to bill opens the order with its dialog, which the row actions run themselves
        // (as Apply to bills); Send…, Download PDF, Close and Delete stay on the list.
        case 'copy_to_bill':
        case 'send':
        case 'pdf':
        case 'close':
        case 'delete':
        case 'apply_credit':
        case 'void':
        case 'delete_draft':
            return null
    }
}

function copyHref(kind: VendorTransactionKind, id: string): string | null {
    if (kind === 'purchase_order') return documentNewHref(PURCHASE_ORDER_KIND, { copy: id })
    if (isDocumentKind(kind)) return documentNewHref(DOCUMENT_KINDS[kind], { copy: id })
    return null
}

// The Void dialog's words for a purchase kind, the ones that kind's read view shows. A
// purchase order never posts, so neither its menu nor Void offers a void: it is no kind here.
export function purchaseVoidTexts(kind: Exclude<VendorTransactionKind, 'purchase_order'>): {
    body: string
    confirmLabel: string
    noun: string
} {
    if (kind === 'bill_payment') {
        return {
            body: PAY_BILLS_MESSAGES.voidBody,
            confirmLabel: PAY_BILLS_MESSAGES.voidConfirm,
            noun: 'bill payment',
        }
    }
    if (kind === 'vendor_refund') {
        const { texts } = VENDOR_REFUND_FLOW
        return { body: texts.voidBody, confirmLabel: texts.voidConfirm, noun: texts.voidNoun }
    }
    const doc = DOCUMENT_KINDS[kind]
    const noun = doc.noun.toLowerCase()
    return { body: doc.messages.voidBody, confirmLabel: `Void ${noun}`, noun }
}
