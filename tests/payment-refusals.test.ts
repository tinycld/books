import { ClientResponseError } from 'pocketbase'
import { describe, expect, it, vi } from 'vitest'
import { PAYMENT_FLOW, type PaymentFlow } from '../tinycld/books/lib/payment-flow'
import { paymentRefusalHandler } from '../tinycld/books/lib/payment-refusals'

// Where a server refusal of a payment save shows (spec §3.6): under the field it names,
// under the row of the line it numbers, else in the form's error summary. The flow names
// the server's party and account fields and its line key (vendor refund spec §3.1, §3.6).

const RECORDS_URL = 'http://127.0.0.1:7100/api/collections/books_payments/records'

// The stored lines, in position order (index = position).
const STORED = [
    { id: 'pmapstoredrow00', document: 'invoverdue00001', position: 0 },
    { id: 'pmapstoredrow01', document: 'invpartly000001', position: 1 },
    { id: 'pmapstoredrow02', document: 'invopen00000001', position: 2 },
]

// A flow with the vendor refund's server keys; every other value is the received payment's.
const REFUND_KEYS: PaymentFlow = {
    ...PAYMENT_FLOW,
    lineKey: 'lines',
    serverFields: { party: 'vendor', account: 'refunded_to' },
}

function fieldRefusal(field: string, message: string) {
    return new ClientResponseError({
        url: RECORDS_URL,
        status: 400,
        response: {
            code: 400,
            message: 'Failed to update record.',
            data: { [field]: { code: 'validation_refused', message } },
        },
    })
}

function messageOnly(message: string) {
    return new ClientResponseError({
        url: RECORDS_URL,
        status: 400,
        response: { code: 400, message, data: {} },
    })
}

function handle(error: unknown, flow: PaymentFlow = PAYMENT_FLOW) {
    const form = { setError: vi.fn() }
    paymentRefusalHandler(form, STORED, flow)(error)
    return form.setError
}

// A field message, with or without PocketBase's final period.
function textOf(message: string) {
    return expect.objectContaining({
        message: expect.stringMatching(
            new RegExp(`^${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.?$`)
        ),
    })
}

function rootCalls(setError: ReturnType<typeof vi.fn>) {
    return setError.mock.calls.filter(([name]) => name === 'root')
}

describe('paymentRefusalHandler with PAYMENT_FLOW', () => {
    it.each([
        ['customer', 'party', 'Harborview Dental is inactive. Choose an active customer'],
        ['date', 'date', 'Enter a date that exists, in the form YYYY-MM-DD'],
        ['deposit_to', 'account', 'Choose an active bank or Undeposited funds account'],
        ['reference_no', 'reference_no', 'Must be no more than 40 character(s)'],
        ['amount', 'amount', 'The amount is more than Books can store'],
    ])('puts a refusal keyed %s under the form field %s', (key, field, message) => {
        const setError = handle(fieldRefusal(key, `${message}.`))
        expect(setError).toHaveBeenCalledWith(field, textOf(message))
        expect(rootCalls(setError)).toEqual([])
    })

    it('puts applications.1 under the Payment cell of the stored application at position 1', () => {
        const message = 'Invoice 1009: the payment is more than its open balance of $750.00'
        const setError = handle(fieldRefusal('applications.1', `${message}.`))
        expect(setError).toHaveBeenCalledWith('payments.invpartly000001.amount', textOf(message))
        expect(rootCalls(setError)).toEqual([])
    })

    it('puts applications.2 under the row of the stored application at position 2', () => {
        const message = 'Invoice 1011 is not open. Clear it to continue'
        const setError = handle(fieldRefusal('applications.2', `${message}.`))
        expect(setError).toHaveBeenCalledWith('payments.invopen00000001.amount', textOf(message))
        expect(rootCalls(setError)).toEqual([])
    })

    it('puts a refusal with no field in the summary with its final period', () => {
        const message = 'The books are closed through 2026-06-30.'
        const setError = handle(messageOnly(message))
        expect(setError).toHaveBeenCalledWith('root', expect.objectContaining({ message }))
    })

    it('puts a refusal of an unknown key in the summary', () => {
        const message = 'Something the form does not draw.'
        const setError = handle(fieldRefusal('sequence', message))
        expect(setError).toHaveBeenCalledWith('root', expect.objectContaining({ message }))
        expect(setError).toHaveBeenCalledTimes(1)
    })
})

describe('paymentRefusalHandler with a flow of lines, vendor and refunded_to', () => {
    it('puts lines.2 under the row of the stored line at position 2', () => {
        const message = 'Vendor credit 1002: the refund is more than its unapplied credit of $50.00'
        const setError = handle(fieldRefusal('lines.2', `${message}.`), REFUND_KEYS)
        expect(setError).toHaveBeenCalledWith('payments.invopen00000001.amount', textOf(message))
        expect(rootCalls(setError)).toEqual([])
    })

    it('puts vendor under the party field and refunded_to under the account field', () => {
        const vendor = 'Pacific Power is inactive. Choose an active vendor'
        const vendorCalls = handle(fieldRefusal('vendor', `${vendor}.`), REFUND_KEYS)
        expect(vendorCalls).toHaveBeenCalledWith('party', textOf(vendor))
        expect(rootCalls(vendorCalls)).toEqual([])

        const account = 'Choose a bank, credit card or Undeposited funds account'
        const accountCalls = handle(fieldRefusal('refunded_to', `${account}.`), REFUND_KEYS)
        expect(accountCalls).toHaveBeenCalledWith('account', textOf(account))
        expect(rootCalls(accountCalls)).toEqual([])
    })

    it('puts the received payment’s keys in the summary, since this flow does not draw them', () => {
        const message = 'Not a key of this flow.'
        for (const key of ['applications.2', 'customer', 'deposit_to']) {
            const setError = handle(fieldRefusal(key, message), REFUND_KEYS)
            expect(setError, key).toHaveBeenCalledWith('root', expect.objectContaining({ message }))
            expect(setError, key).toHaveBeenCalledTimes(1)
        }
    })
})
