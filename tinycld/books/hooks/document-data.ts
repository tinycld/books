import type { Transaction } from '@tanstack/react-db'
import type { Users } from '@tinycld/core/types/pbSchema'
import { useRef } from 'react'
import type { DocumentLineMapper } from '../components/documents/document-kinds'
import { type DocumentStatus, isReadOnlyStatus } from '../lib/document-lifecycle'
import type { DocumentLineRow } from '../lib/document-line-columns'
import type { DepositRule } from '../lib/document-schema'
import { isExpired } from '../lib/estimate-status'
import type { LiveRecovery } from '../lib/live-recovery'
import type { PurchaseLineRow } from '../lib/purchase-line-columns'
import type { PurchaseLines } from '../lib/purchase-lines'
import type { DocumentLifecycle } from '../lib/sales-document-kinds'
import type { CopyDeposit } from '../lib/sales-receipt-values'
import type { TableWriteOps } from '../lib/table-writes'
import type {
    BooksAccounts,
    BooksBills,
    BooksCustomers,
    BooksEstimates,
    BooksInvoices,
    BooksInvoiceTaxLines,
    BooksProducts,
    BooksSalesReceipts,
    BooksTaxRates,
    BooksVendors,
} from '../types'

// The per-kind reads and writes the shared sales document layer calls. pbtsdb's
// `useStore` is typed by literal collection names, so a shared hook never names a
// collection: each kind's data source (hooks/invoice-data.ts) holds every `useStore` of
// its document collections and maps its rows into the shapes below.

export type DocumentScreenInput = {
    // The document's id; null on `<routeBase>/new`.
    id: string | null
    replaces?: string
    copy?: string
    // The party a new form is opened with (`?customer`, or `?vendor` on a kind whose party
    // is a vendor): the screen reads the one its kind's party names.
    customer?: string
    vendor?: string
    fresh?: string
    // On an invoice's new form: the estimate it is made from (Convert to invoice).
    estimate?: string
}

// The columns every kind's header row has, as the generated invoice type names them,
// with any kind's status. The posting columns (`entry` … `replaced_by`) are '' on a kind
// that never posts; the sales columns (`customer` … `tax_total`) are ''/null/0 on a
// purchase kind (bill-data.ts). `revision` is what a save states it saw (lib/revision.ts).
type SharedColumns = { status: DocumentStatus } & Pick<
    BooksInvoices,
    | 'id'
    | 'number'
    | 'customer'
    | 'date'
    | 'bill_to'
    | 'email'
    | 'tax_rate'
    | 'message'
    | 'memo'
    | 'subtotal'
    | 'tax_total'
    | 'total'
    | 'revision'
    | 'currency'
    | 'entry'
    | 'posted_at'
    | 'voided_at'
    | 'replaces'
    | 'replaced_by'
    | 'form'
    | 'fields'
    | 'updated'
>

// The columns only one kind has, tagged with the kind.
type InvoiceKindFields = { kind: 'invoice' } & Pick<
    BooksInvoices,
    'terms' | 'due_date' | 'estimate'
>
type SalesReceiptKindFields = { kind: 'sales_receipt' } & Pick<
    BooksSalesReceipts,
    'payment_method' | 'reference_no' | 'deposit_to'
>
type EstimateKindFields = { kind: 'estimate' } & Pick<
    BooksEstimates,
    'expiration_date' | 'accepted_by' | 'accepted_date' | 'invoice' | 'public_token'
>
type BillKindFields = { kind: 'bill' } & Pick<
    BooksBills,
    'vendor' | 'terms' | 'due_date' | 'ref_no' | 'mailing_address'
>
export type DocumentKindFields =
    | InvoiceKindFields
    | SalesReceiptKindFields
    | EstimateKindFields
    | BillKindFields

// A header row without the people and the rate it names: the source of a correction or
// a copy.
export type DocumentSource = SharedColumns & { kindFields: DocumentKindFields }

