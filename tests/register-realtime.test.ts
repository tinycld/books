// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRegisterQuery } from '../tinycld/books/hooks/useRegisterQuery'
import { REGISTER_ACCOUNT_ID } from '../tinycld/books/lib/account-register-fixture'
import { balanceStore, entryStore, lineStore, seedBooks } from './accounts-form-harness'
import { BALANCES, RANGE, registerLine, SEED_ENTRIES, SEED_LINES } from './register-test-data'
import { silenceConsole } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

beforeEach(() => {
    seedBooks({
        ledger: { lines: SEED_LINES, entries: SEED_ENTRIES, balances: [...BALANCES] },
    })
})

async function mounted() {
    const hook = renderHook(() => useRegisterQuery(REGISTER_ACCOUNT_ID, RANGE))
    await waitFor(() => expect(hook.result.current.isReady).toBe(true))
    return hook
}

function ids(hook: Awaited<ReturnType<typeof mounted>>) {
    return hook.result.current.lines.map(l => l.id)
}

async function insertLine(id: string, seed: Parameters<typeof registerLine>[1]) {
    await act(async () => {
        lineStore().insert(registerLine(id, seed))
    })
}

// A line that must appear, inserted last so that an earlier excluded line has settled.
async function settle(hook: Awaited<ReturnType<typeof mounted>>) {
    await insertLine('line_sentinel', { entry: 'je_1040', account: REGISTER_ACCOUNT_ID })
    await waitFor(() => expect(ids(hook)).toContain('line_sentinel'))
}

describe('useRegisterQuery lines', () => {
    it('adds a posted line of the account that arrives after the first render', async () => {
        const hook = await mounted()
        expect(ids(hook)).toHaveLength(17)
        await insertLine('line_new', { entry: 'je_1040', account: REGISTER_ACCOUNT_ID })
        await waitFor(() => expect(ids(hook)).toContain('line_new'))
    })

    it('ignores a line of another account', async () => {
        const hook = await mounted()
        await insertLine('line_other', { entry: 'je_1040', account: 'acct_exp_0007' })
        await settle(hook)
        expect(ids(hook)).not.toContain('line_other')
    })

    it('ignores a line that is not posted until it is posted', async () => {
        const hook = await mounted()
        await insertLine('line_draft', {
            entry: 'je_1060',
            account: REGISTER_ACCOUNT_ID,
            posted: false,
        })
        await settle(hook)
        expect(ids(hook)).not.toContain('line_draft')
        await act(async () => {
            lineStore().update('line_draft', draft => {
                draft.posted = true
            })
        })
        await waitFor(() => expect(ids(hook)).toContain('line_draft'))
    })

    it('gives a void reversal line the number of the entry it reverses', async () => {
        const hook = await mounted()
        const byEntry = (entry: string) =>
            hook.result.current.lines.find(
                l => l.entry === entry && l.account === REGISTER_ACCOUNT_ID
            )
        // The origins query runs after the lines load, so the number arrives later.
        await waitFor(() => expect(byEntry('je_1046v')?.reversesNumber).toBe('JE-1046'))
        expect(byEntry('je_1040')?.reversesNumber).toBe('')
    })

    it('keeps the same lines array across re-renders while nothing changes', async () => {
        const hook = await mounted()
        await waitFor(() =>
            expect(
                hook.result.current.lines.find(l => l.entry === 'je_1046v')?.reversesNumber
            ).toBe('JE-1046')
        )
        const before = hook.result.current.lines
        hook.rerender()
        expect(hook.result.current.lines).toBe(before)
    })
})

describe('useRegisterQuery priorTotals', () => {
    it('ignores a change to the balance row of the range month', async () => {
        const hook = await mounted()
        expect(hook.result.current.priorTotals).toEqual({ debit: 10_715_500, credit: 9_289_250 })
        // The October row is written first; the August write is the signal that the
        // opening query has re-run, and its result must not include October.
        await act(async () => {
            balanceStore().update('bal_bank_0002_202610', draft => {
                draft.debit_total = 1
            })
            balanceStore().update('bal_bank_0002_202608', draft => {
                draft.debit_total = 7_000_000
            })
        })
        await waitFor(() =>
            expect(hook.result.current.priorTotals).toEqual({
                debit: 7_000_000 + 3_365_500,
                credit: 9_289_250,
            })
        )
    })

    it('follows a change to an earlier balance row', async () => {
        const hook = await mounted()
        await act(async () => {
            balanceStore().update('bal_bank_0002_202608', draft => {
                draft.debit_total = 7_000_000
                draft.credit_total = 4_000_000
            })
        })
        await waitFor(() =>
            expect(hook.result.current.priorTotals).toEqual({
                debit: 7_000_000 + 3_365_500,
                credit: 4_000_000 + 4_805_000,
            })
        )
    })
})

describe('useRegisterQuery errors', () => {
    // TanStack DB reports a failed source collection straight to console.error.
    const reported = silenceConsole('error')

    it('reports an error when the entries the origins query reads fail to load', async () => {
        const hook = await mounted()
        expect(hook.result.current.isError).toBe(false)
        await act(async () => {
            entryStore()._lifecycle.markError(new Error('load failed'))
        })
        await waitFor(() => expect(hook.result.current.isError).toBe(true))
        expect(reported).toHaveBeenCalledWith(expect.stringContaining('[Live Query Error]'))
    })
})
