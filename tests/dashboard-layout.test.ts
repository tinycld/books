import { describe, expect, it } from 'vitest'
import {
    columnsFor,
    gridRows,
    THREE_COLUMNS_FROM,
    TWO_COLUMNS_FROM,
} from '../tinycld/books/lib/dashboard-layout'

// Spec §3 "The page": three columns at 1100 px of page width and wider, two from 700 px,
// one below.
describe('columnsFor', () => {
    it('has its breakpoints at 700 and 1100', () => {
        expect(TWO_COLUMNS_FROM).toBe(700)
        expect(THREE_COLUMNS_FROM).toBe(1100)
    })

    it.each([0, 660, 699])('is one column at %i', width => {
        expect(columnsFor(width)).toBe(1)
    })

    it.each([700, 955, 1099])('is two columns at %i', width => {
        expect(columnsFor(width)).toBe(2)
    })

    it.each([1100, 1275])('is three columns at %i', width => {
        expect(columnsFor(width)).toBe(3)
    })
})

describe('gridRows', () => {
    const items = ['a', 'b', 'c', 'd', 'e']

    it('pads a short last row with null at three columns', () => {
        expect(gridRows(items, 3)).toEqual([
            ['a', 'b', 'c'],
            ['d', 'e', null],
        ])
    })

    it('pads a short last row with null at two columns', () => {
        expect(gridRows(items, 2)).toEqual([
            ['a', 'b'],
            ['c', 'd'],
            ['e', null],
        ])
    })

    it('gives five rows of one at one column', () => {
        expect(gridRows(items, 1)).toEqual([['a'], ['b'], ['c'], ['d'], ['e']])
    })

    it('gives [] for no items', () => {
        expect(gridRows([], 3)).toEqual([])
    })
})
