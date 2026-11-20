// The open-bills list of Pay Bills (spec §3.3): the Vendor and Due filters (screen state,
// hooks/usePayBillsForm.ts), the order and the header sorts, the paid rows a filter
// hides, and the Vendor filter's options. Pure.

import type { OutstandingSort } from './outstanding-documents'
import { entryCents, type OutstandingRow, type Payments } from './payment-allocation'

// Any time; Overdue: due before today; Due in 7 days: due on or before today + 7.
export type DueFilter = 'any' | 'overdue' | 'week'

// An open bill as the list shows it: `vendor` is the vendor's id, `party` its display
// name, `ref` the vendor's bill no.
export type PayBillsRow = OutstandingRow & { vendor: string; party: string; ref: string }

export type PayBillsSort = OutstandingSort

// Due date ascending, then bill number (spec §3.3 Order).
export const DEFAULT_PAY_BILLS_SORT: PayBillsSort = { column: 'due', descending: false }

const WEEK_DAYS = 7

function dayOf(text: string): string {
    return text.slice(0, 10)
}

// An ISO day plus `days`, as an ISO day.
function addDays(day: string, days: number): string {
    const [year, month, date] = day.split('-').map(Number)
    const moved = new Date(Date.UTC(2000, 0, 1))
    moved.setUTCFullYear(year, month - 1, date + days)
    const pad = (value: number, width: number) => String(value).padStart(width, '0')
    return `${pad(moved.getUTCFullYear(), 4)}-${pad(moved.getUTCMonth() + 1, 2)}-${pad(moved.getUTCDate(), 2)}`
}

function isDueKept(row: PayBillsRow, due: DueFilter, today: string): boolean {
    if (due === 'any') return true
    const dueDate = dayOf(row.due_date)
    if (dueDate === '') return false
    if (due === 'overdue') return dueDate < today
    return dueDate <= addDays(today, WEEK_DAYS)
}

/**
 * The rows the filters keep, in the order given. `vendor` is a vendor id, '' for All
 * vendors. A row in `keep` (a row with a refusal under its cell) is never hidden.
 */
export function filterPayBillsRows(
    rows: readonly PayBillsRow[],
    filters: { vendor: string; due: DueFilter; today: string; keep: readonly string[] }
): PayBillsRow[] {
    const keep = new Set(filters.keep)
    return rows.filter(row => {
        if (keep.has(row.id)) return true
        if (filters.vendor !== '' && row.vendor !== filters.vendor) return false
        return isDueKept(row, filters.due, filters.today)
    })
}

// Names compare case-insensitively by code point, the same on web and native.
export function compareNames(a: string, b: string): number {
    const left = a.toLowerCase()
    const right = b.toLowerCase()
    if (left === right) return 0
    return left < right ? -1 : 1
}

// Ids and ISO days compare by code point.
export function compareText(a: string, b: string): number {
    if (a === b) return 0
    return a < b ? -1 : 1
}

// Document numbers are digits, so a shorter number is the smaller one.
export function compareNumbers(a: string, b: string): number {
    return a.length - b.length || compareText(a, b)
}

function compareDue(a: PayBillsRow, b: PayBillsRow): number {
    return compareText(dayOf(a.due_date), dayOf(b.due_date))
}

function compareRows(a: PayBillsRow, b: PayBillsRow, sort: PayBillsSort): number {
    const first =
        sort.column === 'vendor'
            ? compareNames(a.party, b.party) || compareText(a.vendor, b.vendor) || compareDue(a, b)
            : compareDue(a, b)
    return first || compareNumbers(a.number, b.number) || compareText(a.id, b.id)
}

// The rows in the sort's order (a new array): by due date, or by vendor display name then
// due date; then bill number. Descending reverses the whole order.
export function sortPayBillsRows(rows: readonly PayBillsRow[], sort: PayBillsSort): PayBillsRow[] {
    const sign = sort.descending ? -1 : 1
    return [...rows].sort((a, b) => sign * compareRows(a, b, sort))
}

// The rows with a payment that the filters hide: they keep their payment and count in the
// totals, and the summary names how many (spec §3.3 Selection).
export function hiddenPaidCount(
    all: readonly PayBillsRow[],
    shown: readonly PayBillsRow[],
    payments: Payments,
    currency: string
): number {
    const shownIds = new Set(shown.map(row => row.id))
    return all.filter(row => !shownIds.has(row.id) && entryCents(payments[row.id], currency) > 0)
        .length
}

export type PayBillsVendorOption = { id: string; label: string }

/**
 * The Vendor filter's options: every active vendor, and every vendor with an open bill (an
 * inactive vendor does not block a payment, so its open bills are listed and must be
 * filterable), an inactive one labelled "<name> (inactive)". By display name.
 */
export function payBillsVendorOptions(
    vendors: readonly { id: string; display_name: string; inactive: boolean }[],
    openBillVendorIds: readonly string[]
): PayBillsVendorOption[] {
    const withOpenBill = new Set(openBillVendorIds)
    return vendors
        .filter(vendor => !vendor.inactive || withOpenBill.has(vendor.id))
        .sort((a, b) => compareNames(a.display_name, b.display_name) || compareText(a.id, b.id))
        .map(vendor => ({
            id: vendor.id,
            label: vendor.inactive ? `${vendor.display_name} (inactive)` : vendor.display_name,
        }))
}
