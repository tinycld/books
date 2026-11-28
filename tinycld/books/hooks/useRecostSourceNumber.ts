import { type Collection, eq, type UtilsRecord } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

type SourceCollection<
    TRow extends { id: string; number: string },
    TUtils extends UtilsRecord,
    TInsert extends object,
> = Collection<TRow, string | number, TUtils, never, TInsert>

// One source collection's read of the re-cost's document: no query unless `source` names
// this collection, so a manual adjustment and the other seven collections read nothing.
function useSourceRead<
    TRow extends { id: string; number: string },
    TUtils extends UtilsRecord,
    TInsert extends object,
>(collection: SourceCollection<TRow, TUtils, TInsert>, documentId: string | null) {
    const query = useLiveQuery({
        query: q => {
            if (!documentId) return undefined
            return q
                .from({ d: collection })
                .where(({ d }) => eq(d.id, documentId))
                .select(({ d }) => ({ number: d.number }))
                .findOne()
        },
        queryKey: ['books.inventory-adjustment.recost-source', collection.id, documentId],
    })
    const isEnabled = documentId !== null
    const isError = isEnabled && query.isError
    const recovery: LiveRecovery = isError
        ? { queries: [query.collection], sources: [collection] }
        : NO_RECOVERY
    return {
        isEnabled,
        number: isError ? undefined : query.data?.number,
        isReady: !isEnabled || query.isReady || isError,
        isError,
        recovery,
    }
}

type RecostSourceInput = { kind: string; source: string; document: string }

/**
 * The number of a re-cost's source document (inventory-adjust spec §3.5, §3.13), read from
 * the one collection of the stock-moving documents that `source` names; nothing is read
 * for any other kind. `number` is undefined while the read loads, when it fails and when
 * the document is gone. A failed read gives its query and the source collection to the
 * screen's one merged recovery.
 */
export function useRecostSourceNumber(adjustment: RecostSourceInput | null) {
    const [
        bills,
        creditMemos,
        expenses,
        invoices,
        refundReceipts,
        salesReceipts,
        vendorCredits,
        adjustments,
    ] = useStore(
        'books_bills',
        'books_credit_memos',
        'books_expenses',
        'books_invoices',
        'books_refund_receipts',
        'books_sales_receipts',
        'books_vendor_credits',
        'books_inventory_adjustments'
    )
    const isRecost = adjustment?.kind === 'recost' && adjustment.document !== ''
    const documentOf = (name: string) =>
        isRecost && adjustment.source === name ? adjustment.document : null
    const reads = [
        useSourceRead(bills, documentOf('books_bills')),
        useSourceRead(creditMemos, documentOf('books_credit_memos')),
        useSourceRead(expenses, documentOf('books_expenses')),
        useSourceRead(invoices, documentOf('books_invoices')),
        useSourceRead(refundReceipts, documentOf('books_refund_receipts')),
        useSourceRead(salesReceipts, documentOf('books_sales_receipts')),
        useSourceRead(vendorCredits, documentOf('books_vendor_credits')),
        useSourceRead(adjustments, documentOf('books_inventory_adjustments')),
    ]
    const read = reads.find(each => each.isEnabled)
    return {
        number: read?.number,
        isReady: read?.isReady ?? true,
        isError: read?.isError ?? false,
        recovery: read?.recovery ?? NO_RECOVERY,
    }
}
