import { describe, expect, it, vi } from 'vitest'
import {
    dollarsToCents,
    formatMoney,
    maxStoredAmount,
    parseMoney,
    roundHalfAwayFromZero,
} from '../tinycld/books/lib/money'

describe('money', () => {
    it('formats cents as a currency string', () => {
        expect(formatMoney(123456, 'USD')).toBe('$1,234.56')
    })

    it('shows a leading minus for a negative amount', () => {
        expect(formatMoney(-5, 'USD').startsWith('-')).toBe(true)
    })

    it('rounds half away from zero', () => {
        expect(roundHalfAwayFromZero(2.5)).toBe(3)
        expect(roundHalfAwayFromZero(-2.5)).toBe(-3)
    })

    it('converts dollars to cents with float noise rounded away', () => {
        expect(dollarsToCents(10.005)).toBe(1001)
        expect(dollarsToCents(0.1 + 0.2)).toBe(30)
    })

    it('parses typed text to cents', () => {
        expect(parseMoney('1,234.50')).toBe(123450)
    })

    it('returns null for text that is not a number', () => {
        expect(parseMoney('abc')).toBeNull()
    })

    it('returns null above the stored maximum', () => {
        expect(parseMoney('999999999999999.99')).toBeNull()
    })

    it('stores amounts up to 2^53-1', () => {
        expect(maxStoredAmount).toBe(Number.MAX_SAFE_INTEGER)
    })
})

describe('parseMoney exactness', () => {
    it('accepts the largest storable amount and rejects one cent more', () => {
        expect(parseMoney('90071992547409.91')).toBe(9007199254740991)
        expect(parseMoney('90071992547409.92')).toBeNull()
    })

    it('parses -0 as positive zero', () => {
        expect(Object.is(parseMoney('-0'), 0)).toBe(true)
    })

    it('allows commas only as thousands groups', () => {
        expect(parseMoney('1,2,3')).toBeNull()
        expect(parseMoney('1,234.50')).toBe(123450)
    })

    it('rejects a missing integer or fraction part', () => {
        expect(parseMoney('.50')).toBeNull()
        expect(parseMoney('1.')).toBeNull()
    })
})

describe('formatMoney robustness', () => {
    it('does not throw on an invalid currency code and keeps the amount', () => {
        expect(formatMoney(12345, '')).toContain('123.45')
        expect(formatMoney(12345, 'xx1')).toContain('123.45')
    })

    it('never renders a negative zero', () => {
        expect(formatMoney(0, 'USD')).toBe('$0.00')
        expect(formatMoney(-0, 'USD')).toBe('$0.00')
        expect(formatMoney(-0.4, 'USD')).toBe('$0.00')
    })
})

describe('parseMoney strictness', () => {
    it('parses signs and a single leading dollar sign', () => {
        expect(parseMoney('-12.50')).toBe(-1250)
        expect(parseMoney('-$5')).toBe(-500)
        expect(parseMoney('$5')).toBe(500)
        expect(parseMoney('  5  ')).toBe(500)
    })

    it('rejects a dollar sign after the minus sign with a space', () => {
        expect(parseMoney('$ -5')).toBeNull()
    })

    it('rejects interior whitespace', () => {
        expect(parseMoney('1 2 3')).toBeNull()
        expect(parseMoney('1 000')).toBeNull()
    })

    it('rejects more than one dollar sign', () => {
        expect(parseMoney('$$5')).toBeNull()
    })

    it('rejects a thousands group after a leading zero', () => {
        expect(parseMoney('0,001')).toBeNull()
    })

    it('rejects 3 or more decimals', () => {
        expect(parseMoney('1.005')).toBeNull()
    })
})

describe('formatMoney fallbacks', () => {
    async function freshMoney() {
        vi.resetModules()
        const { log } = await import('@tinycld/core/lib/logger')
        const warn = vi.spyOn(log, 'warn').mockImplementation(() => {})
        const money = await import('../tinycld/books/lib/money')
        return { warn, formatMoney: money.formatMoney }
    }

    it('uses the exact fallback text for a bad currency code', () => {
        expect(formatMoney(12345, 'xx1')).toBe('123.45 xx1')
        expect(formatMoney(12345, '')).toBe('123.45')
    })

    it('warns once per distinct bad currency', async () => {
        const { warn, formatMoney: fresh } = await freshMoney()
        expect(fresh(12345, 'xx1')).toBe('123.45 xx1')
        expect(fresh(12345, 'xx1')).toBe('123.45 xx1')
        expect(warn).toHaveBeenCalledTimes(1)
        expect(fresh(12345, 'yy2')).toBe('123.45 yy2')
        expect(warn).toHaveBeenCalledTimes(2)
        warn.mockRestore()
    })

    it('renders an em dash for every non-finite amount and warns once', async () => {
        const { warn, formatMoney: fresh } = await freshMoney()
        expect(fresh(Number.NaN, 'USD')).toBe('\u2014')
        expect(fresh(Number.NaN, 'USD')).toBe('\u2014')
        expect(fresh(Number.POSITIVE_INFINITY, 'USD')).toBe('\u2014')
        expect(fresh(Number.NEGATIVE_INFINITY, 'USD')).toBe('\u2014')
        expect(warn).toHaveBeenCalledTimes(1)
        warn.mockRestore()
    })

    it('keeps the non-finite warning key apart from currency keys', async () => {
        const { warn, formatMoney: fresh } = await freshMoney()
        expect(fresh(Number.NaN, 'USD')).toBe('\u2014')
        expect(fresh(12345, '')).toBe('123.45')
        expect(warn).toHaveBeenCalledTimes(2)
        warn.mockRestore()
    })

    it('rounds sub-cent amounts to a plain zero', () => {
        expect(formatMoney(0.4, 'USD')).toBe('$0.00')
        expect(formatMoney(-0.4, 'USD')).toBe('$0.00')
    })
})

describe('parseMoney edge pins', () => {
    it.each(['', '-', '$', '$-5', '-$ 5', '+5', '1,23'])('rejects %j', text => {
        expect(parseMoney(text)).toBeNull()
    })

    it('parses a large grouped amount', () => {
        expect(parseMoney('1,234,567.89')).toBe(123456789)
    })

    it('keeps leading zeros as plain digits', () => {
        expect(parseMoney('007')).toBe(700)
    })

    it('trims tabs and newlines', () => {
        expect(parseMoney('\t5\n')).toBe(500)
    })
})
