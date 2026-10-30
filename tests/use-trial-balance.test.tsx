// @vitest-environment happy-dom
import { createLiveQueryCollection } from '@tanstack/db'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBooksSettings } from '../tinycld/books/hooks/useBooksSettings'
import { useTrialBalance } from '../tinycld/books/hooks/useTrialBalance'
import type { ReportModel, ReportOptions } from '../tinycld/books/lib/report-definition'
import {
    REPORT_ACCOUNTS,
    REPORT_SETTINGS,
    TRIAL_BALANCE_OPTIONS,
} from '../tinycld/books/lib/report-shell-fixture'
import { TRIAL_BALANCE_COLUMNS } from '../tinycld/books/lib/reports/trial-balance-rows'
import type { BooksAccountBalances, BooksJournalLines, BooksSettings } from '../tinycld/books/types'
import {
    accountsStore,
    balanceStore,
    cleanups,
    lineStore,
    seedBooks,
} from './accounts-form-harness'
import { expectLiveQueryError } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const BANK = 'rpt_acct_1010'
const INCOME = 'rpt_acct_4000'
const RENT = 'rpt_acct_6000'
const SOFTWARE = 'rpt_acct_6100'
const TRAVEL = 'rpt_acct_6200'
const STAMP = '2026-01-01 00:00:00.000Z'

function balance(
    account: string,
    period: string,
    debit_total: number,
    credit_total: number
): BooksAccountBalances {
    return {
        id: `bal_${account}_${period}`,
        account,
        period,
        debit_total,
        credit_total,
        currency: 'USD',
        created: STAMP,
        updated: STAMP,
    }
}

function line(
    id: string,
    account: string,
    date: string,
    amounts: { debit?: number; credit?: number; posted?: boolean }
): BooksJournalLines {
    return {
        id,
        entry: `je_${id}`,
        account,
        debit: amounts.debit ?? 0,
        credit: amounts.credit ?? 0,
        memo: '',
        position: 0,
        posted: amounts.posted ?? true,
        date,
        currency: 'USD',
        created: STAMP,
        updated: STAMP,
    }
}

// 2025-11 is before the fiscal year of 2026-10-25 whatever the start month. 2026-03 is in
// the year when it starts in January and before it when it starts in July. The 2026-10 row
// must not be read for 2026-10-25: that month is read from its lines.
const BALANCES: BooksAccountBalances[] = [
    balance(BANK, '2025-11', 100_000, 0),
    balance(INCOME, '2025-11', 0, 100_000),
    balance(BANK, '2026-03', 0, 40_000),
    balance(RENT, '2026-03', 40_000, 0),
    balance(BANK, '2026-10', 999_000, 0),
    balance(INCOME, '2026-10', 0, 999_000),
]

const BANK_MARCH_ID = `bal_${BANK}_2026-03`

const LINES: BooksJournalLines[] = [
    line('counted_bank', BANK, '2026-10-10', { debit: 5_000 }),
    line('counted_income', INCOME, '2026-10-10', { credit: 5_000 }),
    line('late_bank', BANK, '2026-10-26', { debit: 7_000 }),
    line('late_income', INCOME, '2026-10-26', { credit: 7_000 }),
    line('draft_bank', BANK, '2026-10-12', { debit: 3_000, posted: false }),
    line('draft_income', INCOME, '2026-10-12', { credit: 3_000, posted: false }),
]

function seed(
    opts: {
        fiscalStartMonth?: number
        balancesFailsOnce?: boolean
        accountsFailsOnce?: boolean
        linesFailsOnce?: boolean
    } = {}
) {
    const settingsRow: BooksSettings = {
        ...REPORT_SETTINGS,
        fiscal_year_start_month: opts.fiscalStartMonth ?? 1,
    }
    seedBooks({
        ledger: {
            accounts: REPORT_ACCOUNTS,
            balances: BALANCES,
            lines: LINES,
            entries: [],
            settings: [settingsRow],
        },
        balancesFailsOnce: opts.balancesFailsOnce,
        accountsFailsOnce: opts.accountsFailsOnce,
        linesFailsOnce: opts.linesFailsOnce,
    })
}

function asOf(date: string): ReportOptions {
    return {
        ...TRIAL_BALANCE_OPTIONS,
        period: { kind: 'as-of', preset: 'custom', from: null, to: date },
    }
}

