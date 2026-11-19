import { eq, subtract } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { TableRowWrite } from '@tinycld/core/lib/forms/table-rows'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import type { LinkSource } from '../lib/document-source-links'
import { mergeRecoveries } from '../lib/live-recovery'
import { columnsOrThrow } from '../lib/record-save'
import {
    type EMPTY_REFUND_RECEIPT_COLUMNS,
    refundReceiptColumnsFrom,
} from '../lib/refund-receipt-columns'
import { refundFromStart } from '../lib/refund-receipt-values'
import { REFUND_RECEIPT_KIND } from '../lib/sales-document-kinds'
import type { BooksRefundReceipts } from '../types'
import {
    type DocumentDataSource,
    type DocumentFormStart,
    type DocumentRecord,
    type DocumentScreenInput,
    type DocumentScreenReads,
    type DocumentSource,
    type DocumentWrites,
    documentRead,
    linkedReadIds,
    NO_DOCUMENT_PAYMENTS,
    NO_ESTIMATE_SOURCE,
    type RefundReceiptKindFields,
    salesLineMapperOf,
    useHeldRecord,
} from './document-data'
import { customerPartyRead } from './party-read'
import { useDepositAccounts } from './useDepositAccounts'
import { usePaidFromAccounts } from './usePaidFromAccounts'

type RefundReceiptInsertColumns = typeof EMPTY_REFUND_RECEIPT_COLUMNS

/**
 * The source a refund's new form is made from: the sales receipt it refunds
 * (`?sales_receipt`) or the credit memo it pays out (`?credit_memo`; it wins when both are
 * given), or the one a new correction keeps, with its lines in position order. This module
 * holds the source collections' `useStore` for the refund's data source. Each read is idle
 * (ready and empty) with no id; a failed read is the screen's load error, and its recovery
 * joins the screen's one Retry (documentRead).
 */
