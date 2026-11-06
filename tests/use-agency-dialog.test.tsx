// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { FieldValues, UseFormGetFieldState } from 'react-hook-form'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAgencyDialog } from '../tinycld/books/hooks/useAgencyDialog'
import { useFormAccounts } from '../tinycld/books/hooks/useFormAccounts'
import { useTaxesStore } from '../tinycld/books/stores/taxes-store'
import type { BooksAccounts } from '../tinycld/books/types'
import {
    accountsStore,
    enteredWrites,
    messageRefusal,
    seedBooks,
    serverRefusal,
    storedAccounts,
    taxAgenciesStore,
    writeLog,
} from './accounts-form-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'
import { chartWithoutLiability, seedChart, taxAccount } from './tax-accounts'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

type SeedOptions = Omit<NonNullable<Parameters<typeof seedBooks>[0]>, 'ledger'>

function seedWith(accounts: BooksAccounts[], options: SeedOptions = {}) {
    seedBooks({ ...options, ledger: { accounts, lines: [], entries: [], balances: [] } })
}

// The agency dialog's hook for `id` (null adds), beside the accounts query it reads, so a
// test can wait for the chart to load before it reads anything the chart decides.
function renderAgencyDialog(id: string | null) {
    return renderHook(
        () => {
            const dialog = useAgencyDialog(id)
            const chart = useFormAccounts()
            return { dialog, chartLoaded: chart.isReady && chart.accounts.length > 0 }
        },
        { wrapper }
    )
}

function renderAddAgency() {
    return renderAgencyDialog(null)
}

type Rendered = ReturnType<typeof renderAddAgency>

async function chartLoaded(rendered: Rendered) {
    await waitFor(() => expect(rendered.result.current.chartLoaded).toBe(true))
}

// The form's root error as the form holds it now (lesson: never `formState.errors`, a
// render snapshot). `root` is not a field of the values type, so the getter is read with
// the field-free signature react-hook-form gives every form.
function rootError(rendered: Rendered) {
    const { getFieldState } = rendered.result.current.dialog.form
    return (getFieldState as UseFormGetFieldState<FieldValues>)('root').error?.message
}

function salesTaxAccounts() {
    return storedAccounts().filter(account => account.name === 'Sales tax payable')
}

describe('useAgencyDialog liability account', () => {
    it('has a liability account with the seeded chart', async () => {
        seedWith(seedChart())
        const rendered = renderAddAgency()
        await chartLoaded(rendered)
        await waitFor(() => expect(rendered.result.current.dialog.hasLiabilityAccount).toBe(true))
    })

    it('has no liability account when the chart has no Other current liability account', async () => {
        seedWith(chartWithoutLiability())
        const rendered = renderAddAgency()
        await chartLoaded(rendered)
        expect(rendered.result.current.dialog.hasLiabilityAccount).toBe(false)
    })
})

