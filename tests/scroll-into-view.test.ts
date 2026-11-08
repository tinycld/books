import { describe, expect, it } from 'vitest'
import { scrollIntoViewY } from '../tinycld/books/lib/scroll-into-view'

// A 400-high view scrolled to 200, with a 40-high sticky header over its top.
const VIEW = { scrollY: 200, viewHeight: 400, cover: 40 }

describe('scrollIntoViewY', () => {
    it('scrolls an item above the view to just under the sticky header', () => {
        expect(scrollIntoViewY({ ...VIEW, top: 100, bottom: 140 })).toBe(60)
    })

    it('scrolls an item hidden under the sticky header out from under it', () => {
        expect(scrollIntoViewY({ ...VIEW, top: 210, bottom: 250 })).toBe(170)
    })

    it('never scrolls above the top of the content', () => {
        expect(scrollIntoViewY({ ...VIEW, top: 20, bottom: 60 })).toBe(0)
    })

    it('scrolls an item below the view so its bottom edge meets the view’s bottom', () => {
        expect(scrollIntoViewY({ ...VIEW, top: 600, bottom: 640 })).toBe(240)
    })

    it('leaves an item that is fully in view where it is', () => {
        expect(scrollIntoViewY({ ...VIEW, top: 300, bottom: 340 })).toBeNull()
        // Exactly under the header and exactly at the bottom edge are in view.
        expect(scrollIntoViewY({ ...VIEW, top: 240, bottom: 280 })).toBeNull()
        expect(scrollIntoViewY({ ...VIEW, top: 560, bottom: 600 })).toBeNull()
    })

    it('does not scroll while the view is not measured', () => {
        // Before onLayout the view height is 0: any target computed from it is wrong.
        expect(
            scrollIntoViewY({ top: 80, bottom: 120, scrollY: 0, viewHeight: 0, cover: 40 })
        ).toBeNull()
        expect(
            scrollIntoViewY({ top: 10, bottom: 50, scrollY: 200, viewHeight: 0, cover: 40 })
        ).toBeNull()
    })
})
