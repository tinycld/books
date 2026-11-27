import { describe, expect, it } from 'vitest'
import { BILL_DOCUMENT } from '../tinycld/books/components/documents/document-kinds'
import type { DocumentRecord } from '../tinycld/books/hooks/document-data'
import { BILL_IDS, BILLS } from '../tinycld/books/lib/bill-form-fixture'
import { billCreditsApplied, billReadTotals } from '../tinycld/books/lib/bill-values'
import { VENDOR_CREDIT_APPLICATION } from '../tinycld/books/lib/credit-application-kinds'
import { totalRowOrder } from '../tinycld/books/lib/document-total-rows'
import { vendorCreditReadTotals } from '../tinycld/books/lib/vendor-credit-totals'

// The rows a bill's read view draws between its Payments row and Balance due (vendor credit
// spec §3.10, checkpoint 5): "Credits applied" with a minus sign while a vendor credit is
// applied to the bill, and nothing while none is. `applied` is the sum of the bill's credit
// applications, which the read view reads because the bill sets `readApplications`.

const MINUS = String.fromCharCode(0x2212)

// The posted Summit bill of the fixture as the read view holds it.
function postedBill(): DocumentRecord {
    const row = BILLS.find(bill => bill.id === BILL_IDS.summit)
    if (!row) throw new Error('no posted Summit bill in the fixture')
    return {
        ...row,
        customer: '',
        bill_to: null,
        email: '',
        tax_rate: '',
        message: '',
        tax_total: 0,
        kindFields: {
            kind: 'bill',
            vendor: row.vendor,
            terms: row.terms,
            due_date: row.due_date,
            ref_no: row.ref_no,
            mailing_address: row.mailing_address,
            purchase_order: row.purchase_order,
            vendorRow: undefined,
            orderRow: undefined,
            balance: row.balance,
        },
        postedBy: undefined,
        voidedBy: undefined,
        taxRateRow: undefined,
    }
}

describe('billReadTotals', () => {
    it('gives no row while no credit is applied, so the totals are as before', () => {
        expect(billReadTotals({ currency: 'USD' }, { applied: 0 })).toEqual([])
    })

    it('gives Credits applied with a minus sign (U+2212) and the test id bill-total-credits', () => {
        const rows = billReadTotals({ currency: 'USD' }, { applied: 3_000 })
        expect(rows.map(row => [row.label, row.amount, row.testId])).toEqual([
            ['Credits applied', `${MINUS}$30.00`, 'bill-total-credits'],
        ])
    })

    it('formats the applied sum in the bill currency, with thousands', () => {
        const rows = billReadTotals({ currency: 'USD' }, { applied: 123_456 })
        expect(rows.map(row => row.amount)).toEqual([`${MINUS}$1,234.56`])
    })
})

// The credit applied to a bill, read from the stored record (plan Do 1: "so no Balance due
// shows without its Credits applied row"): for a posted bill it is total - payments - stored
// balance, so Total, Payments, Credits applied and Balance due add up; a draft or a void bill
// has no open balance and so no credit row.
describe('billCreditsApplied', () => {
    it('gives total less the stored balance for a posted bill with no payments', () => {
        expect(billCreditsApplied({ status: 'posted', total: 10_000, balance: 7_000 }, 0)).toBe(
            3_000
        )
    })

    it('gives total less payments less the stored balance for a posted bill with payments', () => {
        expect(billCreditsApplied({ status: 'posted', total: 10_000, balance: 5_000 }, 2_000)).toBe(
            3_000
        )
    })

    it('gives 0 for a posted bill paid by payments only', () => {
        expect(billCreditsApplied({ status: 'posted', total: 10_000, balance: 0 }, 10_000)).toBe(0)
        expect(billCreditsApplied({ status: 'posted', total: 10_000, balance: 4_000 }, 6_000)).toBe(
            0
        )
    })

    it('gives 0 for a draft bill and for a void bill', () => {
        expect(billCreditsApplied({ status: 'draft', total: 10_000, balance: 0 }, 0)).toBe(0)
        expect(billCreditsApplied({ status: 'draft', total: 10_000, balance: 7_000 }, 0)).toBe(0)
        expect(billCreditsApplied({ status: 'void', total: 10_000, balance: 0 }, 0)).toBe(0)
        expect(billCreditsApplied({ status: 'void', total: 10_000, balance: 7_000 }, 0)).toBe(0)
    })

    it('is never negative', () => {
        expect(
            billCreditsApplied({ status: 'posted', total: 10_000, balance: 10_000 }, 2_000)
        ).toBe(0)
        expect(billCreditsApplied({ status: 'posted', total: 10_000, balance: 12_000 }, 0)).toBe(0)
    })

    it('feeds billReadTotals a Credits applied row that adds up to Balance due', () => {
        const record = { status: 'posted', total: 10_000, balance: 5_000, currency: 'USD' }
        const applied = billCreditsApplied(record, 2_000)
        expect(billReadTotals(record, { applied }).map(row => [row.testId, row.amount])).toEqual([
            ['bill-total-credits', `${MINUS}$30.00`],
        ])
    })
})

