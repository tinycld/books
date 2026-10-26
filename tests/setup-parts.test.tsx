// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBooksAccess } from '../tinycld/books/hooks/useBooksAccess'
import { useBooksSetup } from '../tinycld/books/hooks/useBooksSetup'
import { useSetupParts } from '../tinycld/books/hooks/useSetupParts'
import { starterChart } from '../tinycld/books/lib/starter-chart'
import type { BooksAccounts, BooksSettings } from '../tinycld/books/types'
import {
    accountsStore,
    enteredWrites,
    holdWrites,
    liftRefusal,
    messageRefusal,
    refuseAfterNow,
    resetWriteCounts,
    seedBooks,
    settingsStore,
    storedAccounts,
    writeLog,
} from './accounts-form-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

const SETTINGS_ID = 'bookssettings01'

function blankSettings(): BooksSettings {
    return {
        id: SETTINGS_ID,
        close_date: '',
        fiscal_year_start_month: 1,
        currency: 'USD',
        business_name: '',
        ownership: '',
        setup_completed: false,
        setup_started: false,
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
    }
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

type Seed = Parameters<typeof seedBooks>[0]

// Every render's part and failure, so a test can see a part that flashed by.
let history: { part: string; hasFailure: boolean }[] = []

function renderParts(next?: () => void) {
    history = []
    return renderHook(
        () => {
            const access = useBooksAccess()
            const setup = useBooksSetup()
            const parts = useSetupParts(next)
            history.push({ part: parts.part, hasFailure: parts.failure !== null })
            // Read during render so the hook re-renders when an error is set.
            const errors = parts.form.formState.errors
            return { access, setup, errors, ...parts }
        },
        { wrapper }
    )
}

type Rendered = ReturnType<typeof renderParts>

const seedLedger = { lines: [], entries: [], balances: [], settings: [blankSettings()] }

async function emptyAccounts() {
    const transaction = accountsStore().delete(storedAccounts().map(row => row.id))
    await transaction.isPersisted.promise
}

async function renderOpen(seed: Seed = {}, options: { emptyChart?: boolean } = {}) {
    seedBooks({ level: 'admin', ledger: seedLedger, ...seed })
    if (options.emptyChart) {
        await emptyAccounts()
        resetWriteCounts()
    }
    const rendered = renderParts()
    await waitFor(() => expect(rendered.result.current.part).not.toBe('loading'))
    return rendered
}

// A SelectInput hands the form the option's string value, never a number.
function fill(rendered: Rendered, values: { name?: string; month?: string; ownership?: string }) {
    act(() => {
        const { form } = rendered.result.current
        if (values.name !== undefined) form.setValue('business_name', values.name)
        if (values.month !== undefined) {
            form.setValue('fiscal_year_start_month', values.month as never)
        }
        if (values.ownership !== undefined) form.setValue('ownership', values.ownership as never)
    })
}

async function press(rendered: Rendered, action: 'goNext' | 'goBack') {
    await act(async () => {
        await rendered.result.current[action]()
    })
}

async function toChart(rendered: Rendered) {
    fill(rendered, { name: 'Acme Plumbing', month: '4', ownership: 'owners' })
    await press(rendered, 'goNext')
    await press(rendered, 'goNext')
}

beforeEach(() => {
    liftRefusal()
})

describe('useSetupParts navigation', () => {
    it('moves from business to ownership to chart on Next', async () => {
        const rendered = await renderOpen({}, { emptyChart: true })
        expect(rendered.result.current.part).toBe('business')

        fill(rendered, { name: 'Acme Plumbing', month: '4' })
        await press(rendered, 'goNext')
        expect(rendered.result.current.part).toBe('ownership')

        fill(rendered, { ownership: 'corporation' })
        await press(rendered, 'goNext')
        expect(rendered.result.current.part).toBe('chart')
    })

    it('returns to the previous part on Back and keeps the typed values', async () => {
        const rendered = await renderOpen({}, { emptyChart: true })
        await toChart(rendered)
        expect(rendered.result.current.part).toBe('chart')

        await press(rendered, 'goBack')
        expect(rendered.result.current.part).toBe('ownership')
        await press(rendered, 'goBack')
        expect(rendered.result.current.part).toBe('business')
        expect(rendered.result.current.form.getValues('business_name')).toBe('Acme Plumbing')
        expect(String(rendered.result.current.form.getValues('fiscal_year_start_month'))).toBe('4')
        expect(rendered.result.current.form.getValues('ownership')).toBe('owners')
    })

    it('blocks Next on a blank business name with the schema message', async () => {
        const rendered = await renderOpen({}, { emptyChart: true })
        fill(rendered, { name: '   ' })
        await press(rendered, 'goNext')

        expect(rendered.result.current.part).toBe('business')
        await waitFor(() =>
            expect(rendered.result.current.errors.business_name?.message).toBe(
                'Enter the legal business name'
            )
        )
    })
})

describe('useSetupParts outcomes', () => {
    it('shows done after a create that succeeds, with the month the user picked as a number', async () => {
        const rendered = await renderOpen({}, { emptyChart: true })
        await toChart(rendered)

        await act(async () => {
            await rendered.result.current.create()
        })

        await waitFor(() => expect(rendered.result.current.part).toBe('done'))
        expect(settingsStore().get(SETTINGS_ID)?.fiscal_year_start_month).toBe(4)
        expect(settingsStore().get(SETTINGS_ID)?.setup_completed).toBe(true)
        expect(settingsStore().get(SETTINGS_ID)?.setup_started).toBe(true)
    })

    it('shows error while accounts exist when a create fails after inserting one parent', async () => {
        const rendered = await renderOpen({}, { emptyChart: true })
        refuseAfterNow(1, messageRefusal('Number already used'))
        await toChart(rendered)

        await act(async () => {
            await rendered.result.current.create()
        })

        await waitFor(() => expect(rendered.result.current.part).toBe('error'))
        expect(storedAccounts().length).toBeGreaterThan(0)
        expect(rendered.result.current.accountCount).toBeGreaterThan(0)
    })

    it('shows populated instead of chart for a book with accounts and no create attempt', async () => {
        const rendered = await renderOpen()
        expect(storedAccounts().length).toBeGreaterThan(0)

        await toChart(rendered)

        expect(rendered.result.current.part).toBe('populated')
    })

    it('shows non-admin to a user who is not a Books admin', async () => {
        const rendered = await renderOpen({ level: 'bookkeeper' })
        expect(rendered.result.current.part).toBe('non-admin')
    })

    it('shows loading while the settings row has not loaded', async () => {
        seedBooks({ level: 'admin', ledger: seedLedger, settingsNeverReady: true })
        const rendered = renderParts()
        // Access is loaded, so loading can only come from the settings row, which never loads.
        await waitFor(() => expect(rendered.result.current.access.isReady).toBe(true))

        expect(rendered.result.current.setup.isReady).toBe(false)
        expect(rendered.result.current.part).toBe('loading')
    })

    it('sets hasLoadError when settings fail to load, and retryLoad recovers', async () => {
        seedBooks({ level: 'admin', ledger: seedLedger, settingsFailsOnce: true })
        expectLiveQueryError(settingsStore().id)
        const rendered = renderParts()
        await waitFor(() => expect(rendered.result.current.hasLoadError).toBe(true))

        act(() => rendered.result.current.retryLoad())

        await waitFor(() => expect(rendered.result.current.hasLoadError).toBe(false))
        await waitFor(() => expect(rendered.result.current.part).toBe('business'))
    })
})

const chartSize = starterChart('owners').length

function startedRow(account: ReturnType<typeof starterChart>[number]): BooksAccounts {
    return {
        id: `seed_${account.number}`,
        number: account.number,
        name: account.name,
        type: account.type,
        detail_type: account.detail_type,
        description: '',
        inactive: false,
        parent: '',
        currency: 'USD',
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
    }
}

function settingsWith(fields: Partial<BooksSettings>): BooksSettings {
    return { ...blankSettings(), ...fields }
}

// A batch that stopped part way: the name is saved, the done mark is not, and
// only some starter accounts exist.
async function renderHalfDone(
    ownership: 'owners' | 'corporation',
    next?: () => void,
    saved: BooksSettings['ownership'] = ownership
) {
    seedBooks({
        level: 'admin',
        ledger: {
            ...seedLedger,
            settings: [
                settingsWith({
                    business_name: 'Acme Corp',
                    fiscal_year_start_month: 4,
                    ownership: saved,
                    setup_started: true,
                }),
            ],
        },
    })
    await emptyAccounts()
    const chart = starterChart(ownership)
    const equity = chart.filter(account => account.type === 'equity')
    const cash = chart.filter(account => account.number === '1000')
    await accountsStore().insert([...cash, ...equity].map(startedRow)).isPersisted.promise
    resetWriteCounts()
    const rendered = renderParts(next)
    await waitFor(() => expect(rendered.result.current.part).not.toBe('loading'))
    return rendered
}

describe('useSetupParts on a book named by the Settings form', () => {
    it('starts at business with the saved name when setup_started is false', async () => {
        seedBooks({
            level: 'admin',
            ledger: {
                ...seedLedger,
                settings: [
                    settingsWith({ business_name: 'Acme Corp', fiscal_year_start_month: 4 }),
                ],
            },
        })
        await emptyAccounts()
        const rendered = renderParts()
        await waitFor(() => expect(rendered.result.current.part).toBe('business'))

        expect(rendered.result.current.setup.isResuming).toBe(false)
        await waitFor(() =>
            expect(rendered.result.current.form.getValues('business_name')).toBe('Acme Corp')
        )
        expect(rendered.result.current.canGoBack).toBe(true)
    })
})

describe('useSetupParts on a half-done book', () => {
    it('opens on chart with the saved name, month and the saved corporation choice', async () => {
        const rendered = await renderHalfDone('corporation')

        expect(rendered.result.current.part).toBe('chart')
        await waitFor(() => expect(rendered.result.current.ownership).toBe('corporation'))
        expect(rendered.result.current.form.getValues('business_name')).toBe('Acme Corp')
        expect(String(rendered.result.current.form.getValues('fiscal_year_start_month'))).toBe('4')
    })

    it('opens on chart with owners when the saved ownership is owners', async () => {
        const rendered = await renderHalfDone('owners')

        expect(rendered.result.current.part).toBe('chart')
        expect(rendered.result.current.ownership).toBe('owners')
    })

    it('inserts only the missing accounts and never owner-only equity into a corporation chart', async () => {
        const rendered = await renderHalfDone('corporation')
        await waitFor(() => expect(rendered.result.current.ownership).toBe('corporation'))
        const before = storedAccounts().length

        await act(async () => {
            await rendered.result.current.create()
        })

        await waitFor(() => expect(rendered.result.current.part).toBe('done'))
        const names = storedAccounts().map(row => row.name)
        expect(names).not.toContain("Owner's equity")
        expect(names).not.toContain("Owner's contributions")
        expect(names).not.toContain("Owner's draws")
        expect(storedAccounts()).toHaveLength(starterChart('corporation').length)
        expect(enteredWrites()).toHaveLength(starterChart('corporation').length - before)
    })

    it('presets owners for a half-done book whose saved ownership is empty', async () => {
        const rendered = await renderHalfDone('corporation', undefined, '')

        expect(rendered.result.current.part).toBe('chart')
        expect(rendered.result.current.ownership).toBe('owners')
    })

    it('presets the saved ownership even when the equity accounts say otherwise', async () => {
        const rendered = await renderHalfDone('owners', undefined, 'corporation')

        await waitFor(() => expect(rendered.result.current.ownership).toBe('corporation'))
    })

    it('offers no skip while resuming and offers it on a fresh empty book', async () => {
        const resuming = await renderHalfDone('owners')
        expect(resuming.result.current.canSkip).toBe(false)

        const fresh = await renderOpen({}, { emptyChart: true })
        expect(fresh.result.current.canSkip).toBe(true)
    })
})

describe('useSetupParts second fix round', () => {
    it('presets corporation after a remount when the failed create stopped after one insert', async () => {
        const first = await renderOpen({}, { emptyChart: true })
        fill(first, { name: 'Acme Corp', month: '4', ownership: 'corporation' })
        await press(first, 'goNext')
        await press(first, 'goNext')
        refuseAfterNow(1, messageRefusal('Number already used'))
        await act(async () => {
            await first.result.current.create()
        })
        await waitFor(() => expect(first.result.current.part).toBe('error'))
        expect(storedAccounts()).toHaveLength(1)
        expect(settingsStore().get(SETTINGS_ID)?.ownership).toBe('corporation')
        first.unmount()
        liftRefusal()
        resetWriteCounts()

        const second = renderParts()
        await waitFor(() => expect(second.result.current.part).toBe('chart'))
        await waitFor(() => expect(second.result.current.ownership).toBe('corporation'))
        await act(async () => {
            await second.result.current.create()
        })

        await waitFor(() => expect(second.result.current.part).toBe('done'))
        const names = storedAccounts().map(row => row.name)
        expect(names).not.toContain("Owner's equity")
        expect(names).not.toContain("Owner's contributions")
        expect(names).not.toContain("Owner's draws")
        expect(names).toContain('Common stock')
    })

    it('offers no Back from chart while resuming, and goBack leaves the part on chart', async () => {
        const resuming = await renderHalfDone('owners')
        expect(resuming.result.current.part).toBe('chart')
        expect(resuming.result.current.canGoBack).toBe(false)

        await press(resuming, 'goBack')
        expect(resuming.result.current.part).toBe('chart')

        const fresh = await renderOpen({}, { emptyChart: true })
        await toChart(fresh)
        expect(fresh.result.current.canGoBack).toBe(true)
    })

    it('offers Back on a half-done book with no accounts, down to the business part', async () => {
        seedBooks({
            level: 'admin',
            ledger: {
                ...seedLedger,
                settings: [
                    settingsWith({
                        business_name: 'Acme Corp',
                        fiscal_year_start_month: 4,
                        setup_started: true,
                    }),
                ],
            },
        })
        await emptyAccounts()
        const rendered = renderParts()
        await waitFor(() => expect(rendered.result.current.part).toBe('chart'))
        expect(rendered.result.current.setup.isResuming).toBe(true)
        expect(rendered.result.current.accountCount).toBe(0)
        expect(rendered.result.current.canGoBack).toBe(true)

        await press(rendered, 'goBack')
        expect(rendered.result.current.part).toBe('ownership')
        expect(rendered.result.current.canGoBack).toBe(true)

        await press(rendered, 'goBack')
        expect(rendered.result.current.part).toBe('business')
    })

    it('returns to business and shows the form error when create is pressed with an invalid value', async () => {
        const rendered = await renderOpen({}, { emptyChart: true })
        await toChart(rendered)
        fill(rendered, { name: '   ' })

        await act(async () => {
            await rendered.result.current.create()
        })

        expect(rendered.result.current.part).toBe('business')
        await waitFor(() =>
            expect(rendered.result.current.errors.business_name?.message).toBe(
                'Enter the legal business name'
            )
        )
        expect(storedAccounts()).toHaveLength(0)
    })

    it('shows done, not non-admin, to a non-admin opening a completed book', async () => {
        seedBooks({
            level: 'bookkeeper',
            ledger: {
                ...seedLedger,
                settings: [settingsWith({ business_name: 'Acme', setup_completed: true })],
            },
        })
        const rendered = renderParts()
        await waitFor(() => expect(rendered.result.current.part).not.toBe('loading'))
        expect(rendered.result.current.part).toBe('done')
    })

    it('shows non-admin to a non-admin opening a book that is not completed', async () => {
        const rendered = await renderOpen({ level: 'bookkeeper' })
        expect(rendered.result.current.part).toBe('non-admin')
    })
})

describe('useSetupParts press while a create runs', () => {
    it('stays creating, writes one batch and ends on done', async () => {
        const rendered = await renderOpen({}, { emptyChart: true })
        await toChart(rendered)
        const release = holdWrites()

        let second: Promise<unknown> | undefined
        let first: Promise<unknown> | undefined
        act(() => {
            first = rendered.result.current.create()
            second = rendered.result.current.create()
        })
        await waitFor(() => expect(rendered.result.current.progress).not.toBeNull())
        expect(rendered.result.current.part).toBe('creating')
        const creatingFrom = history.findIndex(entry => entry.part === 'creating')
        await act(async () => {
            release()
            await Promise.all([first, second])
        })

        await waitFor(() => expect(rendered.result.current.part).toBe('done'))
        const afterCreating = history.slice(creatingFrom).map(entry => entry.part)
        expect(afterCreating.filter(part => !['creating', 'done'].includes(part))).toEqual([])
        expect(storedAccounts()).toHaveLength(chartSize)
        expect(writeLog().filter(entry => entry.startsWith('settings:'))).toHaveLength(2)
    })

    it('keeps the failure and ends on error when the one batch is refused', async () => {
        const rendered = await renderOpen({}, { emptyChart: true })
        await toChart(rendered)
        refuseAfterNow(1, messageRefusal('Number already used'))

        const release = holdWrites()
        let presses: Promise<unknown> | undefined
        act(() => {
            presses = Promise.all([
                rendered.result.current.create(),
                rendered.result.current.create(),
            ])
        })
        await waitFor(() => expect(rendered.result.current.progress).not.toBeNull())
        expect(rendered.result.current.part).toBe('creating')
        await act(async () => {
            release()
            await presses
        })

        await waitFor(() => expect(rendered.result.current.part).toBe('error'))
        expect(rendered.result.current.failure?.message).toContain('Number already used')
        expect(rendered.result.current.failure?.failedAccount).toBeTruthy()
        expect(enteredWrites()).toHaveLength(2)
        const creatingFrom = history.findIndex(entry => entry.part === 'creating')
        const afterCreating = history.slice(creatingFrom).map(entry => entry.part)
        expect(afterCreating.filter(part => !['creating', 'error'].includes(part))).toEqual([])
    })

    it('never draws error without a failure', async () => {
        const rendered = await renderOpen({}, { emptyChart: true })
        await toChart(rendered)
        refuseAfterNow(1, messageRefusal('Number already used'))
        await act(async () => {
            await Promise.all([rendered.result.current.create(), rendered.result.current.create()])
        })
        await waitFor(() => expect(rendered.result.current.part).toBe('error'))

        const errorsWithoutFailure = history.filter(
            entry => entry.part === 'error' && !entry.hasFailure
        )
        expect(errorsWithoutFailure).toEqual([])
    })

    it('keeps the earlier failure and stays creating when a press during Try again is ignored', async () => {
        const rendered = await renderOpen({}, { emptyChart: true })
        await toChart(rendered)
        refuseAfterNow(1, messageRefusal('Number already used'))
        await act(async () => {
            await rendered.result.current.create()
        })
        await waitFor(() => expect(rendered.result.current.part).toBe('error'))
        const release = holdWrites()

        let first: Promise<unknown> | undefined
        let second: Promise<unknown> | undefined
        act(() => {
            first = rendered.result.current.retry()
            second = rendered.result.current.retry()
        })
        await waitFor(() => expect(rendered.result.current.progress).not.toBeNull())
        expect(rendered.result.current.part).toBe('creating')
        const retryFrom = history.findIndex(entry => entry.part === 'creating')
        await act(async () => {
            release()
            await Promise.all([first, second])
        })

        await waitFor(() => expect(rendered.result.current.part).toBe('error'))
        expect(rendered.result.current.failure?.message).toContain('Number already used')
        const afterRetry = history.slice(retryFrom).map(entry => entry.part)
        expect(afterRetry.filter(part => !['creating', 'error'].includes(part))).toEqual([])
        expect(history.filter(entry => entry.part === 'error' && !entry.hasFailure)).toEqual([])
    })
})

describe('useSetupParts next contract', () => {
    it('calls next once after a successful create, also when pressed twice', async () => {
        const next = vi.fn()
        seedBooks({ level: 'admin', ledger: seedLedger })
        await emptyAccounts()
        resetWriteCounts()
        const rendered = renderParts(next)
        await waitFor(() => expect(rendered.result.current.part).toBe('business'))
        await toChart(rendered)

        await act(async () => {
            await Promise.all([rendered.result.current.create(), rendered.result.current.create()])
        })

        await waitFor(() => expect(rendered.result.current.part).toBe('done'))
        expect(next).toHaveBeenCalledTimes(1)
    })

    it('calls next once after the populated-book finish and writes only settings', async () => {
        const next = vi.fn()
        seedBooks({ level: 'admin', ledger: seedLedger })
        resetWriteCounts()
        const rendered = renderParts(next)
        await waitFor(() => expect(rendered.result.current.part).not.toBe('loading'))
        await toChart(rendered)
        expect(rendered.result.current.part).toBe('populated')

        await act(async () => {
            await rendered.result.current.create()
        })

        await waitFor(() => expect(rendered.result.current.part).toBe('done'))
        expect(next).toHaveBeenCalledTimes(1)
        expect(writeLog().length).toBeGreaterThan(0)
        expect(writeLog().every(entry => entry.startsWith('settings:'))).toBe(true)
    })

    it('calls next once after skip, writing only the settings row', async () => {
        const next = vi.fn()
        seedBooks({ level: 'admin', ledger: seedLedger })
        await emptyAccounts()
        resetWriteCounts()
        const rendered = renderParts(next)
        await waitFor(() => expect(rendered.result.current.part).toBe('business'))
        await toChart(rendered)

        await act(async () => {
            await rendered.result.current.skipChart()
        })

        await waitFor(() => expect(rendered.result.current.part).toBe('done'))
        expect(next).toHaveBeenCalledTimes(1)
        expect(storedAccounts()).toHaveLength(0)
        expect(writeLog()).toEqual([`settings:${SETTINGS_ID}`])
        expect(settingsStore().get(SETTINGS_ID)?.setup_completed).toBe(true)
    })

    it('never calls next after a refused create', async () => {
        const next = vi.fn()
        seedBooks({ level: 'admin', ledger: seedLedger })
        await emptyAccounts()
        const rendered = renderParts(next)
        await waitFor(() => expect(rendered.result.current.part).toBe('business'))
        await toChart(rendered)
        refuseAfterNow(1, messageRefusal('Number already used'))

        await act(async () => {
            await Promise.all([rendered.result.current.create(), rendered.result.current.create()])
        })

        await waitFor(() => expect(rendered.result.current.part).toBe('error'))
        expect(next).not.toHaveBeenCalled()
    })
})

describe('useSetupParts other parts', () => {
    it('opens a completed book on done', async () => {
        seedBooks({
            level: 'admin',
            ledger: {
                ...seedLedger,
                settings: [settingsWith({ business_name: 'Acme', setup_completed: true })],
            },
        })
        const rendered = renderParts()
        await waitFor(() => expect(rendered.result.current.part).not.toBe('loading'))
        expect(rendered.result.current.part).toBe('done')
    })

    it('exposes progress while creating', async () => {
        const rendered = await renderOpen({}, { emptyChart: true })
        await toChart(rendered)
        const release = holdWrites()

        let pending: Promise<unknown> | undefined
        act(() => {
            pending = rendered.result.current.create()
        })
        await waitFor(() => expect(rendered.result.current.part).toBe('creating'))
        await waitFor(() => expect(rendered.result.current.progress).not.toBeNull())
        expect(rendered.result.current.progress).toEqual({ done: 0, total: chartSize })
        await act(async () => {
            release()
            await pending
        })
        await waitFor(() => expect(rendered.result.current.part).toBe('done'))
    })

    it('Try again after an error continues and ends on done', async () => {
        const rendered = await renderOpen({}, { emptyChart: true })
        await toChart(rendered)
        refuseAfterNow(2, messageRefusal('Number already used'))
        await act(async () => {
            await rendered.result.current.create()
        })
        await waitFor(() => expect(rendered.result.current.part).toBe('error'))
        liftRefusal()

        await act(async () => {
            await rendered.result.current.retry()
        })

        await waitFor(() => expect(rendered.result.current.part).toBe('done'))
        const numbers = storedAccounts().map(row => row.number)
        expect(new Set(numbers).size).toBe(numbers.length)
        expect(numbers).toHaveLength(chartSize)
    })
})
