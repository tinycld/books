// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCreateStatements } from '../tinycld/books/hooks/useCreateStatements'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import type { CreateStatementsValues } from '../tinycld/books/lib/statement-schema'
import { useStatementsStore } from '../tinycld/books/stores/statements-store'
import type { BooksStatements } from '../tinycld/books/types'
import {
    enteredWrites,
    guardedStore,
    holdWrites,
    messageRefusal,
    seedBooks,
} from './accounts-form-harness'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// Save of the create screen (statements spec §3.4, §4.5): the real hook over the harness's
// local-only collections. `books_statements` and `books_customers` are guarded stores, so
// every write that reaches a handler is seen by `enteredWrites` and held by `holdWrites`.

const SERVER_SET = ['number', 'sequence', 'balance', 'currency', 'sent_at', 'sent_to'] as const

const HARBOR = CUSTOMER_IDS.harborview
const ALVAREZ = CUSTOMER_IDS.alvarez
const STJUDE = CUSTOMER_IDS.stJude
const NORTHWIND = CUSTOMER_IDS.northwind

const TYPED = 'billing.typed@example.com'

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return createElement(QueryClientProvider, { client }, children)
}

function emailOf(id: string) {
    const customer = CUSTOMERS.find(c => c.id === id)
    if (!customer) throw new Error(`no fixture customer ${id}`)
    return customer.email
}

function run(over: Partial<CreateStatementsValues> = {}): CreateStatementsValues {
    return {
        type: 'balance_forward',
        statementDate: '2026-11-20',
        startDate: '2026-10-20',
        endDate: '2026-11-20',
        balanceFilter: 'open',
        intent: 'save',
        recipients: [
            { customer: HARBOR, ticked: true, email: emailOf(HARBOR) },
            { customer: ALVAREZ, ticked: true, email: TYPED },
            { customer: NORTHWIND, ticked: false, email: emailOf(NORTHWIND) },
            { customer: STJUDE, ticked: true, email: emailOf(STJUDE) },
        ],
        ...over,
    }
}

let statements: ReturnType<typeof guardedStore<BooksStatements>>
let customers: ReturnType<typeof guardedStore<(typeof CUSTOMERS)[number]>>

beforeEach(() => {
    seedBooks()
    statements = guardedStore<BooksStatements>('books_statements', [])
    customers = guardedStore('books_customers', [...CUSTOMERS])
    useStatementsStore.getState().release()
    useStatementsStore.getState().clear()
})

function stored() {
    return [...statements.toArray].sort((a, b) => a.customer.localeCompare(b.customer))
}

