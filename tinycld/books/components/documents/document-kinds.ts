import type { HostTableColumn } from '@tinycld/core/lib/forms/definition'
import type { HostRowKind } from '@tinycld/core/lib/forms/host'
import { type TableRowMapper, tableRowsOf } from '@tinycld/core/lib/forms/table-rows'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import type { ComponentType, ReactNode } from 'react'
import { BILL_DATA } from '../../hooks/bill-data'
import {
    customerPartyOf,
    type DocumentDataSource,
    type DocumentPartyRow,
    type DocumentRecord,
    type DocumentSource,
    type DocumentStart,
    type DocumentStoredLine,
    type EstimateSource,
    isPurchaseLine,
    isSalesLine,
    vendorPartyOf,
} from '../../hooks/document-data'
import { ESTIMATE_DATA } from '../../hooks/estimate-data'
import { INVOICE_DATA } from '../../hooks/invoice-data'
import { SALES_RECEIPT_DATA } from '../../hooks/sales-receipt-data'
import { billColumnsFrom, EMPTY_BILL_COLUMNS } from '../../lib/bill-columns'
import {
    type BillFormValues,
    billCorrectionValues,
    copyBillValues,
    newBillValues,
} from '../../lib/bill-values'
import type { TaxRateFill } from '../../lib/document-fills'
import {
    DOCUMENT_LINE_COLUMNS,
    DOCUMENT_LINE_MAPPER,
    DOCUMENT_ROW_KINDS,
    type DocumentLineRow,
    type DocumentLineValues,
} from '../../lib/document-line-columns'
import type { DocumentFormValuesBase } from '../../lib/document-values'
import { EMPTY_ESTIMATE_COLUMNS, estimateColumnsFrom } from '../../lib/estimate-columns'
import { copyEstimateValues, newEstimateValues } from '../../lib/estimate-values'
import { EMPTY_INVOICE_COLUMNS, invoiceColumnsFrom } from '../../lib/invoice-columns'
import {
    copyInvoiceValues,
    invoiceCorrectionValues,
    invoiceValuesFromEstimate,
    newInvoiceValues,
} from '../../lib/invoice-values'
import {
    ACCOUNT_ROW_KIND,
    BILL_ACCOUNT_COLUMNS,
    PURCHASE_ITEM_COLUMNS,
    PURCHASE_ITEM_ROW_KIND,
    PURCHASE_LINE_MAPPER,
    type PurchaseLineRow,
    type PurchaseLineValues,
} from '../../lib/purchase-line-columns'
import type { PurchaseLines } from '../../lib/purchase-lines'
import type { ColumnsParse } from '../../lib/record-columns'
import {
    BILL_KIND,
    ESTIMATE_KIND,
    INVOICE_KIND,
    SALES_RECEIPT_KIND,
    type SalesDocumentKind,
} from '../../lib/sales-document-kinds'
import {
    EMPTY_SALES_RECEIPT_COLUMNS,
    salesReceiptColumnsFrom,
} from '../../lib/sales-receipt-columns'
import {
    type CopyDeposit,
    copySalesReceiptValues,
    newSalesReceiptValues,
    salesReceiptCorrectionValues,
} from '../../lib/sales-receipt-values'
import { BillReadDetails } from './BillReadDetails'
import type { DocumentReadLinesProps } from './DocumentReadLines'
import { EstimateConvertedLink, EstimateReadDetails } from './EstimateReadDetails'
import { InvoiceFromEstimateLink, InvoiceReadDetails } from './InvoiceReadDetails'
import { PurchaseReadLines } from './PurchaseReadLines'
import { SalesReceiptPaymentRow, SalesReceiptReadDetails } from './SalesReceiptReadDetails'

export type DocumentReadDetailsProps = {
    record: DocumentRecord
    isPhone: boolean
    // The shared date cell; each kind renders it where its details order puts it.
    children: ReactNode
}

export type DocumentReadBandRowProps = { record: DocumentRecord }

// How a kind's stored line rows map to a line table's form rows and back: the sales
// kinds' lines are DocumentLineRow, a purchase kind's PurchaseLineRow. `lines` tags which,
// so a data source and storedLineTableRows narrow to the one they hold.
export type DocumentLineMapper =
    | (TableRowMapper<DocumentLineRow, DocumentLineValues> & { lines: 'sales' })
    | (TableRowMapper<PurchaseLineRow, PurchaseLineValues> & { lines: 'purchase' })

