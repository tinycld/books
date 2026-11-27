import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import {
    type EMPTY_PURCHASE_ORDER_COLUMNS,
    purchaseOrderColumnsFrom,
} from '../lib/purchase-order-columns'
import { documentKey } from '../lib/record-key'
import { columnsOrThrow } from '../lib/record-save'
import { PURCHASE_ORDER_KIND } from '../lib/sales-document-kinds'
import { shipToStartOf } from '../lib/ship-to'
import type { BooksPurchaseOrders } from '../types'
import {
    type DocumentDataSource,
    type DocumentFormStart,
    type DocumentKindFields,
    type DocumentRecord,
    type DocumentScreenInput,
    type DocumentScreenReads,
    type DocumentSource,
    type DocumentWrites,
    documentRead,
    linkedReadIds,
    NO_DOCUMENT_PAYMENTS,
    NO_ESTIMATE_SOURCE,
    NO_LINK_SOURCE,
    useHeldRecord,
} from './document-data'
import { vendorPartyRead } from './party-read'
import { NO_PURCHASE_TAX_LINES, purchaseLineOps, usePurchaseStart } from './purchase-data'
import { useBooksSettings } from './useBooksSettings'

const LOG_CONTEXT = 'books.purchase-order'

type PurchaseOrderInsertColumns = typeof EMPTY_PURCHASE_ORDER_COLUMNS

// The order's own columns go into `kindFields`; the row keeps the shared ones. A purchase
// order has no customer, Bill to, tax rate or tax (spec §3.1), and it never posts, so the
// shared sales and posting columns are ''/null/0 on it: every shared reader keeps its type,
// and none of them finds a customer, a tax or a posting on an order. Its email and message
// are its own and stay.
function purchaseOrderSourceOf<R extends BooksPurchaseOrders>(
    row: R
): R &
    Pick<
        DocumentSource,
        | 'customer'
        | 'bill_to'
        | 'tax_rate'
        | 'tax_total'
        | 'entry'
        | 'posted_at'
        | 'voided_at'
        | 'replaces'
        | 'replaced_by'
    > & {
        kindFields: Extract<DocumentKindFields, { kind: 'purchase_order' }>
    } {
    return {
        ...row,
        customer: '',
        bill_to: null,
        tax_rate: '',
        tax_total: 0,
        entry: '',
        posted_at: '',
        voided_at: '',
        replaces: '',
        replaced_by: '',
        kindFields: {
            kind: 'purchase_order',
            vendor: row.vendor,
            mailing_address: row.mailing_address,
            ship_to: row.ship_to,
            open_amount: row.open_amount,
            closed_reason: row.closed_reason,
            closed_at: row.closed_at,
            closed_by: row.closed_by,
            created_by: row.created_by,
            created: row.created,
        },
    }
}

// The order a copy starts from, as its own row.
function usePurchaseOrderSourceQuery(sourceId: string) {
    const [ordersCollection] = useStore('books_purchase_orders')
    return useLiveQuery({
        query: q => {
            if (!sourceId) return undefined
            return q
                .from({ source: ordersCollection })
                .where(({ source }) => eq(source.id, sourceId))
                .findOne()
        },
        queryKey: ['books.purchase-order.source', sourceId],
    })
}

// The form start of an order: the purchase start (usePurchaseStart), with the vendor
// account's read as its own, and a new order's Ship to from the Company settings, which
// the screen reads (useBooksSettings: its readiness, error and Retry are the screen's).
function usePurchaseOrderFormStart(input: DocumentScreenInput): DocumentScreenReads['formStart'] {
    const { purchaseLines, vendorAccountListed, vendorRead } = usePurchaseStart(input, LOG_CONTEXT)
    const { settings } = useBooksSettings()
    const shipTo = settings ? shipToStartOf(settings) : ''
    // Kept between renders: a copy's values (new line ids) are memoised on the start.
    const data = useMemo<DocumentFormStart>(
        () => ({
            start: { kind: 'purchase_order', purchaseLines, vendorAccountListed, shipTo },
            deposit: undefined,
        }),
        [purchaseLines, vendorAccountListed, shipTo]
    )
    return { ...vendorRead, data }
}

/**
 * The order's reads: the order with its vendor's name, the people who created and closed
 * it and what its lines received and billed (one query), its lines (both tables) in
 * position order with their products and accounts, and the order a copy starts from with
 * its lines. An order has no tax, no payments and is never made from an estimate or a
 * source link: those reads are ready and empty.
 */
