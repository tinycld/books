// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBooksSettings } from '../tinycld/books/hooks/useBooksSettings'
import { useSettingsForm } from '../tinycld/books/hooks/useSettingsForm'
import { COMPANY_SETTINGS } from '../tinycld/books/lib/books-settings-fixture'
import {
    type CloseDateValues,
    type CompanyValues,
    closeDateSchema,
    closeDateValue,
    closeDateValues,
    companySchema,
    companyValues,
    fiscalYearSchema,
} from '../tinycld/books/lib/settings-schema'
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

const ROW: BooksSettings = { ...COMPANY_SETTINGS, fiscal_year_start_month: 3 }
const LEDGER = { lines: [], entries: [], balances: [], settings: [ROW] }
const REFUSAL = 'The books are closed through this date.'

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function settingsWrites() {
    return writeLog().filter(entry => entry.startsWith('settings:'))
}

function savedRow() {
    const row = settingsStore().get(ROW.id)
    if (!row) throw new Error('settings row missing')
    return row
}

function savedFields() {
    return Object.fromEntries(Object.entries(savedRow()).filter(([key]) => !key.startsWith('$')))
}

const companyValuesNow = companyValues(ROW)

function renderCompany() {
    return renderHook(
        () =>
            useSettingsForm({
                schema: companySchema,
                values: companyValuesNow,
                toPatch: (v: CompanyValues) => v,
            }),
        { wrapper }
    )
}

type Company = ReturnType<typeof renderCompany>

function edit(rendered: Company, field: keyof CompanyValues, value: string) {
    act(() => {
        rendered.result.current.form.setValue(field, value, { shouldDirty: true })
    })
}

function toastTitles() {
    return useToastStore.getState().toasts.map(t => t.title)
}

beforeEach(() => {
    seedBooks({ level: 'admin', ledger: LEDGER })
    useToastStore.setState({ toasts: [] })
})

