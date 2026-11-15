// The allocation rules of the receive-payment form (spec §3.4). Pure: every amount is
// integer cents through the shared money helpers, never dollars. `payments` holds a
// row's typed payment by invoice id; a row with no entry is at zero, and an edit that
// leaves a row at zero removes its entry.

import { moneyInputCents } from './money-input'
import { centsToText, parseMoney } from './money-text'
import type { PaymentEntry } from './payment-values'

// A listed invoice, in list order (oldest due date first, then number). `open` is what
// the payment may take: its balance (plus, on a correction, what the original applied).
export type OutstandingRow = {
    id: string
    number: string
    date: string
    due_date: string
    total: number
    open: number
}

export type Payments = Record<string, PaymentEntry>

// A row's payment in cents: 0 for a missing entry or text that does not parse.
export function entryCents(entry: PaymentEntry | undefined, currency: string): number {
    if (!entry) return 0
    return moneyInputCents(entry.amount, currency) ?? 0
}

// The sum of the row payments in cents.
export function amountToApply(payments: Payments, currency: string): number {
    return Object.values(payments).reduce((sum, entry) => sum + entryCents(entry, currency), 0)
}

// What the payment keeps as the customer's credit: Amount received less Amount to apply,
// 0 when not above zero or while Amount received is empty or does not parse.
export function amountToCredit(amountCents: number | null, applyCents: number): number {
    if (amountCents === null) return 0
    return Math.max(0, amountCents - applyCents)
}

function entryOf(row: OutstandingRow, cents: number): PaymentEntry {
    return { amount: centsToText(cents), open: row.open, number: row.number }
}

function without(payments: Payments, rowId: string): Payments {
    return Object.fromEntries(Object.entries(payments).filter(([id]) => id !== rowId))
}

// Empty text, or text that reads as zero in any currency's form ('0', '$0.00').
function isZeroText(text: string): boolean {
    return text.trim() === '' || parseMoney(text) === 0
}

// Ticking a row pays its open balance.
export function tickRow(payments: Payments, row: OutstandingRow): Payments {
    if (row.open <= 0) return without(payments, row.id)
    return { ...payments, [row.id]: entryOf(row, row.open) }
}

export function untickRow(payments: Payments, rowId: string): Payments {
    return without(payments, rowId)
}

// A typed payment: kept as typed (so the input is not reformatted under the cursor),
// removed at zero. Text that does not parse is kept, so the schema shows its message.
export function typeRowPayment(payments: Payments, row: OutstandingRow, text: string): Payments {
    if (isZeroText(text)) return without(payments, row.id)
    return { ...payments, [row.id]: { amount: text, open: row.open, number: row.number } }
}

// ⌥↵ in a Payment cell: an empty or zero row takes its open balance, a filled one clears.
export function toggleRow(payments: Payments, row: OutstandingRow, currency: string): Payments {
    const entry = payments[row.id]
    const isEmpty = !entry || moneyInputCents(entry.amount, currency) === 0
    return isEmpty ? tickRow(payments, row) : without(payments, row.id)
}

// Typed Amount received, spread over the rows in list order, each up to its open balance.
export function spreadAmount(rows: readonly OutstandingRow[], amountCents: number): Payments {
    const payments: Payments = {}
    let left = Math.max(0, amountCents)
    for (const row of rows) {
        if (left <= 0) break
        const cents = Math.min(left, row.open)
        if (cents <= 0) continue
        payments[row.id] = entryOf(row, cents)
        left -= cents
    }
    return payments
}

// Pay all (⌥A, the header tick box): every listed row for its open balance.
export function payAll(rows: readonly OutstandingRow[]): Payments {
    return rows.reduce<Payments>((payments, row) => tickRow(payments, row), {})
}

export function clearPayments(): Payments {
    return {}
}

// Every listed row pays above zero: the header tick box reads ticked, and pressing it
// clears every row.
export function isEveryRowPaid(
    rows: readonly OutstandingRow[],
    payments: Payments,
    currency: string
): boolean {
    return rows.length > 0 && rows.every(row => entryCents(payments[row.id], currency) > 0)
}

// Find invoice no. with a customer chosen: the rows whose number starts with the text
// (trimmed); an empty text keeps every row. It takes rows, never payments, so a hidden
// row keeps its payment.
export function filterRowsByNumber(
    rows: readonly OutstandingRow[],
    text: string
): OutstandingRow[] {
    const prefix = text.trim()
    if (prefix === '') return [...rows]
    return rows.filter(row => row.number.startsWith(prefix))
}

// Amount received while the user has not typed it: the text of Amount to apply, '' at 0.
export function followedAmount(payments: Payments, currency: string): string {
    const cents = amountToApply(payments, currency)
    return cents === 0 ? '' : centsToText(cents)
}
