import { describe, expect, it } from 'vitest'
import {
    QUANTITY_DECIMALS,
    QUANTITY_MALFORMED,
    QUANTITY_NEGATIVE,
    QUANTITY_TOO_LARGE,
} from '../tinycld/books/lib/product-messages'
import {
    MAX_QUANTITY,
    QUANTITY_VALUE_SCHEMA,
    quantityFieldValue,
    quantityHostText,
    quantityInputNumber,
    quantityInputText,
    quantityOnHandText,
} from '../tinycld/books/lib/quantity-input'

const messageOf = (value: unknown) =>
    QUANTITY_VALUE_SCHEMA.safeParse(value).error?.issues.map(issue => issue.message) ?? []

describe('quantityInputText', () => {
    it('shows nothing for 0 and for a value that is no number', () => {
        expect(quantityInputText(0)).toBe('')
        expect(quantityInputText(undefined)).toBe('')
        expect(quantityInputText('12')).toBe('')
        expect(quantityInputText(Number.NaN)).toBe('')
    })

    it('shows a stored quantity plain, with no trailing zeros', () => {
        expect(quantityInputText(12)).toBe('12')
        expect(quantityInputText(12.5)).toBe('12.5')
        expect(quantityInputText(0.07)).toBe('0.07')
    })
})

describe('quantityInputNumber', () => {
    it('reads empty text as 0', () => {
        expect(quantityInputNumber('')).toBe(0)
        expect(quantityInputNumber('   ')).toBe(0)
    })

    it('reads a plain decimal number, a comma thousands separator allowed', () => {
        expect(quantityInputNumber('12')).toBe(12)
        expect(quantityInputNumber(' 12.50 ')).toBe(12.5)
        expect(quantityInputNumber('1,250')).toBe(1250)
        expect(quantityInputNumber('.5')).toBe(0.5)
        expect(quantityInputNumber('1.')).toBe(1)
        expect(quantityInputNumber('-3')).toBe(-3)
    })

    it('reads text that is not a plain decimal number as null', () => {
        expect(quantityInputNumber('abc')).toBeNull()
        expect(quantityInputNumber('1e3')).toBeNull()
        expect(quantityInputNumber('.')).toBeNull()
        expect(quantityInputNumber('1.2.3')).toBeNull()
        expect(quantityInputNumber('0x10')).toBeNull()
    })
})

describe('quantityFieldValue', () => {
    it('sends the number when the text parses, else the text itself', () => {
        expect(quantityFieldValue('12.5')).toBe(12.5)
        expect(quantityFieldValue('')).toBe(0)
        expect(quantityFieldValue('abc')).toBe('abc')
    })
})

describe('QUANTITY_VALUE_SCHEMA', () => {
    it('passes 0, a whole quantity and one with 2 decimals, up to the stored maximum', () => {
        for (const value of [0, 12, 12.5, 0.07, 1.15, MAX_QUANTITY]) {
            expect(messageOf(value), String(value)).toEqual([])
        }
    })

    it('refuses text that did not parse', () => {
        expect(messageOf('abc')).toEqual([QUANTITY_MALFORMED])
    })

    it('refuses a negative quantity', () => {
        expect(messageOf(-1)).toEqual([QUANTITY_NEGATIVE])
    })

    it('refuses a quantity above the stored maximum', () => {
        expect(messageOf(MAX_QUANTITY + 1)).toEqual([QUANTITY_TOO_LARGE])
    })

    it('refuses a third decimal', () => {
        expect(messageOf(1.255)).toEqual([QUANTITY_DECIMALS])
        expect(messageOf(0.001)).toEqual([QUANTITY_DECIMALS])
    })
})

describe('quantityHostText', () => {
    it('keeps the typed text while it still reads as the value', () => {
        expect(quantityHostText('1.', 1)).toBe('1.')
        expect(quantityHostText('12.50', 12.5)).toBe('12.50')
        expect(quantityHostText('', 0)).toBe('')
    })

    it('shows text that did not parse as it was typed', () => {
        expect(quantityHostText('ab', 'ab')).toBe('ab')
    })

    it('shows a value that came from elsewhere plain', () => {
        expect(quantityHostText('3', 12.5)).toBe('12.5')
        expect(quantityHostText(null, 4)).toBe('4')
        expect(quantityHostText(null, 0)).toBe('')
    })
})

describe('quantityOnHandText', () => {
    it('shows 0 for no stock and for a value that is no number', () => {
        expect(quantityOnHandText(0)).toBe('0')
        expect(quantityOnHandText(undefined)).toBe('0')
    })

    it('shows the count, with its minus sign when the item is oversold', () => {
        expect(quantityOnHandText(12.5)).toBe('12.5')
        expect(quantityOnHandText(-4)).toBe('-4')
    })
})
