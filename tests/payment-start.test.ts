import { describe, expect, it } from 'vitest'
import { PAYMENT_FLOW } from '../tinycld/books/lib/payment-flow'
import {
    draftApplicationsOf,
    originalApplicationsOf,
    titleOf,
} from '../tinycld/books/lib/payment-start'
import { correctionPaymentValues, draftPaymentValues } from '../tinycld/books/lib/payment-values'

// The pure start helpers of a payment form (vendor refund spec §3.1), moved out of the
// receive-payment screen: the title, and the entries a draft and a correction start from.

// Stored lines as the record read gives them: the line, with its document's number, date,
// total, open balance and ref flattened.
const LINES = [
    {
        id: 'pmapstoredrow00',
        document: 'invoverdue00001',
        amount: 48_000,
        position: 0,
        number: '1006',
        date: '2026-09-01',
        total: 48_000,
        open: 48_000,
        ref: '',
    },
    {
        id: 'pmapstoredrow01',
        document: 'invpartly000001',
        amount: 50_000,
        position: 1,
        number: '1009',
        date: '2026-10-20',
        total: 125_000,
        open: 75_000,
        ref: '',
    },
]

// A posted original's lines: invoice 1006 is paid in full by it (balance 0), invoice 1009
// has 750.00 left after its 500.00.
const ORIGINAL_LINES = [{ ...LINES[0], open: 0 }, LINES[1]]

// A stored header as the form reads it.
const HEADER = {
    party: 'cust_harbor_001',
    date: '2026-11-15',
    payment_method: 'check' as const,
    reference_no: '10518',
    account: 'acctfixundep001',
    amount: 98_000,
    memo: '',
}

describe('titleOf', () => {
    it('gives the received payment’s three titles', () => {
        expect(titleOf(PAYMENT_FLOW, 'new', undefined)).toBe('Receive payment')
        expect(titleOf(PAYMENT_FLOW, 'draft', undefined)).toBe('Draft payment')
        expect(titleOf(PAYMENT_FLOW, 'correction', '1004')).toBe('Edit payment 1004')
    })
})

describe('draftApplicationsOf', () => {
    it('gives each line’s amount, number and its document’s open balance', () => {
        expect(draftApplicationsOf(LINES, {})).toEqual([
            expect.objectContaining({
                document: 'invoverdue00001',
                amount: 48_000,
                open: 48_000,
                number: '1006',
            }),
            expect.objectContaining({
                document: 'invpartly000001',
                amount: 50_000,
                open: 75_000,
                number: '1009',
            }),
        ])
    })

    it('adds what a corrected original applied to a document’s open balance', () => {
        const entries = draftApplicationsOf(LINES, { invpartly000001: 50_000 })
        expect(entries.map(entry => entry.open)).toEqual([48_000, 125_000])
    })

    it('starts the draft form with those entries', () => {
        const values = draftPaymentValues(
            HEADER,
            draftApplicationsOf(LINES, { invpartly000001: 50_000 })
        )
        expect(values.payments).toEqual({
            invoverdue00001: { amount: '480.00', open: 48_000, number: '1006' },
            invpartly000001: { amount: '500.00', open: 125_000, number: '1009' },
        })
    })
})

describe('originalApplicationsOf', () => {
    it('starts a correction with each line open for its balance plus its own amount', () => {
        const values = correctionPaymentValues(HEADER, originalApplicationsOf(ORIGINAL_LINES))
        expect(values.payments).toEqual({
            invoverdue00001: { amount: '480.00', open: 48_000, number: '1006' },
            invpartly000001: { amount: '500.00', open: 125_000, number: '1009' },
        })
    })

    it('keeps each line’s document, amount and number', () => {
        expect(originalApplicationsOf(ORIGINAL_LINES)).toEqual([
            expect.objectContaining({
                document: 'invoverdue00001',
                amount: 48_000,
                number: '1006',
            }),
            expect.objectContaining({
                document: 'invpartly000001',
                amount: 50_000,
                number: '1009',
            }),
        ])
    })
})
