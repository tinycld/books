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
    arriveFromServer,
    enteredWrites,
    guardedStore,
    holdWrites,
    messageRefusal,
    seedBooks,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// Save of the create screen (statements spec §3.4, §4.5): the real hook over the harness's
// local-only collections. `books_statements` and `books_customers` are guarded stores, so
// every write that reaches a handler is seen by `enteredWrites` and held by `holdWrites`.

const logged = silenceLog()

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
        let ran: Awaited<ReturnType<typeof result.current.save>> | undefined
        await act(async () => {
            ran = await result.current.save(run())
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
        expect(ran?.outcome).toEqual({ intent: 'save', done: 3, total: 3, failed: [] })
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
        let ran: Awaited<ReturnType<typeof result.current.save>> | undefined
        await act(async () => {
            ran = await saving
        })

        expect(ran?.outcome).toEqual({
            intent: 'save',
            done: 2,
            total: 3,
            failed: [
                {
                    customer: KITCHEN,
                    name: 'Harborview Hospitality Group:Harborview Kitchen',
                    message: refusalText,
                    saved: null,
                },
            ],
        })
        expect(stored().map(r => r.customer)).toEqual([HARBOR, STJUDE].sort())
        expect(useStatementsStore.getState().isHeld).toBe(false)
    })
})

// --- Save and send, and a part failure (plan checkpoint 4) ---

const KITCHEN = CUSTOMER_IDS.harborviewKitchen
const KITCHEN_NAME = 'Harborview Hospitality Group:Harborview Kitchen'
const HARBOR_NAME = 'Harborview Hospitality Group'
const STJUDE_NAME = 'St. Jude Community Hospital Foundation of the Greater Willamette Valley'
const STORE_REFUSAL = 'This customer cannot get a statement.'
const SEND_REFUSAL = 'The email could not be sent. Try again.'
const SENT_AT = '2026-11-20 10:00:00.000Z'

type SendItem = { id: string; to: string }
type SendAnswer = { sent: BooksStatements[]; failed: { id: string; message: string }[] }

// The statements store with pbtsdb's `accept` (core lib/server-rows): the rows a custom
// endpoint returns land as server state, through no write handler. An insert carries the
// number the server gives the row (NUMBERS), as pbtsdb files the created record before the
// insert settles.
function acceptingStatements() {
    const collection = guardedStore<BooksStatements>('books_statements', [])
    const numbered = (row: BooksStatements): BooksStatements =>
        row.number ? row : { ...row, number: NUMBERS[row.customer] ?? 'ST-1999' }
    const insert = collection.insert.bind(collection)
    const insertNumbered: typeof insert = (data, config) =>
        insert(Array.isArray(data) ? data.map(numbered) : numbered(data), config)
    const accept = async (rows: readonly BooksStatements[]) => {
        await arriveFromServer(() => {
            for (const row of rows) {
                if (collection.has(row.id)) {
                    collection.update(row.id, draft => {
                        Object.assign(draft, row)
                    })
                } else {
                    collection.insert(row)
                }
            }
        })
    }
    return Object.assign(collection, { accept, insert: insertNumbered })
}

function storedRow(id: string): BooksStatements {
    const row = statements.get(id)
    if (row === undefined) throw new Error(`no stored statement ${id}`)
    return row
}

// The answer of the send route when every item went out: each stored row with its sent
// fields, as the server saves them.
function sentRow(item: SendItem): BooksStatements {
    return { ...storedRow(item.id), email: item.to, sent_to: item.to, sent_at: SENT_AT }
}

// A fake of the network call of the send route only: the hook under test files its answer.
function sendingAll() {
    return vi.fn(
        async (items: SendItem[]): Promise<SendAnswer> => ({
            sent: items.map(sentRow),
            failed: [],
        })
    )
}

function idOf(customer: string): string {
    const row = statements.toArray.find(r => r.customer === customer)
    if (row === undefined) throw new Error(`no stored statement of ${customer}`)
    return row.id
}

const THREE_WITH_KITCHEN: CreateStatementsValues['recipients'] = [
    { customer: HARBOR, ticked: true, email: emailOf(HARBOR) },
    { customer: KITCHEN, ticked: true, email: emailOf(KITCHEN) },
    { customer: STJUDE, ticked: true, email: emailOf(STJUDE) },
]

type Hook = ReturnType<typeof useCreateStatements>

