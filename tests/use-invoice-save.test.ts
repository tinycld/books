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
import type { DocumentReadLine, DocumentRecord } from '../tinycld/books/hooks/document-data'
import { useDocumentForm } from '../tinycld/books/hooks/useDocumentForm'
import { postAndNewHref, useDocumentSave } from '../tinycld/books/hooks/useDocumentSave'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import { INVOICE_MESSAGES } from '../tinycld/books/lib/document-messages'
import { INVOICE_IDS, INVOICE_LINES, INVOICES } from '../tinycld/books/lib/invoice-form-fixture'
import { PRODUCT_IDS } from '../tinycld/books/lib/products-services-fixture'
import { INVOICE_KIND } from '../tinycld/books/lib/sales-document-kinds'
import { TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'
import { useDocumentSaveStore } from '../tinycld/books/stores/document-save-store'
import type { BooksInvoiceLines, BooksInvoices } from '../tinycld/books/types'
import {
    afterNextBatch,
    arriveFromServer,
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
vi.mock('@tinycld/core/lib/mutations', async importOriginal => {
    const actual = await importOriginal<typeof import('@tinycld/core/lib/mutations')>()
    const { atomicStub } = await import('./accounts-form-harness')
    return { ...actual, atomic: atomicStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const logged = silenceLog()

// Post and Post & new on the invoice form (spec §3.5): the invoice row and its lines in
// one batch, then `status: 'posted'` with the revision, with the form held by the save
// store through the write, and each refusal of the status write routed to the field it
// names. The collections are the harness's real local-only ones and the form hooks are
// the real ones; `atomic` is the harness's (a batch on local-only collections).

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
    it('writes the invoice and its lines in one batch, then status posted with revision 2', async () => {
        const probe = await openNew()
        fill(probe, [LINE_A, LINE_B])
        const steps = stepWrites()

        await post(probe)
        // The batch enters with all its rows at once.
        await waitFor(() => expect(enteredWrites()).toHaveLength(3))
        const id = insertedInvoiceId()
        expect(enteredWrites()).toEqual([id, LINE_A.id, LINE_B.id])
        expect(invoices.get(id)?.status).toBe('draft')
        steps.next()
        await waitFor(() => expect(enteredWrites()).toEqual([id, LINE_A.id, LINE_B.id, id]))
        expect(invoices.get(id)?.status).toBe('posted')
        expect(invoices.get(id)?.revision).toBe(2)
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
        // The batch: the invoice and its one line.
        await waitFor(() => expect(enteredWrites()).toHaveLength(2))
        const id = insertedInvoiceId()
        expect(heldAtChange[0]).toEqual({ key: id, status: 'draft', heldId: id })
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
            // The batch (the invoice and its lines), then the status write.
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
        await waitFor(() => expect(enteredWrites()).toHaveLength(2))
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

describe('useDocumentSave: a refused post of a new invoice', () => {
    it('keeps the draft, and the next post updates and posts that same invoice', async () => {
        const probe = await openNew()
        fill(probe, [LINE_A])
        refuseNthWrite(3, messageRefusal(CLOSED_TEXT))

        await post(probe)
        await waitFor(() => expect(rootMessage(probe.current().form)).toBe(CLOSED_TEXT))
        await waitFor(() => expect(probe.current().save.isSaving).toBe(false))
        const id = insertedInvoiceId()
        expect(probe.current().save.writtenId).toBe(id)

        await post(probe)
        await waitFor(() => expect(invoices.get(id)?.status).toBe('posted'))
        // No second invoice: the draft's baseline is 1, and its post states 2.
        expect(invoices.toArray).toHaveLength(1)
        expect(invoices.get(id)?.revision).toBe(2)
        expect(lines.toArray.map(l => l.id)).toEqual([LINE_A.id])
    })

    // The post is its own request after the create batch. Another session's save reaches
    // the store between the two: the post would state a revision the row already has.
    it('refuses the post, with no request, when the draft moved after its create batch', async () => {
        const probe = await openNew()
        fill(probe, [LINE_A])
        afterNextBatch(() =>
            arriveFromServer(() => {
                invoices.update(insertedInvoiceId(), draft => {
                    draft.revision = 2
                })
            })
        )

        await post(probe)

        await waitFor(() => expect(probe.current().save.isConflict).toBe(true))
        await waitFor(() => expect(probe.current().save.isSaving).toBe(false))
        const id = insertedInvoiceId()
        // The create batch only: no post entered.
        expect(enteredWrites()).toEqual([id, LINE_A.id])
        expect(invoices.get(id)?.status).toBe('draft')
        expect(invoices.get(id)?.revision).toBe(2)
        expect(probe.current().save.writtenId).toBe(id)
    })
})

describe('useDocumentSave: a stored draft', () => {
    const DRAFT = (() => {
        const row = INVOICES.find(invoice => invoice.id === INVOICE_IDS.draft)
        if (!row) throw new Error('no draft invoice in the fixture')
        return { ...row, revision: 5 }
    })()

    const recordOf = (row: BooksInvoices): DocumentRecord => ({
        ...row,
        kindFields: {
            kind: 'invoice',
            terms: row.terms,
            due_date: row.due_date,
            estimate: row.estimate,
            estimateRow: undefined,
        },
        postedBy: undefined,
        voidedBy: undefined,
        taxRateRow: undefined,
    })

    // The draft's lines as the screen's line query reads them, and as the form holds them.
    const STORED_LINES = INVOICE_LINES.filter(line => line.invoice === INVOICE_IDS.draft)
    const DRAFT_LINES: DocumentReadLine[] = STORED_LINES.map(line => ({
        ...line,
        productRow: undefined,
    }))
    const firstLineId = DRAFT_LINES[0].id

    // What the store holds and the screen reads: the draft's lines, and the tax rows.
    type Stored = { lines: BooksInvoiceLines[]; taxRows: typeof TAX_RATE_ROWS }
    const EVERY_KIND: Stored = { lines: STORED_LINES, taxRows: [] }

    type StoredProbeProps = { record: DocumentRecord; stored: Stored; seen: ProbeProps['seen'] }

    function StoredProbe({ record, stored, seen }: StoredProbeProps) {
        const state = useDocumentForm(INVOICE_DOCUMENT, {
            record,
            lines: stored.lines.map(line => ({ ...line, productRow: undefined })),
            customer: undefined,
            currency: 'USD',
            taxRows: stored.taxRows,
        })
        const save = useDocumentSave(state)
        seen.current = { form: state.form as unknown as Form, isReady: state.isReady, save }
        return createElement(View, { ref: save.surfaceRef })
    }

    // `storedRevision` is the revision the store row holds; the form's record starts at
    // DRAFT's (5). They differ when another session's save reached the store.
    async function openStored(storedRevision = DRAFT.revision, stored = EVERY_KIND) {
        invoices = guardedStore<BooksInvoices>('books_invoices', [
            { ...DRAFT, revision: storedRevision },
        ])
        lines = guardedStore<BooksInvoiceLines>('books_invoice_lines', stored.lines)
        const seen: { current: Seen | null } = { current: null }
        const screen: ScreenStubValue = {
            pathname: `/a/books/invoices/${DRAFT.id}`,
            navigation: { isFocused: () => true, dispatch: () => {} },
        }
        const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        const tree = (record: DocumentRecord) =>
            createElement(
                QueryClientProvider,
                { client },
                createElement(
                    ScreenStub,
                    { value: screen },
                    createElement(StoredProbe, { record, stored, seen })
                )
            )
        const view = render(tree(recordOf(DRAFT)))
        const current = () => {
            if (!seen.current) throw new Error('the probe has not rendered')
            return seen.current
        }
        await waitFor(() => {
            expect(current().isReady).toBe(true)
            expect(current().form.getValues('lines')).toHaveLength(stored.lines.length)
        })
        return { current, show: (row: BooksInvoices) => view.rerender(tree(recordOf(row))) }
    }

    // Changes only a line: the quantity of line 1. No header field is touched.
    const changeFirstQuantity = (probe: { current: () => Seen }, quantity: number) =>
        act(() => {
            const { form } = probe.current()
            const rows = form.getValues('lines') as TableRow[]
            const changed = rows.map((row, index) => (index === 0 ? { ...row, quantity } : row))
            form.setValue('lines', changed, { shouldDirty: true })
        })

    it('states the revision it loaded, as the next value, with the line first and the header last', async () => {
        const probe = await openStored()
        changeFirstQuantity(probe, 4)

        await act(async () => {
            await probe.current().save.saveDraft()
        })

        await waitFor(() => expect(invoices.get(DRAFT.id)?.revision).toBe(6))
        expect(enteredWrites()).toEqual([firstLineId, DRAFT.id])
        expect(lines.get(firstLineId)?.quantity).toBe(4)
        expect(probe.current().save.isConflict).toBe(false)
    })

    // The header does not change here. The update would set revision 6 on a row that holds
    // 6 already, so the batch would hold only the line, which the server does not check:
    // the form must refuse it.
    it('refuses a save of lines when the stored document moved past the loaded revision', async () => {
        // Another session's save reached the store (6) after this form took its values (5).
        const probe = await openStored(6)
        changeFirstQuantity(probe, 9)

        await act(async () => {
            await probe.current().save.saveDraft()
        })

        await waitFor(() => expect(probe.current().save.isConflict).toBe(true))
        expect(enteredWrites()).toEqual([])
        expect(lines.get(firstLineId)?.quantity).toBe(DRAFT_LINES[0].quantity)
        expect(invoices.get(DRAFT.id)?.revision).toBe(6)
        // What was typed stays.
        const rows = probe.current().form.getValues('lines') as TableRow[]
        expect(rows[0].quantity).toBe(9)
    })

    it('follows the row while nothing is typed, so a form that showed the change saves', async () => {
        const probe = await openStored(6)
        // The row the form reads moves to 6 while the form has no unsaved change.
        probe.show({ ...DRAFT, revision: 6 })
        changeFirstQuantity(probe, 4)

        await act(async () => {
            await probe.current().save.saveDraft()
        })

        await waitFor(() => expect(invoices.get(DRAFT.id)?.revision).toBe(7))
        expect(enteredWrites()).toEqual([firstLineId, DRAFT.id])
        expect(probe.current().save.isConflict).toBe(false)
    })

    // Decision D2. Stored: one line of 100.00, not taxable, under Denver combined. The
    // save adds a taxable credit of -95.00 and removes the tax. With the stored tax the
    // credit's own tax takes the total below zero, so no line order holds; with no tax
    // the total is 5.00. The header (the tax change) then goes first.
    describe('a save that changes the tax rate the lines need', () => {
        const ONE_LINE: Stored = {
            lines: [
                {
                    ...STORED_LINES[0],
                    quantity: 1,
                    rate: 10_000,
                    amount: 10_000,
                    taxable: false,
                },
            ],
            taxRows: TAX_RATE_ROWS,
        }
        const CREDIT: TableRow = { ...LINE_B, id: 'invlinetest0003', rate: '-95.00', taxable: true }

        const removeTaxAndAddCredit = (probe: { current: () => Seen }) =>
            act(() => {
                const { form } = probe.current()
                const rows = form.getValues('lines') as TableRow[]
                form.setValue('tax_rate', '', { shouldDirty: true })
                form.setValue('lines', [...rows, CREDIT], { shouldDirty: true })
            })

        it('saves the header first, with the next revision, then the line, in one batch', async () => {
            const probe = await openStored(DRAFT.revision, ONE_LINE)
            removeTaxAndAddCredit(probe)

            await act(async () => {
                await probe.current().save.saveDraft()
            })

            await waitFor(() => expect(invoices.get(DRAFT.id)?.revision).toBe(6))
            await waitFor(() => expect(probe.current().save.isSaving).toBe(false))
            expect(enteredWrites()).toEqual([DRAFT.id, CREDIT.id])
            expect(invoices.get(DRAFT.id)?.tax_rate).toBe('')
            expect(invoices.get(DRAFT.id)?.status).toBe('draft')
            expect(lines.toArray.map(l => l.id)).toEqual([ONE_LINE.lines[0].id, CREDIT.id])
            expect(probe.current().save.isConflict).toBe(false)
        })

        it('posts with the header first in the batch (revision + 1), then the post alone (revision + 2)', async () => {
            const probe = await openStored(DRAFT.revision, ONE_LINE)
            removeTaxAndAddCredit(probe)
            const steps = stepWrites()

            await post(probe)
            // The batch: the header, then the line. It does not post.
            await waitFor(() => expect(enteredWrites()).toEqual([DRAFT.id, CREDIT.id]))
            expect(invoices.get(DRAFT.id)?.revision).toBe(6)
            expect(invoices.get(DRAFT.id)?.tax_rate).toBe('')
            expect(invoices.get(DRAFT.id)?.status).toBe('draft')
            steps.next()
            // The post, as its own request.
            await waitFor(() => expect(enteredWrites()).toEqual([DRAFT.id, CREDIT.id, DRAFT.id]))
            expect(invoices.get(DRAFT.id)?.revision).toBe(7)
            expect(invoices.get(DRAFT.id)?.status).toBe('posted')
            steps.stop()

            await waitFor(() => expect(probe.current().save.isSaving).toBe(false))
            expect(invoices.get(DRAFT.id)?.revision).toBe(7)
            expect(invoices.get(DRAFT.id)?.status).toBe('posted')
            expect(probe.current().save.isConflict).toBe(false)
        })

        // Another session's save reaches the store between the batch and the post.
        it('refuses the post, with no request, when the draft moved after the batch', async () => {
            const probe = await openStored(DRAFT.revision, ONE_LINE)
            removeTaxAndAddCredit(probe)
            afterNextBatch(() =>
                arriveFromServer(() => {
                    invoices.update(DRAFT.id, draft => {
                        draft.revision = 7
                    })
                })
            )

            await post(probe)

            await waitFor(() => expect(probe.current().save.isConflict).toBe(true))
            await waitFor(() => expect(probe.current().save.isSaving).toBe(false))
            // The batch only: no post entered.
            expect(enteredWrites()).toEqual([DRAFT.id, CREDIT.id])
            expect(invoices.get(DRAFT.id)?.status).toBe('draft')
            expect(invoices.get(DRAFT.id)?.revision).toBe(7)
        })
    })
})
