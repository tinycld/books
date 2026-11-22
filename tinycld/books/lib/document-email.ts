import type {
    BooksCreditMemos,
    BooksEstimates,
    BooksInvoices,
    BooksRefundReceipts,
    BooksSalesReceipts,
    BooksSettings,
} from '../types'
import { documentLinkUrl } from './document-link'
import type { SendKind } from './document-send'
import { formatMoney } from './money'
import { formatDay } from './register-range'

// The starting subject and message of a document email (spec §3.4). This is a mirror of
// Go documentEmail (server/document_email.go), which a batch send uses: the same blocks
// in the same order, pinned by one vector file (server/testdata/document_email_cases.json).
// The input is the JSON of the Go documentEmailInput, so both read the same cases.
export type DocumentEmailInput = {
    kind: SendKind
    number: string
    customerName: string
    businessName: string
    businessPhone: string
    date: string
    dueDate: string
    expirationDate: string
    total: string
    balance: string
    balanceIsZero: boolean
    message: string
    link: string
    canRespond: boolean
}

const KIND_WORDS: Record<SendKind, { title: string; noun: string }> = {
    invoice: { title: 'Invoice', noun: 'invoice' },
    estimate: { title: 'Estimate', noun: 'estimate' },
    sales_receipt: { title: 'Sales receipt', noun: 'sales receipt' },
    credit_memo: { title: 'Credit memo', noun: 'credit memo' },
    refund_receipt: { title: 'Refund receipt', noun: 'refund receipt' },
}

const ESCAPES: Record<string, string> = {
    '&': '&amp;',
    "'": '&#39;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&#34;',
}

