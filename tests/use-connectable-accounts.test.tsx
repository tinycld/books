// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useConnectableAccounts } from '../tinycld/books/hooks/useConnectableAccounts'
import { ACCOUNTS } from '../tinycld/books/lib/chart-of-accounts-fixture'
import { accountsStore, releaseAccountsRead, seedBooks } from './accounts-form-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})

silenceLog()

// The harness chart's bank and credit card accounts. With every one but 1010 connected, 1010
// is the one account the dialog can offer.
const CHECKING = 'acct_bank_0002'
const BANK_IDS = ['acct_bank_0001', CHECKING, 'acct_bank_0003', 'acct_bank_0004', 'acct_cc_00001']
const ALL_CONNECTED: ReadonlySet<string> = new Set(BANK_IDS)
const ALL_BUT_CHECKING: ReadonlySet<string> = new Set(BANK_IDS.filter(id => id !== CHECKING))
const CHECKING_OPTION = { value: CHECKING, label: '1010 Operating checking', indent: 1 }

// The chart with no bank or credit card account at all.
const NO_BANK_CHART = ACCOUNTS.filter(
    account => account.type !== 'bank' && account.type !== 'credit_card'
)

function renderConnectable(connected: ReadonlySet<string>) {
    return renderHook(() => useConnectableAccounts(connected))
}

describe('useConnectableAccounts', () => {
    it('reports nothing while the chart loads, then offers the connectable account', async () => {
        seedBooks({ holdAccountsRead: true })
        const hook = renderConnectable(ALL_BUT_CHECKING)

        expect(hook.result.current.isReady).toBe(false)
        expect(hook.result.current.emptyReason).toBeNull()
        expect(hook.result.current.options).toEqual([])

        act(() => releaseAccountsRead())

        await waitFor(() => expect(hook.result.current.isReady).toBe(true))
        expect(hook.result.current.emptyReason).toBeNull()
        expect(hook.result.current.options).toEqual([CHECKING_OPTION])
    })

    it('says every account is connected only once the chart is ready', async () => {
        seedBooks({ holdAccountsRead: true })
        const hook = renderConnectable(ALL_CONNECTED)
        expect(hook.result.current.emptyReason).toBeNull()

        act(() => releaseAccountsRead())

        await waitFor(() => expect(hook.result.current.isReady).toBe(true))
        expect(hook.result.current.emptyReason).toBe('allConnected')
        expect(hook.result.current.options).toEqual([])
    })

    it('says the chart has no bank account only once the chart is ready', async () => {
        seedBooks({
            holdAccountsRead: true,
            ledger: { accounts: NO_BANK_CHART, lines: [], entries: [], balances: [] },
        })
        const hook = renderConnectable(new Set())
        expect(hook.result.current.emptyReason).toBeNull()

        act(() => releaseAccountsRead())

        await waitFor(() => expect(hook.result.current.isReady).toBe(true))
        expect(hook.result.current.emptyReason).toBe('none')
        expect(hook.result.current.options).toEqual([])
    })

    it('reports a failed chart read as an error with no empty reason, and retry recovers it', async () => {
        seedBooks({ accountsFailsOnce: true })
        expectLiveQueryError(accountsStore().id)
        const hook = renderConnectable(ALL_BUT_CHECKING)

        await waitFor(() => expect(hook.result.current.isError).toBe(true))
        expect(hook.result.current.emptyReason).toBeNull()
        expect(hook.result.current.options).toEqual([])

        act(() => hook.result.current.retry())

        await waitFor(() => expect(hook.result.current.isError).toBe(false))
        await waitFor(() => expect(hook.result.current.options).toEqual([CHECKING_OPTION]))
        expect(hook.result.current.emptyReason).toBeNull()
        expect(hook.result.current.isReady).toBe(true)
    })
})
