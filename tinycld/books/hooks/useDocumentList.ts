import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useMemo, useState } from 'react'
import {
    type DocumentListFilters,
    type DocumentListRow,
    type DocumentListTab,
    documentListWindow,
    type ListKind,
    type ListSort,
    listRange,
    tabStateKey,
} from '../lib/document-list'
import { type KeptRows, keepRows } from '../lib/entries-query'
import { areaOf } from '../lib/list-areas'
import { mergeRecoveries } from '../lib/live-recovery'
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
import { categoryOf, NO_CATEGORY, type PurchaseCategory } from '../lib/purchase-category'
import { isOrderLineOpen } from '../lib/purchase-order-status'
import { fiscalStartMonth, todayIso } from '../lib/register-range'
import {
    billPaymentRow,
    billRow,
    expenseRow,
    purchaseOrderRow,
    vendorCreditRow,
    vendorRefundRow,
} from '../lib/vendor-transactions'
import { useBooksSettings } from './useBooksSettings'
import { usePurchaseListQueries } from './usePurchaseListQueries'
import { useSalesListQueries } from './useSalesListQueries'

type ListInput = {
    tab: DocumentListTab
    filters: DocumentListFilters
    sort: ListSort
    // Rows stay on screen while the next rows of the same key load; the default is the
    // tab's state key. A page that changes its tab (the vendor page's kind chip) and keeps
    // its rows through it passes a key of its own.
    keepKey?: string
}

type SalesData = ReturnType<typeof useSalesListQueries>
type PurchaseData = ReturnType<typeof usePurchaseListQueries>

// The fields every sales kind's row adds to its badge row; a kind without one gives ''
// (`email` too: a payment and a write-off have none, the sent-able kinds set theirs).
// `customerRow` is required, so a query whose select drops or renames it is a type error.
function salesFields(row: {
    sequence: number
    customer: string
    memo: string
    status: string
    customerRow: { display_name: string } | undefined
}) {
    return {
        sequence: row.sequence,
        partyId: row.customer,
        partyName: row.customerRow?.display_name ?? '',
        memo: row.memo,
        recordStatus: row.status,
        reference: '',
        expires: '',
        balance: 0,
        entry: '',
        convertedInvoice: '',
        category: NO_CATEGORY,
        email: '',
    }
}

// The same for a purchase kind. `vendorRow` is required for the same reason; an expense
// with no vendor has none, so its party name is ''.
function purchaseFields(row: {
    sequence: number
    vendor: string
    status: string
    entry: string
    vendorRow: { display_name: string } | undefined
}) {
    return {
        sequence: row.sequence,
        partyId: row.vendor,
        partyName: row.vendorRow?.display_name ?? '',
        memo: '',
        recordStatus: row.status,
        reference: '',
        expires: '',
        balance: 0,
        entry: row.entry,
        convertedInvoice: '',
        category: NO_CATEGORY,
        email: '',
    }
}

function salesLists(
    data: Pick<
        SalesData,
        'invoices' | 'estimates' | 'receipts' | 'payments' | 'creditMemos' | 'refunds' | 'writeOffs'
    >,
    today: string,
    isSigned: boolean
): DocumentListRow[][] {
    const invoiceRows: DocumentListRow[] = (data.invoices ?? []).map(row => ({
        ...invoiceRow(row, today),
        ...salesFields(row),
        balance: row.balance,
        entry: row.entry,
        email: row.email,
    }))
    const estimateRows: DocumentListRow[] = (data.estimates ?? []).map(row => ({
        ...estimateRow(row, today),
        ...salesFields(row),
        expires: row.expiration_date,
        convertedInvoice: row.invoice,
        email: row.email,
    }))
    const receiptRows: DocumentListRow[] = (data.receipts ?? []).map(row => ({
        ...salesReceiptRow(row),
        ...salesFields(row),
        reference: row.reference_no,
        entry: row.entry,
        email: row.email,
    }))
    const paymentRows: DocumentListRow[] = (data.payments ?? []).map(row => ({
        ...paymentRow(row),
        ...salesFields(row),
        reference: row.reference_no,
        entry: row.entry,
    }))
    // creditMemoRow negates the total; a tab that is not signed shows it as stored.
    const creditMemoRows: DocumentListRow[] = (data.creditMemos ?? []).map(row => ({
        ...creditMemoRow(row),
        ...salesFields(row),
        total: isSigned ? -row.total : row.total,
        balance: row.balance,
        entry: row.entry,
        email: row.email,
    }))
    // refundReceiptRow negates the total on every tab: a refund always shows with a minus
    // sign (refund receipt spec §3.13).
    const refundRows: DocumentListRow[] = (data.refunds ?? []).map(row => ({
        ...refundReceiptRow(row),
        ...salesFields(row),
        reference: row.reference_no,
        entry: row.entry,
        creditMemo: row.credit_memo,
        email: row.email,
    }))
    // writeOffRow negates the amount on every tab, as a refund's (write-off spec §3.6).
    const writeOffRows: DocumentListRow[] = (data.writeOffs ?? []).map(row => ({
        ...writeOffRow(row),
        ...salesFields(row),
        entry: row.entry,
    }))
    return [
        invoiceRows,
        estimateRows,
        receiptRows,
        paymentRows,
        creditMemoRows,
        refundRows,
        writeOffRows,
    ]
}

