import { describe, expect, it } from 'vitest'
import { TOO_LARGE_TEXT } from '../tinycld/books/lib/money'
import { centsToText, maxStoredAmount } from '../tinycld/books/lib/money-text'
import { paymentFigureText } from '../tinycld/books/lib/payment-texts'

// The header's big figure, "Amount received" (spec §3.2).
describe('paymentFigureText', () => {
    it('is the amount as money', () => {
        expect(paymentFigureText('1243.56', 'USD')).toBe('$1,243.56')
    })

    it('is a dash while the amount is empty or does not parse', () => {
        expect(paymentFigureText('', 'USD')).toBe('—')
        expect(paymentFigureText('abc', 'USD')).toBe('—')
    })

    it('is Too large above the stored-amount limit', () => {
        expect(TOO_LARGE_TEXT).toBe('Too large')
        expect(paymentFigureText(centsToText(maxStoredAmount + 1), 'USD')).toBe(TOO_LARGE_TEXT)
    })
})
