import { describe, expect, it } from 'vitest'
import {
    dropBlankLines,
    type EntryFormLine,
    formatAmountOnBlur,
    moveLine,
    parseAmountText,
    planLineWrites,
    shouldClearOtherSide,
    sumLines,
} from '../tinycld/books/lib/entry-lines'
import { amountText, maxStoredAmount } from '../tinycld/books/lib/money'

const line = (over: Partial<EntryFormLine> = {}): EntryFormLine => ({
    id: '',
    account: '',
    debit: '',
    credit: '',
    memo: '',
    ...over,
})

describe('parseAmountText', () => {
    it('parses grouped and dollar-prefixed text to cents', () => {
        expect(parseAmountText('1,234.50')).toBe(123450)
        expect(parseAmountText('$1,234.5')).toBe(123450)
    })

    it('treats blank as zero', () => {
        expect(parseAmountText('')).toBe(0)
    })

    it('returns null for unparsable text', () => {
        expect(parseAmountText('abc')).toBeNull()
        expect(parseAmountText('1,23')).toBeNull()
    })
})

describe('sumLines', () => {
    it('balances $0.10 + $0.20 against $0.30 without float drift', () => {
        const totals = sumLines([
            { debit: '$0.10', credit: '' },
            { debit: '$0.20', credit: '' },
            { debit: '', credit: '$0.30' },
        ])
        expect(totals.debits).toBe(30)
        expect(totals.credits).toBe(30)
        expect(totals.difference).toBe(0)
        expect(totals.isBalanced).toBe(true)
    })

    it('flags a side above maxStoredAmount as too large', () => {
        const totals = sumLines([
            { debit: amountText(maxStoredAmount, 'USD'), credit: '' },
            { debit: '0.01', credit: '' },
        ])
        expect(totals.isTooLarge).toBe(true)
        expect(totals.isBalanced).toBe(false)
    })

    it('flags a credit side above maxStoredAmount as too large', () => {
        const totals = sumLines([
            { debit: '', credit: amountText(maxStoredAmount, 'USD') },
            { debit: '', credit: '0.01' },
        ])
        expect(totals.isTooLarge).toBe(true)
    })

    it('does not flag a side exactly at maxStoredAmount', () => {
        const totals = sumLines([{ debit: amountText(maxStoredAmount, 'USD'), credit: '' }])
        expect(totals.isTooLarge).toBe(false)
    })

    it('makes bigTotal the larger side', () => {
        expect(
            sumLines([
                { debit: '5', credit: '' },
                { debit: '', credit: '2' },
            ]).bigTotal
        ).toBe(500)
        expect(
            sumLines([
                { debit: '2', credit: '' },
                { debit: '', credit: '7' },
            ]).bigTotal
        ).toBe(700)
    })

    it('sets hasInvalid for an unparsable cell', () => {
        const totals = sumLines([{ debit: 'abc', credit: '' }])
        expect(totals.hasInvalid).toBe(true)
        expect(totals.isBalanced).toBe(false)
    })

    it('reports the difference when out of balance', () => {
        const totals = sumLines([
            { debit: '10', credit: '' },
            { debit: '', credit: '4' },
        ])
        expect(totals.difference).toBe(600)
        expect(totals.isBalanced).toBe(false)
    })
})

describe('dropBlankLines', () => {
    it('drops a line with all four fields empty and keeps a memo-only line', () => {
        const memoOnly = line({ memo: 'note' })
        expect(dropBlankLines([line(), memoOnly])).toEqual([memoOnly])
    })
})

describe('moveLine', () => {
    it('moves an index up and down', () => {
        expect(moveLine(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
        expect(moveLine(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
    })

    it('leaves the array unchanged at the ends', () => {
        expect(moveLine(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
        expect(moveLine(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
    })

    it('does not mutate its input', () => {
        const input = ['a', 'b', 'c']
        moveLine(input, 1, -1)
        expect(input).toEqual(['a', 'b', 'c'])
    })
})

describe('shouldClearOtherSide', () => {
    it('is true for a value and false for whitespace', () => {
        expect(shouldClearOtherSide('5')).toBe(true)
        expect(shouldClearOtherSide('  ')).toBe(false)
    })
})

describe('formatAmountOnBlur', () => {
    it('formats a parsable amount', () => {
        expect(formatAmountOnBlur('1234.5', 'USD')).toBe('$1,234.50')
    })

    it.each(['EUR', 'CAD', 'GBP'])('round-trips through parseAmountText for %s', currency => {
        expect(parseAmountText(formatAmountOnBlur('1234.5', currency))).toBe(123450)
    })

    it('leaves blank and unparsable text alone', () => {
        expect(formatAmountOnBlur('', 'USD')).toBe('')
        expect(formatAmountOnBlur('abc', 'USD')).toBe('abc')
    })
})

describe('planLineWrites', () => {
    const saved = [
        line({ id: 'a', account: 'x', debit: '$1.00' }),
        line({ id: 'b', account: 'y', credit: '$1.00', memo: 'm' }),
    ]

    it('plans nothing for unchanged lines', () => {
        expect(
            planLineWrites(
                saved,
                saved.map(l => ({ ...l }))
            )
        ).toEqual({
            inserts: [],
            updates: [],
            deletes: [],
        })
    })

    it('inserts a line with an empty id', () => {
        const fresh = line({ account: 'z', debit: '$2.00' })
        const plan = planLineWrites(saved, [...saved, fresh])
        expect(plan.inserts).toEqual([fresh])
        expect(plan.updates).toEqual([])
        expect(plan.deletes).toEqual([])
    })

    it('updates only a line whose account, debit, credit or memo changed', () => {
        for (const change of [
            { account: 'q' },
            { debit: '$9.00' },
            { credit: '$9.00' },
            { memo: 'other' },
        ]) {
            const changed = { ...saved[1], ...change }
            const plan = planLineWrites(saved, [saved[0], changed])
            expect(plan.updates).toEqual([changed])
            expect(plan.inserts).toEqual([])
            expect(plan.deletes).toEqual([])
        }
    })

    it('deletes a middle saved line and keeps the later one as an update target', () => {
        const [a, b, c] = ['a', 'b', 'c'].map(id => line({ id, account: id, debit: '$1.00' }))
        const plan = planLineWrites([a, b, c], [a, c])
        expect(plan.deletes).toEqual(['b'])
        expect(plan.updates).toEqual([c])
    })

    it('deletes a saved id missing from next', () => {
        const plan = planLineWrites(saved, [saved[0]])
        expect(plan.deletes).toEqual(['b'])
        expect(plan.inserts).toEqual([])
        expect(plan.updates).toEqual([])
    })

    it('writes a reorder: both swapped lines are updated', () => {
        const plan = planLineWrites(saved, [saved[1], saved[0]])
        expect(plan.updates).toEqual([saved[1], saved[0]])
        expect(plan.inserts).toEqual([])
        expect(plan.deletes).toEqual([])
    })

    it('updates the later saved line when a new line is inserted before it', () => {
        const fresh = line({ account: 'z', debit: '$2.00' })
        const plan = planLineWrites(saved, [saved[0], fresh, saved[1]])
        expect(plan.inserts).toEqual([fresh])
        expect(plan.updates).toEqual([saved[1]])
        expect(plan.deletes).toEqual([])
    })

    it('leaves updates empty when the last saved line is deleted', () => {
        expect(planLineWrites(saved, [saved[0]]).updates).toEqual([])
    })
})
