import type {
    BooksBillPaymentLines,
    BooksBillPayments,
    BooksBills,
} from '@tinycld/core/types/pbSchema'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
    BILL_PAYMENT_LINES,
    BILL_PAYMENT_SEED,
    BILL_PAYMENTS,
    type BillPaymentLineRecord,
    type BillPaymentRecord,
    PAY_BILLS_BILLS,
    PAY_BILLS_SEED_BILLS,
    type PayBillsBill,
} from '../tinycld/books/lib/pay-bills-fixture'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'

describe('generated bill payment types', () => {
    it('the fixture types are the generated types', () => {
        // tsc fails here until the migration and the generated types exist.
        expectTypeOf<PayBillsBill>().toEqualTypeOf<BooksBills>()
        expectTypeOf<BillPaymentRecord>().toEqualTypeOf<BooksBillPayments>()
        expectTypeOf<BillPaymentLineRecord>().toEqualTypeOf<BooksBillPaymentLines>()
        expectTypeOf<BooksBills['balance']>().toEqualTypeOf<number>()
    })
})

describe('the pay-bills fixture rows', () => {
    it('gives every payment a total equal to the sum of its lines', () => {
        for (const payment of BILL_PAYMENTS) {
            const sum = BILL_PAYMENT_LINES.filter(line => line.payment === payment.id).reduce(
                (total, line) => total + line.amount,
                0
            )
            expect(payment.total, payment.id).toBe(sum)
        }
    })

    it('gives every bill a balance of its total less the posted lines that name it', () => {
        const posted = new Set(BILL_PAYMENTS.filter(p => p.status === 'posted').map(p => p.id))
        for (const bill of PAY_BILLS_BILLS) {
            const paid = BILL_PAYMENT_LINES.filter(
                line => line.bill === bill.id && posted.has(line.payment)
            ).reduce((total, line) => total + line.amount, 0)
            expect(bill.balance, bill.id).toBe(bill.status === 'posted' ? bill.total - paid : 0)
        }
    })

    it('every id is 15 characters', () => {
        const ids = [
            ...PAY_BILLS_BILLS.map(row => row.id),
            ...BILL_PAYMENTS.map(row => row.id),
            ...BILL_PAYMENT_LINES.map(row => row.id),
        ]
        expect(ids.filter(id => id.length !== 15)).toEqual([])
    })

    it('has no draft: every payment is posted or void', () => {
        const statuses: string[] = BILL_PAYMENTS.map(row => row.status)
        expect(statuses.filter(status => status !== 'posted' && status !== 'void')).toEqual([])
        expect(PAY_BILLS_BILLS.filter(row => row.status === 'draft').map(row => row.id)).toEqual([])
    })
})

// The seed (seed.ts seedBills, then seedBillPayments) posts three more bills, memo
// `Seed bill <key>`, and pays them per BILL_PAYMENT_SEED (pay-bills spec §4.5).
describe('BILL_PAYMENT_SEED', () => {
    it('holds the partial payment and the void one', () => {
        expect(
            BILL_PAYMENT_SEED.map(row => ({
                key: row.key,
                amount: row.amount,
                payment_method: row.payment_method,
                reference_no: row.reference_no,
                paidFromNumber: row.paidFromNumber,
            }))
        ).toEqual([
            {
                key: 'partial',
                amount: 40_000,
                payment_method: 'check',
                reference_no: '1050',
                paidFromNumber: '1000',
            },
            {
                key: 'void',
                amount: 10_000,
                payment_method: 'bank_transfer',
                reference_no: '',
                paidFromNumber: '1000',
            },
        ])
    })

    // seedBillPayments finds each bill by memo among the bills PAY_BILLS_SEED_BILLS posts.
    it('names seeded bills only, each a different one', () => {
        const seededMemos = new Set(PAY_BILLS_SEED_BILLS.map(bill => bill.memo))
        const memos = BILL_PAYMENT_SEED.map(row => row.billMemo)
        expect(memos.filter(memo => !seededMemos.has(memo))).toEqual([])
        expect(new Set(memos).size).toBe(memos.length)
    })

    // A posted seed payment pays part of its bill; the void one pays nothing, so its
    // bill is fully open again. At least one seeded bill keeps its whole amount open.
    it('leaves at least one seeded posted bill unpaid', () => {
        const open = PAY_BILLS_SEED_BILLS.map(bill => {
            const paid = BILL_PAYMENT_SEED.filter(
                row => row.key !== 'void' && row.billMemo === bill.memo
            ).reduce((total, row) => total + row.amount, 0)
            return { memo: bill.memo, amount: bill.amount, open: bill.amount - paid }
        })
        for (const bill of open) {
            expect(bill.open, bill.memo).toBeGreaterThan(0)
        }
        const unpaid = open.filter(bill => bill.open === bill.amount).map(bill => bill.memo)
        expect(unpaid.length).toBeGreaterThan(0)
        const voidRow = BILL_PAYMENT_SEED.find(row => row.key === 'void')
        expect(voidRow && unpaid.includes(voidRow.billMemo)).toBe(true)
    })

    it('pays from a seed bank account on a real day', () => {
        const banks = new Set(
            SEED_ACCOUNTS.filter(account => account.type === 'bank').map(account => account.number)
        )
        for (const row of BILL_PAYMENT_SEED) {
            expect(banks.has(row.paidFromNumber), row.key).toBe(true)
            expect(row.date, row.key).toMatch(/^2026-\d{2}-\d{2}$/)
            expect(Number.isNaN(Date.parse(row.date)), row.key).toBe(false)
        }
    })
})