function usePurchaseOrderScreenReads(
    input: DocumentScreenInput & { isHeld: boolean }
): DocumentScreenReads {
    const [ordersCollection, linesCollection, usersCollection, productsCollection] = useStore(
        'books_purchase_orders',
        'books_purchase_order_lines',
        'users',
        'books_products'
    )
    const [vendorsCollection, accountsCollection] = useStore('books_vendors', 'books_accounts')
    const id = input.id ?? ''
    const orderQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ order: ordersCollection })
                .where(({ order }) => eq(order.id, id))
                .select(({ order }) => ({
                    ...order,
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, order.vendor))
                            .findOne()
                    ),
                    createdBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, order.created_by))
                            .findOne()
                    ),
                    closedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, order.closed_by))
                            .findOne()
                    ),
                    lineReceipts: materialize(
                        q
                            .from({ l: linesCollection })
                            .where(({ l }) => eq(l.purchase_order, order.id))
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.purchase-order', id],
    })
    // Each line with its product or account, which the read view names.
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.purchase_order, id))
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
        queryKey: ['books.purchase-order.lines', id],
    })
    const read = orderQuery.data
    const mapped = useMemo<DocumentRecord | undefined>(() => {
        if (!read) return undefined
        const { vendorRow, createdBy, closedBy, lineReceipts, ...row } = read
        const source = purchaseOrderSourceOf(row)
        return {
            ...source,
            kindFields: {
                ...source.kindFields,
                vendorRow,
                createdBy,
                closedBy,
                lineReceipts: lineReceipts ?? [],
            },
            postedBy: undefined,
            voidedBy: undefined,
            taxRateRow: undefined,
        }
    }, [read])
    const record = useHeldRecord(mapped, input.isHeld)
    const ids = linkedReadIds(input, record, read?.status ?? null, PURCHASE_ORDER_KIND.lifecycle)
    const sourceQuery = usePurchaseOrderSourceQuery(ids.sourceId)
    const sourceRow = sourceQuery.data
    const source = useMemo(
        () => (sourceRow ? purchaseOrderSourceOf(sourceRow) : undefined),
        [sourceRow]
    )
    const sourceLinesQuery = useLiveQuery({
        query: q => {
            if (!ids.sourceLinesId) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.purchase_order, ids.sourceLinesId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.purchase-order.source-lines', ids.sourceLinesId],
    })
    const formStart = usePurchaseOrderFormStart(input)
    return {
        record: documentRead(id, orderQuery, record, [
            ordersCollection,
            vendorsCollection,
            usersCollection,
            linesCollection,
        ]),
        lines: documentRead(id, linesQuery, linesQuery.data ?? [], [
            linesCollection,
            productsCollection,
            accountsCollection,
        ]),
        source: documentRead(ids.sourceId, sourceQuery, source, [ordersCollection]),
        sourceLines: documentRead(
            ids.sourceLinesId,
            sourceLinesQuery,
            sourceLinesQuery.data ?? [],
            [linesCollection]
        ),
        ...NO_ESTIMATE_SOURCE,
        ...NO_LINK_SOURCE,
        ...NO_DOCUMENT_PAYMENTS,
        taxLines: NO_PURCHASE_TAX_LINES,
        formStart,
    }
}

// The order's writes: its row and the lines of both tables (one collection, each line with
// its `kind`), whose insert names the order. An order never posts.
function usePurchaseOrderWrites(): DocumentWrites {
    const [ordersCollection, linesCollection] = useStore(
        'books_purchase_orders',
        'books_purchase_order_lines'
    )
    return {
        // The columns were checked by purchaseOrderColumnsFrom before the save started and
        // laid over EMPTY_PURCHASE_ORDER_COLUMNS (DocumentKind.emptyColumns), so they hold
        // every column of that shape; the shared layer carries them untyped. An order has no
        // correction, so `replaces` is never set and is not written.
        insertRecord: input =>
            ordersCollection.insert({
                ...(input.columns as PurchaseOrderInsertColumns),
                id: input.id,
                form: input.form,
                fields: input.fields,
            }),
        updateRecord: (id, input) => {
            if (input.post) throw new Error('a purchase order never posts')
            const columns = columnsOrThrow(purchaseOrderColumnsFrom, input.columns)
            return ordersCollection.update(id, draft => {
                Object.assign(draft, columns)
                if (Object.keys(input.fields).length > 0) draft.fields = input.fields
                draft.revision = input.revision
            })
        },
        postRecord: () => {
            throw new Error('a purchase order never posts')
        },
        storedRevision: id => ordersCollection.get(id)?.revision,
        storedKey: id => {
            const row = ordersCollection.get(id)
            return row ? documentKey(row) : id
        },
        lineOps: (orderId, mapper) =>
            purchaseLineOps(mapper, {
                insert: record => linesCollection.insert({ ...record, purchase_order: orderId }),
                update: (lineId, record) =>
                    linesCollection.update(lineId, draft => {
                        Object.assign(draft, record)
                    }),
                remove: lineId => linesCollection.delete(lineId),
            }),
    }
}

// The row is the one the screen or the save already holds, so this sends no request.
function usePurchaseOrderVersion(id: string | undefined): string {
    const [ordersCollection] = useStore('books_purchase_orders')
    const { record } = useRecord(ordersCollection, id)
    return record?.updated ?? ''
}

function usePurchaseOrderReload(): () => Promise<void> {
    const [ordersCollection, linesCollection] = useStore(
        'books_purchase_orders',
        'books_purchase_order_lines'
    )
    return async () => {
        await Promise.all([ordersCollection.reload(), linesCollection.reload()])
    }
}

// The purchase order kind's data source: every `useStore` of a purchase order collection.
export const PURCHASE_ORDER_DATA: DocumentDataSource = {
    useScreenReads: usePurchaseOrderScreenReads,
    useParty: vendorPartyRead(LOG_CONTEXT),
    useWrites: usePurchaseOrderWrites,
    useVersion: usePurchaseOrderVersion,
    useReload: usePurchaseOrderReload,
}
