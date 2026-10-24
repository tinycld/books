// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { notify } from '@tinycld/core/lib/notify/dispatcher'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBooksSetup } from '../tinycld/books/hooks/useBooksSetup'
import { ACCOUNTS } from '../tinycld/books/lib/chart-of-accounts-fixture'
import { planChart } from '../tinycld/books/lib/setup-plan'
import type { SetupValues } from '../tinycld/books/lib/setup-schema'
import { starterChart } from '../tinycld/books/lib/starter-chart'
import type { BooksSettings } from '../tinycld/books/types'
import {
    accountsStore,
    holdWrites,
    liftRefusal,
    messageRefusal,
    refuseAfterNow,
    refuseSettingsAfterNow,
    resetWriteCounts,
    seedBooks,
    settingsStore,
    stepWrites,
    storedAccounts,
    writeLog,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const log = silenceLog()
const emitted = vi.spyOn(notify, 'emit').mockImplementation(() => {})

const SETTINGS_ID = 'bookssettings01'
const values: SetupValues = {
    business_name: 'Acme Plumbing',
    fiscal_year_start_month: 4,
    ownership: 'owners',
}
const chartSize = starterChart('owners').length
const parentCount = planChart('owners', new Map())[0].length

function blankSettings(): BooksSettings {
    return {
        id: SETTINGS_ID,
        close_date: '',
        fiscal_year_start_month: 1,
        currency: 'USD',
        business_name: '',
        setup_completed: false,
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
    }
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

// The harness seeds a populated chart; setup needs a book with no accounts.
async function emptyAccounts() {
    const transaction = accountsStore().delete(storedAccounts().map(row => row.id))
    await transaction.isPersisted.promise
}

type Seed = Parameters<typeof seedBooks>[0]
type Refusal = { after: number; error: unknown }

function renderSetup(progressSeen: ({ done: number; total: number } | null)[] = []) {
    return renderHook(
        () => {
            const setup = useBooksSetup()
            progressSeen.push(setup.progress)
            return setup
        },
        { wrapper }
    )
}

// `refuseAfter` counts the account writes made after the chart is emptied, not
// the harness's own deletes.
async function renderEmptyBook(seed: Seed = {}, refuseAfter?: Refusal) {
    seedBooks({
        level: 'admin',
        ledger: { lines: [], entries: [], balances: [], settings: [blankSettings()] },
        ...seed,
    })
    await emptyAccounts()
    resetWriteCounts()
    if (refuseAfter) refuseAfterNow(refuseAfter.after, refuseAfter.error)
    const baseline = writeLog().length
    const progressSeen: ({ done: number; total: number } | null)[] = []
    const rendered = renderSetup(progressSeen)
    await waitFor(() => {
        expect(rendered.result.current.isReady).toBe(true)
        expect(rendered.result.current.accountCount).toBe(0)
    })
    return { rendered, baseline, progressSeen }
}

type Rendered = Awaited<ReturnType<typeof renderEmptyBook>>['rendered']

async function run(rendered: Rendered, action: 'create' | 'skipChart') {
    let outcome: Awaited<ReturnType<Rendered['result']['current']['create']>> | undefined
    await act(async () => {
        outcome = await rendered.result.current[action](values)
    })
    return outcome
}

function settingsRow() {
    return settingsStore().get(SETTINGS_ID)
}

function tick(ms = 30) {
    return act(async () => {
        await new Promise(resolve => setTimeout(resolve, ms))
    })
}

beforeEach(() => {
    liftRefusal()
    emitted.mockClear()
})

const noSettings: Seed = { ledger: { lines: [], entries: [], balances: [], settings: [] } }

function insertedIdsOf(writes: string[]) {
    return writes.filter(entry => entry.startsWith('account:')).map(e => e.replace('account:', ''))
}

function expectParentsBeforeChildren(ids: string[], rows: { id: string; parent: string }[]) {
    ids.forEach((id, index) => {
        const row = rows.find(item => item.id === id)
        if (!row?.parent) return
        expect(ids.indexOf(row.parent)).toBeGreaterThanOrEqual(0)
        expect(ids.indexOf(row.parent)).toBeLessThan(index)
    })
}

describe('useBooksSetup create', () => {
    it('writes the settings row first, then every account, then the settings row last', async () => {
        const { rendered, baseline } = await renderEmptyBook()

        const outcome = await run(rendered, 'create')

        expect(outcome).toEqual({ ok: true, created: chartSize })
        const rows = storedAccounts()
        expect(rows.map(row => row.number).sort()).toEqual(
            starterChart('owners')
                .map(item => item.number)
                .sort()
        )
        expect(settingsRow()).toMatchObject({
            business_name: 'Acme Plumbing',
            fiscal_year_start_month: 4,
            setup_completed: true,
        })

        const writes = writeLog().slice(baseline)
        expect(writes).toHaveLength(chartSize + 2)
        expect(writes[0]).toBe(`settings:${SETTINGS_ID}`)
        expect(writes.at(-1)).toBe(`settings:${SETTINGS_ID}`)
        const insertedIds = insertedIdsOf(writes)
        expect(insertedIds).toHaveLength(chartSize)
        expect(new Set(insertedIds)).toEqual(new Set(rows.map(row => row.id)))
        expectParentsBeforeChildren(insertedIds, rows)
        const checking = rows.find(row => row.number === '1010')
        expect(rows.find(row => row.id === checking?.parent)?.number).toBe('1000')
    })

    it('starts each write only after the one before it succeeded, for every write', async () => {
        const { rendered, baseline } = await renderEmptyBook()
        const steps = stepWrites()
        const total = chartSize + 2

        let pending: Promise<unknown> = Promise.resolve()
        act(() => {
            pending = rendered.result.current.create(values)
        })
        try {
            for (let written = 1; written <= total; written += 1) {
                await waitFor(() => expect(writeLog().length - baseline).toBe(written))
                await tick()
                expect(writeLog().length - baseline).toBe(written)
                if (written === 1) {
                    expect(writeLog()[baseline]).toBe(`settings:${SETTINGS_ID}`)
                    expect(settingsRow()).toMatchObject({
                        business_name: 'Acme Plumbing',
                        fiscal_year_start_month: 4,
                        setup_completed: false,
                    })
                }
                if (written === total) {
                    expect(writeLog()[baseline + total - 1]).toBe(`settings:${SETTINGS_ID}`)
                    expect(settingsRow()?.setup_completed).toBe(true)
                }
                await act(async () => {
                    steps.next()
                })
            }
        } finally {
            // A failed assertion must not leave the batch running into the next test.
            steps.stop()
            await act(async () => {
                await pending
            })
        }
        expect(writeLog().length - baseline).toBe(total)
    })

    it('stops on a refused account, names it, and keeps setup incomplete', async () => {
        const { rendered, baseline } = await renderEmptyBook(
            {},
            { after: 3, error: messageRefusal('Number 1100 is taken') }
        )

        const outcome = await run(rendered, 'create')

        const refused = planChart('owners', new Map()).flat()[3]
        expect(outcome).toMatchObject({ ok: false, failedAccount: refused.name })
        expect(outcome && !outcome.ok && outcome.message).toContain('Number 1100 is taken')
        expect(storedAccounts()).toHaveLength(3)
        expect(settingsRow()?.setup_completed).toBe(false)
        expect(
            writeLog()
                .slice(baseline)
                .filter(entry => entry.startsWith('settings:'))
        ).toHaveLength(1)
        expect(log.error).toHaveBeenCalledWith('books.setup', expect.anything())
    })

    it('after the refusal is lifted, inserts only the missing accounts and finishes', async () => {
        const { rendered, baseline } = await renderEmptyBook(
            {},
            { after: 3, error: messageRefusal('Number 1100 is taken') }
        )
        await run(rendered, 'create')
        liftRefusal()
        const mark = writeLog().length

        const outcome = await run(rendered, 'create')

        expect(outcome).toEqual({ ok: true, created: chartSize - 3 })
        const numbersStored = storedAccounts().map(row => row.number)
        expect(new Set(numbersStored).size).toBe(numbersStored.length)
        expect(numbersStored).toHaveLength(chartSize)
        const retryWrites = writeLog().slice(mark)
        expect(retryWrites.filter(entry => entry.startsWith('account:'))).toHaveLength(
            chartSize - 3
        )
        // The marker update carries values the first attempt already stored, so it
        // is a no-op and logs no write; only the closing settings write is observable.
        expect(retryWrites).toHaveLength(chartSize - 3 + 1)
        expect(retryWrites.slice(0, -1).every(entry => entry.startsWith('account:'))).toBe(true)
        expect(retryWrites.at(-1)).toBe(`settings:${SETTINGS_ID}`)
        expect(baseline).toBeLessThanOrEqual(mark)
        expect(settingsRow()?.setup_completed).toBe(true)
    })

    it('retries a child refused after its parent was inserted with the existing parent id', async () => {
        const { rendered } = await renderEmptyBook(
            {},
            { after: parentCount, error: messageRefusal('Parent is inactive') }
        )

        const first = await run(rendered, 'create')

        expect(first).toMatchObject({ ok: false })
        expect(storedAccounts()).toHaveLength(parentCount)
        expect(storedAccounts().every(row => !row.parent)).toBe(true)
        const cashId = storedAccounts().find(row => row.number === '1000')?.id
        expect(cashId).toBeTruthy()

        liftRefusal()
        const second = await run(rendered, 'create')

        expect(second).toEqual({ ok: true, created: chartSize - parentCount })
        const rows = storedAccounts()
        expect(rows.filter(row => row.number === '1000')).toHaveLength(1)
        expect(rows.find(row => row.number === '1010')?.parent).toBe(cashId)
        expect(rows.find(row => row.number === '1020')?.parent).toBe(cashId)
    })

    it('keeps resuming after a remount and completes the chart without duplicates', async () => {
        const { rendered } = await renderEmptyBook(
            {},
            { after: 3, error: messageRefusal('Number 1100 is taken') }
        )
        expect(rendered.result.current.isResuming).toBe(false)
        await run(rendered, 'create')
        await waitFor(() => expect(rendered.result.current.isResuming).toBe(true))
        rendered.unmount()
        liftRefusal()

        const again = renderSetup()
        await waitFor(() => {
            expect(again.result.current.isReady).toBe(true)
            expect(again.result.current.accountCount).toBe(3)
        })
        expect(again.result.current.isResuming).toBe(true)
        const mark = writeLog().length
        let outcome: Awaited<ReturnType<typeof again.result.current.create>> | undefined
        await act(async () => {
            outcome = await again.result.current.create(values)
        })

        expect(outcome).toEqual({ ok: true, created: chartSize - 3 })
        const numbersStored = storedAccounts().map(row => row.number)
        expect(new Set(numbersStored).size).toBe(numbersStored.length)
        expect(numbersStored).toHaveLength(chartSize)
        expect(
            writeLog()
                .slice(mark)
                .filter(entry => entry.startsWith('account:'))
        ).toHaveLength(chartSize - 3)
        expect(settingsRow()?.setup_completed).toBe(true)
        expect(again.result.current.isResuming).toBe(false)
    })

    it('writes one settings update with all three fields when the book already has accounts', async () => {
        seedBooks({
            level: 'admin',
            ledger: { lines: [], entries: [], balances: [], settings: [blankSettings()] },
        })
        const baseline = writeLog().length
        const rendered = renderSetup()
        await waitFor(() => {
            expect(rendered.result.current.isReady).toBe(true)
            expect(rendered.result.current.accountCount).toBe(ACCOUNTS.length)
        })
        expect(rendered.result.current.isResuming).toBe(false)

        const outcome = await run(rendered, 'create')

        expect(outcome).toEqual({ ok: true, created: 0 })
        expect(writeLog().slice(baseline)).toEqual([`settings:${SETTINGS_ID}`])
        expect(storedAccounts()).toHaveLength(ACCOUNTS.length)
        expect(settingsRow()).toMatchObject({
            business_name: 'Acme Plumbing',
            fiscal_year_start_month: 4,
            setup_completed: true,
        })
    })

    it('reports a refused settings write as Business settings, before any account', async () => {
        const { rendered } = await renderEmptyBook({
            refuseSettings: messageRefusal('Only admins can do this'),
        })

        const outcome = await run(rendered, 'create')

        expect(outcome).toMatchObject({ ok: false, failedAccount: 'Business settings' })
        expect(outcome && !outcome.ok && outcome.message).toContain('Only admins can do this')
        expect(settingsRow()?.setup_completed).toBe(false)
        expect(storedAccounts()).toHaveLength(0)
    })

    it('reports a missing settings row as Business settings and inserts no account', async () => {
        const { rendered, baseline } = await renderEmptyBook(noSettings)

        const outcome = await run(rendered, 'create')

        expect(outcome).toMatchObject({ ok: false, failedAccount: 'Business settings' })
        expect(storedAccounts()).toHaveLength(0)
        expect(writeLog().slice(baseline)).toEqual([])
    })

    it('returns busy for a second create while the first runs, and adds no write', async () => {
        const { rendered, baseline } = await renderEmptyBook()
        const release = holdWrites()

        let first: Promise<unknown> = Promise.resolve()
        act(() => {
            first = rendered.result.current.create(values)
        })
        await waitFor(() => expect(writeLog().length - baseline).toBe(1))
        let second: unknown
        await act(async () => {
            second = await rendered.result.current.create(values)
        })

        expect(second).toEqual({ ok: false, busy: true })
        await tick()
        expect(writeLog().length - baseline).toBe(1)

        release()
        await act(async () => {
            await first
        })
        expect(await first).toEqual({ ok: true, created: chartSize })
        expect(writeLog().length - baseline).toBe(chartSize + 2)
    })

    it('returns busy and writes nothing before the queries are ready', async () => {
        seedBooks({
            level: 'admin',
            accountsNeverReady: true,
            ledger: { lines: [], entries: [], balances: [], settings: [blankSettings()] },
        })
        const rendered = renderSetup()
        expect(rendered.result.current.isReady).toBe(false)

        let outcome: unknown
        await act(async () => {
            outcome = await rendered.result.current.create(values)
        })

        expect(outcome).toEqual({ ok: false, busy: true })
        expect(writeLog()).toEqual([])
    })

    it('reports progress rising to the total during create, and null before and after', async () => {
        const { rendered, progressSeen } = await renderEmptyBook()
        expect(rendered.result.current.progress).toBeNull()
        const release = holdWrites()

        let pending: Promise<unknown> = Promise.resolve()
        act(() => {
            pending = rendered.result.current.create(values)
        })
        await waitFor(() =>
            expect(rendered.result.current.progress).toEqual({ done: 0, total: chartSize })
        )
        release()
        await act(async () => {
            await pending
        })

        const during = progressSeen.filter(item => item !== null)
        const dones = during.map(item => item.done)
        expect(during.every(item => item.total === chartSize)).toBe(true)
        expect(dones).toEqual([...dones].sort((a, b) => a - b))
        expect(dones[0]).toBe(0)
        expect(dones.at(-1)).toBe(chartSize)
        expect(rendered.result.current.progress).toBeNull()
    })

    it('on a retry reports the whole chart as the total and starts done at the existing count', async () => {
        const { rendered, progressSeen } = await renderEmptyBook(
            {},
            { after: 3, error: messageRefusal('Number 1100 is taken') }
        )
        await run(rendered, 'create')
        liftRefusal()
        const mark = progressSeen.length

        await run(rendered, 'create')

        const during = progressSeen.slice(mark).filter(item => item !== null)
        expect(during.every(item => item.total === chartSize)).toBe(true)
        expect(during[0]).toEqual({ done: 3, total: chartSize })
        expect(during.at(-1)).toEqual({ done: chartSize, total: chartSize })
        expect(rendered.result.current.progress).toBeNull()
    })
})

describe('useBooksSetup skipChart', () => {
    it('writes only the settings row and inserts no account', async () => {
        const { rendered, baseline } = await renderEmptyBook()

        const outcome = await run(rendered, 'skipChart')

        expect(outcome).toEqual({ ok: true, created: 0 })
        expect(writeLog().slice(baseline)).toEqual([`settings:${SETTINGS_ID}`])
        expect(storedAccounts()).toHaveLength(0)
        expect(settingsRow()).toMatchObject({
            business_name: 'Acme Plumbing',
            setup_completed: true,
        })
    })

    it('reports a refused settings write as Business settings', async () => {
        const { rendered } = await renderEmptyBook({
            refuseSettings: messageRefusal('Only admins can do this'),
        })

        const outcome = await run(rendered, 'skipChart')

        expect(outcome).toMatchObject({ ok: false, failedAccount: 'Business settings' })
        expect(settingsRow()?.setup_completed).toBe(false)
    })
})

describe('useBooksSetup refusals', () => {
    // The hook returns the failure as an outcome and logs it, so core's
    // unhandled-mutation report (a toast plus Sentry) must not fire as well.
    it("does not also raise core's unhandled-mutation report for a refused account", async () => {
        const { rendered } = await renderEmptyBook(
            {},
            { after: 3, error: messageRefusal('Number 1100 is taken') }
        )

        const outcome = await run(rendered, 'create')
        await tick()

        expect(outcome).toMatchObject({ ok: false })
        expect(emitted).not.toHaveBeenCalledWith(
            expect.objectContaining({ event: 'mutation.error' })
        )
    })

    it("does not also raise core's unhandled-mutation report for a refused settings write", async () => {
        const { rendered } = await renderEmptyBook({
            refuseSettings: messageRefusal('Only admins can do this'),
        })

        const outcome = await run(rendered, 'create')
        await tick()

        expect(outcome).toMatchObject({ ok: false, failedAccount: 'Business settings' })
        expect(emitted).not.toHaveBeenCalledWith(
            expect.objectContaining({ event: 'mutation.error' })
        )
    })

    it('resumes after the closing settings write is refused with every account inserted', async () => {
        const { rendered } = await renderEmptyBook()
        refuseSettingsAfterNow(1, messageRefusal('Closing write refused'))

        const first = await run(rendered, 'create')

        expect(first).toMatchObject({ ok: false, failedAccount: 'Business settings' })
        expect(first && !first.ok && 'message' in first && first.message).toContain(
            'Closing write refused'
        )
        expect(storedAccounts()).toHaveLength(chartSize)
        expect(settingsRow()?.setup_completed).toBe(false)
        await waitFor(() => expect(rendered.result.current.isResuming).toBe(true))

        liftRefusal()
        const mark = writeLog().length
        const second = await run(rendered, 'create')

        expect(second).toEqual({ ok: true, created: 0 })
        const retryWrites = writeLog().slice(mark)
        expect(retryWrites.filter(entry => entry.startsWith('account:'))).toHaveLength(0)
        expect(retryWrites.filter(entry => entry.startsWith('settings:'))).toHaveLength(1)
        expect(storedAccounts()).toHaveLength(chartSize)
        expect(settingsRow()?.setup_completed).toBe(true)
    })
})
