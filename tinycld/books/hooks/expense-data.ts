import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { TableRowWrite } from '@tinycld/core/lib/forms/table-rows'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import { type EMPTY_EXPENSE_COLUMNS, expenseColumnsFrom } from '../lib/expense-columns'
import { mergeRecoveries } from '../lib/live-recovery'
import { isPurchaseAccountListed } from '../lib/purchase-pickers'
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
    type DocumentSource,
    type DocumentWrites,
    documentRead,
    linkedReadIds,
    NO_ESTIMATE_SOURCE,
    NO_INVOICE_PAYMENTS,
    NO_RECOVERY,
    purchaseLineMapperOf,
    useHeldRecord,
} from './document-data'
import { vendorPartyRead } from './party-read'
import { useBooksSettings } from './useBooksSettings'
import { usePaidFromAccounts } from './usePaidFromAccounts'

const LOG_CONTEXT = 'books.expense'

type ExpenseInsertColumns = typeof EMPTY_EXPENSE_COLUMNS & {
    payment_method: BooksExpenses['payment_method']
}

// The expense's own columns go into `kindFields`; the row keeps the shared ones. An
// expense has no customer, bill-to address, email, tax rate, message or tax (it is a
// purchase and prints nothing), so those shared columns are ''/null/0 on it: every shared
// reader keeps its type, and none of them finds a customer or a tax on an expense.
function expenseSourceOf<R extends BooksExpenses>(
    row: R
): R &
    Pick<
        DocumentSource,
        'customer' | 'bill_to' | 'email' | 'tax_rate' | 'message' | 'tax_total'
    > & {
        kindFields: Extract<DocumentKindFields, { kind: 'expense' }>
    } {
    return {
        ...row,
        customer: '',
        bill_to: null,
        email: '',
        tax_rate: '',
        message: '',
        tax_total: 0,
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

// On a new form opened with `?vendor`: that vendor's default expense account, as one
// query (the vendor with its account), which says whether the Account picker lists it.
function useVendorAccountQuery(vendorId: string) {
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
        queryKey: ['books.expense.vendor-account', vendorId],
    })
    return { query, sources: [vendorsCollection, accountsCollection] }
}

/**
 * The form start of an expense: the Purchase lines setting (Settings → Purchases), which
 * decides the tables a new form shows; the ids of the active bank and credit card
 * accounts (usePaidFromAccounts), which a copy keeps its Paid from by; and on a new form
 * opened with `?vendor` whether the Account picker lists the vendor's default expense
 * account (isPurchaseAccountListed), which then starts the first account line. The
 * settings row is the screen's own read (its readiness, its error and its Retry are
 * there, useDocumentScreen); the Paid from accounts and the vendor's account are this
 * read's own, so their loading, their errors and their Retry join the screen's.
 */
function useExpenseFormStart(input: DocumentScreenInput): DocumentScreenReads['formStart'] {
    const { settings } = useBooksSettings()
    const purchaseLines = settings?.purchase_lines ?? 'both'
    const paidFrom = usePaidFromAccounts()
    const vendorId = input.id === null ? (input.vendor ?? '') : ''
    const { query, sources } = useVendorAccountQuery(vendorId)
    const vendorAccountListed = vendorId ? isPurchaseAccountListed(query.data?.account) : undefined
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
    const vendorRead = documentRead(vendorId, query, data, sources)
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
    return {
        record: documentRead(id, expenseQuery, record, [
            expensesCollection,
            vendorsCollection,
            accountsCollection,
            usersCollection,
        ]),
        lines: documentRead(id, linesQuery, linesQuery.data ?? [], [
            linesCollection,
            productsCollection,
            accountsCollection,
        ]),
        source: documentRead(ids.sourceId, sourceQuery, source, [expensesCollection]),
        sourceLines: documentRead(
            ids.sourceLinesId,
            sourceLinesQuery,
            sourceLinesQuery.data ?? [],
            [linesCollection]
        ),
        ...NO_ESTIMATE_SOURCE,
        ...NO_INVOICE_PAYMENTS,
        taxLines: NO_TAX_LINES,
        formStart,
    }
}

// An expense has no sales tax, so it has no tax snapshot to read.
const NO_TAX_LINES: DocumentScreenReads['taxLines'] = {
    data: [],
    isReady: true,
    isError: false,
    recovery: NO_RECOVERY,
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
        voidRecord: id =>
            expensesCollection.update(id, draft => {
                draft.status = 'void'
            }),
        storedRevision: id => expensesCollection.get(id)?.revision,
        deleteRecord: id => expensesCollection.delete(id),
        lineOps: (expenseId, mapper) => {
            const { toRecord } = purchaseLineMapperOf(mapper)
            const lineRecord = (write: TableRowWrite) => toRecord(write.row, write.position)
            return {
                // A product line's record has no amount (the server writes Qty x Rate over
                // the 0 the insert carries); an account line's record sets its typed one.
                insert: write =>
                    linesCollection.insert({
                        id: write.row.id,
                        expense: expenseId,
                        amount: 0,
                        ...lineRecord(write),
                    }),
                update: write =>
                    linesCollection.update(write.row.id, draft => {
                        Object.assign(draft, lineRecord(write))
                    }),
                remove: lineId => linesCollection.delete(lineId),
            }
        },
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