// As Go html.EscapeString writes the five characters.
function escapeHtml(text: string): string {
    return text.replace(/[&'<>"]/g, char => ESCAPES[char])
}

const LINE_BREAK = /\r\n|\r|\n/

// A line break in a name becomes a space (Go oneLine).
function oneLine(text: string): string {
    return text.split(LINE_BREAK).join(' ')
}

function paragraph(lines: string[]): string {
    return `<p>${lines.join('<br>')}</p>`
}

// The name ends the sentence "Attached is … from <name>.": a name that ends with a period
// gets no second one.
function nameSentence(name: string): string {
    return name.endsWith('.') ? escapeHtml(name) : `${escapeHtml(name)}.`
}

// The lines of the block of dates and amounts of each kind, escaped.
function detailLines(input: DocumentEmailInput): string[] {
    const e = escapeHtml
    switch (input.kind) {
        case 'invoice': {
            const balance = input.balanceIsZero
                ? `Balance due: ${e(input.balance)}. No payment is due.`
                : `Balance due: ${e(input.balance)}`
            return [
                `Invoice date: ${e(input.date)}`,
                `Due date: ${e(input.dueDate)}`,
                `Total: ${e(input.total)}`,
                `<strong>${balance}</strong>`,
            ]
        }
        case 'estimate': {
            const expires =
                input.expirationDate === '' ? [] : [`Expires: ${e(input.expirationDate)}`]
            return [`Estimate date: ${e(input.date)}`, ...expires, `Total: ${e(input.total)}`]
        }
        case 'sales_receipt':
            return [
                `Date: ${e(input.date)}`,
                `Total: ${e(input.total)}`,
                'Paid. No payment is due.',
            ]
        case 'credit_memo':
            return [
                `Date: ${e(input.date)}`,
                `Credit: ${e(input.total)}`,
                `Unapplied credit: ${e(input.balance)}`,
            ]
        case 'refund_receipt':
            return [`Date: ${e(input.date)}`, `Refund: ${e(input.total)}`]
    }
}

// The kinds with a customer page (Go documentLinkPaths): their email always has the
// link block, also when the link is empty.
const LINK_KINDS: readonly SendKind[] = ['invoice', 'estimate']

// The link block, for a kind with a customer page: an estimate the customer can still
// answer asks for the answer.
function linkBlocks(input: DocumentEmailInput): string[] {
    if (!LINK_KINDS.includes(input.kind)) return []
    const noun = KIND_WORDS[input.kind].noun
    const lead =
        input.kind === 'estimate' && input.canRespond
            ? 'To accept or decline this estimate, open:'
            : `View this ${noun} online:`
    const link = escapeHtml(input.link)
    return [paragraph([lead, `<a href="${link}">${link}</a>`])]
}

function closingSentence(input: DocumentEmailInput): string {
    const noun = KIND_WORDS[input.kind].noun
    const lead =
        input.kind === 'invoice' && !input.balanceIsZero
            ? `To pay, or to ask about this ${noun}`
            : `To ask about this ${noun}`
    const phone = oneLine(input.businessPhone)
    const call = phone === '' ? '' : ` or call ${escapeHtml(phone)}`
    return `${lead}, reply to this email${call}.`
}

function messageBlocks(message: string): string[] {
    if (message === '') return []
    return [paragraph(message.split(LINE_BREAK).map(escapeHtml))]
}

export function documentEmail(input: DocumentEmailInput): { subject: string; bodyHtml: string } {
    const words = KIND_WORDS[input.kind]
    const business = oneLine(input.businessName)
    const blocks = [
        paragraph([`Hello ${escapeHtml(oneLine(input.customerName))},`]),
        paragraph([
            `Attached is ${words.noun} ${escapeHtml(input.number)} from ${nameSentence(business)}`,
        ]),
        paragraph(detailLines(input)),
        ...messageBlocks(input.message),
        ...linkBlocks(input),
        paragraph([closingSentence(input)]),
    ]
    return {
        // The body sentence keeps the number as it is; only the subject is one line (as Go).
        subject: `${words.title} ${oneLine(input.number)} from ${business}`,
        bodyHtml: blocks.join(''),
    }
}

// The fields of each kind's row that its email reads.
type CommonFields = 'number' | 'date' | 'total' | 'currency' | 'message'
export type DocumentEmailRecord =
    | {
          kind: 'invoice'
          record: Pick<BooksInvoices, CommonFields | 'due_date' | 'balance' | 'public_token'>
      }
    | {
          kind: 'estimate'
          record: Pick<BooksEstimates, CommonFields | 'status' | 'expiration_date' | 'public_token'>
      }
    | { kind: 'sales_receipt'; record: Pick<BooksSalesReceipts, CommonFields> }
    | { kind: 'credit_memo'; record: Pick<BooksCreditMemos, CommonFields | 'balance'> }
    | { kind: 'refund_receipt'; record: Pick<BooksRefundReceipts, CommonFields> }

export type DocumentEmailSource = DocumentEmailRecord & {
    // The customer's display name.
    customerName: string
    // `currency` is the book's, for a document with none (as Go documentEmailInputOf).
    settings: Pick<BooksSettings, 'business_name' | 'phone' | 'currency'>
    // The name of the organization, for a Books with no business name (as Go
    // loadDocumentBusiness falls back to it).
    organizationName: string
    // Today as YYYY-MM-DD: an estimate past its expiration date can no longer be answered.
    today: string
    // The server address of the customer link; the resolved one by default.
    address?: string
}

// A day as Go formatDay prints it; an empty day stays empty.
function dayText(day: string): string {
    return day === '' ? '' : formatDay(day)
}

type KindFields = Pick<
    DocumentEmailInput,
    'dueDate' | 'expirationDate' | 'balance' | 'balanceIsZero' | 'link' | 'canRespond'
>

const NO_KIND_FIELDS: KindFields = {
    dueDate: '',
    expirationDate: '',
    balance: '',
    balanceIsZero: false,
    link: '',
    canRespond: false,
}

// The document's currency, else the book's (as each PDF builder and Go).
function currencyOf(source: DocumentEmailSource): string {
    return source.record.currency || source.settings.currency
}

function kindFieldsOf(source: DocumentEmailSource): KindFields {
    const currency = currencyOf(source)
    switch (source.kind) {
        case 'invoice': {
            const { record } = source
            return {
                ...NO_KIND_FIELDS,
                dueDate: dayText(record.due_date),
                balance: formatMoney(record.balance, currency),
                balanceIsZero: record.balance === 0,
                link: documentLinkUrl('invoice', record.public_token, source.address),
            }
        }
        case 'estimate': {
            const { record } = source
            const isOpen =
                record.status === 'pending' &&
                (record.expiration_date === '' || record.expiration_date >= source.today)
            return {
                ...NO_KIND_FIELDS,
                expirationDate: dayText(record.expiration_date),
                link: documentLinkUrl('estimate', record.public_token, source.address),
                canRespond: isOpen,
            }
        }
        case 'credit_memo': {
            const { record } = source
            return {
                ...NO_KIND_FIELDS,
                balance: formatMoney(record.balance, currency),
                balanceIsZero: record.balance === 0,
            }
        }
        case 'sales_receipt':
        case 'refund_receipt':
            return NO_KIND_FIELDS
    }
}

// The input of one document's email, from its stored row, as Go documentEmailInputOf
// fills it: days through formatDay, money through formatMoney.
export function documentEmailInputOf(source: DocumentEmailSource): DocumentEmailInput {
    const { record } = source
    const businessName = source.settings.business_name.trim() || source.organizationName.trim()
    return {
        kind: source.kind,
        number: record.number,
        customerName: source.customerName,
        businessName,
        businessPhone: source.settings.phone.trim(),
        date: dayText(record.date),
        total: formatMoney(record.total, currencyOf(source)),
        message: record.message.trim(),
        ...kindFieldsOf(source),
    }
}
