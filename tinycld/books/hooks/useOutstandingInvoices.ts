import { and, eq, gt, queryOnce } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useMemo } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'
import type { OutstandingRow } from '../lib/payment-allocation'
import type { BooksInvoices } from '../types'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// An invoice as the list reads it.
export type OutstandingInvoice = Pick<
    BooksInvoices,
    'id' | 'number' | 'date' | 'due_date' | 'total' | 'balance' | 'customer'
>

const byNumber = new Intl.Collator('en', { numeric: true })

function listOrder(a: OutstandingRow, b: OutstandingRow): number {
    if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1
    return byNumber.compare(a.number, b.number)
}

/**
 * The customer's open invoices, then the invoices a stored payment names that the open
 * set no longer holds (paid off since), each once; the stored ones only while they are
 * the customer's. `open` is the balance plus what the payment being corrected applied
 * (`extraOpen`). Oldest due date first, then number.
 */
export function mergeOutstanding(
    open: readonly OutstandingInvoice[],
    stored: readonly OutstandingInvoice[],
    customerId: string,
    extraOpen: Readonly<Record<string, number>>
): OutstandingRow[] {
    const byId = new Map(open.map(invoice => [invoice.id, invoice]))
    for (const invoice of stored) {
        if (invoice.customer === customerId && !byId.has(invoice.id)) {
            byId.set(invoice.id, invoice)
        }
    }
    return [...byId.values()]
        .map(invoice => ({
            id: invoice.id,
            number: invoice.number,
            date: invoice.date.slice(0, 10),
            due_date: invoice.due_date.slice(0, 10),
            total: invoice.total,
            open: invoice.balance + (extraOpen[invoice.id] ?? 0),
        }))
        .sort(listOrder)
}

const NO_EXTRA: Readonly<Record<string, number>> = {}

/**
 * The outstanding list of the payment form: one query over the customer's posted invoices
 * with an open balance (key `books.payment.outstanding`), merged with the invoices the
 * stored applications name (`mergeOutstanding`). No customer reads nothing and is ready.
 * A failed read recovers through `retry`.
 */
export function useOutstandingInvoices(
    customerId: string,
    storedInvoices: readonly OutstandingInvoice[],
    extraOpen: Readonly<Record<string, number>> = NO_EXTRA
) {
    const [invoicesCollection] = useStore('books_invoices')
    const query = useLiveQuery({
        query: q => {
            if (!customerId) return undefined
            return q
                .from({ invoice: invoicesCollection })
                .where(({ invoice }) =>
                    and(
                        eq(invoice.customer, customerId),
                        eq(invoice.status, 'posted'),
                        gt(invoice.balance, 0)
                    )
                )
                .orderBy(({ invoice }) => invoice.due_date)
                .orderBy(({ invoice }) => invoice.number)
                .select(({ invoice }) => ({
                    id: invoice.id,
                    number: invoice.number,
                    date: invoice.date,
                    due_date: invoice.due_date,
                    total: invoice.total,
                    balance: invoice.balance,
                    customer: invoice.customer,
                }))
        },
        queryKey: ['books.payment.outstanding', customerId],
    })
    const data = query.data
    const rows = useMemo(
        () =>
            mergeOutstanding(customerId ? (data ?? []) : [], storedInvoices, customerId, extraOpen),
        [data, storedInvoices, customerId, extraOpen]
    )
    const isError = !!customerId && query.isError
    const isReady = !customerId || query.isReady || isError
    const recovery: LiveRecovery = isError
        ? { queries: [query.collection], sources: [invoicesCollection] }
        : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.payment', err),
        })
    }
    return { rows, isReady, isError, recovery, retry }
}

/**
 * A one-time read of a customer's outstanding list (the filter of useOutstandingInvoices),
 * for the customer pick that re-applies a typed amount in the event, not in an effect.
 * A failed read rejects.
 */
export function useOutstandingLoader(
    storedInvoices: readonly OutstandingInvoice[],
    extraOpen: Readonly<Record<string, number>> = NO_EXTRA
) {
    const [invoicesCollection] = useStore('books_invoices')
    return async (customerId: string): Promise<OutstandingRow[]> => {
        const open = await queryOnce({
            query: q =>
                q
                    .from({ invoice: invoicesCollection })
                    .where(({ invoice }) =>
                        and(
                            eq(invoice.customer, customerId),
                            eq(invoice.status, 'posted'),
                            gt(invoice.balance, 0)
                        )
                    )
                    .select(({ invoice }) => ({
                        id: invoice.id,
                        number: invoice.number,
                        date: invoice.date,
                        due_date: invoice.due_date,
                        total: invoice.total,
                        balance: invoice.balance,
                        customer: invoice.customer,
                    })),
        })
        return mergeOutstanding(open, storedInvoices, customerId, extraOpen)
    }
}
