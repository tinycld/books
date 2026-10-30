import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    PAYMENT_TERM_KEYS,
    PAYMENT_TERM_OPTIONS,
    PAYMENT_TERMS,
    type PaymentTermKey,
    paymentTermLabel,
} from '../tinycld/books/lib/payment-terms'

const FIVE = [
    { key: 'due_on_receipt', label: 'Due on receipt', days: 0 },
    { key: 'net_10', label: 'Net 10', days: 10 },
    { key: 'net_15', label: 'Net 15', days: 15 },
    { key: 'net_30', label: 'Net 30', days: 30 },
    { key: 'net_60', label: 'Net 60', days: 60 },
]

// Read inside the test, so a missing migration fails the drift test only.
function migrationTermsValues(): string[] {
    const source = readFileSync(
        join(__dirname, '..', 'pb-migrations', '2100000004_create_books_vendors.js'),
        'utf8'
    )
    const field = source.match(/\{[^{}]*name:\s*'terms'[^{}]*\}/)
    if (!field) throw new Error('the migration has no terms field')
    const values = field[0].match(/values:\s*\[([^\]]*)\]/)
    if (!values) throw new Error('the terms field has no values list')
    return [...values[1].matchAll(/'([^']*)'/g)].map(match => match[1])
}

describe('PAYMENT_TERMS', () => {
    it('is the five terms, in order, with their labels and days', () => {
        expect(PAYMENT_TERMS.map(({ key, label, days }) => ({ key, label, days }))).toEqual(FIVE)
    })

    it('PAYMENT_TERM_KEYS are the keys of PAYMENT_TERMS', () => {
        expect([...PAYMENT_TERM_KEYS]).toEqual(PAYMENT_TERMS.map(term => term.key))
    })
})

describe('paymentTermLabel', () => {
    it('labels a known key', () => {
        expect(paymentTermLabel('net_30')).toBe('Net 30')
    })

    it('labels none and an unknown key with an empty string', () => {
        expect(paymentTermLabel('')).toBe('')
        expect(paymentTermLabel('net_90')).toBe('')
    })
})

describe('PAYMENT_TERM_OPTIONS', () => {
    it('starts with None, then each term in order', () => {
        expect(PAYMENT_TERM_OPTIONS).toEqual([
            { value: '', label: 'None' },
            ...FIVE.map(({ key, label }) => ({ value: key, label })),
        ])
    })

    it('types None with the generated terms union', () => {
        // tsc fails here when the generated union lacks '' (checkpoint 0).
        const none: PaymentTermKey = ''
        expect(PAYMENT_TERM_OPTIONS[0].value).toBe(none)
    })
})

describe('migration drift', () => {
    it("the migration's terms values are PAYMENT_TERM_KEYS", () => {
        expect(migrationTermsValues()).toEqual([...PAYMENT_TERM_KEYS])
    })
})
