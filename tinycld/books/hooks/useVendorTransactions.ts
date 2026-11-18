import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useMemo, useState } from 'react'
import { allOf, listedClause } from '../lib/document-list'
import { type KeptRows, keepRows } from '../lib/entries-query'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { mergeTransactions, TRANSACTION_PAGE } from '../lib/party-transactions'
import { todayIso } from '../lib/register-range'
import {
    billPaymentRow,
    billRow,
    expenseRow,
    type VendorTransactionFilter,
    type VendorTransactionKind,
    type VendorTransactionRow,
    vendorCreditRow,
    vendorRefundRow,
} from '../lib/vendor-transactions'
import { useBooksSettings } from './useBooksSettings'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * One vendor's bills, expenses, bill payments, vendor credits and vendor refunds, newest
 * first, `n` at a time (vendor pages §3.5): one live query per kind (`vendor = id` and the
 * listed rule in its `where`, date desc then `created` desc, `.limit(n)`), merged and cut to
 * `n`. A filter other than `all` runs only its kind's query. `loadMore` grows the window by
 * 50 while a kind may have more; the vendor's last ready rows stay on screen while a larger
 * window or another chip's queries load. Amounts draw in the Books settings' currency, so the list waits for it.
 */
export function useVendorTransactions(vendorId: string, filter: VendorTransactionFilter) {
    const [
        billsCollection,
        expensesCollection,
        billPaymentsCollection,
        vendorCreditsCollection,
        vendorRefundsCollection,
    ] = useStore(
        'books_bills',
        'books_expenses',
        'books_bill_payments',
        'books_vendor_credits',
        'books_vendor_refunds'
    )
    const settings = useBooksSettings()
    const today = todayIso()

    // `n` belongs to one vendor and one chip; either change starts again at 50.
    const windowKey = `${vendorId}-${filter}`
    const [rowWindow, setRowWindow] = useState({ key: windowKey, n: TRANSACTION_PAGE })
    const n = rowWindow.key === windowKey ? rowWindow.n : TRANSACTION_PAGE

    const runs = (kind: VendorTransactionKind) => filter === 'all' || filter === kind
    const runsBills = runs('bill')
    const runsExpenses = runs('expense')
    const runsBillPayments = runs('bill_payment')
    const runsVendorCredits = runs('vendor_credit')
    const runsVendorRefunds = runs('vendor_refund')
    // `runs` is in the key, so a query the chip turns on builds again.
    const queryKey = (kind: VendorTransactionKind, isRunning: boolean) => [
        'books.vendor-page.transactions',
        kind,
        vendorId,
        n,
        isRunning,
    ]

    const billsQuery = useLiveQuery({
        query: q => {
            if (!runsBills) return undefined
            return q
                .from({ b: billsCollection })
                .where(({ b }) => allOf([eq(b.vendor, vendorId), listedClause(b)]))
                .orderBy(({ b }) => b.date, 'desc')
                .orderBy(({ b }) => b.created, 'desc')
                .limit(n)
        },
        queryKey: queryKey('bill', runsBills),
    })
    const expensesQuery = useLiveQuery({
        query: q => {
            if (!runsExpenses) return undefined
            return q
                .from({ e: expensesCollection })
                .where(({ e }) => allOf([eq(e.vendor, vendorId), listedClause(e)]))
                .orderBy(({ e }) => e.date, 'desc')
                .orderBy(({ e }) => e.created, 'desc')
                .limit(n)
        },
        queryKey: queryKey('expense', runsExpenses),
    })
    const billPaymentsQuery = useLiveQuery({
        query: q => {
            if (!runsBillPayments) return undefined
            return q
                .from({ p: billPaymentsCollection })
                .where(({ p }) => allOf([eq(p.vendor, vendorId), listedClause(p)]))
                .orderBy(({ p }) => p.date, 'desc')
                .orderBy(({ p }) => p.created, 'desc')
                .limit(n)
        },
        queryKey: queryKey('bill_payment', runsBillPayments),
    })
    const vendorCreditsQuery = useLiveQuery({
        query: q => {
            if (!runsVendorCredits) return undefined
            return q
                .from({ c: vendorCreditsCollection })
                .where(({ c }) => allOf([eq(c.vendor, vendorId), listedClause(c)]))
                .orderBy(({ c }) => c.date, 'desc')
                .orderBy(({ c }) => c.created, 'desc')
                .limit(n)
        },
        queryKey: queryKey('vendor_credit', runsVendorCredits),
    })
    const vendorRefundsQuery = useLiveQuery({
        query: q => {
            if (!runsVendorRefunds) return undefined
            return q
                .from({ r: vendorRefundsCollection })
                .where(({ r }) => allOf([eq(r.vendor, vendorId), listedClause(r)]))
                .orderBy(({ r }) => r.date, 'desc')
                .orderBy(({ r }) => r.created, 'desc')
                .limit(n)
        },
        queryKey: queryKey('vendor_refund', runsVendorRefunds),
    })

    const bills = runsBills ? billsQuery.data : undefined
    const expenses = runsExpenses ? expensesQuery.data : undefined
    const billPayments = runsBillPayments ? billPaymentsQuery.data : undefined
    const vendorCredits = runsVendorCredits ? vendorCreditsQuery.data : undefined
    const vendorRefunds = runsVendorRefunds ? vendorRefundsQuery.data : undefined
    const merged = useMemo(
        () =>
            mergeTransactions<VendorTransactionRow>(
                [
                    (bills ?? []).map(row => billRow(row, today)),
                    (expenses ?? []).map(expenseRow),
                    (billPayments ?? []).map(billPaymentRow),
                    (vendorCredits ?? []).map(vendorCreditRow),
                    (vendorRefunds ?? []).map(vendorRefundRow),
                ],
                n
            ),
        [bills, expenses, billPayments, vendorCredits, vendorRefunds, today, n]
    )

    const reads = [
        { isRunning: runsBills, query: billsQuery, source: billsCollection },
        { isRunning: runsExpenses, query: expensesQuery, source: expensesCollection },
        { isRunning: runsBillPayments, query: billPaymentsQuery, source: billPaymentsCollection },
        {
            isRunning: runsVendorCredits,
            query: vendorCreditsQuery,
            source: vendorCreditsCollection,
        },
        {
            isRunning: runsVendorRefunds,
            query: vendorRefundsQuery,
            source: vendorRefundsCollection,
        },
    ]
    const running = reads.filter(read => read.isRunning)
    const failedReads = running.filter(read => read.query.isError)
    const isPending =
        running.some(read => !read.query.isReady && !read.query.isError) ||
        (!settings.isReady && !settings.hasLoadError)
    const isReady = running.every(read => read.query.isReady) && settings.isReady

    // A larger window or another chip is a new query: the last ready rows of this vendor stay
    // while it loads, as on the customer list. The key is the vendor alone, so another
    // vendor's rows never stay; no `limit` is passed, so a chip change that drops `n` back
    // to 50 keeps them too. An empty kept list is not shown while reads load: an empty list is final only when
    // every running read is ready, so "No expenses" never shows as "No transactions" while
    // the All chip's other reads load.
    const [kept, setKept] = useState<KeptRows<VendorTransactionRow>>()
    const shown = keepRows(kept, {
        isReady,
        key: vendorId,
        rows: isReady ? merged.rows : undefined,
    })
    if (shown.next !== kept) setKept(shown.next)
    const hasKeptRows = (shown.rows?.length ?? 0) > 0
    const rows = isReady || hasKeptRows ? shown.rows : undefined
    // The list waits for every read it runs; a failed read shows once the others are in.
    const isLoading = rows === undefined && isPending

    // Only the failed reads are restarted; the settings read is one of them when it failed.
    const failedParts = failedReads.map(
        (read): LiveRecovery => ({
            queries: [read.query.collection],
            sources: [read.source],
        })
    )
    const hasFailed = !isLoading && (failedParts.length > 0 || settings.hasLoadError)
    const recovery = hasFailed
        ? mergeRecoveries([...failedParts, settings.hasLoadError ? settings.recovery : NO_RECOVERY])
        : null

    const hasMore = isReady && merged.hasMore
    const loadMore = () => {
        if (hasMore) setRowWindow({ key: windowKey, n: n + TRANSACTION_PAGE })
    }
    // Rows show only once the settings read is ready, so the fallback is used only by a
    // book that has no settings row yet, as in the rest of Books.
    const currency = settings.settings?.currency ?? 'USD'

    return { rows: rows ?? [], isLoading, recovery, hasMore, loadMore, currency }
}
