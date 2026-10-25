// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCloseBooks } from '../tinycld/books/hooks/useCloseBooks'
import { useSettingsForm } from '../tinycld/books/hooks/useSettingsForm'
import { COMPANY_SETTINGS, EMPTY_SETTINGS } from '../tinycld/books/lib/books-settings-fixture'
import { fiscalYearSchema } from '../tinycld/books/lib/settings-schema'
import type { BooksSettings } from '../tinycld/books/types'
import {
    holdWrites,
    liftRefusal,
    messageRefusal,
    seedBooks,
    serverRefusal,
    settingsStore,
    writeLog,
} from './accounts-form-harness'
import { silenceConsole, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()
silenceConsole('error')

const CLOSED: BooksSettings = { ...COMPANY_SETTINGS, close_date: '2026-09-30' }
const OPEN: BooksSettings = { ...EMPTY_SETTINGS }

function ledger(row: BooksSettings) {
    return { lines: [], entries: [], balances: [], settings: [row] }
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function settingsWrites() {
    return writeLog().filter(entry => entry.startsWith('settings:'))
}

function savedCloseDate() {
    return settingsStore().get(CLOSED.id)?.close_date
}

async function renderReady() {
    const rendered = renderHook(() => useCloseBooks(), { wrapper })
    await waitFor(() => expect(settingsStore().get(CLOSED.id)).toBeDefined())
    return rendered
}

type Rendered = Awaited<ReturnType<typeof renderReady>>

function setDate(rendered: Rendered, value: string) {
    act(() => {
        rendered.result.current.form.setValue('close_date', value, { shouldDirty: true })
    })
}

async function settle() {
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 30))
    })
}

beforeEach(() => {
    seedBooks({ level: 'admin', ledger: ledger(CLOSED) })
})

