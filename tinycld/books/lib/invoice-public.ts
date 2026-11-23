// The pure rules of the customer's invoice page (email-share spec §3.5): which state a row
// of the public view shows, and every text the page draws from it.

import type { BooksInvoicePublic } from '../types'
import { formatDay } from './register-range'

export type InvoicePublicState =
    | 'open'
    | 'overdue'
    | 'paid'
    | 'settled'
    | 'void'
    | 'replaced'
    | 'not-found'

export const INVOICE_PUBLIC_TEXTS = {
    loading: 'Loading invoice…',
    notFound: 'This link is not valid.',
    notFoundHint: 'Ask the business that sent it for a new link.',
    loadError: 'The invoice could not load.',
    retry: 'Try again',
    balanceLabel: 'Balance due',
    paid: 'Paid in full',
    settled: 'No payment is due.',
    downloadPdf: 'Download PDF',
    loadingTitle: 'Invoice',
} as const

// A posted invoice owes money while its balance is above zero; it is past due when its due
// day is before today. Days are ISO strings, so they compare as text.
function isPastDue(row: Pick<BooksInvoicePublic, 'balance' | 'due_date'>, today: string) {
    return row.balance > 0 && row.due_date !== '' && row.due_date < today
}

// A draft has no row in the view, so no row is a wrong link, a draft or a deleted draft. A
// zero balance is paid only when payments alone cover the total; a write-off or a credit
// memo (in whole or in part) makes it settled.
export function invoicePublicState(
    row: BooksInvoicePublic | undefined,
    today: string
): InvoicePublicState {
    if (row === undefined) return 'not-found'
    if (row.status === 'void') return row.replaced_by_token === '' ? 'void' : 'replaced'
    if (row.balance <= 0) return row.written_off > 0 || row.credited > 0 ? 'settled' : 'paid'
    if (isPastDue(row, today)) return 'overdue'
    return 'open'
}

// "Due <day>", or "Was due <day>" (drawn in the destructive tone) while money is owed past
// the due day. An invoice with no due day has no due text.
export function invoiceDueLine(
    row: Pick<BooksInvoicePublic, 'balance' | 'due_date'>,
    today: string
): { text: string; isOverdue: boolean } {
    if (row.due_date === '') return { text: '', isOverdue: false }
    const day = formatDay(row.due_date)
    if (isPastDue(row, today)) return { text: `Was due ${day}`, isOverdue: true }
    return { text: `Due ${day}`, isOverdue: false }
}

export function invoicePublicTitleOf(number: string, business: string): string {
    return `Invoice ${number} · ${business}`
}

export function invoicePublicHeadingOf(
    row: Pick<BooksInvoicePublic, 'number' | 'customer_name'>
): string {
    return `Invoice ${row.number} for ${row.customer_name}`
}

export function invoiceDateLineOf(row: Pick<BooksInvoicePublic, 'date'>): string {
    return `Invoice date ${formatDay(row.date)}`
}

export function invoiceVoidTextOf(business: string): string {
    return `${business} voided this invoice. No payment is due.`
}

export function invoiceReplacedTextOf(number: string): string {
    return `This invoice was replaced by invoice ${number}.`
}

export function openReplacementLabelOf(number: string): string {
    return `Open invoice ${number}`
}

// The page of an invoice's customer link (route public-screens/invoices/[token].tsx).
export function invoicePublicPath(token: string): string {
    return `/p/books/invoices/${encodeURIComponent(token)}`
}
