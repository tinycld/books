import type { DocumentStatus } from './document-lifecycle'
import { type DocumentFeatures, SALES_FEATURES } from './sales-document-kinds'

// The read view's actions of a posted or void sales document (spec §3.6 of the invoice).
// Pure, so who sees which action and the key map are unit-tested. A quote's are
// `quoteReadActions` (lib/document-lifecycle.ts); Open invoice (`invoice`) is a quote's
// only, never a posting document's. Receive payment (`receive_payment`) is an invoice's
// only (receive-payment spec §3.9); Pay bill (`pay_bill`) is a bill's only (pay-bills spec
// §3.9); Create credit memo (`credit_memo`) is a posted invoice's only (credit memo spec
// §3.10). Apply (`apply_credit`) is a posted credit's: Apply to bills of a vendor credit
// (vendor credit spec §3.7, §3.9), Apply to invoices of a credit memo (apply credit spec
// §3.1), and Apply credit of a posted invoice whose customer has unapplied credit (apply
// credit spec §3.1); its words come from applyCreditLabel (lib/credit-application-kinds.ts). Record
// refund (`record_refund`) is a posted vendor credit's only (vendor refund spec §3.9).
// Refund (`refund`) is a posted sales receipt's only, Refund credit (`refund_credit`) a
// posted credit memo's with unapplied credit only (refund receipt spec §3.11, §3.12).
// Write off (`write_off`) is a posted invoice's with an open balance only (write-off spec
// §3.1). Send… (`send`) is a sent-able document's (email-share spec §3.3) and Copy customer
// link (`link`) a posted invoice's with a token (email-share spec §3.5); a quote's Send… is
// quoteReadActions'.

export type DocumentReadAction =
    | 'apply_credit'
    | 'record_refund'
    | 'pay_bill'
    | 'receive_payment'
    | 'send'
    | 'link'
    | 'edit'
    | 'void'
    | 'copy'
    | 'credit_memo'
    | 'write_off'
    | 'refund'
    | 'refund_credit'
    | 'entry'
    | 'invoice'
    | 'pdf'

// The read view's letter keys: single letters, so they never fire while a text field has
// focus. Download PDF has ⌘P (DOCUMENT_PDF_KEY), on the form as well.
export const DOCUMENT_READ_KEYS = {
    edit: 'e',
    void: 'v',
    copy: 'c',
    entry: 'j',
    invoice: 'i',
    receive_payment: 'r',
    pay_bill: 'p',
    credit_memo: 'm',
    apply_credit: 'a',
    // The same letter as Receive payment: that is an invoice's action and this a vendor
    // credit's, so no read view offers both.
    record_refund: 'r',
    // A sales receipt's and a credit memo's: no read view offers two actions on R.
    refund: 'r',
    refund_credit: 'r',
    write_off: 'w',
    send: 's',
    // Not a single letter: the estimate form's Copy customer link is ⌥L
    // (QUOTE_FORM_KEYS.copyLink, lib/entry-shortcuts.ts), and the same action keeps its key.
    link: 'Alt+l',
} as const

// The read view's words for each action; a sales list's row menu shows the same.
export const DOCUMENT_READ_LABELS: Record<DocumentReadAction, string> = {
    apply_credit: 'Apply to bills',
    record_refund: 'Record refund',
    pay_bill: 'Pay bill',
    receive_payment: 'Receive payment',
    send: 'Send…',
    link: 'Copy customer link',
    edit: 'Edit',
    void: 'Void',
    copy: 'Copy',
    credit_memo: 'Create credit memo',
    write_off: 'Write off',
    refund: 'Refund',
    refund_credit: 'Refund credit',
    entry: 'View journal entry',
    invoice: 'Open invoice',
    pdf: 'Download PDF',
}

export type DocumentReadKeyAction = keyof typeof DOCUMENT_READ_KEYS

// Download PDF on the form and the read view. Always taken while the screen holds the
// keys, so the browser's Print never opens.
export const DOCUMENT_PDF_KEY = '$mod+p'

// Every read-view action's key.
export const DOCUMENT_READ_ACTION_KEYS: Record<DocumentReadAction, string> = {
    ...DOCUMENT_READ_KEYS,
    pdf: DOCUMENT_PDF_KEY,
}

// The tabs under the title: Edit (form) or Details (read view), and PDF view.
export const DOCUMENT_TAB_KEYS = { edit: 'Alt+1', pdf: 'Alt+2' } as const

