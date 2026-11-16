// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePayBillsSave } from '../tinycld/books/hooks/usePayBillsSave'
import { SETTINGS } from '../tinycld/books/lib/account-register-fixture'
import type { PayBillsRow } from '../tinycld/books/lib/pay-bills-rows'
import type { PayBillsFormValues } from '../tinycld/books/lib/pay-bills-values'
import { usePayBillsStore } from '../tinycld/books/stores/pay-bills-store'
import { enteredWrites, holdWrites, messageRefusal, seedBooks } from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/mutations', async importOriginal => {
    const actual = await importOriginal<typeof import('@tinycld/core/lib/mutations')>()
    const { atomicStub } = await import('./accounts-form-harness')
    return { ...actual, atomic: atomicStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const logSpies = silenceLog()

// A refused Pay that settles after the user left Pay Bills (spec §3.5): nothing shows it,
// so it is logged. The save hook runs over the harness's local-only collections and its
// `atomic` (one batch, held and refused by the harness's controls); the form is a plain
// react-hook-form form with the Pay Bills values.

const BILL = 'billpaysave0001'
const CLOSED =
    'The books are closed through 2026-06-30. Ask a Books admin for a close-date override.'

const ROWS: PayBillsRow[] = [
    {
        id: BILL,
        number: '1003',
        date: '2026-11-01',
        due_date: '2026-11-10',
        total: 30_000,
        open: 30_000,
        vendor: 'vendpaysave0001',
        party: 'Pacific Power',
        ref: '88412',
    },
]

const VALUES: PayBillsFormValues = {
    paid_from: 'acct_bank_0001',
    date: '2026-11-15',
    payment_method: 'check',
    reference_no: '1050',
    payments: { [BILL]: { amount: '120.00', open: 30_000, number: '1003' } },
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
    seedBooks({
        ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] },
        refuseAfter: { after: 0, error: messageRefusal(CLOSED) },
    })
    usePayBillsStore.getState().release()
})

describe('usePayBillsSave: a refusal after leaving', () => {
    it('logs it under books.billPayment and sets no field error', async () => {
        const { warn } = logSpies
        const release = holdWrites()
        const hook = renderHook(
            () => {
                const form = useForm<PayBillsFormValues>({ defaultValues: VALUES })
                const save = usePayBillsSave({ form, rows: ROWS, currency: 'USD' })
                return { form, save }
            },
            { wrapper }
        )
        const { form } = hook.result.current

        let paying: Promise<void> | undefined
        act(() => {
            paying = hook.result.current.save.pay()
        })
        // The payment and its line are one batch, held at the server.
        await waitFor(() => expect(enteredWrites().length).toBeGreaterThanOrEqual(2))
        expect(usePayBillsStore.getState().holding).toBe(true)
        hook.unmount()

        release()
        await paying

        await waitFor(() => expect(warn).toHaveBeenCalled())
        expect(warn.mock.calls.map(call => call[0])).toEqual(['books.billPayment'])
        expect(JSON.stringify(warn.mock.calls)).toContain(CLOSED)
        expect(form.control._formState.errors).toEqual({})
        await waitFor(() => expect(usePayBillsStore.getState().holding).toBe(false))
    })
})
