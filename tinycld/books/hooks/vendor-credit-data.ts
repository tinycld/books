import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useRecord } from '@tinycld/core/lib/use-record'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import { creditUseRows } from '../lib/credit-uses'
import { mergeRecoveries } from '../lib/live-recovery'
import { columnsOrThrow } from '../lib/record-save'
import { VENDOR_CREDIT_KIND } from '../lib/sales-document-kinds'
import {
    type EMPTY_VENDOR_CREDIT_COLUMNS,
    vendorCreditColumnsFrom,
} from '../lib/vendor-credit-columns'
import type { BooksVendorCredits } from '../types'
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
    NO_INVOICE_SOURCE,
    useHeldRecord,
} from './document-data'
import { vendorPartyRead } from './party-read'
import {
    NO_PURCHASE_TAX_LINES,
    PURCHASE_SALES_COLUMNS,
    purchaseLineOps,
    usePurchaseStart,
} from './purchase-data'
import { useCreditApplications } from './useCreditApplications'
import type { CreditRefunds } from './useCreditRefunds'
import { useOpenBills } from './useOpenBills'

const LOG_CONTEXT = 'books.vendor-credit'

type VendorCreditInsertColumns = typeof EMPTY_VENDOR_CREDIT_COLUMNS

// The vendor credit's own columns go into `kindFields`; the row keeps the shared ones, with
// the sales columns a purchase does not have empty (PURCHASE_SALES_COLUMNS).
function vendorCreditSourceOf<R extends BooksVendorCredits>(
    row: R
): R &
    typeof PURCHASE_SALES_COLUMNS & {
        kindFields: Extract<DocumentKindFields, { kind: 'vendor_credit' }>
    } {
    return {
        ...row,
        ...PURCHASE_SALES_COLUMNS,
        kindFields: {
            kind: 'vendor_credit',
            vendor: row.vendor,
            ref_no: row.ref_no,
            balance: row.balance,
        },
    }
}

// The vendor credit a correction replaces or a copy starts from, as its own row.
function useVendorCreditSourceQuery(sourceId: string) {
    const [creditsCollection] = useStore('books_vendor_credits')
    return useLiveQuery({
        query: q => {
            if (!sourceId) return undefined
            return q
                .from({ source: creditsCollection })
                .where(({ source }) => eq(source.id, sourceId))
                .findOne()
        },
        queryKey: [`${LOG_CONTEXT}.source`, sourceId],
    })
}

// The form start of a vendor credit: the purchase start (usePurchaseStart), with the vendor
// account's read as its own.
function useVendorCreditFormStart(input: DocumentScreenInput): DocumentScreenReads['formStart'] {
    const { purchaseLines, vendorAccountListed, vendorRead } = usePurchaseStart(input, LOG_CONTEXT)
    // Kept between renders: a copy's values (new line ids) are memoised on the start.
    const data = useMemo<DocumentFormStart>(
        () => ({
            start: { kind: 'vendor_credit', purchaseLines, vendorAccountListed },
            deposit: undefined,
        }),
        [purchaseLines, vendorAccountListed]
    )
    return { ...vendorRead, data }
}

/**
 * The vendor credit's reads: the credit with its vendor's name and the people who posted
 * and voided it, its lines (both tables) in position order with their products and
 * accounts, and the credit a correction replaces or a copy starts from with its lines. A
 * vendor credit has no tax, is never made from an estimate or an invoice, and is not paid
 * (its read view's Applied row is its total less its stored balance): those reads are
 * ready and empty.
 */
function useVendorCreditScreenReads(
    input: DocumentScreenInput & { isHeld: boolean }
): DocumentScreenReads {
    const [creditsCollection, linesCollection, usersCollection, productsCollection] = useStore(
        'books_vendor_credits',
        'books_vendor_credit_lines',
        'users',
        'books_products'
    )
    const [vendorsCollection, accountsCollection] = useStore('books_vendors', 'books_accounts')
    const id = input.id ?? ''
    const creditQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ credit: creditsCollection })
                .where(({ credit }) => eq(credit.id, id))
                .select(({ credit }) => ({
                    ...credit,
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, credit.vendor))
                            .findOne()
                    ),
                    postedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, credit.posted_by))
                            .findOne()
                    ),
                    voidedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, credit.voided_by))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: [LOG_CONTEXT, id],
    })
    // Each line with its product or account, which the read view names.
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.vendor_credit, id))
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
        queryKey: [`${LOG_CONTEXT}.lines`, id],
    })
    const read = creditQuery.data
    const mapped = useMemo<DocumentRecord | undefined>(() => {
        if (!read) return undefined
        const { vendorRow, ...row } = read
        const source = vendorCreditSourceOf(row)
        return {
            ...source,
            kindFields: { ...source.kindFields, vendorRow },
            taxRateRow: undefined,
        }
    }, [read])
    const record = useHeldRecord(mapped, input.isHeld)
    const ids = linkedReadIds(input, record, read?.status ?? null, VENDOR_CREDIT_KIND.lifecycle)
    const sourceQuery = useVendorCreditSourceQuery(ids.sourceId)
    const sourceRow = sourceQuery.data
    const source = useMemo(
        () => (sourceRow ? vendorCreditSourceOf(sourceRow) : undefined),
        [sourceRow]
    )
    const sourceLinesQuery = useLiveQuery({
        query: q => {
            if (!ids.sourceLinesId) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.vendor_credit, ids.sourceLinesId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: [`${LOG_CONTEXT}.source-lines`, ids.sourceLinesId],
    })
    const formStart = useVendorCreditFormStart(input)
    return {
        record: documentRead(id, creditQuery, record, [
            creditsCollection,
            vendorsCollection,
            usersCollection,
        ]),
        lines: documentRead(id, linesQuery, linesQuery.data ?? [], [
            linesCollection,
            productsCollection,
            accountsCollection,
        ]),
        source: documentRead(ids.sourceId, sourceQuery, source, [creditsCollection]),
        sourceLines: documentRead(
            ids.sourceLinesId,
            sourceLinesQuery,
            sourceLinesQuery.data ?? [],
            [linesCollection]
        ),
        ...NO_ESTIMATE_SOURCE,
        ...NO_INVOICE_SOURCE,
        ...NO_DOCUMENT_PAYMENTS,
        taxLines: NO_PURCHASE_TAX_LINES,
        formStart,
    }
}

