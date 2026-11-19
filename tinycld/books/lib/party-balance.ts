import { formatMoney, MINUS, maxStoredAmount, TOO_LARGE_TEXT } from './money'
import type { DocumentPartyKey } from './sales-document-kinds'

export interface PartyBalanceSources {
    // The column of books_party_balances that names the party.
    balanceField: DocumentPartyKey
    // The party's documents whose open balance is Overdue: invoices for a customer (A/R),
    // bills for a vendor (A/P).
    overdueCollection: 'books_invoices' | 'books_bills'
    // The column of overdueCollection that names the party.
    overdueField: DocumentPartyKey
}

// Where the party page's balance reads (vendor-pages spec §3.2).
export function partyBalanceSources(party: DocumentPartyKey): PartyBalanceSources {
    if (party === 'customer') {
        return {
            balanceField: 'customer',
            overdueCollection: 'books_invoices',
            overdueField: 'customer',
        }
    }
    return { balanceField: 'vendor', overdueCollection: 'books_bills', overdueField: 'vendor' }
}

const LOADING_TEXT = '—'

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

// The sum of the overdue invoices' open balances, in cents (receive-payment spec §3.9),
// so a part payment lowers it. The rows are the overdue query's invoices.
export function overdueCents(rows: readonly { balance: number }[]): number {
    return rows.reduce((sum, row) => sum + row.balance, 0)
}
