// The open-document payment table (receive-payment's grid and cards) serves six lists:
// the invoices a customer payment pays, the bills Pay Bills pays (pay-bills spec §3.3, §9),
// the bills a vendor credit is applied to (vendor credit spec §3.9), the vendor credits
// a vendor refund refunds (vendor refund spec §3.4), the invoices a credit memo is applied
// to and the credit memos applied to an invoice (apply credit spec §3.2, §3.3). A
// descriptor names what differs: the
// noun, where a row's link opens, the test-id prefix, whether a party (vendor) column, a
// total column and a header tick box show, the last column's header, the date and open
// columns' texts, the overdue mark, and the column widths.

import {
    BILL_PAYMENT_APPLIED_MIN_WIDTH,
    BILL_PAYMENT_COLUMNS,
    BILL_PAYMENT_GRID_MIN_WIDTH,
    CREDIT_APPLY_COLUMNS,
    CREDIT_APPLY_GRID_MIN_WIDTH,
    type FlexColumn,
    MEMO_APPLY_COLUMNS,
    MEMO_APPLY_GRID_MIN_WIDTH,
    PAYMENT_APPLIED_MIN_WIDTH,
    PAYMENT_COLUMNS,
    PAYMENT_GRID_MIN_WIDTH,
    REFUND_APPLIED_MIN_WIDTH,
    REFUND_COLUMNS,
    REFUND_GRID_MIN_WIDTH,
} from './payment-columns'
import { formatDay } from './register-range'
import {
    BILL_KIND,
    CREDIT_MEMO_KIND,
    INVOICE_KIND,
    VENDOR_CREDIT_KIND,
} from './sales-document-kinds'

// One width set for the grid's header and rows: a fixed tick column and data columns that
// grow with the grid. `party` is null where no party column shows (an invoice list is one
// customer's), `original` where no total column shows (the apply dialog's).
export type OutstandingColumns = {
    tick: number
    party: FlexColumn | null
    document: FlexColumn
    dueDate: FlexColumn
    original: FlexColumn | null
    open: FlexColumn
    payment: FlexColumn
}

export type OutstandingSortColumn = 'due' | 'vendor'
export type OutstandingSort = { column: OutstandingSortColumn; descending: boolean }

export type OutstandingDocument = {
    // Which list: the texts table is keyed by it.
    key: 'invoice' | 'bill' | 'credit' | 'refund' | 'memo_invoices' | 'invoice_credits'
    noun: 'Invoice' | 'Bill' | 'Vendor credit' | 'Credit memo'
    openKind:
        | typeof INVOICE_KIND
        | typeof BILL_KIND
        | typeof VENDOR_CREDIT_KIND
        | typeof CREDIT_MEMO_KIND
    testIdPrefix: string
    party: 'none' | 'vendor'
    // A header tick box (and the cards' "Pay all") that pays every row.
    hasPayAll: boolean
    // The last column's header, and the base of its cell's name.
    paymentHeader: string
    // The date column's header, the open column's header and its card label.
    dateHeader: string
    openHeader: string
    openCardLabel: string
    // A row whose date is before today is marked overdue (a due date is; a credit date
    // is not).
    marksOverdue: boolean
    columns: OutstandingColumns
    // The least list width that shows the outstanding grid, and the read view's applied
    // grid; a narrower list shows cards.
    gridMinWidth: number
    appliedMinWidth: number
}

// The date and open column texts of a list of documents that fall due.
const DUE_DATE_TEXTS = {
    dateHeader: 'Due date',
    openHeader: 'Open balance',
    openCardLabel: 'Open balance',
    marksOverdue: true,
} as const

