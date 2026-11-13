// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { formHosts } from '@tinycld/core/lib/forms/use-form-hosts'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { deriveFormHosts } from '@tinycld/core/lib/packages/derive-form-hosts'
import * as expoRouter from 'expo-router'
import { createElement, type Provider } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { View } from 'react-native'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SALES_RECEIPT_DOCUMENT } from '../tinycld/books/components/documents/document-kinds'
import hosts, { SALES_RECEIPT_HOST_KEY } from '../tinycld/books/forms/hosts'
import type { DocumentStart } from '../tinycld/books/hooks/document-data'
import { useDocumentForm } from '../tinycld/books/hooks/useDocumentForm'
import { useDocumentSave } from '../tinycld/books/hooks/useDocumentSave'
import { SALES_RECEIPT_MESSAGES } from '../tinycld/books/lib/document-messages'
import { PRODUCT_IDS } from '../tinycld/books/lib/products-services-fixture'
import { DEPOSIT_ACCOUNT_IDS } from '../tinycld/books/lib/sales-receipt-form-fixture'
import { useDocumentSaveStore } from '../tinycld/books/stores/document-save-store'
import type { BooksSalesReceiptLines, BooksSalesReceipts } from '../tinycld/books/types'
import {
    enteredWrites,
    guardedStore,
    messageRefusal,
    refuseNthWrite,
    seedBooks,
    seedFormRecords,
    serverRefusal,
} from './accounts-form-harness'
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

silenceLog()

// Post on the sales receipt form refused for its Deposit to (checkpoint 5, spec "Post
// refuses an inactive or wrong-type Deposit to"): the text goes under Deposit to when the
// form draws it, else (an account set in "Sales deposited to" hides it) into the form's
// error summary, the hidden-field rule of recordRefusalHandler. The collections are the
// harness's real local-only ones and the form hooks are the real ones.

type ScreenStubValue = {
    pathname: string
    navigation: { isFocused: () => boolean; dispatch: (action: unknown) => void }
}
const { ScreenStub } = expoRouter as unknown as { ScreenStub: Provider<ScreenStubValue | null> }

const receiptHost = hosts.find(h => h.key === SALES_RECEIPT_HOST_KEY)
if (!receiptHost) throw new Error('no books:sales_receipt host in forms/hosts.ts')

// Register the real Books sales receipt host and its real host UI in core's registry, as
// the generated config does in the app.
formHosts.push(
    ...deriveFormHosts([
        {
            manifest: { name: 'Books', slug: 'books' },
            formHosts: [receiptHost],
            formHostsUi: () => import('../tinycld/books/forms/ui'),
        },
    ])
)

// The form is ready only after the host UI module is loaded. Load it before the first
// test: with the whole suite running, the first load can take longer than waitFor waits,
// and that time is not part of what a test measures.
beforeAll(async () => {
    await import('../tinycld/books/forms/ui')
})

const UNDEPOSITED = DEPOSIT_ACCOUNT_IDS.undeposited
// PocketBase adds a final period to the server's text.
const DEPOSIT_INVALID_TEXT = `${SALES_RECEIPT_MESSAGES.depositInvalid}.`

const LINE: TableRow = {
    id: 'srlinetest00001',
    kind: 'item',
    product: PRODUCT_IDS.patchCable,
    description: '',
    quantity: 1,
    rate: '10.00',
    amount: null,
    taxable: false,
}

const START: DocumentStart = {
    kind: 'sales_receipt',
    deposit: {
        setAccount: '',
        activeIds: new Set([UNDEPOSITED]),
        defaultId: UNDEPOSITED,
    },
}

type Form = UseFormReturn<Record<string, unknown>>
type Seen = { form: Form; isReady: boolean; save: ReturnType<typeof useDocumentSave> }

function Probe({ hidden, seen }: { hidden: boolean; seen: { current: Seen | null } }) {
    const state = useDocumentForm(SALES_RECEIPT_DOCUMENT, {
        record: undefined,
        lines: [],
        customer: undefined,
        currency: 'USD',
        taxRows: [],
        start: START,
        deposit: { hasOptions: true, hidden },
    })
    const save = useDocumentSave(state)
    seen.current = { form: state.form as unknown as Form, isReady: state.isReady, save }
    return createElement(View, { ref: save.surfaceRef })
}

async function openNew(hidden: boolean) {
    const seen: { current: Seen | null } = { current: null }
    const screen: ScreenStubValue = {
        pathname: '/a/books/sales-receipts/new',
        navigation: { isFocused: () => true, dispatch: () => {} },
    }
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(
        createElement(
            QueryClientProvider,
            { client },
            createElement(ScreenStub, { value: screen }, createElement(Probe, { hidden, seen }))
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
    act(() => {
        current().form.setValue('lines', [LINE], { shouldDirty: true })
    })
    return current
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

function messageAt(form: Form, path: string): string | undefined {
    return firstMessage(form.getFieldState(path).error as unknown)
}

function rootMessage(form: Form): string | undefined {
    return messageAt(form, 'root.server') ?? messageAt(form, 'root')
}

let receipts: ReturnType<typeof guardedStore<BooksSalesReceipts>>

beforeEach(() => {
    seedBooks()
    seedFormRecords([receiptHost])
    receipts = guardedStore<BooksSalesReceipts>('books_sales_receipts', [])
    guardedStore<BooksSalesReceiptLines>('books_sales_receipt_lines', [])
    useDocumentSaveStore.setState({ heldId: null })
})

const REFUSALS = [
    {
        shape: 'keyed to deposit_to',
        error: () => serverRefusal('deposit_to', DEPOSIT_INVALID_TEXT),
    },
    { shape: 'with its message only', error: () => messageRefusal(DEPOSIT_INVALID_TEXT) },
] as const

describe('useDocumentSave post on a sales receipt: a refused Deposit to', () => {
    for (const refusal of REFUSALS) {
        it(`${refusal.shape}, with Deposit to hidden, goes to the summary`, async () => {
            const current = await openNew(true)
            // The batch (the receipt and its line), then the status write.
            refuseNthWrite(3, refusal.error())

            await act(async () => {
                await current().save.post(false)
            })

            const { form } = current()
            await waitFor(() => expect(rootMessage(form)).toBe(DEPOSIT_INVALID_TEXT))
            expect(messageAt(form, 'deposit_to')).toBeUndefined()
            const [id] = enteredWrites()
            expect(id && receipts.get(id)?.status).toBe('draft')
        })

        it(`${refusal.shape}, with Deposit to drawn, goes under Deposit to`, async () => {
            const current = await openNew(false)
            refuseNthWrite(3, refusal.error())

            await act(async () => {
                await current().save.post(false)
            })

            const { form } = current()
            await waitFor(() => expect(messageAt(form, 'deposit_to')).toBe(DEPOSIT_INVALID_TEXT))
            expect(rootMessage(form)).toBeUndefined()
        })
    }
})
