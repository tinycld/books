// The open-document payment table (receive-payment's grid and cards) serves two kinds:
// the invoices a customer payment pays and the bills Pay Bills pays (pay-bills spec §3.3,
// §9). A descriptor names what differs: the noun, where a row's link opens, the test-id
// prefix, whether a party (vendor) column shows, and the column widths.

import {
    BILL_PAYMENT_APPLIED_MIN_WIDTH,
    BILL_PAYMENT_COLUMNS,
    BILL_PAYMENT_GRID_MIN_WIDTH,
    PAYMENT_APPLIED_MIN_WIDTH,
    PAYMENT_COLUMNS,
    PAYMENT_GRID_MIN_WIDTH,
} from './payment-columns'
import { formatDay } from './register-range'
import { BILL_KIND, INVOICE_KIND } from './sales-document-kinds'

type FlexColumn = { readonly flex: number; readonly minWidth: number }

// One width set for the grid's header and rows. `party` is null where no party column
// shows (an invoice list is one customer's).
export type OutstandingColumns = {
    tick: number
    party: FlexColumn | null
    document: FlexColumn
    dueDate: number
    original: number
    open: number
    payment: number
}

export type OutstandingSortColumn = 'due' | 'vendor'
export type OutstandingSort = { column: OutstandingSortColumn; descending: boolean }

export type OutstandingDocument = {
    noun: 'Invoice' | 'Bill'
    openKind: typeof INVOICE_KIND | typeof BILL_KIND
    testIdPrefix: string
    party: 'none' | 'vendor'
    columns: OutstandingColumns
    gridMinWidth: number
    appliedMinWidth: number
}

export const INVOICE_OUTSTANDING: OutstandingDocument = {
    noun: 'Invoice',
    openKind: INVOICE_KIND,
    testIdPrefix: 'payment',
    party: 'none',
    columns: {
        tick: PAYMENT_COLUMNS.tick,
        party: null,
        document: PAYMENT_COLUMNS.invoice,
        dueDate: PAYMENT_COLUMNS.dueDate,
        original: PAYMENT_COLUMNS.original,
        open: PAYMENT_COLUMNS.open,
        payment: PAYMENT_COLUMNS.payment,
    },
    gridMinWidth: PAYMENT_GRID_MIN_WIDTH,
    appliedMinWidth: PAYMENT_APPLIED_MIN_WIDTH,
}

export const BILL_OUTSTANDING: OutstandingDocument = {
    noun: 'Bill',
    openKind: BILL_KIND,
    testIdPrefix: 'pay-bills',
    party: 'vendor',
    columns: {
        tick: BILL_PAYMENT_COLUMNS.tick,
        party: BILL_PAYMENT_COLUMNS.party,
        document: BILL_PAYMENT_COLUMNS.bill,
        dueDate: BILL_PAYMENT_COLUMNS.dueDate,
        original: BILL_PAYMENT_COLUMNS.original,
        open: BILL_PAYMENT_COLUMNS.open,
        payment: BILL_PAYMENT_COLUMNS.payment,
    },
    gridMinWidth: BILL_PAYMENT_GRID_MIN_WIDTH,
    appliedMinWidth: BILL_PAYMENT_APPLIED_MIN_WIDTH,
}

type OutstandingTexts = {
    // The total column's header and the card's label for it.
    totalHeader: string
    totalCard: string
    // The header tick box's and "Pay all"'s accessible name.
    payAllLabel: string
}

const TEXTS: Record<OutstandingDocument['noun'], OutstandingTexts> = {
    Invoice: {
        totalHeader: 'Original amount',
        totalCard: 'Original',
        payAllLabel: 'Pay every listed invoice',
    },
    Bill: {
        totalHeader: 'Bill total',
        totalCard: 'Bill total',
        payAllLabel: 'Pay every shown bill',
    },
}

export function outstandingTexts(doc: OutstandingDocument): OutstandingTexts {
    return TEXTS[doc.noun]
}

// The party column's header; '' where the descriptor has none.
export function partyHeader(doc: OutstandingDocument): string {
    return doc.party === 'vendor' ? 'Vendor' : ''
}

type LabelRow = { number: string; date: string; ref?: string }

// A row's link text in the grid: "Invoice 1004 · Nov 1, 2026" (the invoice date tells two
// of a customer's invoices apart), "Bill 1003" (the vendor's bill no. shows under it).
export function gridDocumentLabel(doc: OutstandingDocument, row: LabelRow): string {
    if (doc.noun === 'Invoice') return `Invoice ${row.number} · ${formatDay(row.date)}`
    return `${doc.noun} ${row.number}`
}

// A card's link text: "Invoice 1004", "Bill 1003 · No. 88412".
export function cardDocumentLabel(doc: OutstandingDocument, row: LabelRow): string {
    const ref = refText(row.ref)
    const title = `${doc.noun} ${row.number}`
    return ref === '' ? title : `${title} · ${ref}`
}

// The vendor's bill no. as the grid shows it under the link; '' with none.
export function refText(ref: string | undefined): string {
    return ref ? `No. ${ref}` : ''
}

// A row's tick box and Payment cell names: "Pay bill 1003", "Payment for bill 1003".
export function rowTickLabel(doc: OutstandingDocument, number: string): string {
    return `Pay ${doc.noun.toLowerCase()} ${number}`
}

export function paymentCellLabel(doc: OutstandingDocument, number: string): string {
    return `Payment for ${doc.noun.toLowerCase()} ${number}`
}