// One line table's columns, row kinds and mapper, as its forms host built-in has them.
export type DocumentLineSpec = {
    columns: readonly HostTableColumn[]
    rowKinds: readonly HostRowKind[]
    mapper: DocumentLineMapper
}

const SALES_LINE_SPECS: Record<string, DocumentLineSpec> = {
    lines: {
        columns: DOCUMENT_LINE_COLUMNS,
        rowKinds: DOCUMENT_ROW_KINDS,
        mapper: { ...DOCUMENT_LINE_MAPPER, lines: 'sales' },
    },
}

const PURCHASE_MAPPER: DocumentLineMapper = { ...PURCHASE_LINE_MAPPER, lines: 'purchase' }

// The bill's two tables (BILL_LINE_TABLES), both stored in books_bill_lines.
const BILL_LINE_SPECS: Record<string, DocumentLineSpec> = {
    account_lines: {
        columns: BILL_ACCOUNT_COLUMNS,
        rowKinds: [ACCOUNT_ROW_KIND],
        mapper: PURCHASE_MAPPER,
    },
    item_lines: {
        columns: PURCHASE_ITEM_COLUMNS,
        rowKinds: [PURCHASE_ITEM_ROW_KIND],
        mapper: PURCHASE_MAPPER,
    },
}

// One table's stored lines as its form rows, through the table's mapper: only the lines of
// the mapper's own line type (a kind's data source reads one type).
function tableRowsOfSpec(spec: DocumentLineSpec, lines: readonly DocumentStoredLine[]): TableRow[] {
    const { mapper } = spec
    if (mapper.lines === 'purchase') return tableRowsOf(lines.filter(isPurchaseLine), mapper)
    return tableRowsOf(lines.filter(isSalesLine), mapper)
}

/**
 * A stored document's lines as each line table's form rows, by the table's spec
 * (DocumentKind.lineSpecs): a kind with one table gets every line there; with more, each
 * table gets the lines of its own row kinds. The form seeds its tables from it, and the
 * read view sums each table's subtotal over it.
 */
export function storedLineTableRows(
    documentKind: Pick<DocumentKind, 'doc' | 'lineSpecs'>,
    lines: readonly DocumentStoredLine[]
): Record<string, TableRow[]> {
    const tables = documentKind.doc.lineTables
    const entries = tables.map(table => {
        const spec = documentKind.lineSpecs[table.key]
        const kinds = new Set(spec.rowKinds.map(rowKind => rowKind.key))
        const own = tables.length === 1 ? lines : lines.filter(line => kinds.has(line.kind))
        return [table.key, tableRowsOfSpec(spec, own)] as const
    })
    return Object.fromEntries(entries)
}

// A form's start values: a sales kind's, or a bill's (its party is `vendor` and it has two
// line tables).
export type DocumentStartValues = DocumentFormValuesBase | BillFormValues

/**
 * A sales document kind as the screen runs it: its words and ids (`doc`), its reads and
 * writes, the check of the built-in columns its form writes, the base of a new row's
 * columns, its form's start values, and the read view's details only it has.
 */
export type DocumentKind = {
    doc: SalesDocumentKind
    data: DocumentDataSource
    columnsFrom: (columns: Record<string, unknown>) => ColumnsParse<Record<string, unknown>>
    // A new row's columns before the form's are laid over them, so a column the form left
    // out is stored empty.
    emptyColumns: Record<string, unknown>
    // `party` is the form's party row (DOCUMENT_PARTIES[doc.party]: a sales kind's
    // customer, a bill's vendor). `lines` are the source's stored lines, of the kind's line
    // type (DocumentLineMapper).
    values: {
        new: (input: {
            today: string
            party: DocumentPartyRow | null
            rates: TaxRateFill[]
            defaultRateId: string
            // The Books setting "Default message to customer" (defaultMessageFor).
            message: string
            // Undefined only where no data source read it (a unit test's form).
            start: DocumentStart | undefined
        }) => DocumentStartValues
        // `party` is null for a source saved without one (a walk-in sales receipt).
        copy: (
            source: DocumentSource,
            lines: readonly DocumentStoredLine[],
            today: string,
            party: DocumentPartyRow | null,
            start: DocumentStart
        ) => DocumentStartValues
        correction: (
            source: DocumentSource,
            lines: readonly DocumentStoredLine[]
        ) => DocumentStartValues
        // Convert to invoice (`?estimate`): the invoice's only. `message` is the
        // estimate's.
        fromEstimate?: (
            estimate: EstimateSource,
            lines: readonly DocumentLineRow[],
            today: string,
            party: DocumentPartyRow,
            message: string
        ) => DocumentStartValues
    }
    ReadDetails: ComponentType<DocumentReadDetailsProps>
    // A ruled row at the bottom of the read view's band (a sales receipt's Payment).
    ReadBandRow?: ComponentType<DocumentReadBandRowProps>
    // A line under the read view's message and memo, below the Posted-by stamp of a posting
    // kind (an invoice's "From estimate <n>", a closed estimate's "Converted to invoice <n>").
    ReadStampRow?: ComponentType<DocumentReadBandRowProps>
    // Each line table's spec, keyed by the table's key (`doc.lineTables`).
    lineSpecs: Record<string, DocumentLineSpec>
    // The read view's lines; DocumentReadLines when absent.
    ReadLines?: ComponentType<DocumentReadLinesProps>
}

