// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFiscalYearStartMonth } from '../tinycld/books/hooks/useFiscalYearStartMonth'
import { SETTINGS } from '../tinycld/books/lib/account-register-fixture'
import { seedBooks, settingsStore } from './accounts-form-harness'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})

const base = { lines: [], entries: [], balances: [] }

describe('useFiscalYearStartMonth', () => {
    beforeEach(() => {
        seedBooks({ ledger: base })
    })

    it('gives month 1 when no settings row exists', async () => {
        const { result } = renderHook(() => useFiscalYearStartMonth())
        await waitFor(() => expect(result.current.isReady).toBe(true))
        expect(result.current.month).toBe(1)
    })

    it('reads the month from the settings row and follows an update', async () => {
        seedBooks({ ledger: { ...base, settings: [{ ...SETTINGS, fiscal_year_start_month: 9 }] } })
        const { result } = renderHook(() => useFiscalYearStartMonth())
        await waitFor(() => expect(result.current).toMatchObject({ month: 9, isReady: true }))
        await act(async () => {
            settingsStore().update(SETTINGS.id, draft => {
                draft.fiscal_year_start_month = 4
            })
        })
        await waitFor(() => expect(result.current.month).toBe(4))
    })
})
