// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    type ReportScreenModel,
    useReportPrerequisites,
    useReportScreen,
} from '../tinycld/books/hooks/useReportScreen'
import { filterParamKey } from '../tinycld/books/lib/report-options'
import type { PeriodContext } from '../tinycld/books/lib/report-period'
import { REPORT_ACCOUNTS, REPORT_SETTINGS } from '../tinycld/books/lib/report-shell-fixture'
import { TRIAL_BALANCE } from '../tinycld/books/lib/reports/trial-balance'
import { useReportUIStore } from '../tinycld/books/stores/report-ui-store'
import type { BooksAccountBalances, BooksAccounts } from '../tinycld/books/types'
import {
    accountsStore,
    balanceStore,
    cleanups,
    releaseAccountsRead,
    releaseSettingsRead,
    seedBooks,
} from './accounts-form-harness'
import { setRouteParams } from './route-params'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

// The URL is empty (the expo-router stub), so the Trial Balance runs its default preset, the
// end of last month: 2026-09-30, whole months only, read from balance rows.
const CONTEXT: PeriodContext = { today: '2026-10-25', fiscalStartMonth: 1 }

const STAMP = '2026-01-01 00:00:00.000Z'

function balance(account: string, debit_total: number, credit_total: number): BooksAccountBalances {
    return {
        id: `bal_${account}`,
        account,
        period: '2026-03',
        debit_total,
        credit_total,
        currency: 'USD',
        created: STAMP,
        updated: STAMP,
    }
}

function seed({
    accounts = REPORT_ACCOUNTS,
    ...opts
}: {
    accounts?: BooksAccounts[]
    accountsFailsOnce?: boolean
    accountsErrored?: boolean
    holdAccountsRead?: boolean
    holdSettingsRead?: boolean
}) {
    seedBooks({
        ledger: {
            accounts,
            balances: [balance('rpt_acct_1010', 50_000, 0), balance('rpt_acct_4000', 0, 50_000)],
            lines: [],
            entries: [],
            settings: [REPORT_SETTINGS],
        },
        ...opts,
    })
}

// The two stages the report screen runs, in one render: the prerequisites, then the body
// with a fixed period context.
function renderScreen() {
    return renderHook(() => {
        const prerequisites = useReportPrerequisites()
        return useReportScreen({ definition: TRIAL_BALANCE, context: CONTEXT, prerequisites })
    })
}

// How many times a live query subscribed to each source. A rebuilt query subscribes again;
// a query left alone does not. Only the report query reads balances.
function sourceReads() {
    const accounts = vi.spyOn(accountsStore(), 'subscribeChanges')
    const balances = vi.spyOn(balanceStore(), 'subscribeChanges')
    return () => ({
        accounts: accounts.mock.calls.length,
        balances: balances.mock.calls.length,
    })
}

// What happens to the accounts source from now on, in order: its cleanup starting and
// ending, and each live query subscribing to it (a query that loads again subscribes).
function accountsTimeline() {
    const source = accountsStore()
    const events: string[] = []
    const cleanup = source.cleanup.bind(source)
    vi.spyOn(source, 'cleanup').mockImplementation(async () => {
        events.push('cleanup-start')
        await cleanup()
        events.push('cleanup-end')
    })
    const subscribe = source.subscribeChanges.bind(source)
    vi.spyOn(source, 'subscribeChanges').mockImplementation((...args) => {
        events.push('subscribe')
        return subscribe(...args)
    })
    return events
}