describe('useAgencyDialog createAccount', () => {
    it('inserts one Sales tax payable account numbered 2200 and selects it', async () => {
        seedWith(chartWithoutLiability())
        const rendered = renderAddAgency()
        await chartLoaded(rendered)
        const insert = vi.spyOn(accountsStore(), 'insert')

        await act(async () => {
            await rendered.result.current.dialog.createAccount()
        })

        const created = salesTaxAccounts()
        expect(created).toHaveLength(1)
        expect(created[0]).toMatchObject({
            name: 'Sales tax payable',
            number: '2200',
            type: 'other_current_liability',
            detail_type: 'sales_tax_payable',
        })
        expect(insert).toHaveBeenCalledTimes(1)
        expect(writeLog()).toEqual([`account:${created[0].id}`])
        await waitFor(() =>
            expect(rendered.result.current.dialog.form.getValues('account')).toBe(created[0].id)
        )
        await waitFor(() => expect(rendered.result.current.dialog.hasLiabilityAccount).toBe(true))
    })

    it('leaves the number blank when an Expense account already has 2200', async () => {
        const shipping = taxAccount({
            number: '2200',
            name: 'Shipping supplies',
            type: 'expense',
            detail_type: 'supplies_materials',
        })
        seedWith([...chartWithoutLiability(), shipping])
        const rendered = renderAddAgency()
        await chartLoaded(rendered)

        await act(async () => {
            await rendered.result.current.dialog.createAccount()
        })

        const created = salesTaxAccounts()
        expect(created).toHaveLength(1)
        expect(created[0]).toMatchObject({
            number: '',
            type: 'other_current_liability',
            detail_type: 'sales_tax_payable',
        })
    })

    it('shows a refused insert as the root error with the summary enabled, and selects nothing', async () => {
        seedWith(chartWithoutLiability(), {
            refuseAfter: { after: 0, error: messageRefusal('Books cannot add this account.') },
        })
        const rendered = renderAddAgency()
        await chartLoaded(rendered)

        await act(async () => {
            // A refusal may reject the call; the hook reports it through the form, which is
            // what this test reads.
            await rendered.result.current.dialog.createAccount().catch(() => {})
        })

        await waitFor(() => expect(rootError(rendered)).toBe('Books cannot add this account.'))
        await waitFor(() => expect(rendered.result.current.dialog.summaryEnabled).toBe(true))
        expect(rendered.result.current.dialog.form.getValues('account')).toBe('')
        expect(salesTaxAccounts()).toEqual([])
    })
})

describe('useAgencyDialog save', () => {
    it('puts a duplicate-name refusal on the name field, not in the root', async () => {
        const message = 'An agency named “X” already exists.'
        seedWith(seedChart(), { refusal: serverRefusal('name', message) })
        const rendered = renderAddAgency()
        await chartLoaded(rendered)

        act(() => {
            rendered.result.current.dialog.form.setValue('name', 'X')
            rendered.result.current.dialog.form.setValue('account', 'acc-2200')
        })
        act(() => {
            rendered.result.current.dialog.submit()
        })

        await waitFor(() =>
            expect(rendered.result.current.dialog.form.getFieldState('name').error?.message).toBe(
                message
            )
        )
        expect(rootError(rendered)).toBeUndefined()
        expect(enteredWrites()).toHaveLength(1)
        expect(taxAgenciesStore().toArray).toEqual([])
    })
})

describe('useAgencyDialog accounts load', () => {
    it('reports a refused accounts load, and retryLoad loads the chart and preselects 2200', async () => {
        seedWith(seedChart(), { accountsFailsOnce: true })
        expectLiveQueryError(accountsStore().id)
        // The dialog alone, so its own accounts query is the one that takes the refused load.
        const rendered = renderHook(() => useAgencyDialog(null), { wrapper })

        await waitFor(() => expect(rendered.result.current.loadFailed).toBe(true))
        expect(rendered.result.current.form.getValues('account')).toBe('')

        act(() => rendered.result.current.retryLoad())

        await waitFor(() => expect(rendered.result.current.loadFailed).toBe(false))
        await waitFor(() =>
            expect(rendered.result.current.form.getValues('account')).toBe('acc-2200')
        )
    })
})

describe('useAgencyDialog edit before the stored agency loads', () => {
    afterEach(() => useTaxesStore.getState().reset())

    it('writes nothing and keeps the dialog open', async () => {
        seedWith(seedChart())
        const open = { kind: 'agency', id: 'agency-not-loaded' } as const
        useTaxesStore.getState().openDialog(open)
        const rendered = renderAgencyDialog(open.id)
        await chartLoaded(rendered)

        act(() => {
            rendered.result.current.dialog.form.setValue('name', 'Edited agency', {
                shouldDirty: true,
            })
            rendered.result.current.dialog.form.setValue('account', 'acc-2200', {
                shouldDirty: true,
            })
        })
        act(() => {
            rendered.result.current.dialog.submit()
        })
        // A save that would close the dialog ends within a few ticks; wait them out.
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 60))
        })

        expect(enteredWrites()).toEqual([])
        expect(taxAgenciesStore().toArray).toEqual([])
        expect(useTaxesStore.getState().dialog).toEqual(open)
    })
})
