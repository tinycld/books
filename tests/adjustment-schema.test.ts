import { describe, expect, it } from 'vitest'
import { ADJUSTMENT_MESSAGES, adjustmentSchema } from '../tinycld/books/lib/adjustment-schema'
import type { AdjustmentLineValues, AdjustmentValues } from '../tinycld/books/lib/adjustment-values'
import { INVENTORY_TEXTS } from '../tinycld/books/lib/inventory-adjust-fixture'

// The adjustment form's one zod schema (inventory-adjust spec §3.3 Rules), for Save draft
// and Post alike. Blank lines (no item, no change, no value) are dropped before the rules
// run (`dropBlankLines` in a preprocess), so a new form's empty second line is not refused.
// A refusal key is the issue path joined with '.': `date`, `memo`, `lines.<n>.<field>`,
// `lines.<n>` for a line's own root error (drawn on the line), '' for the form's root
// (drawn in FormErrorSummary). The texts the server says too are its own
// (server/inventory_adjustments.go, server/inventory_adjustment_guards.go).

const NO_ITEM = 'Choose an Inventory item.'
const DECIMALS = 'Enter a quantity with at most 2 decimals.'
const OUT_OF_RANGE = 'Enter a quantity between -1,000,000 and 1,000,000.'
const INCREASE_BELOW_ZERO = 'A quantity increase cannot have a value below 0.'
const TOO_MANY_LINES = 'An inventory adjustment holds at most 500 lines.'

function line(fields: Partial<AdjustmentLineValues> = {}): AdjustmentLineValues {
    return {
        id: 'ialncase0000001',
        product: 'prodlabels00001',
        bin: '',
        newQuantity: '',
        change: '-3',
        value: '',
        ...fields,
    }
}

const BLANK = line({ product: '', change: '' })

function values(fields: Partial<AdjustmentValues> = {}): AdjustmentValues {
    return { date: '2026-11-20', account: '', memo: '', lines: [line()], ...fields }
}

function keyOf(path: readonly PropertyKey[]): string {
    const joined = path.map(String).join('.')
    if (joined === 'root' || joined === '') return ''
    return joined.endsWith('.root') ? joined.slice(0, -'.root'.length) : joined
}

function issuesOf(input: AdjustmentValues) {
    const result = adjustmentSchema.safeParse(input)
    if (result.success) return []
    return result.error.issues.map(issue => ({ key: keyOf(issue.path), message: issue.message }))
}

describe('adjustmentSchema', () => {
    it('takes one decrease line', () => {
        expect(issuesOf(values())).toEqual([])
    })

    it('drops the blank lines before it checks, and saves without them', () => {
        const result = adjustmentSchema.safeParse(values({ lines: [line(), BLANK] }))
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.lines).toHaveLength(1)
        expect(result.data.lines[0]?.change).toBe('-3')
    })

    it('refuses no line after the blank lines are dropped, on the form', () => {
        expect(issuesOf(values({ lines: [BLANK, { ...BLANK, id: 'ialncase0000002' }] }))).toEqual([
            { key: '', message: INVENTORY_TEXTS.noLines },
        ])
    })

    it('refuses a line with no item, on its Item', () => {
        expect(issuesOf(values({ lines: [line({ product: '' })] }))).toEqual([
            { key: 'lines.0.product', message: NO_ITEM },
        ])
    })

    it('refuses Change 0 with Value change 0, on the line', () => {
        expect(issuesOf(values({ lines: [line({ change: '0', value: '0.00' })] }))).toEqual([
            { key: 'lines.0', message: INVENTORY_TEXTS.lineEmpty },
        ])
    })

    it('refuses an item with no Change and no Value change, on the line', () => {
        expect(issuesOf(values({ lines: [line({ change: '', value: '' })] }))).toEqual([
            { key: 'lines.0', message: INVENTORY_TEXTS.lineEmpty },
        ])
    })

    it('refuses Change 0 with an empty Value change: a revaluation needs its value', () => {
        expect(issuesOf(values({ lines: [line({ change: '0', value: '' })] }))).toEqual([
            { key: 'lines.0', message: INVENTORY_TEXTS.lineEmpty },
        ])
    })

    it('takes Change 0 with a Value change below 0 (a revaluation down)', () => {
        expect(issuesOf(values({ lines: [line({ change: '0', value: '-5.00' })] }))).toEqual([])
    })

    it('refuses a Change with 3 decimals, on its Change', () => {
        expect(issuesOf(values({ lines: [line({ change: '1.234' })] }))).toEqual([
            { key: 'lines.0.change', message: DECIMALS },
        ])
    })

    it('takes a Change with 2 decimals', () => {
        expect(issuesOf(values({ lines: [line({ change: '-1.25' })] }))).toEqual([])
    })

    it('refuses a Change above 1,000,000 or below −1,000,000, on its Change', () => {
        expect(issuesOf(values({ lines: [line({ change: '1000000.01' })] }))).toEqual([
            { key: 'lines.0.change', message: OUT_OF_RANGE },
        ])
        expect(issuesOf(values({ lines: [line({ change: '-1000000.01' })] }))).toEqual([
            { key: 'lines.0.change', message: OUT_OF_RANGE },
        ])
    })

    it('takes a Change of 1,000,000 and of −1,000,000', () => {
        expect(issuesOf(values({ lines: [line({ change: '1000000' })] }))).toEqual([])
        expect(issuesOf(values({ lines: [line({ change: '-1000000' })] }))).toEqual([])
    })

    it('refuses a Value change below 0 on an increase, on its Value change', () => {
        expect(issuesOf(values({ lines: [line({ change: '5', value: '-1.00' })] }))).toEqual([
            { key: 'lines.0.value', message: INCREASE_BELOW_ZERO },
        ])
    })

    it('takes an increase with an empty Value change (the last cost) or a Value change of 0', () => {
        expect(issuesOf(values({ lines: [line({ change: '5', value: '' })] }))).toEqual([])
        expect(issuesOf(values({ lines: [line({ change: '5', value: '0.00' })] }))).toEqual([])
    })

    it('takes the same item on two lines (a decrease and a revaluation)', () => {
        const decrease = line({ id: 'ialncase0000001', change: '-3' })
        const revalue = line({ id: 'ialncase0000002', change: '0', value: '5.00' })
        expect(issuesOf(values({ lines: [decrease, revalue] }))).toEqual([])
    })

    it('refuses 501 lines, on the form, and takes 500', () => {
        const many = (count: number) =>
            Array.from({ length: count }, (_, index) =>
                line({ id: `ialncase${String(index).padStart(7, '0')}` })
            )
        expect(issuesOf(values({ lines: many(501) }))).toEqual([
            { key: '', message: TOO_MANY_LINES },
        ])
        expect(issuesOf(values({ lines: many(500) }))).toEqual([])
    })

    it('refuses a Date that is not a day (isIsoDay), on the Date, with its message', () => {
        expect(issuesOf(values({ date: '2026-02-30' }))).toEqual([
            { key: 'date', message: ADJUSTMENT_MESSAGES.dateInvalid },
        ])
        expect(issuesOf(values({ date: '' }))).toEqual([
            { key: 'date', message: ADJUSTMENT_MESSAGES.dateInvalid },
        ])
    })

    it('refuses a Memo of 4,001 characters, on the Memo, with its message, and takes 4,000', () => {
        expect(issuesOf(values({ memo: 'm'.repeat(4001) }))).toEqual([
            { key: 'memo', message: ADJUSTMENT_MESSAGES.memoTooLong },
        ])
        expect(issuesOf(values({ memo: 'm'.repeat(4000) }))).toEqual([])
    })
})
