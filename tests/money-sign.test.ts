import { describe, expect, it } from 'vitest'
import { flipMoneySign } from '../tinycld/books/lib/money-text'

// The "±" press target of MoneyTextField (bank deposit spec §6: a negative amount must be
// typeable on iOS and Android, whose decimal keyboards have no minus key). It flips the sign
// of the typed text; text with nothing to flip stays as it is.

describe('flipMoneySign', () => {
    it('leaves an empty field empty', () => {
        expect(flipMoneySign('')).toBe('')
    })

    it('makes a positive amount negative', () => {
        expect(flipMoneySign('12.50')).toBe('-12.50')
    })

    it('makes a negative amount positive', () => {
        expect(flipMoneySign('-12.50')).toBe('12.50')
    })

    it('flips twice back to the same text', () => {
        expect(flipMoneySign(flipMoneySign('1,234.50'))).toBe('1,234.50')
    })

    // Zero has no sign: "-0" would read as money out of nothing.
    it('leaves 0 as 0', () => {
        expect(flipMoneySign('0')).toBe('0')
    })

    it('trims the spaces around the amount before it flips', () => {
        expect(flipMoneySign('  12.50 ')).toBe('-12.50')
        expect(flipMoneySign(' -12.50  ')).toBe('12.50')
    })

    it('leaves text that is not money as typed, for the field’s message', () => {
        expect(flipMoneySign('abc')).toBe('abc')
        expect(flipMoneySign('   ')).toBe('   ')
    })
})
