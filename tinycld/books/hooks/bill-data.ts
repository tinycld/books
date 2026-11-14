import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { TableRowWrite } from '@tinycld/core/lib/forms/table-rows'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import { billColumnsFrom, type EMPTY_BILL_COLUMNS } from '../lib/bill-columns'
import { isBillAccountListed } from '../lib/bill-pickers'
import { columnsOrThrow } from '../lib/record-save'
import { BILL_KIND } from '../lib/sales-document-kinds'
import type { BooksBills } from '../types'
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
    NO_RECOVERY,
    purchaseLineMapperOf,
    useHeldRecord,
} from './document-data'
import { vendorPartyRead } from './party-read'
import { useBooksSettings } from './useBooksSettings'

const LOG_CONTEXT = 'books.bill'

type BillInsertColumns = typeof EMPTY_BILL_COLUMNS

// The bill's own columns go into `kindFields`; the row keeps the shared ones. A bill has
// no customer, bill-to address, email, tax rate, message or tax (it is a purchase and
// prints nothing), so those shared columns are ''/null/0 on it: every shared reader keeps
// its type, and none of them finds a customer or a tax on a bill.
function billSourceOf<R extends BooksBills>(
    row: R
): R &
    Pick<
        DocumentSource,
        'customer' | 'bill_to' | 'email' | 'tax_rate' | 'message' | 'tax_total'
    > & {
        kindFields: Extract<DocumentKindFields, { kind: 'bill' }>
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
            kind: 'bill',
            vendor: row.vendor,
            terms: row.terms,
            due_date: row.due_date,
            ref_no: row.ref_no,
            mailing_address: row.mailing_address,
        },
    }
}

// The bill a correction replaces or a copy starts from, as its own row.
function useBillSourceQuery(sourceId: string) {
    const [billsCollection] = useStore('books_bills')
    return useLiveQuery({
        query: q => {
            if (!sourceId) return undefined
            return q
                .from({ source: billsCollection })
                .where(({ source }) => eq(source.id, sourceId))
                .findOne()
        },
        queryKey: ['books.bill.source', sourceId],
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
        queryKey: ['books.bill.vendor-account', vendorId],
    })
    return { query, sources: [vendorsCollection, accountsCollection] }
}

/**
 * The form start of a bill: the Bill lines setting (Settings → Purchases), which decides
 * the tables a new form shows, and on a new form opened with `?vendor` whether the Account
 * picker lists the vendor's default expense account (isBillAccountListed), which then
 * starts the first account line. The settings row is the screen's own read (its readiness,
 * its error and its Retry are there, useDocumentScreen); the vendor's account is this
 * read's own, so its loading, its error and its Retry join the screen's.
 */
function useBillFormStart(input: DocumentScreenInput): DocumentScreenReads['formStart'] {
    const { settings } = useBooksSettings()
    const purchaseLines = settings?.purchase_lines ?? 'both'
    const vendorId = input.id === null ? (input.vendor ?? '') : ''
    const { query, sources } = useVendorAccountQuery(vendorId)
    const vendorAccountListed = vendorId ? isBillAccountListed(query.data?.account) : undefined
    // Kept between renders: a copy's values (new line ids) are memoised on the start.
    const data = useMemo<DocumentFormStart>(
        () => ({ start: { kind: 'bill', purchaseLines, vendorAccountListed }, deposit: undefined }),
        [purchaseLines, vendorAccountListed]
    )
    return documentRead(vendorId, query, data, sources)
}

/**
 * The bill's reads: the bill with its vendor's name and the people who posted and voided
 * it, its lines (both tables) in position order with their products and accounts, and the
 * bill a correction replaces or a copy starts from with its lines. A bill has no tax and
 * is never made from an estimate: those reads are ready and empty.
 */
