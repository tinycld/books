import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { materialize } from 'pbtsdb'
import { useMemo, useRef } from 'react'
import { invoiceScreenState } from '../lib/invoice-screen-state'
import { copyInvoiceValues, correctionValues } from '../lib/invoice-values'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { todayIso } from '../lib/register-range'
import { useInvoiceSaveStore } from '../stores/invoice-save-store'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'
import { useInvoiceTaxLines } from './useInvoiceTaxLines'
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
 * posted and voided it, its lines in order with their products, the form's customer, the
 * invoice a correction replaces or a copy starts from (with its lines on a new form), the
 * posted tax lines of the read view, and the tax rates; the screen state they add up to,
 * and one Retry that recovers exactly the reads that failed.
 */
export function useInvoiceScreen(input: InvoiceScreenInput) {
    const [
        invoicesCollection,
        linesCollection,
        usersCollection,
        customersCollection,
        productsCollection,
    ] = useStore(
        'books_invoices',
        'books_invoice_lines',
        'users',
        'books_customers',
        'books_products'
    )
    const [accessCollection, taxRatesCollection] = useStore('books_access', 'books_tax_rates')
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
                    // The read view's tax line names it.
                    taxRateRow: materialize(
                        q
                            .from({ t: taxRatesCollection })
                            .where(({ t }) => eq(t.id, invoice.tax_rate))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.invoice', id],
    })
    // Each line with its product, which the read view names.
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.invoice, id))
                .orderBy(({ line }) => line.position)
                .select(({ line }) => ({
                    ...line,
                    productRow: materialize(
                        q
                            .from({ p: productsCollection })
                            .where(({ p }) => eq(p.id, line.product))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.invoice.lines', id],
    })
    const heldId = useInvoiceSaveStore(s => s.heldId)
    // A new form's save holds the id it inserts, which the route does not name yet: any
    // hold is this form's (one invoice form is mounted at a time).
    const isHeld = heldId !== null && (isNew || heldId === id)
    // A held delete removes the row from the store before the server answers. The form
    // keeps the last row it read until then, so its values do not reset and a refusal
    // (the row comes back) finds the user's edits where they were.
    const lastInvoice = useRef(invoiceQuery.data)
    if (invoiceQuery.data) lastInvoice.current = invoiceQuery.data
    const invoice = invoiceQuery.data ?? (isHeld ? lastInvoice.current : undefined)
    // The source invoice: on a new form, the one `?replaces` corrects or `?copy` copies
    // (its lines give the form's values); on a saved correction draft, the invoice it
    // replaces (its number titles the form).
    const sourceId = (isNew ? (input.replaces ?? input.copy) : invoice?.replaces) ?? ''
    const sourceLinesId = isNew ? sourceId : ''
    const sourceQuery = useLiveQuery({
        query: q => {
            if (!sourceId) return undefined
            return q
                .from({ source: invoicesCollection })
                .where(({ source }) => eq(source.id, sourceId))
                .findOne()
        },
        queryKey: ['books.invoice.source', sourceId],
    })
    const source = sourceQuery.data
    // The form's customer: the draft's own, `?customer` on a new form, or a copy's
    // source customer (a copy fills Bill to, Email and Terms from its current record). A
    // live query, not useRecord, so a refused read shows as an error with Retry.
    const newCustomerId = input.copy ? source?.customer : input.customer
    const customerId = (isNew ? newCustomerId : invoice?.customer) ?? ''
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
    const sourceLinesQuery = useLiveQuery({
        query: q => {
            if (!sourceLinesId) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.invoice, sourceLinesId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.invoice.source-lines', sourceLinesId],
    })
    // The read view's tax line comes from the posting snapshot. Not read while the form
    // holds a post: the optimistic `posted` status would start the read, and the form
    // would give way to the loading state before a refusal could land on it.
    const status = invoiceQuery.data?.status ?? null
    const isReadStatus = status === 'posted' || status === 'void'
    const taxLines = useInvoiceTaxLines(isReadStatus && !isHeld ? id : '')
    const isReady =
        access.isReady &&
        settings.isReady &&
        taxOptions.isReady &&
        taxLines.isReady &&
        readyOrIdle(id, invoiceQuery) &&
        readyOrIdle(id, linesQuery) &&
        readyOrIdle(customerId, customerQuery) &&
        readyOrIdle(sourceId, sourceQuery) &&
        readyOrIdle(sourceLinesId, sourceLinesQuery)
    const isError =
        access.isError ||
        settings.hasLoadError ||
        taxOptions.isError ||
        taxLines.isError ||
        invoiceQuery.isError ||
        linesQuery.isError ||
        customerQuery.isError ||
        sourceQuery.isError ||
        sourceLinesQuery.isError
    const sourceStatus = source?.status ?? null
    const copyCustomer = customerQuery.data
    // A copy whose customer cannot be read has no values to start from: not found.
    const copyStatus = copyCustomer ? sourceStatus : null
    const state = invoiceScreenState({
        isReady,
        isError,
        canWrite: access.canWrite,
        isNew,
        status,
        isHeld,
        replacesStatus: isNew && input.replaces ? sourceStatus : undefined,
        copyStatus: isNew && input.copy ? copyStatus : undefined,
    })
    const sourceLines = sourceLinesQuery.data
    // A new form's values when it corrects or copies an invoice. Memoised on the reads,
    // so the line ids stay the same between renders (the form seeds from them once).
    const startValues = useMemo(() => {
        if (!isNew || !source || !sourceLines) return undefined
        if (input.replaces) return correctionValues(source, sourceLines)
        if (input.copy && copyCustomer) {
            return copyInvoiceValues(source, sourceLines, todayIso(), copyCustomer)
        }
        return undefined
    }, [isNew, source, sourceLines, input.replaces, input.copy, copyCustomer])
    const isCorrection = Boolean(isNew ? input.replaces : invoice?.replaces)
    const replacesNumber = isCorrection ? (source?.number ?? '') : ''

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
    const sourceRecovery: LiveRecovery =
        sourceQuery.isError && sourceQuery.collection
            ? { queries: [sourceQuery.collection], sources: [invoicesCollection] }
            : NO_RECOVERY
    const sourceLinesRecovery: LiveRecovery =
        sourceLinesQuery.isError && sourceLinesQuery.collection
            ? { queries: [sourceLinesQuery.collection], sources: [linesCollection] }
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
                sourceRecovery,
                sourceLinesRecovery,
                taxLines.recovery,
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
        startValues,
        replacesNumber,
        taxLines: taxLines.rows,
        retry,
        canWrite: access.canWrite,
        currency: settings.settings?.currency ?? 'USD',
        formKey: id || `new:${input.fresh ?? ''}:${input.replaces ?? ''}:${input.copy ?? ''}`,
        taxOptions,
    }
}

export type InvoiceScreenData = ReturnType<typeof useInvoiceScreen>
