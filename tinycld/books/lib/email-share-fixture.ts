// Synthetic data for email and share (spec docs/specs/email-share-design.md): what the
// Send dialog opens on for each kind, the stored sends behind the sent line, the batch
// Send counts and result, and the rows of the public view `books_invoice_public` for every
// state of the customer's invoice page. Plain data: it imports other fixtures and types
// only, because the seed graph runs in plain node (tests/seed-node.test.ts).
//
// The collection `books_document_sends` and the view `books_invoice_public` do not exist
// yet. `DocumentSendRecord` and `InvoicePublicRow` below mirror spec §4.2 and §4.3. The
// migration checkpoint of this unit (the one that adds `books_document_sends`,
// `books_invoice_public` and `books_invoices.public_token`) must replace both interfaces
// with the generated types `BooksDocumentSends` and `BooksInvoicePublic` from '../types',
// and check the rows with `satisfies`.
//
// The seed takes nothing from this file (spec §4.6: no send rows; every seeded invoice
// gets its token through the create hook). The rows are for the reference and for tests.
//
// Amounts are integer cents, as in invoice-form-fixture.ts.

import { COMPANY_SETTINGS, LONG_COMPANY_SETTINGS } from './books-settings-fixture'
import { CUSTOMER_IDS, CUSTOMERS } from './customer-form-fixture'
import { ESTIMATE_IDS, ESTIMATES, fixtureToken } from './estimate-form-fixture'
import { INVOICE_IDS, INVOICE_USER_IDS, INVOICES } from './invoice-form-fixture'

// "Today" for the reference: invoice 1004 (due 2026-11-20) is open and not yet due,
// invoice 1001 (due 2026-10-06) is overdue.
export const EMAIL_SHARE_TODAY = '2026-11-16'

export const EMAIL_SHARE_CURRENCY = 'USD'

// The server address of the reference's customer links.
export const LINK_BASE = 'https://books.hartwell.example'

export type SendKind = 'invoice' | 'estimate' | 'sales_receipt' | 'credit_memo' | 'refund_receipt'

// Spec §4.2: one row for each sent email. Replace with `BooksDocumentSends` (see the top).
export interface DocumentSendRecord {
    id: string
    doc_type: SendKind
    document: string
    number: string
    customer: string
    to: string
    cc: string
    subject: string
    body: string
    body_text: string
    sent_by: string
    created: string
}