describe('useCloseBooks', () => {
    it('writes a later close date at once and asks nothing', async () => {
        const rendered = await renderReady()
        setDate(rendered, '2026-10-31')

        act(() => rendered.result.current.submit())

        await waitFor(() => expect(savedCloseDate()).toBe('2026-10-31'))
        expect(rendered.result.current.reopen).toBeNull()
        expect(settingsWrites()).toHaveLength(1)
    })

    it('asks first for an earlier date: nothing is written and reopen holds the old date', async () => {
        const rendered = await renderReady()
        setDate(rendered, '2026-08-31')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.reopen).toEqual({ oldDate: '2026-09-30' })
        )
        await settle()
        expect(settingsWrites()).toEqual([])
        expect(savedCloseDate()).toBe('2026-09-30')
    })

    it('confirmReopen writes the earlier date and clears reopen', async () => {
        const rendered = await renderReady()
        setDate(rendered, '2026-08-31')
        act(() => rendered.result.current.submit())
        await waitFor(() => expect(rendered.result.current.reopen).not.toBeNull())

        act(() => rendered.result.current.confirmReopen())

        await waitFor(() => expect(savedCloseDate()).toBe('2026-08-31'))
        await waitFor(() => expect(rendered.result.current.reopen).toBeNull())
        expect(settingsWrites()).toHaveLength(1)
    })

    it('cancelReopen clears reopen, writes nothing and keeps the typed values', async () => {
        const rendered = await renderReady()
        setDate(rendered, '2026-08-31')
        act(() => rendered.result.current.submit())
        await waitFor(() => expect(rendered.result.current.reopen).not.toBeNull())

        act(() => rendered.result.current.cancelReopen())

        expect(rendered.result.current.reopen).toBeNull()
        await settle()
        expect(settingsWrites()).toEqual([])
        expect(rendered.result.current.form.getValues().close_date).toBe('2026-08-31')
        expect(rendered.result.current.isDirty).toBe(true)
    })

    it('switching off and submitting asks first, then saves an empty close date once confirmed', async () => {
        const rendered = await renderReady()
        expect(rendered.result.current.isClosed).toBe(true)
        act(() => {
            rendered.result.current.form.setValue('closed', false, { shouldDirty: true })
        })
        expect(rendered.result.current.isClosed).toBe(false)

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.reopen).toEqual({ oldDate: '2026-09-30' })
        )
        await settle()
        expect(settingsWrites()).toEqual([])

        act(() => rendered.result.current.confirmReopen())

        await waitFor(() => expect(savedCloseDate()).toBe(''))
        await waitFor(() => expect(rendered.result.current.reopen).toBeNull())
    })

    it('with no current close date, turning on and saving a date writes it with no question', async () => {
        seedBooks({ level: 'admin', ledger: ledger(OPEN) })
        const rendered = await renderReady()
        expect(rendered.result.current.isClosed).toBe(false)
        act(() => {
            rendered.result.current.form.setValue('closed', true, { shouldDirty: true })
            rendered.result.current.form.setValue('close_date', '2026-06-30', { shouldDirty: true })
        })

        act(() => rendered.result.current.submit())

        await waitFor(() => expect(savedCloseDate()).toBe('2026-06-30'))
        expect(rendered.result.current.reopen).toBeNull()
    })

    it('blocks an invalid date with the schema message, writes nothing and asks nothing', async () => {
        const rendered = await renderReady()
        setDate(rendered, '2026-02-30')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.close_date?.message).toBe(
                'Enter a real date as YYYY-MM-DD'
            )
        )
        await settle()
        expect(settingsWrites()).toEqual([])
        expect(rendered.result.current.reopen).toBeNull()
    })

    it('puts a pending auto-reversal refusal on the root error and keeps the values', async () => {
        const refusal = 'the books are closed through 2026-10-31 by a pending auto-reversal'
        seedBooks({
            level: 'admin',
            ledger: ledger(CLOSED),
            refuseSettings: messageRefusal(refusal),
        })
        const rendered = await renderReady()
        setDate(rendered, '2026-10-15')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.root?.message).toBe(refusal)
        )
        await settle()
        expect(rendered.result.current.form.getValues().close_date).toBe('2026-10-15')
        expect(rendered.result.current.form.formState.errors.root?.message).toBe(refusal)
    })
})

