import type { Transaction } from '@tanstack/react-db'
import type { Users } from '@tinycld/core/types/pbSchema'
import { useRef } from 'react'
import type { DocumentLineRow } from '../lib/document-line-columns'
import type { DepositRule } from '../lib/document-schema'
import type { LiveRecovery } from '../lib/live-recovery'
import type { CopyDeposit } from '../lib/sales-receipt-values'
import type { TableWriteOps } from '../lib/table-writes'
import type {
    BooksAccounts,
    BooksInvoices,
    BooksInvoiceTaxLines,
    BooksProducts,
    BooksSalesReceipts,
    BooksTaxRates,
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
    customer?: string
    fresh?: string
}

// The columns every kind's header row has, as the generated invoice type names them.
type SharedColumns = Pick<
    BooksInvoices,
    | 'id'
    | 'status'
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
type InvoiceKindFields = { kind: 'invoice' } & Pick<BooksInvoices, 'terms' | 'due_date'>
type SalesReceiptKindFields = { kind: 'sales_receipt' } & Pick<
    BooksSalesReceipts,
    'payment_method' | 'reference_no' | 'deposit_to'
>
export type DocumentKindFields = InvoiceKindFields | SalesReceiptKindFields

// A header row without the people and the rate it names: the source of a correction or
// a copy.
export type DocumentSource = SharedColumns & { kindFields: DocumentKindFields }

// The header row as the screen reads it: who posted and voided it, and its tax rate (the
// read view's tax line names it). A sales receipt's own fields add its deposit account,
// which its payment line names.
export type DocumentRecord = SharedColumns & {
    kindFields:
        | InvoiceKindFields
        | (SalesReceiptKindFields & {
              depositRow: Pick<BooksAccounts, 'number' | 'name'> | undefined
          })
    postedBy: Pick<Users, 'name'> | undefined
    voidedBy: Pick<Users, 'name'> | undefined
    taxRateRow: Pick<BooksTaxRates, 'name'> | undefined
}

// A kind's own input to its new form's values and to a copy's, which its data source
// reads: none for an invoice; for a sales receipt, how Deposit to is chosen.
export type DocumentStart = { kind: 'invoice' } | { kind: 'sales_receipt'; deposit: CopyDeposit }

// What a kind's form starts from besides the document: its start input and the Deposit
// to rule of its schema (none for an invoice).
export type DocumentFormStart = { start: DocumentStart; deposit: DepositRule | undefined }

// A stored line with the product the read view names.
export type DocumentReadLine = DocumentLineRow & { productRow: BooksProducts | undefined }

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

export type DocumentScreenReads = {
    // The row as the form keeps it: while the form is held through a delete, the last row
    // read (the store already dropped it).
    record: DocumentRead<DocumentRecord | undefined>
    lines: DocumentRead<DocumentReadLine[]>
    source: DocumentRead<DocumentSource | undefined>
    sourceLines: DocumentRead<DocumentLineRow[]>
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
    updateRecord(
        id: string,
        input: { columns: Record<string, unknown>; fields: Record<string, unknown> }
    ): DocumentTransaction
    setStatus(id: string, status: 'posted' | 'void'): DocumentTransaction
    deleteRecord(id: string): DocumentTransaction
    // A line insert sets the parent field.
    lineOps(parentId: string): TableWriteOps<DocumentTransaction>
    // Takes line rows out of the store at once (a new document deleted after a refusal).
    evictLines(ids: string[]): void
}

export type DocumentDataSource = {
    useScreenReads(input: DocumentScreenInput & { isHeld: boolean }): DocumentScreenReads
    useWrites(): DocumentWrites
    // The stored document's `updated`, read from its own row ('' with no id): every write
    // moves it, so the PDF view fetches again.
    useVersion(id: string | undefined): string
}

export const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

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
// from the posting snapshot of a posted or void document; not read while the form holds
// a post, as the optimistic `posted` status would start the read and the form would give
// way to the loading state before a refusal could land on it.
export function linkedReadIds(
    input: DocumentScreenInput & { isHeld: boolean },
    record: Pick<DocumentSource, 'replaces'> | undefined,
    status: DocumentSource['status'] | null
) {
    const id = input.id ?? ''
    const isNew = input.id === null
    const sourceId = (isNew ? (input.replaces ?? input.copy) : record?.replaces) ?? ''
    const isReadStatus = status === 'posted' || status === 'void'
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
