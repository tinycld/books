import { describe, expect, it } from 'vitest'
import { bandIndexAt, indexAt, itemTop, windowRange } from '../tinycld/books/lib/opening-window'

const uniform = (count: number, height: number) => Array.from({ length: count }, () => height)
// Band header 48, card 124, as on a phone grid.
const MIXED = [48, 124, 124, 124, 48, 124, 124, 48, 124, 124]

function total(heights: readonly number[]) {
    return heights.reduce((sum, h) => sum + h, 0)
}

function renderedHeight(heights: readonly number[], first: number, last: number) {
    return total(heights.slice(first, last))
}

describe('itemTop and indexAt', () => {
    it('sums the heights above an item and clamps past the end', () => {
        expect(itemTop(MIXED, 0)).toBe(0)
        expect(itemTop(MIXED, 2)).toBe(172)
        expect(itemTop(MIXED, 99)).toBe(total(MIXED))
    })

    it('finds the item that covers a y, on boundaries too', () => {
        expect(indexAt(MIXED, 0)).toBe(0)
        expect(indexAt(MIXED, 47)).toBe(0)
        expect(indexAt(MIXED, 48)).toBe(1)
        expect(indexAt(MIXED, 171)).toBe(1)
        expect(indexAt(MIXED, 172)).toBe(2)
    })

    it('clamps to the last item and returns 0 for an empty list', () => {
        expect(indexAt(MIXED, 1e6)).toBe(MIXED.length - 1)
        expect(indexAt([], 100)).toBe(0)
    })
})

describe('windowRange', () => {
    it('matches the fixed-row result for uniform heights', () => {
        const heights = uniform(2000, 64)
        const range = windowRange({
            heights,
            scrollY: 64 * 500,
            offset: 0,
            viewHeight: 480,
            overscan: 6,
        })
        expect(range.firstVisible).toBe(500)
        expect(range.first).toBe(494)
        expect(range.last).toBe(514)
        expect(range.topSpace).toBe(494 * 64)
        expect(range.bottomSpace).toBe((2000 - 514) * 64)
    })

    it('windows mixed heights and the spacers add up to the whole list', () => {
        const range = windowRange({
            heights: MIXED,
            scrollY: 200,
            offset: 0,
            viewHeight: 250,
            overscan: 0,
        })
        // y=200 is inside item 2 (172..296); 450 reaches into item 3 (296..420) and 4 (420..468).
        expect(range.firstVisible).toBe(2)
        expect(range.first).toBe(2)
        expect(range.last).toBe(5)
        expect(range.topSpace).toBe(172)
        expect(
            range.topSpace + renderedHeight(MIXED, range.first, range.last) + range.bottomSpace
        ).toBe(total(MIXED))
    })

    it('shifts the window by the offset and clamps a scroll above it to the top', () => {
        const base = { heights: MIXED, viewHeight: 250, overscan: 0, offset: 300 }
        expect(windowRange({ ...base, scrollY: 300 }).firstVisible).toBe(0)
        expect(windowRange({ ...base, scrollY: 100 })).toEqual(
            windowRange({ ...base, scrollY: 300 })
        )
        expect(windowRange({ ...base, scrollY: 300 + 172 }).firstVisible).toBe(2)
    })

    it('extends first and last with overscan but not firstVisible', () => {
        const input = { heights: MIXED, scrollY: 200, offset: 0, viewHeight: 250 }
        const plain = windowRange({ ...input, overscan: 0 })
        const padded = windowRange({ ...input, overscan: 1 })
        expect(padded.firstVisible).toBe(plain.firstVisible)
        expect(padded.first).toBe(plain.first - 1)
        expect(padded.last).toBe(plain.last + 1)
    })

    it('clamps first at 0 and last at the list length', () => {
        const top = windowRange({
            heights: MIXED,
            scrollY: 0,
            offset: 0,
            viewHeight: 100,
            overscan: 6,
        })
        expect(top.first).toBe(0)
        expect(top.topSpace).toBe(0)
        const bottom = windowRange({
            heights: MIXED,
            scrollY: total(MIXED) + 500,
            offset: 0,
            viewHeight: 400,
            overscan: 6,
        })
        expect(bottom.firstVisible).toBe(MIXED.length - 1)
        expect(bottom.last).toBe(MIXED.length)
        expect(bottom.bottomSpace).toBe(0)
    })

    it('handles an empty list', () => {
        expect(
            windowRange({ heights: [], scrollY: 0, offset: 0, viewHeight: 400, overscan: 6 })
        ).toEqual({ first: 0, last: 0, firstVisible: 0, topSpace: 0, bottomSpace: 0 })
    })

    it('handles a leading offset taller than the viewport', () => {
        const range = windowRange({
            heights: MIXED,
            scrollY: 500,
            offset: 900,
            viewHeight: 400,
            overscan: 1,
        })
        // Scrolled less than the offset: the list is still below the fold, so the top is rendered.
        expect(range.firstVisible).toBe(0)
        expect(range.first).toBe(0)
        // y is 0; 400px reaches items 0..3 (48+124*3=420), so the bottom index is 4 and
        // overscan 1 makes last 5. Items 0..4 span 468; the list is 1012 tall.
        expect(range.last).toBe(5)
        expect(range.topSpace).toBe(0)
        expect(range.bottomSpace).toBe(544)
    })
})

describe('bandIndexAt', () => {
    const items = [{ kind: 'band' }, { kind: 'row' }, { kind: 'band' }, { kind: 'row' }] as const

    it('finds the nearest band at or above each index', () => {
        expect(bandIndexAt(items, 0)).toBe(0)
        expect(bandIndexAt(items, 1)).toBe(0)
        expect(bandIndexAt(items, 2)).toBe(2)
        expect(bandIndexAt(items, 3)).toBe(2)
    })

    it('returns -1 when no band precedes the index', () => {
        expect(bandIndexAt([{ kind: 'row' }, { kind: 'band' }], 0)).toBe(-1)
    })

    it('clamps an index past the end to the last item', () => {
        expect(bandIndexAt(items, 99)).toBe(2)
    })

    it('returns -1 for an empty list', () => {
        expect(bandIndexAt([], 0)).toBe(-1)
    })
})
