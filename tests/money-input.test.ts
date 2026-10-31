import { describe, expect, it, vi } from 'vitest'
import {
    MONEY_VALUE_SCHEMA,
    moneyFieldValue,
    moneyHostText,
    moneyInputCents,
    moneyInputText,
} from '../tinycld/books/lib/money-input'

const USD = 'USD'
const TWENTY_DIGITS = '99999999999999999999'

function issueMessagesOf(value: unknown) {
    const result = MONEY_VALUE_SCHEMA.safeParse(value)
    if (result.success) throw new Error(`accepted ${String(value)}`)
    return result.error.issues.map(issue => issue.message)
}

describe('moneyInputText', () => {
    it('shows cents as an amount with groups and two decimals', () => {
        expect(moneyInputText(125000)).toBe('1,250.00')
    })

    it('shows nothing for 0, a value that is not a number and a string', () => {
        expect(moneyInputText(0)).toBe('')
        expect(moneyInputText(Number.NaN)).toBe('')
        expect(moneyInputText('5')).toBe('')
    })
})

describe('moneyInputCents', () => {
    it('reads empty text as 0', () => {
        expect(moneyInputCents('', USD)).toBe(0)
    })

    it('reads well-formed amounts as integer cents, a negative amount too', () => {
        expect(moneyInputCents('1250', USD)).toBe(125000)
        expect(moneyInputCents('$1,250.50', USD)).toBe(125050)
        expect(moneyInputCents('-5', USD)).toBe(-500)
    })

    it('reads malformed text and an amount above the stored maximum as null', () => {
        expect(moneyInputCents('1,2', USD)).toBeNull()
        expect(moneyInputCents(TWENTY_DIGITS, USD)).toBeNull()
    })
})

describe('moneyFieldValue', () => {
    it('sends the cents of text that parses, and 0 for empty text', () => {
        expect(moneyFieldValue('1250', USD)).toBe(125000)
        expect(moneyFieldValue('', USD)).toBe(0)
        expect(moneyFieldValue('-5', USD)).toBe(-500)
    })

    it('sends the text itself when it does not parse', () => {
        expect(moneyFieldValue('abc', USD)).toBe('abc')
        expect(moneyFieldValue(TWENTY_DIGITS, USD)).toBe(TWENTY_DIGITS)
    })
})

describe('MONEY_VALUE_SCHEMA', () => {
    it('accepts 0, an amount and the stored maximum', () => {
        for (const value of [0, 125000, Number.MAX_SAFE_INTEGER]) {
            expect(MONEY_VALUE_SCHEMA.safeParse(value).success).toBe(true)
        }
    })

    it('refuses malformed text and a fraction of a cent as malformed', () => {
        for (const value of ['abc', '1,2', 12.5]) {
            expect(issueMessagesOf(value)).toEqual(['Enter an amount such as 1,250.00'])
        }
    })

    it('refuses a negative amount', () => {
        expect(issueMessagesOf(-500)).toEqual(['Enter an amount of 0 or more'])
    })

    it('refuses a well-formed amount that did not parse and a number above the maximum as too large', () => {
        expect(issueMessagesOf(TWENTY_DIGITS)).toEqual(['Too large'])
        expect(issueMessagesOf(2 ** 53)).toEqual(['Too large'])
    })

    it('refuses every value the input sends for text that cannot be saved', () => {
        for (const text of ['abc', '-5', TWENTY_DIGITS]) {
            expect(MONEY_VALUE_SCHEMA.safeParse(moneyFieldValue(text, USD)).success).toBe(false)
        }
    })

    // Hermes on native may not ship Intl.supportedValuesOf; a save must still validate.
    it('refuses malformed text without throwing when Intl.supportedValuesOf is missing', async () => {
        const original = Object.getOwnPropertyDescriptor(Intl, 'supportedValuesOf')
        Reflect.deleteProperty(Intl, 'supportedValuesOf')
        try {
            vi.resetModules()
            const fresh = await import('../tinycld/books/lib/money-input')
            let result: ReturnType<typeof fresh.MONEY_VALUE_SCHEMA.safeParse> | undefined
            expect(() => {
                result = fresh.MONEY_VALUE_SCHEMA.safeParse('abc')
            }).not.toThrow()
            expect(result?.success).toBe(false)
            expect(result?.error?.issues.map(issue => issue.message)).toEqual([
                'Enter an amount such as 1,250.00',
            ])
            expect(fresh.MONEY_VALUE_SCHEMA.safeParse(125000).success).toBe(true)
        } finally {
            if (original) Object.defineProperty(Intl, 'supportedValuesOf', original)
        }
    })
})

describe('moneyHostText', () => {
    it('shows the stored value when nothing is typed', () => {
        expect(moneyHostText(null, 125000, USD)).toBe('1,250.00')
    })

    it('keeps the typed text while it matches the value', () => {
        expect(moneyHostText('1250', 125000, USD)).toBe('1250')
    })

    it('shows malformed text, which is the value itself', () => {
        expect(moneyHostText('1,2', '1,2', USD)).toBe('1,2')
    })

    it('shows the value when an outside reset changed it', () => {
        expect(moneyHostText('1250', 0, USD)).toBe('')
    })
})