// The header row as the screen reads it: who posted and voided it, and its tax rate (the
// read view's tax line names it). A sales receipt's own fields add its deposit account,
// which its payment line names; an invoice's the estimate it was made from ("From
// estimate <n>"); an estimate's the invoice made from it ("Converted to invoice <n>").
export type DocumentRecord = SharedColumns & {
    kindFields:
        | (InvoiceKindFields & { estimateRow: Pick<BooksEstimates, 'number'> | undefined })
        | (SalesReceiptKindFields & {
              depositRow: Pick<BooksAccounts, 'number' | 'name'> | undefined
          })
        | (EstimateKindFields & {
              invoiceRow: Pick<BooksInvoices, 'number' | 'status'> | undefined
          })
        | (BillKindFields & { vendorRow: Pick<BooksVendors, 'display_name'> | undefined })
    postedBy: Pick<Users, 'name'> | undefined
    voidedBy: Pick<Users, 'name'> | undefined
    taxRateRow: Pick<BooksTaxRates, 'name'> | undefined
}

// The saved expiration date of a stored estimate that shows as Expired (isExpired); null
// for any other record and on a new form. Read from the stored row, never the form, so an
// unsaved date changes nothing.
export function expiredOnOf(record: DocumentRecord | undefined, today: string): string | null {
    const fields = record?.kindFields
    if (!record || fields?.kind !== 'estimate') return null
    const estimate = { status: record.status, expiration_date: fields.expiration_date }
    return isExpired(estimate, today) ? fields.expiration_date : null
}

// The id of a document's party (DOCUMENT_PARTIES): a purchase kind keeps its vendor in
// its own columns (`kindFields.vendor`); every sales kind's party is `customer`.
export function documentPartyIdOf(record: Pick<DocumentSource, 'customer' | 'kindFields'>): string {
    const fields = record.kindFields
    if ('vendor' in fields && typeof fields.vendor === 'string') return fields.vendor
    return record.customer
}

// A kind's own input to its new form's values and to a copy's, which its data source
// reads: none for an invoice or an estimate; for a sales receipt, how Deposit to is
// chosen; for a bill, the Bill lines setting (which tables a new form shows) and, on a new
// form opened with `?vendor`, whether the Account picker lists that vendor's default
// expense account (only then does the first account line start with it; undefined
// without `?vendor`).
export type DocumentStart =
    | { kind: 'invoice' }
    | { kind: 'sales_receipt'; deposit: CopyDeposit }
    | { kind: 'estimate' }
    | { kind: 'bill'; purchaseLines: PurchaseLines; vendorAccountListed?: boolean }

// What a kind's form starts from besides the document: its start input and the Deposit
// to rule of its schema (none for an invoice).
export type DocumentFormStart = { start: DocumentStart; deposit: DepositRule | undefined }

// A stored line of any kind: a sales kind's (DocumentLineRow) or a purchase kind's
// (PurchaseLineRow, which alone has an `account` column).
export type DocumentStoredLine = DocumentLineRow | PurchaseLineRow

export function isPurchaseLine(line: DocumentStoredLine): line is PurchaseLineRow {
    return 'account' in line
}

export function isSalesLine(line: DocumentStoredLine): line is DocumentLineRow {
    return !isPurchaseLine(line)
}

// A line table's mapper as a sales kind's (the `lines` tag DocumentLineMapper carries). A
// purchase mapper here is a bug: a sales kind's data source writes sales lines only.
export function salesLineMapperOf(mapper: DocumentLineMapper) {
    if (mapper.lines !== 'sales') throw new Error('a sales document has a purchase line table')
    return mapper
}

// A line table's mapper as a purchase kind's, as salesLineMapperOf.
export function purchaseLineMapperOf(mapper: DocumentLineMapper) {
    if (mapper.lines !== 'purchase') throw new Error('a purchase document has a sales line table')
    return mapper
}

// A stored line with the product the read view names; a purchase line also with its
// account ("<number> <name>").
export type SalesReadLine = DocumentLineRow & { productRow: BooksProducts | undefined }
export type PurchaseReadLine = PurchaseLineRow & {
    productRow: BooksProducts | undefined
    accountRow: Pick<BooksAccounts, 'number' | 'name'> | undefined
}
export type DocumentReadLine = SalesReadLine | PurchaseReadLine

export function isPurchaseReadLine(line: DocumentReadLine): line is PurchaseReadLine {
    return isPurchaseLine(line)
}