describe('useReportScreen retry', () => {
    it('shows a refused accounts load as the error state, and retry rebuilds only the accounts query', async () => {
        // The report waits for settings, so holding them makes the accounts query take the one
        // refused accounts load; the report query then loads healthy.
        seed({ accountsFailsOnce: true, holdSettingsRead: true })
        expectLiveQueryError(accountsStore().id)
        const reads = sourceReads()
        const hook = renderScreen()

        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => releaseSettingsRead())
        // The report query is healthy: its figures loaded while the accounts query failed.
        await waitFor(() => expect(hook.result.current.model?.rows.length).toBeGreaterThan(0))
        expect(hook.result.current.state).toBe('error')
        const firstBuild = reads()
        expect(firstBuild.accounts).toBeGreaterThan(0)
        expect(firstBuild.balances).toBeGreaterThan(0)

        act(() => hook.result.current.onRetry())

        await waitFor(() => expect(hook.result.current.state).toBe('ready'))
        const afterRetry = reads()
        expect(afterRetry.accounts).toBeGreaterThan(firstBuild.accounts)
        expect(afterRetry.balances).toBe(firstBuild.balances)
        expect(cleanups()).toEqual([])
    })

    it('recovers a failed accounts source shared by two failed queries in one call, cleaning it once', async () => {
        seed({ accountsErrored: true })
        expectLiveQueryError(accountsStore().id)
        const hook = renderScreen()

        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        expect(hook.result.current.model).toBeUndefined()
        expect(cleanups()).toEqual([])
        const timeline = accountsTimeline()

        act(() => hook.result.current.onRetry())

        // The source keeps failing, so the screen is an error again. Both the accounts query
        // and the report query read it, and one recovery cleans it once, to the end, before
        // either query loads again.
        await waitFor(() => expect(cleanups()).toContain('books_accounts'))
        await waitFor(() => expect(timeline.filter(e => e === 'subscribe')).toHaveLength(2))
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        expect(cleanups()).toEqual(['books_accounts'])
        expect(timeline).toEqual(['cleanup-start', 'cleanup-end', 'subscribe', 'subscribe'])
    })
})

const INCOME_ACCOUNT = 'rpt_acct_4000'
const CHECKING = 'rpt_acct_1010'
const ACCOUNT_PICKER = { kind: 'filter-picker', filterId: 'account' } as const

// An account made inactive after a filter named it.
const OLD_FLOAT: BooksAccounts = {
    ...REPORT_ACCOUNTS[0],
    id: 'rpt_acct_1090',
    number: '1090',
    name: 'Old float',
    inactive: true,
}

// The screen as the open account picker reads it. Apply is enabled while the draft is valid,
// read during render as the picker body reads it.
function renderPicker() {
    return renderHook(() => {
        const prerequisites = useReportPrerequisites()
        const model = useReportScreen({
            definition: TRIAL_BALANCE,
            context: CONTEXT,
            prerequisites,
        })
        return { model, applyEnabled: model.pickerDraft.formState.isValid }
    })
}

function draftValues(model: ReportScreenModel) {
    return [...model.pickerDraft.getValues('values')].sort()
}

// The labels of the account rows the picker checks: the rows the model hands to the picker
// (model.accountPickerRows), each checked when its value is in the draft.
function checkedAccountRows(model: ReportScreenModel) {
    const draft = model.pickerDraft.getValues('values')
    return model.accountPickerRows.filter(row => draft.includes(row.value)).map(row => row.label)
}

// The account rows the open picker shows, read from the model that hands them to the picker.
function pickerRowLabels(model: ReportScreenModel) {
    return model.accountPickerRows.map(row => row.label)
}

// The labels of the model's picker rows that are checked in the draft.
function checkedPickerRowLabels(model: ReportScreenModel) {
    const draft = model.pickerDraft.getValues('values')
    return model.accountPickerRows.filter(row => draft.includes(row.value)).map(row => row.label)
}

