import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import { type EMPTY_EXPENSE_COLUMNS, expenseColumnsFrom } from '../lib/expense-columns'
import { mergeRecoveries } from '../lib/live-recovery'
import { withNoOrderLine } from '../lib/purchase-line-columns'
import { documentKey } from '../lib/record-key'
import { columnsOrThrow } from '../lib/record-save'
import { EXPENSE_KIND } from '../lib/sales-document-kinds'
import type { BooksExpenses } from '../types'
import {
    type DocumentDataSource,
    type DocumentFormStart,
    type DocumentKindFields,
    type DocumentRecord,
    type DocumentScreenInput,
    type DocumentScreenReads,
    type DocumentWrites,
    documentRead,
    linkedReadIds,
    NO_DOCUMENT_PAYMENTS,
    NO_ESTIMATE_SOURCE,
    NO_LINK_SOURCE,
    useHeldRecord,
} from './document-data'
import { vendorPartyRead } from './party-read'
import {
    NO_PURCHASE_TAX_LINES,
    PURCHASE_SALES_COLUMNS,
    purchaseLineOps,
    usePurchaseStart,
} from './purchase-data'
import { usePaidFromAccounts } from './usePaidFromAccounts'

const LOG_CONTEXT = 'books.expense'

type ExpenseInsertColumns = typeof EMPTY_EXPENSE_COLUMNS & {
    payment_method: BooksExpenses['payment_method']
}

// The expense's own columns go into `kindFields`; the row keeps the shared ones, with the
// sales columns a purchase does not have empty (PURCHASE_SALES_COLUMNS).
function expenseSourceOf<R extends BooksExpenses>(
    row: R
): R &
    typeof PURCHASE_SALES_COLUMNS & {
        kindFields: Extract<DocumentKindFields, { kind: 'expense' }>
    } {
    return {
        ...row,
        ...PURCHASE_SALES_COLUMNS,
        kindFields: {
            kind: 'expense',
            vendor: row.vendor,
            paid_from: row.paid_from,
            payment_method: row.payment_method,
            reference_no: row.reference_no,
        },
    }
}

// The expense a correction replaces or a copy starts from, as its own row.
function useExpenseSourceQuery(sourceId: string) {
    const [expensesCollection] = useStore('books_expenses')
    return useLiveQuery({
        query: q => {
            if (!sourceId) return undefined
            return q
                .from({ source: expensesCollection })
                .where(({ source }) => eq(source.id, sourceId))
                .findOne()
        },
        queryKey: ['books.expense.source', sourceId],
    })
}

/**
 * The form start of an expense: the purchase start (usePurchaseStart), and the ids of the
 * active bank and credit card accounts (usePaidFromAccounts), which a copy keeps its Paid
 * from by. The Paid from accounts and the vendor's account are this read's own, so their
 * loading, their errors and their Retry join the screen's.
 */
function useExpenseFormStart(input: DocumentScreenInput): DocumentScreenReads['formStart'] {
    const { purchaseLines, vendorAccountListed, vendorRead } = usePurchaseStart(input, LOG_CONTEXT)
    const paidFrom = usePaidFromAccounts()
    const { activeIds } = paidFrom
    // Kept between renders: a copy's values (new line ids) are memoised on the start.
    const data = useMemo<DocumentFormStart>(
        () => ({
            start: {
                kind: 'expense',
                purchaseLines,
                vendorAccountListed,
                activePaidFromIds: activeIds,
            },
            deposit: undefined,
        }),
        [purchaseLines, vendorAccountListed, activeIds]
    )
    return {
        data,
        isReady: vendorRead.isReady && paidFrom.isReady,
        isError: vendorRead.isError || paidFrom.isError,
        recovery: mergeRecoveries([vendorRead.recovery, paidFrom.recovery]),
    }
}

/**
 * The expense's reads: the expense with its vendor's name, its Paid from account and the
 * people who posted and voided it, its lines (both tables) in position order with their
 * products and accounts, and the expense a correction replaces or a copy starts from with
 * its lines. An expense has no tax and is never made from an estimate: those reads are
 * ready and empty.
 */
