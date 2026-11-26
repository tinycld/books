// The kinds of the sales document layer (spec §3.1): every text, route, test id and key
// the shared layer reads per kind. The layer keeps its "sales" names but serves purchase
// documents (a bill) too: a kind names its party, its line tables and the features it
// has. Data only: this module and the one it imports load no other code, as the
// generator loads them in Node through forms/hosts.ts. The per-kind reads and writes
// live in hooks/<kind>-data.ts.

import {
    BILL_MESSAGES,
    CREDIT_MEMO_MESSAGES,
    type DocumentMessages,
    ESTIMATE_MESSAGES,
    EXPENSE_MESSAGES,
    INVOICE_MESSAGES,
    REFUND_RECEIPT_MESSAGES,
    SALES_RECEIPT_MESSAGES,
    VENDOR_CREDIT_MESSAGES,
} from './document-texts'

// The memo's hint on a kind that posts: the memo goes on the journal entry. The bill's
// forms host (forms/hosts.ts) seeds it too.
export const MEMO_HINT = 'Only your team sees this. Saved as the journal entry memo.'

// The purchase order's forms host (forms/hosts.ts); the Go line guard reads the same key
// (server/purchase_orders.go).
export const PURCHASE_ORDER_HOST_KEY = 'books:purchase_order'

export type SalesDocKey =
    | 'invoice'
    | 'sales_receipt'
    | 'credit_memo'
    | 'estimate'
    | 'bill'
    | 'expense'
    | 'vendor_credit'
    | 'refund_receipt'

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
    // The search params of the edit link: the party's page opens on its Details tab,
    // where the party is edited.
    editParams?: { tab: 'details' }
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
        editParams: { tab: 'details' },
        inactiveText: '%s is inactive. Choose an active customer.',
    },
    vendor: {
        field: 'vendor',
        label: 'Vendor',
        addressField: 'mailing_address',
        addressLabel: 'Mailing address',
        editLabel: 'Edit vendor',
        routeBase: 'books/vendors',
        editParams: { tab: 'details' },
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

// A purchase kind's two tables, stacked in this order (spec §3.4); the Purchase lines
// setting decides which of them a form shows (lib/purchase-lines.ts).
export const PURCHASE_LINE_TABLES: readonly DocumentLineTable[] = [
    {
        key: 'account_lines',
        rowLabel: 'Account line',
        heading: 'Account details',
        subtotal: { label: 'Account lines', testId: 'total-account-lines' },
    },
    {
        key: 'item_lines',
        rowLabel: 'Product line',
        heading: 'Product and service details',
        subtotal: { label: 'Products and services', testId: 'total-item-lines' },
    },
]

// What a kind has besides its lines: sales tax, a message to the customer, an email, a
// PDF, the party's address (DocumentParty.addressField) and the Attachments section. A
// kind without one draws none of its fields, rows, actions or keys.
export type DocumentFeatures = {
    tax: boolean
    message: boolean
    email: boolean
    pdf: boolean
    partyAddress: boolean
    attachments: boolean
}

export const SALES_FEATURES: DocumentFeatures = {
    tax: true,
    message: true,
    email: true,
    pdf: true,
    partyAddress: true,
    attachments: false,
}

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
    // Every save drops each table's empty trailing line before the form checks it. True:
    // a save the client refuses (it writes nothing) puts the dropped lines back, so the
    // form shows them with the refusal (a bill, spec §3.4 "dropped at save"). False: they
    // stay dropped (the sales kinds' forms, as they always were).
    keepsEmptyLinesOnRefusal: boolean
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
    keepsEmptyLinesOnRefusal: false,
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
    keepsEmptyLinesOnRefusal: false,
}

