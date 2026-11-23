import type { SalesDocKey } from './sales-document-kinds'

// The five kinds a send's doc_type takes (migration 2100000034; Go `sendDocTypes` in
// server/document_sends.go holds the same list). A module of its own, so the send rules
// (lib/document-send.ts) and the quote lifecycle read it without the audit field tables.
export const SEND_DOC_TYPES = [
    'invoice',
    'estimate',
    'sales_receipt',
    'credit_memo',
    'refund_receipt',
] as const satisfies readonly SalesDocKey[]

export function isSendDocType(value: string): value is (typeof SEND_DOC_TYPES)[number] {
    return (SEND_DOC_TYPES as readonly string[]).includes(value)
}

// The kind words (Go documentEmailWords, server/document_email.go): the email subject's
// and a batch result line's title, and the message's noun. Here, in a module with no
// React Native import, because lib/document-send.ts (which e2e helpers import) and
// lib/document-email.ts both read it.
export const KIND_WORDS: Record<(typeof SEND_DOC_TYPES)[number], { title: string; noun: string }> =
    {
        invoice: { title: 'Invoice', noun: 'invoice' },
        estimate: { title: 'Estimate', noun: 'estimate' },
        sales_receipt: { title: 'Sales receipt', noun: 'sales receipt' },
        credit_memo: { title: 'Credit memo', noun: 'credit memo' },
        refund_receipt: { title: 'Refund receipt', noun: 'refund receipt' },
    }
