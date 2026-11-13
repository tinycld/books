// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { formHosts } from '@tinycld/core/lib/forms/use-form-hosts'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { appHref } from '@tinycld/core/lib/org-routes'
import { deriveFormHosts } from '@tinycld/core/lib/packages/derive-form-hosts'
import * as expoRouter from 'expo-router'
import { createElement, type Provider } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { View } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVOICE_DOCUMENT } from '../tinycld/books/components/documents/document-kinds'
import hosts, { INVOICE_HOST_KEY } from '../tinycld/books/forms/hosts'
import { useDocumentForm } from '../tinycld/books/hooks/useDocumentForm'
import { postAndNewHref, useDocumentSave } from '../tinycld/books/hooks/useDocumentSave'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import { INVOICE_MESSAGES } from '../tinycld/books/lib/document-messages'
import { PRODUCT_IDS } from '../tinycld/books/lib/products-services-fixture'
import { INVOICE_KIND } from '../tinycld/books/lib/sales-document-kinds'
import { useDocumentSaveStore } from '../tinycld/books/stores/document-save-store'
import type { BooksInvoiceLines, BooksInvoices } from '../tinycld/books/types'
import {
    enteredWrites,
    guardedStore,
    holdWrites,
    messageRefusal,
    refuseNthWrite,
    seedBooks,
    seedFormRecords,
    stepWrites,
} from './accounts-form-harness'
import { publishedRow } from './live-rows'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const logged = silenceLog()

// Post and Post & new on the invoice form (spec §3.5): the invoice row, then its lines, then
// `status: 'posted'`, with the form held by the save store through the write, and each
// refusal of the status write routed to the field it names. The collections are the
// harness's real local-only ones and the form hooks are the real ones; nothing of ours is
// mocked.

type ScreenStubValue = {
    pathname: string
    navigation: { isFocused: () => boolean; dispatch: (action: unknown) => void }
}
// Vitest serves expo-router from the app shell's test stub, which adds ScreenStub: the
// screen whose navigation `useNavigation` answers inside it.
const { ScreenStub } = expoRouter as unknown as { ScreenStub: Provider<ScreenStubValue | null> }
const { router } = expoRouter

const invoiceHost = hosts.find(h => h.key === INVOICE_HOST_KEY)
if (!invoiceHost) throw new Error('no books:invoice host in forms/hosts.ts')

// The shared unit setup gives the app an empty package list, so core's host registry holds
// only core's hosts. Register the real Books invoice host and its real host UI in it, as the
// generated config does in the app (not a mock: the same derivation, the same modules).
formHosts.push(
    ...deriveFormHosts([
        {
            manifest: { name: 'Books', slug: 'books' },
            formHosts: [invoiceHost],
            formHostsUi: () => import('../tinycld/books/forms/ui'),
        },
    ])
)

// The `?customer` customer as the screen's customer query publishes it.
const HARBORVIEW = (() => {
    const row = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.harborview)
    if (!row) throw new Error('no Harborview in the customer fixture')
    return publishedRow({ ...row, name_key: '', sort_key: '' }, 'books_customers')
})()

const CLOSED_TEXT =
    'The books are closed through 2026-06-30. Ask a Books admin for a close-date override to post on 2026-07-01.'
const INACTIVE_CUSTOMER_TEXT = `${HARBORVIEW.display_name} is inactive. Choose an active customer.`
const LINE_2_TEXT =
    'Line 2: Wireless access point is inactive. Choose an active product or service.'
const DUE_DATE_TEXT = `${INVOICE_MESSAGES.dueBeforeDate}.`
const TAX_TEXT = 'Tax rate Denver combined is inactive. Choose an active tax rate.'

function itemLine(id: string, product: string): TableRow {
    return {
        id,
        kind: 'item',
        product,
        description: '',
        quantity: 1,
        rate: '10.00',
        amount: null,
        taxable: false,
    }
}

