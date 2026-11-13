import type { ComponentType, ReactNode } from 'react'
import type {
    DocumentDataSource,
    DocumentRecord,
    DocumentSource,
    DocumentStart,
    EstimateSource,
} from '../../hooks/document-data'
import { ESTIMATE_DATA } from '../../hooks/estimate-data'
import { INVOICE_DATA } from '../../hooks/invoice-data'
import { SALES_RECEIPT_DATA } from '../../hooks/sales-receipt-data'
import type { CustomerFill, TaxRateFill } from '../../lib/document-fills'
import type { DocumentLineRow } from '../../lib/document-line-columns'
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
import type { ColumnsParse } from '../../lib/record-columns'
import {
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
import { EstimateConvertedLink, EstimateReadDetails } from './EstimateReadDetails'
import { InvoiceFromEstimateLink, InvoiceReadDetails } from './InvoiceReadDetails'
import { SalesReceiptPaymentRow, SalesReceiptReadDetails } from './SalesReceiptReadDetails'

export type DocumentReadDetailsProps = {
    record: DocumentRecord
    isPhone: boolean
    // The shared date cell; each kind renders it where its details order puts it.
    children: ReactNode
}

export type DocumentReadBandRowProps = { record: DocumentRecord }

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
    values: {
        new: (input: {
            today: string
            customer: CustomerFill | null
            rates: TaxRateFill[]
            defaultRateId: string
            // The Books setting "Default message to customer" (defaultMessageFor).
            message: string
            // Undefined only where no data source read it (a unit test's form).
            start: DocumentStart | undefined
        }) => DocumentFormValuesBase
        // `customer` is null for a source saved without one (a walk-in sales receipt).
        copy: (
            source: DocumentSource,
            lines: readonly DocumentLineRow[],
            today: string,
            customer: CustomerFill | null,
            start: DocumentStart
        ) => DocumentFormValuesBase
        correction: (
            source: DocumentSource,
            lines: readonly DocumentLineRow[]
        ) => DocumentFormValuesBase
        // Convert to invoice (`?estimate`): the invoice's only. `message` is the
        // estimate's.
        fromEstimate?: (
            estimate: EstimateSource,
            lines: readonly DocumentLineRow[],
            today: string,
            customer: CustomerFill,
            message: string
        ) => DocumentFormValuesBase
    }
    ReadDetails: ComponentType<DocumentReadDetailsProps>
    // A ruled row at the bottom of the read view's band (a sales receipt's Payment).
    ReadBandRow?: ComponentType<DocumentReadBandRowProps>
    // A line under the read view's message and memo, below the Posted-by stamp of a posting
    // kind (an invoice's "From estimate <n>", a closed estimate's "Converted to invoice <n>").
    ReadStampRow?: ComponentType<DocumentReadBandRowProps>
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
function invoiceCustomerOf(customer: CustomerFill | null): CustomerFill {
    if (!customer) throw new Error('an invoice copy has no customer')
    return customer
}

export const INVOICE_DOCUMENT: DocumentKind = {
    doc: INVOICE_KIND,
    data: INVOICE_DATA,
    columnsFrom: invoiceColumnsFrom,
    emptyColumns: EMPTY_INVOICE_COLUMNS,
    values: {
        new: newInvoiceValues,
        copy: (source, lines, today, customer) =>
            copyInvoiceValues(invoiceRowOf(source), lines, today, invoiceCustomerOf(customer)),
        correction: (source, lines) => invoiceCorrectionValues(invoiceRowOf(source), lines),
        fromEstimate: invoiceValuesFromEstimate,
    },
    ReadDetails: InvoiceReadDetails,
    ReadStampRow: InvoiceFromEstimateLink,
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
function estimateCustomerOf(customer: CustomerFill | null): CustomerFill {
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
        new: newEstimateValues,
        copy: (source, lines, today, customer) =>
            copyEstimateValues(estimateRowOf(source), lines, today, estimateCustomerOf(customer)),
        // A quote is edited in place while it is open and never posts, so it has no
        // correction route (`?replaces`) to start one.
        correction: () => {
            throw new Error('an estimate has no correction')
        },
    },
    ReadDetails: EstimateReadDetails,
    ReadStampRow: EstimateConvertedLink,
}

export const SALES_RECEIPT_DOCUMENT: DocumentKind = {
    doc: SALES_RECEIPT_KIND,
    data: SALES_RECEIPT_DATA,
    columnsFrom: salesReceiptColumnsFrom,
    emptyColumns: EMPTY_SALES_RECEIPT_COLUMNS,
    values: {
        new: ({ start, ...input }) =>
            newSalesReceiptValues({ ...input, depositDefault: depositStartOf(start).defaultId }),
        copy: (source, lines, today, customer, start) =>
            copySalesReceiptValues(
                salesReceiptRowOf(source),
                lines,
                today,
                customer,
                depositStartOf(start)
            ),
        correction: (source, lines) =>
            salesReceiptCorrectionValues(salesReceiptRowOf(source), lines),
    },
    ReadDetails: SalesReceiptReadDetails,
    ReadBandRow: SalesReceiptPaymentRow,
}
