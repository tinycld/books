// One vendor's purchase documents as one list (vendor pages §3.5): bills, purchase orders,
// expenses, bill payments, vendor credits and vendor refunds mapped to the party row shape
// with their status badge. Pure, so each rule is unit-tested; the hook
// (hooks/useVendorTransactions.ts) feeds it and `mergeTransactions` merges the lists.

import type {
    BooksBillPayments,
    BooksBills,
    BooksExpenses,
    BooksPurchaseOrderLines,
    BooksPurchaseOrders,
    BooksVendorCredits,
    BooksVendorRefunds,
} from '../types'
import { documentPath } from './document-routes'
import {
    creditStatus,
    dueDocumentStatus,
    lifecycleStatus,
    type PartyTransactionRow,
} from './party-transactions'
import { purchaseOrderBadge } from './purchase-order-status'
import { documentKey } from './record-key'

export type VendorTransactionKind =
    | 'bill'
    | 'purchase_order'
    | 'expense'
    | 'bill_payment'
    | 'vendor_credit'
    | 'vendor_refund'

export type VendorTransactionFilter = 'all' | VendorTransactionKind

export type VendorTransactionRow = PartyTransactionRow<VendorTransactionKind>

type Status = VendorTransactionRow['status']

export const VENDOR_TRANSACTION_TYPE_LABELS: Record<VendorTransactionKind, string> = {
    bill: 'Bill',
    purchase_order: 'Purchase order',
    expense: 'Expense',
    bill_payment: 'Bill payment',
    vendor_credit: 'Vendor credit',
    vendor_refund: 'Vendor refund',
}

// The chips, in strip order: Purchase orders after Bills, as the Expenses tabs are.
export const VENDOR_TRANSACTION_FILTERS: readonly {
    key: VendorTransactionFilter
    label: string
}[] = [
    { key: 'all', label: 'All' },
    { key: 'bill', label: 'Bills' },
    { key: 'purchase_order', label: 'Purchase orders' },
    { key: 'expense', label: 'Expenses' },
    { key: 'bill_payment', label: 'Bill payments' },
    { key: 'vendor_credit', label: 'Vendor credits' },
    { key: 'vendor_refund', label: 'Vendor refunds' },
]

// Where each kind's stored document opens (`documentHref`).
export const VENDOR_TRANSACTION_ROUTES: Record<VendorTransactionKind, string> = {
    bill: 'books/bills',
    purchase_order: 'books/purchase-orders',
    expense: 'books/expenses',
    bill_payment: 'books/bill-payments',
    vendor_credit: 'books/vendor-credits',
    vendor_refund: 'books/vendor-refunds',
}

const NO_MATCH_NOUNS: Record<VendorTransactionKind, string> = {
    bill: 'bills',
    purchase_order: 'purchase orders',
    expense: 'expenses',
    bill_payment: 'bill payments',
    vendor_credit: 'vendor credits',
    vendor_refund: 'vendor refunds',
}

export const VENDOR_TRANSACTION_TEXTS = {
    empty: 'No transactions for this vendor yet',
    noMatch: (kind: VendorTransactionKind) => `No ${NO_MATCH_NOUNS[kind]} for this vendor`,
}

type Common =
    | 'id'
    | 'status'
    | 'number'
    | 'date'
    | 'currency'
    | 'created'
    | 'sequence'
    | 'replaced_by'
type BillInput = Pick<BooksBills, Common | 'due_date' | 'total' | 'balance'>
type ExpenseInput = Pick<BooksExpenses, Common | 'total'>
type BillPaymentInput = Pick<BooksBillPayments, Common | 'total'>
type VendorCreditInput = Pick<BooksVendorCredits, Common | 'total' | 'balance'>
type VendorRefundInput = Pick<BooksVendorRefunds, Common | 'amount'>
// A purchase order is never replaced by a correction, so it has no `replaced_by`.
type PurchaseOrderInput = Pick<BooksPurchaseOrders, Exclude<Common, 'replaced_by'> | 'total'>
type PurchaseOrderLineInput = Pick<BooksPurchaseOrderLines, 'received' | 'billed'>

// A posted vendor credit reads Unapplied while credit is left on it, else Closed.
function vendorCreditStatus(row: VendorCreditInput): Status {
    return creditStatus(row, {
        open: { label: 'Unapplied', tone: 'warning' },
        closed: { label: 'Closed', tone: 'success' },
    })
}

function rowOf(
    row: Pick<BooksBills, Exclude<Common, 'status' | 'replaced_by'>> & { replaced_by?: string },
    kind: VendorTransactionKind,
    fields: { dueDate: string; total: number; status: Status }
): VendorTransactionRow {
    return {
        id: row.id,
        key: documentKey(row),
        kind,
        number: row.number,
        date: row.date,
        currency: row.currency,
        created: row.created,
        ...fields,
    }
}

// A bill's status is the invoice rule: the first rule that applies wins.
export function billRow(row: BillInput, today: string): VendorTransactionRow {
    return rowOf(row, 'bill', {
        dueDate: row.due_date,
        total: row.total,
        status: dueDocumentStatus(row, today),
    })
}

// A purchase order has no due date; its total is shown unsigned and its badge reads its
// lines (`purchaseOrderBadge`: Open, Partly received or Closed; purchase order spec §3.9).
export function purchaseOrderRow(
    row: PurchaseOrderInput,
    lines: readonly PurchaseOrderLineInput[]
): VendorTransactionRow {
    return rowOf(row, 'purchase_order', {
        dueDate: '',
        total: row.total,
        status: purchaseOrderBadge(row, lines),
    })
}

export function expenseRow(row: ExpenseInput): VendorTransactionRow {
    return rowOf(row, 'expense', {
        dueDate: '',
        total: row.total,
        status: lifecycleStatus(row.status, { label: 'Paid', tone: 'success' }),
    })
}

// A bill payment has no draft: it is posted or void.
export function billPaymentRow(row: BillPaymentInput): VendorTransactionRow {
    return rowOf(row, 'bill_payment', {
        dueDate: '',
        total: row.total,
        status: lifecycleStatus(row.status, { label: 'Paid', tone: 'success' }),
    })
}

// A vendor credit's total is stored positive; the row negates it, as the credit lowers
// what the business owes the vendor.
export function vendorCreditRow(row: VendorCreditInput): VendorTransactionRow {
    return rowOf(row, 'vendor_credit', {
        dueDate: '',
        total: -row.total,
        status: vendorCreditStatus(row),
    })
}

// A vendor refund's total is its `amount`.
export function vendorRefundRow(row: VendorRefundInput): VendorTransactionRow {
    return rowOf(row, 'vendor_refund', {
        dueDate: '',
        total: row.amount,
        status: lifecycleStatus(row.status, { label: 'Received', tone: 'success' }),
    })
}

export function vendorTransactionHref(row: VendorTransactionRow): string {
    return documentPath({ routeBase: VENDOR_TRANSACTION_ROUTES[row.kind] }, row.key)
}