// Spec §4.3: the columns of the public view, nothing else. Replace with
// `BooksInvoicePublic` (see the top).
export interface InvoicePublicRow {
    id: string
    token: string
    number: string
    status: 'posted' | 'void'
    date: string
    due_date: string
    total: number
    balance: number
    currency: string
    message: string
    customer_name: string
    replaced_by_token: string
    replaced_by_number: string
    business_name: string
    business_email: string
    business_phone: string
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

function customerOf(id: string) {
    const customer = CUSTOMERS.find(row => row.id === id)
    if (!customer) throw new Error(`email share fixture: unknown customer ${id}`)
    return customer
}

function invoiceOf(id: string) {
    const row = INVOICES.find(invoice => invoice.id === id)
    if (!row) throw new Error(`email share fixture: unknown invoice ${id}`)
    return row
}

function estimateOf(id: string) {
    const row = ESTIMATES.find(estimate => estimate.id === id)
    if (!row) throw new Error(`email share fixture: unknown estimate ${id}`)
    return row
}

const BUSINESS = COMPANY_SETTINGS.business_name
const PHONE = COMPANY_SETTINGS.phone

const POSTED = invoiceOf(INVOICE_IDS.posted)
const NO_TAX = invoiceOf(INVOICE_IDS.noTax)
const VOIDED = invoiceOf(INVOICE_IDS.voided)
const CORRECTION = invoiceOf(INVOICE_IDS.correction)
const EXEMPT = invoiceOf(INVOICE_IDS.exempt)
const PENDING_ESTIMATE = estimateOf(ESTIMATE_IDS.pending)

const HARBORVIEW = customerOf(CUSTOMER_IDS.harborview)
const ST_JUDE = customerOf(CUSTOMER_IDS.stJude)
const ALVAREZ = customerOf(CUSTOMER_IDS.alvarez)
const NORTHWIND = customerOf(CUSTOMER_IDS.northwind)

// The tokens of the reference's invoices (`books_invoices.public_token`, spec §4.3).
export const INVOICE_TOKENS = {
    posted: fixtureToken('invoice1004'),
    noTax: fixtureToken('invoice1001'),
    voided: fixtureToken('invoice1002void'),
    correction: fixtureToken('invoice1002'),
    exempt: fixtureToken('invoice1003'),
    long: fixtureToken('invoice1009long'),
} as const

function invoiceLink(token: string): string {
    return `${LINK_BASE}/p/books/invoices/${token}`
}

function estimateLink(token: string): string {
    return `${LINK_BASE}/p/books/estimates/${token}`
}

// The starting message of spec §3.4 is HTML: one <p> for each block, <br> inside a block.
function paragraphs(blocks: string[]): string {
    return blocks.map(block => `<p>${block}</p>`).join('')
}

function linkHtml(url: string): string {
    return `<a href="${url}">${url}</a>`
}

// What the Send dialog opens on: the document's words, the address To starts with, the
// attachment's file name, the customer link (null for a kind with none) and the starting
// subject and message of spec §3.4, as TS `documentEmail()` must give them for this
// document. A view of the reference, not a collection row: the built dialog reads the
// document, its customer and `books_settings`.
export interface SendTarget {
    kind: SendKind
    document: string
    // The dialog's title: "Send <noun> <number>".
    noun: string
    number: string
    customer: string
    customerName: string
    to: string
    fileName: string
    linkUrl: string | null
    subject: string
    bodyHtml: string
}

const INVOICE_MESSAGE_HTML =
    'Thank you for your business. Please pay by bank transfer or check to Fern &amp; Ledger Bookkeeping, and put the invoice number on the payment.'

const POSTED_LINK = invoiceLink(INVOICE_TOKENS.posted)
const ESTIMATE_LINK = estimateLink(PENDING_ESTIMATE.public_token)

const LONG_CUSTOMER_EMAIL = ST_JUDE.email
const LONG_LINK = invoiceLink(INVOICE_TOKENS.long)

export const SEND_TARGETS = {
    // Invoice 1004, open for its total: the balance line in <strong>, the link, "To pay…".
    invoice: {
        kind: 'invoice',
        document: POSTED.id,
        noun: 'invoice',
        number: POSTED.number,
        customer: HARBORVIEW.id,
        customerName: HARBORVIEW.display_name,
        to: POSTED.email,
        fileName: 'invoice-1004-harborview-hospitality-group.pdf',
        linkUrl: POSTED_LINK,
        subject: `Invoice 1004 from ${BUSINESS}`,
        bodyHtml: paragraphs([
            `Hello ${HARBORVIEW.display_name},`,
            `Attached is invoice 1004 from ${BUSINESS}.`,
            'Invoice date: Oct 21, 2026<br>Due date: Nov 20, 2026<br>Total: $2,111.77<br><strong>Balance due: $2,111.77</strong>',
            INVOICE_MESSAGE_HTML,
            `View this invoice online:<br>${linkHtml(POSTED_LINK)}`,
            `To pay, or to ask about this invoice, reply to this email or call ${PHONE}.`,
        ]),
    },
    // Estimate 1001, pending and not expired: "To accept or decline this estimate, open:".
    estimate: {
        kind: 'estimate',
        document: PENDING_ESTIMATE.id,
        noun: 'estimate',
        number: PENDING_ESTIMATE.number,
        customer: HARBORVIEW.id,
        customerName: HARBORVIEW.display_name,
        to: PENDING_ESTIMATE.email,
        fileName: 'estimate-1001-harborview-hospitality-group.pdf',
        linkUrl: ESTIMATE_LINK,
        subject: `Estimate 1001 from ${BUSINESS}`,
        bodyHtml: paragraphs([
            `Hello ${HARBORVIEW.display_name},`,
            `Attached is estimate 1001 from ${BUSINESS}.`,
            'Estimate date: Nov 2, 2026<br>Expires: Jan 15, 2027<br>Total: $2,111.77',
            'Thank you for the chance to quote this work. Prices hold until the expiration date.',
            `To accept or decline this estimate, open:<br>${linkHtml(ESTIMATE_LINK)}`,
            `To ask about this estimate, reply to this email or call ${PHONE}.`,
        ]),
    },
    // A sales receipt has no customer link, and no message here: no link block, no
    // Copy customer link in the dialog.
    salesReceipt: {
        kind: 'sales_receipt',
        document: 'slrc2003alvarz1',
        noun: 'sales receipt',
        number: '2003',
        customer: ALVAREZ.id,
        customerName: ALVAREZ.display_name,
        to: ALVAREZ.email,
        fileName: 'sales-receipt-2003-marisol-alvarez.pdf',
        linkUrl: null,
        subject: `Sales receipt 2003 from ${BUSINESS}`,
        bodyHtml: paragraphs([
            `Hello ${ALVAREZ.display_name},`,
            `Attached is sales receipt 2003 from ${BUSINESS}.`,
            'Date: Nov 10, 2026<br>Total: $1,250.00<br>Paid. No payment is due.',
            `To ask about this sales receipt, reply to this email or call ${PHONE}.`,
        ]),
    },
    creditMemo: {
        kind: 'credit_memo',
        document: 'crmm3001nwind01',
        noun: 'credit memo',
        number: '3001',
        customer: NORTHWIND.id,
        customerName: NORTHWIND.display_name,
        to: NORTHWIND.email,
        fileName: 'credit-memo-3001-northwind-traders.pdf',
        linkUrl: null,
        subject: `Credit memo 3001 from ${BUSINESS}`,
        bodyHtml: paragraphs([
            `Hello ${NORTHWIND.display_name},`,
            `Attached is credit memo 3001 from ${BUSINESS}.`,
            'Date: Nov 12, 2026<br>Credit: $344.00<br>Unapplied credit: $120.00',
            `To ask about this credit memo, reply to this email or call ${PHONE}.`,
        ]),
    },
    refundReceipt: {
        kind: 'refund_receipt',
        document: 'rfrc4001alvarz1',
        noun: 'refund receipt',
        number: '4001',
        customer: ALVAREZ.id,
        customerName: ALVAREZ.display_name,
        to: ALVAREZ.email,
        fileName: 'refund-receipt-4001-marisol-alvarez.pdf',
        linkUrl: null,
        subject: `Refund receipt 4001 from ${BUSINESS}`,
        bodyHtml: paragraphs([
            `Hello ${ALVAREZ.display_name},`,
            `Attached is refund receipt 4001 from ${BUSINESS}.`,
            'Date: Nov 13, 2026<br>Refund: $180.00',
            `To ask about this refund receipt, reply to this email or call ${PHONE}.`,
        ]),
    },
    // Long values everywhere: the business name, the customer name, the address, the
    // subject, the file name and the link; a message with a line break; a zero balance
    // ("No payment is due.") and a business with no phone (no "or call").
    long: {
        kind: 'invoice',
        document: 'invc1009stjude1',
        noun: 'invoice',
        number: '1009',
        customer: ST_JUDE.id,
        customerName: ST_JUDE.display_name,
        to: LONG_CUSTOMER_EMAIL,
        fileName:
            'invoice-1009-st-jude-community-hospital-foundation-of-the-greater-willamette-valley.pdf',
        linkUrl: LONG_LINK,
        subject: `Invoice 1009 from ${LONG_COMPANY_SETTINGS.business_name}`,
        bodyHtml: paragraphs([
            `Hello ${ST_JUDE.display_name},`,
            `Attached is invoice 1009 from ${LONG_COMPANY_SETTINGS.business_name}.`,
            'Invoice date: Nov 4, 2026<br>Due date: Dec 4, 2026<br>Total: $18,460.00<br><strong>Balance due: $0.00. No payment is due.</strong>',
            'Annex network refresh, October visit.<br>Parts are billed at cost plus ten percent; labor &amp; travel are billed at the agreed rate.',
            `View this invoice online:<br>${linkHtml(LONG_LINK)}`,
            'To ask about this invoice, reply to this email.',
        ]),
    },
} as const satisfies Record<string, SendTarget>

// A message the user changed with the toolbar: every format the toolbar offers (bold,
// italic, underline, both lists, a blockquote, a link), long enough that the dialog's
// content scrolls.
export const FORMATTED_BODY_HTML = [
    `<p>Hello ${HARBORVIEW.display_name},</p>`,
    `<p>Attached is invoice 1004 from ${BUSINESS}. <strong>Please note the new bank details</strong> before you pay; the <em>old account closes</em> on <u>Nov 30, 2026</u>.</p>`,
    '<p>What this invoice covers:</p>',
    '<ul><li>October catch-up bookkeeping</li><li>Wi-Fi refresh for the front office, six access points</li><li>One on-site visit</li></ul>',
    '<p>To pay:</p>',
    '<ol><li>Open the invoice online.</li><li>Use the reference number 1004 on your transfer.</li></ol>',
    '<blockquote><p>We moved our accounts to First Prairie Bank on Nov 1. Payments to the old account are returned.</p></blockquote>',
    `<p>View this invoice online:<br>${linkHtml(POSTED_LINK)}</p>`,
    `<p>To pay, or to ask about this invoice, reply to this email or call ${PHONE}.</p>`,
].join('')

// What the dialog's fields hold in the validation state: an address with no domain end,
// six Cc addresses, an empty subject and an empty message (spec §3.2).
export const INVALID_SEND = {
    to: 'accounts.payable@harborview',
    cc: 'a@harborview.example, b@harborview.example, c@harborview.example, d@harborview.example, e@harborview.example, f@harborview.example',
    subject: '',
    bodyHtml: '',
} as const

// The dialog's and the server's texts (spec §3.2, §3.4).
export const SEND_TEXTS = {
    toRequired: 'Enter an email address.',
    toInvalid: 'Enter a valid email address.',
    ccInvalid: 'Enter valid email addresses, separated by commas.',
    ccTooMany: 'Use 5 addresses or fewer.',
    subjectRequired: 'Enter a subject.',
    subjectTooLong: 'Use 300 characters or fewer.',
    bodyRequired: 'Enter a message.',
    bodyTooLong: 'The message is too long. Shorten it and send again.',
    notSetUp: 'Email sending is not set up. Share the customer link or the PDF with your customer.',
    notSetUpNoLink: 'Email sending is not set up. Download the PDF and send it to your customer.',
    loading: 'Loading…',
    loadError: 'Could not load the document.',
    linkCopied: 'Customer link copied.',
} as const

// A refusal for the document (the answer's `failed`), shown in FormErrorSummary.
export const SEND_REFUSAL =
    'The email server refused accounts.payable@harborviewhospitality.com. Correct the address and send again.'

const SEND_BODY_TEXT = [
    `Hello ${HARBORVIEW.display_name},`,
    `Attached is invoice 1004 from ${BUSINESS}.`,
    'Invoice date: Oct 21, 2026\nDue date: Nov 20, 2026\nTotal: $2,111.77\nBalance due: $2,111.77',
    'Thank you for your business. Please pay by bank transfer or check to Fern & Ledger Bookkeeping, and put the invoice number on the payment.',
    `View this invoice online:\n${POSTED_LINK}`,
    `To pay, or to ask about this invoice, reply to this email or call ${PHONE}.`,
].join('\n\n')

function send(
    seed: Pick<DocumentSendRecord, 'id' | 'doc_type' | 'document' | 'number' | 'customer'> &
        Pick<DocumentSendRecord, 'to' | 'created'> &
        Partial<DocumentSendRecord>
): DocumentSendRecord {
    return {
        cc: '',
        subject: SEND_TARGETS.invoice.subject,
        body: SEND_TARGETS.invoice.bodyHtml,
        body_text: SEND_BODY_TEXT,
        sent_by: INVOICE_USER_IDS.ana,
        ...seed,
    }
}

// The stored sends, newest first (the sent line reads the first row and the count).
// Invoice 1004 was sent three times, the last one with Cc and an edited subject; the
// estimate once; invoice 1003 once, to a long address. Invoice 1001 was never sent.
export const DOCUMENT_SENDS: DocumentSendRecord[] = [
    send({
        id: 'dsnd1004third01',
        doc_type: 'invoice',
        document: POSTED.id,
        number: POSTED.number,
        customer: HARBORVIEW.id,
        to: 'billing@harborviewhospitality.com',
        cc: 'kitchen@harborviewhospitality.com, events@harborviewhospitality.com',
        subject: `Reminder: invoice 1004 from ${BUSINESS} is due Nov 20`,
        sent_by: INVOICE_USER_IDS.omar,
        created: '2026-11-14 17:05:00.000Z',
    }),
    send({
        id: 'dsnd1004second1',
        doc_type: 'invoice',
        document: POSTED.id,
        number: POSTED.number,
        customer: HARBORVIEW.id,
        to: POSTED.email,
        created: '2026-11-02 15:30:00.000Z',
    }),
    send({
        id: 'dsnd1004first01',
        doc_type: 'invoice',
        document: POSTED.id,
        number: POSTED.number,
        customer: HARBORVIEW.id,
        to: POSTED.email,
        created: '2026-10-21 21:20:00.000Z',
    }),
    send({
        id: 'dsndest1001one1',
        doc_type: 'estimate',
        document: PENDING_ESTIMATE.id,
        number: PENDING_ESTIMATE.number,
        customer: HARBORVIEW.id,
        to: PENDING_ESTIMATE.email,
        subject: SEND_TARGETS.estimate.subject,
        body: SEND_TARGETS.estimate.bodyHtml,
        body_text: '',
        created: '2026-11-02 18:12:00.000Z',
    }),
    send({
        id: 'dsnd1003long001',
        doc_type: 'invoice',
        document: EXEMPT.id,
        number: EXEMPT.number,
        customer: NORTHWIND.id,
        to: LONG_CUSTOMER_EMAIL,
        created: '2026-10-14 18:40:00.000Z',
    }),
]

export const NO_SENDS: DocumentSendRecord[] = []

export function sendsOf(kind: SendKind, document: string): DocumentSendRecord[] {
    return DOCUMENT_SENDS.filter(row => row.doc_type === kind && row.document === document)
}

// The batch Send confirm of a sales list (spec §3.3): how many rows are ticked, and why
// some are skipped. The built list counts these from its ticked rows.
export interface BatchSendCounts {
    selected: number
    noEmail: number
    notSendable: number
}

export const BATCH_COUNTS = {
    // "Send 12 documents?" · "3 are skipped: 2 have no email address, 1 is a draft or void."
    // · confirm "Send 9".
    mixed: { selected: 12, noEmail: 2, notSendable: 1 },
    // Every ticked row goes: no skipped line.
    clean: { selected: 4, noEmail: 0, notSendable: 0 },
    // No sendable row: the confirm button is disabled.
    none: { selected: 3, noEmail: 2, notSendable: 1 },
    // Over the limit of one request.
    tooMany: { selected: 214, noEmail: 0, notSendable: 0 },
} as const satisfies Record<string, BatchSendCounts>

export const BATCH_TEXTS = {
    eachGoes: 'Each goes to the email address on the document.',
    tooMany: 'Select at most 200 documents.',
    notSetUp: 'Email sending is not set up.',
} as const

// A batch where some sends failed (the answer's `failed`): the banner above the list.
export const BATCH_RESULT = {
    sent: 6,
    sendable: 9,
    failed: [
        {
            kind: 'invoice',
            id: EXEMPT.id,
            label: 'Invoice 1003',
            message:
                'The email server refused billing@northwindtraders.example. Correct the address and send again.',
        },
        {
            kind: 'invoice',
            id: NO_TAX.id,
            label: 'Invoice 1001',
            message: 'The email was sent, but the send could not be recorded.',
        },
        {
            kind: 'estimate',
            id: ESTIMATE_IDS.closed,
            label: 'Estimate 1005',
            message: 'A closed estimate cannot be sent.',
        },
    ],
} as const

type Business = Pick<InvoicePublicRow, 'business_name' | 'business_email' | 'business_phone'>

const PUBLIC_BUSINESS: Business = {
    business_name: COMPANY_SETTINGS.business_name,
    business_email: COMPANY_SETTINGS.email,
    business_phone: COMPANY_SETTINGS.phone,
}

// A long business name and neither email nor phone: no "Questions?" line.
const LONG_BUSINESS: Business = {
    business_name: LONG_COMPANY_SETTINGS.business_name,
    business_email: '',
    business_phone: '',
}

type InvoiceSeed = (typeof INVOICES)[number]

function publicRow(
    row: InvoiceSeed,
    token: string,
    extra: Partial<InvoicePublicRow> = {}
): InvoicePublicRow {
    if (row.status === 'draft') throw new Error(`email share fixture: ${row.id} is a draft`)
    return {
        id: row.id,
        token,
        number: row.number,
        status: row.status,
        date: row.date,
        due_date: row.due_date,
        total: row.total,
        balance: row.balance,
        currency: row.currency || EMAIL_SHARE_CURRENCY,
        message: row.message,
        customer_name: customerOf(row.customer).display_name,
        replaced_by_token: '',
        replaced_by_number: '',
        ...PUBLIC_BUSINESS,
        ...extra,
    }
}

const LONG_PUBLIC_MESSAGE =
    'Thank you for your business. This invoice covers the annex network refresh: the October walk-through, six ceiling-mount access points installed and tested, and the cabling for the second floor. Parts are billed at cost plus ten percent. Please pay by bank transfer or check, and put the invoice number on the payment.'

// One row for each state of the customer's invoice page (spec §3.5). The page decides
// from `status`, `balance`, `due_date` against today and `replaced_by_token`.
export const INVOICE_PUBLIC_ROWS = {
    // Posted, the whole total still due, not yet due: no "Total" line under the balance.
    open: publicRow(POSTED, INVOICE_TOKENS.posted),
    // Posted with a part paid: "Total $2,111.77" under the balance.
    partlyPaid: publicRow(POSTED, INVOICE_TOKENS.posted, { balance: 131_177 }),
    // Posted, balance above zero and due on 2026-10-06: "Was due Oct 6, 2026"; no message.
    overdue: publicRow(NO_TAX, INVOICE_TOKENS.noTax),
    // Posted, balance zero: "Paid in full" with the total under it.
    paid: publicRow(EXEMPT, INVOICE_TOKENS.exempt, { balance: 0 }),
    // Void, not replaced: no amounts, no PDF.
    voided: publicRow(VOIDED, INVOICE_TOKENS.voided, { balance: 0 }),
    // Void with `replaced_by`: the forward to its correction (the same number here; an
    // edit keeps the number).
    replaced: publicRow(VOIDED, INVOICE_TOKENS.voided, {
        balance: 0,
        replaced_by_token: INVOICE_TOKENS.correction,
        replaced_by_number: CORRECTION.number,
    }),
    // Long business name, long customer name, long message, a large amount and no contact
    // line: wrapping.
    long: publicRow(POSTED, INVOICE_TOKENS.long, {
        number: '1009',
        total: 1_846_000_00,
        balance: 1_230_500_50,
        message: LONG_PUBLIC_MESSAGE,
        customer_name: ST_JUDE.display_name,
        ...LONG_BUSINESS,
    }),
} as const satisfies Record<string, InvoicePublicRow>

// A link whose token no row has: the Not found state.
export const UNKNOWN_INVOICE_TOKEN = fixtureToken('nosuchinvoice')

// A fixture row that breaks the schema's bounds is a fixture bug, not data.
for (const row of Object.values(INVOICE_PUBLIC_ROWS)) {
    if (!TOKEN_PATTERN.test(row.token)) {
        throw new Error(`email share fixture: ${row.id} has a malformed token`)
    }
}
for (const row of DOCUMENT_SENDS) {
    const isOver = row.subject.length > 300 || row.body.length > 50_000 || row.to.length > 320
    if (row.id.length !== 15 || row.document.length !== 15 || isOver) {
        throw new Error(`email share fixture: send ${row.id} is outside the schema's bounds`)
    }
}
