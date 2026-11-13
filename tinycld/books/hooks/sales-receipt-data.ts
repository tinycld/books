import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { TableRowWrite } from '@tinycld/core/lib/forms/table-rows'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { evictRows } from '@tinycld/core/lib/server-rows'
import { useRecord } from '@tinycld/core/lib/use-record'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import { defaultDepositAccount, isDepositAccountRow } from '../lib/deposit-accounts'
import { DOCUMENT_LINE_MAPPER } from '../lib/document-line-columns'
import { SALES_RECEIPT_MESSAGES } from '../lib/document-texts'
import { columnsOrThrow } from '../lib/record-save'
import { SALES_RECEIPT_KIND } from '../lib/sales-document-kinds'
import {
    type EMPTY_SALES_RECEIPT_COLUMNS,
    salesReceiptColumnsFrom,
} from '../lib/sales-receipt-columns'
import { depositShown } from '../lib/sales-settings'
import type { BooksSalesReceipts } from '../types'
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
    useHeldRecord,
} from './document-data'
import { useBooksSettings } from './useBooksSettings'
import { useDepositAccounts } from './useDepositAccounts'

const LOG_CONTEXT = 'books.salesReceipt'

type SalesReceiptInsertColumns = typeof EMPTY_SALES_RECEIPT_COLUMNS

// The receipt's own columns go into `kindFields`; the row keeps the shared ones.
function salesReceiptSourceOf<R extends BooksSalesReceipts>(row: R): R & DocumentSource {
    return {
        ...row,
        kindFields: {
            kind: 'sales_receipt',
            payment_method: row.payment_method,
            reference_no: row.reference_no,
            deposit_to: row.deposit_to,
        },
    }
}

/**
 * The sales receipt's reads: the receipt with the people who posted and voided it, its
 * tax rate and its deposit account, its lines in order with their products, the receipt
 * a correction replaces or a copy starts from with its lines, the tax lines of a posted
 * or void receipt, and the chart Deposit to offers.
 */
