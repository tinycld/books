// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAccountOptions } from '../tinycld/books/hooks/useAccountOptions'
import { accountOptionList } from '../tinycld/books/lib/account-options'
import { ACCOUNTS } from '../tinycld/books/lib/chart-of-accounts-fixture'
import { accountsStore, cleanups, seedBooks } from './accounts-form-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})

silenceLog()

// What the hook returned before it reported load errors: the option list of the seeded chart.
const BEFORE = accountOptionList(ACCOUNTS)
const ACTIVE_COUNT = ACCOUNTS.filter(account => !account.inactive).length

describe('useAccountOptions', () => {
    it('keeps the options and names of a healthy load, with no error', async () => {
        seedBooks()
        const hook = renderHook(() => useAccountOptions())
        await waitFor(() => expect(hook.result.current.options).toHaveLength(ACTIVE_COUNT))

        expect(hook.result.current.isError).toBe(false)
        expect(hook.result.current.options).toEqual(BEFORE.options)
        expect(hook.result.current.names).toEqual(BEFORE.names)
        expect(hook.result.current.options.slice(0, 2)).toEqual([
            { value: 'acct_bank_0001', label: '1000 Cash and bank' },
            { value: 'acct_bank_0002', label: '  1010 Operating checking' },
        ])
        expect(hook.result.current.names.size).toBe(ACCOUNTS.length)
    })

    it('reports a failed accounts load as an error, with no options', async () => {
        seedBooks({ accountsErrored: true })
        expectLiveQueryError(accountsStore().id)
        const hook = renderHook(() => useAccountOptions())

        await waitFor(() => expect(hook.result.current.isError).toBe(true))
        expect(hook.result.current.options).toEqual([])
        expect(hook.result.current.names.size).toBe(0)
    })

    it('retry cleans the failed accounts source and no other collection', async () => {
        seedBooks({ accountsErrored: true })
        expectLiveQueryError(accountsStore().id)
        const hook = renderHook(() => useAccountOptions())
        await waitFor(() => expect(hook.result.current.isError).toBe(true))
        expect(cleanups()).toEqual([])

        act(() => hook.result.current.retry())

        // The source keeps failing, so the query is an error again; only books_accounts was
        // cleaned, never a healthy or shared collection such as books_access or users.
        await waitFor(() => expect(cleanups()).toEqual(['books_accounts']))
        await waitFor(() => expect(hook.result.current.isError).toBe(true))
        expect(cleanups()).toEqual(['books_accounts'])
    })

    it('reports a refused accounts load as an error, and retry loads the accounts', async () => {
        seedBooks({ accountsFailsOnce: true })
        expectLiveQueryError(accountsStore().id)
        const hook = renderHook(() => useAccountOptions())
        await waitFor(() => expect(hook.result.current.isError).toBe(true))
        expect(hook.result.current.options).toEqual([])

        act(() => hook.result.current.retry())

        await waitFor(() => expect(hook.result.current.isError).toBe(false))
        await waitFor(() => expect(hook.result.current.options).toEqual(BEFORE.options))
        expect(hook.result.current.names).toEqual(BEFORE.names)
        // The source stayed ready, so the retry rebuilt only the failed query: no source,
        // healthy or shared, was cleaned.
        expect(cleanups()).toEqual([])
    })
})
