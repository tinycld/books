import { describe, expect, it } from 'vitest'
import { accountCountLabel, chartCountNote } from '../tinycld/books/lib/setup-copy'

describe('accountCountLabel', () => {
    it('is singular for one', () => {
        expect(accountCountLabel(1)).toBe('1 account')
    })

    it.each([0, 2, 31])('is plural for %i', count => {
        expect(accountCountLabel(count)).toBe(`${count} accounts`)
    })
})

describe('chartCountNote', () => {
    it('is empty for zero', () => {
        expect(chartCountNote(0)).toBe('')
    })

    it('is singular for one', () => {
        expect(chartCountNote(1)).toBe(
            '1 account is in your chart. Try again skips it and continues.'
        )
    })

    it.each([2, 31])('is plural for %i', count => {
        expect(chartCountNote(count)).toBe(
            `${count} accounts are in your chart. Try again skips them and continues.`
        )
    })
})
