import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { TableRowWrite } from '@tinycld/core/lib/forms/table-rows'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { evictRows } from '@tinycld/core/lib/server-rows'
import { useRecord } from '@tinycld/core/lib/use-record'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import { type EMPTY_INVOICE_COLUMNS, invoiceColumnsFrom } from '../lib/invoice-columns'
import { columnsOrThrow } from '../lib/record-save'
import { INVOICE_KIND } from '../lib/sales-document-kinds'
import type { BooksInvoices } from '../types'
import {
    type DocumentDataSource,
    type DocumentKindFields,
    type DocumentRecord,
    type DocumentScreenInput,
    type DocumentScreenReads,
    type DocumentWrites,
    documentRead,
    linkedReadIds,
    NO_RECOVERY,
    salesLineMapperOf,
    useHeldRecord,
} from './document-data'
import { useEstimateSourceReads } from './estimate-data'
import { customerPartyRead } from './party-read'

const LOG_CONTEXT = 'books.invoice'

type InvoiceInsertColumns = typeof EMPTY_INVOICE_COLUMNS

// The invoice's own columns go into `kindFields`; the row keeps the shared ones.
function invoiceSourceOf<R extends BooksInvoices>(
    row: R
): R & { kindFields: Extract<DocumentKindFields, { kind: 'invoice' }> } {
    return {
        ...row,
        kindFields: {
            kind: 'invoice',
            terms: row.terms,
            due_date: row.due_date,
            estimate: row.estimate,
        },
    }
}

/**
 * The invoice's reads: the invoice with the people who posted and voided it, its tax
 * rate and the estimate it was made from, its lines in order with their products, the
 * invoice a correction replaces or a copy starts from with its lines, the estimate a new
 * invoice is made from (`?estimate`) with its lines, and the tax lines of a posted or
 * void invoice.
 */