// The source row with the invoice's own columns back at the top level. The invoice's
// data source reads only invoices, so another kind's columns here are a bug.
function invoiceRowOf(source: DocumentSource) {
    const fields = source.kindFields
    if (fields.kind !== 'invoice') throw new Error(`an invoice source has ${fields.kind} columns`)
    return { ...source, ...fields }
}

// An invoice always has a customer: the screen passes null only for a source saved
// without one, which an invoice never is.
function invoiceCustomerOf(party: DocumentPartyRow | null) {
    const customer = customerPartyOf(party)
    if (!customer) throw new Error('an invoice copy has no customer')
    return customer
}

export const INVOICE_DOCUMENT: DocumentKind = {
    doc: INVOICE_KIND,
    data: INVOICE_DATA,
    columnsFrom: invoiceColumnsFrom,
    emptyColumns: EMPTY_INVOICE_COLUMNS,
    values: {
        new: ({ party, ...input }) =>
            newInvoiceValues({ ...input, customer: customerPartyOf(party) }),
        copy: (source, lines, today, party) =>
            copyInvoiceValues(
                invoiceRowOf(source),
                lines.filter(isSalesLine),
                today,
                invoiceCustomerOf(party)
            ),
        correction: (source, lines) =>
            invoiceCorrectionValues(invoiceRowOf(source), lines.filter(isSalesLine)),
        fromEstimate: (estimate, lines, today, party, message) =>
            invoiceValuesFromEstimate(estimate, lines, today, invoiceCustomerOf(party), message),
    },
    ReadDetails: InvoiceReadDetails,
    ReadStampRow: InvoiceFromEstimateLink,
    lineSpecs: SALES_LINE_SPECS,
}

// The source row with the receipt's own columns back at the top level, as invoiceRowOf.
function salesReceiptRowOf(source: DocumentSource) {
    const fields = source.kindFields
    if (fields.kind !== 'sales_receipt') {
        throw new Error(`a sales receipt source has ${fields.kind} columns`)
    }
    return { ...source, ...fields }
}

// A form given no start (a unit test's) has no deposit account to start on.
const NO_DEPOSIT_START: CopyDeposit = { setAccount: '', activeIds: new Set(), defaultId: '' }

// How the receipt's Deposit to is chosen, from its data source's start.
function depositStartOf(start: DocumentStart | undefined): CopyDeposit {
    if (!start) return NO_DEPOSIT_START
    if (start.kind !== 'sales_receipt') {
        throw new Error(`a sales receipt form has a ${start.kind} start`)
    }
    return start.deposit
}

// The source row with the estimate's own columns back at the top level, as invoiceRowOf.
function estimateRowOf(source: DocumentSource) {
    const fields = source.kindFields
    if (fields.kind !== 'estimate') throw new Error(`an estimate source has ${fields.kind} columns`)
    return { ...source, ...fields }
}

// An estimate always has a customer (it is required): the screen passes null only for a
// source saved without one, which an estimate never is.
function estimateCustomerOf(party: DocumentPartyRow | null) {
    const customer = customerPartyOf(party)
    if (!customer) throw new Error('an estimate copy has no customer')
    return customer
}