describe('useSettingsForm company block', () => {
    it('writes one settings update carrying the new phone when only the phone changed', async () => {
        const rendered = renderCompany()
        edit(rendered, 'phone', '+1 555 000 9999')

        act(() => rendered.result.current.submit())

        await waitFor(() => expect(savedRow().phone).toBe('+1 555 000 9999'))
        expect(settingsWrites()).toEqual([`settings:${ROW.id}`])
        expect(savedRow()).toMatchObject({
            business_name: ROW.business_name,
            email: ROW.email,
            tax_id: ROW.tax_id,
            close_date: ROW.close_date,
        })
    })

    it('is not dirty before an edit, dirty after, and clean again with the saved values after a save', async () => {
        const rendered = renderCompany()
        expect(rendered.result.current.isDirty).toBe(false)

        edit(rendered, 'phone', '+1 555 000 9999')
        expect(rendered.result.current.isDirty).toBe(true)

        act(() => rendered.result.current.submit())

        await waitFor(() => expect(rendered.result.current.isDirty).toBe(false))
        expect(rendered.result.current.form.getValues()).toEqual({
            ...companyValuesNow,
            phone: '+1 555 000 9999',
        })
    })

    it('never writes setup_started when the company form saves a new name', async () => {
        seedBooks({
            level: 'admin',
            ledger: { ...LEDGER, settings: [{ ...ROW, setup_started: false }] },
        })
        const rendered = renderCompany()
        edit(rendered, 'business_name', 'Renamed Co.')

        act(() => rendered.result.current.submit())

        await waitFor(() => expect(savedRow().business_name).toBe('Renamed Co.'))
        expect(savedRow().setup_started).toBe(false)
        expect(Object.keys(companyValuesNow)).not.toContain('setup_started')
    })

    it('blocks a blank business name with the schema message and writes nothing', async () => {
        const rendered = renderCompany()
        edit(rendered, 'business_name', '   ')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.business_name?.message).toBe(
                'Enter the legal business name'
            )
        )
        expect(settingsWrites()).toEqual([])
        expect(savedRow().business_name).toBe(ROW.business_name)
    })

    it('puts a message-only refusal on the root error and keeps the typed values', async () => {
        seedBooks({
            level: 'admin',
            ledger: LEDGER,
            refuseSettings: messageRefusal(REFUSAL),
        })
        const rendered = renderCompany()
        edit(rendered, 'phone', '+1 555 000 9999')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.root?.message).toBe(REFUSAL)
        )
        expect(rendered.result.current.form.getValues().phone).toBe('+1 555 000 9999')
        expect(rendered.result.current.isDirty).toBe(true)
    })

    it('adds no second write for a second submit while a write is held', async () => {
        const release = holdWrites()
        const rendered = renderCompany()
        edit(rendered, 'phone', '+1 555 000 9999')

        act(() => rendered.result.current.submit())
        await waitFor(() => expect(settingsWrites()).toHaveLength(1))
        await waitFor(() => expect(rendered.result.current.isPending).toBe(true))

        act(() => rendered.result.current.submit())
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 20))
        })
        expect(settingsWrites()).toHaveLength(1)

        release()
        await waitFor(() => expect(rendered.result.current.isPending).toBe(false))
        expect(settingsWrites()).toHaveLength(1)
    })

    it('pushes the Saved. toast once per success and none for a refusal', async () => {
        const rendered = renderCompany()
        edit(rendered, 'phone', '+1 555 000 9999')
        act(() => rendered.result.current.submit())
        await waitFor(() => expect(toastTitles()).toEqual(['Saved.']))
        await waitFor(() => expect(rendered.result.current.isDirty).toBe(false))
        expect(toastTitles()).toEqual(['Saved.'])

        useToastStore.setState({ toasts: [] })
        seedBooks({ level: 'admin', ledger: LEDGER, refuseSettings: messageRefusal(REFUSAL) })
        const refused = renderCompany()
        edit(refused, 'phone', '+1 555 000 1111')
        act(() => refused.result.current.submit())
        await waitFor(() => expect(refused.result.current.form.formState.errors.root).toBeDefined())
        expect(toastTitles()).toEqual([])
    })
})

describe('useSettingsForm independent blocks', () => {
    it('a fiscal-year save writes only the fiscal year month', async () => {
        const rendered = renderHook(
            () =>
                useSettingsForm({
                    schema: fiscalYearSchema,
                    values: { fiscal_year_start_month: ROW.fiscal_year_start_month },
                    toPatch: v => ({ fiscal_year_start_month: v.fiscal_year_start_month }),
                }),
            { wrapper }
        )
        act(() => {
            rendered.result.current.form.setValue('fiscal_year_start_month', 10, {
                shouldDirty: true,
            })
        })

        act(() => rendered.result.current.submit())

        await waitFor(() => expect(savedRow().fiscal_year_start_month).toBe(10))
        expect({ ...savedFields(), fiscal_year_start_month: ROW.fiscal_year_start_month }).toEqual(
            ROW
        )
        expect(settingsWrites()).toHaveLength(1)
    })

    it('a close-date save writes only close_date and leaves the fiscal year month', async () => {
        const rendered = renderHook(
            () =>
                useSettingsForm({
                    schema: closeDateSchema,
                    values: { closed: true, close_date: ROW.close_date ?? '' },
                    toPatch: (v: CloseDateValues) => ({ close_date: closeDateValue(v) }),
                }),
            { wrapper }
        )
        act(() => {
            rendered.result.current.form.setValue('close_date', '2026-10-31', {
                shouldDirty: true,
            })
        })

        act(() => rendered.result.current.submit())

        await waitFor(() => expect(savedRow().close_date).toBe('2026-10-31'))
        expect(savedRow().fiscal_year_start_month).toBe(3)
        expect({ ...savedFields(), close_date: ROW.close_date }).toEqual(ROW)
    })

    it('writes an empty close date when the block is switched to open', async () => {
        const rendered = renderHook(
            () =>
                useSettingsForm({
                    schema: closeDateSchema,
                    values: { closed: true, close_date: ROW.close_date ?? '' },
                    toPatch: (v: CloseDateValues) => ({ close_date: closeDateValue(v) }),
                }),
            { wrapper }
        )
        act(() => {
            rendered.result.current.form.setValue('closed', false, { shouldDirty: true })
        })

        act(() => rendered.result.current.submit())

        await waitFor(() => expect(savedRow().close_date).toBe(''))
    })
})

