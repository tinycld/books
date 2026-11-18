import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { TableRowWrite } from '@tinycld/core/lib/forms/table-rows'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import type { DocumentLineMapper } from '../components/documents/document-kinds'
import type { PurchaseLineValues } from '../lib/purchase-line-columns'
import type { PurchaseLines } from '../lib/purchase-lines'
import { isPurchaseAccountListed } from '../lib/purchase-pickers'
import type { TableWriteOps } from '../lib/table-writes'
import {
    type DocumentRead,
    type DocumentScreenInput,
    type DocumentScreenReads,
    type DocumentSource,
    type DocumentTransaction,
    documentRead,
    NO_RECOVERY,
    purchaseLineMapperOf,
} from './document-data'
import { useBooksSettings } from './useBooksSettings'

// The reads and writes every purchase kind's data source (hooks/bill-data.ts,
// hooks/expense-data.ts, hooks/vendor-credit-data.ts) shares. Each kind keeps its own
// `useStore` of its document collections; the vendors, accounts and settings read here are
// shared collections.

// A purchase kind has no customer, bill-to address, email, tax rate, message or tax (it
// prints nothing), so those shared columns are ''/null/0 on it: every shared reader keeps
// its type, and none of them finds a customer or a tax on a purchase.
export const PURCHASE_SALES_COLUMNS: Pick<
    DocumentSource,
    'customer' | 'bill_to' | 'email' | 'tax_rate' | 'message' | 'tax_total'
> = {
    customer: '',
    bill_to: null,
    email: '',
    tax_rate: '',
    message: '',
    tax_total: 0,
}

// A purchase kind has no sales tax, so it has no tax snapshot to read.
export const NO_PURCHASE_TAX_LINES: DocumentScreenReads['taxLines'] = {
    data: [],
    isReady: true,
    isError: false,
    recovery: NO_RECOVERY,
}

// On a new form opened with `?vendor`: that vendor's default expense account, as one
// query (the vendor with its account), which says whether the Account picker lists it.
function useVendorAccountQuery(keyBase: string, vendorId: string) {
    const [vendorsCollection, accountsCollection] = useStore('books_vendors', 'books_accounts')
    const query = useLiveQuery({
        query: q => {
            if (!vendorId) return undefined
            return q
                .from({ v: vendorsCollection })
                .where(({ v }) => eq(v.id, vendorId))
                .select(({ v }) => ({
                    id: v.id,
                    account: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, v.expense_account))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: [`${keyBase}.vendor-account`, vendorId],
    })
    return { query, sources: [vendorsCollection, accountsCollection] }
}

/**
 * What every purchase kind's form starts from: the Purchase lines setting (Settings →
 * Purchases), which decides the tables a new form shows, and on a new form opened with
 * `?vendor` whether the Account picker lists the vendor's default expense account
 * (isPurchaseAccountListed), which then starts the first account line (undefined without
 * `?vendor`). The settings row is the screen's own read (its readiness, its error and its
 * Retry are there, useDocumentScreen); the vendor's account is this read's own
 * (`vendorRead`), so its loading, its error and its Retry join the screen's. `keyBase` is
 * the kind's query key prefix (`books.bill`).
 */
export function usePurchaseStart(
    input: DocumentScreenInput,
    keyBase: string
): {
    purchaseLines: PurchaseLines
    vendorAccountListed: boolean | undefined
    vendorRead: DocumentRead<undefined>
} {
    const { settings } = useBooksSettings()
    const purchaseLines = settings?.purchase_lines ?? 'both'
    const vendorId = input.id === null ? (input.vendor ?? '') : ''
    const { query, sources } = useVendorAccountQuery(keyBase, vendorId)
    const vendorAccountListed = vendorId ? isPurchaseAccountListed(query.data?.account) : undefined
    return {
        purchaseLines,
        vendorAccountListed,
        vendorRead: documentRead(vendorId, query, undefined, sources),
    }
}

// A purchase line's record as the kind's lines collection stores it, without the parent
// field: its insert carries amount 0 under the row's own (a product line's record has
// none, and the server writes Qty x Rate over the 0).
export type PurchaseLineInsert = PurchaseLineValues & { id: string; amount: number }

/**
 * One purchase line table's writes (DocumentWrites.lineOps): each row converts through the
 * table's mapper; the kind's `insert`, `update` and `remove` write its own lines
 * collection, the insert with the parent field set.
 */
export function purchaseLineOps(
    mapper: DocumentLineMapper,
    lines: {
        insert: (record: PurchaseLineInsert) => DocumentTransaction
        update: (id: string, record: PurchaseLineValues) => DocumentTransaction
        remove: (id: string) => DocumentTransaction
    }
): TableWriteOps<DocumentTransaction> {
    const { toRecord } = purchaseLineMapperOf(mapper)
    const lineRecord = (write: TableRowWrite) => toRecord(write.row, write.position)
    return {
        insert: write => lines.insert({ id: write.row.id, amount: 0, ...lineRecord(write) }),
        update: write => lines.update(write.row.id, lineRecord(write)),
        remove: lines.remove,
    }
}
