import { describe, expect, it } from 'vitest'
import type { EntryFormLine } from '../tinycld/books/lib/entry-lines'
import {
    defaultReverseDate,
    type EntryFormValues,
    entryResolver,
    newEntryDefaults,
    postSchema,
    reverseSchema,
    saveDraftSchema,
} from '../tinycld/books/lib/entry-schema'
import { amountText, maxStoredAmount } from '../tinycld/books/lib/money'

const line = (over: Partial<EntryFormLine> = {}): EntryFormLine => ({
    id: '',
    account: 'acc1',
    debit: '',
    credit: '',
    memo: '',
    ...over,
})

const issuesOf = (result: {
    success: boolean
    error?: { issues: { message: string; path: PropertyKey[] }[] }
}) => result.error?.issues ?? []

const values = (over: Partial<EntryFormValues> = {}): EntryFormValues => ({
    date: '2026-10-15',
    memo: '',
    autoReverseOn: '',
    lines: [line({ debit: '$10.00' }), line({ account: 'acc2', credit: '$10.00' })],
    ...over,
})

describe('saveDraftSchema', () => {
    it('accepts a balanced entry', () => {
        expect(saveDraftSchema.safeParse(values()).success).toBe(true)
    })

    it('accepts an entry whose blank lines are absent', () => {
        expect(saveDraftSchema.safeParse(values({ lines: [] })).success).toBe(true)
    })

    it('accepts blank lines', () => {
        const blank = line({ account: '' })
        expect(saveDraftSchema.safeParse(values({ lines: [blank, blank] })).success).toBe(true)
    })

    it('rejects a bad date', () => {
        for (const date of ['2026-02-30', 'tomorrow']) {
            const result = saveDraftSchema.safeParse(values({ date }))
            expect(result.success).toBe(false)
            expect(issuesOf(result)).toContainEqual(
                expect.objectContaining({
                    path: ['date'],
                    message: 'Enter a date as YYYY-MM-DD',
                })
            )
        }
    })

    it('rejects 201 lines', () => {
        const lines = Array.from({ length: 201 }, () => line({ debit: '$1.00' }))
        const result = saveDraftSchema.safeParse(values({ lines }))
        expect(result.success).toBe(false)
        expect(JSON.stringify(result.error?.issues)).toContain(
            'An entry can have at most 200 lines.'
        )
    })

    it('accepts 200 lines', () => {
        const lines = Array.from({ length: 200 }, () => line({ debit: '$1.00' }))
        expect(saveDraftSchema.safeParse(values({ lines })).success).toBe(true)
    })

    it('rejects a line with an amount but no account', () => {
        const result = saveDraftSchema.safeParse(
            values({ lines: [line({ account: '', debit: '$5.00' })] })
        )
        expect(result.success).toBe(false)
        expect(issuesOf(result)).toContainEqual(
            expect.objectContaining({ path: ['lines', 0, 'account'], message: 'Choose an account' })
        )
    })

    it('rejects a memo-only line with no account', () => {
        const result = saveDraftSchema.safeParse(
            values({ lines: [line({ account: '', memo: 'note' })] })
        )
        expect(result.success).toBe(false)
        expect(issuesOf(result)).toContainEqual(
            expect.objectContaining({ path: ['lines', 0, 'account'], message: 'Choose an account' })
        )
    })

    it('rejects a negative debit on the debit path', () => {
        const result = saveDraftSchema.safeParse(
            values({ lines: [line({ debit: '-5.00' }), line({ credit: '-5.00' })] })
        )
        expect(result.success).toBe(false)
        expect(issuesOf(result)).toContainEqual(
            expect.objectContaining({
                path: ['lines', 0, 'debit'],
                message: 'Amounts cannot be negative',
            })
        )
    })

    it('rejects a negative credit on the credit path', () => {
        const result = saveDraftSchema.safeParse(
            values({
                lines: [line({ debit: '$5.00' }), line({ account: 'acc2', credit: '-5.00' })],
            })
        )
        expect(result.success).toBe(false)
        expect(issuesOf(result)).toContainEqual(
            expect.objectContaining({
                path: ['lines', 1, 'credit'],
                message: 'Amounts cannot be negative',
            })
        )
    })

    it('rejects an unparsable amount', () => {
        const result = saveDraftSchema.safeParse(values({ lines: [line({ debit: 'abc' })] }))
        expect(result.success).toBe(false)
        expect(issuesOf(result)).toContainEqual(
            expect.objectContaining({
                path: ['lines', 0, 'debit'],
                message: 'Enter an amount like 1,234.50',
            })
        )
    })

    it('rejects a line with both debit and credit', () => {
        const both = line({ debit: '$5.00', credit: '$5.00' })
        const result = saveDraftSchema.safeParse(values({ lines: [both] }))
        expect(result.success).toBe(false)
        expect(issuesOf(result)).toContainEqual(
            expect.objectContaining({
                path: ['lines', 0, 'credit'],
                message: 'Use a debit or a credit on a line, not both',
            })
        )
    })

    it('rejects an autoReverseOn on or before the date', () => {
        for (const autoReverseOn of ['2026-10-15', '2026-10-14']) {
            const result = saveDraftSchema.safeParse(values({ autoReverseOn }))
            expect(result.success).toBe(false)
            expect(issuesOf(result)).toContainEqual(
                expect.objectContaining({
                    path: ['autoReverseOn'],
                    message: 'The auto-reverse date must be after the entry date',
                })
            )
        }
    })

    it('accepts an autoReverseOn after the date and an empty one', () => {
        expect(saveDraftSchema.safeParse(values({ autoReverseOn: '2026-11-01' })).success).toBe(
            true
        )
        expect(saveDraftSchema.safeParse(values({ autoReverseOn: '' })).success).toBe(true)
    })

    it('rejects debits summing above maxStoredAmount with "Too large"', () => {
        const lines = [
            line({ debit: amountText(maxStoredAmount, 'USD') }),
            line({ account: 'acc2', debit: '$0.01' }),
        ]
        const result = saveDraftSchema.safeParse(values({ lines }))
        expect(result.success).toBe(false)
        expect(result.error?.issues.map(issue => issue.message)).toContain('Too large')
    })
})

