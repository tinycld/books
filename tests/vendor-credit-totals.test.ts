import { describe, expect, it } from 'vitest'
import { vendorCreditReadTotals } from '../tinycld/books/lib/vendor-credit-totals'

// The rows a vendor credit's read view draws after Total (vendor credit spec §3.5): on a
// posted credit, Applied (with a minus sign; only when part of the total is applied) and
// Unapplied credit (the stored balance). The form, a draft and a void credit draw none.

const MINUS = String.fromCharCode(0x2212)

function credit(status: string, total: number, balance: number) {
    return { status, total, balance, currency: 'USD' }
}

describe('vendorCreditReadTotals', () => {
    it('gives a draft and a void credit no rows', () => {
        expect(vendorCreditReadTotals(credit('draft', 5000, 0))).toEqual([])
        expect(vendorCreditReadTotals(credit('void', 5000, 0))).toEqual([])
        expect(vendorCreditReadTotals(credit('void', 5000, 5000))).toEqual([])
    })

    it('gives a posted credit nothing is applied from only Unapplied credit, strong', () => {
        expect(vendorCreditReadTotals(credit('posted', 5000, 5000))).toEqual([
            {
                label: 'Unapplied credit',
                amount: '$50.00',
                testId: 'vendor-credit-total-unapplied',
                isStrong: true,
            },
        ])
    })

    it('gives Applied with a minus sign (U+2212), then Unapplied credit, when part is applied', () => {
        const rows = vendorCreditReadTotals(credit('posted', 5000, 2000))
        expect(rows.map(row => [row.label, row.amount, row.testId])).toEqual([
            ['Applied', `${MINUS}$30.00`, 'vendor-credit-total-applied'],
            ['Unapplied credit', '$20.00', 'vendor-credit-total-unapplied'],
        ])
        expect(rows[1]?.isStrong).toBe(true)
    })

    it('gives Applied of the whole total and Unapplied credit $0.00 at balance 0', () => {
        const rows = vendorCreditReadTotals(credit('posted', 5000, 0))
        expect(rows.map(row => [row.label, row.amount, row.testId])).toEqual([
            ['Applied', `${MINUS}$50.00`, 'vendor-credit-total-applied'],
            ['Unapplied credit', '$0.00', 'vendor-credit-total-unapplied'],
        ])
        expect(rows[1]?.isStrong).toBe(true)
    })
})
