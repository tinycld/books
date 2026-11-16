import { describe, expect, it } from 'vitest'
import { centsToText, maxStoredAmount } from '../tinycld/books/lib/money-text'
import { payBillsSchema } from '../tinycld/books/lib/pay-bills-schema'
import type { PayBillsFormValues } from '../tinycld/books/lib/pay-bills-values'
import { PAYMENT_MESSAGES } from '../tinycld/books/lib/payment-texts'

// The one zod schema of Pay and Save (spec §3.5): the header fields, Starting check no.
// (new) or Check no. (`replaces`), each row against its open amount, at least one row paid,
// and the total under the stored-amount limit.

const USD = 'USD'
const BILL_A = 'billpacific0001'
const BILL_B = 'billoffice00001'

const OPEN_BY_BILL = { [BILL_A]: 125_000, [BILL_B]: 53_000 }

// A valid new Pay: from a bank account by check, two rows within their open amounts.
const VALID: PayBillsFormValues = {
    paid_from: 'acctfixcheck001',
    date: '2026-11-15',
    payment_method: 'check',
    reference_no: '1050',
    payments: {
        [BILL_A]: { amount: '420.00', open: 125_000, number: '1004' },
        [BILL_B]: { amount: '300.00', open: 53_000, number: '1005' },
    },
}

function issues(
    values: PayBillsFormValues,
    mode: 'new' | 'replaces' = 'new',
    openByBill: Readonly<Record<string, number>> = OPEN_BY_BILL
) {
    const result = payBillsSchema(USD, openByBill, mode).safeParse(values)
    if (result.success) return []
    return result.error.issues.map(issue => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
    }))
}

function messagesAt(values: PayBillsFormValues, path: string, mode: 'new' | 'replaces' = 'new') {
    return issues(values, mode)
        .filter(issue => issue.path === path)
        .map(issue => issue.message)
}

describe('payBillsSchema: the header', () => {
    it('passes a valid Pay', () => {
        expect(issues(VALID)).toEqual([])
    })

    it('asks for the account paid from', () => {
        expect(messagesAt({ ...VALID, paid_from: '' }, 'paid_from')).toEqual([
            'Choose the account you paid from',
        ])
    })

    it('refuses a day that does not exist', () => {
        expect(messagesAt({ ...VALID, date: '2026-02-30' }, 'date')).toEqual([
            'Enter a date that exists',
        ])
    })

    it('asks for a payment method', () => {
        expect(messagesAt({ ...VALID, payment_method: '' }, 'payment_method')).toEqual([
            'Choose a payment method',
        ])
    })
})

describe('payBillsSchema: Starting check no. and Check no.', () => {
    it.each(['12a', '1234567890'])('refuses Starting check no. %s', text => {
        expect(messagesAt({ ...VALID, reference_no: text }, 'reference_no')).toEqual([
            'Use digits only, up to 9.',
        ])
    })

    it('accepts an empty Starting check no. and nine digits', () => {
        expect(issues({ ...VALID, reference_no: '' })).toEqual([])
        expect(issues({ ...VALID, reference_no: '123456789' })).toEqual([])
    })

    it('on replaces, refuses a Check no. of 41 characters and takes any text up to 40', () => {
        expect(
            messagesAt({ ...VALID, reference_no: 'x'.repeat(41) }, 'reference_no', 'replaces')
        ).toEqual(['Check no. can be at most 40 characters'])
        expect(issues({ ...VALID, reference_no: 'A-17' }, 'replaces')).toEqual([])
        expect(issues({ ...VALID, reference_no: 'x'.repeat(40) }, 'replaces')).toEqual([])
    })
})

describe('payBillsSchema: the rows', () => {
    it('refuses a Pay with no row paid, at the root', () => {
        expect(messagesAt({ ...VALID, payments: {} }, 'root')).toEqual([
            'Select at least one bill to pay.',
        ])
    })

    it('refuses a row above its open amount under that row’s cell', () => {
        const values: PayBillsFormValues = {
            ...VALID,
            payments: { [BILL_A]: { amount: '1,250.01', open: 125_000, number: '1004' } },
        }
        expect(messagesAt(values, `payments.${BILL_A}.amount`)).toEqual([
            'More than the open balance of $1,250.00',
        ])
    })

    it('takes a row at exactly its open amount', () => {
        const values: PayBillsFormValues = {
            ...VALID,
            payments: { [BILL_A]: { amount: '1,250.00', open: 125_000, number: '1004' } },
        }
        expect(issues(values)).toEqual([])
    })

    it('refuses a negative row under that row’s cell', () => {
        const values: PayBillsFormValues = {
            ...VALID,
            payments: { [BILL_A]: { amount: '-10.00', open: 125_000, number: '1004' } },
        }
        expect(messagesAt(values, `payments.${BILL_A}.amount`)).toEqual([
            PAYMENT_MESSAGES.rowNegative,
        ])
    })

    it('refuses a total above what Books can store', () => {
        // Two rows, each within its own open amount, whose sum is above maxStoredAmount.
        const half = Math.floor(maxStoredAmount / 2) + 100
        const values: PayBillsFormValues = {
            ...VALID,
            payments: {
                [BILL_A]: { amount: centsToText(half), open: half, number: '1004' },
                [BILL_B]: { amount: centsToText(half), open: half, number: '1005' },
            },
        }
        const result = issues(values, 'new', { [BILL_A]: half, [BILL_B]: half })
        expect(result.map(issue => issue.message)).toContain(
            'The total is more than Books can store'
        )
        expect(result.filter(issue => issue.path.startsWith('payments.'))).toEqual([])
    })
})
