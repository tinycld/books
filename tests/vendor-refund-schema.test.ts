import { describe, expect, it } from 'vitest'
import { moneyInputCents } from '../tinycld/books/lib/money-input'
import { centsToText, maxStoredAmount } from '../tinycld/books/lib/money-text'
import type { PaymentFormValues } from '../tinycld/books/lib/payment-values'
import { paymentWriteRows } from '../tinycld/books/lib/payment-values'
import { VENDOR_REFUND_FLOW } from '../tinycld/books/lib/vendor-refund-flow'
import { vendorRefundSchema } from '../tinycld/books/lib/vendor-refund-schema'

// The vendor refund's one zod schema, for Save draft and Post alike (spec §3.5): its three
// arguments are the currency, the Refunded to options the form lists and each listed
// credit's date (plan decision). Each rule reports its text under its key: a field's own
// path, a row's `payments.<credit id>.amount`, the sum rules `payments.root`.

const USD = 'USD'
const CHECKING = 'acctrfcheck0001'
const CARD = 'acctrfcard00001'
const ACCOUNTS = [CHECKING, CARD]

const CREDIT_1002 = 'vcrd1002pacpw01'
const CREDIT_1006 = 'vcrd1006pacpw01'
const CREDIT_DATES = {
    [CREDIT_1002]: '2026-11-10 00:00:00.000Z',
    [CREDIT_1006]: '2026-11-14 00:00:00.000Z',
}

// A valid refund of $650.00, all of it on credit 1002 ($650.00 unapplied).
const VALID: PaymentFormValues = {
    party: 'vendorpacific01',
    date: '2026-11-17',
    payment_method: 'check',
    reference_no: '20417',
    account: CHECKING,
    amount: '650.00',
    amountTyped: true,
    payments: {
        [CREDIT_1002]: { amount: '650.00', open: 65_000, number: '1002' },
        [CREDIT_1006]: { amount: '', open: 12_000, number: '1006' },
    },
    memo: 'Overbilling refunded by check',
}

function issues(values: PaymentFormValues) {
    const result = vendorRefundSchema(USD, ACCOUNTS, CREDIT_DATES).safeParse(values)
    if (result.success) return []
    return result.error.issues.map(issue => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
    }))
}

function messagesAt(values: PaymentFormValues, path: string) {
    return issues(values)
        .filter(issue => issue.path === path)
        .map(issue => issue.message)
}

function listMessages(values: PaymentFormValues) {
    return messagesAt(values, 'payments.root')
}

const ROW_1002 = `payments.${CREDIT_1002}.amount`
const ROW_1006 = `payments.${CREDIT_1006}.amount`

