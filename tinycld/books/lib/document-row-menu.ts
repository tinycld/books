// The "More actions" menu of a sales list's row (spec §3 "Row menu"): Open, then the
// actions the document's read view offers for its status and the user's access, in the
// read view's order and with its labels, never Edit. A draft opens in its form, so its
// menu holds Open and, for a writer, Delete draft. Pure, so each rule is unit-tested.

import {
    creditMemoOffered,
    DOCUMENT_READ_LABELS,
    type DocumentReadAction,
    documentReadActions,
    receivePaymentOffered,
} from './document-actions'
import { type DocumentStatus, quoteReadActions } from './document-lifecycle'
import type { DocumentListRow } from './document-list'
import { documentHref, documentNewHref } from './document-routes'
import { TRANSACTION_DOC_KINDS } from './party-transactions'
import { paymentReadActions } from './payment-read-actions'
import { CREDIT_MEMO_KIND, INVOICE_KIND, SALES_FEATURES } from './sales-document-kinds'

export type RowMenuAction =
    | 'open'
    | 'receive_payment'
    | 'void'
    | 'copy'
    | 'credit_memo'
    | 'entry'
    | 'invoice'
    | 'pdf'
    | 'delete_draft'

export const ROW_MENU_LABELS: Record<RowMenuAction, string> = {
    open: 'Open',
    receive_payment: DOCUMENT_READ_LABELS.receive_payment,
    void: DOCUMENT_READ_LABELS.void,
    copy: DOCUMENT_READ_LABELS.copy,
    credit_memo: DOCUMENT_READ_LABELS.credit_memo,
    entry: DOCUMENT_READ_LABELS.entry,
    invoice: DOCUMENT_READ_LABELS.invoice,
    pdf: DOCUMENT_READ_LABELS.pdf,
    delete_draft: 'Delete draft',
}

const DOCUMENT_STATUSES: readonly DocumentStatus[] = [
    'draft',
    'posted',
    'void',
    'pending',
    'accepted',
    'rejected',
    'closed',
]

function documentStatusOf(text: string): DocumentStatus | null {
    return DOCUMENT_STATUSES.find(status => status === text) ?? null
}

type PaymentStatus = 'draft' | 'posted' | 'void'

function paymentStatusOf(status: DocumentStatus): PaymentStatus | null {
    if (status === 'draft' || status === 'posted' || status === 'void') return status
    return null
}

// A read-view action as a row-menu action: every one but Edit, Pay bill (a bill's), and
// Apply to bills and Record refund (a vendor credit's), which are never on a sales list.
function isRowMenuAction(
    action: DocumentReadAction
): action is Exclude<DocumentReadAction, 'edit' | 'pay_bill' | 'apply_credit' | 'record_refund'> {
    return (
        action !== 'edit' &&
        action !== 'pay_bill' &&
        action !== 'apply_credit' &&
        action !== 'record_refund'
    )
}

// The read view's actions of the row, without Edit; View journal entry only with an entry.
function readActionsOf(row: DocumentListRow, status: DocumentStatus, canWrite: boolean) {
    if (row.kind === 'estimate')
        return quoteReadActions(status, canWrite, row.convertedInvoice !== '')
    if (row.kind === 'payment') {
        const paymentStatus = paymentStatusOf(status)
        if (paymentStatus === null) return []
        return paymentReadActions(paymentStatus, canWrite, row.entry !== '')
    }
    const extra = {
        canReceivePayment: receivePaymentOffered(row.kind, status, row.balance),
        canPayBill: false,
        canCreateCreditMemo: creditMemoOffered(row.kind, status),
    }
    return documentReadActions(status, canWrite, SALES_FEATURES, extra).filter(
        action => action !== 'entry' || row.entry !== ''
    )
}

export function documentRowMenuItems(row: DocumentListRow, canWrite: boolean): RowMenuAction[] {
    if (row.recordStatus === 'draft') return canWrite ? ['open', 'delete_draft'] : ['open']
    const status = documentStatusOf(row.recordStatus)
    if (status === null) return ['open']
    const offered: DocumentReadAction[] = readActionsOf(row, status, canWrite)
    return ['open', ...offered.filter(isRowMenuAction)]
}

// The menu row's test id: `sales-row-action-<action>`, with dashes.
export function rowActionTestId(action: RowMenuAction): string {
    return `sales-row-action-${action.replaceAll('_', '-')}`
}

// The route a navigating action pushes (without the org prefix); null for the actions that
// stay on the list (Download PDF, Void, Delete draft).
export function rowActionHref(row: DocumentListRow, action: RowMenuAction): string | null {
    const kind = TRANSACTION_DOC_KINDS[row.kind]
    switch (action) {
        case 'open':
            return documentHref(kind, row.id)
        case 'receive_payment':
            return `books/payments/new?customer=${row.customerId}&invoice=${row.id}`
        case 'copy':
            return documentNewHref(kind, { copy: row.id })
        case 'credit_memo':
            return documentNewHref(CREDIT_MEMO_KIND, { invoice: row.id })
        case 'entry':
            return `books/entries/${row.entry}`
        case 'invoice':
            return documentHref(INVOICE_KIND, row.convertedInvoice)
        case 'pdf':
        case 'void':
        case 'delete_draft':
            return null
    }
}
