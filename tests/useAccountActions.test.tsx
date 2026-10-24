// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccountActions } from '../tinycld/books/hooks/useAccountActions'
import {
    enteredWrites,
    holdWrites,
    messageRefusal,
    seedBooks,
    storedAccounts,
} from './accounts-form-harness'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const A = 'acct_ar_00001'
const B = 'acct_ap_00001'
const C = 'acct_cc_00001'
const REFUSAL = 'Make the 2 active sub-accounts inactive first.'

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function inactiveOf(id: string) {
    return storedAccounts().find(a => a.id === id)?.inactive
}

beforeEach(() => {
    seedBooks()
})

describe('useAccountActions setInactive', () => {
    it('updates the inactive flag of one row and leaves the others', async () => {
        const { result } = renderHook(() => useAccountActions(), { wrapper })
        await act(async () => {
            await result.current.setInactive([A], true)
        })
        expect(inactiveOf(A)).toBe(true)
        expect(inactiveOf(B)).toBe(false)
        expect(result.current.actionError).toBeNull()
    })

    it('can make an inactive row active again', async () => {
        const { result } = renderHook(() => useAccountActions(), { wrapper })
        await act(async () => {
            await result.current.setInactive(['acct_fa_00007'], false)
        })
        expect(inactiveOf('acct_fa_00007')).toBe(false)
    })

    it('runs the updates for several ids one after the other', async () => {
        const release = holdWrites()
        const { result } = renderHook(() => useAccountActions(), { wrapper })
        let done: Promise<unknown> = Promise.resolve()
        act(() => {
            done = result.current.setInactive([A, B, C], true)
        })
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
        })
        expect(enteredWrites()).toEqual([A])
        release()
        await act(async () => {
            await done
        })
        expect(enteredWrites()).toEqual([A, B, C])
        expect([A, B, C].map(inactiveOf)).toEqual([true, true, true])
    })

    it('stops at the first refusal, never tries the third and reports the count', async () => {
        seedBooks({ refusalFor: { [B]: messageRefusal(REFUSAL) } })
        const { result } = renderHook(() => useAccountActions(), { wrapper })
        await act(async () => {
            await result.current.setInactive([A, B, C], true)
        })
        expect(enteredWrites()).toEqual([A, B])
        expect(inactiveOf(A)).toBe(true)
        expect(inactiveOf(C)).toBe(false)
        expect(result.current.actionError).toBe(`1 of 3 made inactive. ${REFUSAL}`)
    })

    it('sets actionError to the server text for a single refusal', async () => {
        seedBooks({ refusal: messageRefusal(REFUSAL) })
        const { result } = renderHook(() => useAccountActions(), { wrapper })
        await act(async () => {
            await result.current.setInactive([A], true)
        })
        expect(result.current.actionError).toBe(REFUSAL)
        expect(inactiveOf(A)).toBe(false)
    })

    it('clearActionError clears the error', async () => {
        seedBooks({ refusal: messageRefusal(REFUSAL) })
        const { result } = renderHook(() => useAccountActions(), { wrapper })
        await act(async () => {
            await result.current.setInactive([A], true)
        })
        expect(result.current.actionError).toBe(REFUSAL)
        act(() => result.current.clearActionError())
        await waitFor(() => expect(result.current.actionError).toBeNull())
    })
})

type Outcome = Awaited<ReturnType<ReturnType<typeof useAccountActions>['setInactive']>>

