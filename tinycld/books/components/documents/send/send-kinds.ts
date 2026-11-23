import type { SendKind } from '../../../lib/document-send'
import {
    CREDIT_MEMO_KIND,
    ESTIMATE_KIND,
    INVOICE_KIND,
    REFUND_RECEIPT_KIND,
    SALES_RECEIPT_KIND,
    type SalesDocumentKind,
} from '../../../lib/sales-document-kinds'

// The kind of each sent-able document: its noun names the dialog and the toast, and its
// `pdfStem` names the attachment as the PDF route does (plan decision 4).
export const SEND_DOCUMENT_KINDS: Record<SendKind, SalesDocumentKind> = {
    invoice: INVOICE_KIND,
    estimate: ESTIMATE_KIND,
    sales_receipt: SALES_RECEIPT_KIND,
    credit_memo: CREDIT_MEMO_KIND,
    refund_receipt: REFUND_RECEIPT_KIND,
}

// "Send invoice 1004" (spec §3.2): the kind's noun and the number; the noun alone while
// the document loads.
export function sendDialogTitle(kind: SendKind, number: string | undefined): string {
    const noun = SEND_DOCUMENT_KINDS[kind].noun.toLowerCase()
    return number ? `Send ${noun} ${number}` : `Send ${noun}`
}

// "Attachment: invoice-1004.pdf": the PDF route's file name.
export function attachmentLine(kind: SendKind, number: string): string {
    return `Attachment: ${SEND_DOCUMENT_KINDS[kind].pdfStem(number)}.pdf`
}

// The kinds with a customer page (spec §3.2: Copy customer link for an invoice and an
// estimate only).
export function hasCustomerLink(kind: SendKind): kind is 'invoice' | 'estimate' {
    return kind === 'invoice' || kind === 'estimate'
}
