// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFindInvoice } from '../tinycld/books/hooks/useFindInvoice'
import { CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import type { OutstandingRow } from '../tinycld/books/lib/payment-allocation'
import { findOutcome } from '../tinycld/books/lib/payment-find'
import {
    PAYMENT_CUSTOMER_IDS,
    PAYMENT_INVOICE_IDS,
    PAYMENT_INVOICES,
} from '../tinycld/books/lib/receive-payment-fixture'
import { guardedStore, seedBooks } from './accounts-form-harness'
import { silenceLog } from './silence-log'

// Find invoice no. (spec §3.5, §4.4): the pure outcome of a lookup's matches, and the hook
// that reads them. The hook reads real local-only collections through the harness.
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const logged = silenceLog()

const ROW: OutstandingRow = {
    id: 'invfind00000001',
    number: '1099',
    date: '2026-10-01',
    due_date: '2026-10-31',
    total: 24_356,
    open: 24_356,
}
const ACTIVE = { id: 'custfindactive1', name: 'Cedar & Pine Landscaping', active: true }
const INACTIVE = { id: 'custfindinactv1', name: 'Northwind Boise (closed)', active: false }

describe('findOutcome', () => {
    it('is a miss with no match', () => {
        expect(findOutcome([])).toEqual({ kind: 'miss' })
    })

    it('picks the one match of an active customer, with its invoice and customer', () => {
        expect(findOutcome([{ invoice: ROW, customer: ACTIVE }])).toEqual({
            kind: 'picked',
            invoice: ROW,
            customer: ACTIVE.id,
        })
    })

    it('names the customer of the one match when that customer is inactive', () => {
        expect(findOutcome([{ invoice: ROW, customer: INACTIVE }])).toEqual({
            kind: 'inactive',
            customerName: INACTIVE.name,
        })
    })

    it('is a miss for two matches', () => {
        const other = { ...ROW, id: 'invfind00000002' }
        expect(
            findOutcome([
                { invoice: ROW, customer: ACTIVE },
                { invoice: other, customer: ACTIVE },
            ])
        ).toEqual({ kind: 'miss' })
    })
})

const [OVERDUE] = PAYMENT_INVOICES.filter(row => row.id === PAYMENT_INVOICE_IDS.overdue)
const [CEDAR] = PAYMENT_INVOICES.filter(row => row.id === PAYMENT_INVOICE_IDS.cedarOverdue)

describe('useFindInvoice', () => {
    beforeEach(() => {
        seedBooks()
        guardedStore('books_customers', CUSTOMERS)
    })

    function seedInvoices(extra: typeof PAYMENT_INVOICES = []) {
        guardedStore('books_invoices', [...PAYMENT_INVOICES, ...extra])
    }

    it('picks the one posted invoice with an open balance and its customer', async () => {
        // A draft and a void invoice with the same number are not open invoices (§4.4).
        seedInvoices([
            { ...OVERDUE, id: 'invfinddraft001', customer: CEDAR.customer, status: 'draft' },
            { ...OVERDUE, id: 'invfindvoid0001', customer: CEDAR.customer, status: 'void' },
        ])
        const { result } = renderHook(() => useFindInvoice())
        await expect(result.current.find('1006')).resolves.toEqual({
            kind: 'picked',
            invoice: {
                id: OVERDUE.id,
                number: '1006',
                date: OVERDUE.date,
                due_date: OVERDUE.due_date,
                total: OVERDUE.total,
                open: OVERDUE.balance,
            },
            customer: PAYMENT_CUSTOMER_IDS.harborview,
        })
        expect(logged.warn).not.toHaveBeenCalled()
    })

    it('misses a paid invoice (balance 0) and logs nothing', async () => {
        seedInvoices()
        const { result } = renderHook(() => useFindInvoice())
        await expect(result.current.find('1003')).resolves.toEqual({ kind: 'miss' })
        expect(logged.warn).not.toHaveBeenCalled()
    })

    it('misses two open invoices that share a number and logs the warning', async () => {
        seedInvoices([{ ...CEDAR, id: 'invfindtwin0001', customer: OVERDUE.customer }])
        const { result } = renderHook(() => useFindInvoice())
        await expect(result.current.find('1012')).resolves.toEqual({ kind: 'miss' })
        expect(logged.warn).toHaveBeenCalledWith(
            'books.payment',
            'two open invoices share a number',
            { number: '1012' }
        )
    })
})
