// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useRowWindow } from '../tinycld/books/hooks/useRowWindow'

const OPTIONS = { total: 2000, rowHeight: 64, viewHeight: 480 }

function setup() {
    let renders = 0
    const hook = renderHook(() => {
        renders += 1
        return useRowWindow(OPTIONS)
    })
    return { hook, renders: () => renders }
}

function scrollTo(hook: ReturnType<typeof setup>['hook'], y: number) {
    act(() => hook.result.current.onScroll({ nativeEvent: { contentOffset: { y } } }))
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
