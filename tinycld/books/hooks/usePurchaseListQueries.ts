import { eq, type InitialQueryBuilder } from '@tanstack/db'
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
    searchFieldClauses,
    someClauses,
    sortField,
} from '../lib/document-list'
import { searchPieces } from '../lib/list-search'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// A document's first two lines by position: two lines are enough to know the Category is
// "Split" (`categoryOf`, lib/purchase-category.ts). tests/purchase-category-limit.test.ts
// proves the limit holds per document inside a to-many `materialize()`.
const CATEGORY_LINES = 2

/**
 * The five purchase reads of a document list (the Purchase lists design spec
 * §4): one live query per kind the tab lists, each filtered by the listed rule, the chip,
 * the date range, the vendor and the search (number, reference no., memo) in its `where`,
 * ordered by the sort column then `created` descending, and cut to its first `n` rows. Each
 * `select` reads the vendor with `materialize(… .findOne())`, so an expense with no vendor
 * stays listed. The lines serve only the Category column: on a tab with it, a bill's, an
 * expense's or a vendor credit's query also reads the document's first two lines; on a tab
 * without it, the kind's other query runs, which reads no lines, so its rows have no
 * `lines` and no category. A query whose kind the tab does not list (every query on a sales
 * tab) or whose chip lists none of the kind returns `undefined` and sends no request.
 */