export function isSalesReadLine(line: DocumentReadLine): line is SalesReadLine {
    return isSalesLine(line)
}

// A tax line the server wrote at posting (the tax-rates snapshot).
export type DocumentTaxLine = Pick<BooksInvoiceTaxLines, 'id' | 'rate_ppm' | 'amount'>

// One read's state: ready (a disabled read is ready), failed, and what Retry recovers
// (empty unless it failed).
export type DocumentRead<T> = {
    data: T
    isReady: boolean
    isError: boolean
    recovery: LiveRecovery
}

// The estimate an invoice is made from (`?estimate`), as its own row.
export type EstimateSource = BooksEstimates

export type DocumentScreenReads = {
    // The row as the form keeps it: while the form is held through a delete, the last row
    // read (the store already dropped it).
    record: DocumentRead<DocumentRecord | undefined>
    lines: DocumentRead<DocumentReadLine[]>
    source: DocumentRead<DocumentSource | undefined>
    sourceLines: DocumentRead<DocumentStoredLine[]>
    // On an invoice's new form with `?estimate`: the estimate it is made from and its
    // lines in order. Idle (ready and empty) on every other form and kind.
    estimateSource: DocumentRead<EstimateSource | undefined>
    estimateSourceLines: DocumentRead<DocumentLineRow[]>
    taxLines: DocumentRead<DocumentTaxLine[]>
    // `errorText` is the error state's text when only this read failed.
    formStart: DocumentRead<DocumentFormStart> & { errorText?: string }
}

export type DocumentTransaction = Transaction<Record<string, unknown>>

export type DocumentWrites = {
    // `columns` are the form's built-in columns (the kind's `columnsFrom` checked them); an
    // insert's are laid over the kind's `emptyColumns`.
    insertRecord(input: {
        id: string
        columns: Record<string, unknown>
        replaces: string
        form: string
        fields: Record<string, unknown>
    }): DocumentTransaction
    // The one header write of a saved document's save: its changed columns, the revision
    // the save states (the value the form saw, plus one; the server refuses any other
    // with a 409) and, for a post made in the save, `status: 'posted'`.
    updateRecord(
        id: string,
        input: {
            columns: Record<string, unknown>
            fields: Record<string, unknown>
            revision: number
            post: boolean
        }
    ): DocumentTransaction
    // The post of a draft that a batch just wrote, as its own request after the batch.
    postRecord(id: string, revision: number): DocumentTransaction
    // A posted document has no draft to go stale: a void states no revision.
    voidRecord(id: string): DocumentTransaction
    // The revision the store row holds now, read one time at a save (never rendered from);
    // undefined when the store holds no such row. The save compares it with the revision
    // the form saw (assertRevisionSeen, lib/revision.ts).
    storedRevision(id: string): number | undefined
    // One request: the server deletes the lines with the row, in one transaction.
    deleteRecord(id: string): DocumentTransaction
    // One line table's writes: each row converts through the table's mapper
    // (DocumentKind.lineSpecs), and a line insert sets the parent field.
    lineOps(parentId: string, mapper: DocumentLineMapper): TableWriteOps<DocumentTransaction>
}

// The party row a form and a screen read: a sales kind's customer or a purchase kind's
// vendor.
export type DocumentPartyRow = BooksCustomers | BooksVendors

// The party row as a customer (a sales kind's): null for no party. A vendor here is a
// bug: a sales kind's data source reads customers only.
export function customerPartyOf(party: DocumentPartyRow | null): BooksCustomers | null {
    if (!party) return null
    if (!('billing_address' in party)) throw new Error('a sales document has a vendor party')
    return party
}

// The party row as a vendor (a purchase kind's), as customerPartyOf.
export function vendorPartyOf(party: DocumentPartyRow | null): BooksVendors | null {
    if (!party) return null
    if (!('expense_account' in party)) throw new Error('a purchase document has a customer party')
    return party
}

// One read of the party a document names: its row (undefined with no id, while it loads,
// or when it does not exist), its state, what the screen's one Retry recovers (empty
// unless it failed) and a Retry of this read alone.
export type DocumentPartyRead = {
    data: DocumentPartyRow | undefined
    isLoading: boolean
    isReady: boolean
    isError: boolean
    recovery: LiveRecovery
    retry: () => void
}

