import { describe, expect, it } from 'vitest'
import { maxStoredAmount, TOO_LARGE_TEXT } from '../tinycld/books/lib/money'
import { balanceFigures, overdueCents } from '../tinycld/books/lib/party-balance'

// The customer page's Open and Overdue figures (spec §3.2): the text and the label the
// header shows for a loading, zero, credit, ordinary and too large balance.

const USD = 'USD'

describe('balanceFigures', () => {
    it('shows "—" for both figures while they load', () => {
        expect(balanceFigures({ open: null, overdue: null, currency: USD })).toEqual({
            openText: '—',
            openLabel: 'Open',
            overdueText: '—',
        })
    })

    it('shows $0.00 with the label Open for a zero balance', () => {
        expect(balanceFigures({ open: 0, overdue: 0, currency: USD })).toEqual({
            openText: '$0.00',
            openLabel: 'Open',
            overdueText: '$0.00',
        })
    })

    it('shows a credit with a minus sign (U+2212) and the label Credit', () => {
        const figures = balanceFigures({ open: -12000, overdue: 0, currency: USD })
        expect(figures.openText).toBe('−$120.00')
        expect(figures.openText.startsWith('-')).toBe(false)
        expect(figures.openLabel).toBe('Credit')
    })

    it('formats an ordinary balance with grouping and cents', () => {
        expect(balanceFigures({ open: 2781865, overdue: 2781865, currency: USD })).toEqual({
            openText: '$27,818.65',
            openLabel: 'Open',
            overdueText: '$27,818.65',
        })
    })

    it('shows the too-large text for a figure above maxStoredAmount', () => {
        const over = maxStoredAmount + 1
        const figures = balanceFigures({ open: over, overdue: over, currency: USD })
        expect(figures.openText).toBe(TOO_LARGE_TEXT)
        expect(figures.overdueText).toBe(TOO_LARGE_TEXT)
        expect(balanceFigures({ open: -over, overdue: 0, currency: USD }).openText).toBe(
            TOO_LARGE_TEXT
        )
    })

    it('shows one figure loading while the other is known', () => {
        expect(balanceFigures({ open: 0, overdue: null, currency: USD })).toEqual({
            openText: '$0.00',
            openLabel: 'Open',
            overdueText: '—',
        })
    })
})

describe('overdueCents', () => {
    // Receive payment §3.9: Overdue sums the open balance, not the total, so a part
    // payment lowers it.
    it('sums the open balances of the overdue invoices', () => {
        expect(overdueCents([{ balance: 10000 }, { balance: 25000 }, { balance: 1 }])).toBe(35001)
    })

    it('reads the balance, not the total, of a part-paid invoice row', () => {
        const rows = [
            { total: 50000, balance: 10000 },
            { total: 300, balance: 1 },
        ]
        expect(overdueCents(rows)).toBe(10001)
    })

    it('is 0 for no invoices', () => {
        expect(overdueCents([])).toBe(0)
    })
})
