import { describe, expect, it } from 'vitest'
import {
    adjustmentLineColumns,
    adjustmentLinesMinWidth,
} from '../tinycld/books/lib/adjustment-columns'

// The adjustment form's line grid (inventory-adjust spec §3.3): Item 180 + Bin 120 + On
// hand 80 + New quantity 96 + Change 96 + Value change 120 + menu 44, 6 gaps of 8 px and
// 48 px padding = 832 px; 704 px with no Bin column. Below it each line is a card.

describe('adjustmentLineColumns', () => {
    it('lists the columns in the spec’s order, and no Bin while the book has no bin', () => {
        expect(adjustmentLineColumns(true).map(column => column.key)).toEqual([
            'item',
            'bin',
            'onHand',
            'newQuantity',
            'change',
            'value',
            'menu',
        ])
        expect(adjustmentLineColumns(false).map(column => column.key)).not.toContain('bin')
    })

    it('labels the headers as the spec names them', () => {
        expect(adjustmentLineColumns(true).map(column => column.label)).toEqual([
            'Item',
            'Bin',
            'On hand',
            'New quantity',
            'Change',
            'Value change',
            '',
        ])
    })
})

describe('adjustmentLineColumns widths', () => {
    it('gives each column the spec’s minimum, and the row menu a fixed 44 px', () => {
        const widths = adjustmentLineColumns(true).map(column => [
            column.key,
            'width' in column.cell ? { width: column.cell.width } : column.cell.minWidth,
        ])
        expect(widths).toEqual([
            ['item', 180],
            ['bin', 120],
            ['onHand', 80],
            ['newQuantity', 96],
            ['change', 96],
            ['value', 120],
            ['menu', { width: 44 }],
        ])
    })
})

describe('adjustmentLinesMinWidth', () => {
    it('is 832 px with the Bin column and 704 px without it', () => {
        expect(adjustmentLinesMinWidth(true)).toBe(832)
        expect(adjustmentLinesMinWidth(false)).toBe(704)
    })
})