const LINE_A = itemLine('invlinetest0001', PRODUCT_IDS.patchCable)
const LINE_B = itemLine('invlinetest0002', PRODUCT_IDS.accessPoint)

type Form = UseFormReturn<Record<string, unknown>>
type Seen = {
    form: Form
    isReady: boolean
    save: ReturnType<typeof useDocumentSave>
}

type ProbeProps = {
    customer: typeof HARBORVIEW | undefined
    presence: { focused: boolean }
    seen: { current: Seen | null }
}

// The new invoice form as the screen builds it (`?customer` gives it a customer), and its
// save. The surface view is what the save's presence check reads.
function Probe({ customer, seen }: ProbeProps) {
    const state = useDocumentForm(INVOICE_DOCUMENT, {
        record: undefined,
        lines: [],
        customer,
        currency: 'USD',
        taxRows: [],
    })
    const save = useDocumentSave(state)
    seen.current = { form: state.form as unknown as Form, isReady: state.isReady, save }
    return createElement(View, { ref: save.surfaceRef })
}

let invoices: ReturnType<typeof guardedStore<BooksInvoices>>
let lines: ReturnType<typeof guardedStore<BooksInvoiceLines>>

// `null` opens the form with no `?customer`; a default parameter would replace `undefined`.
async function openNew(opened: typeof HARBORVIEW | null = HARBORVIEW) {
    const customer = opened ?? undefined
    const seen: { current: Seen | null } = { current: null }
    const presence = { focused: true }
    const screen: ScreenStubValue = {
        pathname: '/a/books/invoices/new',
        navigation: { isFocused: () => presence.focused, dispatch: () => {} },
    }
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(
        createElement(
            QueryClientProvider,
            { client },
            createElement(
                ScreenStub,
                { value: screen },
                createElement(Probe, { customer, presence, seen })
            )
        )
    )
    const current = () => {
        if (!seen.current) throw new Error('the probe has not rendered')
        return seen.current
    }
    await waitFor(() => {
        expect(current().isReady).toBe(true)
        expect(current().form.getValues('lines')).toHaveLength(1)
    })
    return { current, presence }
}

// Fills the new form as a user would: the customer (unless the form was opened with one)
// and these lines.
function fill(probe: { current: () => Seen }, rows: TableRow[]) {
    act(() => {
        const { form } = probe.current()
        form.setValue('customer', HARBORVIEW.id, { shouldDirty: true })
        form.setValue('lines', rows, { shouldDirty: true })
    })
}

async function post(probe: { current: () => Seen }, andNew = false) {
    await act(async () => {
        await probe.current().save.post(andNew)
    })
}

function insertedInvoiceId(): string {
    const [id] = enteredWrites()
    if (!id) throw new Error('nothing was written')
    return id
}

// A field's message as the form holds it now (lesson: never `formState.errors`). A refusal
// under a line may sit on the row or on one of its cells; a table error may sit on the
// table or its `root`.
function messageAt(form: Form, path: string): string | undefined {
    const error = form.getFieldState(path).error as unknown
    return firstMessage(error)
}

function firstMessage(error: unknown): string | undefined {
    if (error === null || typeof error !== 'object') return undefined
    const { message } = error as { message?: unknown }
    if (typeof message === 'string') return message
    for (const value of Object.values(error)) {
        const found = firstMessage(value)
        if (found !== undefined) return found
    }
    return undefined
}

function rootMessage(form: Form): string | undefined {
    return messageAt(form, 'root.server') ?? messageAt(form, 'root')
}

// The href without its random nonce, so two Post & new hrefs compare by what they keep.
function withoutNonce(href: unknown): string {
    return String(href).replace(/fresh=[^&]+/, 'fresh=*')
}

function lastReplace(): unknown {
    const calls = vi.mocked(router.replace).mock.calls
    return calls[calls.length - 1]?.[0]
}