// A copied customer, product or tax rate that is now inactive stays in the form, and the
// save refuses it with the shared inactive texts, as an invoice copy's does.
export const ESTIMATE_DOCUMENT: DocumentKind = {
    doc: ESTIMATE_KIND,
    data: ESTIMATE_DATA,
    columnsFrom: estimateColumnsFrom,
    emptyColumns: EMPTY_ESTIMATE_COLUMNS,
    values: {
        new: ({ party, ...input }) =>
            newEstimateValues({ ...input, customer: customerPartyOf(party) }),
        copy: (source, lines, today, party) =>
            copyEstimateValues(
                estimateRowOf(source),
                lines.filter(isSalesLine),
                today,
                estimateCustomerOf(party)
            ),
        // A quote is edited in place while it is open and never posts, so it has no
        // correction route (`?replaces`) to start one.
        correction: () => {
            throw new Error('an estimate has no correction')
        },
    },
    ReadDetails: EstimateReadDetails,
    ReadStampRow: EstimateConvertedLink,
    lineSpecs: SALES_LINE_SPECS,
}

export const SALES_RECEIPT_DOCUMENT: DocumentKind = {
    doc: SALES_RECEIPT_KIND,
    data: SALES_RECEIPT_DATA,
    columnsFrom: salesReceiptColumnsFrom,
    emptyColumns: EMPTY_SALES_RECEIPT_COLUMNS,
    values: {
        new: ({ start, party, ...input }) =>
            newSalesReceiptValues({
                ...input,
                customer: customerPartyOf(party),
                depositDefault: depositStartOf(start).defaultId,
            }),
        copy: (source, lines, today, party, start) =>
            copySalesReceiptValues(
                salesReceiptRowOf(source),
                lines.filter(isSalesLine),
                today,
                customerPartyOf(party),
                depositStartOf(start)
            ),
        correction: (source, lines) =>
            salesReceiptCorrectionValues(salesReceiptRowOf(source), lines.filter(isSalesLine)),
    },
    ReadDetails: SalesReceiptReadDetails,
    ReadBandRow: SalesReceiptPaymentRow,
    lineSpecs: SALES_LINE_SPECS,
}

// The source row with the bill's own columns back at the top level, as invoiceRowOf.
function billRowOf(source: DocumentSource) {
    const fields = source.kindFields
    if (fields.kind !== 'bill') throw new Error(`a bill source has ${fields.kind} columns`)
    return { ...source, ...fields }
}

// A bill always has a vendor (it is required): the screen passes null only for a source
// saved without one, which a bill never is.
function billVendorOf(party: DocumentPartyRow | null) {
    const vendor = vendorPartyOf(party)
    if (!vendor) throw new Error('a bill copy has no vendor')
    return vendor
}

// The bill's start: the Bill lines setting a new form starts from and whether the Account
// picker lists the `?vendor` vendor's default expense account. A form given no start (a
// unit test's) shows both tables, the setting's default, and lists no vendor account.
function billStartOf(start: DocumentStart | undefined): {
    purchaseLines: PurchaseLines
    accountIsListed: boolean
} {
    if (!start) return { purchaseLines: 'both', accountIsListed: false }
    if (start.kind !== 'bill') throw new Error(`a bill form has a ${start.kind} start`)
    return {
        purchaseLines: start.purchaseLines,
        accountIsListed: start.vendorAccountListed ?? false,
    }
}

// A purchase document: the party is the vendor, the lines are two tables (account lines
// and product lines) and it has no tax, message, email or PDF. A copied vendor, account or
// product that is now inactive stays in the form, and Post refuses it with the bill's
// texts.
export const BILL_DOCUMENT: DocumentKind = {
    doc: BILL_KIND,
    data: BILL_DATA,
    columnsFrom: billColumnsFrom,
    emptyColumns: EMPTY_BILL_COLUMNS,
    values: {
        // `?vendor` fills Mailing address, Terms and Due date as a pick does, and the first
        // account line's Account with the vendor's default expense account when the
        // Account picker lists it (the start read it, BILL_DATA).
        new: ({ party, today, start }) =>
            newBillValues({
                today,
                ...billStartOf(start),
                vendor: vendorPartyOf(party),
            }),
        copy: (source, lines, today, party) =>
            copyBillValues(
                billRowOf(source),
                lines.filter(isPurchaseLine),
                today,
                billVendorOf(party)
            ),
        correction: (source, lines) =>
            billCorrectionValues(billRowOf(source), lines.filter(isPurchaseLine)),
    },
    ReadDetails: BillReadDetails,
    ReadLines: PurchaseReadLines,
    lineSpecs: BILL_LINE_SPECS,
}
