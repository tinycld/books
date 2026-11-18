import { describe, expect, it } from 'vitest'
import { mergeOutstanding } from '../tinycld/books/hooks/useOutstandingInvoices'
import {
    BILL_PAYMENT_IDS,
    BILL_PAYMENTS,
    linesOf,
    PAY_BILLS_BILL_IDS,
    PAY_BILLS_BILLS,
    PAY_BILLS_TODAY,
    type PayBillsBill,
} from '../tinycld/books/lib/pay-bills-fixture'
import type { PayBillsRow } from '../tinycld/books/lib/pay-bills-rows'
import {
    correctionPayBillsValues,
    correctionReferenceNo,
    newPayBillsValues,
} from '../tinycld/books/lib/pay-bills-values'

// The Pay Bills form's start values (spec §3.2–§3.6): a new screen with `?bill=`, and a
// correction (`?replaces=<id>`) that starts from its posted original.

const PAID_FROM = 'acctfix1000chk1'

// A posted bill payment of the fixture as stored: `paid_from` is an account id.
function postedPayment(id: string) {
    const row = BILL_PAYMENTS.find(p => p.id === id)
    if (row?.status !== 'posted') throw new Error(`no posted bill payment ${id} in the fixture`)
    const { paid_from_number: _number, ...payment } = row
    return { ...payment, paid_from: PAID_FROM }
}

function billOf(id: string): PayBillsBill {
    const bill = PAY_BILLS_BILLS.find(row => row.id === id)
    if (!bill) throw new Error(`no bill ${id} in the fixture`)
    return bill
}

// The list a correction shows (spec §3.3, §4.4): the vendor's open bills, then each bill the
// original pays that the open set no longer holds, merged by bill id through
// mergeOutstanding; a row's open amount is its balance plus what the original paid on it.
function correctionRows(paymentId: string, vendor: string): PayBillsRow[] {
    const lines = linesOf(paymentId)
    const asOutstanding = (bill: PayBillsBill) => ({
        id: bill.id,
        number: bill.number,
        date: bill.date,
        due_date: bill.due_date,
        total: bill.total,
        balance: bill.balance,
        party: bill.vendor,
        ref: bill.ref_no,
    })
    const open = PAY_BILLS_BILLS.filter(
        bill => bill.vendor === vendor && bill.status === 'posted' && bill.balance > 0
    ).map(asOutstanding)
    const stored = lines.map(line => asOutstanding(billOf(line.bill)))
    const extraOpen = Object.fromEntries(lines.map(line => [line.bill, line.amount]))
    return mergeOutstanding(open, stored, vendor, extraOpen).map(row => {
        const bill = billOf(row.id)
        return { ...row, vendor: bill.vendor, party: 'Vendor', ref: bill.ref_no }
    })
}

function correctionOf(paymentId: string) {
    const payment = postedPayment(paymentId)
    return correctionPayBillsValues({
        payment,
        lines: linesOf(paymentId),
        rows: correctionRows(paymentId, payment.vendor),
    })
}

describe('correctionPayBillsValues', () => {
    it('fills Paid from, the date, the method and the payment’s own Ref no.', () => {
        const payment = postedPayment(BILL_PAYMENT_IDS.partial)
        expect(correctionOf(BILL_PAYMENT_IDS.partial)).toMatchObject({
            paid_from: PAID_FROM,
            date: payment.date,
            payment_method: 'bank_transfer',
            reference_no: 'ACH 5520-118',
        })
        expect(correctionOf(BILL_PAYMENT_IDS.paidInFull)).toMatchObject({
            paid_from: PAID_FROM,
            payment_method: 'check',
            reference_no: '1042',
        })
    })

    it('pays each original line for its amount, a partly paid bill open for balance plus it', () => {
        // Payment 1002 paid 500.00 of Summit's bill 1006, whose balance is now 480.00.
        expect(correctionOf(BILL_PAYMENT_IDS.partial).payments).toEqual({
            [PAY_BILLS_BILL_IDS.summitPartly]: { amount: '500.00', open: 98_000, number: '1006' },
        })
    })

    it('opens a bill the original paid off for the amount the original paid on it', () => {
        // Payment 1001 paid bills 1009 and 1010 in full: both are at zero now. Office Supply
        // World's open bill 1005 is listed too, but the original did not pay it.
        expect(correctionOf(BILL_PAYMENT_IDS.paidInFull).payments).toEqual({
            [PAY_BILLS_BILL_IDS.officePaidA]: { amount: '187.50', open: 18_750, number: '1009' },
            [PAY_BILLS_BILL_IDS.officePaidB]: { amount: '325.00', open: 32_500, number: '1010' },
        })
    })
})

