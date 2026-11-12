import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    PAYMENT_METHOD_KEYS,
    PAYMENT_METHOD_LABELS,
    PAYMENT_METHODS,
    paymentMethodLabel,
    paymentMethodOptions,
} from '../tinycld/books/lib/payment-methods'

// Spec §3.3, §4.3: the fixed payment method list, mirrored by the server's
// server/payment_methods.json; this test fails when the two drift.
const EXPECTED = [
    { key: 'cash', label: 'Cash' },
    { key: 'check', label: 'Check' },
    { key: 'credit_card', label: 'Credit card' },
    { key: 'debit_card', label: 'Debit card' },
    { key: 'bank_transfer', label: 'Bank transfer' },
    { key: 'other', label: 'Other' },
]

describe('payment methods', () => {
    it('match the server list exactly, in order', () => {
        const server = JSON.parse(
            readFileSync(join(__dirname, '..', 'server', 'payment_methods.json'), 'utf8')
        )
        expect(PAYMENT_METHODS).toEqual(server)
        expect(PAYMENT_METHODS).toEqual(EXPECTED)
    })

    it('label a key, and an empty or unknown key as nothing', () => {
        expect(paymentMethodLabel('credit_card')).toBe('Credit card')
        expect(paymentMethodLabel('check')).toBe('Check')
        expect(paymentMethodLabel('')).toBe('')
        expect(paymentMethodLabel('cheque')).toBe('')
        expect(PAYMENT_METHOD_LABELS.bank_transfer).toBe('Bank transfer')
    })

    it('list the keys in order for the zod enum', () => {
        expect(PAYMENT_METHOD_KEYS).toEqual(EXPECTED.map(m => m.key))
    })

    it('offer None first, then every method in order', () => {
        expect(paymentMethodOptions()).toEqual([
            { value: '', label: 'None' },
            { value: 'cash', label: 'Cash' },
            { value: 'check', label: 'Check' },
            { value: 'credit_card', label: 'Credit card' },
            { value: 'debit_card', label: 'Debit card' },
            { value: 'bank_transfer', label: 'Bank transfer' },
            { value: 'other', label: 'Other' },
        ])
    })
})