type Figure = { label: string; debit: unknown; credit: unknown }

function figures(model: ReportModel | undefined): Figure[] {
    return (model?.rows ?? []).map(row => ({
        label: row.label,
        debit: row.cells.debit,
        credit: row.cells.credit,
    }))
}

function subscriptions(store: { subscribeChanges: (...args: never[]) => unknown }) {
    return vi.spyOn(store, 'subscribeChanges')
}

// How many times a live query subscribed to each source the report reads.
function sourceReads() {
    const accounts = subscriptions(accountsStore())
    const balances = subscriptions(balanceStore())
    const lines = subscriptions(lineStore())
    return () => ({
        accounts: accounts.mock.calls.length,
        balances: balances.mock.calls.length,
        lines: lines.mock.calls.length,
    })
}

// TanStack DB numbers each live query collection it builds (`live-query-<n>`). A probe
// built before and after a run shows how many live query collections the run built.
function liveQueryNumber() {
    const probe = createLiveQueryCollection({ query: q => q.from({ probe: accountsStore() }) })
    return Number(probe.id.replace('live-query-', ''))
}

async function liveQueriesBuiltBy(run: () => Promise<void>) {
    const before = liveQueryNumber()
    await run()
    return liveQueryNumber() - before - 1
}

async function settingsQueriesBuilt() {
    return liveQueriesBuiltBy(async () => {
        const hook = renderHook(() => useBooksSettings())
        await waitFor(() => expect(hook.result.current.isReady).toBe(true))
        hook.unmount()
    })
}

// Fiscal year from January, as of 2026-10-25. Through 2026-09: bank 100_000 debit and
// 40_000 credit, income 100_000 credit, rent 40_000 debit. Before the year (through 2025-12):
// bank 100_000 debit, income 100_000 credit. The edge month adds the posted 2026-10-10 lines:
// bank 5_000 debit, income 5_000 credit. So bank 65_000 debit, income 5_000 credit (this
// year only), rent 40_000 debit, and the prior-year income of 100_000 sits in retained
// earnings.
const OCTOBER_25: Figure[] = [
    { label: '1010 Operating checking', debit: 65_000, credit: null },
    { label: '3900 Retained earnings', debit: null, credit: 100_000 },
    { label: '4000 Consulting income', debit: null, credit: 5_000 },
    { label: '6000 Rent', debit: 40_000, credit: null },
    { label: 'Total', debit: 105_000, credit: 105_000 },
]

// The same ledger as of 2026-09-30: whole months only, so no lines and no October rows.
const SEPTEMBER_30: Figure[] = [
    { label: '1010 Operating checking', debit: 60_000, credit: null },
    { label: '3900 Retained earnings', debit: null, credit: 100_000 },
    { label: '6000 Rent', debit: 40_000, credit: null },
    { label: 'Total', debit: 100_000, credit: 100_000 },
]

async function readyHook(date: string) {
    const hook = renderHook(() => useTrialBalance(asOf(date)))
    await waitFor(() => expect(hook.result.current.state).toBe('ready'))
    return hook
}

