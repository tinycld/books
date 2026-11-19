import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { materialize } from 'pbtsdb'
import { useMemo, useState } from 'react'
import {
    allOf,
    chipClause,
    chipRuns,
    type DocumentListFilters,
    type DocumentListRow,
    type DocumentListTab,
    documentListWindow,
    kindDirection,
    type ListSort,
    listedClause,
    listRange,
    rangeClauses,
    searchClauses,
    sortField,
} from '../lib/document-list'
import { type KeptRows, keepRows } from '../lib/entries-query'
import { searchPieces } from '../lib/list-search'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import {
    creditMemoRow,
    estimateRow,
    invoiceRow,
    paymentRow,
    refundReceiptRow,
    salesReceiptRow,
    TRANSACTION_PAGE,
    writeOffRow,
} from '../lib/party-transactions'
import { fiscalStartMonth, todayIso } from '../lib/register-range'
import { useBooksSettings } from './useBooksSettings'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

type ListInput = { tab: DocumentListTab; filters: DocumentListFilters; sort: ListSort }

// The fields every kind's row adds to its badge row; a kind without one gives ''.
// `customerRow` is required, so a query whose select drops or renames it is a type error.
function extraFields(row: {
    sequence: number
    customer: string
    memo: string
    status: string
    customerRow: { display_name: string } | undefined
}) {
    return {
        sequence: row.sequence,
        customerId: row.customer,
        customerName: row.customerRow?.display_name ?? '',
        memo: row.memo,
        recordStatus: row.status,
        reference: '',
        expires: '',
        balance: 0,
        entry: '',
        convertedInvoice: '',
    }
}

/**
 * The rows of one document list (spec §4): one live query per kind the tab lists, each
 * filtered by the chip, the date range, the customer and the search in its `where`,
 * ordered by the sort column then `created` descending, and cut to its first `n` rows;
 * a chip that lists none of a kind does not run that kind's query. The lists merge in the
 * same order, cut to `n`, so the window is exact. `loadMore` grows `n` by 50 while a
 * source may have more; `n` returns to 50 when the tab, a filter or the sort changes.
 * The rows of the last ready window stay on screen while a new window or a new filter
 * loads (`isBusy`); `isLoading` is true only while there is nothing to show. The search
 * text is used as given: the caller debounces it. Amounts draw in the Books settings'
 * currency, so that read is one more the list waits for.
 */