export function useRefundSourceReads(input: {
    salesReceipt: string
    creditMemo: string
}): Pick<DocumentScreenReads, 'linkSource' | 'linkSourceLines'> {
    const [receiptsCollection, receiptLinesCollection, memosCollection, memoLinesCollection] =
        useStore(
            'books_sales_receipts',
            'books_sales_receipt_lines',
            'books_credit_memos',
            'books_credit_memo_lines'
        )
    const memoId = input.creditMemo
    const receiptId = memoId ? '' : input.salesReceipt
    const receiptQuery = useLiveQuery({
        query: q => {
            if (!receiptId) return undefined
            return q
                .from({ receipt: receiptsCollection })
                .where(({ receipt }) => eq(receipt.id, receiptId))
                .findOne()
        },
        queryKey: ['books.refundReceipt.salesReceipt', receiptId],
    })
    const receiptLinesQuery = useLiveQuery({
        query: q => {
            if (!receiptId) return undefined
            return q
                .from({ line: receiptLinesCollection })
                .where(({ line }) => eq(line.sales_receipt, receiptId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.refundReceipt.salesReceipt-lines', receiptId],
    })
    const memoQuery = useLiveQuery({
        query: q => {
            if (!memoId) return undefined
            return q
                .from({ memo: memosCollection })
                .where(({ memo }) => eq(memo.id, memoId))
                .findOne()
        },
        queryKey: ['books.refundReceipt.creditMemo', memoId],
    })
    const memoLinesQuery = useLiveQuery({
        query: q => {
            if (!memoId) return undefined
            return q
                .from({ line: memoLinesCollection })
                .where(({ line }) => eq(line.credit_memo, memoId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.refundReceipt.creditMemo-lines', memoId],
    })
    const receipt = receiptQuery.data
    const memo = memoQuery.data
    const linkSource = useMemo<LinkSource | undefined>(() => {
        if (memoId) return memo ? { key: 'credit_memo', row: memo } : undefined
        return receipt ? { key: 'sales_receipt', row: receipt } : undefined
    }, [memoId, memo, receipt])
    if (memoId) {
        return {
            linkSource: documentRead(memoId, memoQuery, linkSource, [memosCollection]),
            linkSourceLines: documentRead(memoId, memoLinesQuery, memoLinesQuery.data ?? [], [
                memoLinesCollection,
            ]),
        }
    }
    return {
        linkSource: documentRead(receiptId, receiptQuery, linkSource, [receiptsCollection]),
        linkSourceLines: documentRead(receiptId, receiptLinesQuery, receiptLinesQuery.data ?? [], [
            receiptLinesCollection,
        ]),
    }
}

// The total of the posted payout a correction replaces, in cents: the memo's unapplied
// credit the correction is held to is the memo's balance plus it (the server gives the
// original's credit back first, server/refund_receipt_payout.go). 0 when the form corrects
// no payout (a new form, a copy, a correction of a plain refund).
function replacedPayoutOf(
    input: DocumentScreenInput,
    record: DocumentRecord | undefined,
    sourceRow: BooksRefundReceipts | undefined
): number {
    const replacedId = input.id === null ? (input.replaces ?? '') : (record?.replaces ?? '')
    if (!sourceRow || replacedId === '' || sourceRow.id !== replacedId) return 0
    return sourceRow.credit_memo === '' ? 0 : sourceRow.total
}

// The refund's own columns go into `kindFields`; the row keeps the shared ones.
function refundReceiptSourceOf<R extends BooksRefundReceipts>(
    row: R
): R & DocumentSource & { kindFields: RefundReceiptKindFields } {
    return {
        ...row,
        kindFields: {
            kind: 'refund_receipt',
            payment_method: row.payment_method,
            reference_no: row.reference_no,
            refund_from: row.refund_from,
            sales_receipt: row.sales_receipt,
            credit_memo: row.credit_memo,
        },
    }
}

/**
 * The refund receipt's reads: the refund with the people who posted and voided it, its
 * tax rate, its Refund from account and the sales receipt or credit memo it refunds, its
 * lines in order with their products, the refund a correction replaces or a copy starts
 * from with its lines, the tax lines of a posted or void refund, and the chart Refund
 * from offers.
 */
function useRefundReceiptScreenReads(
    input: DocumentScreenInput & { isHeld: boolean }
): DocumentScreenReads {
    const [refundsCollection, linesCollection, usersCollection, productsCollection] = useStore(
        'books_refund_receipts',
        'books_refund_receipt_lines',
        'users',
        'books_products'
    )
    const [taxRatesCollection, taxLinesCollection, accountsCollection] = useStore(
        'books_tax_rates',
        'books_refund_receipt_tax_lines',
        'books_accounts'
    )
    const [receiptsCollection, memosCollection] = useStore(
        'books_sales_receipts',
        'books_credit_memos'
    )
    const id = input.id ?? ''
    const refundQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ refund: refundsCollection })
                .where(({ refund }) => eq(refund.id, id))
                .select(({ refund }) => ({
                    ...refund,
                    postedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, refund.posted_by))
                            .findOne()
                    ),
                    voidedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, refund.voided_by))
                            .findOne()
                    ),
                    // The read view's tax line names it.
                    taxRateRow: materialize(
                        q
                            .from({ t: taxRatesCollection })
                            .where(({ t }) => eq(t.id, refund.tax_rate))
                            .findOne()
                    ),
                    // The read view's payment line names it, inactive or not.
                    refundFromRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, refund.refund_from))
                            .findOne()
                    ),
                    // The link row names the source it refunds, with its status.
                    salesReceiptRow: materialize(
                        q
                            .from({ s: receiptsCollection })
                            .where(({ s }) => eq(s.id, refund.sales_receipt))
                            .findOne()
                    ),
                    creditMemoRow: materialize(
                        q
                            .from({ m: memosCollection })
                            .where(({ m }) => eq(m.id, refund.credit_memo))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.refundReceipt', id],
    })
    // Each line with its product, which the read view names.
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.refund_receipt, id))
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
        queryKey: ['books.refundReceipt.lines', id],
    })
    const read = refundQuery.data
    const mapped = useMemo<DocumentRecord | undefined>(() => {
        if (!read) return undefined
        const { refundFromRow, salesReceiptRow, creditMemoRow, ...row } = read
        const source = refundReceiptSourceOf(row)
        return {
            ...source,
            kindFields: { ...source.kindFields, refundFromRow, salesReceiptRow, creditMemoRow },
        }
    }, [read])
    const record = useHeldRecord(mapped, input.isHeld)
    const ids = linkedReadIds(input, record, read?.status ?? null, REFUND_RECEIPT_KIND.lifecycle)
    const sourceQuery = useLiveQuery({
        query: q => {
            if (!ids.sourceId) return undefined
            return q
                .from({ source: refundsCollection })
                .where(({ source }) => eq(source.id, ids.sourceId))
                .findOne()
        },
        queryKey: ['books.refundReceipt.source', ids.sourceId],
    })
    const sourceRow = sourceQuery.data
    const source = useMemo(
        () => (sourceRow ? refundReceiptSourceOf(sourceRow) : undefined),
        [sourceRow]
    )
    const sourceLinesQuery = useLiveQuery({
        query: q => {
            if (!ids.sourceLinesId) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.refund_receipt, ids.sourceLinesId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.refundReceipt.source-lines', ids.sourceLinesId],
    })
    // The tax lines the server wrote when the refund was posted (the tax-rates snapshot),
    // in position order: a rate changed after posting does not change it. The snapshot
    // stores a refund's `amount` negated (server/refund_receipts.go); the read view shows
    // the refund's own (positive) figures, as its totals and PDF do, so the sign is turned
    // back here.
    const taxLinesQuery = useLiveQuery({
        query: q => {
            if (!ids.postedReadsId) return undefined
            return q
                .from({ line: taxLinesCollection })
                .where(({ line }) => eq(line.refund_receipt, ids.postedReadsId))
                .orderBy(({ line }) => line.position)
                .select(({ line }) => ({
                    id: line.id,
                    rate_ppm: line.rate_ppm,
                    amount: subtract(0, line.amount),
                }))
        },
        queryKey: ['books.refundReceipt.taxLines', ids.postedReadsId],
    })
    // Only a new form reads it: the source it is made from (`?sales_receipt`,
    // `?credit_memo`), or, on a new correction, the one the posted refund names (the
    // correction keeps the link, and the link row names it). A stored refund names its
    // source through `salesReceiptRow` / `creditMemoRow`.
    const isNew = input.id === null
    const corrected = isNew && input.replaces ? sourceRow : undefined
    const sourceReads = useRefundSourceReads({
        salesReceipt: isNew ? input.salesReceipt || (corrected?.sales_receipt ?? '') : '',
        creditMemo: isNew ? input.creditMemo || (corrected?.credit_memo ?? '') : '',
    })
    const formStart = useRefundReceiptFormStart(replacedPayoutOf(input, record, sourceRow))
    return {
        record: documentRead(id, refundQuery, record, [
            refundsCollection,
            usersCollection,
            accountsCollection,
            receiptsCollection,
            memosCollection,
        ]),
        lines: documentRead(id, linesQuery, linesQuery.data ?? [], [linesCollection]),
        source: documentRead(ids.sourceId, sourceQuery, source, [refundsCollection]),
        sourceLines: documentRead(
            ids.sourceLinesId,
            sourceLinesQuery,
            sourceLinesQuery.data ?? [],
            [linesCollection]
        ),
        // A refund is never made from an estimate, and no payment is applied to it.
        ...NO_ESTIMATE_SOURCE,
        ...sourceReads,
        ...NO_DOCUMENT_PAYMENTS,
        taxLines: documentRead(ids.postedReadsId, taxLinesQuery, taxLinesQuery.data ?? [], [
            taxLinesCollection,
        ]),
        formStart,
    }
}