describe('useTrialBalance', () => {
    beforeEach(() => seed())

    it('stays loading with no model while options are null, also after the collections load', async () => {
        const hook = renderHook(() => ({
            report: useTrialBalance(null),
            settings: useBooksSettings(),
        }))
        await waitFor(() => expect(hook.result.current.settings.isReady).toBe(true))
        await act(async () => {
            await accountsStore().toArrayWhenReady()
            await lineStore().toArrayWhenReady()
        })
        expect(hook.result.current.report.state).toBe('loading')
        expect(hook.result.current.report.model).toBeUndefined()
    })

    it('reads whole months from balance rows and the partial month from posted lines up to the date', async () => {
        const hook = await readyHook('2026-10-25')
        expect(figures(hook.result.current.model)).toEqual(OCTOBER_25)
        expect(hook.result.current.model?.columns).toEqual(TRIAL_BALANCE_COLUMNS)
    })

    it('reads no lines for a month-end date', async () => {
        const lineReads = subscriptions(lineStore())
        const hook = await readyHook('2026-09-30')
        expect(figures(hook.result.current.model)).toEqual(SEPTEMBER_30)
        expect(lineReads).not.toHaveBeenCalled()
    })

    it('follows a new posted line and a changed balance row without a reload', async () => {
        const hook = await readyHook('2026-10-25')
        await act(async () => {
            lineStore().insert(line('new_bank', BANK, '2026-10-20', { debit: 2_500 }))
        })
        await waitFor(() =>
            expect(figures(hook.result.current.model)).toEqual([
                { label: '1010 Operating checking', debit: 67_500, credit: null },
                { label: '3900 Retained earnings', debit: null, credit: 100_000 },
                { label: '4000 Consulting income', debit: null, credit: 5_000 },
                { label: '6000 Rent', debit: 40_000, credit: null },
                { label: 'Total', debit: 107_500, credit: 105_000 },
            ])
        )
        await act(async () => {
            balanceStore().update(BANK_MARCH_ID, draft => {
                draft.credit_total = 50_000
            })
        })
        await waitFor(() =>
            expect(figures(hook.result.current.model)).toEqual([
                { label: '1010 Operating checking', debit: 57_500, credit: null },
                { label: '3900 Retained earnings', debit: null, credit: 100_000 },
                { label: '4000 Consulting income', debit: null, credit: 5_000 },
                { label: '6000 Rent', debit: 40_000, credit: null },
                { label: 'Total', debit: 97_500, credit: 105_000 },
            ])
        )
    })

    it('follows a left join going from no totals row to one and back', async () => {
        const hook = await readyHook('2026-10-25')
        expect(figures(hook.result.current.model)).toEqual(OCTOBER_25)
        // 6100 has no balance rows, so its through totals row appears only with this insert.
        await act(async () => {
            balanceStore().insert(balance(SOFTWARE, '2026-05', 1_500, 0))
        })
        const withSoftware: Figure[] = [
            { label: '1010 Operating checking', debit: 65_000, credit: null },
            { label: '3900 Retained earnings', debit: null, credit: 100_000 },
            { label: '4000 Consulting income', debit: null, credit: 5_000 },
            { label: '6000 Rent', debit: 40_000, credit: null },
            { label: '6100 Software subscriptions', debit: 1_500, credit: null },
            { label: 'Total', debit: 106_500, credit: 105_000 },
        ]
        await waitFor(() => expect(figures(hook.result.current.model)).toEqual(withSoftware))
        // Rent has no lines, so its edge totals row appears only with this insert.
        await act(async () => {
            lineStore().insert(line('edge_rent', RENT, '2026-10-15', { debit: 800 }))
        })
        await waitFor(() =>
            expect(figures(hook.result.current.model)).toEqual([
                { label: '1010 Operating checking', debit: 65_000, credit: null },
                { label: '3900 Retained earnings', debit: null, credit: 100_000 },
                { label: '4000 Consulting income', debit: null, credit: 5_000 },
                { label: '6000 Rent', debit: 40_800, credit: null },
                { label: '6100 Software subscriptions', debit: 1_500, credit: null },
                { label: 'Total', debit: 107_300, credit: 105_000 },
            ])
        )
        await act(async () => {
            lineStore().delete('edge_rent')
        })
        await waitFor(() => expect(figures(hook.result.current.model)).toEqual(withSoftware))
    })

    it('keeps a missing totals row null, so Active leaves out accounts with no in-year activity', async () => {
        // 4000 keeps only its 2025-11 (prior-year) row and the unread 2026-10 row: no edge
        // lines. 6200 has one in-year row whose debit and credit cancel.
        seedBooks({
            ledger: {
                accounts: REPORT_ACCOUNTS,
                balances: [...BALANCES, balance(TRAVEL, '2026-04', 3_000, 3_000)],
                lines: LINES.filter(row => row.account !== INCOME),
                entries: [],
                settings: [{ ...REPORT_SETTINGS, fiscal_year_start_month: 1 }],
            },
        })
        const hook = renderHook(() => useTrialBalance({ ...asOf('2026-10-25'), rows: 'active' }))
        await waitFor(() => expect(hook.result.current.state).toBe('ready'))
        const shown = figures(hook.result.current.model)
        const labels = shown.map(row => row.label)
        expect(labels).not.toContain('6900 Charitable contributions')
        expect(labels).not.toContain('4000 Consulting income')
        expect(shown).toContainEqual({ label: '6200 Travel', debit: null, credit: null })
        expect(shown).toEqual([
            { label: '1010 Operating checking', debit: 65_000, credit: null },
            { label: '3900 Retained earnings', debit: null, credit: 100_000 },
            { label: '6000 Rent', debit: 40_000, credit: null },
            { label: '6200 Travel', debit: null, credit: null },
            { label: 'Total', debit: 105_000, credit: 100_000 },
        ])
    })

    it('cuts the prior year at the fiscal year start from settings', async () => {
        seed({ fiscalStartMonth: 7 })
        const hook = await readyHook('2026-10-25')
        // The year starts 2026-07, so the 2026-03 rent is prior-year: it nets into retained
        // earnings (100_000 income less 40_000 rent) and leaves rent at zero.
        expect(figures(hook.result.current.model)).toEqual([
            { label: '1010 Operating checking', debit: 65_000, credit: null },
            { label: '3900 Retained earnings', debit: null, credit: 60_000 },
            { label: '4000 Consulting income', debit: null, credit: 5_000 },
            { label: 'Total', debit: 65_000, credit: 65_000 },
        ])
    })

    it('runs one live query for the report, and reads no lines without an edge', async () => {
        const settingsQueries = await settingsQueriesBuilt()
        const lineReads = subscriptions(lineStore())
        const monthEnd = await liveQueriesBuiltBy(async () => {
            const hook = await readyHook('2026-09-30')
            expect(figures(hook.result.current.model)).toEqual(SEPTEMBER_30)
            hook.unmount()
        })
        expect(monthEnd - settingsQueries).toBe(1)
        expect(lineReads).not.toHaveBeenCalled()

        const midMonth = await liveQueriesBuiltBy(async () => {
            const hook = await readyHook('2026-10-25')
            expect(figures(hook.result.current.model)).toEqual(OCTOBER_25)
            hook.unmount()
        })
        expect(midMonth - settingsQueries).toBe(1)
        expect(lineReads).toHaveBeenCalled()
    })

    it('reports a refused balances load as an error, and retry rebuilds the one report query once', async () => {
        seed({ balancesFailsOnce: true })
        expectLiveQueryError(balanceStore().id)
        const reads = sourceReads()
        const hook = renderHook(() => useTrialBalance(asOf('2026-10-25')))
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        expect(hook.result.current.model).toBeUndefined()
        const firstBuild = reads()
        expect(firstBuild.accounts).toBeGreaterThan(0)
        expect(firstBuild.balances).toBeGreaterThan(0)
        expect(firstBuild.lines).toBeGreaterThan(0)

        act(() => hook.result.current.retry())

        await waitFor(() => expect(hook.result.current.state).toBe('ready'))
        expect(figures(hook.result.current.model)).toEqual(OCTOBER_25)
        // The one query reads all three sources, so rebuilding it once subscribes to each of
        // them again exactly as its first build did.
        expect(reads()).toEqual({
            accounts: 2 * firstBuild.accounts,
            balances: 2 * firstBuild.balances,
            lines: 2 * firstBuild.lines,
        })
        expect(cleanups()).toEqual([])
    })

    it('reports a refused accounts load as an error, and retry recovers it', async () => {
        seed({ accountsFailsOnce: true })
        expectLiveQueryError(accountsStore().id)
        const hook = renderHook(() => useTrialBalance(asOf('2026-10-25')))
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        expect(hook.result.current.model).toBeUndefined()

        act(() => hook.result.current.retry())

        await waitFor(() => expect(hook.result.current.state).toBe('ready'))
        expect(figures(hook.result.current.model)).toEqual(OCTOBER_25)
        expect(cleanups()).toEqual([])
    })

    it('reports a refused edge lines load as an error, and retry recovers it with the edge lines', async () => {
        seed({ linesFailsOnce: true })
        expectLiveQueryError(lineStore().id)
        const hook = renderHook(() => useTrialBalance(asOf('2026-10-25')))
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        expect(hook.result.current.model).toBeUndefined()

        act(() => hook.result.current.retry())

        await waitFor(() => expect(hook.result.current.state).toBe('ready'))
        expect(figures(hook.result.current.model)).toEqual(OCTOBER_25)
        expect(cleanups()).toEqual([])
    })
})