describe('useAccountActions setInactive outcome', () => {
    it('lists every id it made inactive after a full success', async () => {
        const { result } = renderHook(() => useAccountActions(), { wrapper })
        let outcome: Outcome = { done: [] }
        await act(async () => {
            outcome = await result.current.setInactive([A, B, C], true)
        })
        expect(outcome.done).toEqual([A, B, C])
        expect(outcome.failed).toBeUndefined()
    })

    it('reports the first id done, the second failed and never attempts the third', async () => {
        seedBooks({ refusalFor: { [B]: messageRefusal(REFUSAL) } })
        const { result } = renderHook(() => useAccountActions(), { wrapper })
        let outcome: Outcome = { done: [] }
        await act(async () => {
            outcome = await result.current.setInactive([A, B, C], true)
        })
        expect(outcome.done).toEqual([A])
        expect(outcome.failed).toBe(B)
        expect(enteredWrites()).toEqual([A, B])
    })

    it('reports nothing done and the id failed for a single refusal', async () => {
        seedBooks({ refusal: messageRefusal(REFUSAL) })
        const { result } = renderHook(() => useAccountActions(), { wrapper })
        let outcome: Outcome = { done: [] }
        await act(async () => {
            outcome = await result.current.setInactive([A], true)
        })
        expect(outcome.done).toEqual([])
        expect(outcome.failed).toBe(A)
    })
})

describe('useAccountActions in-flight guard', () => {
    async function settle() {
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
        })
    }

    it('runs one write sequence for two setInactive calls started in the same tick', async () => {
        const release = holdWrites()
        const { result } = renderHook(() => useAccountActions(), { wrapper })
        let first: Promise<Outcome> = Promise.resolve({ done: [] })
        let second: Promise<Outcome> = Promise.resolve({ done: [] })
        act(() => {
            first = result.current.setInactive([A], true)
            second = result.current.setInactive([B], true)
        })
        await settle()
        expect(enteredWrites()).toEqual([A])
        release()
        let outcomes: Outcome[] = []
        await act(async () => {
            outcomes = await Promise.all([first, second])
        })
        expect(outcomes[0].done).toEqual([A])
        expect(outcomes[1].done).toEqual([])
        expect(enteredWrites()).toEqual([A])
        expect(inactiveOf(B)).toBe(false)
        expect(result.current.actionError).toBeNull()
    })

    it('accepts a new setInactive once the first has finished', async () => {
        const { result } = renderHook(() => useAccountActions(), { wrapper })
        await act(async () => {
            await result.current.setInactive([A], true)
        })
        await act(async () => {
            await result.current.setInactive([B], true)
        })
        expect(enteredWrites()).toEqual([A, B])
    })

    it('runs one delete for two deleteAccount calls started in the same tick and sets no error', async () => {
        const release = holdWrites()
        const { result } = renderHook(() => useAccountActions(), { wrapper })
        let first: Promise<boolean> = Promise.resolve(true)
        let second: Promise<boolean> = Promise.resolve(true)
        act(() => {
            first = result.current.deleteAccount(C)
            second = result.current.deleteAccount(C)
        })
        await settle()
        expect(enteredWrites()).toEqual([C])
        release()
        let results: boolean[] = []
        await act(async () => {
            results = await Promise.all([first, second])
        })
        expect(results[0]).toBe(true)
        expect(results[1]).toBe(false)
        expect(enteredWrites()).toEqual([C])
        expect(storedAccounts().some(a => a.id === C)).toBe(false)
        expect(result.current.actionError).toBeNull()
    })
})

describe('useAccountActions deleteAccount', () => {
    it('removes the row when the server allows it', async () => {
        const { result } = renderHook(() => useAccountActions(), { wrapper })
        await act(async () => {
            await result.current.deleteAccount(C)
        })
        expect(storedAccounts().some(a => a.id === C)).toBe(false)
        expect(result.current.actionError).toBeNull()
    })

    it('keeps the row and sets actionError to the server message when refused', async () => {
        seedBooks({ refusalFor: { [C]: messageRefusal('This account has journal lines.') } })
        const { result } = renderHook(() => useAccountActions(), { wrapper })
        await act(async () => {
            await result.current.deleteAccount(C)
        })
        expect(storedAccounts().some(a => a.id === C)).toBe(true)
        expect(result.current.actionError).toBe('This account has journal lines.')
    })
})