/**
 * What a refund form starts from besides the refund: the chart's refund accounts choose a
 * new form's and a copy's Refund from (refundFromStart; no Books setting applies, so the
 * field always shows and the schema requires it, with the no-account text when the chart
 * offers none). The posted balances (usePaidFromAccounts) are read here too, so the
 * Balance line under Refund from never waits on a read of its own: a failed read of
 * either shows the screen's load error, whose Retry runs both reads again.
 * `replacedPayout` is the total of the payout a correction replaces (replacedPayoutOf),
 * which the payout's cap adds to the memo's balance.
 */
function useRefundReceiptFormStart(replacedPayout: number): DocumentScreenReads['formStart'] {
    const deposit = useDepositAccounts()
    const balances = usePaidFromAccounts()
    const { rows } = deposit
    const data = useMemo<DocumentFormStart>(() => {
        const refundFrom = refundFromStart(rows)
        return {
            start: { kind: 'refund_receipt', refundFrom, replacedPayout },
            deposit: {
                hasOptions: refundFrom.activeIds.size > 0,
                hidden: false,
                field: 'refund_from',
            },
        }
    }, [rows, replacedPayout])
    return {
        data,
        isReady: deposit.isReady && balances.isReady,
        isError: deposit.isError || balances.isError,
        recovery: mergeRecoveries([deposit.recovery, balances.recovery]),
    }
}