type PurchaseRow<Key extends keyof PurchaseData> = NonNullable<PurchaseData[Key]>[number]

function purchaseLists(
    data: Omit<PurchaseData, 'reads'>,
    today: string,
    isSigned: boolean
): DocumentListRow[][] {
    const billDocument = (row: PurchaseRow<'bills'>, category: PurchaseCategory) => ({
        ...billRow(row, today),
        ...purchaseFields(row),
        memo: row.memo,
        reference: row.ref_no,
        balance: row.balance,
        category,
    })
    const expenseDocument = (row: PurchaseRow<'expenses'>, category: PurchaseCategory) => ({
        ...expenseRow(row),
        ...purchaseFields(row),
        memo: row.memo,
        reference: row.reference_no,
        category,
    })
    // vendorCreditRow negates the total; a tab that is not signed shows it as stored.
    const vendorCreditDocument = (
        row: PurchaseRow<'vendorCredits'>,
        category: PurchaseCategory
    ) => ({
        ...vendorCreditRow(row),
        ...purchaseFields(row),
        total: isSigned ? -row.total : row.total,
        memo: row.memo,
        reference: row.ref_no,
        balance: row.balance,
        category,
    })
    // A row of a tab without the Category column is read with no lines
    // (`usePurchaseListQueries`), so its category is none. Of each kind, one of the two
    // reads runs, so the other gives no rows.
    const billRows: DocumentListRow[] = [
        ...(data.bills ?? []).map(row => billDocument(row, NO_CATEGORY)),
        ...(data.billsWithLines ?? []).map(row => billDocument(row, categoryOf(row.lines))),
    ]
    // A purchase order's Open column and sort read its stored `open_amount` (`balance`);
    // its badge reads its lines (purchaseOrderRow), and `hasBills` its first bill. Its
    // total is shown unsigned on every tab, and it has no entry.
    const purchaseOrderRows: DocumentListRow[] = (data.purchaseOrders ?? []).map(row => {
        const lines = row.lineReceipts ?? []
        return {
            ...purchaseOrderRow(row, lines),
            ...purchaseFields({ ...row, entry: '' }),
            memo: row.memo,
            balance: row.open_amount,
            email: row.email,
            hasBills: row.firstBill !== undefined,
            openLines: lines.filter(isOrderLineOpen).length,
            revision: row.revision,
        }
    })
    const expenseRows: DocumentListRow[] = [
        ...(data.expenses ?? []).map(row => expenseDocument(row, NO_CATEGORY)),
        ...(data.expensesWithLines ?? []).map(row => expenseDocument(row, categoryOf(row.lines))),
    ]
    // A bill payment has no memo.
    const billPaymentRows: DocumentListRow[] = (data.billPayments ?? []).map(row => ({
        ...billPaymentRow(row),
        ...purchaseFields(row),
        reference: row.reference_no,
    }))
    const vendorCreditRows: DocumentListRow[] = [
        ...(data.vendorCredits ?? []).map(row => vendorCreditDocument(row, NO_CATEGORY)),
        ...(data.vendorCreditsWithLines ?? []).map(row =>
            vendorCreditDocument(row, categoryOf(row.lines))
        ),
    ]
    const vendorRefundRows: DocumentListRow[] = (data.vendorRefunds ?? []).map(row => ({
        ...vendorRefundRow(row),
        ...purchaseFields(row),
        memo: row.memo,
        reference: row.reference_no,
    }))
    return [
        billRows,
        purchaseOrderRows,
        expenseRows,
        billPaymentRows,
        vendorCreditRows,
        vendorRefundRows,
    ]
}

/**
 * The rows of one document list (sales and purchase lists specs, §4): the seven sales reads
 * (`useSalesListQueries`) and the five purchase reads (`usePurchaseListQueries`), of which
 * only the kinds the tab lists and its chip keeps run. Each is filtered by the chip, the
 * date range, the party and the search in its `where`, ordered by the sort column then
 * `created` descending, and cut to its first `n` rows. The lists merge in the same order,
 * cut to `n`, so the window is exact. `loadMore` grows `n` by 50 while a source may have
 * more; `n` returns to 50 when the tab, a filter or the sort changes. The rows of the last
 * ready window stay on screen while a new window or a new filter loads (`isBusy`), as long
 * as `keepKey` stays the same; `isLoading` is true only while there is nothing to show.
 * The search text is used as given: the caller debounces it. Amounts draw in the Books
 * settings' currency, so that read is one more the list waits for.
 */