describe('useCreateStatements: save', () => {
    it('inserts one statement for each ticked row with the run options and no server-set field', async () => {
        const { result } = renderHook(() => useCreateStatements(), { wrapper })
        let outcome: Awaited<ReturnType<typeof result.current.save>> | undefined
        await act(async () => {
            outcome = await result.current.save(run())
        })

        const rows = stored()
        expect(rows.map(r => r.customer)).toEqual([ALVAREZ, HARBOR, STJUDE].sort())
        for (const r of rows) {
            expect(r).toMatchObject({
                type: 'balance_forward',
                statement_date: '2026-11-20',
                start_date: '2026-10-20',
                end_date: '2026-11-20',
            })
            for (const field of SERVER_SET) expect(Object.keys(r)).not.toContain(field)
        }
        expect(outcome).toEqual({ intent: 'save', done: 3, total: 3, failed: [] })
    })

    it("stores the typed address as the row's email and writes no customer", async () => {
        const { result } = renderHook(() => useCreateStatements(), { wrapper })
        await act(async () => {
            await result.current.save(run())
        })

        const byCustomer = Object.fromEntries(stored().map(r => [r.customer, r.email]))
        expect(byCustomer).toEqual({
            [HARBOR]: emailOf(HARBOR),
            [ALVAREZ]: TYPED,
            [STJUDE]: emailOf(STJUDE),
        })
        const customerIds = new Set(CUSTOMERS.map(c => c.id))
        expect(enteredWrites().filter(key => customerIds.has(key))).toEqual([])
        expect(customers.get(ALVAREZ)?.email).toBe(emailOf(ALVAREZ))
    })

    it('sends empty start and end dates for an Open items run', async () => {
        const { result } = renderHook(() => useCreateStatements(), { wrapper })
        await act(async () => {
            await result.current.save(run({ type: 'open_items' }))
        })

        const rows = stored()
        expect(rows.map(r => r.customer)).toEqual([ALVAREZ, HARBOR, STJUDE].sort())
        for (const r of rows) {
            expect(r).toMatchObject({
                type: 'open_items',
                statement_date: '2026-11-20',
                start_date: '',
                end_date: '',
            })
        }
    })

    it('holds the screen from before the first insert until the last one settles', async () => {
        // The number of inserts that had reached a handler each time the hold flag changed.
        const flips: { isHeld: boolean; entered: number }[] = []
        const unsubscribe = useStatementsStore.subscribe((state, previous) => {
            if (state.isHeld !== previous.isHeld) {
                flips.push({ isHeld: state.isHeld, entered: enteredWrites().length })
            }
        })
        const release = holdWrites()
        const { result } = renderHook(() => useCreateStatements(), { wrapper })

        let saving: Promise<unknown> = Promise.resolve()
        act(() => {
            saving = result.current.save(run())
        })
        expect(useStatementsStore.getState().isHeld).toBe(true)
        expect(flips[0]).toEqual({ isHeld: true, entered: 0 })

        await waitFor(() => expect(enteredWrites()).toHaveLength(3))
        expect(useStatementsStore.getState().isHeld).toBe(true)

        release()
        await act(async () => {
            await saving
        })
        expect(useStatementsStore.getState().isHeld).toBe(false)
        expect(flips).toEqual([
            { isHeld: true, entered: 0 },
            { isHeld: false, entered: 3 },
        ])
        unsubscribe()
    })

    it("reports a refused customer by its label and the server's text, stores the others and releases the hold", async () => {
        // The inserts run in parallel and their ids are made inside `save`, so the refusal is
        // keyed by the refused row's id once its insert has reached the handler (the harness
        // reads `refusalFor` by reference when a held write settles).
        const refusals: Record<string, unknown> = {}
        seedBooks({ refusalFor: refusals })
        statements = guardedStore<BooksStatements>('books_statements', [])
        customers = guardedStore('books_customers', [...CUSTOMERS])
        const KITCHEN = CUSTOMER_IDS.harborviewKitchen
        const refusalText = 'This customer cannot get a statement.'

        const release = holdWrites()
        const { result } = renderHook(() => useCreateStatements(), { wrapper })
        let saving: Promise<Awaited<ReturnType<typeof result.current.save>>> | undefined
        act(() => {
            saving = result.current.save(
                run({
                    recipients: [
                        { customer: HARBOR, ticked: true, email: emailOf(HARBOR) },
                        { customer: KITCHEN, ticked: true, email: emailOf(KITCHEN) },
                        { customer: STJUDE, ticked: true, email: emailOf(STJUDE) },
                    ],
                })
            )
        })
        await waitFor(() => expect(enteredWrites()).toHaveLength(3))
        const kitchenRow = statements.toArray.find(row => row.customer === KITCHEN)
        if (kitchenRow === undefined) throw new Error('the Kitchen insert is not in the store')
        refusals[kitchenRow.id] = messageRefusal(refusalText)

        release()
        let outcome: Awaited<ReturnType<typeof result.current.save>> | undefined
        await act(async () => {
            outcome = await saving
        })

        expect(outcome).toEqual({
            intent: 'save',
            done: 2,
            total: 3,
            failed: [
                {
                    customer: KITCHEN,
                    name: 'Harborview Hospitality Group:Harborview Kitchen',
                    message: refusalText,
                },
            ],
        })
        expect(stored().map(r => r.customer)).toEqual([HARBOR, STJUDE].sort())
        expect(useStatementsStore.getState().isHeld).toBe(false)
    })
})
