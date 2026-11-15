import { formatMoney, maxStoredAmount, TOO_LARGE_TEXT } from './money'

const LOADING_TEXT = '—'
// U+2212, not the ASCII hyphen formatMoney writes for a negative amount.
const MINUS = '−'

export interface BalanceFigures {
    openText: string
    openLabel: 'Open' | 'Credit'
    overdueText: string
}

function isTooLarge(cents: number) {
    return Math.abs(cents) > maxStoredAmount
}

function overdueText(overdue: number | null, currency: string) {
    if (overdue === null) return LOADING_TEXT
    if (isTooLarge(overdue)) return TOO_LARGE_TEXT
    return formatMoney(overdue, currency)
}

function openText(open: number | null, currency: string) {
    if (open === null) return LOADING_TEXT
    if (isTooLarge(open)) return TOO_LARGE_TEXT
    if (open < 0) return MINUS + formatMoney(Math.abs(open), currency)
    return formatMoney(open, currency)
}

// The customer page's Open and Overdue figures. A figure still loading (`null`) reads
// "—"; a credit (a negative Open) reads "−$120.00" under the label Credit.
export function balanceFigures({
    open,
    overdue,
    currency,
}: {
    open: number | null
    overdue: number | null
    currency: string
}): BalanceFigures {
    return {
        openText: openText(open, currency),
        openLabel: open !== null && open < 0 ? 'Credit' : 'Open',
        overdueText: overdueText(overdue, currency),
    }
}

// The sum of the overdue invoices' totals, in cents.
export function overdueCents(rows: readonly { total: number }[]): number {
    return rows.reduce((sum, row) => sum + row.total, 0)
}
