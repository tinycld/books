import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { TableRowWrite } from '@tinycld/core/lib/forms/table-rows'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { evictRows } from '@tinycld/core/lib/server-rows'
import { useRecord } from '@tinycld/core/lib/use-record'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import { DOCUMENT_LINE_MAPPER } from '../lib/document-line-columns'
import { type EMPTY_ESTIMATE_COLUMNS, estimateColumnsFrom } from '../lib/estimate-columns'
import { columnsOrThrow } from '../lib/record-save'
import { ESTIMATE_KIND } from '../lib/sales-document-kinds'
import type { BooksEstimates } from '../types'
import {
    type DocumentDataSource,
    type DocumentKindFields,
    type DocumentRecord,
    type DocumentScreenInput,
    type DocumentScreenReads,
    type DocumentSource,
    type DocumentWrites,
    documentRead,
    linkedReadIds,
    NO_RECOVERY,
    useHeldRecord,
} from './document-data'

const LOG_CONTEXT = 'books.estimate'

type EstimateInsertColumns = typeof EMPTY_ESTIMATE_COLUMNS

// The estimate's own columns go into `kindFields`; the row keeps the shared ones. An
// estimate never posts, so the shared posting columns (the journal entry, the posted
// and voided stamps, the correction links) are '' on it: every shared reader keeps its
// type, and none of them finds a posting on an estimate.
function estimateSourceOf<R extends BooksEstimates>(
    row: R
): R &
    Pick<DocumentSource, 'entry' | 'posted_at' | 'voided_at' | 'replaces' | 'replaced_by'> & {
        kindFields: Extract<DocumentKindFields, { kind: 'estimate' }>
    } {
    return {
        ...row,
        entry: '',
        posted_at: '',
        voided_at: '',
        replaces: '',
        replaced_by: '',
        kindFields: {
            kind: 'estimate',
            expiration_date: row.expiration_date,
            accepted_by: row.accepted_by,
            accepted_date: row.accepted_date,
            invoice: row.invoice,
        },
    }
}

// The estimate a copy starts from, as its own row.
function useEstimateSourceQuery(sourceId: string) {
    const [estimatesCollection] = useStore('books_estimates')
    return useLiveQuery({
        query: q => {
            if (!sourceId) return undefined
            return q
                .from({ source: estimatesCollection })
                .where(({ source }) => eq(source.id, sourceId))
                .findOne()
        },
        queryKey: ['books.estimate.source', sourceId],
    })
}

// The estimate a copy starts from: the row of the source query.
export type EstimateSourceRow = NonNullable<ReturnType<typeof useEstimateSourceQuery>['data']>

/**
 * The estimate's reads: the estimate with its tax rate (the read view's tax line names
 * it), its lines in order with their products, and the estimate a copy starts from with
 * its lines. An estimate never posts, so no one posted or voided it and it has no tax
 * lines: that read is ready and empty.
 */
function useEstimateScreenReads(
    input: DocumentScreenInput & { isHeld: boolean }
): DocumentScreenReads {
    const [estimatesCollection, linesCollection, productsCollection, taxRatesCollection] = useStore(
        'books_estimates',
        'books_estimate_lines',
        'books_products',
        'books_tax_rates'
    )
    const id = input.id ?? ''
    const estimateQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ estimate: estimatesCollection })
                .where(({ estimate }) => eq(estimate.id, id))
                .select(({ estimate }) => ({
                    ...estimate,
                    taxRateRow: materialize(
                        q
                            .from({ t: taxRatesCollection })
                            .where(({ t }) => eq(t.id, estimate.tax_rate))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.estimate', id],
    })
    // Each line with its product, which the read view names.
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.estimate, id))
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
        queryKey: ['books.estimate.lines', id],
    })
    const read = estimateQuery.data
    const mapped = useMemo<DocumentRecord | undefined>(
        () =>
            read
                ? { ...estimateSourceOf(read), postedBy: undefined, voidedBy: undefined }
                : undefined,
        [read]
    )
    const record = useHeldRecord(mapped, input.isHeld)
    const ids = linkedReadIds(input, record, read?.status ?? null, ESTIMATE_KIND.lifecycle)
    const sourceQuery = useEstimateSourceQuery(ids.sourceId)
    const sourceRow = sourceQuery.data
    const source = useMemo(() => (sourceRow ? estimateSourceOf(sourceRow) : undefined), [sourceRow])
    const sourceLinesQuery = useLiveQuery({
        query: q => {
            if (!ids.sourceLinesId) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.estimate, ids.sourceLinesId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.estimate.source-lines', ids.sourceLinesId],
    })
    return {
        record: documentRead(id, estimateQuery, record, [estimatesCollection]),
        lines: documentRead(id, linesQuery, linesQuery.data ?? [], [linesCollection]),
        source: documentRead(ids.sourceId, sourceQuery, source, [estimatesCollection]),
        sourceLines: documentRead(
            ids.sourceLinesId,
            sourceLinesQuery,
            sourceLinesQuery.data ?? [],
            [linesCollection]
        ),
        taxLines: NO_TAX_LINES,
        formStart: ESTIMATE_FORM_START,
    }
}

// An estimate never posts, so it has no tax snapshot to read.
const NO_TAX_LINES: DocumentScreenReads['taxLines'] = {
    data: [],
    isReady: true,
    isError: false,
    recovery: NO_RECOVERY,
}

// An estimate's form starts from the document alone: ready at once, never failed.
const ESTIMATE_FORM_START: DocumentScreenReads['formStart'] = {
    data: { start: { kind: 'estimate' }, deposit: undefined },
    isReady: true,
    isError: false,
    recovery: NO_RECOVERY,
}

// The estimate's writes: its row and its lines, whose insert names the estimate. The
// status is a column the form writes; a quote never posts or voids.
function useEstimateWrites(): DocumentWrites {
    const [estimatesCollection, linesCollection] = useStore(
        'books_estimates',
        'books_estimate_lines'
    )
    const lineRecord = (write: TableRowWrite) =>
        DOCUMENT_LINE_MAPPER.toRecord(write.row, write.position)
    return {
        // The columns were checked by estimateColumnsFrom before the save started and laid
        // over EMPTY_ESTIMATE_COLUMNS (DocumentKind.emptyColumns), so they hold every
        // column of that shape; the shared layer carries them untyped. A quote has no
        // correction, so `replaces` is never set and is not written.
        insertRecord: input =>
            estimatesCollection.insert({
                ...(input.columns as EstimateInsertColumns),
                id: input.id,
                form: input.form,
                fields: input.fields,
            }),
        updateRecord: (id, input) => {
            const columns = columnsOrThrow(estimateColumnsFrom, input.columns)
            return estimatesCollection.update(id, draft => {
                Object.assign(draft, columns)
                if (Object.keys(input.fields).length > 0) draft.fields = input.fields
            })
        },
        setStatus: () => {
            throw new Error('an estimate never posts or voids')
        },
        deleteRecord: id => estimatesCollection.delete(id),
        lineOps: estimateId => ({
            insert: write =>
                linesCollection.insert({
                    id: write.row.id,
                    estimate: estimateId,
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
function useEstimateVersion(id: string | undefined): string {
    const [estimatesCollection] = useStore('books_estimates')
    const { record } = useRecord(estimatesCollection, id)
    return record?.updated ?? ''
}

// The estimate kind's data source: every `useStore` of an estimate collection.
export const ESTIMATE_DATA: DocumentDataSource = {
    useScreenReads: useEstimateScreenReads,
    useWrites: useEstimateWrites,
    useVersion: useEstimateVersion,
}
