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