export function useDocumentList({ tab, filters, sort, keepKey: keepKeyOption }: ListInput) {
    const settings = useBooksSettings()
    const today = todayIso()

    // `n` belongs to one tab, filter set and sort; any change starts again at 50.
    const stateKey = tabStateKey(tab)
    const windowKey = JSON.stringify([stateKey, filters, sort])
    const [rowWindow, setRowWindow] = useState({ key: windowKey, n: TRANSACTION_PAGE })
    const n = rowWindow.key === windowKey ? rowWindow.n : TRANSACTION_PAGE

    const { chip, party, search } = filters
    const range = listRange(filters.range, today, fiscalStartMonth(settings.settings))
    const queryKey = (kind: ListKind, runs: boolean) => [
        'books.document-list',
        kind,
        runs,
        stateKey,
        tab.isSigned,
        chip,
        range?.start ?? '',
        range?.end ?? '',
        party,
        search,
        sort.key,
        sort.isAscending,
        today,
        n,
    ]
    const input = { tab, chip, party, search, range, sort, today, n, queryKey }
    // Both run every render (hooks are unconditional); the tab's kinds pick which queries
    // send a request.
    const sales = useSalesListQueries(input)
    const purchases = usePurchaseListQueries(input)

    const isSigned = tab.isSigned
    const { invoices, estimates, receipts, payments, creditMemos, refunds, writeOffs } = sales
    const salesRows = useMemo(
        () =>
            salesLists(
                { invoices, estimates, receipts, payments, creditMemos, refunds, writeOffs },
                today,
                isSigned
            ),
        [invoices, estimates, receipts, payments, creditMemos, refunds, writeOffs, today, isSigned]
    )
    const {
        bills,
        billsWithLines,
        purchaseOrders,
        expenses,
        expensesWithLines,
        billPayments,
        vendorCredits,
        vendorCreditsWithLines,
        vendorRefunds,
    } = purchases
    const purchaseRows = useMemo(
        () =>
            purchaseLists(
                {
                    bills,
                    billsWithLines,
                    purchaseOrders,
                    expenses,
                    expensesWithLines,
                    billPayments,
                    vendorCredits,
                    vendorCreditsWithLines,
                    vendorRefunds,
                },
                today,
                isSigned
            ),
        [
            bills,
            billsWithLines,
            purchaseOrders,
            expenses,
            expensesWithLines,
            billPayments,
            vendorCredits,
            vendorCreditsWithLines,
            vendorRefunds,
            today,
            isSigned,
        ]
    )
    const merged = useMemo(
        () => documentListWindow([...salesRows, ...purchaseRows], n, sort),
        [salesRows, purchaseRows, n, sort]
    )

    const running = [...sales.reads, ...purchases.reads].filter(read => read.isRunning)
    const failed = running.filter(read => read.isError)
    const anyError = failed.length > 0 || settings.hasLoadError
    const isPending =
        running.some(read => !read.isReady && !read.isError) ||
        (!settings.isReady && !settings.hasLoadError)
    // The settings read gives the currency every amount draws in, so the rows wait for it.
    const isReady = running.every(read => read.isReady) && settings.isReady

    // A larger window, a filter or a sort is a new query: the rows of the last ready
    // window stay on screen while it loads, through any change on the same keep key. The
    // customer page's tab key holds its customer, and the vendor page's keep key its
    // vendor, so a reused page does not show the last party's rows; All sales and All
    // purchases have different state keys, so neither shows the other's rows. No `limit`
    // is passed: a filter or sort change drops `n` back to 50, and the last rows must
    // still stay through it.
    const keepKey = keepKeyOption ?? stateKey
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

    // Each read's part is non-empty only when its own query failed, so Retry restarts only
    // the failed reads. A screen with other reads (the lists' access read) merges this into
    // its one recovery call; `retry` is that call for a caller with none.
    const recovery = mergeRecoveries([...failed.map(read => read.recovery), settings.recovery])
    const logContext = areaOf(tab).logContext
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.warn(logContext, 'retry failed', { err }),
        })
    }
    // Rows show only once the settings read is ready, so the fallback is used only by a
    // book that has no settings row yet, as in the rest of Books.
    const currency = settings.settings?.currency ?? 'USD'

    return {
        rows: rows ?? [],
        currency,
        isLoading,
        isError,
        isBusy,
        recovery,
        retry,
        loadMore,
        hasMore,
    }
}
