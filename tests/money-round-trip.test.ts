import { describe, expect, it } from 'vitest'
import { amountText, formatMoney, parseMoney } from '../tinycld/books/lib/money'

describe.each(Intl.supportedValuesOf('currency'))('round trip %s', currency => {
    it('parses formatMoney output back to the same cents', () => {
        expect(parseMoney(formatMoney(12345, currency), currency)).toBe(12345)
        expect(parseMoney(formatMoney(-12345, currency), currency)).toBe(-12345)
    })

    it('parses amountText output back to the same cents', () => {
        expect(parseMoney(amountText(12345, currency), currency)).toBe(12345)
    })

    it('still parses formatMoney output without a currency', () => {
        expect(parseMoney(formatMoney(12345, currency))).toBe(12345)
    })
})

describe('parseMoney with a currency', () => {
    it.each([
        '12 EUR',
        'EUR 12',
        '€12',
        '12 USD',
        'AAA 1 BBB',
        '$12 USD',
        '-USD 5',
        'USD    1.00',
        'USD5',
        'ABC€5',
        'US$ 5',
        '-$ 5',
    ])('rejects %j under USD', text => {
        expect(parseMoney(text, 'USD')).toBeNull()
    })

    it('accepts plain numbers and its own symbol under USD', () => {
        expect(parseMoney('12', 'USD')).toBe(1200)
        expect(parseMoney('$1,234.50', 'USD')).toBe(123450)
        expect(parseMoney('-$5.00', 'USD')).toBe(-500)
    })

    it('rejects another currency symbol under EUR', () => {
        expect(parseMoney('$12', 'EUR')).toBeNull()
        expect(parseMoney('12 USD', 'EUR')).toBeNull()
    })
})
