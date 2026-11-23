// The figures of the dashboard widgets (spec docs/specs/dashboard-design.md §3), summed
// in integer cents from the rows of their live reads.

import type { AccountRow } from '../hooks/useAccountsQuery'
import type { BooksInvoiceDueTotals, BooksPaymentDayTotals } from '../types'
import { addExact, ownBalance } from './account-tree'
import { addDays } from './document-dates'
import { amountText, formatMoney, TOO_LARGE_TEXT } from './money'

// With Hide amounts on, every money figure is this fixed text, whatever the amount.
export const MASK = '•••••'
export const MASKED_PERCENT = '••%'

// Every dashboard amount: zero draws as the currency's zero (a figure that leads a card
// is never blank), and an amount Books cannot hold exactly (null) as TOO_LARGE_TEXT.
export function dashboardAmount(cents: number | null, currency: string, hideAmounts: boolean) {
    if (hideAmounts) return MASK
    if (cents === null) return TOO_LARGE_TEXT
    return amountText(cents, currency) || formatMoney(0, currency)
}

// The tone of a dashboard amount: an amount Books cannot hold exactly (null) draws in the
// danger tone, except under the mask, whose look must not tell anything about the amount.
export function dashboardTone(cents: number | null, hideAmounts: boolean): 'normal' | 'danger' {
    return cents === null && !hideAmounts ? 'danger' : 'normal'
}

export function dashboardPercent(percent: number, hideAmounts: boolean) {
    return hideAmounts ? MASKED_PERCENT : `${percent}%`
}

export type Loadable<T> =
    | { status: 'ready'; model: T }
    | { status: 'loading' }
    | { status: 'error' }

// Every amount of a model is in integer cents.
export interface InvoicesModel {
    isEmpty: boolean
    unpaid: number
    overdue: number
    notDue: number
    overdueCount: number
    paidLast30Days: number
    // The balance of the Undeposited funds accounts; the line shows only when not zero.
    // Null when Books cannot hold it exactly.
    waitingToDeposit: number | null
}

// The first day of "Paid, last 30 days": today and the 29 days before it. A day that is
// not an ISO day has no window before it, so the window is today alone.
export function paidWindowStart(today: string): string {
    return addDays(today, -29) ?? today
}

export function invoicesModel(input: {
    dueTotals: readonly Pick<BooksInvoiceDueTotals, 'due_date' | 'balance' | 'count'>[]
    paymentTotals: readonly Pick<BooksPaymentDayTotals, 'date' | 'amount'>[]
    undepositedCents: number | null
    today: string
}): InvoicesModel {
    const { dueTotals, paymentTotals, undepositedCents, today } = input
    let overdue = 0
    let notDue = 0
    let overdueCount = 0
    for (const row of dueTotals) {
        if (row.due_date < today) {
            overdue += row.balance
            overdueCount += row.count
        } else {
            notDue += row.balance
        }
    }
    const windowStart = paidWindowStart(today)
    const paidRows = paymentTotals.filter(row => row.date >= windowStart && row.date <= today)
    const paidLast30Days = paidRows.reduce((sum, row) => sum + row.amount, 0)
    return {
        // The view holds only invoices with an open balance, so no row is nothing unpaid.
        isEmpty: dueTotals.length === 0 && paidRows.length === 0,
        unpaid: overdue + notDue,
        overdue,
        notDue,
        overdueCount,
        paidLast30Days,
        waitingToDeposit: undepositedCents,
    }
}

// The balance of the active Undeposited funds accounts; null when one balance, or the
// sum, is past the range where a number holds every cent.
export function undepositedBalance(accounts: readonly AccountRow[]): number | null {
    let total: number | null = 0
    for (const account of accounts) {
        if (account.inactive || account.detail_type !== 'undeposited_funds') continue
        total = addExact(total, ownBalance(account.type, account.debit_total, account.credit_total))
    }
    return total
}