beforeEach(() => {
    seedBooks()
    seedFormRecords([invoiceHost])
    invoices = guardedStore<BooksInvoices>('books_invoices', [])
    lines = guardedStore<BooksInvoiceLines>('books_invoice_lines', [])
    useDocumentSaveStore.setState({ heldId: null })
    vi.mocked(router.replace).mockClear()
})

describe('useInvoiceSave post: write order and hold', () => {
    it('writes the invoice, then its lines, then status posted, in that order', async () => {
        const probe = await openNew()
        fill(probe, [LINE_A, LINE_B])
        const steps = stepWrites()

        await post(probe)
        await waitFor(() => expect(enteredWrites()).toHaveLength(1))
        const id = insertedInvoiceId()
        expect(invoices.get(id)?.status).toBe('draft')
        steps.next()
        await waitFor(() => expect(enteredWrites()).toEqual([id, LINE_A.id]))
        expect(invoices.get(id)?.status).toBe('draft')
        steps.next()
        await waitFor(() => expect(enteredWrites()).toEqual([id, LINE_A.id, LINE_B.id]))
        expect(invoices.get(id)?.status).toBe('draft')
        steps.next()
        await waitFor(() => expect(enteredWrites()).toEqual([id, LINE_A.id, LINE_B.id, id]))
        expect(invoices.get(id)?.status).toBe('posted')
        steps.stop()

        await waitFor(() => expect(probe.current().save.isSaving).toBe(false))
        expect(invoices.get(id)?.status).toBe('posted')
        expect(lines.toArray.map(l => [l.id, l.invoice])).toEqual([
            [LINE_A.id, id],
            [LINE_B.id, id],
        ])
    })

    it('holds the invoice id from before the first write until the post settles', async () => {
        const probe = await openNew()
        fill(probe, [LINE_A])
        // The held id at each change the store shows, from the optimistic insert on.
        const heldAtChange: { key: string; status: unknown; heldId: string | null }[] = []
        const subscription = invoices.subscribeChanges(changes => {
            for (const change of changes) {
                heldAtChange.push({
                    key: String(change.key),
                    status: change.value?.status,
                    heldId: useDocumentSaveStore.getState().heldId,
                })
            }
        })
        const steps = stepWrites()

        await post(probe)
        await waitFor(() => expect(enteredWrites()).toHaveLength(1))
        const id = insertedInvoiceId()
        expect(heldAtChange[0]).toEqual({ key: id, status: 'draft', heldId: id })
        steps.next()
        await waitFor(() => expect(enteredWrites()).toHaveLength(2))
        expect(useDocumentSaveStore.getState().heldId).toBe(id)
        steps.next()
        await waitFor(() => expect(enteredWrites()).toHaveLength(3))
        expect(useDocumentSaveStore.getState().heldId).toBe(id)
        const posted = heldAtChange.find(c => c.status === 'posted')
        expect(posted).toEqual({ key: id, status: 'posted', heldId: id })
        steps.next()
        steps.stop()

        await waitFor(() => expect(useDocumentSaveStore.getState().heldId).toBeNull())
        expect(invoices.get(id)?.status).toBe('posted')
        subscription.unsubscribe()
    })

    it('sets the item-line rule at lines and writes nothing when the form has no Item line', async () => {
        const probe = await openNew()
        fill(probe, [{ id: 'invlinedescr001', kind: 'description', description: 'Notes' }])

        await post(probe)

        await waitFor(() =>
            expect(messageAt(probe.current().form, 'lines')).toBe(INVOICE_MESSAGES.needItemLine)
        )
        expect(enteredWrites()).toEqual([])
        expect(invoices.toArray).toEqual([])
        expect(useDocumentSaveStore.getState().heldId).toBeNull()
    })
})

