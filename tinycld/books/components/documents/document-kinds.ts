import type { ComponentType, ReactNode } from 'react'
import type { DocumentDataSource, DocumentRecord, DocumentSource } from '../../hooks/document-data'
import { INVOICE_DATA } from '../../hooks/invoice-data'
import type { CustomerFill, TaxRateFill } from '../../lib/document-fills'
import type { DocumentLineRow } from '../../lib/document-line-columns'
import type { DocumentFormValuesBase } from '../../lib/document-values'
import { EMPTY_INVOICE_COLUMNS, invoiceColumnsFrom } from '../../lib/invoice-columns'
import {
    copyInvoiceValues,
    invoiceCorrectionValues,
    newInvoiceValues,
} from '../../lib/invoice-values'
import type { ColumnsParse } from '../../lib/record-columns'
import { INVOICE_KIND, type SalesDocumentKind } from '../../lib/sales-document-kinds'
import { InvoiceReadDetails } from './InvoiceReadDetails'

export type DocumentReadDetailsProps = {
    record: DocumentRecord
    isPhone: boolean
    // The shared date cell; each kind renders it where its details order puts it.
    children: ReactNode
}

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
        }) => DocumentFormValuesBase
        copy: (
            source: DocumentSource,
            lines: readonly DocumentLineRow[],
            today: string,
            customer: CustomerFill
        ) => DocumentFormValuesBase
        correction: (
            source: DocumentSource,
            lines: readonly DocumentLineRow[]
        ) => DocumentFormValuesBase
    }
    ReadDetails: ComponentType<DocumentReadDetailsProps>
}

// The source row with the invoice's own columns back at the top level. The invoice's
// data source reads only invoices, so another kind's columns here are a bug.
function invoiceRowOf(source: DocumentSource) {
    const fields = source.kindFields
    if (fields.kind !== 'invoice') throw new Error(`an invoice source has ${fields.kind} columns`)
    return { ...source, ...fields }
}

export const INVOICE_DOCUMENT: DocumentKind = {
    doc: INVOICE_KIND,
    data: INVOICE_DATA,
    columnsFrom: invoiceColumnsFrom,
    emptyColumns: EMPTY_INVOICE_COLUMNS,
    values: {
        new: newInvoiceValues,
        copy: (source, lines, today, customer) =>
            copyInvoiceValues(invoiceRowOf(source), lines, today, customer),
        correction: (source, lines) => invoiceCorrectionValues(invoiceRowOf(source), lines),
    },
    ReadDetails: InvoiceReadDetails,
}