// The vendor credit's writes: its row and the lines of both tables (one collection, each
// line with its `kind`), whose insert names the credit.
function useVendorCreditWrites(): DocumentWrites {
    const [creditsCollection, linesCollection] = useStore(
        'books_vendor_credits',
        'books_vendor_credit_lines'
    )
    return {
        // The columns were checked by vendorCreditColumnsFrom before the save started and
        // laid over EMPTY_VENDOR_CREDIT_COLUMNS (DocumentKind.emptyColumns), so they hold
        // every column of that shape; the shared layer carries them untyped.
        insertRecord: input =>
            creditsCollection.insert({
                ...(input.columns as VendorCreditInsertColumns),
                replaces: input.replaces,
                id: input.id,
                form: input.form,
                fields: input.fields,
            }),
        updateRecord: (id, input) => {
            const columns = columnsOrThrow(vendorCreditColumnsFrom, input.columns)
            return creditsCollection.update(id, draft => {
                Object.assign(draft, columns)
                if (Object.keys(input.fields).length > 0) draft.fields = input.fields
                draft.revision = input.revision
                if (input.post) draft.status = 'posted'
            })
        },
        postRecord: (id, revision) =>
            creditsCollection.update(id, draft => {
                draft.status = 'posted'
                draft.revision = revision
            }),
        voidRecord: id =>
            creditsCollection.update(id, draft => {
                draft.status = 'void'
            }),
        storedRevision: id => creditsCollection.get(id)?.revision,
        deleteRecord: id => creditsCollection.delete(id),
        lineOps: (creditId, mapper) =>
            purchaseLineOps(mapper, {
                insert: record => linesCollection.insert({ ...record, vendor_credit: creditId }),
                update: (lineId, record) =>
                    linesCollection.update(lineId, draft => {
                        Object.assign(draft, record)
                    }),
                remove: lineId => linesCollection.delete(lineId),
            }),
    }
}

// The row is the one the screen or the save already holds, so this sends no request.
function useVendorCreditVersion(id: string | undefined): string {
    const [creditsCollection] = useStore('books_vendor_credits')
    const { record } = useRecord(creditsCollection, id)
    return record?.updated ?? ''
}

function useVendorCreditReload(): () => Promise<void> {
    const [creditsCollection, linesCollection] = useStore(
        'books_vendor_credits',
        'books_vendor_credit_lines'
    )
    return async () => {
        await Promise.all([creditsCollection.reload(), linesCollection.reload()])
    }
}

/**
 * The reads of the vendor credit's read view parts (vendor credit spec §4 Client reads,
 * vendor refund spec §3.9), run once by its ReadFrame: the credit's applications and its
 * posted vendor refunds (`refunds`, the read view's one read of them, which its totals and
 * badge read too), merged into the Applied to block's rows in date order (`uses`,
 * creditUseRows), and its vendor's open bills (the notice above the band reads its rows and
 * state; the apply dialog runs its own query). None is the screen's read: the credit still
 * shows when one fails. The block waits for both of its reads and shows one load error when
 * either fails; its Retry recovers every failed read in one call, as the screen's Retry does
 * for its own; the apply dialog's Retry takes the open-bills read's recovery too
 * (`openBills.read.recovery`), so either Retry brings the notice back. The open-bills read
 * runs only while Apply can be offered (`canApply`: a writer on a posted credit).
 */
export function useVendorCreditSectionReads(credit: {
    id: string
    vendor: string
    canApply: boolean
    refunds: CreditRefunds
}) {
    const { refunds } = credit
    const applications = useCreditApplications({ credit: credit.id })
    const openBills = useOpenBills({ vendor: credit.vendor, isEnabled: credit.canApply })
    const bills = openBills.read
    const rows = useMemo(
        () => creditUseRows(applications.applications, refunds.refunds),
        [applications.applications, refunds.refunds]
    )
    const uses = {
        rows,
        isReady: applications.isReady && refunds.isReady,
        isError: applications.isError || refunds.isError,
    }
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([applications.recovery, refunds.recovery, bills.recovery]),
            onError: error => log.error(LOG_CONTEXT, error),
        })
    }
    return { applications, uses, openBills, retry }
}

// The vendor credit kind's data source: every `useStore` of a vendor credit collection.
export const VENDOR_CREDIT_DATA: DocumentDataSource = {
    useScreenReads: useVendorCreditScreenReads,
    useParty: vendorPartyRead(LOG_CONTEXT),
    useWrites: useVendorCreditWrites,
    useVersion: useVendorCreditVersion,
    useReload: useVendorCreditReload,
}