// Renders the hook, starts `start` with the writes held, refuses the Kitchen insert once it
// reached the handler (the inserts run in parallel, so a refusal by position cannot pick
// one), then lets the writes settle and resolves to what `start` resolved to.
async function withKitchenRefused<T>(
    options: Parameters<typeof useCreateStatements>,
    start: (hook: Hook) => Promise<T>
): Promise<T> {
    const refusals: Record<string, unknown> = {}
    seedBooks({ refusalFor: refusals })
    statements = acceptingStatements()
    customers = guardedStore('books_customers', [...CUSTOMERS])
    const { result } = renderHook(() => useCreateStatements(...options), { wrapper })
    const release = holdWrites()
    let running: Promise<T> | undefined
    act(() => {
        running = start(result.current)
    })
    await waitFor(() => expect(enteredWrites()).toHaveLength(3))
    refusals[idOf(KITCHEN)] = messageRefusal(STORE_REFUSAL)
    release()
    let value: T | undefined
    await act(async () => {
        value = await running
    })
    return value as T
}

describe('useCreateStatements: a part failure and Save and send', () => {
    beforeEach(() => {
        statements = acceptingStatements()
    })

    it("(a) a refused store: the outcome names the customer with the server's text and the two stored customers are returned to untick", async () => {
        const ran = await withKitchenRefused([], hook =>
            hook.save(run({ recipients: THREE_WITH_KITCHEN }))
        )

        expect(ran.outcome).toEqual({
            intent: 'save',
            done: 2,
            total: 3,
            failed: [
                { customer: KITCHEN, name: KITCHEN_NAME, message: STORE_REFUSAL, saved: null },
            ],
        })
        expect([...ran.succeeded].sort()).toEqual([HARBOR, STJUDE].sort())
        expect(useStatementsStore.getState().outcome).toEqual(ran.outcome)
    })

    it('(b) saveAndSend sends exactly the stored rows with their addresses, never the refused row', async () => {
        const sendRequest = sendingAll()
        const ran = await withKitchenRefused([{ sendRequest }], hook =>
            hook.saveAndSend(run({ intent: 'send', recipients: THREE_WITH_KITCHEN }))
        )

        expect(sendRequest).toHaveBeenCalledTimes(1)
        const items = [...sendRequest.mock.calls[0][0]].sort((a, b) => a.id.localeCompare(b.id))
        const expected = [
            { id: idOf(HARBOR), to: emailOf(HARBOR) },
            { id: idOf(STJUDE), to: emailOf(STJUDE) },
        ].sort((a, b) => a.id.localeCompare(b.id))
        expect(items).toEqual(expected)
        expect(ran.outcome).toEqual({
            intent: 'send',
            done: 2,
            total: 3,
            failed: [
                { customer: KITCHEN, name: KITCHEN_NAME, message: STORE_REFUSAL, saved: null },
            ],
        })
    })

    it('(c) a failed send: the outcome counts only the sent customer, names the failed one, and only the sent one is returned to untick', async () => {
        const sendRequest = vi.fn(
            async (items: SendItem[]): Promise<SendAnswer> => ({
                sent: items.filter(item => item.id === idOf(HARBOR)).map(sentRow),
                failed: [{ id: idOf(STJUDE), message: SEND_REFUSAL }],
            })
        )
        const { result } = renderHook(() => useCreateStatements({ sendRequest }), { wrapper })
        let ran: Awaited<ReturnType<typeof result.current.saveAndSend>> | undefined
        await act(async () => {
            ran = await result.current.saveAndSend(
                run({
                    intent: 'send',
                    recipients: [
                        { customer: HARBOR, ticked: true, email: emailOf(HARBOR) },
                        { customer: STJUDE, ticked: true, email: emailOf(STJUDE) },
                    ],
                })
            )
        })

        expect(ran?.outcome).toEqual({
            intent: 'send',
            done: 1,
            total: 2,
            failed: [
                {
                    customer: STJUDE,
                    name: STJUDE_NAME,
                    message: SEND_REFUSAL,
                    saved: expect.objectContaining({ id: idOf(STJUDE) }),
                },
            ],
        })
        expect(ran?.succeeded).toEqual([HARBOR])
        expect(useStatementsStore.getState().outcome).toEqual(ran?.outcome)
        expect(useStatementsStore.getState().isHeld).toBe(false)
    })

    it('(d) files the rows the send route answers with collection.accept', async () => {
        const sendRequest = sendingAll()
        const { result } = renderHook(() => useCreateStatements({ sendRequest }), { wrapper })
        await act(async () => {
            await result.current.saveAndSend(
                run({
                    intent: 'send',
                    recipients: [{ customer: ALVAREZ, ticked: true, email: TYPED }],
                })
            )
        })

        const row = storedRow(idOf(ALVAREZ))
        expect(row.sent_to).toBe(TYPED)
        expect(row.sent_at).toBe(SENT_AT)
    })

    it('(e) a refused send request: the run resolves to the failed outcome, releases the hold, and is not reported a second time', async () => {
        const sendRequest = vi.fn(async (_items: SendItem[]): Promise<SendAnswer> => {
            throw messageRefusal(SEND_REFUSAL)
        })
        const { result } = renderHook(() => useCreateStatements({ sendRequest }), { wrapper })
        let ran: Awaited<ReturnType<typeof result.current.saveAndSend>> | undefined
        await act(async () => {
            ran = await result.current.saveAndSend(
                run({
                    intent: 'send',
                    recipients: [{ customer: HARBOR, ticked: true, email: emailOf(HARBOR) }],
                })
            )
        })

        expect(sendRequest).toHaveBeenCalledTimes(1)
        expect(ran?.outcome).toEqual({
            intent: 'send',
            done: 0,
            total: 1,
            failed: [
                {
                    customer: HARBOR,
                    name: HARBOR_NAME,
                    message: SEND_REFUSAL,
                    saved: expect.objectContaining({ id: idOf(HARBOR) }),
                },
            ],
        })
        expect(ran?.succeeded).toEqual([])
        expect(useStatementsStore.getState().outcome).toEqual(ran?.outcome)
        expect(useStatementsStore.getState().isHeld).toBe(false)

        // The run notice is the one report of the refusal: core's default mutation onError
        // (a "Something went wrong" toast and a Sentry capture through log.error, or its
        // offline variant through log.info) must not run for it as well.
        const unhandled = [...logged.error.mock.calls, ...logged.info.mock.calls].filter(
            ([context]) => typeof context === 'string' && context.startsWith('mutation.')
        )
        expect(unhandled).toEqual([])
    })
})

