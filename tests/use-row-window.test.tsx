// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useRowWindow } from '../tinycld/books/hooks/useRowWindow'

const OPTIONS = { total: 2000, rowHeight: 64, viewHeight: 480 }

// A scroll event as React Native sends it; only the offset moves the window.
function scrollEvent(y: number) {
    return {
        nativeEvent: {
            contentOffset: { y },
            layoutMeasurement: { height: 480 },
            contentSize: { height: 128_000 },
        },
    }
}

function setup() {
    let renders = 0
    const hook = renderHook(() => {
        renders += 1
        return useRowWindow(OPTIONS)
    })
    return { hook, renders: () => renders }
}

function scrollTo(hook: ReturnType<typeof setup>['hook'], y: number) {
    act(() => hook.result.current.onScroll(scrollEvent(y)))
}

describe('useRowWindow', () => {
    it('does not re-render for scroll deltas inside one row', () => {
        const { hook, renders } = setup()
        const before = renders()
        scrollTo(hook, 10)
        scrollTo(hook, 30)
        expect(renders()).toBe(before)
        expect(hook.result.current.first).toBe(0)
    })

    it('re-renders and moves the window when the first visible row changes', () => {
        const { hook, renders } = setup()
        const before = renders()
        scrollTo(hook, 64 * 500)
        expect(renders()).toBeGreaterThan(before)
        // first row 500, minus the overscan of 6; 8 rows fit in 480px, plus 6 overscan below.
        expect(hook.result.current.first).toBe(494)
        expect(hook.result.current.last).toBe(514)
    })
})

describe('useRowWindow with per-item heights', () => {
    const heights = [48, 124, 124, 124, 48, 124, 124, 48, 124, 124]

    it('windows by item tops and moves with the first visible item', () => {
        const hook = renderHook(() =>
            useRowWindow({ total: heights.length, heights, viewHeight: 250 })
        )
        expect(hook.result.current.first).toBe(0)
        act(() => hook.result.current.onScroll(scrollEvent(200)))
        expect(hook.result.current.firstVisible).toBe(2)
        expect(hook.result.current.topSpace).toBe(0)
    })

    it('subtracts the measured leading height from the scroll position', () => {
        const hook = renderHook(() =>
            useRowWindow({ total: heights.length, heights, viewHeight: 250 })
        )
        act(() => hook.result.current.onLeadingLayout({ nativeEvent: { layout: { height: 100 } } }))
        act(() => hook.result.current.onScroll(scrollEvent(200)))
        // 200 - 100 = 100, inside item 1 (48..172); ignoring the offset would give item 2.
        // Item 1 starts at 48; 250px reaches 298, so items 1..3 show; overscan 6 covers the rest.
        expect(hook.result.current.firstVisible).toBe(1)
        expect(hook.result.current.first).toBe(0)
        expect(hook.result.current.last).toBe(10)
        expect(hook.result.current.topSpace).toBe(0)
        expect(hook.result.current.bottomSpace).toBe(0)
    })

    it('keeps a window away from both ends of a long mixed list', () => {
        // 10 groups of a 48px band plus three 124px rows: 420px each, 4200px in all.
        const long = Array.from({ length: 40 }, (_, i) => (i % 4 === 0 ? 48 : 124))
        const hook = renderHook(() =>
            useRowWindow({ total: long.length, heights: long, viewHeight: 250 })
        )
        // 1260 is the top of item 12 (three groups of 420).
        act(() => hook.result.current.onScroll(scrollEvent(1260)))
        expect(hook.result.current.firstVisible).toBe(12)
        // Overscan 6 above: item 6. Items 12..14 fill 1260..1556 (250px reaches 1510), so the
        // bottom index is 15 and overscan 6 makes last 21.
        expect(hook.result.current.first).toBe(6)
        expect(hook.result.current.last).toBe(21)
        // Above item 6: 48+124*3 + 48+124 = 592. Below item 21: 4200 - (2100 + 48) = 2052.
        expect(hook.result.current.topSpace).toBe(592)
        expect(hook.result.current.bottomSpace).toBe(2052)
    })
})
