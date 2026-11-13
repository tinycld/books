// The kinds of the sales document layer (spec §3.1): every text, route, test id and key
// the shared layer reads per kind. The layer keeps its "sales" names but serves purchase
// documents (a bill) too: a kind names its party, its line tables and the features it
// has. Data only: this module and the one it imports load no other code, as the
// generator loads them in Node through forms/hosts.ts. The per-kind reads and writes
// live in hooks/<kind>-data.ts.

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

// The party a document is with: its header field, which also names it on every journal
// line the document posts.
export type DocumentPartyKey = 'customer' | 'vendor'

export type DocumentParty = {
    // The header built-in that holds the party's id.
    field: DocumentPartyKey
    label: string
    // The built-in that holds the party's address snapshot, and its label.
    addressField: 'bill_to' | 'mailing_address'
    addressLabel: string
    // The "Edit <party>" link, and the party's own routes without the org prefix.
    editLabel: string
    routeBase: string
    // The refusal of an inactive party; `%s` is its name.
    inactiveText: string
}

export const DOCUMENT_PARTIES: Record<DocumentPartyKey, DocumentParty> = {
    customer: {
        field: 'customer',
        label: 'Customer',
        addressField: 'bill_to',
        addressLabel: 'Bill to',
        editLabel: 'Edit customer',
        routeBase: 'books/customers',
        inactiveText: '%s is inactive. Choose an active customer.',
    },
    vendor: {
        field: 'vendor',
        label: 'Vendor',
        addressField: 'mailing_address',
        addressLabel: 'Mailing address',
        editLabel: 'Edit vendor',
        routeBase: 'books/vendors',
        inactiveText: '%s is inactive. Choose an active vendor.',
    },
}

// One line table of a kind: the forms host's table built-in (`key`), the label of its
// rows in a refusal ("Line 3"), the section heading above it (none on a kind with one
// table), and its own subtotal row in the totals (none on a kind with one table, whose
// Subtotal row sums it).
export type DocumentLineTable = {
    key: string
    rowLabel: string
    heading: string | null
    subtotal: { label: string; testId: string } | null
}

export const SALES_LINE_TABLES: readonly DocumentLineTable[] = [
    { key: 'lines', rowLabel: 'Line', heading: null, subtotal: null },
]

// What a kind has besides its lines: sales tax, a message to the customer, an email and
// a PDF. A kind without one draws none of its fields, rows, actions or keys.
export type DocumentFeatures = { tax: boolean; message: boolean; email: boolean; pdf: boolean }

export const SALES_FEATURES: DocumentFeatures = { tax: true, message: true, email: true, pdf: true }

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
    // Whether the party is required (the name predates purchase kinds, whose party is a
    // vendor).
    customerRequired: boolean
    noteHints: { message: string; memo: string }
    messages: DocumentMessages
    // A PDF's file name without `.pdf`: by number, or the draft's name while it has none.
    pdfStem: (number: string) => string
    // The built-in that starts the header band's second row; null keeps one band row.
    bandSplitAt: string | null
    // A help topic id, `<package>:<topic>`.
    helpTopic: `${string}:${string}`
    party: DocumentPartyKey
    // The kind's line tables in form order, all summed into one set of totals.
    lineTables: readonly DocumentLineTable[]
    features: DocumentFeatures
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
    party: 'customer',
    lineTables: SALES_LINE_TABLES,
    features: SALES_FEATURES,
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
    party: 'customer',
    lineTables: SALES_LINE_TABLES,
    features: SALES_FEATURES,
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
    party: 'customer',
    lineTables: SALES_LINE_TABLES,
    features: SALES_FEATURES,
}