// --- A failed send never makes a new statement (statements spec §3.4, §4.5; fix round 3) ---
//
// Store names for the implementer: `saved: Record<customer, { id, number }>` holds the
// statements this screen stored and did not send; `clear()` (the run's own reset of the
// outcome) keeps them; `reset()` (the screen's unmount) drops them with the outcome.

const NEW_ADDRESS = 'accounts.corrected@example.com'

// The numbers the server gives the stored rows, by customer.
const NUMBERS: Record<string, string> = {
    [HARBOR]: 'ST-1002',
    [STJUDE]: 'ST-1003',
    [KITCHEN]: 'ST-1004',
}

// A fake of the send route's network call. The stored rows first get the number the server
// gave them (as their realtime update files it), then every item of a customer in
// `failing` fails with SEND_REFUSAL and the others are sent.
function sendingExcept(failing: Set<string>) {
    return vi.fn(async (items: SendItem[]): Promise<SendAnswer> => {
        await arriveFromServer(() => {
            for (const item of items) {
                const row = storedRow(item.id)
                if (!row.number) {
                    statements.update(item.id, draft => {
                        draft.number = NUMBERS[row.customer] ?? 'ST-1999'
                    })
                }
            }
        })
        const fails = (item: SendItem) => failing.has(storedRow(item.id).customer)
        return {
            sent: items.filter(item => !fails(item)).map(sentRow),
            failed: items.filter(fails).map(item => ({ id: item.id, message: SEND_REFUSAL })),
        }
    })
}

const HARBOR_AND_STJUDE: CreateStatementsValues['recipients'] = [
    { customer: HARBOR, ticked: true, email: emailOf(HARBOR) },
    { customer: STJUDE, ticked: true, email: emailOf(STJUDE) },
]

// A first Save and send whose send fails St. Jude's statement; Harbor's is sent.
async function failStJudeSend() {
    const failing = new Set([STJUDE])
    const sendRequest = sendingExcept(failing)
    const hook = renderHook(() => useCreateStatements({ sendRequest }), { wrapper })
    let first: StatementRunResult | undefined
    await act(async () => {
        first = await hook.result.current.saveAndSend(
            run({ intent: 'send', recipients: HARBOR_AND_STJUDE })
        )
    })
    if (first === undefined) throw new Error('the first run did not resolve')
    return { hook, sendRequest, failing, first, firstId: idOf(STJUDE) }
}

