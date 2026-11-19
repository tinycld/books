import { useId, useState } from 'react'
import { useCustomerTransactions } from '../../../hooks/useCustomerTransactions'
import type { DocumentListRow } from '../../../lib/document-list'
import { documentHref } from '../../../lib/document-routes'
import {
    emptyText,
    type PartyTransactionRow,
    TRANSACTION_DOC_KINDS,
    TRANSACTION_FILTERS,
    TRANSACTION_TYPE_LABELS,
    type TransactionFilter,
    type TransactionKind,
} from '../../../lib/party-transactions'
import { PartyTransactionsList } from '../../party/page/PartyTransactionsList'
import { WriteOffDialog } from '../../write-offs/WriteOffDialog'
import { CustomerInvoiceRowMenu } from './CustomerInvoiceRowMenu'

const TEXTS = {
    empty: emptyText('all'),
    noMatch: (filter: TransactionKind) => emptyText(filter),
}

const hrefOf = (row: PartyTransactionRow) => documentHref(TRANSACTION_DOC_KINDS[row.kind], row.id)

interface CustomerTransactionsTabProps {
    customerId: string
    canWrite: boolean
    newTransactionDisabled: boolean
    onNewTransaction: () => void
    gutterClass: string
}

/**
 * The customer page's default tab (spec §3.5): every invoice, estimate, sales receipt,
 * payment, credit memo, refund receipt and write-off of the customer, newest first, with
 * type chips. The chip is local to the tab and starts at All whenever the page mounts. An
 * invoice that can be written off has a row menu with Write off (CustomerInvoiceRowMenu),
 * whose dialog this tab mounts once, owned by it, so it opens over the page.
 */
export function CustomerTransactionsTab({
    customerId,
    canWrite,
    newTransactionDisabled,
    onNewTransaction,
    gutterClass,
}: CustomerTransactionsTabProps) {
    const [filter, setFilter] = useState<TransactionFilter>('all')
    const transactions = useCustomerTransactions(customerId, filter)
    const recovery = { isError: transactions.isError, retry: transactions.retry }
    const owner = useId()
    const rowMenu = (row: DocumentListRow) => <CustomerInvoiceRowMenu row={row} owner={owner} />
    return (
        <>
            <PartyTransactionsList<TransactionKind, DocumentListRow>
                rows={transactions.rows}
                filter={filter}
                filters={TRANSACTION_FILTERS}
                onFilter={setFilter}
                isLoading={transactions.isLoading}
                recovery={recovery}
                hasMore={transactions.hasMore}
                onMore={transactions.loadMore}
                currency={transactions.currency}
                hrefOf={hrefOf}
                texts={TEXTS}
                typeLabels={TRANSACTION_TYPE_LABELS}
                canWrite={canWrite}
                onNew={onNewTransaction}
                isNewDisabled={newTransactionDisabled}
                gutterClass={gutterClass}
                testIdPrefix="customer"
                rowMenu={rowMenu}
            />
            <WriteOffDialog owner={owner} />
        </>
    )
}
