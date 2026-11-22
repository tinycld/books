import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * A deposit by id (bank deposit spec §4.4): the header with its Deposit to account, the
 * names of the people who posted and voided it and the deposit that replaced it; its item
 * rows in position order with the party, the Undeposited funds account and the memo of
 * the item's journal line; its other funds
 * lines in position order with the account and the party. Every related row comes through
 * `materialize()`, so a party or account row that is gone leaves the field undefined and
 * never drops the row. An empty id reads nothing and is ready. Each read that fails gives
 * its query and its sources to the one merged recovery.
 */
export function useDepositRecord(id: string) {
    const [
        depositsCollection,
        itemsCollection,
        linesCollection,
        accountsCollection,
        customersCollection,
        vendorsCollection,
        usersCollection,
        journalLinesCollection,
    ] = useStore(
        'books_deposits',
        'books_deposit_items',
        'books_deposit_lines',
        'books_accounts',
        'books_customers',
        'books_vendors',
        'users',
        'books_journal_lines'
    )
    const depositQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ deposit: depositsCollection })
                .where(({ deposit }) => eq(deposit.id, id))
                .select(({ deposit }) => ({
                    id: deposit.id,
                    status: deposit.status,
                    number: deposit.number,
                    date: deposit.date,
                    memo: deposit.memo,
                    total: deposit.total,
                    items_total: deposit.items_total,
                    lines_total: deposit.lines_total,
                    entry: deposit.entry,
                    replaces: deposit.replaces,
                    deposit_to: deposit.deposit_to,
                    posted_at: deposit.posted_at,
                    voided_at: deposit.voided_at,
                    depositTo: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, deposit.deposit_to))
                            .select(({ a }) => ({ number: a.number, name: a.name }))
                            .findOne()
                    ),
                    postedByName: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, deposit.posted_by))
                            .select(({ u }) => u.name)
                            .findOne()
                    ),
                    voidedByName: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, deposit.voided_by))
                            .select(({ u }) => u.name)
                            .findOne()
                    ),
                    replacement: materialize(
                        q
                            .from({ r: depositsCollection })
                            .where(({ r }) => eq(r.id, deposit.replaced_by))
                            .select(({ r }) => ({ id: r.id, number: r.number }))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.deposit.record', id],
    })
    const itemsQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ item: itemsCollection })
                .where(({ item }) => eq(item.deposit, id))
                .orderBy(({ item }) => item.position)
                .select(({ item }) => ({
                    id: item.id,
                    line: item.line,
                    position: item.position,
                    entry: item.entry,
                    amount: item.amount,
                    date: item.date,
                    doc_type: item.doc_type,
                    number: item.number,
                    document: item.document,
                    payment_method: item.payment_method,
                    reference_no: item.reference_no,
                    account: item.account,
                    customer: item.customer,
                    vendor: item.vendor,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, item.customer))
                            .select(({ c }) => ({ display_name: c.display_name }))
                            .findOne()
                    ),
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, item.vendor))
                            .select(({ v }) => ({ display_name: v.display_name }))
                            .findOne()
                    ),
                    accountRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, item.account))
                            .select(({ a }) => ({ number: a.number, name: a.name }))
                            .findOne()
                    ),
                    // The item row has no memo copy field: a journal entry's or a
                    // transfer's Payment text is its journal line's memo.
                    lineMemo: materialize(
                        q
                            .from({ jl: journalLinesCollection })
                            .where(({ jl }) => eq(jl.id, item.line))
                            .select(({ jl }) => jl.memo)
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.deposit.items', id],
    })
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.deposit, id))
                .orderBy(({ line }) => line.position)
                .select(({ line }) => ({
                    id: line.id,
                    position: line.position,
                    description: line.description,
                    amount: line.amount,
                    account: line.account,
                    customer: line.customer,
                    vendor: line.vendor,
                    accountRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, line.account))
                            .select(({ a }) => ({ number: a.number, name: a.name }))
                            .findOne()
                    ),
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, line.customer))
                            .select(({ c }) => ({ display_name: c.display_name }))
                            .findOne()
                    ),
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, line.vendor))
                            .select(({ v }) => ({ display_name: v.display_name }))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.deposit.lines', id],
    })
    const deposit = id ? (depositQuery.data ?? null) : null
    const items = itemsQuery.data ?? []
    const lines = linesQuery.data ?? []
    // Core cleans only a source whose load failed, so each failed read may name the
    // related collections it materializes from too.
    const related = [accountsCollection, customersCollection, vendorsCollection]
    const depositRecovery: LiveRecovery = depositQuery.isError
        ? {
              queries: [depositQuery.collection],
              sources: [depositsCollection, usersCollection, ...related],
          }
        : NO_RECOVERY
    const itemsRecovery: LiveRecovery = itemsQuery.isError
        ? {
              queries: [itemsQuery.collection],
              sources: [itemsCollection, journalLinesCollection, ...related],
          }
        : NO_RECOVERY
    const linesRecovery: LiveRecovery = linesQuery.isError
        ? { queries: [linesQuery.collection], sources: [linesCollection, ...related] }
        : NO_RECOVERY
    const recovery = mergeRecoveries([depositRecovery, itemsRecovery, linesRecovery])
    const isError = !!id && (depositQuery.isError || itemsQuery.isError || linesQuery.isError)
    const isReady =
        !id || (depositQuery.isReady && itemsQuery.isReady && linesQuery.isReady) || isError
    return { deposit, items, lines, isReady, isError, recovery }
}

export type DepositRecordView = ReturnType<typeof useDepositRecord>
export type DepositRecordHeader = NonNullable<DepositRecordView['deposit']>
export type DepositItemRow = DepositRecordView['items'][number]
export type DepositLineRow = DepositRecordView['lines'][number]
