import { describe, expect, it } from 'vitest'
import { centsToText, maxStoredAmount } from '../tinycld/books/lib/money-text'
import { paymentSchema } from '../tinycld/books/lib/payment-schema'
import type { PaymentFormValues } from '../tinycld/books/lib/payment-values'

// The one zod schema of Save draft and Post (spec §3.4), with Deposit to checked against
// the options the chart lists (plan decision: the second argument).

const USD = 'USD'
const UNDEPOSITED = 'acctfixundep001'
const CHECKING = 'acctfixcheck001'
const WITH_UNDEPOSITED = [CHECKING, UNDEPOSITED]
// The chart has no active Undeposited funds account: '' (created when you post) is listed.
const CREATED_ON_POST = ['', CHECKING]

const INVOICE_A = 'invoverdue00001'
const INVOICE_B = 'invpartly000001'

// A valid draft: $1,243.56 received, two rows paid within their open balances.
const VALID: PaymentFormValues = {
    customer: 'cust_harbor_001',
    date: '2026-11-15',
    payment_method: 'check',
    reference_no: '10518',
    deposit_to: UNDEPOSITED,
    amount: '1,243.56',
    amountTyped: true,
    payments: {
        [INVOICE_A]: { amount: '480.00', open: 48_000, number: '1006' },
        [INVOICE_B]: { amount: '750.00', open: 75_000, number: '1009' },
    },
    memo: 'Check mailed with the remittance stub',
}

function issues(values: PaymentFormValues, depositOptions: readonly string[] = WITH_UNDEPOSITED) {
    const result = paymentSchema(USD, depositOptions).safeParse(values)
    if (result.success) return []
    return result.error.issues.map(issue => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
    }))
}

function messagesAt(values: PaymentFormValues, path: string, depositOptions?: readonly string[]) {
    return issues(values, depositOptions)
        .filter(issue => issue.path === path)
        .map(issue => issue.message)
}

describe('paymentSchema', () => {
    it('passes a valid draft', () => {
        expect(issues(VALID)).toEqual([])
    })

    it('asks for a customer', () => {
        expect(messagesAt({ ...VALID, customer: '' }, 'customer')).toEqual(['Choose a customer'])
    })

    it('refuses a day that does not exist', () => {
        expect(messagesAt({ ...VALID, date: '2026-02-30' }, 'date')).toEqual([
            'Enter a date that exists',
        ])
    })

    it('refuses a reference of 41 characters', () => {
        expect(messagesAt({ ...VALID, reference_no: 'R'.repeat(41) }, 'reference_no')).toEqual([
            'Reference no. can be at most 40 characters',
        ])
        expect(messagesAt({ ...VALID, reference_no: 'R'.repeat(40) }, 'reference_no')).toEqual([])
    })

    it('asks for the amount received when it is empty or 0', () => {
        const none = { ...VALID, payments: {} }
        expect(messagesAt({ ...none, amount: '' }, 'amount')).toEqual(['Enter the amount received'])
        expect(messagesAt({ ...none, amount: '0' }, 'amount')).toEqual([
            'Enter the amount received',
        ])
    })

    it('refuses an amount above the stored-amount limit', () => {
        const amount = centsToText(maxStoredAmount + 1)
        expect(messagesAt({ ...VALID, amount }, 'amount')).toEqual([
            'The amount is more than Books can store',
        ])
    })

    it('refuses a row payment above its open balance, under that row', () => {
        const values = {
            ...VALID,
            amount: '5,000.00',
            payments: { [INVOICE_A]: { amount: '243.57', open: 24_356, number: '1004' } },
        }
        expect(messagesAt(values, `payments.${INVOICE_A}.amount`)).toEqual([
            'More than the open balance of $243.56',
        ])
    })

    it('refuses payments that add up to more than the amount received, on the list', () => {
        const values = {
            ...VALID,
            amount: '1,243.56',
            payments: {
                [INVOICE_A]: { amount: '1,000.00', open: 100_000, number: '1006' },
                [INVOICE_B]: { amount: '500.00', open: 75_000, number: '1009' },
            },
        }
        const onList = issues(values).filter(
            issue => issue.path === 'payments' || issue.path === 'payments.root'
        )
        expect(onList.map(issue => issue.message)).toEqual([
            'The payments add up to $1,500.00, more than the $1,243.56 received',
        ])
    })

    it('passes an empty Deposit to only when the chart lists the created-on-post option', () => {
        expect(messagesAt({ ...VALID, deposit_to: '' }, 'deposit_to', CREATED_ON_POST)).toEqual([])
        expect(messagesAt({ ...VALID, deposit_to: '' }, 'deposit_to', WITH_UNDEPOSITED)).toEqual([
            'Choose an active bank or Undeposited funds account',
        ])
    })

    it('refuses a Deposit to that is not a listed option', () => {
        expect(messagesAt({ ...VALID, deposit_to: 'acctoldcheck001' }, 'deposit_to')).toEqual([
            'Choose an active bank or Undeposited funds account',
        ])
    })
})
