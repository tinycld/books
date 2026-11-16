import { describe, expect, it } from 'vitest'
import {
    checkPlanText,
    nextStartCheckNo,
    payBillsWritePlan,
    writeOrder,
} from '../tinycld/books/lib/pay-bills-plan'
import type { PayBillsRow } from '../tinycld/books/lib/pay-bills-rows'
import type { PaymentEntry } from '../tinycld/books/lib/payment-values'

// What one Pay writes (spec §3.2, §3.5, §9): one payment per vendor in vendor display-name
// order (case-insensitive, then vendor id), each with its lines in list order, the check
// numbers counted from Starting check no. in that order, and the batch in reverse order.

const USD = 'USD'

const ZEPHYR = 'vendzephyr0001'
// Two vendors whose names differ only in case: the id orders them.
const ALDER_UPPER = 'vendalder00001'
const ALDER_LOWER = 'vendalder00002'
const BIRCH = 'vendbirch00001'

function row(
    id: string,
    number: string,
    vendor: string,
    party: string,
    open: number,
    due_date: string
): PayBillsRow {
    return { id, number, date: '2026-10-01', due_date, total: open, open, vendor, party, ref: '' }
}

// The list order the screen shows; the plan keeps it inside each vendor.
const ROWS: PayBillsRow[] = [
    row('billzephyr0002', '1007', ZEPHYR, 'Zephyr Power', 80_000, '2026-10-20'),
    row('billalderlow01', '1009', ALDER_LOWER, 'alder supply', 25_000, '2026-10-22'),
    row('billzephyr0001', '1003', ZEPHYR, 'Zephyr Power', 50_000, '2026-10-25'),
    row('billalderup001', '1005', ALDER_UPPER, 'Alder Supply', 125_050, '2026-10-28'),
    row('billbirch00001', '1011', BIRCH, 'Birch Co', 10_000, '2026-10-30'),
]

function entry(amount: string, open: number, number: string): PaymentEntry {
    return { amount, open, number }
}

const PAYMENTS: Record<string, PaymentEntry> = {
    billzephyr0002: entry('420.00', 80_000, '1007'),
    billalderlow01: entry('250.00', 25_000, '1009'),
    billzephyr0001: entry('500.00', 50_000, '1003'),
    billalderup001: entry('1,250.50', 125_050, '1005'),
    // A row at zero is not paid: Birch Co has no payment.
    billbirch00001: entry('0.00', 10_000, '1011'),
}

function plan(startCheckNo: string, method: 'check' | 'bank_transfer' = 'check') {
    return payBillsWritePlan({
        rows: ROWS,
        payments: PAYMENTS,
        currency: USD,
        startCheckNo,
        method,
    })
}

describe('payBillsWritePlan', () => {
    it('gives one payment per paid vendor in display-name order, case-insensitive, then id', () => {
        const vendors = plan('1050').vendors
        expect(vendors.map(v => v.vendor)).toEqual([ALDER_UPPER, ALDER_LOWER, ZEPHYR])
        expect(vendors.map(v => v.name)).toEqual(['Alder Supply', 'alder supply', 'Zephyr Power'])
    })

    it('leaves out a row at zero, and a vendor whose rows are all at zero', () => {
        const vendors = plan('1050').vendors
        expect(vendors.map(v => v.vendor)).not.toContain(BIRCH)
        const bills = vendors.flatMap(v => v.lines.map(line => line.bill))
        expect(bills).not.toContain('billbirch00001')
    })

    it('keeps each vendor’s lines in list order, with positions from 0 and amounts in cents', () => {
        const zephyr = plan('1050').vendors.find(v => v.vendor === ZEPHYR)
        expect(
            zephyr?.lines.map(({ bill, billNumber, amount, position }) => ({
                bill,
                billNumber,
                amount,
                position,
            }))
        ).toEqual([
            { bill: 'billzephyr0002', billNumber: '1007', amount: 42_000, position: 0 },
            { bill: 'billzephyr0001', billNumber: '1003', amount: 50_000, position: 1 },
        ])
        const alder = plan('1050').vendors.find(v => v.vendor === ALDER_UPPER)
        expect(alder?.lines.map(line => [line.bill, line.amount, line.position])).toEqual([
            ['billalderup001', 125_050, 0],
        ])
    })

    it('gives every payment and every line its own new record id', () => {
        const vendors = plan('1050').vendors
        const ids = [
            ...vendors.map(v => v.paymentId),
            ...vendors.flatMap(v => v.lines.map(line => line.id)),
        ]
        for (const id of ids) expect(id).toMatch(/^[a-z0-9]{15}$/)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('numbers the checks from the start, one per vendor in display-name order', () => {
        expect(plan('1050').vendors.map(v => v.reference_no)).toEqual(['1050', '1051', '1052'])
    })

    it('gives no check number when Starting check no. is empty', () => {
        expect(plan('').vendors.map(v => v.reference_no)).toEqual(['', '', ''])
    })

    it('gives no check number for a method other than Check, whatever the start', () => {
        expect(plan('1050', 'bank_transfer').vendors.map(v => v.reference_no)).toEqual(['', '', ''])
    })
})

describe('writeOrder', () => {
    // The last payment in a batch posts first (spec §9), so the batch carries the vendors
    // in reverse and the numbers follow display-name order. Each vendor's entry holds its
    // payment and then its lines.
    it('is the reverse vendor order, each payment with its lines', () => {
        const written = plan('1050')
        const order = writeOrder(written)
        expect(order.map(v => v.vendor)).toEqual([ZEPHYR, ALDER_LOWER, ALDER_UPPER])
        expect(order.map(v => v.paymentId)).toEqual(
            [...written.vendors].reverse().map(v => v.paymentId)
        )
        expect(order[0]?.lines.map(line => line.bill)).toEqual(['billzephyr0002', 'billzephyr0001'])
        // The plan itself stays in display-name order.
        expect(written.vendors.map(v => v.vendor)).toEqual([ALDER_UPPER, ALDER_LOWER, ZEPHYR])
    })
})

describe('nextStartCheckNo', () => {
    it('is the number after the last one a Pay & new used', () => {
        expect(nextStartCheckNo('1050', 3)).toBe('1053')
    })

    it('stays empty when the start was empty', () => {
        expect(nextStartCheckNo('', 3)).toBe('')
    })

    // The schema refuses the 10-digit result on the next Pay; this pins the arithmetic.
    it('counts past nine digits', () => {
        expect(nextStartCheckNo('999999999', 1)).toBe('1000000000')
    })

    it('keeps no leading zero', () => {
        expect(nextStartCheckNo('0099', 1)).toBe('100')
    })
})

describe('checkPlanText', () => {
    it('names each vendor with its check number in display-name order', () => {
        expect(checkPlanText(plan('1050'))).toBe(
            'Alder Supply gets check 1050, alder supply check 1051, Zephyr Power check 1052.'
        )
    })

    it('names one vendor alone', () => {
        const one = payBillsWritePlan({
            rows: ROWS,
            payments: { billzephyr0001: entry('500.00', 50_000, '1003') },
            currency: USD,
            startCheckNo: '1050',
            method: 'check',
        })
        expect(checkPlanText(one)).toBe('Zephyr Power gets check 1050.')
    })

    it('is empty with no starting number', () => {
        expect(checkPlanText(plan(''))).toBe('')
    })
})
