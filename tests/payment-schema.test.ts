import { describe, expect, it } from 'vitest'
import { centsToText, maxStoredAmount } from '../tinycld/books/lib/money-text'
import { PAYMENT_FLOW, type PaymentFlowTexts } from '../tinycld/books/lib/payment-flow'
import {
    type PaymentSchemaRules,
    paymentSchema,
    paymentSchemaWith,
} from '../tinycld/books/lib/payment-schema'
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
    party: 'cust_harbor_001',
    date: '2026-11-15',
    payment_method: 'check',
    reference_no: '10518',
    account: UNDEPOSITED,
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
        expect(messagesAt({ ...VALID, party: '' }, 'party')).toEqual(['Choose a customer'])
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
        expect(messagesAt({ ...VALID, account: '' }, 'account', CREATED_ON_POST)).toEqual([])
        expect(messagesAt({ ...VALID, account: '' }, 'account', WITH_UNDEPOSITED)).toEqual([
            'Choose an active bank or Undeposited funds account',
        ])
    })

    it('refuses a Deposit to that is not a listed option', () => {
        expect(messagesAt({ ...VALID, account: 'acctoldcheck001' }, 'account')).toEqual([
            'Choose an active bank or Undeposited funds account',
        ])
    })
})

// The rules of a flow (vendor refund spec §3.5, §3.1): the sum rule by `sumRule`, and the
// row-date rule when the flow gives the rows' dates.

// The received payment's texts, with the two texts a flow of the 'exact' rule and the date
// rule gives (the received payment has neither).
const RULE_TEXTS: PaymentFlowTexts = {
    ...PAYMENT_FLOW.texts,
    rowsBelow: rest => `${rest} of the refund is not on a vendor credit.`,
    datedAfter: number => `Vendor credit ${number} is dated after the refund date.`,
}

function rulesOf(rules: Partial<PaymentSchemaRules>): PaymentSchemaRules {
    return {
        currency: USD,
        accountOptions: WITH_UNDEPOSITED,
        texts: RULE_TEXTS,
        sumRule: 'credit',
        rowDates: null,
        ...rules,
    }
}

function issuesWith(values: PaymentFormValues, rules: Partial<PaymentSchemaRules>) {
    const result = paymentSchemaWith(rulesOf(rules)).safeParse(values)
    if (result.success) return []
    return result.error.issues.map(issue => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
    }))
}

function listMessages(values: PaymentFormValues, rules: Partial<PaymentSchemaRules>) {
    return issuesWith(values, rules)
        .filter(issue => issue.path === 'payments' || issue.path === 'payments.root')
        .map(issue => issue.message)
}

function rowMessages(
    values: PaymentFormValues,
    rules: Partial<PaymentSchemaRules>,
    document: string
) {
    return issuesWith(values, rules)
        .filter(issue => issue.path === `payments.${document}.amount`)
        .map(issue => issue.message)
}

// $1,250.00 received, $1,230.00 on the rows: $20.00 not placed.
const BELOW: PaymentFormValues = { ...VALID, amount: '1,250.00' }
// $1,000.00 received, $1,230.00 on the rows.
const ABOVE: PaymentFormValues = { ...VALID, amount: '1,000.00' }

describe('paymentSchemaWith', () => {
    it("refuses rows below the amount under the 'exact' rule, on the list", () => {
        expect(listMessages(BELOW, { sumRule: 'exact' })).toEqual([
            '$20.00 of the refund is not on a vendor credit.',
        ])
    })

    it("passes rows below the amount under the 'credit' rule", () => {
        expect(issuesWith(BELOW, { sumRule: 'credit' })).toEqual([])
    })

    it('passes rows equal to the amount under both rules', () => {
        const equal = { ...VALID, amount: '1,230.00' }
        expect(issuesWith(equal, { sumRule: 'exact' })).toEqual([])
        expect(issuesWith(equal, { sumRule: 'credit' })).toEqual([])
    })

    it('refuses rows above the amount under both rules, on the list', () => {
        const text = 'The payments add up to $1,230.00, more than the $1,000.00 received'
        expect(listMessages(ABOVE, { sumRule: 'exact' })).toEqual([text])
        expect(listMessages(ABOVE, { sumRule: 'credit' })).toEqual([text])
    })

    it('refuses a ticked row dated after the form date, under that row', () => {
        const rowDates = { [INVOICE_A]: '2026-11-16', [INVOICE_B]: '2026-11-15' }
        expect(rowMessages(VALID, { rowDates }, INVOICE_A)).toEqual([
            'Vendor credit 1006 is dated after the refund date.',
        ])
        // Dated on the form date: no refusal.
        expect(rowMessages(VALID, { rowDates }, INVOICE_B)).toEqual([])
    })

    it('does not refuse an unticked row dated after the form date', () => {
        const rowDates = { [INVOICE_A]: '2026-11-16', [INVOICE_B]: '2026-11-15' }
        const unticked: PaymentFormValues = {
            ...VALID,
            amount: '750.00',
            payments: {
                [INVOICE_A]: { amount: '', open: 48_000, number: '1006' },
                [INVOICE_B]: { amount: '750.00', open: 75_000, number: '1009' },
            },
        }
        expect(rowMessages(unticked, { rowDates }, INVOICE_A)).toEqual([])
        const zero = {
            ...unticked,
            payments: {
                ...unticked.payments,
                [INVOICE_A]: { amount: '0.00', open: 48_000, number: '1006' },
            },
        }
        expect(rowMessages(zero, { rowDates }, INVOICE_A)).toEqual([])
    })

    it('runs no date rule without row dates', () => {
        expect(issuesWith(VALID, { rowDates: null })).toEqual([])
    })

    it('checks the account against the listed options it is given', () => {
        expect(
            issuesWith({ ...VALID, account: CHECKING }, { accountOptions: [UNDEPOSITED] })
                .filter(issue => issue.path === 'account')
                .map(issue => issue.message)
        ).toEqual(['Choose an active bank or Undeposited funds account'])
    })
})
