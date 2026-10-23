// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCopyExample } from '../tinycld/books/hooks/useCopyExample'

afterEach(() => {
    vi.useRealTimers()
})

describe('useCopyExample', () => {
    it('shows Copied after a copy and returns to Copy example after a timeout', async () => {
        vi.useFakeTimers()
        const hook = renderHook(() => useCopyExample())
        expect(hook.result.current.label).toBe('Copy example')
        await act(async () => {
            await hook.result.current.copy()
        })
        expect(hook.result.current.label).toBe('Copied')
        act(() => {
            vi.advanceTimersByTime(10_000)
        })
        expect(hook.result.current.label).toBe('Copy example')
    })

    it('stays on Copied until the timeout has passed', async () => {
        vi.useFakeTimers()
        const hook = renderHook(() => useCopyExample())
        await act(async () => {
            await hook.result.current.copy()
        })
        act(() => {
            vi.advanceTimersByTime(100)
        })
        expect(hook.result.current.label).toBe('Copied')
    })
})