// The refund's writes: its row and its lines, whose insert names the refund.
function useRefundReceiptWrites(): DocumentWrites {
    const [refundsCollection, linesCollection] = useStore(
        'books_refund_receipts',
        'books_refund_receipt_lines'
    )
    return {
        // The columns were checked by refundReceiptColumnsFrom before the save started and
        // laid over EMPTY_REFUND_RECEIPT_COLUMNS (DocumentKind.emptyColumns), so they hold
        // every column of that shape; the shared layer carries them untyped.
        insertRecord: input =>
            refundsCollection.insert({
                ...(input.columns as RefundReceiptInsertColumns),
                replaces: input.replaces,
                id: input.id,
                form: input.form,
                fields: input.fields,
            }),
        updateRecord: (id, input) => {
            const columns = columnsOrThrow(refundReceiptColumnsFrom, input.columns)
            return refundsCollection.update(id, draft => {
                Object.assign(draft, columns)
                if (Object.keys(input.fields).length > 0) draft.fields = input.fields
                draft.revision = input.revision
                if (input.post) draft.status = 'posted'
            })
        },
        postRecord: (id, revision) =>
            refundsCollection.update(id, draft => {
                draft.status = 'posted'
                draft.revision = revision
            }),
        storedRevision: id => refundsCollection.get(id)?.revision,
        lineOps: (refundId, mapper) => {
            const { toRecord } = salesLineMapperOf(mapper)
            const lineRecord = (write: TableRowWrite) => toRecord(write.row, write.position)
            return {
                insert: write =>
                    linesCollection.insert({
                        id: write.row.id,
                        refund_receipt: refundId,
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
function useRefundReceiptVersion(id: string | undefined): string {
    const [refundsCollection] = useStore('books_refund_receipts')
    const { record } = useRecord(refundsCollection, id)
    return record?.updated ?? ''
}

function useRefundReceiptReload(): () => Promise<void> {
    const [refundsCollection, linesCollection] = useStore(
        'books_refund_receipts',
        'books_refund_receipt_lines'
    )
    return async () => {
        await Promise.all([refundsCollection.reload(), linesCollection.reload()])
    }
}

// The refund receipt kind's data source: every `useStore` of a refund receipt collection.
export const REFUND_RECEIPT_DATA: DocumentDataSource = {
    useScreenReads: useRefundReceiptScreenReads,
    useParty: customerPartyRead(`books.${REFUND_RECEIPT_KIND.key}`),
    useWrites: useRefundReceiptWrites,
    useVersion: useRefundReceiptVersion,
    useReload: useRefundReceiptReload,
}
