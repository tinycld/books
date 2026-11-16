import { describe, expect, it } from 'vitest'
import { centsToText, maxStoredAmount } from '../tinycld/books/lib/money-text'
import {
    afterPayTarget,
    hiddenText,
    openCountText,
    postedToastText,
    selectedText,
    totalFigureText,
} from '../tinycld/books/lib/pay-bills-texts'

// The texts of the Pay Bills screen (spec §3.2–§3.5) and where a Pay goes after it.

const USD = 'USD'

describe('postedToastText', () => {
    it('names one payment by its number', () => {
        expect(postedToastText(['1004'])).toBe('Posted Bill payment 1004')
    })

    it('counts several payments and gives their number range', () => {
        expect(postedToastText(['1004', '1005', '1006'])).toBe('Posted 3 bill payments (1004–1006)')
    })
})

describe('selectedText', () => {
    it('counts bills and vendors', () => {
        expect(selectedText(3, 2)).toBe('3 bills selected · 2 vendors')
        expect(selectedText(1, 1)).toBe('1 bill selected · 1 vendor')
    })

    it('says none is selected', () => {
        expect(selectedText(0, 0)).toBe('No bills selected')
    })
})

describe('hiddenText', () => {
    it('counts the selected bills the filter hides', () => {
        expect(hiddenText(2)).toBe('2 selected bills are hidden by the filter')
        expect(hiddenText(1)).toBe('1 selected bill is hidden by the filter')
    })
})

describe('openCountText', () => {
    it('counts the shown open bills', () => {
        expect(openCountText(4, 'new')).toBe('4 open bills')
        expect(openCountText(1, 'new')).toBe('1 open bill')
    })
})

describe('totalFigureText', () => {
    it('is the sum of the row payments as money', () => {
        const payments = {
            billone00000001: { amount: '700.00', open: 100_000, number: '1004' },
            billtwo00000001: { amount: '500', open: 100_000, number: '1005' },
        }
        expect(totalFigureText(payments, USD)).toBe('$1,200.00')
    })

    it('is a dash while a row amount does not parse', () => {
        const payments = {
            billone00000001: { amount: '700.00', open: 100_000, number: '1004' },
            billtwo00000001: { amount: '12.3.4', open: 100_000, number: '1005' },
        }
        expect(totalFigureText(payments, USD)).toBe('—')
    })

    it('is Too large above what Books can store', () => {
        const half = Math.floor(maxStoredAmount / 2) + 100
        const payments = {
            billone00000001: { amount: centsToText(half), open: half, number: '1004' },
            billtwo00000001: { amount: centsToText(half), open: half, number: '1005' },
        }
        expect(totalFigureText(payments, USD)).toBe('Too large')
    })
})

describe('afterPayTarget', () => {
    it('goes back when there is a screen to go back to', () => {
        expect(afterPayTarget(true, 'billpayfirst001')).toEqual({ kind: 'back' })
    })

    it('otherwise replaces the screen with the first payment’s read view', () => {
        expect(afterPayTarget(false, 'billpayfirst001')).toEqual({
            kind: 'replace',
            href: 'books/bill-payments/billpayfirst001',
        })
    })
})
