import { DEFAULT_LIST_FILTERS, DEFAULT_LIST_SORT } from '../lib/document-list'
import type { TransactionFilter } from '../lib/party-transactions'
import { customerTransactionsTab } from '../lib/sales-lists'
import { useDocumentList } from './useDocumentList'

/**
 * One customer's invoices, estimates, sales receipts, payments and credit memos, newest
 * first, `n` at a time (spec §3.5 of the customer pages), read through the sales lists'
 * `useDocumentList` with the customer fixed: a filter other than `all` runs only its
 * kind's query, a void original that a correction replaced is left out, a credit memo
 * shows negative, and `loadMore` grows the window by 50 while a source may have more.
 */
export function useCustomerTransactions(customerId: string, filter: TransactionFilter) {
    // The customer is in the tab key, so the rows of another customer never stay on screen.
    const tab = { ...customerTransactionsTab(filter), key: `customer-${customerId}-${filter}` }
    const list = useDocumentList({
        tab,
        filters: { ...DEFAULT_LIST_FILTERS, customer: customerId },
        sort: DEFAULT_LIST_SORT,
    })
    const { rows, currency, isLoading, isError, retry, loadMore, hasMore } = list
    return { rows, currency, isLoading, isError, retry, loadMore, hasMore }
}
