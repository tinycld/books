import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import {
    allOf,
    chipClauses,
    chipRuns,
    kindDirection,
    type ListQueryInput,
    type ListRead,
    listedClause,
    rangeClauses,
    searchClauses,
    sortField,
} from '../lib/document-list'
import { searchPieces } from '../lib/list-search'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * The seven sales reads of a document list (sales lists spec §4, and the customer page's
 * write-offs, write-off spec §3.6): one live query per kind
 * the tab lists, each filtered by the chip, the date range, the customer and the search in
 * its `where`, ordered by the sort column then `created` descending, and cut to its first
 * `n` rows, with the customer's row through `materialize`. A query whose kind the tab does
 * not list (every query on a purchase tab) or whose chip lists none of the kind returns
 * `undefined` and sends no request.
 */
export function useSalesListQueries(input: ListQueryInput) {
    const { tab, chip, party: customer, search, range, sort, today, n, queryKey } = input
    const [
        invoicesCollection,
        estimatesCollection,
        receiptsCollection,
        paymentsCollection,
        creditMemosCollection,
        refundsCollection,
        writeOffsCollection,
        customersCollection,
    ] = useStore(
        'books_invoices',
        'books_estimates',
        'books_sales_receipts',
        'books_payments',
        'books_credit_memos',
        'books_refund_receipts',
        'books_write_offs',
        'books_customers'
    )

    const hasCustomer = customer !== ''
    // Estimates have no listed rule, so their query has a `where` only when a filter is set.
    const hasSearch = searchPieces(search).length > 0
    const hasEstimateWhere = chip !== 'all' || range !== null || hasCustomer || hasSearch
    // Write-offs have no listed rule (no correction replaces one) and no chip rule (on the
    // customer tab the filter chip chooses the kind), so likewise.
    const hasWriteOffWhere = range !== null || hasCustomer || hasSearch
    const runsInvoices = chipRuns(tab, chip, 'invoice')
    const runsEstimates = chipRuns(tab, chip, 'estimate')
    const runsReceipts = chipRuns(tab, chip, 'sales_receipt')
    const runsPayments = chipRuns(tab, chip, 'payment')
    const runsCreditMemos = chipRuns(tab, chip, 'credit_memo')
    const runsRefunds = chipRuns(tab, chip, 'refund_receipt')
    const runsWriteOffs = chipRuns(tab, chip, 'write_off')

    const invoicesQuery = useLiveQuery({
        query: q => {
            if (!runsInvoices) return undefined
            const field = sortField('invoice', sort.key)
            return q
                .from({ i: invoicesCollection })
                .where(({ i }) =>
                    allOf([
                        listedClause(i),
                        ...chipClauses(tab, chip, 'invoice', i, today),
                        ...rangeClauses(i, range),
                        ...(hasCustomer ? [eq(i.customer, customer)] : []),
                        ...searchClauses(i, search),
                    ])
                )
                .orderBy(({ i }) => i[field], kindDirection(tab, 'invoice', sort))
                .orderBy(({ i }) => i.created, 'desc')
                .limit(n)
                .select(({ i }) => ({
                    ...i,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, i.customer))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('invoice', runsInvoices),
    })
    const estimatesQuery = useLiveQuery({
        query: q => {
            if (!runsEstimates) return undefined
            const field = sortField('estimate', sort.key)
            const from = q.from({ e: estimatesCollection })
            const filtered = hasEstimateWhere
                ? from.where(({ e }) =>
                      allOf([
                          ...chipClauses(tab, chip, 'estimate', e, today),
                          ...rangeClauses(e, range),
                          ...(hasCustomer ? [eq(e.customer, customer)] : []),
                          ...searchClauses(e, search),
                      ])
                  )
                : from
            return filtered
                .orderBy(({ e }) => e[field], kindDirection(tab, 'estimate', sort))
                .orderBy(({ e }) => e.created, 'desc')
                .limit(n)
                .select(({ e }) => ({
                    ...e,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, e.customer))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('estimate', runsEstimates),
    })
    const receiptsQuery = useLiveQuery({
        query: q => {
            if (!runsReceipts) return undefined
            const field = sortField('sales_receipt', sort.key)
            return q
                .from({ r: receiptsCollection })
                .where(({ r }) =>
                    allOf([
                        listedClause(r),
                        ...chipClauses(tab, chip, 'sales_receipt', r, today),
                        ...rangeClauses(r, range),
                        ...(hasCustomer ? [eq(r.customer, customer)] : []),
                        ...searchClauses(r, search),
                    ])
                )
                .orderBy(({ r }) => r[field], kindDirection(tab, 'sales_receipt', sort))
                .orderBy(({ r }) => r.created, 'desc')
                .limit(n)
                .select(({ r }) => ({
                    ...r,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, r.customer))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('sales_receipt', runsReceipts),
    })
    const paymentsQuery = useLiveQuery({
        query: q => {
            if (!runsPayments) return undefined
            const field = sortField('payment', sort.key)
            return q
                .from({ p: paymentsCollection })
                .where(({ p }) =>
                    allOf([
                        listedClause(p),
                        ...chipClauses(tab, chip, 'payment', p, today),
                        ...rangeClauses(p, range),
                        ...(hasCustomer ? [eq(p.customer, customer)] : []),
                        ...searchClauses(p, search),
                    ])
                )
                .orderBy(({ p }) => p[field], kindDirection(tab, 'payment', sort))
                .orderBy(({ p }) => p.created, 'desc')
                .limit(n)
                .select(({ p }) => ({
                    ...p,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, p.customer))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('payment', runsPayments),
    })
    const creditMemosQuery = useLiveQuery({
        query: q => {
            if (!runsCreditMemos) return undefined
            const field = sortField('credit_memo', sort.key)
            return q
                .from({ m: creditMemosCollection })
                .where(({ m }) =>
                    allOf([
                        listedClause(m),
                        ...chipClauses(tab, chip, 'credit_memo', m, today),
                        ...rangeClauses(m, range),
                        ...(hasCustomer ? [eq(m.customer, customer)] : []),
                        ...searchClauses(m, search),
                    ])
                )
                .orderBy(({ m }) => m[field], kindDirection(tab, 'credit_memo', sort))
                .orderBy(({ m }) => m.created, 'desc')
                .limit(n)
                .select(({ m }) => ({
                    ...m,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, m.customer))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('credit_memo', runsCreditMemos),
    })
    const refundsQuery = useLiveQuery({
        query: q => {
            if (!runsRefunds) return undefined
            const field = sortField('refund_receipt', sort.key)
            return q
                .from({ f: refundsCollection })
                .where(({ f }) =>
                    allOf([
                        listedClause(f),
                        ...chipClauses(tab, chip, 'refund_receipt', f, today),
                        ...rangeClauses(f, range),
                        ...(hasCustomer ? [eq(f.customer, customer)] : []),
                        ...searchClauses(f, search),
                    ])
                )
                .orderBy(({ f }) => f[field], kindDirection(tab, 'refund_receipt', sort))
                .orderBy(({ f }) => f.created, 'desc')
                .limit(n)
                .select(({ f }) => ({
                    ...f,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, f.customer))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('refund_receipt', runsRefunds),
    })
    const writeOffsQuery = useLiveQuery({
        query: q => {
            if (!runsWriteOffs) return undefined
            const field = sortField('write_off', sort.key)
            const from = q.from({ w: writeOffsCollection })
            const filtered = hasWriteOffWhere
                ? from.where(({ w }) =>
                      allOf([
                          ...rangeClauses(w, range),
                          ...(hasCustomer ? [eq(w.customer, customer)] : []),
                          ...searchClauses(w, search),
                      ])
                  )
                : from
            return filtered
                .orderBy(({ w }) => w[field], kindDirection(tab, 'write_off', sort))
                .orderBy(({ w }) => w.created, 'desc')
                .limit(n)
                .select(({ w }) => ({
                    ...w,
                    customerRow: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, w.customer))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('write_off', runsWriteOffs),
    })

    // Every query reads the customers through `materialize`, so they are a source of each
    // failed one; a read that has not failed restarts nothing.
    const readOf = (
        isRunning: boolean,
        query: { isReady: boolean; isError: boolean; collection: LiveRecovery['queries'][number] },
        source: NonNullable<LiveRecovery['sources']>[number]
    ): ListRead => {
        const isError = isRunning && query.isError
        return {
            isRunning,
            isReady: query.isReady,
            isError,
            recovery: isError
                ? { queries: [query.collection], sources: [source, customersCollection] }
                : NO_RECOVERY,
        }
    }

    return {
        invoices: runsInvoices ? invoicesQuery.data : undefined,
        estimates: runsEstimates ? estimatesQuery.data : undefined,
        receipts: runsReceipts ? receiptsQuery.data : undefined,
        payments: runsPayments ? paymentsQuery.data : undefined,
        creditMemos: runsCreditMemos ? creditMemosQuery.data : undefined,
        refunds: runsRefunds ? refundsQuery.data : undefined,
        writeOffs: runsWriteOffs ? writeOffsQuery.data : undefined,
        reads: [
            readOf(runsInvoices, invoicesQuery, invoicesCollection),
            readOf(runsEstimates, estimatesQuery, estimatesCollection),
            readOf(runsReceipts, receiptsQuery, receiptsCollection),
            readOf(runsPayments, paymentsQuery, paymentsCollection),
            readOf(runsCreditMemos, creditMemosQuery, creditMemosCollection),
            readOf(runsRefunds, refundsQuery, refundsCollection),
            readOf(runsWriteOffs, writeOffsQuery, writeOffsCollection),
        ],
    }
}