describe('useCloseBooks guards and refusals', () => {
    it('writes once when a later date is submitted twice in the same tick', async () => {
        const release = holdWrites()
        const rendered = await renderReady()
        setDate(rendered, '2026-10-31')

        await act(async () => {
            rendered.result.current.submit()
            rendered.result.current.submit()
            await new Promise(resolve => setTimeout(resolve, 30))
        })

        expect(settingsWrites()).toHaveLength(1)
        expect(rendered.result.current.reopen).toBeNull()
        release()
        await waitFor(() => expect(rendered.result.current.isPending).toBe(false))
        expect(settingsWrites()).toHaveLength(1)
    })

    it('opens one reopen question and no write when an earlier date is submitted twice in the same tick', async () => {
        const rendered = await renderReady()
        setDate(rendered, '2026-08-31')

        await act(async () => {
            rendered.result.current.submit()
            rendered.result.current.submit()
            await new Promise(resolve => setTimeout(resolve, 30))
        })

        expect(rendered.result.current.reopen).toEqual({ oldDate: '2026-09-30' })
        expect(settingsWrites()).toEqual([])
        act(() => rendered.result.current.confirmReopen())
        await waitFor(() => expect(savedCloseDate()).toBe('2026-08-31'))
        expect(settingsWrites()).toHaveLength(1)
    })

    it('keeps typed values, the error and dirty state after a message refusal, and a retry writes', async () => {
        const refusal = 'the books are closed through 2026-10-31 by a pending auto-reversal'
        seedBooks({
            level: 'admin',
            ledger: ledger(CLOSED),
            refuseSettings: messageRefusal(refusal),
        })
        const rendered = await renderReady()
        setDate(rendered, '2026-10-15')
        act(() => rendered.result.current.submit())
        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.root?.message).toBe(refusal)
        )
        await settle()

        expect(rendered.result.current.form.getValues()).toEqual({
            closed: true,
            close_date: '2026-10-15',
        })
        expect(rendered.result.current.form.formState.errors.root?.message).toBe(refusal)
        expect(rendered.result.current.isDirty).toBe(true)
        expect(savedCloseDate()).toBe('2026-09-30')

        liftRefusal()
        act(() => rendered.result.current.submit())
        await waitFor(() => expect(savedCloseDate()).toBe('2026-10-15'))
    })

    it('keeps typed values, the field error and dirty state after a field-map refusal, and a retry writes', async () => {
        seedBooks({
            level: 'admin',
            ledger: ledger(CLOSED),
            refuseSettings: serverRefusal('close_date', 'Date is not allowed'),
        })
        const rendered = await renderReady()
        setDate(rendered, '2026-10-15')
        act(() => rendered.result.current.submit())
        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.close_date?.message).toBe(
                'Date is not allowed'
            )
        )
        await settle()

        expect(rendered.result.current.form.getValues().close_date).toBe('2026-10-15')
        expect(rendered.result.current.form.getValues().closed).toBe(true)
        expect(rendered.result.current.form.formState.errors.close_date?.message).toBe(
            'Date is not allowed'
        )
        expect(rendered.result.current.isDirty).toBe(true)

        liftRefusal()
        act(() => rendered.result.current.submit())
        await waitFor(() => expect(savedCloseDate()).toBe('2026-10-15'))
    })

    it('after a refused write following confirmReopen, reopen is cleared and the typed date and error stay', async () => {
        const refusal = 'the books are closed through 2026-10-31 by a pending auto-reversal'
        seedBooks({
            level: 'admin',
            ledger: ledger(CLOSED),
            refuseSettings: messageRefusal(refusal),
        })
        const rendered = await renderReady()
        setDate(rendered, '2026-08-31')
        act(() => rendered.result.current.submit())
        await waitFor(() => expect(rendered.result.current.reopen).not.toBeNull())

        act(() => rendered.result.current.confirmReopen())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.root?.message).toBe(refusal)
        )
        await settle()
        expect(rendered.result.current.reopen).toBeNull()
        expect(rendered.result.current.form.getValues().close_date).toBe('2026-08-31')
        expect(rendered.result.current.form.formState.errors.root?.message).toBe(refusal)
        expect(rendered.result.current.isDirty).toBe(true)
        expect(savedCloseDate()).toBe('2026-09-30')
    })
})

describe('useCloseBooks beside the fiscal year form', () => {
    function renderBoth() {
        return renderHook(
            () => ({
                close: useCloseBooks(),
                fiscal: useSettingsForm({
                    schema: fiscalYearSchema,
                    values: { fiscal_year_start_month: CLOSED.fiscal_year_start_month },
                    toPatch: v => ({ fiscal_year_start_month: v.fiscal_year_start_month }),
                }),
            }),
            { wrapper }
        )
    }

    it('saving the fiscal year keeps the dirty close date', async () => {
        const rendered = renderBoth()
        await waitFor(() => expect(settingsStore().get(CLOSED.id)).toBeDefined())
        act(() => {
            rendered.result.current.close.form.setValue('close_date', '2026-10-31', {
                shouldDirty: true,
            })
            rendered.result.current.fiscal.form.setValue('fiscal_year_start_month', 10, {
                shouldDirty: true,
            })
        })

        act(() => rendered.result.current.fiscal.submit())

        await waitFor(() =>
            expect(settingsStore().get(CLOSED.id)?.fiscal_year_start_month).toBe(10)
        )
        await waitFor(() => expect(rendered.result.current.fiscal.isDirty).toBe(false))
        expect(rendered.result.current.close.form.getValues().close_date).toBe('2026-10-31')
        expect(rendered.result.current.close.isDirty).toBe(true)
        expect(savedCloseDate()).toBe('2026-09-30')
    })

    it('saving the close date keeps the dirty fiscal year', async () => {
        const rendered = renderBoth()
        await waitFor(() => expect(settingsStore().get(CLOSED.id)).toBeDefined())
        act(() => {
            rendered.result.current.fiscal.form.setValue('fiscal_year_start_month', 10, {
                shouldDirty: true,
            })
            rendered.result.current.close.form.setValue('close_date', '2026-10-31', {
                shouldDirty: true,
            })
        })

        act(() => rendered.result.current.close.submit())

        await waitFor(() => expect(savedCloseDate()).toBe('2026-10-31'))
        await waitFor(() => expect(rendered.result.current.close.isDirty).toBe(false))
        expect(rendered.result.current.fiscal.form.getValues().fiscal_year_start_month).toBe(10)
        expect(rendered.result.current.fiscal.isDirty).toBe(true)
        expect(settingsStore().get(CLOSED.id)?.fiscal_year_start_month).toBe(
            CLOSED.fiscal_year_start_month
        )
    })
})

