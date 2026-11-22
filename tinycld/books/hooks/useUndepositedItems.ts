import { and, eq, inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import { mergeItems, staleItemText } from '../lib/deposit'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import type { DepositItemRow } from './useDepositRecord'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }
const NO_LINES: readonly string[] = []

// A stored item as the list draws it: its copy fields, and its journal line's memo in the
// place the view's `memo` column has.
function storedAsListed(item: DepositItemRow) {
    return {
        line: item.line,
        entry: item.entry,
        account: item.account,
        date: item.date,
        doc_type: item.doc_type,
        number: item.number,
        document: item.document,
        customer: item.customer,
        vendor: item.vendor,
        amount: item.amount,
        payment_method: item.payment_method,
        reference_no: item.reference_no,
        memo: item.lineMemo ?? '',
        customerRow: item.customerRow,
        vendorRow: item.vendorRow,
        accountRow: item.accountRow,
    }
}

/**
 * The deposit form's list (bank deposit spec §3.4, Do step 2): every undeposited item
 * (`books_undeposited_items`), by date then entry number, with its party and its
 * Undeposited funds account through `materialize()`; then each item that a draft's stored
 * rows or a correction's original name and that the view no longer lists (lib/deposit.ts
 * `mergeItems`). For those, a second read, only while one exists, gives the entry's status
 * and the posted deposit that holds the line, and `staleText` is the refusal under the row
 * ("Payment 1004 is void.", "…is already in Deposit 1002."). The original a correction
 * edits (`originalId`) holds its own items until the correction posts, so its hold is no
 * refusal. Loading follows the list's read; a failure of either read is the error, with
 * one recovery over both.
 */
export function useUndepositedItems(stored: readonly DepositItemRow[], originalId = '') {
    const [
        undepositedCollection,
        accountsCollection,
        customersCollection,
        vendorsCollection,
        journalLinesCollection,
        entriesCollection,
        depositItemsCollection,
        depositsCollection,
    ] = useStore(
        'books_undeposited_items',
        'books_accounts',
        'books_customers',
        'books_vendors',
        'books_journal_lines',
        'books_journal_entries',
        'books_deposit_items',
        'books_deposits'
    )
    const listedQuery = useLiveQuery({
        query: q =>
            q
                .from({ u: undepositedCollection })
                .orderBy(({ u }) => u.date)
                .orderBy(({ u }) => u.number)
                .select(({ u }) => ({
                    line: u.line,
                    entry: u.entry,
                    account: u.account,
                    date: u.date,
                    doc_type: u.doc_type,
                    number: u.number,
                    document: u.document,
                    customer: u.customer,
                    vendor: u.vendor,
                    amount: u.amount,
                    payment_method: u.payment_method,
                    reference_no: u.reference_no,
                    memo: u.memo,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, u.customer))
                            .select(({ c }) => ({ display_name: c.display_name }))
                            .findOne()
                    ),
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, u.vendor))
                            .select(({ v }) => ({ display_name: v.display_name }))
                            .findOne()
                    ),
                    accountRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, u.account))
                            .select(({ a }) => ({ number: a.number, name: a.name }))
                            .findOne()
                    ),
                })),
        queryKey: ['books.deposit.undeposited'],
    })
    const listed = listedQuery.data
    const merged = useMemo(
        () => mergeItems(listed ?? [], stored.map(storedAsListed)),
        [listed, stored]
    )
    const staleLines = useMemo(() => {
        const lines = merged.filter(row => !row.depositable).map(row => row.line)
        return lines.length === 0 ? NO_LINES : lines
    }, [merged])
    const staleKey = staleLines.join(',')
    const staleQuery = useLiveQuery({
        query: q => {
            if (staleLines.length === 0) return undefined
            return q
                .from({ jl: journalLinesCollection })
                .where(({ jl }) => inArray(jl.id, [...staleLines]))
                .select(({ jl }) => ({
                    id: jl.id,
                    entryStatus: materialize(
                        q
                            .from({ e: entriesCollection })
                            .where(({ e }) => eq(e.id, jl.entry))
                            .select(({ e }) => e.status)
                            .findOne()
                    ),
                    holder: materialize(
                        q
                            .from({ di: depositItemsCollection })
                            .where(({ di }) => and(eq(di.line, jl.id), eq(di.posted, true)))
                            .select(({ di }) => ({
                                depositId: di.deposit,
                                deposit: materialize(
                                    q
                                        .from({ d: depositsCollection })
                                        .where(({ d }) => eq(d.id, di.deposit))
                                        .select(({ d }) => ({ number: d.number }))
                                        .findOne()
                                ),
                            }))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.deposit.stale', staleKey],
    })
    const staleRows = staleQuery.data
    const items = useMemo(() => {
        const byLine = new Map((staleRows ?? []).map(row => [row.id, row]))
        return merged.map(row => {
            const stale = row.depositable ? undefined : byLine.get(row.line)
            const isOwnOriginal = originalId !== '' && stale?.holder?.depositId === originalId
            const holder = isOwnOriginal ? null : (stale?.holder?.deposit ?? null)
            const staleText = stale ? staleItemText(row, stale.entryStatus, holder) : null
            return { ...row, staleText }
        })
    }, [merged, staleRows, originalId])
    const related = [accountsCollection, customersCollection, vendorsCollection]
    const listedRecovery: LiveRecovery = listedQuery.isError
        ? { queries: [listedQuery.collection], sources: [undepositedCollection, ...related] }
        : NO_RECOVERY
    const staleRecovery: LiveRecovery = staleQuery.isError
        ? {
              queries: [staleQuery.collection],
              sources: [
                  journalLinesCollection,
                  entriesCollection,
                  depositItemsCollection,
                  depositsCollection,
              ],
          }
        : NO_RECOVERY
    return {
        items,
        isLoading: !listedQuery.isReady,
        isError: listedQuery.isError || (staleLines.length > 0 && staleQuery.isError),
        recovery: mergeRecoveries([listedRecovery, staleRecovery]),
    }
}

export type UndepositedItem = ReturnType<typeof useUndepositedItems>['items'][number]
