import { describe, expect, it } from 'vitest'
import { vendorCreditReadTotals } from '../tinycld/books/lib/vendor-credit-totals'

// The rows a vendor credit's read view draws after Total (vendor credit spec §3.5, vendor
// refund spec §3.9): on a posted credit, Applied (with a minus sign; only when part of the
// total is applied to bills), Refunded (with a minus sign; only when a posted vendor refund
// names the credit) and Unapplied credit (the stored balance). Applied is the total less
// the balance less what is refunded. The form, a draft and a void credit draw none. The
// second argument is the cents refunded by posted vendor refunds.

const MINUS = String.fromCharCode(0x2212)

function credit(status: string, total: number, balance: number) {
    return { status, total, balance, currency: 'USD' }
}

describe('vendorCreditReadTotals', () => {
    it('gives a draft and a void credit no rows', () => {
        expect(vendorCreditReadTotals(credit('draft', 5000, 0), 0)).toEqual([])
        expect(vendorCreditReadTotals(credit('void', 5000, 0), 0)).toEqual([])
        expect(vendorCreditReadTotals(credit('void', 5000, 5000), 0)).toEqual([])
        expect(vendorCreditReadTotals(credit('void', 50_000, 20_000), 12_000)).toEqual([])
    })

    it('gives a posted credit nothing is applied from only Unapplied credit, strong', () => {
        expect(vendorCreditReadTotals(credit('posted', 5000, 5000), 0)).toEqual([
            {
                label: 'Unapplied credit',
                amount: '$50.00',
                testId: 'vendor-credit-total-unapplied',
                isStrong: true,
            },
        ])
    })

    it('gives Applied with a minus sign (U+2212), then Unapplied credit, when part is applied', () => {
        const rows = vendorCreditReadTotals(credit('posted', 5000, 2000), 0)
        expect(rows.map(row => [row.label, row.amount, row.testId])).toEqual([
            ['Applied', `${MINUS}$30.00`, 'vendor-credit-total-applied'],
            ['Unapplied credit', '$20.00', 'vendor-credit-total-unapplied'],
        ])
        expect(rows[1]?.isStrong).toBe(true)
    })

    it('gives Applied of the whole total and Unapplied credit $0.00 at balance 0', () => {
        const rows = vendorCreditReadTotals(credit('posted', 5000, 0), 0)
        expect(rows.map(row => [row.label, row.amount, row.testId])).toEqual([
            ['Applied', `${MINUS}$50.00`, 'vendor-credit-total-applied'],
            ['Unapplied credit', '$0.00', 'vendor-credit-total-unapplied'],
        ])
        expect(rows[1]?.isStrong).toBe(true)
    })

    it('gives Applied (total − balance − refunded), Refunded with a minus sign, then Unapplied credit', () => {
        // $500.00 credit: $180.00 applied to bills, $120.00 refunded, $200.00 left.
        const rows = vendorCreditReadTotals(credit('posted', 50_000, 20_000), 12_000)
        expect(rows.map(row => [row.label, row.amount, row.testId])).toEqual([
            ['Applied', `${MINUS}$180.00`, 'vendor-credit-total-applied'],
            ['Refunded', `${MINUS}$120.00`, 'vendor-credit-refunded'],
            ['Unapplied credit', '$200.00', 'vendor-credit-total-unapplied'],
        ])
        expect(rows[2]?.isStrong).toBe(true)
        expect(rows[0]?.isStrong).toBeFalsy()
        expect(rows[1]?.isStrong).toBeFalsy()
    })

    it('gives a credit that is only refunded no Applied row', () => {
        // $300.00 credit, $120.00 refunded, nothing applied to a bill.
        const rows = vendorCreditReadTotals(credit('posted', 30_000, 18_000), 12_000)
        expect(rows.map(row => [row.label, row.amount, row.testId])).toEqual([
            ['Refunded', `${MINUS}$120.00`, 'vendor-credit-refunded'],
            ['Unapplied credit', '$180.00', 'vendor-credit-total-unapplied'],
        ])
    })

    it('gives a credit refunded in full Refunded of the whole total and Unapplied credit $0.00', () => {
        const rows = vendorCreditReadTotals(credit('posted', 30_000, 0), 30_000)
        expect(rows.map(row => [row.label, row.amount])).toEqual([
            ['Refunded', `${MINUS}$300.00`],
            ['Unapplied credit', '$0.00'],
        ])
    })

    it('gives no Refunded row when nothing is refunded', () => {
        const rows = vendorCreditReadTotals(credit('posted', 5000, 2000), 0)
        expect(rows.map(row => row.label)).not.toContain('Refunded')
        expect(rows.map(row => row.testId)).not.toContain('vendor-credit-refunded')
    })
})
