import { DEFAULT_LIST_FILTERS, DEFAULT_LIST_SORT, isPurchaseRow } from '../lib/document-list'
import { vendorTransactionsTab } from '../lib/purchase-lists'
import type { VendorTransactionFilter } from '../lib/vendor-transactions'
import { useDocumentList } from './useDocumentList'

/**
 * One vendor's bills, expenses, bill payments, vendor credits and vendor refunds, newest
 * first, `n` at a time (vendor pages §3.5), read through the lists' `useDocumentList` with
 * the vendor fixed (`vendorTransactionsTab`): a filter other than `all` runs only its
 * kind's query, a void original that a correction replaced is left out, a vendor credit
 * shows negative, and `loadMore` grows the window by 50 while a source may have more.
 * Amounts draw in the Books settings' currency, so the list waits for it.
 */
export function useVendorTransactions(vendorId: string, filter: VendorTransactionFilter) {
    const fixed = vendorTransactionsTab(filter)
    // A blank vendor id would drop the vendor clause and list every vendor's documents, so
    // the tab then lists no kind: no query runs and the list is empty.
    const kinds = vendorId === '' ? [] : fixed.kinds
    const tab = { ...fixed, kinds, key: `vendor-${vendorId}-${filter}` }
    // The keep key is the vendor alone: a change of the kind chip keeps the vendor's rows on
    // screen while the new rows load, and another vendor's rows never stay.
    const list = useDocumentList({
        tab,
        filters: { ...DEFAULT_LIST_FILTERS, party: vendorId },
        sort: DEFAULT_LIST_SORT,
        keepKey: `vendor-${vendorId}`,
    })
    const { currency, isError, loadMore, hasMore } = list
    // An empty kept list is not shown while reads load: an empty list is final only when
    // every running read is ready, so "No expenses" never shows as "No transactions" while
    // the All chip's other reads load.
    const isLoading = list.isLoading || (list.isBusy && list.rows.length === 0)
    // A failed read shows once the others are in, as the list's own error does.
    const recovery = isError && !isLoading ? list.recovery : null
    // The tab lists the purchase kinds only; the guard gives the rows their purchase kind
    // type.
    const rows = list.rows.filter(isPurchaseRow)
    return { rows, isLoading, recovery, hasMore, loadMore, currency }
}
