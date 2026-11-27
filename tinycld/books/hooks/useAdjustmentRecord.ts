import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// The header with `openingItemName`: the name of the product an opening adjustment's
// `document` names (undefined for any other kind, and when that product is gone).
function headerOf<T extends { kind: string; documentProductName: string | undefined }>(
    row: T | undefined
) {
    if (!row) return null
    const { documentProductName, ...header } = row
    const openingItemName = row.kind === 'opening' ? documentProductName : undefined
    return { ...header, openingItemName }
}

/**
 * An inventory adjustment by id (inventory-adjust spec §3.5): the header with its
 * adjustment account, the names of the people who posted and voided it, the adjustment
 * that replaced it and, for an opening adjustment, the name of its item; its lines in position order, each with its item, its bin and
 * `posted_value`, the value Books posted for the line (server-written at the post, kept by
 * a void). Every related row comes through `materialize()`, so an item, bin, account or
 * user that is gone leaves the field undefined and never drops the row. An empty id reads
 * nothing and is ready. Each read that fails gives its query and its sources to the one
 * merged recovery.
 */
export function useAdjustmentRecord(id: string) {
    const [
        adjustmentsCollection,
        linesCollection,
        productsCollection,
        binsCollection,
        accountsCollection,
        usersCollection,
    ] = useStore(
        'books_inventory_adjustments',
        'books_inventory_adjustment_lines',
        'books_products',
        'books_bins',
        'books_accounts',
        'users'
    )
    const adjustmentQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ adjustment: adjustmentsCollection })
                .where(({ adjustment }) => eq(adjustment.id, id))
                .select(({ adjustment }) => ({
                    id: adjustment.id,
                    status: adjustment.status,
                    kind: adjustment.kind,
                    number: adjustment.number,
                    date: adjustment.date,
                    memo: adjustment.memo,
                    source: adjustment.source,
                    document: adjustment.document,
                    currency: adjustment.currency,
                    entry: adjustment.entry,
                    value_change: adjustment.value_change,
                    replaces: adjustment.replaces,
                    replaced_by: adjustment.replaced_by,
                    posted_at: adjustment.posted_at,
                    voided_at: adjustment.voided_at,
                    accountRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, adjustment.account))
                            .select(({ a }) => ({ number: a.number, name: a.name }))
                            .findOne()
                    ),
                    postedByName: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, adjustment.posted_by))
                            .select(({ u }) => u.name)
                            .findOne()
                    ),
                    voidedByName: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, adjustment.voided_by))
                            .select(({ u }) => u.name)
                            .findOne()
                    ),
                    replacement: materialize(
                        q
                            .from({ r: adjustmentsCollection })
                            .where(({ r }) => eq(r.id, adjustment.replaced_by))
                            .select(({ r }) => ({ id: r.id, number: r.number }))
                            .findOne()
                    ),
                    documentProductName: materialize(
                        q
                            .from({ p: productsCollection })
                            .where(({ p }) => eq(p.id, adjustment.document))
                            .select(({ p }) => p.name)
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.inventory-adjustment.record', id],
    })
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.adjustment, id))
                .orderBy(({ line }) => line.position)
                .select(({ line }) => ({
                    id: line.id,
                    position: line.position,
                    product: line.product,
                    quantity: line.quantity,
                    value: line.value,
                    posted_value: line.posted_value,
                    bin: line.bin,
                    productName: materialize(
                        q
                            .from({ p: productsCollection })
                            .where(({ p }) => eq(p.id, line.product))
                            .select(({ p }) => p.name)
                            .findOne()
                    ),
                    binRow: materialize(
                        q
                            .from({ b: binsCollection })
                            .where(({ b }) => eq(b.id, line.bin))
                            .select(({ b }) => ({ name: b.name, inactive: b.inactive }))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.inventory-adjustment.lines', id],
    })
    const adjustment = id ? headerOf(adjustmentQuery.data) : null
    const lines = linesQuery.data ?? []
    // Core cleans only a source whose load failed, so each failed read names the related
    // collections it materializes from too.
    const adjustmentRecovery: LiveRecovery = adjustmentQuery.isError
        ? {
              queries: [adjustmentQuery.collection],
              sources: [
                  adjustmentsCollection,
                  accountsCollection,
                  usersCollection,
                  productsCollection,
              ],
          }
        : NO_RECOVERY
    const linesRecovery: LiveRecovery = linesQuery.isError
        ? {
              queries: [linesQuery.collection],
              sources: [linesCollection, productsCollection, binsCollection],
          }
        : NO_RECOVERY
    const recovery = mergeRecoveries([adjustmentRecovery, linesRecovery])
    const isError = !!id && (adjustmentQuery.isError || linesQuery.isError)
    const isReady = !id || (adjustmentQuery.isReady && linesQuery.isReady) || isError
    return { adjustment, lines, isReady, isError, recovery }
}

export type AdjustmentRecordView = ReturnType<typeof useAdjustmentRecord>
export type AdjustmentRecordHeader = NonNullable<AdjustmentRecordView['adjustment']>
export type AdjustmentLineRow = AdjustmentRecordView['lines'][number]