describe('useInvoiceSave post: a refused status write', () => {
    const cases = [
        {
            name: 'an inactive customer lands on customer',
            text: INACTIVE_CUSTOMER_TEXT,
            field: 'customer',
            rows: [LINE_A],
        },
        {
            name: '"Line 2: …" lands on lines.1',
            text: LINE_2_TEXT,
            field: 'lines.1',
            rows: [LINE_A, LINE_B],
        },
        {
            name: 'a due date text lands on due_date',
            text: DUE_DATE_TEXT,
            field: 'due_date',
            rows: [LINE_A],
        },
        {
            name: 'a text starting "Tax" lands on tax_rate',
            text: TAX_TEXT,
            field: 'tax_rate',
            rows: [LINE_A],
        },
        {
            name: 'a close-date text lands on the root',
            text: CLOSED_TEXT,
            field: 'root',
            rows: [LINE_A],
        },
    ] as const

    for (const refusal of cases) {
        it(`${refusal.name} and the draft stays`, async () => {
            const probe = await openNew()
            fill(probe, [...refusal.rows])
            // The invoice insert, one write per line, then the status write.
            refuseNthWrite(refusal.rows.length + 2, messageRefusal(refusal.text))

            await post(probe)

            const { form } = probe.current()
            const read = () =>
                refusal.field === 'root' ? rootMessage(form) : messageAt(form, refusal.field)
            await waitFor(() => expect(read()).toBe(refusal.text))
            await waitFor(() => expect(probe.current().save.isSaving).toBe(false))
            const id = insertedInvoiceId()
            expect(enteredWrites()).toEqual([id, ...refusal.rows.map(r => r.id), id])
            expect(invoices.get(id)?.status).toBe('draft')
            expect(lines.toArray.map(l => l.id)).toEqual(refusal.rows.map(r => r.id))
            if (refusal.field !== 'root') expect(rootMessage(form)).toBeUndefined()
            if (refusal.field !== 'customer') expect(messageAt(form, 'customer')).toBeUndefined()
            expect(useDocumentSaveStore.getState().heldId).toBeNull()
        })
    }

    it('logs a refusal that arrives after the user left, and sets no field error', async () => {
        const probe = await openNew()
        fill(probe, [LINE_A])
        refuseNthWrite(3, messageRefusal(INACTIVE_CUSTOMER_TEXT))
        const release = holdWrites()

        await post(probe)
        await waitFor(() => expect(enteredWrites()).toHaveLength(1))
        probe.presence.focused = false
        release()

        await waitFor(() =>
            expect(logged.warn.mock.calls.map(call => call[0])).toContain('books.invoice')
        )
        await waitFor(() => expect(probe.current().save.isSaving).toBe(false))
        const { form } = probe.current()
        expect(messageAt(form, 'customer')).toBeUndefined()
        expect(rootMessage(form)).toBeUndefined()
        expect(invoices.get(insertedInvoiceId())?.status).toBe('draft')
    })
})

describe('useInvoiceSave post & new', () => {
    it('on a form opened with ?customer, replaces with a fresh form that keeps the customer', async () => {
        const probe = await openNew(HARBORVIEW)
        fill(probe, [LINE_A])

        await post(probe, true)

        await waitFor(() => expect(router.replace).toHaveBeenCalled())
        const href = lastReplace()
        expect(String(href)).toMatch(
            new RegExp(`/books/invoices/new\\?fresh=[^&]+&customer=${HARBORVIEW.id}$`)
        )
        expect(withoutNonce(href)).toBe(
            withoutNonce(appHref(postAndNewHref(INVOICE_KIND, HARBORVIEW.id)))
        )
        expect(invoices.get(insertedInvoiceId())?.status).toBe('posted')
    })

    it('on a form opened without a customer, replaces with a fresh form with no customer', async () => {
        const probe = await openNew(null)
        fill(probe, [LINE_A])

        await post(probe, true)

        await waitFor(() => expect(router.replace).toHaveBeenCalled())
        const href = lastReplace()
        expect(String(href)).toMatch(/\/books\/invoices\/new\?fresh=[^&]+$/)
        expect(String(href)).not.toContain('customer')
        expect(withoutNonce(href)).toBe(
            withoutNonce(appHref(postAndNewHref(INVOICE_KIND, undefined)))
        )
    })
})