describe('useBooksSettings', () => {
    it('is not ready while the row has not loaded, and has no settings', async () => {
        seedBooks({ level: 'admin', ledger: LEDGER, settingsNeverReady: true })
        const rendered = renderHook(() => useBooksSettings(), { wrapper })
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 20))
        })

        expect(rendered.result.current.isReady).toBe(false)
        expect(rendered.result.current.settings).toBeUndefined()
    })

    it('returns the settings row once it loads', async () => {
        const rendered = renderHook(() => useBooksSettings(), { wrapper })

        await waitFor(() => expect(rendered.result.current.isReady).toBe(true))
        expect(rendered.result.current.settings).toMatchObject({
            id: ROW.id,
            business_name: ROW.business_name,
        })
        expect(rendered.result.current.hasLoadError).toBe(false)
    })

    it('sets hasLoadError when the load fails, and retryLoad recovers', async () => {
        seedBooks({ level: 'admin', ledger: LEDGER, settingsFailsOnce: true })
        const rendered = renderHook(() => useBooksSettings(), { wrapper })
        await waitFor(() => expect(rendered.result.current.hasLoadError).toBe(true))

        act(() => rendered.result.current.retryLoad())

        await waitFor(() => expect(rendered.result.current.hasLoadError).toBe(false))
        await waitFor(() => expect(rendered.result.current.settings?.id).toBe(ROW.id))
    })
})

// The screens derive `values` from the live row, so an optimistic update that is
// refused changes the form's `values` twice: once on apply, once on rollback.
function renderLiveCompany() {
    return renderHook(
        () => {
            const { settings } = useBooksSettings()
            return useSettingsForm({
                schema: companySchema,
                values: companyValues(settings ?? ROW),
                toPatch: (v: CompanyValues) => v,
            })
        },
        { wrapper }
    )
}

describe('useSettingsForm with values from the live row', () => {
    it('keeps the typed phone and the root error when the server refuses the write', async () => {
        seedBooks({ level: 'admin', ledger: LEDGER, refuseSettings: messageRefusal(REFUSAL) })
        const rendered = renderLiveCompany()
        await waitFor(() => expect(settingsStore().get(ROW.id)).toBeDefined())
        act(() => {
            rendered.result.current.form.setValue('phone', '+1 555 000 9999', {
                shouldDirty: true,
            })
        })

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.root?.message).toBe(REFUSAL)
        )
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(savedRow().phone).toBe(ROW.phone)
        expect(rendered.result.current.form.getValues().phone).toBe('+1 555 000 9999')
        expect(rendered.result.current.form.formState.errors.root?.message).toBe(REFUSAL)
        expect(rendered.result.current.isDirty).toBe(true)
    })

    it('keeps the typed phone and shows a field-map refusal under phone', async () => {
        seedBooks({
            level: 'admin',
            ledger: LEDGER,
            refuseSettings: serverRefusal('phone', 'Phone is not allowed'),
        })
        const rendered = renderLiveCompany()
        await waitFor(() => expect(settingsStore().get(ROW.id)).toBeDefined())
        act(() => {
            rendered.result.current.form.setValue('phone', '+1 555 000 9999', {
                shouldDirty: true,
            })
        })

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.phone?.message).toBe(
                'Phone is not allowed'
            )
        )
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(rendered.result.current.form.getValues().phone).toBe('+1 555 000 9999')
        expect(rendered.result.current.form.formState.errors.phone?.message).toBe(
            'Phone is not allowed'
        )
    })

    it('writes once when submit runs twice in the same tick', async () => {
        const release = holdWrites()
        const rendered = renderLiveCompany()
        await waitFor(() => expect(settingsStore().get(ROW.id)).toBeDefined())
        act(() => {
            rendered.result.current.form.setValue('phone', '+1 555 000 9999', {
                shouldDirty: true,
            })
        })

        await act(async () => {
            rendered.result.current.submit()
            rendered.result.current.submit()
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(settingsWrites()).toHaveLength(1)

        release()
        await waitFor(() => expect(rendered.result.current.isPending).toBe(false))
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(settingsWrites()).toHaveLength(1)
        // A second mutation of identical values reaches no handler, but it still
        // succeeds and toasts, so the toast count shows how many ran.
        expect(toastTitles()).toEqual(['Saved.'])
    })
})

