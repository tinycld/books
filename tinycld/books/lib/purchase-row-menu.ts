// The "More actions" menu of a purchase list's row (spec §3 "Row menu"): Open, then the
// actions the document's read view offers for its status and the user's access, in the
// read view's order and with its labels, never Edit. A draft opens in its form, so its
// menu holds Open and, for a writer, Delete draft. View journal entry shows only when the
// document has an entry. Pure, so each rule is unit-tested.

import { billPaymentReadActions } from './bill-payment-read-actions'
import {
    applyCreditOffered,
    DOCUMENT_READ_LABELS,
    type DocumentReadAction,
    documentReadActions,
    payBillOffered,
    refundOffered,
} from './document-actions'
import { type DocumentListRow, isSalesKind, listDocumentHref } from './document-list'
import { documentNewHref } from './document-routes'
import { ROW_MENU_LABELS } from './document-row-menu'
import { PAY_BILLS_MESSAGES } from './pay-bills-texts'
import { paymentReadActions } from './payment-read-actions'
import { BILL_KIND, EXPENSE_KIND, VENDOR_CREDIT_KIND } from './sales-document-kinds'
import { VENDOR_REFUND_FLOW } from './vendor-refund-flow'
import type { VendorTransactionKind } from './vendor-transactions'

export type PurchaseRowMenuAction =
    | 'open'
    | 'pay_bill'
    | 'apply_credit'
    | 'record_refund'
    | 'void'
    | 'copy'
    | 'entry'
    | 'delete_draft'

export const PURCHASE_ROW_MENU_LABELS: Record<PurchaseRowMenuAction, string> = {
    open: ROW_MENU_LABELS.open,
    pay_bill: DOCUMENT_READ_LABELS.pay_bill,
    apply_credit: DOCUMENT_READ_LABELS.apply_credit,
    record_refund: DOCUMENT_READ_LABELS.record_refund,
    void: DOCUMENT_READ_LABELS.void,
    copy: DOCUMENT_READ_LABELS.copy,
    entry: DOCUMENT_READ_LABELS.entry,
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
    kind: VendorTransactionKind,
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

export function purchaseRowMenuItems(
    row: DocumentListRow,
    canWrite: boolean
): PurchaseRowMenuAction[] {
    const { kind } = row
    if (isSalesKind(kind)) return ['open']
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
    if (action === 'open') return listDocumentHref(kind, row.id)
    if (isSalesKind(kind)) return null
    switch (action) {
        case 'pay_bill':
            return `books/pay-bills?bill=${row.id}`
        case 'record_refund':
            return `books/vendor-refunds/new?vendor=${row.partyId}&credit=${row.id}`
        case 'copy':
            return isDocumentKind(kind)
                ? documentNewHref(DOCUMENT_KINDS[kind], { copy: row.id })
                : null
        case 'entry':
            return `books/entries/${row.entry}`
        case 'apply_credit':
        case 'void':
        case 'delete_draft':
            return null
    }
}

// The Void dialog's words for a purchase kind, the ones that kind's read view shows.
export function purchaseVoidTexts(kind: VendorTransactionKind): {
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
