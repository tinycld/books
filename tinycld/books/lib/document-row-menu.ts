// The "More actions" menu of a sales list's row (spec §3 "Row menu"): Open, then the
// actions the document's read view offers for its status and the user's access, in the
// read view's order and with its labels, never Edit; Write off comes directly after
// Receive payment (write-off spec §3.1), which differs from the read view on purpose. A
// posted credit memo with unapplied credit starts its writer's menu with Apply to invoices,
// before Open (apply credit spec §3.1); an invoice row never offers an Apply (Q4). A
// draft opens in its form, so its menu holds Open and, for a writer, Delete draft; a
// write-off's menu holds Open alone (its page has the Void). Pure, so each rule is
// unit-tested.

import { applyCreditLabel } from './credit-application-kinds'
import {
    applyCreditOffered,
    creditMemoOffered,
    DOCUMENT_READ_LABELS,
    type DocumentReadAction,
    documentReadActions,
    receivePaymentOffered,
    writeOffOffered,
} from './document-actions'
import { type DocumentStatus, quoteReadActions } from './document-lifecycle'
import { type DocumentListRow, isSalesKind, listDocumentHref } from './document-list'
import { documentHref, documentNewHref } from './document-routes'
import { TRANSACTION_DOC_KINDS } from './party-transactions'
import { paymentReadActions } from './payment-read-actions'
import type { PurchaseRowMenuAction } from './purchase-row-menu'
import { CREDIT_MEMO_KIND, INVOICE_KIND, SALES_FEATURES } from './sales-document-kinds'

export type RowMenuAction =
    | 'apply_credit'
    | 'open'
    | 'receive_payment'
    | 'write_off'
    | 'void'
    | 'copy'
    | 'credit_memo'
    | 'entry'
    | 'invoice'
    | 'pdf'
    | 'delete_draft'

// A sales row's Apply is a credit memo's alone, so it takes the credit memo's label.
export const ROW_MENU_LABELS: Record<RowMenuAction, string> = {
    apply_credit: applyCreditLabel('credit_memo'),
    open: 'Open',
    receive_payment: DOCUMENT_READ_LABELS.receive_payment,
    write_off: DOCUMENT_READ_LABELS.write_off,
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

type NotRowMenuAction =
    | 'edit'
    | 'pay_bill'
    | 'apply_credit'
    | 'record_refund'
    | 'refund'
    | 'refund_credit'

// A read-view action as a row-menu action: every one but Edit, Pay bill (a bill's) and
// Record refund (a vendor credit's), which are never on a sales list, Refund and Refund
// credit, which the row menu does not offer (readActionsOf sets neither), and Apply, which
// the menu puts first for a credit memo by its own rule (`rowApplyCreditOffered`), so an
// invoice row never takes the invoice's Apply credit from the read view's actions.
function isRowMenuAction(
    action: DocumentReadAction
): action is Exclude<DocumentReadAction, NotRowMenuAction> {
    return (
        action !== 'edit' &&
        action !== 'pay_bill' &&
        action !== 'apply_credit' &&
        action !== 'record_refund' &&
        action !== 'refund' &&
        action !== 'refund_credit'
    )
}

// The one offer rule of Write off in a row menu, on the Sales lists and on the customer
// page (write-off spec §3.1): a writer, on a posted invoice with a balance above 0.
export function rowWriteOffOffered(
    row: { kind: string; recordStatus: string; balance: number },
    canWrite: boolean
): boolean {
    const status = documentStatusOf(row.recordStatus)
    if (!canWrite || status === null) return false
    return writeOffOffered(row.kind, status, row.balance)
}

// The one offer rule of Apply to invoices in a row menu, on the Sales lists and on the
// customer page (apply credit spec §3.1): a writer, on a posted credit memo with a balance
// above 0.
export function rowApplyCreditOffered(
    row: { kind: string; recordStatus: string; balance: number },
    canWrite: boolean
): boolean {
    const status = documentStatusOf(row.recordStatus)
    if (!canWrite || status === null || row.kind !== 'credit_memo') return false
    return applyCreditOffered(row.kind, status, row.balance)
}

// Write off directly after Receive payment (or after Open), where the read view puts it
// after Create credit memo.
function writeOffAfterReceive(actions: readonly RowMenuAction[]): RowMenuAction[] {
    if (!actions.includes('write_off')) return [...actions]
    const rest = actions.filter(action => action !== 'write_off')
    const at = Math.max(rest.indexOf('receive_payment'), rest.indexOf('open')) + 1
    return [...rest.slice(0, at), 'write_off', ...rest.slice(at)]
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
        canWriteOff: rowWriteOffOffered(row, canWrite),
    }
    return documentReadActions(status, canWrite, SALES_FEATURES, extra).filter(
        action => action !== 'entry' || row.entry !== ''
    )
}

// A purchase row's menu comes from `purchaseRowMenuItems` (`listRowMenuItems` picks by the
// row's kind); here it holds Open only, as a write-off's does.
export function documentRowMenuItems(row: DocumentListRow, canWrite: boolean): RowMenuAction[] {
    if (!isSalesKind(row.kind) || row.kind === 'write_off') return ['open']
    if (row.recordStatus === 'draft') return canWrite ? ['open', 'delete_draft'] : ['open']
    const status = documentStatusOf(row.recordStatus)
    if (status === null) return ['open']
    const offered: DocumentReadAction[] = readActionsOf(row, status, canWrite)
    const apply: RowMenuAction[] = rowApplyCreditOffered(row, canWrite) ? ['apply_credit'] : []
    return [...apply, ...writeOffAfterReceive(['open', ...offered.filter(isRowMenuAction)])]
}

// The menu row's test id: `<area prefix>-row-action-<action>`, with dashes.
export function rowActionTestId(
    prefix: string,
    action: RowMenuAction | PurchaseRowMenuAction
): string {
    return `${prefix}-row-action-${action.replaceAll('_', '-')}`
}

// The route a navigating action pushes (without the org prefix); null for the actions that
// stay on the list (Download PDF, Void, Delete draft, and Write off, whose dialog opens
// over the list) and for Apply to invoices, which opens the credit memo with its dialog
// (`useDocumentRowActions`). A purchase row's routes come from `purchaseRowActionHref`
// (`listRowActionHref` picks by the row's kind); here it has Open only.
export function rowActionHref(row: DocumentListRow, action: RowMenuAction): string | null {
    if (action === 'open') return listDocumentHref(row.kind, row.id)
    if (!isSalesKind(row.kind)) return null
    const kind = TRANSACTION_DOC_KINDS[row.kind]
    switch (action) {
        case 'receive_payment':
            return `books/payments/new?customer=${row.partyId}&invoice=${row.id}`
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
        case 'write_off':
        case 'apply_credit':
            return null
    }
}
