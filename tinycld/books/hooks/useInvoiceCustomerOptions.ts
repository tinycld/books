import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { materialize } from 'pbtsdb'
import { PICKER_LIMIT } from '../lib/customer-tree'
import { invoiceCustomerOptions } from '../lib/invoice-fills'
import { SORT_KEY_ORDER } from '../lib/list-search'

/**
 * The invoice's Customer picker options: active customers in tree order (sort_key: each
 * customer followed by its sub-customers), a sub-customer labelled "Parent: Child" from
 * its materialized parent, searched on the client on that label
 * (`invoiceCustomerOptions`). The query runs only while the picker is open. The server
 * limit applies only while not searching: a limit pushed during a search would cut
 * matches before the filter sees them (the useLinePartyOptions pattern).
 */
export function useInvoiceCustomerOptions(term: string, isOpen: boolean) {
    const [customersCollection] = useStore('books_customers')
    const isSearching = term.trim() !== ''
    const query = useLiveQuery({
        query: q => {
            if (!isOpen) return null
            const base = q
                .from({ c: customersCollection })
                .where(({ c }) => eq(c.inactive, false))
                .orderBy(({ c }) => c.sort_key, SORT_KEY_ORDER)
                .select(({ c }) => ({
                    id: c.id,
                    display_name: c.display_name,
                    parentRow: materialize(
                        q
                            .from({ parent: customersCollection })
                            .where(({ parent }) => eq(parent.id, c.parent))
                            .findOne()
                    ),
                }))
            return isSearching ? base : base.limit(PICKER_LIMIT)
        },
        queryKey: ['books.invoice.customers', isOpen, isSearching],
    })
    const loadFailed = query.isError
    const isLoading = isOpen && !loadFailed && query.isLoading
    const customers = (query.data ?? []).map(row => ({
        id: row.id,
        display_name: row.display_name,
        parentName: row.parentRow?.display_name,
    }))
    const options = invoiceCustomerOptions({ customers, term })
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [customersCollection],
            onError: err => log.error('books.invoice.customers', err),
        })
    }
    return { options, isLoading, loadFailed, retry }
}