describe('useReportScreen account picker draft', () => {
    beforeEach(() => useReportUIStore.getState().closeSurface())

    it('keeps every selected value while the account names load, and checks the account row once they have', async () => {
        setRouteParams({ 'filter-account': `${INCOME_ACCOUNT},group:income` })
        seed({ holdAccountsRead: true })
        const hook = renderPicker()
        expect(hook.result.current.model.accountNames.size).toBe(0)

        act(() => hook.result.current.model.onOpenSurface(ACCOUNT_PICKER))

        expect(hook.result.current.model.surface).toEqual(ACCOUNT_PICKER)
        expect(draftValues(hook.result.current.model)).toEqual(['group:income', INCOME_ACCOUNT])
        await waitFor(() => expect(hook.result.current.applyEnabled).toBe(true))

        act(() => releaseAccountsRead())

        await waitFor(() =>
            expect(hook.result.current.model.accountNames.has(INCOME_ACCOUNT)).toBe(true)
        )
        expect(draftValues(hook.result.current.model)).toEqual(['group:income', INCOME_ACCOUNT])
        expect(checkedAccountRows(hook.result.current.model)).toEqual(['4000 Consulting income'])
    })

    it('drafts a selected inactive account as a checked row of its own', async () => {
        setRouteParams({ 'filter-account': `${CHECKING},${OLD_FLOAT.id}` })
        seed({ accounts: [...REPORT_ACCOUNTS, OLD_FLOAT] })
        const hook = renderPicker()
        await waitFor(() =>
            expect(hook.result.current.model.accountNames.has(OLD_FLOAT.id)).toBe(true)
        )
        const offered = hook.result.current.model.accountChoices.map(choice => choice.value)
        expect(offered).toContain(CHECKING)
        expect(offered).not.toContain(OLD_FLOAT.id)

        act(() => hook.result.current.model.onOpenSurface(ACCOUNT_PICKER))

        expect(draftValues(hook.result.current.model)).toEqual([OLD_FLOAT.id, CHECKING].sort())
        expect(checkedAccountRows(hook.result.current.model)).toEqual([
            '1010 Operating checking',
            '1090 Old float',
        ])
    })

    it('drops a selected id with no account name from the draft', async () => {
        setRouteParams({ 'filter-account': `${CHECKING},rpt_acct_gone` })
        seed({})
        const hook = renderPicker()
        await waitFor(() => expect(hook.result.current.model.accountNames.has(CHECKING)).toBe(true))
        expect(hook.result.current.model.options.filters.account).toEqual([
            CHECKING,
            'rpt_acct_gone',
        ])

        act(() => hook.result.current.model.onOpenSurface(ACCOUNT_PICKER))

        expect(draftValues(hook.result.current.model)).toEqual([CHECKING])
        expect(checkedAccountRows(hook.result.current.model)).toEqual(['1010 Operating checking'])
    })
})

// Apply as the picker body runs it: the validated draft goes to onApplyFilter.
async function applyDraft(model: ReportScreenModel) {
    await act(() => model.pickerDraft.handleSubmit(d => model.onApplyFilter('account', d.values))())
}

// The account filter the last URL write applied, as its values.
function appliedAccountFilter() {
    const writes = vi.mocked(router.setParams).mock.calls
    const params = writes[writes.length - 1]?.[0] as Record<string, string | undefined>
    return (params[filterParamKey('account')] ?? '').split(',').sort()
}

