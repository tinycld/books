import { ClientResponseError } from 'pocketbase'
import { describe, expect, it, vi } from 'vitest'
import { paymentRefusalHandler } from '../tinycld/books/lib/payment-refusals'

// Where a server refusal of a payment save shows (spec §3.6): under the field it names,
// under the row of the application it numbers, else in the form's error summary.

const RECORDS_URL = 'http://127.0.0.1:7100/api/collections/books_payments/records'

// The stored applications, in position order (index = position).
const STORED = [
    { id: 'pmapstoredrow00', invoice: 'invoverdue00001', position: 0 },
    { id: 'pmapstoredrow01', invoice: 'invpartly000001', position: 1 },
    { id: 'pmapstoredrow02', invoice: 'invopen00000001', position: 2 },
]

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

function handle(error: unknown) {
    const form = { setError: vi.fn() }
    paymentRefusalHandler(form, STORED)(error)
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

describe('paymentRefusalHandler', () => {
    it.each([
        ['customer', 'Harborview Dental is inactive. Choose an active customer'],
        ['date', 'Enter a date that exists, in the form YYYY-MM-DD'],
        ['deposit_to', 'Choose an active bank or Undeposited funds account'],
        ['reference_no', 'Must be no more than 40 character(s)'],
        ['amount', 'The amount is more than Books can store'],
    ])('puts a refusal keyed %s under that field', (field, message) => {
        const setError = handle(fieldRefusal(field, `${message}.`))
        expect(setError).toHaveBeenCalledWith(field, textOf(message))
        expect(setError.mock.calls.filter(([name]) => name === 'root')).toEqual([])
    })

    it('puts applications.1 under the Payment cell of the stored application at position 1', () => {
        const message = 'Invoice 1009: the payment is more than its open balance of $750.00'
        const setError = handle(fieldRefusal('applications.1', `${message}.`))
        expect(setError).toHaveBeenCalledWith('payments.invpartly000001.amount', textOf(message))
        expect(setError.mock.calls.filter(([name]) => name === 'root')).toEqual([])
    })

    it('puts a refusal with no field in the summary with its final period', () => {
        const message = 'The books are closed through 2026-06-30.'
        const setError = handle(messageOnly(message))
        expect(setError).toHaveBeenCalledWith('root', expect.objectContaining({ message }))
    })
})
