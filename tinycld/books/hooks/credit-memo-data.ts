import { eq, subtract } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { TableRowWrite } from '@tinycld/core/lib/forms/table-rows'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import { creditMemoColumnsFrom, type EMPTY_CREDIT_MEMO_COLUMNS } from '../lib/credit-memo-columns'
import { columnsOrThrow } from '../lib/record-save'
import { CREDIT_MEMO_KIND } from '../lib/sales-document-kinds'
import type { BooksCreditMemos } from '../types'
import {
    type DocumentDataSource,
    type DocumentKindFields,
    type DocumentRecord,
    type DocumentScreenInput,
    type DocumentScreenReads,
    type DocumentWrites,
    documentRead,
    linkedReadIds,
    NO_DOCUMENT_PAYMENTS,
    NO_ESTIMATE_SOURCE,
    NO_RECOVERY,
    salesLineMapperOf,
    useHeldRecord,
} from './document-data'
import { customerPartyRead } from './party-read'

type CreditMemoInsertColumns = typeof EMPTY_CREDIT_MEMO_COLUMNS

// The credit memo's own columns go into `kindFields`; the row keeps the shared ones.
function creditMemoSourceOf<R extends BooksCreditMemos>(
    row: R
): R & { kindFields: Extract<DocumentKindFields, { kind: 'credit_memo' }> } {
    return {
        ...row,
        kindFields: { kind: 'credit_memo', invoice: row.invoice },
    }
}

/**
 * The invoice a credit memo is made from (`?invoice=<id>`), or that a new correction of a
 * linked memo keeps, and its lines in position order, for the credit memo's data source:
 * this module holds the invoice collections' `useStore` for it. Both reads are idle
 * (ready and empty) with no id.
 */
export function useInvoiceSourceReads(
    invoiceId: string
): Pick<DocumentScreenReads, 'invoiceSource' | 'invoiceSourceLines'> {
    const [invoicesCollection, linesCollection] = useStore('books_invoices', 'books_invoice_lines')
    const sourceQuery = useLiveQuery({
        query: q => {
            if (!invoiceId) return undefined
            return q
                .from({ invoice: invoicesCollection })
                .where(({ invoice }) => eq(invoice.id, invoiceId))
                .findOne()
        },
        queryKey: ['books.creditMemo.invoice', invoiceId],
    })
    const linesQuery = useLiveQuery({
        query: q => {
            if (!invoiceId) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.invoice, invoiceId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.creditMemo.invoice-lines', invoiceId],
    })
    return {
        invoiceSource: documentRead(invoiceId, sourceQuery, sourceQuery.data, [invoicesCollection]),
        invoiceSourceLines: documentRead(invoiceId, linesQuery, linesQuery.data ?? [], [
            linesCollection,
        ]),
    }
}

/**
 * The credit memo's reads: the memo with the people who posted and voided it, its tax
 * rate and the invoice it is for, its lines in order with their products, the memo a
 * correction replaces or a copy starts from with its lines, the invoice a new memo is
 * made from (`?invoice`, or the one a new correction keeps) with its lines, and the tax
 * lines of a posted or void memo.
 */
function useCreditMemoScreenReads(
    input: DocumentScreenInput & { isHeld: boolean }
): DocumentScreenReads {
    const [memosCollection, linesCollection, usersCollection, productsCollection] = useStore(
        'books_credit_memos',
        'books_credit_memo_lines',
        'users',
        'books_products'
    )
    const [taxRatesCollection, taxLinesCollection, invoicesCollection] = useStore(
        'books_tax_rates',
        'books_credit_memo_tax_lines',
        'books_invoices'
    )
    const id = input.id ?? ''
    const memoQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ memo: memosCollection })
                .where(({ memo }) => eq(memo.id, id))
                .select(({ memo }) => ({
                    ...memo,
                    postedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, memo.posted_by))
                            .findOne()
                    ),
                    voidedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, memo.voided_by))
                            .findOne()
                    ),
                    // The read view's tax line names it.
                    taxRateRow: materialize(
                        q
                            .from({ t: taxRatesCollection })
                            .where(({ t }) => eq(t.id, memo.tax_rate))
                            .findOne()
                    ),
                    // "For invoice <n>" names it, with "(void)" when it is void.
                    invoiceRow: materialize(
                        q
                            .from({ i: invoicesCollection })
                            .where(({ i }) => eq(i.id, memo.invoice))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.creditMemo', id],
    })
    // Each line with its product, which the read view names.
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.credit_memo, id))
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
        queryKey: ['books.creditMemo.lines', id],
    })
    const read = memoQuery.data
    const mapped = useMemo<DocumentRecord | undefined>(() => {
        if (!read) return undefined
        const { invoiceRow, ...row } = read
        const source = creditMemoSourceOf(row)
        return {
            ...source,
            kindFields: { ...source.kindFields, invoiceRow, balance: row.balance },
        }
    }, [read])
    const record = useHeldRecord(mapped, input.isHeld)
    const ids = linkedReadIds(input, record, read?.status ?? null, CREDIT_MEMO_KIND.lifecycle)
    const sourceQuery = useLiveQuery({
        query: q => {
            if (!ids.sourceId) return undefined
            return q
                .from({ source: memosCollection })
                .where(({ source }) => eq(source.id, ids.sourceId))
                .findOne()
        },
        queryKey: ['books.creditMemo.source', ids.sourceId],
    })
    const sourceRow = sourceQuery.data
    const source = useMemo(
        () => (sourceRow ? creditMemoSourceOf(sourceRow) : undefined),
        [sourceRow]
    )
    // Only a new form reads it: the invoice it is made from (`?invoice`), or, on a new
    // correction, the one the posted memo names (the correction keeps the link, and the
    // link row names its number). A stored memo names its invoice through `invoiceRow`.
    const correctedInvoice = input.replaces ? (sourceRow?.invoice ?? '') : ''
    const invoiceReads = useInvoiceSourceReads(
        input.id === null ? input.invoice || correctedInvoice : ''
    )
    const sourceLinesQuery = useLiveQuery({
        query: q => {
            if (!ids.sourceLinesId) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.credit_memo, ids.sourceLinesId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.creditMemo.source-lines', ids.sourceLinesId],
    })
    // The tax lines the server wrote when the memo was posted (the tax-rates snapshot), in
    // position order: a rate changed after posting does not change a posted memo. The
    // snapshot stores a credit kind's `amount` negated; the read view shows the memo's own
    // (positive) figures, as its totals and PDF do, so the sign is turned back here.
    const taxLinesQuery = useLiveQuery({
        query: q => {
            if (!ids.postedReadsId) return undefined
            return q
                .from({ line: taxLinesCollection })
                .where(({ line }) => eq(line.credit_memo, ids.postedReadsId))
                .orderBy(({ line }) => line.position)
                .select(({ line }) => ({
                    id: line.id,
                    rate_ppm: line.rate_ppm,
                    amount: subtract(0, line.amount),
                }))
        },
        queryKey: ['books.creditMemo.taxLines', ids.postedReadsId],
    })
    return {
        record: documentRead(id, memoQuery, record, [
            memosCollection,
            usersCollection,
            invoicesCollection,
        ]),
        lines: documentRead(id, linesQuery, linesQuery.data ?? [], [linesCollection]),
        source: documentRead(ids.sourceId, sourceQuery, source, [memosCollection]),
        sourceLines: documentRead(
            ids.sourceLinesId,
            sourceLinesQuery,
            sourceLinesQuery.data ?? [],
            [linesCollection]
        ),
        // A credit memo is never made from an estimate, and no payment is applied to it.
        ...NO_ESTIMATE_SOURCE,
        ...invoiceReads,
        ...NO_DOCUMENT_PAYMENTS,
        taxLines: documentRead(ids.postedReadsId, taxLinesQuery, taxLinesQuery.data ?? [], [
            taxLinesCollection,
        ]),
        formStart: CREDIT_MEMO_FORM_START,
    }
}