type StatementRunResult = Awaited<ReturnType<Hook['saveAndSend']>>

describe('useCreateStatements: a failed send keeps its saved statement', () => {
    beforeEach(() => {
        statements = acceptingStatements()
        useStatementsStore.setState({ saved: {} })
    })

    it("(a) the failed customer's outcome entry and the store carry the saved statement's id and number", async () => {
        const { first, firstId } = await failStJudeSend()

        expect(first.outcome.failed).toEqual([
            {
                customer: STJUDE,
                name: STJUDE_NAME,
                message: SEND_REFUSAL,
                saved: { id: firstId, number: 'ST-1003' },
            },
        ])
        expect(useStatementsStore.getState().saved).toEqual({
            [STJUDE]: { id: firstId, number: 'ST-1003' },
        })
    })

    it('(b) a second Save and send inserts nothing and sends the saved id to the address now in the row', async () => {
        const { hook, sendRequest, failing, firstId } = await failStJudeSend()
        failing.clear()
        const rowsBefore = statements.toArray.length
        const writesBefore = enteredWrites().length

        let second: StatementRunResult | undefined
        await act(async () => {
            second = await hook.result.current.saveAndSend(
                run({
                    intent: 'send',
                    recipients: [
                        { customer: HARBOR, ticked: false, email: emailOf(HARBOR) },
                        { customer: STJUDE, ticked: true, email: NEW_ADDRESS },
                    ],
                })
            )
        })

        expect(statements.toArray.length).toBe(rowsBefore)
        expect(enteredWrites().length).toBe(writesBefore)
        expect(sendRequest).toHaveBeenCalledTimes(2)
        expect(sendRequest.mock.calls[1][0]).toEqual([{ id: firstId, to: NEW_ADDRESS }])
        expect(second?.succeeded).toEqual([STJUDE])
        expect(useStatementsStore.getState().saved).toEqual({})
        expect(storedRow(firstId).sent_to).toBe(NEW_ADDRESS)
    })

    it('(c) a second Save inserts nothing and counts the saved statement as saved', async () => {
        const { hook, sendRequest } = await failStJudeSend()
        const rowsBefore = statements.toArray.length
        const writesBefore = enteredWrites().length

        let second: Awaited<ReturnType<Hook['save']>> | undefined
        await act(async () => {
            second = await hook.result.current.save(
                run({ recipients: [{ customer: STJUDE, ticked: true, email: emailOf(STJUDE) }] })
            )
        })

        expect(statements.toArray.length).toBe(rowsBefore)
        expect(enteredWrites().length).toBe(writesBefore)
        expect(sendRequest).toHaveBeenCalledTimes(1)
        expect(second?.succeeded).toEqual([STJUDE])
        expect(second?.outcome).toEqual({ intent: 'save', done: 1, total: 1, failed: [] })
    })

    it('(d) a customer whose store was refused has no saved statement, and the next press stores it once', async () => {
        const refusals: Record<string, unknown> = {}
        seedBooks({ refusalFor: refusals })
        statements = acceptingStatements()
        customers = guardedStore('books_customers', [...CUSTOMERS])
        const sendRequest = sendingExcept(new Set())
        const { result } = renderHook(() => useCreateStatements({ sendRequest }), { wrapper })
        const release = holdWrites()
        let running: Promise<StatementRunResult> | undefined
        act(() => {
            running = result.current.saveAndSend(
                run({ intent: 'send', recipients: THREE_WITH_KITCHEN })
            )
        })
        await waitFor(() => expect(enteredWrites()).toHaveLength(3))
        const refusedId = idOf(KITCHEN)
        refusals[refusedId] = messageRefusal(STORE_REFUSAL)
        release()
        let first: StatementRunResult | undefined
        await act(async () => {
            first = await running
        })
        expect(first?.outcome.failed).toEqual([
            { customer: KITCHEN, name: KITCHEN_NAME, message: STORE_REFUSAL, saved: null },
        ])
        expect(useStatementsStore.getState().saved).toEqual({})

        const writesBefore = enteredWrites().length
        await act(async () => {
            await result.current.saveAndSend(
                run({
                    intent: 'send',
                    recipients: [{ customer: KITCHEN, ticked: true, email: emailOf(KITCHEN) }],
                })
            )
        })

        expect(enteredWrites().length).toBe(writesBefore + 1)
        const kitchenRows = statements.toArray.filter(row => row.customer === KITCHEN)
        expect(kitchenRows).toHaveLength(1)
        expect(kitchenRows[0].id).not.toBe(refusedId)
        expect(sendRequest.mock.calls[1][0]).toEqual([
            { id: kitchenRows[0].id, to: emailOf(KITCHEN) },
        ])
    })

    it("(e) the run's clear keeps the saved statements and the screen's reset drops them", async () => {
        const { firstId } = await failStJudeSend()

        useStatementsStore.getState().clear()
        expect(useStatementsStore.getState().saved).toEqual({
            [STJUDE]: { id: firstId, number: 'ST-1003' },
        })

        useStatementsStore.getState().reset()
        expect(useStatementsStore.getState().saved).toEqual({})
        expect(useStatementsStore.getState().outcome).toBeNull()
    })
})

