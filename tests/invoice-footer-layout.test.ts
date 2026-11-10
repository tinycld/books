import { TABLE_GRID_GAP } from '@tinycld/core/ui/forms/fields/table-layout'
import { describe, expect, it } from 'vitest'
import { INVOICE_FOOTER_SPANS } from '../tinycld/books/lib/invoice-footer-layout'
import { INVOICE_LINE_COLUMNS, INVOICE_ROW_KINDS } from '../tinycld/books/lib/invoice-lines'

// The columns with a floor: a cell that must show its whole value at the narrowest grid.
const FLOORED = ['quantity', 'rate', 'percent', 'amount', 'taxable'] as const

// The footer's spans over the item row's slots: the totals start at Qty and end at Amount.
const SPAN_SLOTS = {
    left: ['product', 'description'],
    totals: ['quantity', 'rate', 'amount'],
    right: ['taxable'],
} as const

function column(key: string) {
    const found = INVOICE_LINE_COLUMNS.find(c => c.key === key)
    if (!found) throw new Error(`no lines column ${key}`)
    return found
}

// Core gives a column without `flex` the weight 1 and without `minWidth` the floor 0.
const weightOf = (key: string) => column(key).flex ?? 1
const floorOf = (key: string) => column(key).minWidth ?? 0

describe('invoice line column floors and footer spans', () => {
    it('floors every numeric column with one floor-to-weight ratio, Percent as Rate', () => {
        for (const key of FLOORED) {
            expect(floorOf(key), `${key} floor`).toBeGreaterThan(0)
        }
        const ratio = floorOf('quantity') / weightOf('quantity')
        for (const key of FLOORED) {
            expect(floorOf(key) / weightOf(key), `${key} floor / weight`).toBeCloseTo(ratio, 6)
        }
        // A Percent line draws its cell in the Rate slot.
        expect(column('percent').minWidth).toBe(column('rate').minWidth)
        expect(column('percent').flex).toBe(column('rate').flex)
    })

    it('lays the footer spans on the item row slots it covers', () => {
        // Guards the span groups below against a change of the item row's slots.
        expect(INVOICE_ROW_KINDS[0]?.columns).toEqual([
            ...SPAN_SLOTS.left,
            ...SPAN_SLOTS.totals,
            ...SPAN_SLOTS.right,
        ])
    })

    for (const [name, keys] of Object.entries(SPAN_SLOTS)) {
        it(`gives the ${name} span its slots' weight, gap basis and summed floors`, () => {
            const span = INVOICE_FOOTER_SPANS[name as keyof typeof SPAN_SLOTS]
            const gaps = (keys.length - 1) * TABLE_GRID_GAP
            const weight = keys.reduce((sum, key) => sum + weightOf(key), 0)
            const floors = keys.reduce((sum, key) => sum + floorOf(key), 0)
            expect(span.flexGrow).toBeCloseTo(weight, 6)
            expect(span.flexBasis).toBe(gaps)
            expect(span.minWidth).toBe(floors + gaps)
            // A span over a floored slot has a floor of its own beyond its gaps.
            const floored = keys.some(key => (FLOORED as readonly string[]).includes(key))
            if (floored) expect(span.minWidth).toBeGreaterThan(gaps)
        })
    }
})
