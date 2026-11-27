import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { materialize } from 'pbtsdb'
import { useEffect, useMemo, useState } from 'react'
import { billColumnsFrom, type EMPTY_BILL_COLUMNS } from '../lib/bill-columns'
import type { CopyToBillChoice } from '../lib/copy-to-bill'
import type { LinkSource } from '../lib/document-source-links'
import { documentKey } from '../lib/record-key'
import { columnsOrThrow } from '../lib/record-save'
import { BILL_KIND } from '../lib/sales-document-kinds'
import { useCopyToBillStore } from '../stores/copy-to-bill-store'
import type { BooksBills } from '../types'
import {
    type DocumentDataSource,
    type DocumentFormStart,
    type DocumentKindFields,
    type DocumentRecord,
    type DocumentScreenInput,
    type DocumentScreenReads,
    type DocumentWrites,
    documentRead,
    linkedReadIds,
    NO_ESTIMATE_SOURCE,
    NO_LINK_SOURCE,
    postedPaymentsOf,
    useHeldRecord,
} from './document-data'
import { vendorPartyRead } from './party-read'
import {
    NO_PURCHASE_TAX_LINES,
    PURCHASE_SALES_COLUMNS,
    purchaseLineOps,
    usePurchaseStart,
} from './purchase-data'

const LOG_CONTEXT = 'books.bill'

type BillInsertColumns = typeof EMPTY_BILL_COLUMNS

// The bill's own columns go into `kindFields`; the row keeps the shared ones, with the
// sales columns a purchase does not have empty (PURCHASE_SALES_COLUMNS).
function billSourceOf<R extends BooksBills>(
    row: R
): R &
    typeof PURCHASE_SALES_COLUMNS & {
        kindFields: Extract<DocumentKindFields, { kind: 'bill' }>
    } {
    return {
        ...row,
        ...PURCHASE_SALES_COLUMNS,
        kindFields: {
            kind: 'bill',
            vendor: row.vendor,
            terms: row.terms,
            due_date: row.due_date,
            ref_no: row.ref_no,
            mailing_address: row.mailing_address,
            purchase_order: row.purchase_order,
        },
    }
}

// The Copy to bill choice for the order a new bill is made from (stores/copy-to-bill-store.ts),
// read once per order at the mount that starts from it, then taken from the store, so a
// reload or a later open of the same route starts from every open line (spec §3.7). Held
// here, so the form's start values do not change when the store is cleared.
function useTakenCopyChoice(orderId: string): CopyToBillChoice | undefined {
    const peek = (id: string) => (id ? useCopyToBillStore.getState().choices[id] : undefined)
    const [held, setHeld] = useState(() => ({ orderId, choice: peek(orderId) }))
    // React's "adjust state while rendering": another order on the same mount reads its own.
    if (held.orderId !== orderId) setHeld({ orderId, choice: peek(orderId) })
    useEffect(() => {
        if (orderId) useCopyToBillStore.getState().take(orderId)
    }, [orderId])
    return held.orderId === orderId ? held.choice : peek(orderId)
}

