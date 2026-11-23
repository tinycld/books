// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { ORG_INFO_QUERY_KEY } from '@tinycld/core/lib/use-org-info'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSendDialogData } from '../tinycld/books/hooks/useSendDialogData'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import { SALES_RECEIPT_IDS, SALES_RECEIPTS } from '../tinycld/books/lib/sales-receipt-form-fixture'
import type { BooksCustomers, BooksSalesReceipts } from '../tinycld/books/types'
import { guardedStore, seedBooks } from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub, pb: {} }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// The reads of the Send dialog (spec §3.2 "Load", plan checkpoint 3, fix round 2 item 1):
// the real hook over the harness's local-only collections. The email status and the
// organization's name are server reads through React Query; their answers are put in the
// query cache before the hook mounts, so no request runs.

silenceLog()

const WALK_IN_EMAIL = 'counter-sale@walkin.example'

function receiptOf(id: string): BooksSalesReceipts {
    const row = SALES_RECEIPTS.find(r => r.id === id)
    if (!row) throw new Error(`no sales receipt fixture ${id}`)
    return row
}

function customerOf(id: string): BooksCustomers {
    const row = CUSTOMERS.find(c => c.id === id)
    if (!row) throw new Error(`no customer fixture ${id}`)
    // The two server-written keys the fixture leaves out.
    return { ...row, name_key: '', sort_key: '' }
}

// The five document stores the hook asks for, and the customers.
function seedDocuments(receipts: BooksSalesReceipts[], customers: BooksCustomers[]) {
    guardedStore('books_invoices', [])
    guardedStore('books_estimates', [])
    guardedStore('books_sales_receipts', receipts)
    guardedStore('books_credit_memos', [])
    guardedStore('books_refund_receipts', [])
    guardedStore('books_customers', customers)
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['books', 'email-status'], { canSend: true })
    client.setQueryData(ORG_INFO_QUERY_KEY, {
        name: 'Hartwell Supply Co.',
        logoUrl: '',
        logoCrop: '',
        managedSettings: [],
        mailHost: '',
    })
    return createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
    seedBooks()
})

describe('useSendDialogData', () => {
    it('a posted walk-in sales receipt with an email is ready, with no customer', async () => {
        const walkIn = { ...receiptOf(SALES_RECEIPT_IDS.walkIn), email: WALK_IN_EMAIL }
        expect(walkIn.customer).toBe('')
        seedDocuments([walkIn], [customerOf(CUSTOMER_IDS.harborview)])

        const { result } = renderHook(
            () => useSendDialogData({ kind: 'sales_receipt', id: walkIn.id }),
            { wrapper }
        )

        await waitFor(() => expect(result.current.status).not.toBe('loading'))
        expect(result.current.status).toBe('ready')
        expect(result.current.customer).toBeUndefined()
        // The starting To is the document's email, else the customer's (spec §3.2 To).
        expect(result.current.record?.email).toBe(WALK_IN_EMAIL)
    })

    it('a document that names a customer who is not there, once the reads settle, is not-found', async () => {
        const posted = receiptOf(SALES_RECEIPT_IDS.posted)
        expect(posted.customer).toBe(CUSTOMER_IDS.harborview)
        seedDocuments([posted], [])

        const { result } = renderHook(
            () => useSendDialogData({ kind: 'sales_receipt', id: posted.id }),
            { wrapper }
        )

        await waitFor(() => expect(result.current.status).not.toBe('loading'))
        expect(result.current.status).toBe('not-found')
    })

    it('a document whose named customer is there is ready, with that customer', async () => {
        const posted = receiptOf(SALES_RECEIPT_IDS.posted)
        seedDocuments([posted], [customerOf(CUSTOMER_IDS.harborview)])

        const { result } = renderHook(
            () => useSendDialogData({ kind: 'sales_receipt', id: posted.id }),
            { wrapper }
        )

        await waitFor(() => expect(result.current.status).not.toBe('loading'))
        expect(result.current.status).toBe('ready')
        expect(result.current.customer?.id).toBe(CUSTOMER_IDS.harborview)
    })
})