describe('BILL_DOCUMENT', () => {
    it('reads its applications, so the read view passes their sum as `applied`', () => {
        expect(BILL_DOCUMENT.readApplications).toBe(VENDOR_CREDIT_APPLICATION)
    })

    it('draws the Credits applied row by billReadTotals', () => {
        const record = postedBill()
        expect(BILL_DOCUMENT.readTotals?.(record, { applied: 0 })).toEqual([])
        expect(BILL_DOCUMENT.readTotals?.(record, { applied: 3_000 })).toEqual(
            billReadTotals(record, { applied: 3_000 })
        )
        expect(
            BILL_DOCUMENT.readTotals?.(record, { applied: 3_000 })?.map(row => row.testId)
        ).toEqual(['bill-total-credits'])
    })
})

// The rows DocumentTotalsPanel draws from Total down, in order (checkpoint 5): Total, the
// Payments row, the kind's `after` rows, then the kind's last row; a kind with no last row
// (the vendor credit) draws Total, then its `after` rows.
describe('totalRowOrder', () => {
    const billTotal = { label: 'Total', amount: '$100.00', testId: 'bill-total', isStrong: true }
    const billPayments = {
        label: 'Payments',
        amount: `${MINUS}$20.00`,
        testId: 'bill-total-payments',
    }
    const balanceDue = {
        label: 'Balance due',
        amount: '$50.00',
        testId: 'bill-total-balance',
        isStrong: true,
    }

    it('draws Total, Payments, Credits applied, Balance due for a bill with a payment and an application', () => {
        const rows = totalRowOrder({
            total: billTotal,
            payments: billPayments,
            after: billReadTotals({ currency: 'USD' }, { applied: 3_000 }),
            last: balanceDue,
        })
        expect(rows.map(row => [row.label, row.testId])).toEqual([
            ['Total', 'bill-total'],
            ['Payments', 'bill-total-payments'],
            ['Credits applied', 'bill-total-credits'],
            ['Balance due', 'bill-total-balance'],
        ])
        expect(rows.map(row => row.amount)).toEqual([
            '$100.00',
            `${MINUS}$20.00`,
            `${MINUS}$30.00`,
            '$50.00',
        ])
    })

    it('draws Total, Credits applied, Balance due for a bill with no payments row', () => {
        const rows = totalRowOrder({
            total: billTotal,
            payments: null,
            after: billReadTotals({ currency: 'USD' }, { applied: 3_000 }),
            last: { ...balanceDue, amount: '$70.00' },
        })
        expect(rows.map(row => [row.label, row.testId, row.amount])).toEqual([
            ['Total', 'bill-total', '$100.00'],
            ['Credits applied', 'bill-total-credits', `${MINUS}$30.00`],
            ['Balance due', 'bill-total-balance', '$70.00'],
        ])
    })

    it('draws Total, Payments, Balance due for a bill with no application, as before', () => {
        const rows = totalRowOrder({
            total: billTotal,
            payments: billPayments,
            after: billReadTotals({ currency: 'USD' }, { applied: 0 }),
            last: { ...balanceDue, amount: '$80.00' },
        })
        expect(rows.map(row => row.testId)).toEqual([
            'bill-total',
            'bill-total-payments',
            'bill-total-balance',
        ])
    })

    it('draws Total, Applied, Unapplied credit for a kind with no last row (the vendor credit)', () => {
        const rows = totalRowOrder({
            total: {
                label: 'Total',
                amount: '$50.00',
                testId: 'vendor-credit-total',
                isStrong: true,
            },
            payments: null,
            after: vendorCreditReadTotals(
                {
                    status: 'posted',
                    total: 5_000,
                    balance: 2_000,
                    currency: 'USD',
                },
                0
            ),
            last: null,
        })
        expect(rows.map(row => [row.label, row.testId, row.amount])).toEqual([
            ['Total', 'vendor-credit-total', '$50.00'],
            ['Applied', 'vendor-credit-total-applied', `${MINUS}$30.00`],
            ['Unapplied credit', 'vendor-credit-total-unapplied', '$20.00'],
        ])
    })
})