function useInvoiceScreenReads(
    input: DocumentScreenInput & { isHeld: boolean }
): DocumentScreenReads {
    const [invoicesCollection, linesCollection, usersCollection, productsCollection] = useStore(
        'books_invoices',
        'books_invoice_lines',
        'users',
        'books_products'
    )
    const [taxRatesCollection, taxLinesCollection, estimatesCollection] = useStore(
        'books_tax_rates',
        'books_invoice_tax_lines',
        'books_estimates'
    )
    const id = input.id ?? ''
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
                    // "From estimate <n>" names it.
                    estimateRow: materialize(
                        q
                            .from({ e: estimatesCollection })
                            .where(({ e }) => eq(e.id, invoice.estimate))
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
    const read = invoiceQuery.data
    const mapped = useMemo<DocumentRecord | undefined>(() => {
        if (!read) return undefined
        const { estimateRow, ...row } = read
        const source = invoiceSourceOf(row)
        return { ...source, kindFields: { ...source.kindFields, estimateRow } }
    }, [read])
    const record = useHeldRecord(mapped, input.isHeld)
    const ids = linkedReadIds(input, record, read?.status ?? null, INVOICE_KIND.lifecycle)
    const sourceQuery = useLiveQuery({
        query: q => {
            if (!ids.sourceId) return undefined
            return q
                .from({ source: invoicesCollection })
                .where(({ source }) => eq(source.id, ids.sourceId))
                .findOne()
        },
        queryKey: ['books.invoice.source', ids.sourceId],
    })
    const sourceRow = sourceQuery.data
    const source = useMemo(() => (sourceRow ? invoiceSourceOf(sourceRow) : undefined), [sourceRow])
    // Only a new form reads it: the estimate it is made from (`?estimate`), or, on a new
    // correction, the one the posted invoice was made from (the correction carries it, and
    // "From estimate <n>" names its number). A stored invoice names its estimate through
    // `estimateRow`.
    const correctedEstimate = input.replaces ? (sourceRow?.estimate ?? '') : ''
    const estimateReads = useEstimateSourceReads(
        input.id === null ? input.estimate || correctedEstimate : ''
    )
    const sourceLinesQuery = useLiveQuery({
        query: q => {
            if (!ids.sourceLinesId) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.invoice, ids.sourceLinesId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.invoice.source-lines', ids.sourceLinesId],
    })
    // The tax lines the server wrote when the invoice was posted (the tax-rates snapshot),
    // in position order: a rate changed after posting does not change a posted invoice.
    const taxLinesQuery = useLiveQuery({
        query: q => {
            if (!ids.taxLinesId) return undefined
            return q
                .from({ line: taxLinesCollection })
                .where(({ line }) => eq(line.invoice, ids.taxLinesId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.invoice.tax-lines', ids.taxLinesId],
    })
    return {
        record: documentRead(id, invoiceQuery, record, [
            invoicesCollection,
            usersCollection,
            estimatesCollection,
        ]),
        lines: documentRead(id, linesQuery, linesQuery.data ?? [], [linesCollection]),
        source: documentRead(ids.sourceId, sourceQuery, source, [invoicesCollection]),
        sourceLines: documentRead(
            ids.sourceLinesId,
            sourceLinesQuery,
            sourceLinesQuery.data ?? [],
            [linesCollection]
        ),
        ...estimateReads,
        taxLines: documentRead(ids.taxLinesId, taxLinesQuery, taxLinesQuery.data ?? [], [
            taxLinesCollection,
        ]),
        formStart: INVOICE_FORM_START,
    }
}

// An invoice's form starts from the document alone: ready at once, never failed.
const INVOICE_FORM_START: DocumentScreenReads['formStart'] = {
    data: { start: { kind: 'invoice' }, deposit: undefined },
    isReady: true,
    isError: false,
    recovery: NO_RECOVERY,
}

// The invoice's writes: its row and its lines, whose insert names the invoice.
function useInvoiceWrites(): DocumentWrites {
    const [invoicesCollection, linesCollection] = useStore('books_invoices', 'books_invoice_lines')
    return {
        // The columns were checked by invoiceColumnsFrom before the save started and laid
        // over EMPTY_INVOICE_COLUMNS (DocumentKind.emptyColumns), so they hold every
        // column of that shape, `estimate` included (the estimate an invoice from an
        // estimate is made from, else ''); the shared layer carries them untyped.
        insertRecord: input =>
            invoicesCollection.insert({
                ...(input.columns as InvoiceInsertColumns),
                replaces: input.replaces,
                id: input.id,
                form: input.form,
                fields: input.fields,
            }),
        updateRecord: (id, input) => {
            const columns = columnsOrThrow(invoiceColumnsFrom, input.columns)
            return invoicesCollection.update(id, draft => {
                Object.assign(draft, columns)
                if (Object.keys(input.fields).length > 0) draft.fields = input.fields
            })
        },
        setStatus: (id, status) =>
            invoicesCollection.update(id, draft => {
                draft.status = status
            }),
        deleteRecord: id => invoicesCollection.delete(id),
        lineOps: (invoiceId, mapper) => {
            const { toRecord } = salesLineMapperOf(mapper)
            const lineRecord = (write: TableRowWrite) => toRecord(write.row, write.position)
            return {
                insert: write =>
                    linesCollection.insert({
                        id: write.row.id,
                        invoice: invoiceId,
                        ...lineRecord(write),
                    }),
                update: write =>
                    linesCollection.update(write.row.id, draft => {
                        Object.assign(draft, lineRecord(write))
                    }),
                remove: lineId => linesCollection.delete(lineId),
            }
        },
        evictLines: ids => evictRows(linesCollection, ids, LOG_CONTEXT),
    }
}

// The row is the one the screen or the save already holds, so this sends no request.
function useInvoiceVersion(id: string | undefined): string {
    const [invoicesCollection] = useStore('books_invoices')
    const { record } = useRecord(invoicesCollection, id)
    return record?.updated ?? ''
}

// The invoice kind's data source: every `useStore` of an invoice collection.
export const INVOICE_DATA: DocumentDataSource = {
    useScreenReads: useInvoiceScreenReads,
    useParty: customerPartyRead(LOG_CONTEXT),
    useWrites: useInvoiceWrites,
    useVersion: useInvoiceVersion,
}