describe('vendorRefundSchema', () => {
    it('passes a valid refund', () => {
        expect(issues(VALID)).toEqual([])
    })

    it('asks for a vendor', () => {
        expect(messagesAt({ ...VALID, party: '' }, 'party')).toEqual(['Choose a vendor'])
    })

    it('refuses a refund date that is not a day', () => {
        expect(messagesAt({ ...VALID, date: '2026-02-30' }, 'date')).toEqual([
            'Enter a date that exists',
        ])
        expect(messagesAt({ ...VALID, date: '' }, 'date')).toEqual(['Enter a date that exists'])
    })

    it('refuses a reference of 41 characters', () => {
        expect(messagesAt({ ...VALID, reference_no: 'R'.repeat(41) }, 'reference_no')).toEqual([
            'Reference no. can be at most 40 characters',
        ])
        expect(messagesAt({ ...VALID, reference_no: 'R'.repeat(40) }, 'reference_no')).toEqual([])
    })

    it('refuses a Refunded to that is not a listed option', () => {
        expect(messagesAt({ ...VALID, account: 'acctrfoldbk0001' }, 'account')).toEqual([
            'Choose the account the refund arrived in',
        ])
        expect(messagesAt({ ...VALID, account: '' }, 'account')).toEqual([
            'Choose the account the refund arrived in',
        ])
        expect(messagesAt({ ...VALID, account: CARD }, 'account')).toEqual([])
    })

    it('asks for the amount refunded when it is 0 or empty', () => {
        const none = { ...VALID, payments: {} }
        expect(messagesAt({ ...none, amount: '0' }, 'amount')).toEqual([
            'Enter the amount refunded',
        ])
        expect(messagesAt({ ...none, amount: '' }, 'amount')).toEqual(['Enter the amount refunded'])
    })

    it('refuses an amount above the stored-amount limit', () => {
        const amount = centsToText(maxStoredAmount + 1)
        expect(messagesAt({ ...VALID, amount }, 'amount')).toEqual([
            'The amount is more than Books can store',
        ])
    })

    it('refuses a row below 0, under that row', () => {
        const values = {
            ...VALID,
            payments: {
                ...VALID.payments,
                [CREDIT_1006]: { amount: '-5.00', open: 12_000, number: '1006' },
            },
        }
        const messages = messagesAt(values, ROW_1006)
        expect(messages).toEqual([VENDOR_REFUND_FLOW.texts.rowNegative])
        expect(messages[0]).not.toBe('')
    })

    it('refuses a row above its unapplied credit, with the credit formatted, under that row', () => {
        const values = {
            ...VALID,
            amount: '700.00',
            payments: { [CREDIT_1002]: { amount: '700.00', open: 65_000, number: '1002' } },
        }
        expect(messagesAt(values, ROW_1002)).toEqual(['More than the unapplied credit of $650.00'])
    })

    it('refuses a ticked credit dated after the refund date, under that row', () => {
        const values = {
            ...VALID,
            date: '2026-11-12',
            amount: '770.00',
            payments: {
                [CREDIT_1002]: { amount: '650.00', open: 65_000, number: '1002' },
                [CREDIT_1006]: { amount: '120.00', open: 12_000, number: '1006' },
            },
        }
        expect(messagesAt(values, ROW_1006)).toEqual([
            'Vendor credit 1006 is dated after the refund date.',
        ])
        // Dated before the refund date: no refusal.
        expect(messagesAt(values, ROW_1002)).toEqual([])
    })

    it('does not refuse an unticked credit dated after the refund date', () => {
        const values = { ...VALID, date: '2026-11-12' }
        expect(messagesAt(values, ROW_1006)).toEqual([])
        const zero = {
            ...values,
            payments: {
                ...values.payments,
                [CREDIT_1006]: { amount: '0.00', open: 12_000, number: '1006' },
            },
        }
        expect(messagesAt(zero, ROW_1006)).toEqual([])
    })

    it('refuses rows that add up to more than the amount, under the list', () => {
        const values = {
            ...VALID,
            amount: '650.00',
            payments: {
                [CREDIT_1002]: { amount: '600.00', open: 65_000, number: '1002' },
                [CREDIT_1006]: { amount: '100.00', open: 12_000, number: '1006' },
            },
        }
        expect(listMessages(values)).toEqual([
            'The refunds add up to $700.00, more than the $650.00 refunded',
        ])
    })

    it('refuses rows that add up to less than the amount, with the rest, under the list', () => {
        const values = {
            ...VALID,
            amount: '650.00',
            payments: {
                [CREDIT_1002]: { amount: '630.00', open: 65_000, number: '1002' },
            },
        }
        expect(listMessages(values)).toEqual([
            '$20.00 of the refund is not on a vendor credit. Put it on a credit or lower the amount.',
        ])
        // No row at all: the whole amount is not placed.
        expect(listMessages({ ...VALID, amount: '50.00', payments: {} })).toEqual([
            '$50.00 of the refund is not on a vendor credit. Put it on a credit or lower the amount.',
        ])
    })

    it('parses a valid refund to integer cents through the shared money helper', () => {
        const values = {
            ...VALID,
            amount: '1,234.56',
            payments: {
                [CREDIT_1002]: { amount: '650.00', open: 65_000, number: '1002' },
                [CREDIT_1006]: { amount: '584.56', open: 60_000, number: '1006' },
            },
        }
        const result = vendorRefundSchema(USD, ACCOUNTS, {
            [CREDIT_1002]: CREDIT_DATES[CREDIT_1002],
            [CREDIT_1006]: '2026-11-15 00:00:00.000Z',
        }).safeParse(values)
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(moneyInputCents(result.data.amount, USD)).toBe(123_456)
        const lines = paymentWriteRows(result.data, [], [CREDIT_1002, CREDIT_1006])
        expect(lines.map(line => [line.document, line.amount])).toEqual([
            [CREDIT_1002, 65_000],
            [CREDIT_1006, 58_456],
        ])
        expect(lines.every(line => Number.isInteger(line.amount))).toBe(true)
    })

    // That Save draft and Post refuse alike is driven through the form in
    // tests/e2e/vendor-refund-refusals.spec.ts (⌘S and Post on the same refused input).
    it('takes the currency, the account options and the credit dates', () => {
        expect(vendorRefundSchema.length).toBe(3)
    })
})
