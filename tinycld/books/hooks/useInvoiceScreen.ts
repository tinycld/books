import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { materialize } from 'pbtsdb'
import { useRef } from 'react'
import { invoiceScreenState } from '../lib/invoice-screen-state'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { useInvoiceSaveStore } from '../stores/invoice-save-store'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'
import { useTaxRateOptions } from './useTaxRateOptions'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

export type InvoiceScreenInput = {
    // The invoice's id; null on `books/invoices/new`.
    id: string | null
    replaces?: string
    copy?: string
    customer?: string
    fresh?: string
}

// A disabled query reports ready, so the id is checked as well as `isEnabled`.
function readyOrIdle(id: string, query: { isEnabled: boolean; isReady: boolean }) {
    return !id || (query.isEnabled && query.isReady)
}

/**
 * The invoice routes' data: access, the Books currency, the invoice with the people who
 * posted and voided it, its lines in order, the form's customer, the invoice a
 * correction replaces, and the tax rates; the screen state they add up to, and one Retry
 * that recovers exactly the reads that failed.
 */
export function useInvoiceScreen(input: InvoiceScreenInput) {
    const [invoicesCollection, linesCollection, usersCollection, customersCollection] = useStore(
        'books_invoices',
        'books_invoice_lines',
        'users',
        'books_customers'
    )
    const [accessCollection] = useStore('books_access')
    const access = useBooksAccess()
    const settings = useBooksSettings()
    const taxOptions = useTaxRateOptions()
    const id = input.id ?? ''
    const isNew = input.id === null

    const invoiceQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ invoice: invoicesCollection })
                .where(({ invoice }) => eq(invoice.id, id))
                .select(({ invoice }) => ({
                    ...invoice,
                    postedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, invoice.posted_by))
                            .findOne()
                    ),
                    voidedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, invoice.voided_by))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.invoice', id],
    })
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.invoice, id))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.invoice.lines', id],
    })
    const heldId = useInvoiceSaveStore(s => s.heldId)
    const isHeld = heldId !== null && heldId === id
    // A held delete removes the row from the store before the server answers. The form
    // keeps the last row it read until then, so its values do not reset and a refusal
    // (the row comes back) finds the user's edits where they were.
    const lastInvoice = useRef(invoiceQuery.data)
    if (invoiceQuery.data) lastInvoice.current = invoiceQuery.data
    const invoice = invoiceQuery.data ?? (isHeld ? lastInvoice.current : undefined)
    // The form's customer: the draft's own, or `?customer` on a new form. A live query,
    // not useRecord, so a refused read shows as an error with Retry.
    const customerId = (isNew ? input.customer : invoice?.customer) ?? ''
    const customerQuery = useLiveQuery({
        query: q => {
            if (!customerId) return undefined
            return q
                .from({ c: customersCollection })
                .where(({ c }) => eq(c.id, customerId))
                .findOne()
        },
        queryKey: ['books.invoice.customer', customerId],
    })
    // The invoice a correction replaces: only its status matters here.
    const replacesId = input.replaces ?? ''
    const replacesQuery = useLiveQuery({
        query: q => {
            if (!replacesId) return undefined
            return q
                .from({ original: invoicesCollection })
                .where(({ original }) => eq(original.id, replacesId))
                .findOne()
        },
        queryKey: ['books.invoice.replaces', replacesId],
    })
    const isReady =
        access.isReady &&
        settings.isReady &&
        taxOptions.isReady &&
        readyOrIdle(id, invoiceQuery) &&
        readyOrIdle(id, linesQuery) &&
        readyOrIdle(customerId, customerQuery) &&
        readyOrIdle(replacesId, replacesQuery)
    const isError =
        access.isError ||
        settings.hasLoadError ||
        taxOptions.isError ||
        invoiceQuery.isError ||
        linesQuery.isError ||
        customerQuery.isError ||
        replacesQuery.isError
    const replacesStatus = replacesId ? (replacesQuery.data?.status ?? null) : undefined
    const state = invoiceScreenState({
        isReady,
        isError,
        canWrite: access.canWrite,
        isNew,
        status: invoiceQuery.data?.status ?? null,
        isHeld,
        replacesStatus,
    })

    // Each part is non-empty only when its own query failed, so one call recovers
    // exactly the failed reads and never empties a collection another screen shows.
    const invoiceRecovery: LiveRecovery =
        invoiceQuery.isError && invoiceQuery.collection
            ? { queries: [invoiceQuery.collection], sources: [invoicesCollection, usersCollection] }
            : NO_RECOVERY
    const linesRecovery: LiveRecovery =
        linesQuery.isError && linesQuery.collection
            ? { queries: [linesQuery.collection], sources: [linesCollection] }
            : NO_RECOVERY
    const customerRecovery: LiveRecovery =
        customerQuery.isError && customerQuery.collection
            ? { queries: [customerQuery.collection], sources: [customersCollection] }
            : NO_RECOVERY
    const replacesRecovery: LiveRecovery =
        replacesQuery.isError && replacesQuery.collection
            ? { queries: [replacesQuery.collection], sources: [invoicesCollection] }
            : NO_RECOVERY
    const accessRecovery: LiveRecovery = access.isError
        ? { queries: [access.collection], sources: [accessCollection] }
        : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([
                invoiceRecovery,
                linesRecovery,
                customerRecovery,
                replacesRecovery,
                accessRecovery,
                settings.recovery,
            ]),
            onError: err => log.error('books.invoice', err),
        })
        if (taxOptions.isError) taxOptions.retry()
    }

    return {
        state,
        invoice,
        lines: linesQuery.data ?? [],
        customer: customerQuery.data,
        retry,
        canWrite: access.canWrite,
        currency: settings.settings?.currency ?? 'USD',
        formKey: id || `new:${input.fresh ?? ''}`,
        taxOptions,
    }
}

export type InvoiceScreenData = ReturnType<typeof useInvoiceScreen>
