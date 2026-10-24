// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMyCloseOverride } from '../tinycld/books/hooks/useMyCloseOverride'
import type { BooksCloseOverrides } from '../tinycld/books/types'
import { ME, overridesStore, seedBooks } from './accounts-form-harness'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const DAY = 24 * 60 * 60 * 1000
const STAMP = '2026-10-01 00:00:00.000Z'

function pbTime(ms: number) {
    return new Date(ms).toISOString().replace('T', ' ')
}

function override(id: string, user: string, expiresMs: number): BooksCloseOverrides {
    return {
        id,
        user,
        reason: `reason ${id}`,
        expires_at: pbTime(expiresMs),
        granted_by: 'boss',
        created: STAMP,
        updated: STAMP,
    }
}

async function renderMine(rows: BooksCloseOverrides[]) {
    seedBooks({ level: 'bookkeeper', overrides: rows })
    const rendered = renderHook(() => useMyCloseOverride())
    await waitFor(() => expect(rendered.result.current.isReady).toBe(true))
    return rendered
}

describe('useMyCloseOverride', () => {
    const now = Date.now()

    it('returns the signed-in user active override with its expiry and reason', async () => {
        const mine = override('mine', ME, now + 2 * DAY)
        const { result } = await renderMine([mine])

        expect(result.current.override?.expires_at).toBe(mine.expires_at)
        expect(result.current.override?.reason).toBe('reason mine')
    })

    it('ignores another user override', async () => {
        const { result } = await renderMine([override('theirs', 'u2', now + 2 * DAY)])

        expect(result.current.override).toBeUndefined()
    })

    it('ignores an expired or revoked override', async () => {
        const { result } = await renderMine([
            override('expired', ME, now - 5 * DAY),
            override('revoked', ME, now - 1000),
        ])

        expect(result.current.override).toBeUndefined()
    })

    it('returns the one expiring last when several are active', async () => {
        const { result } = await renderMine([
            override('short', ME, now + 1 * DAY),
            override('longest', ME, now + 9 * DAY),
            override('middle', ME, now + 4 * DAY),
            override('theirs', 'u2', now + 30 * DAY),
        ])

        expect(result.current.override?.reason).toBe('reason longest')
    })

    it('returns undefined with none', async () => {
        const { result } = await renderMine([])

        expect(result.current.override).toBeUndefined()
    })
})

describe('useMyCloseOverride expiry while mounted', () => {
    it('returns undefined once the override expires, and not before', async () => {
        const soon = Date.now() + 400
        const { result } = await renderMine([override('soon', ME, soon)])

        expect(result.current.override?.reason).toBe('reason soon')

        await waitFor(() => expect(result.current.override).toBeUndefined(), { timeout: 4000 })
        expect(Date.now()).toBeGreaterThanOrEqual(soon)
    })
})

describe('useMyCloseOverride render-time clock', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('never returns a row that arrives already expired', async () => {
        const real = Date.now()
        seedBooks({ level: 'bookkeeper', overrides: [] })
        const seen: (string | undefined)[] = []
        const rendered = renderHook(() => {
            const value = useMyCloseOverride()
            seen.push(value.override?.reason)
            return value
        })
        await waitFor(() => expect(rendered.result.current.isReady).toBe(true))
        const before = seen.length

        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(real + 3 * 60 * 60 * 1000)
        await act(async () => {
            overridesStore().insert(override('stale', ME, real + 60 * 60 * 1000))
            await new Promise(resolve => setTimeout(resolve, 30))
        })

        expect(seen.length).toBeGreaterThan(before)
        expect(rendered.result.current.override).toBeUndefined()
        expect(seen.filter(reason => reason !== undefined)).toEqual([])
    })
})