// The Ref no. a correction is saved with (spec §3.2: the field is Check no. only while the
// method is Check). A Check no. hidden by a method change must not be stored.
describe('correctionReferenceNo', () => {
    it('saves the typed Check no. when the method is Check', () => {
        expect(
            correctionReferenceNo({
                method: 'check',
                typed: '1077',
                original: { payment_method: 'check', reference_no: '1042' },
            })
        ).toBe('1077')
        expect(
            correctionReferenceNo({
                method: 'check',
                typed: '2001',
                original: { payment_method: 'bank_transfer', reference_no: 'ACH 5520-118' },
            })
        ).toBe('2001')
    })

    it('saves no Ref no. when a Check original is saved with another method', () => {
        expect(
            correctionReferenceNo({
                method: 'bank_transfer',
                typed: '1042',
                original: { payment_method: 'check', reference_no: '1042' },
            })
        ).toBe('')
    })

    it('keeps the original’s Ref no. when neither the original nor the correction is Check', () => {
        expect(
            correctionReferenceNo({
                method: 'cash',
                typed: 'ACH 5520-118',
                original: { payment_method: 'bank_transfer', reference_no: 'ACH 5520-118' },
            })
        ).toBe('ACH 5520-118')
        // The hidden field may hold another text; the original's Ref no. still wins.
        expect(
            correctionReferenceNo({
                method: 'bank_transfer',
                typed: '',
                original: { payment_method: 'bank_transfer', reference_no: 'ACH 5520-118' },
            })
        ).toBe('ACH 5520-118')
    })
})

describe('newPayBillsValues', () => {
    it('pays the bill of `?bill=` for its open amount', () => {
        const bill = billOf(PAY_BILLS_BILL_IDS.officePartly)
        const row: PayBillsRow = {
            id: bill.id,
            number: bill.number,
            date: bill.date,
            due_date: bill.due_date,
            total: bill.total,
            open: bill.balance,
            vendor: bill.vendor,
            party: 'Office Supply World',
            ref: bill.ref_no,
        }
        const values = newPayBillsValues({
            paidFrom: PAID_FROM,
            method: 'check',
            today: PAY_BILLS_TODAY,
            billId: bill.id,
            rows: [row],
        })
        expect(values.payments).toEqual({
            [bill.id]: { amount: '530.00', open: 53_000, number: '1005' },
        })
        expect(values).toMatchObject({
            paid_from: PAID_FROM,
            date: PAY_BILLS_TODAY,
            payment_method: 'check',
            reference_no: '',
        })
    })
})

// The merge carries each document's own no. (`ref`), so a screen needs no second map back
// from the stored documents to show it.
describe('mergeOutstanding', () => {
    it('keeps the ref of an open document and of a stored one the open set no longer holds', () => {
        const open = [
            {
                id: 'billopen0000001',
                number: '1003',
                date: '2026-10-01 00:00:00.000Z',
                due_date: '2026-10-31 00:00:00.000Z',
                total: 40_000,
                balance: 15_000,
                party: 'vendor000000001',
                ref: 'INV-77',
            },
        ]
        const stored = [
            {
                id: 'billpaid0000001',
                number: '1004',
                date: '2026-10-02 00:00:00.000Z',
                due_date: '2026-11-01 00:00:00.000Z',
                total: 25_000,
                balance: 0,
                party: 'vendor000000001',
                ref: 'CM-8841',
            },
        ]
        const rows = mergeOutstanding(open, stored, 'vendor000000001', {
            billpaid0000001: 25_000,
        })
        expect(rows.map(row => [row.id, row.ref, row.open])).toEqual([
            ['billopen0000001', 'INV-77', 15_000],
            ['billpaid0000001', 'CM-8841', 25_000],
        ])
    })
})