// A credit memo (credit memo spec §3.1): the invoice's mirror. Its big figure and last
// total are the credit amount (= the total). Its messages keep their own type, so a
// reader of a credit-memo-only text (cannotCredit) needs no fallback.
export const CREDIT_MEMO_KIND: SalesDocumentKind & { messages: typeof CREDIT_MEMO_MESSAGES } = {
    key: 'credit_memo',
    lifecycle: 'posting',
    hostKey: 'books:credit_memo',
    testId: 'credit-memo',
    routeBase: 'books/credit-memos',
    noun: 'Credit memo',
    thisNoun: 'This credit memo',
    draftTitle: 'Draft credit memo',
    newTitle: 'New credit memo',
    shortcutGroup: 'Credit memo',
    figure: { label: 'Credit amount', testId: 'credit-amount' },
    lastTotal: { label: 'Credit amount', testId: 'total-credit' },
    customerRequired: true,
    noteHints: { message: 'Shown on the credit memo and its PDF.', memo: MEMO_HINT },
    messages: CREDIT_MEMO_MESSAGES,
    // The server's names (server/pdf_credit_memo.go).
    pdfStem: number => (number ? `credit-memo-${number}` : 'draft-credit-memo'),
    bandSplitAt: null,
    helpTopic: 'books:credit-memos',
    party: 'customer',
    lineTables: SALES_LINE_TABLES,
    features: SALES_FEATURES,
    keepsEmptyLinesOnRefusal: false,
}

// A refund receipt (refund receipt spec §3.1): the sales receipt's mirror, money paid back
// from Refund from. Its big figure and last total are the amount refunded (= the total).
// Its messages keep their own type, so a reader of a refund-only text (cannotRefundReceipt,
// payoutVoidBody) needs no fallback.
export const REFUND_RECEIPT_KIND: SalesDocumentKind & {
    messages: typeof REFUND_RECEIPT_MESSAGES
} = {
    key: 'refund_receipt',
    lifecycle: 'posting',
    hostKey: 'books:refund_receipt',
    testId: 'refund-receipt',
    routeBase: 'books/refund-receipts',
    noun: 'Refund receipt',
    thisNoun: 'This refund receipt',
    draftTitle: 'Draft refund receipt',
    newTitle: 'New refund receipt',
    shortcutGroup: 'Refund receipt',
    figure: { label: 'Amount refunded', testId: 'amount-refunded' },
    lastTotal: { label: 'Amount refunded', testId: 'total-refunded' },
    customerRequired: false,
    noteHints: { message: 'Shown on the refund receipt and its PDF.', memo: MEMO_HINT },
    messages: REFUND_RECEIPT_MESSAGES,
    // The server's names (server/pdf_refund_receipt.go).
    pdfStem: number => (number ? `refund-receipt-${number}` : 'draft-refund-receipt'),
    // The Payment row: Payment method, Reference no. and Refund from.
    bandSplitAt: 'payment_method',
    helpTopic: 'books:refund-receipts',
    party: 'customer',
    lineTables: SALES_LINE_TABLES,
    features: SALES_FEATURES,
    keepsEmptyLinesOnRefusal: false,
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
    keepsEmptyLinesOnRefusal: false,
}

// A bill (spec §3.1): the purchase kind of the layer. Its party is a vendor, it has two
// line tables and no tax, message, email or PDF. Its messages keep their own type, so a
// reader of a bill-only text (duplicateRef) needs no fallback.
export const BILL_KIND: SalesDocumentKind & { messages: typeof BILL_MESSAGES } = {
    key: 'bill',
    lifecycle: 'posting',
    hostKey: 'books:bill',
    testId: 'bill',
    routeBase: 'books/bills',
    noun: 'Bill',
    thisNoun: 'This bill',
    draftTitle: 'Draft bill',
    newTitle: 'New bill',
    shortcutGroup: 'Bill',
    // Balance due, not Total: bill payments lower a posted bill's balance, and what is
    // still owed is the figure the user acts on (Pay bill). It equals Total until one pays.
    figure: { label: 'Balance due', testId: 'balance-due' },
    lastTotal: { label: 'Balance due', testId: 'total-balance' },
    customerRequired: true,
    // A bill has no message; the field is never drawn.
    noteHints: { message: '', memo: MEMO_HINT },
    messages: BILL_MESSAGES,
    // Never called: a bill has no PDF (`features.pdf`); kept so the type holds.
    pdfStem: number => (number ? `bill-${number}` : 'draft-bill'),
    // The second band row: Terms, Bill date, Due date and Vendor's bill no.
    bandSplitAt: 'terms',
    helpTopic: 'books:bills',
    party: 'vendor',
    lineTables: PURCHASE_LINE_TABLES,
    features: {
        tax: false,
        message: false,
        email: false,
        pdf: false,
        partyAddress: true,
        attachments: true,
    },
    keepsEmptyLinesOnRefusal: true,
}