function useSalesReceiptScreenReads(
    input: DocumentScreenInput & { isHeld: boolean }
): DocumentScreenReads {
    const [receiptsCollection, linesCollection, usersCollection, productsCollection] = useStore(
        'books_sales_receipts',
        'books_sales_receipt_lines',
        'users',
        'books_products'
    )
    const [taxRatesCollection, taxLinesCollection, accountsCollection] = useStore(
        'books_tax_rates',
        'books_sales_receipt_tax_lines',
        'books_accounts'
    )
    const id = input.id ?? ''
    const receiptQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ receipt: receiptsCollection })
                .where(({ receipt }) => eq(receipt.id, id))
                .select(({ receipt }) => ({
                    ...receipt,
                    postedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, receipt.posted_by))
                            .findOne()
                    ),
                    voidedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, receipt.voided_by))
                            .findOne()
                    ),
                    // The read view's tax line names it.
                    taxRateRow: materialize(
                        q
                            .from({ t: taxRatesCollection })
                            .where(({ t }) => eq(t.id, receipt.tax_rate))
                            .findOne()
                    ),
                    // The read view's payment line names it, inactive or not.
                    depositRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, receipt.deposit_to))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.salesReceipt', id],
    })
    // Each line with its product, which the read view names.
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.sales_receipt, id))
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
        queryKey: ['books.salesReceipt.lines', id],
    })
    const read = receiptQuery.data
    const mapped = useMemo<DocumentRecord | undefined>(() => {
        if (!read) return undefined
        const { depositRow, ...row } = read
        const source = salesReceiptSourceOf(row)
        return { ...source, kindFields: { ...source.kindFields, depositRow } }
    }, [read])
    const record = useHeldRecord(mapped, input.isHeld)
    const ids = linkedReadIds(input, record, read?.status ?? null, SALES_RECEIPT_KIND.lifecycle)
    const sourceQuery = useLiveQuery({
        query: q => {
            if (!ids.sourceId) return undefined
            return q
                .from({ source: receiptsCollection })
                .where(({ source }) => eq(source.id, ids.sourceId))
                .findOne()
        },
        queryKey: ['books.salesReceipt.source', ids.sourceId],
    })
    const sourceRow = sourceQuery.data
    const source = useMemo(
        () => (sourceRow ? salesReceiptSourceOf(sourceRow) : undefined),
        [sourceRow]
    )
    const sourceLinesQuery = useLiveQuery({
        query: q => {
            if (!ids.sourceLinesId) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.sales_receipt, ids.sourceLinesId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.salesReceipt.source-lines', ids.sourceLinesId],
    })
    // The tax lines the server wrote when the receipt was posted (the tax-rates
    // snapshot), in position order: a rate changed after posting does not change it.
    const taxLinesQuery = useLiveQuery({
        query: q => {
            if (!ids.taxLinesId) return undefined
            return q
                .from({ line: taxLinesCollection })
                .where(({ line }) => eq(line.sales_receipt, ids.taxLinesId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.salesReceipt.taxLines', ids.taxLinesId],
    })
    const formStart = useSalesReceiptFormStart()
    return {
        record: documentRead(id, receiptQuery, record, [
            receiptsCollection,
            usersCollection,
            accountsCollection,
        ]),
        lines: documentRead(id, linesQuery, linesQuery.data ?? [], [linesCollection]),
        source: documentRead(ids.sourceId, sourceQuery, source, [receiptsCollection]),
        sourceLines: documentRead(
            ids.sourceLinesId,
            sourceLinesQuery,
            sourceLinesQuery.data ?? [],
            [linesCollection]
        ),
        taxLines: documentRead(ids.taxLinesId, taxLinesQuery, taxLinesQuery.data ?? [], [
            taxLinesCollection,
        ]),
        formStart,
    }
}

/**
 * What a receipt form starts from besides the receipt: the chart's deposit accounts and
 * the account "Sales deposited to" names ('' for Ask) choose a new form's and a copy's
 * Deposit to. Deposit to is drawn, and the schema requires it, only with "Ask"
 * (`depositShown`, read live, so the field shows or hides at once), with the no-account
 * text when the chart offers none. The settings row is the screen's own read (its
 * readiness and Retry are there).
 */
function useSalesReceiptFormStart(): DocumentScreenReads['formStart'] {
    const deposit = useDepositAccounts()
    const { settings } = useBooksSettings()
    const setAccount = settings?.sales_deposit_account ?? ''
    const isHidden = !depositShown(settings)
    const { rows } = deposit
    const data = useMemo<DocumentFormStart>(() => {
        const active = rows.filter(isDepositAccountRow)
        return {
            start: {
                kind: 'sales_receipt',
                deposit: {
                    setAccount,
                    activeIds: new Set(active.map(account => account.id)),
                    defaultId: defaultDepositAccount(rows),
                },
            },
            deposit: { hasOptions: active.length > 0, hidden: isHidden },
        }
    }, [rows, setAccount, isHidden])
    return {
        data,
        isReady: deposit.isReady,
        isError: deposit.isError,
        recovery: deposit.recovery,
        errorText: SALES_RECEIPT_MESSAGES.depositLoadFailed,
    }
}

// The receipt's writes: its row and its lines, whose insert names the receipt.
function useSalesReceiptWrites(): DocumentWrites {
    const [receiptsCollection, linesCollection] = useStore(
        'books_sales_receipts',
        'books_sales_receipt_lines'
    )
    const lineRecord = (write: TableRowWrite) =>
        DOCUMENT_LINE_MAPPER.toRecord(write.row, write.position)
    return {
        // The columns were checked by salesReceiptColumnsFrom before the save started and
        // laid over EMPTY_SALES_RECEIPT_COLUMNS (DocumentKind.emptyColumns), so they hold
        // every column of that shape; the shared layer carries them untyped.
        insertRecord: input =>
            receiptsCollection.insert({
                ...(input.columns as SalesReceiptInsertColumns),
                replaces: input.replaces,
                id: input.id,
                form: input.form,
                fields: input.fields,
            }),
        updateRecord: (id, input) => {
            const columns = columnsOrThrow(salesReceiptColumnsFrom, input.columns)
            return receiptsCollection.update(id, draft => {
                Object.assign(draft, columns)
                if (Object.keys(input.fields).length > 0) draft.fields = input.fields
            })
        },
        setStatus: (id, status) =>
            receiptsCollection.update(id, draft => {
                draft.status = status
            }),
        deleteRecord: id => receiptsCollection.delete(id),
        lineOps: receiptId => ({
            insert: write =>
                linesCollection.insert({
                    id: write.row.id,
                    sales_receipt: receiptId,
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
function useSalesReceiptVersion(id: string | undefined): string {
    const [receiptsCollection] = useStore('books_sales_receipts')
    const { record } = useRecord(receiptsCollection, id)
    return record?.updated ?? ''
}

// The sales receipt kind's data source: every `useStore` of a sales receipt collection.
export const SALES_RECEIPT_DATA: DocumentDataSource = {
    useScreenReads: useSalesReceiptScreenReads,
    useWrites: useSalesReceiptWrites,
    useVersion: useSalesReceiptVersion,
}
