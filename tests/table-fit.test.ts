import { describe, expect, it } from 'vitest'
import { showsTableCards, tableMinWidth } from '../tinycld/books/lib/table-fit'

// A table's own minimum width: each cell at its minimum (a fixed cell at its width), the gaps
// between the cells and the row's padding. Below it the list draws cards.
describe('tableMinWidth', () => {
    it('adds each minimum, a gap between each two cells, and the padding', () => {
        const fixed = { width: 100 }
        const shrinking = { width: 150, minWidth: 72 }
        const growing = { minWidth: 88 }
        expect(tableMinWidth({ cells: [fixed, shrinking, growing], gap: 8, padding: 32 })).toBe(
            100 + 72 + 88 + 2 * 8 + 32
        )
    })

    it('takes the minWidth of a cell that has both a width and a minWidth', () => {
        expect(tableMinWidth({ cells: [{ width: 150, minWidth: 72 }], gap: 8, padding: 0 })).toBe(
            72
        )
    })

    it('adds no gap for one cell', () => {
        expect(tableMinWidth({ cells: [{ width: 100 }], gap: 8, padding: 32 })).toBe(132)
    })
})

// A party list draws cards on a phone, or when its own width cannot hold the table
// that ListTable draws: the table's minimum plus the scrollbar gutter that ListTable
// adds to its scroller content. A table never scrolls sideways (CLAUDE.md).

describe('showsTableCards', () => {
    it('shows cards on a phone at any width', () => {
        expect(showsTableCards({ isPhone: true, width: null, minWidth: 640, gutter: 0 })).toBe(true)
        expect(showsTableCards({ isPhone: true, width: 1200, minWidth: 640, gutter: 15 })).toBe(
            true
        )
    })

    it('follows the breakpoint alone before the first layout', () => {
        expect(showsTableCards({ isPhone: false, width: null, minWidth: 640, gutter: 15 })).toBe(
            false
        )
    })

    it('shows the table when the width is exactly the minimum and there is no gutter', () => {
        expect(showsTableCards({ isPhone: false, width: 640, minWidth: 640, gutter: 0 })).toBe(
            false
        )
    })

    it('shows cards when the width is below the minimum', () => {
        expect(showsTableCards({ isPhone: false, width: 639, minWidth: 640, gutter: 0 })).toBe(true)
    })

    it('shows cards when the width holds the minimum but not the gutter', () => {
        expect(showsTableCards({ isPhone: false, width: 645, minWidth: 640, gutter: 15 })).toBe(
            true
        )
    })

    it('shows the table when the width holds the minimum and the gutter', () => {
        expect(showsTableCards({ isPhone: false, width: 655, minWidth: 640, gutter: 15 })).toBe(
            false
        )
    })
})