describe('postSchema', () => {
    it('accepts a balanced two-line entry', () => {
        expect(postSchema.safeParse(values()).success).toBe(true)
    })

    it('rejects fewer than two lines with an amount', () => {
        const oneAmount = [line({ debit: '$10.00' }), line({ account: 'acc2' })]
        const noAmounts = [line(), line({ account: 'acc2' })]
        for (const lines of [oneAmount, [line({ debit: '$10.00' })], noAmounts, []]) {
            const result = postSchema.safeParse(values({ lines }))
            expect(result.success).toBe(false)
            expect(issuesOf(result).map(issue => issue.message)).toContain(
                'Enter an amount on at least two lines'
            )
        }
    })

    it('rejects debits that differ from credits', () => {
        const lines = [line({ debit: '$10.00' }), line({ account: 'acc2', credit: '$9.00' })]
        const result = postSchema.safeParse(values({ lines }))
        expect(result.success).toBe(false)
        expect(issuesOf(result).map(issue => issue.message)).toContain(
            'Debits and credits must be equal before this entry can be posted.'
        )
    })

    it('save-draft accepts a one-line entry that post rejects', () => {
        const input = values({ lines: [line({ debit: '$10.00' })] })
        expect(saveDraftSchema.safeParse(input).success).toBe(true)
        expect(postSchema.safeParse(input).success).toBe(false)
    })
})

describe('entryResolver', () => {
    const unbalanced = values({
        lines: [line({ debit: '$10.00' }), line({ account: 'acc2', credit: '$9.00' })],
    })
    const options = { fields: {}, shouldUseNativeValidation: false }

    it('validates with the post rules in post mode', async () => {
        const result = await entryResolver(() => 'post')(unbalanced, undefined, options)
        expect(result.errors).toHaveProperty('lines')
        expect(result.values).toEqual({})
    })

    it('validates with the save-draft rules in draft mode', async () => {
        const result = await entryResolver(() => 'draft')(unbalanced, undefined, options)
        expect(result.errors).toEqual({})
        expect(result.values).toEqual(unbalanced)
    })
})

describe('reverseSchema', () => {
    it('rejects a date before the entry date', () => {
        expect(
            reverseSchema('2026-10-15').safeParse({ date: '2026-10-14', memo: 'x' }).success
        ).toBe(false)
    })

    it('accepts the entry date', () => {
        expect(
            reverseSchema('2026-10-15').safeParse({ date: '2026-10-15', memo: 'x' }).success
        ).toBe(true)
    })
})

describe('defaultReverseDate', () => {
    it('is the first of the next month', () => {
        expect(defaultReverseDate('2026-10-15', '2026-10-20')).toBe('2026-11-01')
    })

    it('is today when today is later', () => {
        expect(defaultReverseDate('2026-10-15', '2026-12-09')).toBe('2026-12-09')
    })

    it('rolls over the year', () => {
        expect(defaultReverseDate('2026-12-15', '2026-12-16')).toBe('2027-01-01')
    })
})

describe('newEntryDefaults', () => {
    it('has the date and two blank lines', () => {
        const defaults = newEntryDefaults('2026-10-31')
        expect(defaults.date).toBe('2026-10-31')
        expect(defaults.lines).toHaveLength(2)
        for (const l of defaults.lines) {
            expect(l).toEqual({ id: '', account: '', debit: '', credit: '', memo: '' })
        }
    })
})