function useBillScreenReads(input: DocumentScreenInput & { isHeld: boolean }): DocumentScreenReads {
    const [billsCollection, linesCollection, usersCollection, productsCollection] = useStore(
        'books_bills',
        'books_bill_lines',
        'users',
        'books_products'
    )
    const [vendorsCollection, accountsCollection] = useStore('books_vendors', 'books_accounts')
    const id = input.id ?? ''
    const billQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ bill: billsCollection })
                .where(({ bill }) => eq(bill.id, id))
                .select(({ bill }) => ({
                    ...bill,
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, bill.vendor))
                            .findOne()
                    ),
                    postedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, bill.posted_by))
                            .findOne()
                    ),
                    voidedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, bill.voided_by))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.bill', id],
    })
    // Each line with its product or account, which the read view names.
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.bill, id))
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
        queryKey: ['books.bill.lines', id],
    })
    const read = billQuery.data
    const mapped = useMemo<DocumentRecord | undefined>(() => {
        if (!read) return undefined
        const { vendorRow, ...row } = read
        const source = billSourceOf(row)
        return {
            ...source,
            kindFields: { ...source.kindFields, vendorRow },
            taxRateRow: undefined,
        }
    }, [read])
    const record = useHeldRecord(mapped, input.isHeld)
    const ids = linkedReadIds(input, record, read?.status ?? null, BILL_KIND.lifecycle)
    const sourceQuery = useBillSourceQuery(ids.sourceId)
    const sourceRow = sourceQuery.data
    const source = useMemo(() => (sourceRow ? billSourceOf(sourceRow) : undefined), [sourceRow])
    const sourceLinesQuery = useLiveQuery({
        query: q => {
            if (!ids.sourceLinesId) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.bill, ids.sourceLinesId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.bill.source-lines', ids.sourceLinesId],
    })
    const formStart = useBillFormStart(input)
    return {
        record: documentRead(id, billQuery, record, [
            billsCollection,
            vendorsCollection,
            usersCollection,
        ]),
        lines: documentRead(id, linesQuery, linesQuery.data ?? [], [
            linesCollection,
            productsCollection,
            accountsCollection,
        ]),
        source: documentRead(ids.sourceId, sourceQuery, source, [billsCollection]),
        sourceLines: documentRead(
            ids.sourceLinesId,
            sourceLinesQuery,
            sourceLinesQuery.data ?? [],
            [linesCollection]
        ),
        ...NO_ESTIMATE_SOURCE,
        taxLines: NO_TAX_LINES,
        formStart,
    }
}

// A bill has no sales tax, so it has no tax snapshot to read.
const NO_TAX_LINES: DocumentScreenReads['taxLines'] = {
    data: [],
    isReady: true,
    isError: false,
    recovery: NO_RECOVERY,
}

// The bill's writes: its row and the lines of both tables (one collection, each line
// with its `kind`), whose insert names the bill.
function useBillWrites(): DocumentWrites {
    const [billsCollection, linesCollection] = useStore('books_bills', 'books_bill_lines')
    return {
        // The columns were checked by billColumnsFrom before the save started and laid
        // over EMPTY_BILL_COLUMNS (DocumentKind.emptyColumns), so they hold every column
        // of that shape; the shared layer carries them untyped.
        insertRecord: input =>
            billsCollection.insert({
                ...(input.columns as BillInsertColumns),
                replaces: input.replaces,
                id: input.id,
                form: input.form,
                fields: input.fields,
            }),
        updateRecord: (id, input) => {
            const columns = columnsOrThrow(billColumnsFrom, input.columns)
            return billsCollection.update(id, draft => {
                Object.assign(draft, columns)
                if (Object.keys(input.fields).length > 0) draft.fields = input.fields
                draft.revision = input.revision
                if (input.post) draft.status = 'posted'
            })
        },
        postRecord: (id, revision) =>
            billsCollection.update(id, draft => {
                draft.status = 'posted'
                draft.revision = revision
            }),
        voidRecord: id =>
            billsCollection.update(id, draft => {
                draft.status = 'void'
            }),
        storedRevision: id => billsCollection.get(id)?.revision,
        deleteRecord: id => billsCollection.delete(id),
        lineOps: (billId, mapper) => {
            const { toRecord } = purchaseLineMapperOf(mapper)
            const lineRecord = (write: TableRowWrite) => toRecord(write.row, write.position)
            return {
                // A product line's record has no amount (the server writes Qty x Rate over
                // the 0 the insert carries); an account line's record sets its typed one.
                insert: write =>
                    linesCollection.insert({
                        id: write.row.id,
                        bill: billId,
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
function useBillVersion(id: string | undefined): string {
    const [billsCollection] = useStore('books_bills')
    const { record } = useRecord(billsCollection, id)
    return record?.updated ?? ''
}

function useBillReload(): () => Promise<void> {
    const [billsCollection, linesCollection] = useStore('books_bills', 'books_bill_lines')
    return async () => {
        await Promise.all([billsCollection.reload(), linesCollection.reload()])
    }
}

// The bill kind's data source: every `useStore` of a bill collection.
export const BILL_DATA: DocumentDataSource = {
    useScreenReads: useBillScreenReads,
    useParty: vendorPartyRead(LOG_CONTEXT),
    useWrites: useBillWrites,
    useVersion: useBillVersion,
    useReload: useBillReload,
}