describe('useSettingsForm blocks saved while the company form is dirty', () => {
    function renderAllBlocks() {
        return renderHook(
            () => {
                const { settings } = useBooksSettings()
                const row = settings ?? ROW
                const company = useSettingsForm({
                    schema: companySchema,
                    values: companyValues(row),
                    toPatch: (v: CompanyValues) => v,
                })
                const fiscal = useSettingsForm({
                    schema: fiscalYearSchema,
                    values: { fiscal_year_start_month: row.fiscal_year_start_month },
                    toPatch: v => ({ fiscal_year_start_month: v.fiscal_year_start_month }),
                })
                const close = useSettingsForm({
                    schema: closeDateSchema,
                    values: closeDateValues(row),
                    toPatch: (v: CloseDateValues) => ({ close_date: closeDateValue(v) }),
                })
                return { company, fiscal, close }
            },
            { wrapper }
        )
    }

    it('saving the fiscal year keeps the dirty company and close-date values', async () => {
        const rendered = renderAllBlocks()
        await waitFor(() => expect(settingsStore().get(ROW.id)).toBeDefined())
        act(() => {
            const { company, fiscal, close } = rendered.result.current
            company.form.setValue('phone', '+1 555 000 9999', { shouldDirty: true })
            close.form.setValue('close_date', '2026-10-31', { shouldDirty: true })
            fiscal.form.setValue('fiscal_year_start_month', 10, { shouldDirty: true })
        })

        act(() => rendered.result.current.fiscal.submit())

        await waitFor(() => expect(savedRow().fiscal_year_start_month).toBe(10))
        await waitFor(() => expect(rendered.result.current.fiscal.isDirty).toBe(false))
        expect(rendered.result.current.company.form.getValues().phone).toBe('+1 555 000 9999')
        expect(rendered.result.current.company.isDirty).toBe(true)
        expect(rendered.result.current.close.form.getValues().close_date).toBe('2026-10-31')
        expect(rendered.result.current.close.isDirty).toBe(true)
        expect(savedRow().phone).toBe(ROW.phone)
        expect(savedRow().close_date).toBe(ROW.close_date)
    })

    it('saving the close date keeps the dirty company and fiscal-year values', async () => {
        const rendered = renderAllBlocks()
        await waitFor(() => expect(settingsStore().get(ROW.id)).toBeDefined())
        act(() => {
            const { company, fiscal, close } = rendered.result.current
            company.form.setValue('phone', '+1 555 000 9999', { shouldDirty: true })
            fiscal.form.setValue('fiscal_year_start_month', 10, { shouldDirty: true })
            close.form.setValue('close_date', '2026-10-31', { shouldDirty: true })
        })

        act(() => rendered.result.current.close.submit())

        await waitFor(() => expect(savedRow().close_date).toBe('2026-10-31'))
        await waitFor(() => expect(rendered.result.current.close.isDirty).toBe(false))
        expect(rendered.result.current.company.form.getValues().phone).toBe('+1 555 000 9999')
        expect(rendered.result.current.company.isDirty).toBe(true)
        expect(rendered.result.current.fiscal.form.getValues().fiscal_year_start_month).toBe(10)
        expect(rendered.result.current.fiscal.isDirty).toBe(true)
        expect(savedRow().fiscal_year_start_month).toBe(3)
        expect(savedRow().phone).toBe(ROW.phone)
    })
})

