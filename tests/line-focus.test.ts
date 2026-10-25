import { describe, expect, it, vi } from 'vitest'
import { createFocusRegistry } from '../tinycld/books/lib/line-focus'

const node = () => ({ focus: vi.fn() })

describe('createFocusRegistry', () => {
    it('focuses a registered cell at once', () => {
        const registry = createFocusRegistry()
        const cell = node()
        registry.register(0, 'debit')(cell)
        registry.focus(0, 'debit')
        expect(cell.focus).toHaveBeenCalledTimes(1)
    })

    it('applies a pending focus when the target registers', () => {
        const registry = createFocusRegistry()
        const cell = node()
        registry.focus(2, 'account')
        registry.register(2, 'account')(cell)
        expect(cell.focus).toHaveBeenCalledTimes(1)
    })

    it('keeps a focus pending for an unregistered key, ignoring other cells', () => {
        const registry = createFocusRegistry()
        const other = node()
        registry.focus(2, 'account')
        registry.register(1, 'account')(other)
        registry.register(2, 'memo')(other)
        expect(other.focus).not.toHaveBeenCalled()
    })

    it('clears the pending focus after it is applied', () => {
        const registry = createFocusRegistry()
        const first = node()
        const second = node()
        registry.focus(0, 'memo')
        const ref = registry.register(0, 'memo')
        ref(first)
        ref(null)
        ref(second)
        expect(first.focus).toHaveBeenCalledTimes(1)
        expect(second.focus).not.toHaveBeenCalled()
    })

    it('removes a node on unmount so a later focus stays pending', () => {
        const registry = createFocusRegistry()
        const cell = node()
        const ref = registry.register(0, 'credit')
        ref(cell)
        ref(null)
        registry.focus(0, 'credit')
        expect(cell.focus).not.toHaveBeenCalled()
        const remounted = node()
        ref(remounted)
        expect(remounted.focus).toHaveBeenCalledTimes(1)
    })
})