function useExpenseScreenReads(
    input: DocumentScreenInput & { isHeld: boolean }
): DocumentScreenReads {
    const [expensesCollection, linesCollection, usersCollection, productsCollection] = useStore(
        'books_expenses',
        'books_expense_lines',
        'users',
        'books_products'
    )
    const [vendorsCollection, accountsCollection] = useStore('books_vendors', 'books_accounts')
    const id = input.id ?? ''
    const expenseQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ expense: expensesCollection })
                .where(({ expense }) => eq(expense.id, id))
                .select(({ expense }) => ({
                    ...expense,
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, expense.vendor))
                            .findOne()
                    ),
                    paidFromRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, expense.paid_from))
                            .findOne()
                    ),
                    postedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, expense.posted_by))
                            .findOne()
                    ),
                    voidedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, expense.voided_by))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.expense', id],
    })
    // Each line with its product or account, which the read view names.
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.expense, id))
                .orderBy(({ line }) => line.position)
                .select(({ line }) => ({
                    ...line,
                    productRow: materialize(
                        q
                            .from({ p: productsCollection })
                            .where(({ p }) => eq(p.id, line.product))
                            .findOne()
                    ),
                    accountRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, line.account))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.expense.lines', id],
    })
    const read = expenseQuery.data
    const mapped = useMemo<DocumentRecord | undefined>(() => {
        if (!read) return undefined
        const { vendorRow, paidFromRow, ...row } = read
        const source = expenseSourceOf(row)
        return {
            ...source,
            kindFields: { ...source.kindFields, vendorRow, paidFromRow },
            taxRateRow: undefined,
        }
    }, [read])
    const record = useHeldRecord(mapped, input.isHeld)
    const ids = linkedReadIds(input, record, read?.status ?? null, EXPENSE_KIND.lifecycle)
    const sourceQuery = useExpenseSourceQuery(ids.sourceId)
    const sourceRow = sourceQuery.data
    const source = useMemo(() => (sourceRow ? expenseSourceOf(sourceRow) : undefined), [sourceRow])
    const sourceLinesQuery = useLiveQuery({
        query: q => {
            if (!ids.sourceLinesId) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.expense, ids.sourceLinesId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.expense.source-lines', ids.sourceLinesId],
    })
    const formStart = useExpenseFormStart(input)
    const lineRows = linesQuery.data
    const lines = useMemo(() => withNoOrderLine(lineRows), [lineRows])
    const sourceLineRows = sourceLinesQuery.data
    const sourceLines = useMemo(() => withNoOrderLine(sourceLineRows), [sourceLineRows])
    return {
        record: documentRead(id, expenseQuery, record, [
            expensesCollection,
            vendorsCollection,
            accountsCollection,
            usersCollection,
        ]),
        lines: documentRead(id, linesQuery, lines, [
            linesCollection,
            productsCollection,
            accountsCollection,
        ]),
        source: documentRead(ids.sourceId, sourceQuery, source, [expensesCollection]),
        sourceLines: documentRead(ids.sourceLinesId, sourceLinesQuery, sourceLines, [
            linesCollection,
        ]),
        ...NO_ESTIMATE_SOURCE,
        ...NO_LINK_SOURCE,
        ...NO_DOCUMENT_PAYMENTS,
        taxLines: NO_PURCHASE_TAX_LINES,
        formStart,
    }
}

// The expense's writes: its row and the lines of both tables (one collection, each line
// with its `kind`), whose insert names the expense.
function useExpenseWrites(): DocumentWrites {
    const [expensesCollection, linesCollection] = useStore('books_expenses', 'books_expense_lines')
    return {
        // The columns were checked by expenseColumnsFrom before the save started and laid
        // over EMPTY_EXPENSE_COLUMNS (DocumentKind.emptyColumns), so they hold every
        // column of that shape, and the required Payment method; the shared layer carries
        // them untyped.
        insertRecord: input =>
            expensesCollection.insert({
                ...(input.columns as ExpenseInsertColumns),
                replaces: input.replaces,
                id: input.id,
                form: input.form,
                fields: input.fields,
            }),
        updateRecord: (id, input) => {
            const columns = columnsOrThrow(expenseColumnsFrom, input.columns)
            return expensesCollection.update(id, draft => {
                Object.assign(draft, columns)
                if (Object.keys(input.fields).length > 0) draft.fields = input.fields
                draft.revision = input.revision
                if (input.post) draft.status = 'posted'
            })
        },
        postRecord: (id, revision) =>
            expensesCollection.update(id, draft => {
                draft.status = 'posted'
                draft.revision = revision
            }),
        storedRevision: id => expensesCollection.get(id)?.revision,
        storedKey: id => {
            const row = expensesCollection.get(id)
            return row ? documentKey(row) : id
        },
        lineOps: (expenseId, mapper) =>
            purchaseLineOps(mapper, {
                insert: record => linesCollection.insert({ ...record, expense: expenseId }),
                update: (lineId, record) =>
                    linesCollection.update(lineId, draft => {
                        Object.assign(draft, record)
                    }),
                remove: lineId => linesCollection.delete(lineId),
            }),
    }
}

// The row is the one the screen or the save already holds, so this sends no request.
function useExpenseVersion(id: string | undefined): string {
    const [expensesCollection] = useStore('books_expenses')
    const { record } = useRecord(expensesCollection, id)
    return record?.updated ?? ''
}

function useExpenseReload(): () => Promise<void> {
    const [expensesCollection, linesCollection] = useStore('books_expenses', 'books_expense_lines')
    return async () => {
        await Promise.all([expensesCollection.reload(), linesCollection.reload()])
    }
}

// The expense kind's data source: every `useStore` of an expense collection.
export const EXPENSE_DATA: DocumentDataSource = {
    useScreenReads: useExpenseScreenReads,
    useParty: vendorPartyRead(LOG_CONTEXT),
    useWrites: useExpenseWrites,
    useVersion: useExpenseVersion,
    useReload: useExpenseReload,
}