export type DocumentDataSource = {
    useScreenReads(input: DocumentScreenInput & { isHeld: boolean }): DocumentScreenReads
    // The party `id` names ('' reads nothing), from the collection of the kind's party.
    // Each call is its own live query: the screen's and the form's reads fail and recover
    // apart.
    useParty(id: string): DocumentPartyRead
    useWrites(): DocumentWrites
    // The stored document's `updated`, read from its own row ('' with no id): every write
    // moves it, so the PDF view fetches again.
    useVersion(id: string | undefined): string
    // Reads the document's row and lines again from the server. The store can be behind
    // it (a realtime message that did not arrive), and a form built from the store alone
    // would be refused again.
    useReload(): () => Promise<void>
}

export const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// The estimate reads of a form that is not made from an estimate: ready, empty, never
// failed.
export const NO_ESTIMATE_SOURCE: Pick<
    DocumentScreenReads,
    'estimateSource' | 'estimateSourceLines'
> = {
    estimateSource: { data: undefined, isReady: true, isError: false, recovery: NO_RECOVERY },
    estimateSourceLines: { data: [], isReady: true, isError: false, recovery: NO_RECOVERY },
}

// The number of the estimate an invoice names, for "From estimate <n>": the stored
// invoice's estimate, else the estimate a new form is made from; '' for neither.
export function estimateNumberOf(
    record: DocumentRecord | undefined,
    estimateSource: EstimateSource | undefined
): string {
    const fields = record?.kindFields
    if (fields?.kind === 'invoice' && fields.estimateRow) return fields.estimateRow.number
    return estimateSource?.number ?? ''
}

type QueryState = {
    isEnabled: boolean
    isReady: boolean
    isError: boolean
    collection?: LiveRecovery['queries'][number] | null
}

// A read's state from its live query. A disabled query reports ready, so the id is
// checked as well as `isEnabled`; its recovery is non-empty only when it failed, so one
// Retry recovers exactly the failed reads.
export function documentRead<T>(
    id: string,
    query: QueryState,
    data: T,
    sources: LiveRecovery['sources']
): DocumentRead<T> {
    const recovery =
        query.isError && query.collection ? { queries: [query.collection], sources } : NO_RECOVERY
    return {
        data,
        isReady: !id || (query.isEnabled && query.isReady),
        isError: query.isError,
        recovery,
    }
}

// A held delete removes the row from the store before the server answers. The form
// keeps the last row it read until then, so its values do not reset and a refusal (the
// row comes back) finds the user's edits where they were.
export function useHeldRecord<T>(data: T | undefined, isHeld: boolean): T | undefined {
    const last = useRef(data)
    if (data) last.current = data
    return data ?? (isHeld ? last.current : undefined)
}

// The ids of the reads that follow from the record. The source: on a new form, the one
// `?replaces` corrects or `?copy` copies (its lines give the form's values); on a saved
// correction draft, the one it replaces (its number titles the form). The tax lines come
// from the posting snapshot of a posted or void document, so only the posting lifecycle
// reads them (a quote never posts and has no tax lines); not read while the form holds
// a post, as the optimistic `posted` status would start the read and the form would give
// way to the loading state before a refusal could land on it.
export function linkedReadIds(
    input: DocumentScreenInput & { isHeld: boolean },
    record: Pick<DocumentSource, 'replaces'> | undefined,
    status: DocumentStatus | null,
    lifecycle: DocumentLifecycle
) {
    const id = input.id ?? ''
    const isNew = input.id === null
    const sourceId = (isNew ? (input.replaces ?? input.copy) : record?.replaces) ?? ''
    const isReadStatus =
        lifecycle === 'posting' && status !== null && isReadOnlyStatus(lifecycle, status)
    return {
        sourceId,
        sourceLinesId: isNew ? sourceId : '',
        taxLinesId: isReadStatus && !input.isHeld ? id : '',
    }
}

// The record as the form engine reads it: one flat row of its columns, the kind's own
// columns included.
export function recordColumnsOf(record: DocumentSource): Record<string, unknown> & { id: string } {
    const { kindFields, ...columns } = record
    const { kind: _kind, ...own } = kindFields
    return { ...columns, ...own }
}
