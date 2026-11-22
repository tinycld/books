import { describe, expect, it } from 'vitest'
import {
    ACCOUNT_CELL_STYLE,
    AMOUNT_CELL_STYLE,
    BALANCE_CELL_STYLE,
    DATE_CELL_STYLE,
    MEMO_CELL_STYLE,
    REF_CELL_STYLE,
    REGISTER_CELLS,
    REGISTER_ROW_GAP,
    REGISTER_ROW_PADDING,
    REGISTER_TABLE_MIN_WIDTH,
    TYPE_CELL_STYLE,
} from '../tinycld/books/lib/register-layout'
import { tableMinWidth } from '../tinycld/books/lib/table-fit'

// The register's list width at 1280 with the sidebar open: 1280 less the rail (64) and the
// desktop sidebar (260).
const LIST_WIDTH_AT_1280 = 956
// A classic (non-overlay) scrollbar's gutter, as CI's Linux Chromium draws it.
const CLASSIC_GUTTER = 15

describe('register layout', () => {
    it('computes the table minimum width from its cells, and it is 824', () => {
        expect(REGISTER_TABLE_MIN_WIDTH).toBe(
            tableMinWidth({
                cells: REGISTER_CELLS,
                gap: REGISTER_ROW_GAP,
                padding: REGISTER_ROW_PADDING,
            })
        )
        expect(REGISTER_TABLE_MIN_WIDTH).toBe(824)
    })

    it('lists the 8 cells of a row left to right', () => {
        expect(REGISTER_CELLS).toEqual([
            DATE_CELL_STYLE,
            REF_CELL_STYLE,
            TYPE_CELL_STYLE,
            MEMO_CELL_STYLE,
            ACCOUNT_CELL_STYLE,
            AMOUNT_CELL_STYLE,
            AMOUNT_CELL_STYLE,
            BALANCE_CELL_STYLE,
        ])
        expect(REGISTER_CELLS[0]).toBe(DATE_CELL_STYLE)
        expect(REGISTER_CELLS[1]).toBe(REF_CELL_STYLE)
        expect(REGISTER_CELLS[2]).toBe(TYPE_CELL_STYLE)
        expect(REGISTER_CELLS[3]).toBe(MEMO_CELL_STYLE)
        expect(REGISTER_CELLS[4]).toBe(ACCOUNT_CELL_STYLE)
        expect(REGISTER_CELLS[5]).toBe(AMOUNT_CELL_STYLE)
        expect(REGISTER_CELLS[6]).toBe(AMOUNT_CELL_STYLE)
        expect(REGISTER_CELLS[7]).toBe(BALANCE_CELL_STYLE)
    })

    it('gives every cell that can shrink or grow a minimum of 72 or more', () => {
        const flexing = REGISTER_CELLS.filter(cell => {
            const style: { flexShrink?: number; flexGrow?: number } = cell
            return (style.flexShrink ?? 0) > 0 || (style.flexGrow ?? 0) > 0
        })
        expect(flexing).toEqual([TYPE_CELL_STYLE, MEMO_CELL_STYLE, ACCOUNT_CELL_STYLE])
        for (const cell of flexing) {
            const style: { minWidth?: number } = cell
            expect(style.minWidth ?? 0).toBeGreaterThanOrEqual(72)
        }
    })

    it('fits the table with a classic scrollbar gutter at 1280 with the sidebar open', () => {
        expect(REGISTER_TABLE_MIN_WIDTH + CLASSIC_GUTTER).toBeLessThanOrEqual(LIST_WIDTH_AT_1280)
    })
})