// --- The number of a failed send outlives its row in the store (fix round 4, T1) ---
//
// The create screen has no live query on `books_statements`, so pbtsdb can drop a stored
// row from the collection; the "<number> not sent" mark keeps the number read when the
// insert settled (statements spec §3.4).

const ONLY_STJUDE: CreateStatementsValues['recipients'] = [
    { customer: STJUDE, ticked: true, email: emailOf(STJUDE) },
]

const STJUDE_NUMBER = NUMBERS[STJUDE]

// A fake of the send route's network call that fails every item. With `dropFirst`, the
// stored rows leave the collection before the answer arrives.
function failingAll(dropFirst = false) {
    return vi.fn(async (items: SendItem[]): Promise<SendAnswer> => {
        if (dropFirst) {
            await arriveFromServer(() => {
                for (const item of items) statements.delete(item.id)
            })
        }
        return {
            sent: [],
            failed: items.map(item => ({ id: item.id, message: SEND_REFUSAL })),
        }
    })
}

describe('useCreateStatements: a failed send keeps the number of a row that left the store', () => {
    beforeEach(() => {
        statements = acceptingStatements()
        useStatementsStore.setState({ saved: {} })
    })

    it('(a) a second failed Save and send after the row left the collection still carries the first number', async () => {
        const sendRequest = failingAll()
        const { result } = renderHook(() => useCreateStatements({ sendRequest }), { wrapper })
        let first: StatementRunResult | undefined
        await act(async () => {
            first = await result.current.saveAndSend(
                run({ intent: 'send', recipients: ONLY_STJUDE })
            )
        })
        const firstId = idOf(STJUDE)
        expect(first?.outcome.failed[0]?.saved).toEqual({ id: firstId, number: STJUDE_NUMBER })

        await act(async () => {
            await arriveFromServer(() => {
                statements.delete(firstId)
            })
        })
        expect(statements.has(firstId)).toBe(false)

        let second: StatementRunResult | undefined
        await act(async () => {
            second = await result.current.saveAndSend(
                run({ intent: 'send', recipients: ONLY_STJUDE })
            )
        })

        expect(sendRequest.mock.calls[1][0]).toEqual([{ id: firstId, to: emailOf(STJUDE) }])
        expect(second?.outcome.failed).toEqual([
            {
                customer: STJUDE,
                name: STJUDE_NAME,
                message: SEND_REFUSAL,
                saved: { id: firstId, number: STJUDE_NUMBER },
            },
        ])
        expect(useStatementsStore.getState().saved).toEqual({
            [STJUDE]: { id: firstId, number: STJUDE_NUMBER },
        })
    })

    it('(b) a first-run failure whose row left the collection before the answer carries the number read when the insert settled', async () => {
        const sendRequest = failingAll(true)
        const { result } = renderHook(() => useCreateStatements({ sendRequest }), { wrapper })
        let ran: StatementRunResult | undefined
        await act(async () => {
            ran = await result.current.saveAndSend(run({ intent: 'send', recipients: ONLY_STJUDE }))
        })

        const sentId = sendRequest.mock.calls[0]?.[0][0]?.id
        if (sentId === undefined) throw new Error('the run sent no statement')
        expect(statements.has(sentId)).toBe(false)
        expect(ran?.outcome.failed).toEqual([
            {
                customer: STJUDE,
                name: STJUDE_NAME,
                message: SEND_REFUSAL,
                saved: { id: sentId, number: STJUDE_NUMBER },
            },
        ])
        expect(useStatementsStore.getState().saved).toEqual({
            [STJUDE]: { id: sentId, number: STJUDE_NUMBER },
        })
    })
})