export function usePurchaseListQueries(input: ListQueryInput) {
    const { tab, chip, party: vendor, search, range, sort, today, n, queryKey } = input
    const [
        billsCollection,
        expensesCollection,
        billPaymentsCollection,
        vendorCreditsCollection,
        vendorRefundsCollection,
        billLinesCollection,
        expenseLinesCollection,
        vendorCreditLinesCollection,
        vendorsCollection,
    ] = useStore(
        'books_bills',
        'books_expenses',
        'books_bill_payments',
        'books_vendor_credits',
        'books_vendor_refunds',
        'books_bill_lines',
        'books_expense_lines',
        'books_vendor_credit_lines',
        'books_vendors'
    )
    const [purchaseOrdersCollection, purchaseOrderLinesCollection] = useStore(
        'books_purchase_orders',
        'books_purchase_order_lines'
    )

    const hasVendor = vendor !== ''
    const readsCategory = tab.columns.includes('category')
    const runsBills = chipRuns(tab, chip, 'bill')
    const runsPurchaseOrders = chipRuns(tab, chip, 'purchase_order')
    const runsExpenses = chipRuns(tab, chip, 'expense')
    const runsBillPayments = chipRuns(tab, chip, 'bill_payment')
    const runsVendorCredits = chipRuns(tab, chip, 'vendor_credit')
    const runsVendorRefunds = chipRuns(tab, chip, 'vendor_refund')
    // Of a kind with lines, exactly one of its two queries runs: the one with lines on a tab
    // with the Category column, the plain one on any other.
    const runsBillsLined = runsBills && readsCategory
    const runsBillsPlain = runsBills && !readsCategory
    const runsExpensesLined = runsExpenses && readsCategory
    const runsExpensesPlain = runsExpenses && !readsCategory
    const runsVendorCreditsLined = runsVendorCredits && readsCategory
    const runsVendorCreditsPlain = runsVendorCredits && !readsCategory
    const linesKey = (key: unknown[], hasLines: boolean) => [...key, hasLines]

    const billRows = (q: InitialQueryBuilder) => {
        const field = sortField('bill', sort.key)
        return q
            .from({ b: billsCollection })
            .where(({ b }) =>
                allOf([
                    listedClause(b),
                    ...chipClauses(tab, chip, 'bill', b, today),
                    ...rangeClauses(b, range),
                    ...(hasVendor ? [eq(b.vendor, vendor)] : []),
                    ...searchFieldClauses([b.number, b.ref_no, b.memo], search),
                ])
            )
            .orderBy(({ b }) => b[field], kindDirection(tab, 'bill', sort))
            .orderBy(({ b }) => b.created, 'desc')
            .limit(n)
    }
    const billsPlainQuery = useLiveQuery({
        query: q => {
            if (!runsBillsPlain) return undefined
            return billRows(q).select(({ b }) => ({
                ...b,
                vendorRow: materialize(
                    q
                        .from({ v: vendorsCollection })
                        .where(({ v }) => eq(v.id, b.vendor))
                        .findOne()
                ),
            }))
        },
        queryKey: linesKey(queryKey('bill', runsBillsPlain), false),
    })
    const billsLinedQuery = useLiveQuery({
        query: q => {
            if (!runsBillsLined) return undefined
            return billRows(q).select(({ b }) => ({
                ...b,
                vendorRow: materialize(
                    q
                        .from({ v: vendorsCollection })
                        .where(({ v }) => eq(v.id, b.vendor))
                        .findOne()
                ),
                lines: materialize(
                    q
                        .from({ l: billLinesCollection })
                        .where(({ l }) => eq(l.bill, b.id))
                        .orderBy(({ l }) => l.position)
                        .limit(CATEGORY_LINES)
                ),
            }))
        },
        queryKey: linesKey(queryKey('bill', runsBillsLined), true),
    })

    // A purchase order with its vendor, its lines' receipts (the Partly received badge,
    // `purchaseOrderBadge`, and the Close dialog's open line count) and its first bill (any
    // status: the server refuses the delete of an order that a bill names), each through
    // `materialize()` in the same query. An order is never void or replaced, so it has no
    // listed clause, so its query has a `where` only when a filter is set (as the estimates'
    // query of the sales lists); its search matches the number and the memo.
    const hasOrderWhere =
        chip !== 'all' || range !== null || hasVendor || searchPieces(search).length > 0
    const purchaseOrdersQuery = useLiveQuery({
        query: q => {
            if (!runsPurchaseOrders) return undefined
            const field = sortField('purchase_order', sort.key)
            const from = q.from({ o: purchaseOrdersCollection })
            const filtered = hasOrderWhere
                ? from.where(({ o }) =>
                      allOf(
                          someClauses([
                              ...chipClauses(tab, chip, 'purchase_order', o, today),
                              ...rangeClauses(o, range),
                              ...(hasVendor ? [eq(o.vendor, vendor)] : []),
                              ...searchClauses(o, search),
                          ])
                      )
                  )
                : from
            return filtered
                .orderBy(({ o }) => o[field], kindDirection(tab, 'purchase_order', sort))
                .orderBy(({ o }) => o.created, 'desc')
                .limit(n)
                .select(({ o }) => ({
                    ...o,
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, o.vendor))
                            .findOne()
                    ),
                    lineReceipts: materialize(
                        q
                            .from({ l: purchaseOrderLinesCollection })
                            .where(({ l }) => eq(l.purchase_order, o.id))
                            .select(({ l }) => ({
                                kind: l.kind,
                                received: l.received,
                                billed: l.billed,
                                open_quantity: l.open_quantity,
                                open_amount: l.open_amount,
                            }))
                    ),
                    firstBill: materialize(
                        q
                            .from({ b: billsCollection })
                            .where(({ b }) => eq(b.purchase_order, o.id))
                            .select(({ b }) => ({ id: b.id }))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('purchase_order', runsPurchaseOrders),
    })

    const expenseRows = (q: InitialQueryBuilder) => {
        const field = sortField('expense', sort.key)
        return q
            .from({ e: expensesCollection })
            .where(({ e }) =>
                allOf([
                    listedClause(e),
                    ...chipClauses(tab, chip, 'expense', e, today),
                    ...rangeClauses(e, range),
                    ...(hasVendor ? [eq(e.vendor, vendor)] : []),
                    ...searchFieldClauses([e.number, e.reference_no, e.memo], search),
                ])
            )
            .orderBy(({ e }) => e[field], kindDirection(tab, 'expense', sort))
            .orderBy(({ e }) => e.created, 'desc')
            .limit(n)
    }
    const expensesPlainQuery = useLiveQuery({
        query: q => {
            if (!runsExpensesPlain) return undefined
            return expenseRows(q).select(({ e }) => ({
                ...e,
                vendorRow: materialize(
                    q
                        .from({ v: vendorsCollection })
                        .where(({ v }) => eq(v.id, e.vendor))
                        .findOne()
                ),
            }))
        },
        queryKey: linesKey(queryKey('expense', runsExpensesPlain), false),
    })
    const expensesLinedQuery = useLiveQuery({
        query: q => {
            if (!runsExpensesLined) return undefined
            return expenseRows(q).select(({ e }) => ({
                ...e,
                vendorRow: materialize(
                    q
                        .from({ v: vendorsCollection })
                        .where(({ v }) => eq(v.id, e.vendor))
                        .findOne()
                ),
                lines: materialize(
                    q
                        .from({ l: expenseLinesCollection })
                        .where(({ l }) => eq(l.expense, e.id))
                        .orderBy(({ l }) => l.position)
                        .limit(CATEGORY_LINES)
                ),
            }))
        },
        queryKey: linesKey(queryKey('expense', runsExpensesLined), true),
    })

    const billPaymentsQuery = useLiveQuery({
        query: q => {
            if (!runsBillPayments) return undefined
            const field = sortField('bill_payment', sort.key)
            return q
                .from({ p: billPaymentsCollection })
                .where(({ p }) =>
                    allOf([
                        listedClause(p),
                        ...chipClauses(tab, chip, 'bill_payment', p, today),
                        ...rangeClauses(p, range),
                        ...(hasVendor ? [eq(p.vendor, vendor)] : []),
                        // A bill payment has no memo.
                        ...searchFieldClauses([p.number, p.reference_no], search),
                    ])
                )
                .orderBy(({ p }) => p[field], kindDirection(tab, 'bill_payment', sort))
                .orderBy(({ p }) => p.created, 'desc')
                .limit(n)
                .select(({ p }) => ({
                    ...p,
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, p.vendor))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('bill_payment', runsBillPayments),
    })

    const vendorCreditRows = (q: InitialQueryBuilder) => {
        const field = sortField('vendor_credit', sort.key)
        return q
            .from({ c: vendorCreditsCollection })
            .where(({ c }) =>
                allOf([
                    listedClause(c),
                    ...chipClauses(tab, chip, 'vendor_credit', c, today),
                    ...rangeClauses(c, range),
                    ...(hasVendor ? [eq(c.vendor, vendor)] : []),
                    ...searchFieldClauses([c.number, c.ref_no, c.memo], search),
                ])
            )
            .orderBy(({ c }) => c[field], kindDirection(tab, 'vendor_credit', sort))
            .orderBy(({ c }) => c.created, 'desc')
            .limit(n)
    }
    const vendorCreditsPlainQuery = useLiveQuery({
        query: q => {
            if (!runsVendorCreditsPlain) return undefined
            return vendorCreditRows(q).select(({ c }) => ({
                ...c,
                vendorRow: materialize(
                    q
                        .from({ v: vendorsCollection })
                        .where(({ v }) => eq(v.id, c.vendor))
                        .findOne()
                ),
            }))
        },
        queryKey: linesKey(queryKey('vendor_credit', runsVendorCreditsPlain), false),
    })
    const vendorCreditsLinedQuery = useLiveQuery({
        query: q => {
            if (!runsVendorCreditsLined) return undefined
            return vendorCreditRows(q).select(({ c }) => ({
                ...c,
                vendorRow: materialize(
                    q
                        .from({ v: vendorsCollection })
                        .where(({ v }) => eq(v.id, c.vendor))
                        .findOne()
                ),
                lines: materialize(
                    q
                        .from({ l: vendorCreditLinesCollection })
                        .where(({ l }) => eq(l.vendor_credit, c.id))
                        .orderBy(({ l }) => l.position)
                        .limit(CATEGORY_LINES)
                ),
            }))
        },
        queryKey: linesKey(queryKey('vendor_credit', runsVendorCreditsLined), true),
    })

    const vendorRefundsQuery = useLiveQuery({
        query: q => {
            if (!runsVendorRefunds) return undefined
            const field = sortField('vendor_refund', sort.key)
            return q
                .from({ r: vendorRefundsCollection })
                .where(({ r }) =>
                    allOf([
                        listedClause(r),
                        ...chipClauses(tab, chip, 'vendor_refund', r, today),
                        ...rangeClauses(r, range),
                        ...(hasVendor ? [eq(r.vendor, vendor)] : []),
                        ...searchFieldClauses([r.number, r.reference_no, r.memo], search),
                    ])
                )
                .orderBy(({ r }) => r[field], kindDirection(tab, 'vendor_refund', sort))
                .orderBy(({ r }) => r.created, 'desc')
                .limit(n)
                .select(({ r }) => ({
                    ...r,
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, r.vendor))
                            .findOne()
                    ),
                }))
        },
        queryKey: queryKey('vendor_refund', runsVendorRefunds),
    })

    // Every query reads the vendors through `materialize`, and a query with lines its line
    // collection, so they are sources of each failed one; a read that has not failed
    // restarts nothing.
    type Source = NonNullable<LiveRecovery['sources']>[number]
    const readOf = (
        isRunning: boolean,
        query: { isReady: boolean; isError: boolean; collection: LiveRecovery['queries'][number] },
        sources: Source[]
    ): ListRead => {
        const isError = isRunning && query.isError
        return {
            isRunning,
            isReady: query.isReady,
            isError,
            recovery: isError
                ? { queries: [query.collection], sources: [...sources, vendorsCollection] }
                : NO_RECOVERY,
        }
    }

    // A kind with lines gives the rows of each of its two queries apart (the one that does
    // not run gives none), so a reader knows by the field which rows carry `lines`.
    return {
        bills: runsBillsPlain ? billsPlainQuery.data : undefined,
        billsWithLines: runsBillsLined ? billsLinedQuery.data : undefined,
        purchaseOrders: runsPurchaseOrders ? purchaseOrdersQuery.data : undefined,
        expenses: runsExpensesPlain ? expensesPlainQuery.data : undefined,
        expensesWithLines: runsExpensesLined ? expensesLinedQuery.data : undefined,
        billPayments: runsBillPayments ? billPaymentsQuery.data : undefined,
        vendorCredits: runsVendorCreditsPlain ? vendorCreditsPlainQuery.data : undefined,
        vendorCreditsWithLines: runsVendorCreditsLined ? vendorCreditsLinedQuery.data : undefined,
        vendorRefunds: runsVendorRefunds ? vendorRefundsQuery.data : undefined,
        reads: [
            readOf(runsBillsPlain, billsPlainQuery, [billsCollection]),
            readOf(runsBillsLined, billsLinedQuery, [billsCollection, billLinesCollection]),
            readOf(runsPurchaseOrders, purchaseOrdersQuery, [
                purchaseOrdersCollection,
                purchaseOrderLinesCollection,
                billsCollection,
            ]),
            readOf(runsExpensesPlain, expensesPlainQuery, [expensesCollection]),
            readOf(runsExpensesLined, expensesLinedQuery, [
                expensesCollection,
                expenseLinesCollection,
            ]),
            readOf(runsBillPayments, billPaymentsQuery, [billPaymentsCollection]),
            readOf(runsVendorCreditsPlain, vendorCreditsPlainQuery, [vendorCreditsCollection]),
            readOf(runsVendorCreditsLined, vendorCreditsLinedQuery, [
                vendorCreditsCollection,
                vendorCreditLinesCollection,
            ]),
            readOf(runsVendorRefunds, vendorRefundsQuery, [vendorRefundsCollection]),
        ],
    }
}