export function useDocumentList({ tab, filters, sort }: ListInput) {
    const [
        invoicesCollection,
        estimatesCollection,
        receiptsCollection,
        paymentsCollection,
        creditMemosCollection,
        refundsCollection,
        writeOffsCollection,
        customersCollection,
    ] = useStore(
        'books_invoices',
        'books_estimates',
        'books_sales_receipts',
        'books_payments',
        'books_credit_memos',
        'books_refund_receipts',
        'books_write_offs',
        'books_customers'
    )
    const settings = useBooksSettings()
    const today = todayIso()

    // `n` belongs to one tab, filter set and sort; any change starts again at 50.
    const windowKey = JSON.stringify([tab.key, filters, sort])
    const [rowWindow, setRowWindow] = useState({ key: windowKey, n: TRANSACTION_PAGE })
    const n = rowWindow.key === windowKey ? rowWindow.n : TRANSACTION_PAGE

    const { chip, customer, search } = filters
    const range = listRange(filters.range, today, fiscalStartMonth(settings.settings))
    const hasCustomer = customer !== ''
    // Estimates have no listed rule, so their query has a `where` only when a filter is set.
    const hasSearch = searchPieces(search).length > 0
    const hasEstimateWhere = chip !== 'all' || range !== null || hasCustomer || hasSearch
    // Write-offs have no listed rule (no correction replaces one) and no chip rule (on the
    // customer tab the filter chip chooses the kind), so likewise.
    const hasWriteOffWhere = range !== null || hasCustomer || hasSearch
    const queryKey = (kind: string, runs: boolean) => [
        'books.document-list',
        kind,
        runs,
        tab.key,
        tab.isSigned,
        chip,
        range?.start ?? '',
        range?.end ?? '',
        customer,
        search,
        sort.key,
        sort.isAscending,
        today,
        n,
    ]
    const runsInvoices = chipRuns(tab, chip, 'invoice')
    const runsEstimates = chipRuns(tab, chip, 'estimate')
    const runsReceipts = chipRuns(tab, chip, 'sales_receipt')
    const runsPayments = chipRuns(tab, chip, 'payment')
    const runsCreditMemos = chipRuns(tab, chip, 'credit_memo')
    const runsRefunds = chipRuns(tab, chip, 'refund_receipt')
    const runsWriteOffs = chipRuns(tab, chip, 'write_off')

    const invoicesQuery = useLiveQuery({
        query: q => {
            if (!runsInvoices) return undefined
            const field = sortField('invoice', sort.key)
            return q
                .from({ i: invoicesCollection })
                .where(({ i }) =>
                    allOf([
                        listedClause(i),
                        ...optional(chipClause(tab, chip, 'invoice', i, today)),
                        ...rangeClauses(i, range),
                        ...(hasCustomer ? [eq(i.customer, customer)] : []),
                        ...searchClauses(i, search),
                    ])
                )
                .orderBy(({ i }) => i[field], kindDirection(tab, 'invoice', sort))
                .orderBy(({ i }) => i.created, 'desc')
                .limit(n)
                .select(({ i }) => ({
                    ...i,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, i.customer))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('invoices', runsInvoices),
    })
    const estimatesQuery = useLiveQuery({
        query: q => {
            if (!runsEstimates) return undefined
            const field = sortField('estimate', sort.key)
            const from = q.from({ e: estimatesCollection })
            const filtered = hasEstimateWhere
                ? from.where(({ e }) =>
                      allOf([
                          ...optional(chipClause(tab, chip, 'estimate', e, today)),
                          ...rangeClauses(e, range),
                          ...(hasCustomer ? [eq(e.customer, customer)] : []),
                          ...searchClauses(e, search),
                      ])
                  )
                : from
            return filtered
                .orderBy(({ e }) => e[field], kindDirection(tab, 'estimate', sort))
                .orderBy(({ e }) => e.created, 'desc')
                .limit(n)
                .select(({ e }) => ({
                    ...e,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, e.customer))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('estimates', runsEstimates),
    })
    const receiptsQuery = useLiveQuery({
        query: q => {
            if (!runsReceipts) return undefined
            const field = sortField('sales_receipt', sort.key)
            return q
                .from({ r: receiptsCollection })
                .where(({ r }) =>
                    allOf([
                        listedClause(r),
                        ...optional(chipClause(tab, chip, 'sales_receipt', r, today)),
                        ...rangeClauses(r, range),
                        ...(hasCustomer ? [eq(r.customer, customer)] : []),
                        ...searchClauses(r, search),
                    ])
                )
                .orderBy(({ r }) => r[field], kindDirection(tab, 'sales_receipt', sort))
                .orderBy(({ r }) => r.created, 'desc')
                .limit(n)
                .select(({ r }) => ({
                    ...r,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, r.customer))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('sales-receipts', runsReceipts),
    })
    const paymentsQuery = useLiveQuery({
        query: q => {
            if (!runsPayments) return undefined
            const field = sortField('payment', sort.key)
            return q
                .from({ p: paymentsCollection })
                .where(({ p }) =>
                    allOf([
                        listedClause(p),
                        ...optional(chipClause(tab, chip, 'payment', p, today)),
                        ...rangeClauses(p, range),
                        ...(hasCustomer ? [eq(p.customer, customer)] : []),
                        ...searchClauses(p, search),
                    ])
                )
                .orderBy(({ p }) => p[field], kindDirection(tab, 'payment', sort))
                .orderBy(({ p }) => p.created, 'desc')
                .limit(n)
                .select(({ p }) => ({
                    ...p,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, p.customer))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('payments', runsPayments),
    })
    const creditMemosQuery = useLiveQuery({
        query: q => {
            if (!runsCreditMemos) return undefined
            const field = sortField('credit_memo', sort.key)
            return q
                .from({ m: creditMemosCollection })
                .where(({ m }) =>
                    allOf([
                        listedClause(m),
                        ...optional(chipClause(tab, chip, 'credit_memo', m, today)),
                        ...rangeClauses(m, range),
                        ...(hasCustomer ? [eq(m.customer, customer)] : []),
                        ...searchClauses(m, search),
                    ])
                )
                .orderBy(({ m }) => m[field], kindDirection(tab, 'credit_memo', sort))
                .orderBy(({ m }) => m.created, 'desc')
                .limit(n)
                .select(({ m }) => ({
                    ...m,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, m.customer))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('credit-memos', runsCreditMemos),
    })
    const refundsQuery = useLiveQuery({
        query: q => {
            if (!runsRefunds) return undefined
            const field = sortField('refund_receipt', sort.key)
            return q
                .from({ f: refundsCollection })
                .where(({ f }) =>
                    allOf([
                        listedClause(f),
                        ...optional(chipClause(tab, chip, 'refund_receipt', f, today)),
                        ...rangeClauses(f, range),
                        ...(hasCustomer ? [eq(f.customer, customer)] : []),
                        ...searchClauses(f, search),
                    ])
                )
                .orderBy(({ f }) => f[field], kindDirection(tab, 'refund_receipt', sort))
                .orderBy(({ f }) => f.created, 'desc')
                .limit(n)
                .select(({ f }) => ({
                    ...f,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, f.customer))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('refund-receipts', runsRefunds),
    })
    const writeOffsQuery = useLiveQuery({
        query: q => {
            if (!runsWriteOffs) return undefined
            const field = sortField('write_off', sort.key)
            const from = q.from({ w: writeOffsCollection })
            const filtered = hasWriteOffWhere
                ? from.where(({ w }) =>
                      allOf([
                          ...rangeClauses(w, range),
                          ...(hasCustomer ? [eq(w.customer, customer)] : []),
                          ...searchClauses(w, search),
                      ])
                  )
                : from
            return filtered
                .orderBy(({ w }) => w[field], kindDirection(tab, 'write_off', sort))
                .orderBy(({ w }) => w.created, 'desc')
                .limit(n)
                .select(({ w }) => ({
                    ...w,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, w.customer))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('write-offs', runsWriteOffs),
    })

    const invoices = runsInvoices ? invoicesQuery.data : undefined
    const estimates = runsEstimates ? estimatesQuery.data : undefined
    const receipts = runsReceipts ? receiptsQuery.data : undefined
    const payments = runsPayments ? paymentsQuery.data : undefined
    const creditMemos = runsCreditMemos ? creditMemosQuery.data : undefined
    const refunds = runsRefunds ? refundsQuery.data : undefined
    const writeOffs = runsWriteOffs ? writeOffsQuery.data : undefined
    const isSigned = tab.isSigned
    const merged = useMemo(() => {
        const invoiceRows: DocumentListRow[] = (invoices ?? []).map(row => ({
            ...invoiceRow(row, today),
            ...extraFields(row),
            balance: row.balance,
            entry: row.entry,
        }))
        const estimateRows: DocumentListRow[] = (estimates ?? []).map(row => ({
            ...estimateRow(row, today),
            ...extraFields(row),
            expires: row.expiration_date,
            convertedInvoice: row.invoice,
        }))
        const receiptRows: DocumentListRow[] = (receipts ?? []).map(row => ({
            ...salesReceiptRow(row),
            ...extraFields(row),
            reference: row.reference_no,
            entry: row.entry,
        }))
        const paymentRows: DocumentListRow[] = (payments ?? []).map(row => ({
            ...paymentRow(row),
            ...extraFields(row),
            reference: row.reference_no,
            entry: row.entry,
        }))
        // creditMemoRow negates the total; a tab that is not signed shows it as stored.
        const creditMemoRows: DocumentListRow[] = (creditMemos ?? []).map(row => ({
            ...creditMemoRow(row),
            ...extraFields(row),
            total: isSigned ? -row.total : row.total,
            balance: row.balance,
            entry: row.entry,
        }))
        // refundReceiptRow negates the total on every tab: a refund always shows with a
        // minus sign (refund receipt spec §3.13).
        const refundRows: DocumentListRow[] = (refunds ?? []).map(row => ({
            ...refundReceiptRow(row),
            ...extraFields(row),
            reference: row.reference_no,
            entry: row.entry,
            creditMemo: row.credit_memo,
        }))
        // writeOffRow negates the amount on every tab, as a refund's (write-off spec §3.6).
        const writeOffRows: DocumentListRow[] = (writeOffs ?? []).map(row => ({
            ...writeOffRow(row),
            ...extraFields(row),
            entry: row.entry,
        }))
        return documentListWindow(
            [
                invoiceRows,
                estimateRows,
                receiptRows,
                paymentRows,
                creditMemoRows,
                refundRows,
                writeOffRows,
            ],
            n,
            sort
        )
    }, [
        invoices,
        estimates,
        receipts,
        payments,
        creditMemos,
        refunds,
        writeOffs,
        today,
        n,
        sort,
        isSigned,
    ])

    const invoicesError = runsInvoices && invoicesQuery.isError
    const estimatesError = runsEstimates && estimatesQuery.isError
    const receiptsError = runsReceipts && receiptsQuery.isError
    const paymentsError = runsPayments && paymentsQuery.isError
    const creditMemosError = runsCreditMemos && creditMemosQuery.isError
    const refundsError = runsRefunds && refundsQuery.isError
    const writeOffsError = runsWriteOffs && writeOffsQuery.isError
    const anyError =
        invoicesError ||
        estimatesError ||
        receiptsError ||
        paymentsError ||
        creditMemosError ||
        refundsError ||
        writeOffsError ||
        settings.hasLoadError
    const isPending =
        (runsInvoices && !invoicesQuery.isReady && !invoicesQuery.isError) ||
        (runsEstimates && !estimatesQuery.isReady && !estimatesQuery.isError) ||
        (runsReceipts && !receiptsQuery.isReady && !receiptsQuery.isError) ||
        (runsPayments && !paymentsQuery.isReady && !paymentsQuery.isError) ||
        (runsCreditMemos && !creditMemosQuery.isReady && !creditMemosQuery.isError) ||
        (runsRefunds && !refundsQuery.isReady && !refundsQuery.isError) ||
        (runsWriteOffs && !writeOffsQuery.isReady && !writeOffsQuery.isError) ||
        (!settings.isReady && !settings.hasLoadError)
    // The settings read gives the currency every amount draws in, so the rows wait for it.
    const isReady =
        (!runsInvoices || invoicesQuery.isReady) &&
        (!runsEstimates || estimatesQuery.isReady) &&
        (!runsReceipts || receiptsQuery.isReady) &&
        (!runsPayments || paymentsQuery.isReady) &&
        (!runsCreditMemos || creditMemosQuery.isReady) &&
        (!runsRefunds || refundsQuery.isReady) &&
        (!runsWriteOffs || writeOffsQuery.isReady) &&
        settings.isReady

    // A larger window, a filter or a sort is a new query: the rows of the last ready
    // window stay on screen while it loads, through any change on the same tab key. The
    // customer page's tab key holds its customer, so a reused customer page does not show
    // the last customer's rows. No `limit` is passed: a filter or sort change drops `n`
    // back to 50, and the last rows must still stay through it.
    const keepKey = tab.key
    const [kept, setKept] = useState<KeptRows<DocumentListRow>>()
    const shown = keepRows(kept, {
        isReady,
        key: keepKey,
        rows: isReady ? merged.rows : undefined,
    })
    if (shown.next !== kept) setKept(shown.next)
    const rows = shown.rows
    // The list waits for every read it runs: while one still loads it shows the loading
    // state, and a failed read shows its error once the others are in.
    const isLoading = rows === undefined && isPending
    const isError = !isLoading && anyError
    const isBusy = rows !== undefined && !isReady && isPending

    const hasMore = isReady && merged.hasMore
    const loadMore = () => {
        if (hasMore) setRowWindow({ key: windowKey, n: n + TRANSACTION_PAGE })
    }

    // Each part is non-empty only when its own query failed, so Retry restarts only the
    // failed reads. Every query reads the customers through `materialize`, so they are a
    // source of each failed one.
    const recoveryOf = (
        isFailed: boolean,
        query: LiveRecovery['queries'][number],
        source: NonNullable<LiveRecovery['sources']>[number]
    ): LiveRecovery =>
        isFailed ? { queries: [query], sources: [source, customersCollection] } : NO_RECOVERY
    // A screen with other reads (the Sales lists' access read) merges this into its one
    // recovery call; `retry` is that call for a caller with none.
    const recovery = mergeRecoveries([
        recoveryOf(invoicesError, invoicesQuery.collection, invoicesCollection),
        recoveryOf(estimatesError, estimatesQuery.collection, estimatesCollection),
        recoveryOf(receiptsError, receiptsQuery.collection, receiptsCollection),
        recoveryOf(paymentsError, paymentsQuery.collection, paymentsCollection),
        recoveryOf(creditMemosError, creditMemosQuery.collection, creditMemosCollection),
        recoveryOf(refundsError, refundsQuery.collection, refundsCollection),
        recoveryOf(writeOffsError, writeOffsQuery.collection, writeOffsCollection),
        settings.recovery,
    ])
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.warn('books.sales-lists', 'retry failed', { err }),
        })
    }
    // Rows show only once the settings read is ready, so the fallback is used only by a
    // book that has no settings row yet, as in the rest of Books.
    const currency = settings.settings?.currency ?? 'USD'

    return {
        rows: rows ?? [],
        currency,
        isLoading,
        isBusy,
        isError,
        recovery,
        retry,
        loadMore,
        hasMore,
    }
}

function optional<T>(value: T | undefined): T[] {
    return value === undefined ? [] : [value]
}