// An expense (expense spec §3.1): money already paid from a bank or credit card account,
// optionally to a vendor. The bill's two line tables; no tax, message, email, PDF or
// party address. Its messages keep their own type, so a reader of an expense-only text
// (duplicateCheckNo) needs no fallback.
export const EXPENSE_KIND: SalesDocumentKind & { messages: typeof EXPENSE_MESSAGES } = {
    key: 'expense',
    lifecycle: 'posting',
    hostKey: 'books:expense',
    testId: 'expense',
    routeBase: 'books/expenses',
    noun: 'Expense',
    thisNoun: 'This expense',
    draftTitle: 'Draft expense',
    newTitle: 'New expense',
    shortcutGroup: 'Expense',
    // The total is what was paid; no row follows Total.
    figure: { label: 'Amount paid', testId: 'amount-paid' },
    lastTotal: null,
    // "No vendor" is a valid choice.
    customerRequired: false,
    // An expense has no message; the field is never drawn.
    noteHints: { message: '', memo: MEMO_HINT },
    messages: EXPENSE_MESSAGES,
    // Never called: an expense has no PDF (`features.pdf`); kept so the type holds.
    pdfStem: number => (number ? `expense-${number}` : 'draft-expense'),
    // The second band row: Payment method and Ref no.
    bandSplitAt: 'payment_method',
    helpTopic: 'books:expenses',
    party: 'vendor',
    lineTables: PURCHASE_LINE_TABLES,
    features: {
        tax: false,
        message: false,
        email: false,
        pdf: false,
        partyAddress: false,
        attachments: true,
    },
    keepsEmptyLinesOnRefusal: true,
}

// A vendor credit (vendor credit spec §3.1): a credit a vendor gave, the bill's mirror. The
// bill's two line tables and required vendor; no tax, message, email, PDF or party
// address. Its big figure is the credit amount (= the total); the read view's rows after
// Total are Applied and Unapplied credit (DocumentKind.readTotals), so no lastTotal row.
// Its messages keep their own type, so a reader of a vendor-credit-only text
// (duplicateRef) needs no fallback.
export const VENDOR_CREDIT_KIND: SalesDocumentKind & {
    messages: typeof VENDOR_CREDIT_MESSAGES
} = {
    key: 'vendor_credit',
    lifecycle: 'posting',
    hostKey: 'books:vendor_credit',
    testId: 'vendor-credit',
    routeBase: 'books/vendor-credits',
    noun: 'Vendor credit',
    thisNoun: 'This vendor credit',
    draftTitle: 'Draft vendor credit',
    newTitle: 'New vendor credit',
    shortcutGroup: 'Vendor credit',
    figure: { label: 'Credit amount', testId: 'credit-amount' },
    lastTotal: null,
    customerRequired: true,
    // A vendor credit has no message; the field is never drawn.
    noteHints: { message: '', memo: MEMO_HINT },
    messages: VENDOR_CREDIT_MESSAGES,
    // Never called: a vendor credit has no PDF (`features.pdf`); kept so the type holds.
    pdfStem: number => (number ? `vendor-credit-${number}` : 'draft-vendor-credit'),
    // One band row: Vendor, Credit date and Vendor's credit no.
    bandSplitAt: null,
    helpTopic: 'books:vendor-credits',
    party: 'vendor',
    lineTables: PURCHASE_LINE_TABLES,
    features: {
        tax: false,
        message: false,
        email: false,
        pdf: false,
        partyAddress: false,
        attachments: true,
    },
    keepsEmptyLinesOnRefusal: true,
}
