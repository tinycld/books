import { describe, expect, it } from 'vitest'
import { ROW_OVERSCAN, rowWindowBounds } from '../tinycld/books/hooks/useRowWindow'

const ROW_HEIGHT = 44
const VIEW_HEIGHT = 440

function bounds(firstVisible: number, total: number) {
    return rowWindowBounds({ firstVisible, total, rowHeight: ROW_HEIGHT, viewHeight: VIEW_HEIGHT })
}

describe('rowWindowBounds', () => {
    it('starts at row 0 when nothing is scrolled', () => {
        expect(bounds(0, 500).first).toBe(0)
    })

    it('starts ROW_OVERSCAN rows above the first visible row', () => {
        expect(ROW_OVERSCAN).toBe(6)
        expect(bounds(50, 500).first).toBe(44)
        expect(bounds(3, 500).first).toBe(0)
    })

    it('ends one view plus two overscans after the first row', () => {
        const { first, last } = bounds(50, 500)
        expect(last).toBe(first + 10 + ROW_OVERSCAN * 2)
    })

    it('still shows rows when total shrinks below a stale first visible row', () => {
        const { first, last } = bounds(90, 10)
        expect(last).toBe(10)
        expect(last).toBeGreaterThan(first)
        expect(first).toBeLessThanOrEqual(Math.max(0, 10 - Math.ceil(VIEW_HEIGHT / ROW_HEIGHT)))
    })

    it('spacers plus shown rows span the whole list', () => {
        for (const [firstVisible, total] of [
            [0, 500],
            [50, 500],
            [499, 500],
            [90, 10],
            [0, 0],
        ]) {
            const { first, last, topSpace, bottomSpace } = bounds(firstVisible, total)
            expect(topSpace + (last - first) * ROW_HEIGHT + bottomSpace).toBe(total * ROW_HEIGHT)
        }
    })
})
