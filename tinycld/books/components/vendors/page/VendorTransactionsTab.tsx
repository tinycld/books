import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useState } from 'react'
import type { VendorPageState } from '../../../hooks/useVendorPage'
import { useVendorTransactions } from '../../../hooks/useVendorTransactions'
import {
    VENDOR_TRANSACTION_FILTERS,
    VENDOR_TRANSACTION_TEXTS,
    VENDOR_TRANSACTION_TYPE_LABELS,
    type VendorTransactionFilter,
    type VendorTransactionKind,
    vendorTransactionHref,
} from '../../../lib/vendor-transactions'
import type { BooksVendors } from '../../../types'
import { PartyTransactionsList } from '../../party/page/PartyTransactionsList'

interface VendorTransactionsTabProps {
    record: BooksVendors
    page: Pick<VendorPageState, 'canWrite' | 'controls' | 'setNewMenuOpen'>
    gutterClass: string
}

/**
 * The vendor page's default tab (vendor pages §3.5): every bill, expense, bill payment,
 * vendor credit and vendor refund of the vendor, newest first, with type chips. The chip
 * is local to the tab and starts at All whenever the page mounts. The empty state's New
 * transaction opens the header's menu.
 */
export function VendorTransactionsTab({ record, page, gutterClass }: VendorTransactionsTabProps) {
    const [filter, setFilter] = useState<VendorTransactionFilter>('all')
    const transactions = useVendorTransactions(record.id, filter)
    const failed = transactions.recovery
    const retry = () => {
        if (failed === null) return
        void recoverLiveQueries({
            ...failed,
            onError: err => log.warn('books.vendor-page', 'retry failed', { err }),
        })
    }
    const recovery = { isError: failed !== null, retry }
    const openNewMenu = () => page.setNewMenuOpen(true)
    return (
        <PartyTransactionsList<VendorTransactionKind>
            rows={transactions.rows}
            filter={filter}
            filters={VENDOR_TRANSACTION_FILTERS}
            onFilter={setFilter}
            isLoading={transactions.isLoading}
            recovery={recovery}
            hasMore={transactions.hasMore}
            onMore={transactions.loadMore}
            currency={transactions.currency}
            hrefOf={vendorTransactionHref}
            texts={VENDOR_TRANSACTION_TEXTS}
            typeLabels={VENDOR_TRANSACTION_TYPE_LABELS}
            canWrite={page.canWrite}
            onNew={openNewMenu}
            isNewDisabled={page.controls.newTransactionDisabled}
            gutterClass={gutterClass}
            testIdPrefix="vendor"
        />
    )
}
