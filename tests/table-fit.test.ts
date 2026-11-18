import { describe, expect, it } from 'vitest'
import { showsTableCards } from '../tinycld/books/lib/table-fit'

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