// The purchase order a new bill is made from (`?purchase_order`, purchase order spec §3.8),
// or that a new correction keeps: the order with its lines (one query), and the dialog's
// choice, taken only for the route's order (`isFromRoute`; a correction starts from the
// bill it replaces). Idle (ready and empty) on any other form.
function useBillOrderSource({
    orderId,
    isFromRoute,
}: {
    orderId: string
    isFromRoute: boolean
}): Pick<DocumentScreenReads, 'linkSource' | 'linkSourceLines'> {
    const [ordersCollection, orderLinesCollection] = useStore(
        'books_purchase_orders',
        'books_purchase_order_lines'
    )
    const orderQuery = useLiveQuery({
        query: q => {
            if (!orderId) return undefined
            return q
                .from({ order: ordersCollection })
                .where(({ order }) => eq(order.id, orderId))
                .select(({ order }) => ({
                    ...order,
                    lines: materialize(
                        q
                            .from({ l: orderLinesCollection })
                            .where(({ l }) => eq(l.purchase_order, order.id))
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.bill.purchase-order', orderId],
    })
    const choice = useTakenCopyChoice(isFromRoute ? orderId : '')
    const read = orderQuery.data
    const linkSource = useMemo<LinkSource | undefined>(() => {
        if (!read) return undefined
        return { key: 'purchase_order', row: { ...read, lines: read.lines ?? [], choice } }
    }, [read, choice])
    return {
        linkSource: documentRead(orderId, orderQuery, linkSource, [
            ordersCollection,
            orderLinesCollection,
        ]),
        linkSourceLines: NO_LINK_SOURCE.linkSourceLines,
    }
}

// The bill a correction replaces or a copy starts from, as its own row.
function useBillSourceQuery(sourceId: string) {
    const [billsCollection] = useStore('books_bills')
    return useLiveQuery({
        query: q => {
            if (!sourceId) return undefined
            return q
                .from({ source: billsCollection })
                .where(({ source }) => eq(source.id, sourceId))
                .findOne()
        },
        queryKey: ['books.bill.source', sourceId],
    })
}

// The form start of a bill: the purchase start (usePurchaseStart), with the vendor
// account's read as its own.
function useBillFormStart(input: DocumentScreenInput): DocumentScreenReads['formStart'] {
    const { purchaseLines, vendorAccountListed, vendorRead } = usePurchaseStart(input, LOG_CONTEXT)
    // Kept between renders: a copy's values (new line ids) are memoised on the start.
    const data = useMemo<DocumentFormStart>(
        () => ({ start: { kind: 'bill', purchaseLines, vendorAccountListed }, deposit: undefined }),
        [purchaseLines, vendorAccountListed]
    )
    return { ...vendorRead, data }
}

/**
 * The bill's reads: the bill with its vendor's name, the people who posted and voided it
 * and the number of the purchase order it was made from, its lines (both tables) in position order with their products and accounts, the
 * bill a correction replaces or a copy starts from with its lines, and the posted bill
 * payments of a posted or void bill. A bill has no tax and is never made from an
 * estimate: those reads are ready and empty.
 */
function useBillScreenReads(input: DocumentScreenInput & { isHeld: boolean }): DocumentScreenReads {
    const [billsCollection, linesCollection, usersCollection, productsCollection] = useStore(
        'books_bills',
        'books_bill_lines',
        'users',
        'books_products'
    )
    const [vendorsCollection, accountsCollection, ordersCollection] = useStore(
        'books_vendors',
        'books_accounts',
        'books_purchase_orders'
    )
    const [paymentLinesCollection, billPaymentsCollection] = useStore(
        'books_bill_payment_lines',
        'books_bill_payments'
    )
    const id = input.id ?? ''
    const billQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ bill: billsCollection })
                .where(({ bill }) => eq(bill.id, id))
                .select(({ bill }) => ({
                    ...bill,
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, bill.vendor))
                            .findOne()
                    ),
                    postedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, bill.posted_by))
                            .findOne()
                    ),
                    voidedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, bill.voided_by))
                            .findOne()
                    ),
                    // The order the bill names, for its "From purchase order <n>" link.
                    orderRow: materialize(
                        q
                            .from({ o: ordersCollection })
                            .where(({ o }) => eq(o.id, bill.purchase_order))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.bill', id],
    })
    // Each line with its product or account, which the read view names.
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.bill, id))
                .orderBy(({ line }) => line.position)
                .select(({ line }) => ({
                    ...line,
                    productRow: materialize(
                        q
                            .from({ p: productsCollection })
                            .where(({ p }) => eq(p.id, line.product))
                            .findOne()
                    ),
                    accountRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, line.account))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.bill.lines', id],
    })
    const read = billQuery.data
    const mapped = useMemo<DocumentRecord | undefined>(() => {
        if (!read) return undefined
        const { vendorRow, orderRow, ...row } = read
        const source = billSourceOf(row)
        const order = orderRow ? { number: orderRow.number } : undefined
        return {
            ...source,
            kindFields: { ...source.kindFields, vendorRow, orderRow: order, balance: row.balance },
            taxRateRow: undefined,
        }
    }, [read])
    const record = useHeldRecord(mapped, input.isHeld)
    const ids = linkedReadIds(input, record, read?.status ?? null, BILL_KIND.lifecycle)
    const sourceQuery = useBillSourceQuery(ids.sourceId)
    const sourceRow = sourceQuery.data
    const source = useMemo(() => (sourceRow ? billSourceOf(sourceRow) : undefined), [sourceRow])
    const sourceLinesQuery = useLiveQuery({
        query: q => {
            if (!ids.sourceLinesId) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.bill, ids.sourceLinesId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.bill.source-lines', ids.sourceLinesId],
    })
    // The bill payments that pay a posted or void bill (pay-bills spec §4.4), read as the
    // invoice's payments are (and not while the form holds a post): its bill payment lines
    // with their payments. Only posted payments are kept, after the query, since the
    // payment is a related row.
    const paymentsId = ids.postedReadsId
    const paymentsQuery = useLiveQuery({
        query: q => {
            if (!paymentsId) return undefined
            return q
                .from({ line: paymentLinesCollection })
                .where(({ line }) => eq(line.bill, paymentsId))
                .select(({ line }) => ({
                    ...line,
                    paymentRow: materialize(
                        q
                            .from({ p: billPaymentsCollection })
                            .where(({ p }) => eq(p.id, line.payment))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.bill.payments', paymentsId],
    })
    const paymentLines = paymentsQuery.data
    const documentPayments = useMemo(() => postedPaymentsOf(paymentLines ?? []), [paymentLines])
    // Only a new form reads it: the order it is made from (`?purchase_order`), or, on a new
    // correction, the one the posted bill names (the correction keeps the link, and the
    // link row names it). A stored bill names its order through `orderRow`.
    const isNew = input.id === null
    const routeOrder = isNew ? (input.purchaseOrder ?? '') : ''
    const corrected = isNew && input.replaces ? sourceRow : undefined
    const orderSource = useBillOrderSource({
        orderId: routeOrder || (corrected?.purchase_order ?? ''),
        isFromRoute: routeOrder !== '',
    })
    const formStart = useBillFormStart(input)
    return {
        record: documentRead(id, billQuery, record, [
            billsCollection,
            vendorsCollection,
            usersCollection,
            ordersCollection,
        ]),
        lines: documentRead(id, linesQuery, linesQuery.data ?? [], [
            linesCollection,
            productsCollection,
            accountsCollection,
        ]),
        source: documentRead(ids.sourceId, sourceQuery, source, [billsCollection]),
        sourceLines: documentRead(
            ids.sourceLinesId,
            sourceLinesQuery,
            sourceLinesQuery.data ?? [],
            [linesCollection]
        ),
        ...NO_ESTIMATE_SOURCE,
        ...orderSource,
        documentPayments: documentRead(paymentsId, paymentsQuery, documentPayments, [
            paymentLinesCollection,
            billPaymentsCollection,
        ]),
        taxLines: NO_PURCHASE_TAX_LINES,
        formStart,
    }
}

// The bill's writes: its row and the lines of both tables (one collection, each line
// with its `kind`), whose insert names the bill.
function useBillWrites(): DocumentWrites {
    const [billsCollection, linesCollection] = useStore('books_bills', 'books_bill_lines')
    return {
        // The columns were checked by billColumnsFrom before the save started and laid
        // over EMPTY_BILL_COLUMNS (DocumentKind.emptyColumns), so they hold every column
        // of that shape; the shared layer carries them untyped.
        insertRecord: input =>
            billsCollection.insert({
                ...(input.columns as BillInsertColumns),
                replaces: input.replaces,
                id: input.id,
                form: input.form,
                fields: input.fields,
            }),
        updateRecord: (id, input) => {
            const columns = columnsOrThrow(billColumnsFrom, input.columns)
            return billsCollection.update(id, draft => {
                Object.assign(draft, columns)
                if (Object.keys(input.fields).length > 0) draft.fields = input.fields
                draft.revision = input.revision
                if (input.post) draft.status = 'posted'
            })
        },
        postRecord: (id, revision) =>
            billsCollection.update(id, draft => {
                draft.status = 'posted'
                draft.revision = revision
            }),
        storedRevision: id => billsCollection.get(id)?.revision,
        storedKey: id => {
            const row = billsCollection.get(id)
            return row ? documentKey(row) : id
        },
        lineOps: (billId, mapper) =>
            purchaseLineOps(mapper, {
                // A line the form adds names no purchase order line; a line from the order
                // carries its own (PURCHASE_LINE_MAPPER).
                insert: record => linesCollection.insert({ po_line: '', ...record, bill: billId }),
                update: (lineId, record) =>
                    linesCollection.update(lineId, draft => {
                        Object.assign(draft, record)
                    }),
                remove: lineId => linesCollection.delete(lineId),
            }),
    }
}

// The row is the one the screen or the save already holds, so this sends no request.
function useBillVersion(id: string | undefined): string {
    const [billsCollection] = useStore('books_bills')
    const { record } = useRecord(billsCollection, id)
    return record?.updated ?? ''
}

function useBillReload(): () => Promise<void> {
    const [billsCollection, linesCollection] = useStore('books_bills', 'books_bill_lines')
    return async () => {
        await Promise.all([billsCollection.reload(), linesCollection.reload()])
    }
}

// The bill kind's data source: every `useStore` of a bill collection.
export const BILL_DATA: DocumentDataSource = {
    useScreenReads: useBillScreenReads,
    useParty: vendorPartyRead(LOG_CONTEXT),
    useWrites: useBillWrites,
    useVersion: useBillVersion,
    useReload: useBillReload,
}