// A posted invoice with a balance above zero takes a payment (receive-payment spec §3.9);
// no other record does. `kind` is the record's `kindFields.kind`.
export function receivePaymentOffered(
    kind: string,
    status: DocumentStatus,
    balance: number
): boolean {
    return kind === 'invoice' && status === 'posted' && balance > 0
}

// A posted bill with a balance above zero is paid from Pay bills (pay-bills spec §2,
// §3.9); no other record is. `kind` is the record's `kindFields.kind`.
export function payBillOffered(kind: string, status: DocumentStatus, balance: number): boolean {
    return kind === 'bill' && status === 'posted' && balance > 0
}

// A posted invoice is credited from its read view (credit memo spec §3.10, Q2); a void
// one is not, and no other record is. `kind` is the record's `kindFields.kind`.
export function creditMemoOffered(kind: string, status: DocumentStatus): boolean {
    return kind === 'invoice' && status === 'posted'
}

// A posted invoice with a balance above zero is written off from its read view (write-off
// spec §3.1); a draft, a void invoice, a paid one and every other record are not. `kind`
// is the record's `kindFields.kind`. documentReadActions offers it to a writer only.
export function writeOffOffered(kind: string, status: DocumentStatus, balance: number): boolean {
    return kind === 'invoice' && status === 'posted' && balance > 0
}

// A posted sales receipt is refunded from its read view (refund receipt spec §3.11); a void
// one is not, and no other record is. `kind` is the record's `kindFields.kind`.
export function refundReceiptOffered(kind: string, status: DocumentStatus): boolean {
    return kind === 'sales_receipt' && status === 'posted'
}

// A posted credit memo with unapplied credit (`balance` above zero) is paid out from its
// read view (refund receipt spec §3.12); no other record is.
export function refundCreditOffered(
    kind: string,
    status: DocumentStatus,
    balance: number
): boolean {
    return kind === 'credit_memo' && status === 'posted' && balance > 0
}

// A posted credit with a balance (unapplied credit) above zero is applied from its read
// view: a vendor credit to bills (vendor credit spec §3.7, §3.9), a credit memo to
// invoices (apply credit spec §3.1). No other record is; an invoice's Apply credit is the
// invoice's own rule. `kind` is the record's `kindFields.kind`.
export function applyCreditOffered(kind: string, status: DocumentStatus, balance: number): boolean {
    const isCredit = kind === 'vendor_credit' || kind === 'credit_memo'
    return isCredit && status === 'posted' && balance > 0
}

// A posted invoice with an open balance takes the customer's unapplied credit from its read
// view (apply credit spec §3.1) while the customer has a posted credit memo with a balance
// above zero (`hasUnappliedCredit`); no other record does. `kind` is the record's
// `kindFields.kind`. documentReadActions offers it to a writer only.
export function applyInvoiceCreditOffered(
    kind: string,
    status: DocumentStatus,
    balance: number,
    hasUnappliedCredit: boolean
): boolean {
    return kind === 'invoice' && status === 'posted' && balance > 0 && hasUnappliedCredit
}

// The one action a phone's read bar keeps in place of Edit, by the record's kind: a bill's
// Pay bill (pay-bills spec §2), a credit's Apply (vendor credit spec §3.7, apply credit spec
// §3.1). An invoice has none: its Apply credit is a row of More (plan decision 9).
const PHONE_PRIMARY_ACTIONS: Readonly<Record<string, DocumentReadAction>> = {
    bill: 'pay_bill',
    vendor_credit: 'apply_credit',
    credit_memo: 'apply_credit',
}

// The kind's phone primary action when `actions` offers it; undefined otherwise, so the bar
// falls back to its lifecycle button. Pure.
export function phonePrimaryAction(
    kind: string,
    actions: readonly DocumentReadAction[]
): DocumentReadAction | undefined {
    const primary = PHONE_PRIMARY_ACTIONS[kind]
    if (primary === undefined) return undefined
    return actions.includes(primary) ? primary : undefined
}

// A writer records a vendor refund from a posted vendor credit with a balance (unapplied
// credit) above zero (vendor refund spec §3.9). The read view calls it only for a vendor
// credit.
export function refundOffered(status: DocumentStatus, canWrite: boolean, balance: number): boolean {
    return canWrite && status === 'posted' && balance > 0
}

// Remove on an Applied to row (vendor credit spec §3.7, §3.9): a writer on a posted
// document; a void document's applications are released by its void, and a draft has
// none.
export function removeApplicationOffered(canWrite: boolean, status: DocumentStatus): boolean {
    return canWrite && status === 'posted'
}