describe('useReportScreen account picker apply', () => {
    beforeEach(() => {
        useReportUIStore.getState().closeSurface()
        vi.mocked(router.setParams).mockClear()
    })

    it('drops a nameless id kept while the names load when Apply runs after they have', async () => {
        setRouteParams({ 'filter-account': `${INCOME_ACCOUNT},rpt_acct_gone,group:income` })
        seed({ holdAccountsRead: true })
        const hook = renderPicker()

        act(() => hook.result.current.model.onOpenSurface(ACCOUNT_PICKER))

        expect(draftValues(hook.result.current.model)).toEqual(
            ['group:income', INCOME_ACCOUNT, 'rpt_acct_gone'].sort()
        )
        act(() => releaseAccountsRead())
        await waitFor(() =>
            expect(hook.result.current.model.accountNames.has(INCOME_ACCOUNT)).toBe(true)
        )

        await applyDraft(hook.result.current.model)

        expect(router.setParams).toHaveBeenCalled()
        expect(appliedAccountFilter()).toEqual(['group:income', INCOME_ACCOUNT])
    })

    it('drops a nameless id kept while the names failed when Apply runs after a retry', async () => {
        // Held settings make the accounts query take the one refused accounts load.
        setRouteParams({ 'filter-account': `${INCOME_ACCOUNT},rpt_acct_gone,group:income` })
        seed({ accountsFailsOnce: true, holdSettingsRead: true })
        expectLiveQueryError(accountsStore().id)
        const hook = renderPicker()
        await waitFor(() => expect(hook.result.current.model.state).toBe('error'))

        act(() => hook.result.current.model.onOpenSurface(ACCOUNT_PICKER))

        expect(draftValues(hook.result.current.model)).toEqual(
            ['group:income', INCOME_ACCOUNT, 'rpt_acct_gone'].sort()
        )
        act(() => releaseSettingsRead())
        act(() => hook.result.current.model.onRetry())
        await waitFor(() =>
            expect(hook.result.current.model.accountNames.has(INCOME_ACCOUNT)).toBe(true)
        )
        expect(hook.result.current.model.state).not.toBe('error')

        await applyDraft(hook.result.current.model)

        expect(router.setParams).toHaveBeenCalled()
        expect(appliedAccountFilter()).toEqual(['group:income', INCOME_ACCOUNT])
    })

    it('applies an account put in the draft while active, though it is made inactive before Apply', async () => {
        seed({})
        const hook = renderPicker()
        await waitFor(() => expect(hook.result.current.model.accountNames.has(CHECKING)).toBe(true))
        expect(hook.result.current.model.options.filters.account).toBeUndefined()

        act(() => hook.result.current.model.onOpenSurface(ACCOUNT_PICKER))
        expect(draftValues(hook.result.current.model)).toEqual([])
        act(() => {
            hook.result.current.model.pickerDraft.setValue('values', [CHECKING], {
                shouldValidate: true,
            })
        })
        await waitFor(() => expect(hook.result.current.applyEnabled).toBe(true))

        // Another session makes the account inactive while the picker is open.
        act(() => {
            accountsStore().update(CHECKING, draft => {
                draft.inactive = true
            })
        })
        await waitFor(() =>
            expect(hook.result.current.model.accountChoices.map(c => c.value)).not.toContain(
                CHECKING
            )
        )
        expect(hook.result.current.model.accountNames.has(CHECKING)).toBe(true)
        expect(draftValues(hook.result.current.model)).toEqual([CHECKING])
        expect(pickerRowLabels(hook.result.current.model)).toContain('1010 Operating checking')
        expect(checkedPickerRowLabels(hook.result.current.model)).toEqual([
            '1010 Operating checking',
        ])

        await applyDraft(hook.result.current.model)

        expect(router.setParams).toHaveBeenCalled()
        expect(appliedAccountFilter()).toEqual([CHECKING])
    })

    it('keeps the row of an applied account made inactive after it is unchecked in the reopened picker', async () => {
        seed({})
        const hook = renderPicker()
        await waitFor(() => expect(hook.result.current.model.accountNames.has(CHECKING)).toBe(true))
        act(() => hook.result.current.model.onOpenSurface(ACCOUNT_PICKER))
        act(() => {
            hook.result.current.model.pickerDraft.setValue('values', [CHECKING], {
                shouldValidate: true,
            })
        })
        await waitFor(() => expect(hook.result.current.applyEnabled).toBe(true))
        await applyDraft(hook.result.current.model)
        expect(appliedAccountFilter()).toEqual([CHECKING])
        // The router stub does not echo the write, so the URL takes the applied filter here.
        setRouteParams({ 'filter-account': CHECKING })
        hook.rerender()
        expect(hook.result.current.model.options.filters.account).toEqual([CHECKING])

        // Another session makes the applied account inactive.
        act(() => {
            accountsStore().update(CHECKING, draft => {
                draft.inactive = true
            })
        })
        await waitFor(() =>
            expect(hook.result.current.model.accountChoices.map(c => c.value)).not.toContain(
                CHECKING
            )
        )

        act(() => hook.result.current.model.onOpenSurface(ACCOUNT_PICKER))
        expect(pickerRowLabels(hook.result.current.model)).toContain('1010 Operating checking')
        expect(checkedPickerRowLabels(hook.result.current.model)).toEqual([
            '1010 Operating checking',
        ])

        // Unchecked while the picker stays open, the applied account keeps its row, so the user
        // can check it again.
        act(() => {
            hook.result.current.model.pickerDraft.setValue('values', [], { shouldValidate: true })
        })
        await waitFor(() => expect(hook.result.current.applyEnabled).toBe(false))
        expect(hook.result.current.model.surface).toEqual(ACCOUNT_PICKER)
        expect(pickerRowLabels(hook.result.current.model)).toContain('1010 Operating checking')
        expect(checkedPickerRowLabels(hook.result.current.model)).toEqual([])
    })
})