describe('useCloseBooks isSubmitted with values from the live row', () => {
    it('stays submitted with the root error after a message-only refusal', async () => {
        seedBooks({
            level: 'admin',
            ledger: ledger(CLOSED),
            refuseSettings: messageRefusal('refused by the server'),
        })
        const rendered = await renderReady()
        setDate(rendered, '2026-10-15')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.root?.message).toBe(
                'refused by the server'
            )
        )
        await settle()
        expect(rendered.result.current.form.formState.errors.root?.message).toBe(
            'refused by the server'
        )
        expect(rendered.result.current.form.formState.isSubmitted).toBe(true)
    })

    it('stays submitted with the field error after a field-map refusal', async () => {
        seedBooks({
            level: 'admin',
            ledger: ledger(CLOSED),
            refuseSettings: serverRefusal('close_date', 'Date is not allowed'),
        })
        const rendered = await renderReady()
        setDate(rendered, '2026-10-15')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.close_date?.message).toBe(
                'Date is not allowed'
            )
        )
        await settle()
        expect(rendered.result.current.form.formState.errors.close_date?.message).toBe(
            'Date is not allowed'
        )
        expect(rendered.result.current.form.formState.isSubmitted).toBe(true)
    })

    it('is submitted after a zod validation failure', async () => {
        const rendered = await renderReady()
        setDate(rendered, 'not a date')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.close_date).toBeDefined()
        )
        expect(rendered.result.current.form.formState.isSubmitted).toBe(true)
    })

    it('is not submitted and has no errors after a successful save', async () => {
        const rendered = await renderReady()
        setDate(rendered, '2026-10-31')

        act(() => rendered.result.current.submit())

        await waitFor(() => expect(savedCloseDate()).toBe('2026-10-31'))
        await waitFor(() => expect(rendered.result.current.isDirty).toBe(false))
        await settle()
        expect(rendered.result.current.form.formState.isSubmitted).toBe(false)
        expect(rendered.result.current.form.formState.errors).toEqual({})
    })

    it('shows the error again, submitted, when a retry after a refusal fails again', async () => {
        seedBooks({
            level: 'admin',
            ledger: ledger(CLOSED),
            refuseSettings: messageRefusal('refused by the server'),
        })
        const rendered = await renderReady()
        setDate(rendered, '2026-10-15')
        act(() => rendered.result.current.submit())
        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.root?.message).toBe(
                'refused by the server'
            )
        )
        await settle()

        act(() => rendered.result.current.submit())

        await waitFor(() => expect(rendered.result.current.isPending).toBe(false))
        await settle()
        expect(rendered.result.current.form.formState.errors.root?.message).toBe(
            'refused by the server'
        )
        expect(rendered.result.current.form.formState.isSubmitted).toBe(true)
    })
})