describe('useSettingsForm isSubmitted with values from the live row', () => {
    async function renderTyped(seed?: Parameters<typeof seedBooks>[0]) {
        seedBooks(seed ?? { level: 'admin', ledger: LEDGER })
        const rendered = renderLiveCompany()
        await waitFor(() => expect(settingsStore().get(ROW.id)).toBeDefined())
        act(() => {
            rendered.result.current.form.setValue('phone', '+1 555 000 9999', {
                shouldDirty: true,
            })
        })
        return rendered
    }

    async function settleAll() {
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 30))
        })
    }

    it('stays submitted with the root error after a message-only refusal', async () => {
        const rendered = await renderTyped({
            level: 'admin',
            ledger: LEDGER,
            refuseSettings: messageRefusal(REFUSAL),
        })

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.root?.message).toBe(REFUSAL)
        )
        await settleAll()
        expect(rendered.result.current.form.formState.errors.root?.message).toBe(REFUSAL)
        expect(rendered.result.current.form.formState.isSubmitted).toBe(true)
    })

    it('stays submitted with the field error after a field-map refusal', async () => {
        const rendered = await renderTyped({
            level: 'admin',
            ledger: LEDGER,
            refuseSettings: serverRefusal('phone', 'Phone is not allowed'),
        })

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.phone?.message).toBe(
                'Phone is not allowed'
            )
        )
        await settleAll()
        expect(rendered.result.current.form.formState.errors.phone?.message).toBe(
            'Phone is not allowed'
        )
        expect(rendered.result.current.form.formState.isSubmitted).toBe(true)
    })

    it('is submitted after a zod validation failure', async () => {
        const rendered = await renderTyped()
        act(() => {
            rendered.result.current.form.setValue('business_name', '   ', { shouldDirty: true })
        })

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.business_name).toBeDefined()
        )
        expect(rendered.result.current.form.formState.isSubmitted).toBe(true)
    })

    it('is not submitted and has no errors after a successful save', async () => {
        const rendered = await renderTyped()

        act(() => rendered.result.current.submit())

        await waitFor(() => expect(savedRow().phone).toBe('+1 555 000 9999'))
        await waitFor(() => expect(rendered.result.current.isDirty).toBe(false))
        await settleAll()
        expect(rendered.result.current.form.formState.isSubmitted).toBe(false)
        expect(rendered.result.current.form.formState.errors).toEqual({})
    })

    it('shows the error again, submitted, when a retry after a refusal fails again', async () => {
        const rendered = await renderTyped({
            level: 'admin',
            ledger: LEDGER,
            refuseSettings: messageRefusal(REFUSAL),
        })
        act(() => rendered.result.current.submit())
        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.root?.message).toBe(REFUSAL)
        )
        await settleAll()

        act(() => rendered.result.current.submit())

        await waitFor(() => expect(rendered.result.current.isPending).toBe(false))
        await settleAll()
        expect(rendered.result.current.form.formState.errors.root?.message).toBe(REFUSAL)
        expect(rendered.result.current.form.formState.isSubmitted).toBe(true)
    })

    it('is not submitted after a retry that succeeds once the refusal lifts', async () => {
        const rendered = await renderTyped({
            level: 'admin',
            ledger: LEDGER,
            refuseSettings: messageRefusal(REFUSAL),
        })
        act(() => rendered.result.current.submit())
        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.root?.message).toBe(REFUSAL)
        )
        await settleAll()

        liftRefusal()
        act(() => rendered.result.current.submit())

        await waitFor(() => expect(savedRow().phone).toBe('+1 555 000 9999'))
        await waitFor(() => expect(rendered.result.current.isDirty).toBe(false))
        await settleAll()
        expect(rendered.result.current.form.formState.isSubmitted).toBe(false)
    })
})
