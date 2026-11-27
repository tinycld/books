import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { materialize } from 'pbtsdb'
import { useCallback, useMemo } from 'react'
import { NO_ORDER_LINKS, type OrderFormLinks } from '../components/documents/document-form-context'
import { linkedLineTexts, type OrderBill, orderBillsSummary } from '../lib/purchase-order-bills'
import { type DocumentReadLine, isOrderReadLine } from './document-data'

/**
 * The bills that name a purchase order (purchase order spec §3.6, §3.8), each with its
 * lines: one live query of `books_bills` by `purchase_order`, the lines through
 * `materialize`. Every status is read (a void bill still names its lines, so they keep
 * their pickers: the server's rule, server/purchase_order_bills.go); orderBillsSummary
 * gives the Bills section's rows (not void, not replaced), what the draft bills (not a
 * draft correction) hold of each order line
 * and the order lines a bill names. Retry recovers the query and its two collections.
 */
export function usePurchaseOrderBills(orderId: string) {
    const [billsCollection, billLinesCollection] = useStore('books_bills', 'books_bill_lines')
    const query = useLiveQuery({
        query: q => {
            if (!orderId) return undefined
            return q
                .from({ bill: billsCollection })
                .where(({ bill }) => eq(bill.purchase_order, orderId))
                .select(({ bill }) => ({
                    id: bill.id,
                    number: bill.number,
                    date: bill.date,
                    status: bill.status,
                    currency: bill.currency,
                    replaced_by: bill.replaced_by,
                    replaces: bill.replaces,
                    lines: materialize(
                        q
                            .from({ line: billLinesCollection })
                            .where(({ line }) => eq(line.bill, bill.id))
                    ),
                }))
        },
        queryKey: ['books.purchase-order.bills', orderId],
    })
    const data = query.data
    const summary = useMemo(() => {
        const bills: OrderBill[] = (data ?? []).map(bill => ({ ...bill, lines: bill.lines ?? [] }))
        return orderBillsSummary(bills)
    }, [data])
    const queryCollection = query.collection
    // Kept between renders, so the order form's scope (useOrderFormLinks) stays the same.
    const retry = useCallback(() => {
        void recoverLiveQueries({
            queries: [queryCollection],
            sources: [billsCollection, billLinesCollection],
            onError: err => log.error('books.purchase-order', err, { operation: 'bills' }),
        })
    }, [queryCollection, billsCollection, billLinesCollection])
    return {
        ...summary,
        isReady: Boolean(orderId) && query.isReady,
        isError: query.isError,
        retry,
    }
}

export type PurchaseOrderBills = ReturnType<typeof usePurchaseOrderBills>

/**
 * What the bills of a stored purchase order fix in its form (OrderFormLinks): the linked
 * lines' texts (linkedLineTexts, from the stored lines the screen read) and whether the
 * Vendor is fixed (a bill names the order). `orderId` is '' on a new order and on every
 * other kind: nothing is read and nothing is fixed. While the bills read loads, or after
 * it failed, the lines that posted bills received or billed are the linked ones; a failed
 * read fixes the Vendor too, and its Retry is the form's.
 */
export function useOrderFormLinks(
    orderId: string,
    lines: readonly DocumentReadLine[],
    currency: string
): OrderFormLinks {
    const bills = usePurchaseOrderBills(orderId)
    const isRead = bills.isReady && !bills.isError
    const linked = isRead ? bills.linkedLines : null
    const orderLines = useMemo(() => lines.filter(isOrderReadLine), [lines])
    const texts = useMemo(
        () => linkedLineTexts(orderLines, linked, currency),
        [orderLines, linked, currency]
    )
    const locksVendor = isRead ? bills.hasBills : bills.isError || Object.keys(texts).length > 0
    const loadFailed = bills.isError
    const retry = bills.retry
    return useMemo(() => {
        if (!orderId) return NO_ORDER_LINKS
        return { lines: texts, locksVendor, loadFailed, retry }
    }, [orderId, texts, locksVendor, loadFailed, retry])
}
