import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    DEPOSIT_ITEM_COLUMNS,
    DEPOSIT_LINE_COLUMNS,
    depositItemsMinWidth,
    depositLinesMinWidth,
    depositReadLinesMinWidth,
} from '../tinycld/books/lib/deposit-columns'

// The deposit grids' columns (bank deposit spec §3.4, §3.5, §3.8): the tick and remove
// columns are 44 px; every data column is flex with a least width of 95 px. A grid's least
// width is its columns, a 12 px gap between two cells and 8 px of row padding on each side;
// below it the section shows cards.

const GAP = 12
const PADDING = 8

type Column = number | { width?: number; minWidth?: number; flex?: number }

function leastOf(column: Column): number {
    if (typeof column === 'number') return column
    return column.width ?? column.minWidth ?? 0
}

function leastWidth(columns: readonly Column[]): number {
    const cells = columns.reduce<number>((sum, column) => sum + leastOf(column), 0)
    return cells + (columns.length - 1) * GAP + 2 * PADDING
}

describe('deposit column widths', () => {
    it('gives the items grid a 44 tick column and flex data columns 2 / 2 / 1.2 / 1.6 / 1.6 of least width 95', () => {
        const col = DEPOSIT_ITEM_COLUMNS
        expect(leastOf(col.tick)).toBe(44)
        expect(col.party).toMatchObject({ flex: 2, minWidth: 95 })
        expect(col.transaction).toMatchObject({ flex: 2, minWidth: 95 })
        expect(col.date).toMatchObject({ flex: 1.2, minWidth: 95 })
        expect(col.payment).toMatchObject({ flex: 1.6, minWidth: 95 })
        expect(col.amount).toMatchObject({ flex: 1.6, minWidth: 95 })
    })

    it('gives the other funds table flex columns 2 / 2 / 2 / 1.6 of least width 95 and a 44 remove column', () => {
        const col = DEPOSIT_LINE_COLUMNS
        expect(col.party).toMatchObject({ flex: 2, minWidth: 95 })
        expect(col.account).toMatchObject({ flex: 2, minWidth: 95 })
        expect(col.description).toMatchObject({ flex: 2, minWidth: 95 })
        expect(col.amount).toMatchObject({ flex: 1.6, minWidth: 95 })
        expect(leastOf(col.remove)).toBe(44)
    })

    it('makes each least width the sum of its columns, gaps and padding', () => {
        const items = Object.values(DEPOSIT_ITEM_COLUMNS) as Column[]
        const lines = Object.values(DEPOSIT_LINE_COLUMNS) as Column[]
        const { remove: _remove, ...readLines } = DEPOSIT_LINE_COLUMNS
        expect(depositItemsMinWidth).toBe(leastWidth(items))
        expect(depositLinesMinWidth).toBe(leastWidth(lines))
        expect(depositReadLinesMinWidth).toBe(leastWidth(Object.values(readLines) as Column[]))
        // Tick 44 + 5 × 95, 5 gaps, 2 × 8 padding.
        expect(depositItemsMinWidth).toBe(595)
        // 4 × 95 + remove 44, 4 gaps, 2 × 8 padding.
        expect(depositLinesMinWidth).toBe(488)
        // 4 × 95, 3 gaps, 2 × 8 padding.
        expect(depositReadLinesMinWidth).toBe(432)
    })
})

// The header and every row read the one column constant, so a column lines up from the
// header down: the read view's grids take their cell styles from the shared constants and
// declare no flex or least width of their own.
describe('the read view grids read the shared column constants', () => {
    const source = (file: string) =>
        readFileSync(
            join(__dirname, '..', 'tinycld', 'books', 'components', 'deposits', file),
            'utf8'
        )

    it.each([
        ['DepositItemsRead.tsx', 'DEPOSIT_ITEM_COLUMNS'],
        ['DepositLinesRead.tsx', 'DEPOSIT_LINE_COLUMNS'],
    ])('%s styles its header and rows from %s', (file, constant) => {
        const text = source(file)
        expect(text).toContain(constant)
        expect(text).not.toMatch(/minWidth:\s*\d/)
        expect(text).not.toMatch(/flex:\s*\d/)
    })
})
