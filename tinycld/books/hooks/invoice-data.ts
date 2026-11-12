import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { TableRowWrite } from '@tinycld/core/lib/forms/table-rows'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { evictRows } from '@tinycld/core/lib/server-rows'
import { useRecord } from '@tinycld/core/lib/use-record'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import { DOCUMENT_LINE_MAPPER } from '../lib/document-line-columns'
import { type EMPTY_INVOICE_COLUMNS, invoiceColumnsFrom } from '../lib/invoice-columns'
import { columnsOrThrow } from '../lib/record-save'
import type { BooksInvoices } from '../types'
import {
    type DocumentDataSource,
    type DocumentRecord,
    type DocumentScreenInput,
    type DocumentScreenReads,
    type DocumentSource,
    type DocumentWrites,
    documentRead,
    linkedReadIds,
    useHeldRecord,
} from './document-data'

const LOG_CONTEXT = 'books.invoice'

type InvoiceInsertColumns = typeof EMPTY_INVOICE_COLUMNS

// The invoice's own columns go into `kindFields`; the row keeps the shared ones.
function invoiceSourceOf<R extends BooksInvoices>(row: R): R & DocumentSource {
    return { ...row, kindFields: { kind: 'invoice', terms: row.terms, due_date: row.due_date } }
}

/**
 * The invoice's reads: the invoice with the people who posted and voided it and its tax
 * rate, its lines in order with their products, the invoice a correction replaces or a
 * copy starts from with its lines, and the tax lines of a posted or void invoice.
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
    const [taxRatesCollection, taxLinesCollection] = useStore(
        'books_tax_rates',
        'books_invoice_tax_lines'
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
    const mapped = useMemo<DocumentRecord | undefined>(
        () => (read ? invoiceSourceOf(read) : undefined),
        [read]
    )
    const record = useHeldRecord(mapped, input.isHeld)
    const ids = linkedReadIds(input, record, read?.status ?? null)
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
        record: documentRead(id, invoiceQuery, record, [invoicesCollection, usersCollection]),
        lines: documentRead(id, linesQuery, linesQuery.data ?? [], [linesCollection]),
        source: documentRead(ids.sourceId, sourceQuery, source, [invoicesCollection]),
        sourceLines: documentRead(
            ids.sourceLinesId,
            sourceLinesQuery,
            sourceLinesQuery.data ?? [],
            [linesCollection]
        ),
        taxLines: documentRead(ids.taxLinesId, taxLinesQuery, taxLinesQuery.data ?? [], [
            taxLinesCollection,
        ]),
    }
}

// The invoice's writes: its row and its lines, whose insert names the invoice.
function useInvoiceWrites(): DocumentWrites {
    const [invoicesCollection, linesCollection] = useStore('books_invoices', 'books_invoice_lines')
    const lineRecord = (write: TableRowWrite) =>
        DOCUMENT_LINE_MAPPER.toRecord(write.row, write.position)
    return {
        // The columns were checked by invoiceColumnsFrom before the save started and laid
        // over EMPTY_INVOICE_COLUMNS (DocumentKind.emptyColumns), so they hold every
        // column of that shape; the shared layer carries them untyped.
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
        lineOps: invoiceId => ({
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
        }),
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
    useWrites: useInvoiceWrites,
    useVersion: useInvoiceVersion,
}