export const INVOICE_OUTSTANDING: OutstandingDocument = {
    key: 'invoice',
    noun: 'Invoice',
    openKind: INVOICE_KIND,
    testIdPrefix: 'payment',
    party: 'none',
    hasPayAll: true,
    paymentHeader: 'Payment',
    ...DUE_DATE_TEXTS,
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
    key: 'bill',
    noun: 'Bill',
    openKind: BILL_KIND,
    testIdPrefix: 'pay-bills',
    party: 'vendor',
    hasPayAll: true,
    paymentHeader: 'Payment',
    ...DUE_DATE_TEXTS,
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

// The apply dialog's bills (vendor credit spec §3.9): one vendor's, so no Vendor column;
// no Bill total column, no header tick box or Pay all (the credit caps what a row takes),
// and "Credit to apply" as the last header.
export const CREDIT_OUTSTANDING: OutstandingDocument = {
    key: 'credit',
    noun: 'Bill',
    openKind: BILL_KIND,
    testIdPrefix: 'apply-credit',
    party: 'none',
    hasPayAll: false,
    paymentHeader: 'Credit to apply',
    ...DUE_DATE_TEXTS,
    columns: {
        tick: CREDIT_APPLY_COLUMNS.tick,
        party: null,
        document: CREDIT_APPLY_COLUMNS.bill,
        dueDate: CREDIT_APPLY_COLUMNS.dueDate,
        original: null,
        open: CREDIT_APPLY_COLUMNS.open,
        payment: CREDIT_APPLY_COLUMNS.payment,
    },
    gridMinWidth: CREDIT_APPLY_GRID_MIN_WIDTH,
    appliedMinWidth: BILL_PAYMENT_APPLIED_MIN_WIDTH,
}

// The apply dialog's invoices from a credit memo (apply credit spec §3.2): one customer's,
// so no party column; no total column, no header tick box (the credit caps what a row
// takes), and its own column set (MEMO_APPLY_COLUMNS: Due date fits "· Overdue").
export const MEMO_INVOICES_OUTSTANDING: OutstandingDocument = {
    key: 'memo_invoices',
    noun: 'Invoice',
    openKind: INVOICE_KIND,
    testIdPrefix: 'apply-credit',
    party: 'none',
    hasPayAll: false,
    paymentHeader: 'Credit to apply',
    ...DUE_DATE_TEXTS,
    columns: {
        tick: MEMO_APPLY_COLUMNS.tick,
        party: null,
        document: MEMO_APPLY_COLUMNS.invoice,
        dueDate: MEMO_APPLY_COLUMNS.dueDate,
        original: null,
        open: MEMO_APPLY_COLUMNS.open,
        payment: MEMO_APPLY_COLUMNS.payment,
    },
    gridMinWidth: MEMO_APPLY_GRID_MIN_WIDTH,
    appliedMinWidth: PAYMENT_APPLIED_MIN_WIDTH,
}

// The apply dialog's credit memos from an invoice (apply credit spec §3.3): one customer's
// credit memos with unapplied credit; "Credit date" and "Unapplied credit" in place of the
// due-date texts, no overdue mark, no total column and no header tick box (the invoice's
// balance caps what a row takes). The vendor credit's column set.
export const INVOICE_CREDITS_OUTSTANDING: OutstandingDocument = {
    key: 'invoice_credits',
    noun: 'Credit memo',
    openKind: CREDIT_MEMO_KIND,
    testIdPrefix: 'apply-credit',
    party: 'none',
    hasPayAll: false,
    paymentHeader: 'Credit to apply',
    dateHeader: 'Credit date',
    openHeader: 'Unapplied credit',
    openCardLabel: 'Unapplied credit',
    marksOverdue: false,
    columns: {
        tick: CREDIT_APPLY_COLUMNS.tick,
        party: null,
        document: CREDIT_APPLY_COLUMNS.bill,
        dueDate: CREDIT_APPLY_COLUMNS.dueDate,
        original: null,
        open: CREDIT_APPLY_COLUMNS.open,
        payment: CREDIT_APPLY_COLUMNS.payment,
    },
    gridMinWidth: CREDIT_APPLY_GRID_MIN_WIDTH,
    appliedMinWidth: REFUND_APPLIED_MIN_WIDTH,
}

// The vendor refund's credits (vendor refund spec §3.4): one vendor's unapplied vendor
// credits, so no Vendor column; a Credit total column, a header tick box and "Refund all",
// "Credit date" and "Unapplied credit" in place of the due-date texts, and no overdue mark.
export const REFUND_OUTSTANDING: OutstandingDocument = {
    key: 'refund',
    noun: 'Vendor credit',
    openKind: VENDOR_CREDIT_KIND,
    testIdPrefix: 'vendor-refund',
    party: 'none',
    hasPayAll: true,
    paymentHeader: 'Refund',
    dateHeader: 'Credit date',
    openHeader: 'Unapplied credit',
    openCardLabel: 'Unapplied credit',
    marksOverdue: false,
    columns: {
        tick: REFUND_COLUMNS.tick,
        party: null,
        document: REFUND_COLUMNS.credit,
        dueDate: REFUND_COLUMNS.creditDate,
        original: REFUND_COLUMNS.total,
        open: REFUND_COLUMNS.open,
        payment: REFUND_COLUMNS.refund,
    },
    gridMinWidth: REFUND_GRID_MIN_WIDTH,
    appliedMinWidth: REFUND_APPLIED_MIN_WIDTH,
}

// The total column's header and the card's label for it.
type TotalTexts = { header: string; card: string }

type OutstandingTexts = {
    // A row's tick box name starts with the verb ("Pay bill 1003", "Apply to bill 1003");
    // its cell's name joins the payment header and the row ("Payment for bill 1003",
    // "Credit to apply to bill 1003").
    tickVerb: string
    cellJoin: string
    // null where the list draws no total column.
    total: TotalTexts | null
    // The card's label for the date, drawn as a label-value pair beside the money (vendor
    // refund spec §3.4); null draws the date as a line of its own (a due date, with its
    // overdue mark).
    cardDateLabel: string | null
    // The header tick box's and "Pay all"'s accessible name, and the text the cards draw
    // beside their tick box ("Pay all", "Refund all"); null where there is none.
    payAllLabel: string | null
    payAllText: string | null
    // A read view's list of the paid documents: its heading, and the paid column's header
    // and card label.
    appliedHeading: string
    appliedLabel: string
}

const TEXTS: Record<OutstandingDocument['key'], OutstandingTexts> = {
    invoice: {
        tickVerb: 'Pay',
        cellJoin: 'for',
        total: { header: 'Original amount', card: 'Original' },
        cardDateLabel: null,
        payAllLabel: 'Pay every listed invoice',
        payAllText: 'Pay all',
        appliedHeading: 'Applied to',
        appliedLabel: 'Applied',
    },
    bill: {
        tickVerb: 'Pay',
        cellJoin: 'for',
        total: { header: 'Bill total', card: 'Bill total' },
        cardDateLabel: null,
        payAllLabel: 'Pay every shown bill',
        payAllText: 'Pay all',
        appliedHeading: 'Bills paid',
        appliedLabel: 'Paid',
    },
    credit: {
        tickVerb: 'Apply to',
        cellJoin: 'to',
        total: null,
        cardDateLabel: null,
        payAllLabel: null,
        payAllText: null,
        appliedHeading: 'Applied to',
        appliedLabel: 'Applied',
    },
    refund: {
        tickVerb: 'Refund',
        cellJoin: 'for',
        total: { header: 'Credit total', card: 'Credit total' },
        cardDateLabel: 'Credit date',
        payAllLabel: 'Refund all',
        payAllText: 'Refund all',
        appliedHeading: 'Vendor credits refunded',
        appliedLabel: 'Refunded',
    },
    memo_invoices: {
        tickVerb: 'Apply to',
        cellJoin: 'to',
        total: null,
        cardDateLabel: null,
        payAllLabel: null,
        payAllText: null,
        appliedHeading: 'Applied to',
        appliedLabel: 'Applied',
    },
    // "Apply credit memo 1001", "Credit to apply from credit memo 1001"; the card draws the
    // credit date as a pair, as the vendor refund's credits do.
    invoice_credits: {
        tickVerb: 'Apply',
        cellJoin: 'from',
        total: null,
        cardDateLabel: 'Credit date',
        payAllLabel: null,
        payAllText: null,
        appliedHeading: 'Credits applied',
        appliedLabel: 'Applied',
    },
}

// The total column's texts of a list that draws one (the invoice and bill lists, and
// their read views' paid lists).
const NO_TOTAL: TotalTexts = { header: '', card: '' }

export function totalTexts(doc: OutstandingDocument): TotalTexts {
    return TEXTS[doc.key].total ?? NO_TOTAL
}

// One paid document of a payment as a read view lists it: an invoice a customer payment
// applies to, or a bill a bill payment pays. Days are ISO days.
export type AppliedDocumentRow = {
    // The application's or line's id.
    id: string
    documentId: string
    number: string
    date: string
    dueDate: string
    // The vendor's bill no.; '' for an invoice.
    ref: string
    total: number
    amount: number
}

export function outstandingTexts(doc: OutstandingDocument): OutstandingTexts {
    return TEXTS[doc.key]
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

// A row's tick box and payment cell names: "Pay bill 1003", "Payment for bill 1003";
// "Apply to bill 1003", "Credit to apply to bill 1003".
export function rowTickLabel(doc: OutstandingDocument, number: string): string {
    return `${TEXTS[doc.key].tickVerb} ${doc.noun.toLowerCase()} ${number}`
}

export function paymentCellLabel(doc: OutstandingDocument, number: string): string {
    const { cellJoin } = TEXTS[doc.key]
    return `${doc.paymentHeader} ${cellJoin} ${doc.noun.toLowerCase()} ${number}`
}
