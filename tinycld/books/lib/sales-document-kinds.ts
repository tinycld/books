// The kinds of the sales document layer (spec §3.1): every text, route, test id and key
// the shared layer reads per kind. Data only: this module and the one it imports load no
// other code, as the generator loads them in Node through forms/hosts.ts. The per-kind
// reads and writes live in hooks/<kind>-data.ts.

import {
    type DocumentMessages,
    ESTIMATE_MESSAGES,
    INVOICE_MESSAGES,
    SALES_RECEIPT_MESSAGES,
} from './document-texts'

// The memo's hint on a kind that posts: the memo goes on the journal entry. The bill's
// forms host (forms/hosts.ts) seeds it too.
export const MEMO_HINT = 'Only your team sees this. Saved as the journal entry memo.'

export type SalesDocKey = 'invoice' | 'sales_receipt' | 'estimate'

// How a kind's statuses run (lib/document-lifecycle.ts): `posting` (draft → posted →
// void) or `quote` (pending / accepted / rejected → closed, never posted).
export type DocumentLifecycle = 'posting' | 'quote'

export type SalesDocumentKind = {
    key: SalesDocKey
    lifecycle: DocumentLifecycle
    // The forms host the kind's form is built from.
    hostKey: string
    // Every test id of the shared layer is `${testId}-<suffix>`.
    testId: string
    // The kind's routes without the org prefix: `<routeBase>/new`, `<routeBase>/<id>`.
    routeBase: string
    // "Invoice": the read view's title ("Invoice 1004"), the void dialog's words.
    noun: string
    thisNoun: string
    draftTitle: string
    newTitle: string
    // The ⇧? list's group of the kind's keys.
    shortcutGroup: string
    // The header's big figure and the last row of the totals; null draws no last row.
    figure: { label: string; testId: string }
    lastTotal: { label: string; testId: string } | null
    customerRequired: boolean
    noteHints: { message: string; memo: string }
    messages: DocumentMessages
    // A PDF's file name without `.pdf`: by number, or the draft's name while it has none.
    pdfStem: (number: string) => string
    // The built-in that starts the header band's second row; null keeps one band row.
    bandSplitAt: string | null
    // A help topic id, `<package>:<topic>`.
    helpTopic: `${string}:${string}`
}

export const INVOICE_KIND: SalesDocumentKind = {
    key: 'invoice',
    lifecycle: 'posting',
    hostKey: 'books:invoice',
    testId: 'invoice',
    routeBase: 'books/invoices',
    noun: 'Invoice',
    thisNoun: 'This invoice',
    draftTitle: 'Draft invoice',
    newTitle: 'New invoice',
    shortcutGroup: 'Invoice',
    figure: { label: 'Balance due', testId: 'balance-due' },
    lastTotal: { label: 'Balance due', testId: 'total-balance' },
    customerRequired: true,
    noteHints: { message: 'Shown on the invoice and its PDF.', memo: MEMO_HINT },
    messages: INVOICE_MESSAGES,
    // The server's names (server/pdf_invoice.go).
    pdfStem: number => (number ? `invoice-${number}` : 'draft-invoice'),
    bandSplitAt: null,
    helpTopic: 'books:invoices',
}

export const SALES_RECEIPT_KIND: SalesDocumentKind = {
    key: 'sales_receipt',
    lifecycle: 'posting',
    hostKey: 'books:sales_receipt',
    testId: 'sales-receipt',
    routeBase: 'books/sales-receipts',
    noun: 'Sales receipt',
    thisNoun: 'This sales receipt',
    draftTitle: 'Draft sales receipt',
    newTitle: 'New sales receipt',
    shortcutGroup: 'Sales receipt',
    figure: { label: 'Amount received', testId: 'amount-received' },
    lastTotal: { label: 'Amount received', testId: 'total-received' },
    customerRequired: false,
    noteHints: { message: 'Shown on the sales receipt and its PDF.', memo: MEMO_HINT },
    messages: SALES_RECEIPT_MESSAGES,
    // The server's names (server/pdf_sales_receipt.go).
    pdfStem: number => (number ? `sales-receipt-${number}` : 'draft-sales-receipt'),
    // The Payment row: Payment method, Reference no. and Deposit to.
    bandSplitAt: 'payment_method',
    helpTopic: 'books:sales-receipts',
}

// Its messages keep their own type, so a reader of a quote-only text (cannotConvert)
// needs no fallback.
export const ESTIMATE_KIND: SalesDocumentKind & { messages: typeof ESTIMATE_MESSAGES } = {
    key: 'estimate',
    lifecycle: 'quote',
    hostKey: 'books:estimate',
    testId: 'estimate',
    routeBase: 'books/estimates',
    noun: 'Estimate',
    thisNoun: 'This estimate',
    // Never shown: a quote has no draft, and a stored estimate's title is "Estimate <n>".
    draftTitle: 'Estimate',
    newTitle: 'New estimate',
    shortcutGroup: 'Estimate',
    figure: { label: 'Total', testId: 'total-figure' },
    // Total is the last of Subtotal and Tax already: an estimate has no Balance due.
    lastTotal: null,
    customerRequired: true,
    // An estimate never posts, so its memo goes on no journal entry.
    noteHints: { message: 'Shown on the estimate and its PDF.', memo: 'Only your team sees this.' },
    messages: ESTIMATE_MESSAGES,
    // The server gives the number at the first save, so every PDF has one
    // (server/pdf_estimate.go).
    pdfStem: number => `estimate-${number}`,
    // The status row: Status, Accepted by and Accepted date.
    bandSplitAt: 'status',
    helpTopic: 'books:estimates',
}