// A credit memo's form starts from the document alone: ready at once, never failed.
const CREDIT_MEMO_FORM_START: DocumentScreenReads['formStart'] = {
    data: { start: { kind: 'credit_memo' }, deposit: undefined },
    isReady: true,
    isError: false,
    recovery: NO_RECOVERY,
}

// The credit memo's writes: its row and its lines, whose insert names the memo.
function useCreditMemoWrites(): DocumentWrites {
    const [memosCollection, linesCollection] = useStore(
        'books_credit_memos',
        'books_credit_memo_lines'
    )
    return {
        // The columns were checked by creditMemoColumnsFrom before the save started and
        // laid over EMPTY_CREDIT_MEMO_COLUMNS (DocumentKind.emptyColumns), so they hold
        // every column of that shape, `invoice` included (the invoice the memo is for,
        // else ''); the shared layer carries them untyped.
        insertRecord: input =>
            memosCollection.insert({
                ...(input.columns as CreditMemoInsertColumns),
                replaces: input.replaces,
                id: input.id,
                form: input.form,
                fields: input.fields,
            }),
        updateRecord: (id, input) => {
            const columns = columnsOrThrow(creditMemoColumnsFrom, input.columns)
            return memosCollection.update(id, draft => {
                Object.assign(draft, columns)
                if (Object.keys(input.fields).length > 0) draft.fields = input.fields
                draft.revision = input.revision
                if (input.post) draft.status = 'posted'
            })
        },
        postRecord: (id, revision) =>
            memosCollection.update(id, draft => {
                draft.status = 'posted'
                draft.revision = revision
            }),
        storedRevision: id => memosCollection.get(id)?.revision,
        lineOps: (memoId, mapper) => {
            const { toRecord } = salesLineMapperOf(mapper)
            const lineRecord = (write: TableRowWrite) => toRecord(write.row, write.position)
            return {
                insert: write =>
                    linesCollection.insert({
                        id: write.row.id,
                        credit_memo: memoId,
                        ...lineRecord(write),
                    }),
                update: write =>
                    linesCollection.update(write.row.id, draft => {
                        Object.assign(draft, lineRecord(write))
                    }),
                remove: lineId => linesCollection.delete(lineId),
            }
        },
    }
}

// The row is the one the screen or the save already holds, so this sends no request.
function useCreditMemoVersion(id: string | undefined): string {
    const [memosCollection] = useStore('books_credit_memos')
    const { record } = useRecord(memosCollection, id)
    return record?.updated ?? ''
}

function useCreditMemoReload(): () => Promise<void> {
    const [memosCollection, linesCollection] = useStore(
        'books_credit_memos',
        'books_credit_memo_lines'
    )
    return async () => {
        await Promise.all([memosCollection.reload(), linesCollection.reload()])
    }
}

// The credit memo kind's data source: every `useStore` of a credit memo collection.
export const CREDIT_MEMO_DATA: DocumentDataSource = {
    useScreenReads: useCreditMemoScreenReads,
    useParty: customerPartyRead(`books.${CREDIT_MEMO_KIND.key}`),
    useWrites: useCreditMemoWrites,
    useVersion: useCreditMemoVersion,
    useReload: useCreditMemoReload,
}