type ReadActionExtra = {
    canReceivePayment: boolean
    canPayBill: boolean
    canCreateCreditMemo: boolean
    canApplyCredit?: boolean
    canApplyInvoiceCredit?: boolean
    canRecordRefund?: boolean
    canRefund?: boolean
    canRefundCredit?: boolean
    canWriteOff?: boolean
    isDeposited?: boolean
    canSend?: boolean
    canCopyLink?: boolean
}

// A writer edits or voids a posted document and copies any; a void document (a replaced
// original is void too) is only copied. A reader views the journal entry and the PDF.
// A draft opens in the form, never here, so it offers nothing. The posting rule: every
// posting kind shares the statuses. A kind with no PDF (a bill, `features.pdf` false)
// offers no Download PDF. Receive payment comes first for a writer on a posted document
// when `extra.canReceivePayment` is set (the read view sets it only for an invoice with a
// balance above zero), Pay bill when `extra.canPayBill` is set (only for a bill with a
// balance above zero), Apply when `extra.canApplyCredit` is set (only for a vendor credit or
// a credit memo with a balance above zero), and Record refund right after it when
// `extra.canRecordRefund` is set (the same vendor credit). An invoice's Apply credit comes
// after Receive payment and before Edit when `extra.canApplyInvoiceCredit` is set (only for
// a posted invoice with a balance above zero whose customer has unapplied credit); both
// Applies use the action `apply_credit`, and no read view offers both. After Copy come Create credit memo
// when `extra.canCreateCreditMemo` is set (only for a posted invoice), Write off when
// `extra.canWriteOff` is set (only for a posted invoice with a balance above zero), Refund when
// `extra.canRefund` is set (only for a posted sales receipt) and Refund credit when
// `extra.canRefundCredit` is set (only for a posted credit memo with unapplied credit).
// Edit and Void are left out when `extra.isDeposited` is set (a sales receipt or refund
// receipt that a posted deposit holds, bank deposit spec §3.10); every other action stays.
// Send… comes after the first actions and before Edit when `extra.canSend` is set (a
// sent-able kind and status, sendOffered), and Copy customer link directly before View
// journal entry when `extra.canCopyLink` is set (a posted invoice with a token); both are a
// writer's on a posted document only (email-share spec §3.3, §3.7).
export function documentReadActions(
    status: DocumentStatus,
    canWrite: boolean,
    features: Pick<DocumentFeatures, 'pdf'> = SALES_FEATURES,
    extra: ReadActionExtra = {
        canReceivePayment: false,
        canPayBill: false,
        canCreateCreditMemo: false,
    }
): DocumentReadAction[] {
    if (status === 'draft') return []
    const pdf: DocumentReadAction[] = features.pdf ? ['pdf'] : []
    if (!canWrite) return ['entry', ...pdf]
    if (status === 'posted') {
        const apply: DocumentReadAction[] = extra.canApplyCredit ? ['apply_credit'] : []
        const refund: DocumentReadAction[] = extra.canRecordRefund ? ['record_refund'] : []
        const receive: DocumentReadAction[] = extra.canReceivePayment ? ['receive_payment'] : []
        const applyInvoice: DocumentReadAction[] = extra.canApplyInvoiceCredit
            ? ['apply_credit']
            : []
        const pay: DocumentReadAction[] = extra.canPayBill ? ['pay_bill'] : []
        const credit: DocumentReadAction[] = extra.canCreateCreditMemo ? ['credit_memo'] : []
        const writeOff: DocumentReadAction[] = extra.canWriteOff ? ['write_off'] : []
        const refundSale: DocumentReadAction[] = extra.canRefund ? ['refund'] : []
        const refundCredit: DocumentReadAction[] = extra.canRefundCredit ? ['refund_credit'] : []
        const change: DocumentReadAction[] = extra.isDeposited ? [] : ['edit', 'void']
        const send: DocumentReadAction[] = extra.canSend ? ['send'] : []
        const link: DocumentReadAction[] = extra.canCopyLink ? ['link'] : []
        return [
            ...apply,
            ...refund,
            ...pay,
            ...receive,
            ...applyInvoice,
            ...send,
            ...change,
            'copy',
            ...credit,
            ...writeOff,
            ...refundSale,
            ...refundCredit,
            ...link,
            'entry',
            ...pdf,
        ]
    }
    return ['copy', 'entry', ...pdf]
}
