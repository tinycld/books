// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { formHosts } from '@tinycld/core/lib/forms/use-form-hosts'
import { deriveFormHosts } from '@tinycld/core/lib/packages/derive-form-hosts'
import * as expoRouter from 'expo-router'
import { createElement, type Provider } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { View } from 'react-native'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { REFUND_RECEIPT_DOCUMENT } from '../tinycld/books/components/documents/document-kinds'
import hosts, { REFUND_RECEIPT_HOST_KEY } from '../tinycld/books/forms/hosts'
import type { DocumentStart } from '../tinycld/books/hooks/document-data'
import { useDocumentForm } from '../tinycld/books/hooks/useDocumentForm'
import { useDocumentSave } from '../tinycld/books/hooks/useDocumentSave'
import {
    REFUND_FROM_ACCOUNTS,
    REFUND_RECEIPT_IDS,
    REFUND_RECEIPT_LINES,
    REFUND_RECEIPTS,
} from '../tinycld/books/lib/refund-receipt-form-fixture'
import {
    refundFromStart,
    refundReceiptCorrectionValues,
} from '../tinycld/books/lib/refund-receipt-values'
import { useDocumentSaveStore } from '../tinycld/books/stores/document-save-store'
import type { BooksRefundReceiptLines, BooksRefundReceipts } from '../tinycld/books/types'
import { enteredWrites, guardedStore, seedBooks, seedFormRecords } from './accounts-form-harness'
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

// A correction (`?replaces=`) of a posted refund receipt keeps its source link (spec §3.8,
// "Edit (a correction) keeps the original's link"): the correction's insert writes
// `sales_receipt` / `credit_memo`, as a credit memo's insert writes its `invoice`. The
// collections are the harness's real local-only ones and the form hooks are the real ones.

type ScreenStubValue = {
    pathname: string
    navigation: { isFocused: () => boolean; dispatch: (action: unknown) => void }
}
const { ScreenStub } = expoRouter as unknown as { ScreenStub: Provider<ScreenStubValue | null> }

const refundHost = hosts.find(h => h.key === REFUND_RECEIPT_HOST_KEY)
if (!refundHost) throw new Error('no books:refund_receipt host in forms/hosts.ts')

formHosts.push(
    ...deriveFormHosts([
        {
            manifest: { name: 'Books', slug: 'books' },
            formHosts: [refundHost],
            formHostsUi: () => import('../tinycld/books/forms/ui'),
        },
    ])
)

beforeAll(async () => {
    await import('../tinycld/books/forms/ui')
})

const START: DocumentStart = {
    kind: 'refund_receipt',
    refundFrom: refundFromStart(REFUND_FROM_ACCOUNTS),
}

type Form = UseFormReturn<Record<string, unknown>>
type Seen = { form: Form; isReady: boolean; save: ReturnType<typeof useDocumentSave> }

function postedRefund(id: string) {
    const refund = REFUND_RECEIPTS.find(r => r.id === id)
    if (!refund) throw new Error(`no refund receipt ${id} in the fixture`)
    const lines = REFUND_RECEIPT_LINES.filter(l => l.refund_receipt === refund.id).sort(
        (a, b) => a.position - b.position
    )
    return { refund, lines }
}

function Probe({ refundId, seen }: { refundId: string; seen: { current: Seen | null } }) {
    const { refund, lines } = postedRefund(refundId)
    const state = useDocumentForm(REFUND_RECEIPT_DOCUMENT, {
        record: undefined,
        lines: [],
        party: undefined,
        currency: 'USD',
        taxRows: [],
        start: START,
        startValues: refundReceiptCorrectionValues(refund, lines),
        deposit: { hasOptions: true, hidden: false, field: 'refund_from' },
    })
    const save = useDocumentSave(state)
    seen.current = { form: state.form as unknown as Form, isReady: state.isReady, save }
    return createElement(View, { ref: save.surfaceRef })
}

async function openCorrection(refundId: string) {
    const seen: { current: Seen | null } = { current: null }
    const screen: ScreenStubValue = {
        pathname: '/a/books/refund-receipts/new',
        navigation: { isFocused: () => true, dispatch: () => {} },
    }
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(
        createElement(
            QueryClientProvider,
            { client },
            createElement(ScreenStub, { value: screen }, createElement(Probe, { refundId, seen }))
        )
    )
    const current = () => {
        if (!seen.current) throw new Error('the probe has not rendered')
        return seen.current
    }
    await waitFor(() => expect(current().isReady).toBe(true))
    return current
}

let refunds: ReturnType<typeof guardedStore<BooksRefundReceipts>>

beforeEach(() => {
    seedBooks()
    seedFormRecords([refundHost])
    refunds = guardedStore<BooksRefundReceipts>('books_refund_receipts', [])
    guardedStore<BooksRefundReceiptLines>('books_refund_receipt_lines', [])
    useDocumentSaveStore.setState({ heldId: null })
})

async function postAndReadInsert(refundId: string) {
    const current = await openCorrection(refundId)
    await act(async () => {
        await current().save.post(false)
    })
    await waitFor(() => expect(enteredWrites().length).toBeGreaterThan(0))
    const [id] = enteredWrites()
    const row = id ? refunds.get(id) : undefined
    if (!row) throw new Error('the correction wrote no refund receipt')
    return row
}

describe('useDocumentSave on a refund receipt correction: the source link', () => {
    it("writes the original's sales receipt on the correction's insert", async () => {
        const { refund } = postedRefund(REFUND_RECEIPT_IDS.posted)
        expect(refund.sales_receipt).not.toBe('')
        const row = await postAndReadInsert(REFUND_RECEIPT_IDS.posted)
        expect(row.replaces).toBe(refund.id)
        expect(row.sales_receipt).toBe(refund.sales_receipt)
        expect(row.credit_memo).toBe('')
    })

    it("writes the original's credit memo on a payout correction's insert", async () => {
        const { refund } = postedRefund(REFUND_RECEIPT_IDS.payout)
        expect(refund.credit_memo).not.toBe('')
        const row = await postAndReadInsert(REFUND_RECEIPT_IDS.payout)
        expect(row.replaces).toBe(refund.id)
        expect(row.credit_memo).toBe(refund.credit_memo)
        expect(row.sales_receipt).toBe('')
    })
})
