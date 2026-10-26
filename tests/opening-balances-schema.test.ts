import { describe, expect, it } from 'vitest'
import { openingFormSchema } from '../tinycld/books/lib/opening-balances-schema'

const valid = {
    preset: 'custom',
    date: '2025-12-31',
    memo: '',
    amounts: {} as Record<string, string>,
}

function issues(closeDate: string, overrides: Partial<typeof valid>) {
    const result = openingFormSchema(closeDate).safeParse({ ...valid, ...overrides })
    if (result.success) return []
    return result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
    }))
}

describe('openingFormSchema date', () => {
    it('accepts a real day', () => {
        expect(openingFormSchema('').safeParse(valid).success).toBe(true)
    })

    it.each(['2025-02-30', '31/12/2025'])('refuses %j and names the date format', date => {
        const found = issues('', { date }).filter(issue => issue.path === 'date')
        expect(found.length).toBeGreaterThan(0)
        expect(found[0].message).toContain('YYYY-MM-DD')
    })

    it.each(['1899-12-31', '0026-10-25'])('refuses %j, a year before 1900', date => {
        expect(issues('', { date })).toEqual([
            { path: 'date', message: 'Enter a real date as YYYY-MM-DD' },
        ])
    })

    it('accepts 1900-01-01, the first allowed day', () => {
        expect(openingFormSchema('').safeParse({ ...valid, date: '1900-01-01' }).success).toBe(true)
    })

    it.each(['2025-03-31', '2025-01-01'])('refuses %j on or before the close date', date => {
        const found = issues('2025-03-31', { date }).filter(issue => issue.path === 'date')
        expect(found.map(issue => issue.message)).toEqual([
            'Books are closed through Mar 31, 2025. Pick a later date.',
        ])
    })

    it('accepts the day after the close date', () => {
        expect(
            openingFormSchema('2025-03-31').safeParse({ ...valid, date: '2025-04-01' }).success
        ).toBe(true)
    })
})

describe('openingFormSchema amounts', () => {
    it.each(['', '1,234.50', '-250'])('accepts %j', text => {
        expect(openingFormSchema('').safeParse({ ...valid, amounts: { a1: text } }).success).toBe(
            true
        )
    })

    it('refuses more than 2 decimals on the amount path', () => {
        expect(issues('', { amounts: { a1: '12.345' } })).toEqual([
            { path: 'amounts.a1', message: 'Enter an amount like 1,234.50' },
        ])
    })

    it('refuses an amount above the stored maximum', () => {
        expect(issues('', { amounts: { a1: '99,999,999,999,999,999' } })).toEqual([
            { path: 'amounts.a1', message: 'Amount is too large' },
        ])
    })

    it.each([
        '1,2',
        '12,34',
        ',5',
        '1,23,4',
        '1,,2',
        '0,500',
    ])('names the format for malformed grouping %j, not "too large"', text => {
        expect(issues('', { amounts: { a1: text } })).toEqual([
            { path: 'amounts.a1', message: 'Enter an amount like 1,234.50' },
        ])
    })
})

describe('openingFormSchema memo', () => {
    it('accepts 4000 characters and refuses 4001', () => {
        expect(openingFormSchema('').safeParse({ ...valid, memo: 'm'.repeat(4000) }).success).toBe(
            true
        )
        expect(issues('', { memo: 'm'.repeat(4001) }).map(issue => issue.path)).toContain('memo')
    })
})
