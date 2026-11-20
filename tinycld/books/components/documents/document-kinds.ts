import type { HostTableColumn } from '@tinycld/core/lib/forms/definition'
import type { HostRowKind } from '@tinycld/core/lib/forms/host'
import type { FormValues } from '@tinycld/core/lib/forms/logic'
import { type TableRowMapper, tableRowsOf } from '@tinycld/core/lib/forms/table-rows'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import type { ComponentType, ReactNode } from 'react'
import { BILL_DATA } from '../../hooks/bill-data'
import { CREDIT_MEMO_DATA } from '../../hooks/credit-memo-data'
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
import { EXPENSE_DATA } from '../../hooks/expense-data'
import { INVOICE_DATA } from '../../hooks/invoice-data'
import { REFUND_RECEIPT_DATA } from '../../hooks/refund-receipt-data'
import { SALES_RECEIPT_DATA } from '../../hooks/sales-receipt-data'
import type { CreditRefunds } from '../../hooks/useCreditRefunds'
import type { LinkedRefundReceipts } from '../../hooks/useLinkedRefundReceipts'
import { VENDOR_CREDIT_DATA } from '../../hooks/vendor-credit-data'
import { billColumnsFrom, EMPTY_BILL_COLUMNS } from '../../lib/bill-columns'
import {
    type BillFormValues,
    billCorrectionValues,
    billReadTotals,
    copyBillValues,
    newBillValues,
    vendorBillFills,
} from '../../lib/bill-values'
import {
    CREDIT_MEMO_APPLICATION,
    type CreditApplicationKind,
    VENDOR_CREDIT_APPLICATION,
} from '../../lib/credit-application-kinds'
import { creditMemoColumnsFrom, EMPTY_CREDIT_MEMO_COLUMNS } from '../../lib/credit-memo-columns'
import {
    copyCreditMemoValues,
    creditMemoCorrectionValues,
    creditMemoValuesFromInvoice,
    newCreditMemoValues,
} from '../../lib/credit-memo-values'
import type { TaxRateFill } from '../../lib/document-fills'
import {
    type BalanceBadge,
    creditMemoBadge,
    paidBadge,
    vendorCreditBadge,
    writtenOffBadge,
} from '../../lib/document-lifecycle'
import {
    DOCUMENT_LINE_COLUMNS,
    DOCUMENT_LINE_MAPPER,
    DOCUMENT_ROW_KINDS,
    type DocumentLineRow,
    type DocumentLineValues,
} from '../../lib/document-line-columns'
import type { LinkSource, SourceLinkKey } from '../../lib/document-source-links'
import type { DocumentTotalRow } from '../../lib/document-total-rows'
import type { DocumentFormValuesBase } from '../../lib/document-values'
import { EMPTY_ESTIMATE_COLUMNS, estimateColumnsFrom } from '../../lib/estimate-columns'
import { copyEstimateValues, newEstimateValues } from '../../lib/estimate-values'
import { EMPTY_EXPENSE_COLUMNS, expenseColumnsFrom } from '../../lib/expense-columns'
import {
    copyExpenseValues,
    type ExpenseFormValues,
    expenseCorrectionValues,
    expenseVendorFills,
    newExpenseValues,
} from '../../lib/expense-values'
import { rowsOf, textOf } from '../../lib/form-values'
import { EMPTY_INVOICE_COLUMNS, invoiceColumnsFrom } from '../../lib/invoice-columns'
import {
    copyInvoiceValues,
    invoiceCorrectionValues,
    invoiceValuesFromEstimate,
    newInvoiceValues,
} from '../../lib/invoice-values'
import { formatMoney, MINUS } from '../../lib/money'
import {
    ACCOUNT_ROW_KIND,
    PURCHASE_ACCOUNT_COLUMNS,
    PURCHASE_ITEM_COLUMNS,
    PURCHASE_ITEM_ROW_KIND,
    PURCHASE_LINE_MAPPER,
    type PurchaseLineRow,
    type PurchaseLineValues,
} from '../../lib/purchase-line-columns'
import type { PurchaseLines } from '../../lib/purchase-lines'
import type { ColumnsParse } from '../../lib/record-columns'
import {
    EMPTY_REFUND_RECEIPT_COLUMNS,
    refundReceiptColumnsFrom,
} from '../../lib/refund-receipt-columns'
import {
    copyRefundReceiptValues,
    newRefundReceiptValues,
    refundReceiptCorrectionValues,
    refundValuesFromCreditMemo,
    refundValuesFromSalesReceipt,
} from '../../lib/refund-receipt-values'
import {
    BILL_KIND,
    CREDIT_MEMO_KIND,
    ESTIMATE_KIND,
    EXPENSE_KIND,
    INVOICE_KIND,
    REFUND_RECEIPT_KIND,
    SALES_RECEIPT_KIND,
    type SalesDocumentKind,
    VENDOR_CREDIT_KIND,
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
import {
    EMPTY_VENDOR_CREDIT_COLUMNS,
    vendorCreditColumnsFrom,
} from '../../lib/vendor-credit-columns'
import { vendorCreditAppliedToBills, vendorCreditReadTotals } from '../../lib/vendor-credit-totals'
import {
    copyVendorCreditValues,
    newVendorCreditValues,
    type VendorCreditFormValues,
    vendorCreditCorrectionValues,
    vendorCreditVendorFills,
} from '../../lib/vendor-credit-values'
import type { BooksVendors } from '../../types'
import { BillReadDetails } from './BillReadDetails'
import { CreditMemoReadFrame, VendorCreditReadFrame } from './CreditApplySection'
import { CreditMemoLinkRow } from './CreditMemoLinkRow'
import { CreditMemoInvoiceLink, CreditMemoReadDetails } from './CreditMemoReadDetails'
import type { DocumentReadLinesProps } from './DocumentReadLines'
import { EstimateConvertedLink, EstimateReadDetails } from './EstimateReadDetails'
import { ExpensePaymentRow, ExpenseReadDetails } from './ExpenseReadDetails'
import { InvoiceApplyFrame } from './InvoiceApplyFrame'
import { InvoiceFromEstimateLink, InvoiceReadDetails } from './InvoiceReadDetails'
import { InvoiceSections } from './InvoiceSections'
import { PurchaseReadLines } from './PurchaseReadLines'
import { RefundReceiptLinkRow } from './RefundReceiptLinkRow'
import { RefundReceiptBandRows, RefundReceiptReadDetails } from './RefundReceiptReadDetails'
import { CreditMemoRefunds, SalesReceiptRefunds } from './RefundReceiptSections'
import { SalesReceiptPaymentRow, SalesReceiptReadDetails } from './SalesReceiptReadDetails'
import { VendorCreditReadDetails } from './VendorCreditReadDetails'

export type DocumentReadDetailsProps = {
    record: DocumentRecord
    isPhone: boolean
    // The shared date cell; each kind renders it where its details order puts it.
    children: ReactNode
}

export type DocumentReadBandRowProps = { record: DocumentRecord }

// A kind's ReadSection: the record, the read view's one read of the refund receipts that
// name it (`DocumentKind.readLinkedRefunds`; off, ready and empty for every other kind), and
// the read view's one Retry.
export type DocumentReadSectionProps = {
    record: DocumentRecord
    linkedRefunds: LinkedRefundReceipts
    onRetry: () => void
}

// The read view's Details panel as three parts: `body` is the band through the Payments
// block, `section` the kind's ReadSection (drawn by the read view; null for a kind without
// one), `stamps` the stamps under them. A kind's ReadFrame draws them in order with its own
// parts around them (a notice before the band, a block before the section, dialogs before
// the stamps). `refunds` is the read view's one read of the record's posted vendor refunds
// (`DocumentKind.readRefunds`; off, ready and empty for every other kind), which a vendor
// credit's Applied to block lists and its Retry recovers. `partyName` is the record's party
// as the read view names it (the notice's and the apply dialog's empty text).
export type DocumentReadFrameProps = {
    record: DocumentRecord
    partyName: string
    body: ReactNode
    section: ReactNode
    stamps: ReactNode
    refunds: CreditRefunds
}

// The cents of the posted vendor refunds on a vendor credit (DocumentKind.readRefunds); null
// while their read has failed, so the parts that split the used credit into Applied and
// Refunded do not guess; 0 for every other kind.
export type ReadRefunded = number | null

// The read view's badge of a kind with a balance badge: the kind's BalanceBadge, with the
// refunded cents a vendor credit's badge also reads, the written-off cents an invoice's
// badge also reads and the applied cents a credit memo's badge also reads (0, or left out,
// for every other kind). Undefined: the header shows the status's badge (a credit memo with
// nothing applied or refunded).
export type ReadBalanceBadge = (
    ...args: [
        ...Parameters<BalanceBadge>,
        refunded: ReadRefunded,
        writtenOff: number,
        applied?: number,
    ]
) => ReturnType<BalanceBadge> | undefined

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

// A purchase kind's two tables (PURCHASE_LINE_TABLES), both stored in the kind's one lines
// collection.
export const PURCHASE_LINE_SPECS: Record<string, DocumentLineSpec> = {
    account_lines: {
        columns: PURCHASE_ACCOUNT_COLUMNS,
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

// A form's start values: a sales kind's, or a purchase kind's (a bill's, an expense's or a
// vendor credit's: its party is `vendor` and it has two line tables).
export type DocumentStartValues =
    | DocumentFormValuesBase
    | BillFormValues
    | ExpenseFormValues
    | VendorCreditFormValues

// What a vendor pick fills besides the vendor itself, keyed by built-in; the Vendor field
// sets each returned key. `accountIsListed` says whether the Account picker lists the
// vendor's default expense account; `current` is the form's values at the pick.
export type PartyFills = (
    vendor: Pick<BooksVendors, 'id' | 'address' | 'terms' | 'expense_account'>,
    accountIsListed: boolean,
    current: FormValues
) => Partial<FormValues>

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
        // A new form made from its source link (Create credit memo's `?invoice`, Refund's
        // `?sales_receipt`, Refund credit's `?credit_memo`): a kind with `sourceLinkKeys`
        // only, and only for those keys. `party` is the source's customer row, null for a
        // source saved without one (a walk-in sales receipt).
        fromSource?: (
            source: LinkSource,
            lines: readonly DocumentLineRow[],
            today: string,
            party: DocumentPartyRow | null,
            start: DocumentStart | undefined
        ) => DocumentStartValues
    }
    // The columns that link a document to its source, in the order a form reads them
    // (sourceLinkOf); the save writes the one its link names. A kind without them keeps no
    // link.
    sourceLinkKeys?: readonly SourceLinkKey[]
    // Whether a new form may be made from the source the screen read (`?invoice` a posted
    // invoice; `?sales_receipt` a posted receipt; `?credit_memo` a posted memo with
    // unapplied credit). Any other answer shows `sourceNotice` (DocumentScreen).
    sourceAllowed?: (source: LinkSource) => boolean
    // The notice of a source the kind refuses (documentScreenState's cannot-start), by the
    // route param that named it.
    sourceNotice?: (key: SourceLinkKey) => { testId: string; message: string }
    ReadDetails: ComponentType<DocumentReadDetailsProps>
    // A ruled row at the bottom of the read view's band (a sales receipt's Payment).
    ReadBandRow?: ComponentType<DocumentReadBandRowProps>
    // A line under the read view's message and memo, below the Posted-by stamp of a posting
    // kind (an invoice's "From estimate <n>", a closed estimate's "Converted to invoice <n>").
    ReadStampRow?: ComponentType<DocumentReadBandRowProps>
    // A section of the read view after the Payments block (an invoice's Credit memos, a sales
    // receipt's Refund receipts, a credit memo's Refunds).
    ReadSection?: ComponentType<DocumentReadSectionProps>
    // The read view's Details panel around its body, for a kind whose parts before the band
    // and after the Payments block share reads (a credit's Apply notice and its Applied to
    // block read the party's open documents once; an invoice's Apply credit notice and the
    // apply dialog read the customer's credit memos once). It gets the kind's ReadSection as
    // `section` and draws it. A kind without it draws the body, its ReadSection and the
    // stamps.
    ReadFrame?: ComponentType<DocumentReadFrameProps>
    // A row of the form's band between its first row and the date (a credit memo's invoice
    // link). It reads the form's scope; a kind without it draws the band in one piece.
    FormBandRow?: ComponentType
    // Each line table's spec, keyed by the table's key (`doc.lineTables`).
    lineSpecs: Record<string, DocumentLineSpec>
    // The read view's lines; DocumentReadLines when absent.
    ReadLines?: ComponentType<DocumentReadLinesProps>
    // What a vendor pick fills (a vendor kind's); a kind without it fills nothing.
    partyFills?: PartyFills
    // The read view's badge of a kind whose posted documents keep an open balance (Paid on
    // an invoice and a bill, Applied, Partly applied or Refunded on a vendor credit), from the
    // stored balance (and a vendor credit's refunded cents); a kind without it shows its
    // status badge.
    balanceBadge?: ReadBalanceBadge
    // The rows the read view draws after Total (a bill's Credits applied, an invoice's
    // Credits applied and Written off, a vendor credit's Applied, Refunded and Unapplied
    // credit). `applied` is the credit applied to a posted bill or invoice, read from its
    // stored record (billCreditsApplied: the total less its posted payments and its stored
    // balance; invoiceCreditsApplied: less its `written_off` too), so the rows add up while
    // the applications read is loading or failed; 0 for every other kind. `refunded` is the vendor credit's posted
    // vendor refunds, or a credit memo's posted refund receipts (ReadRefunded); a caller that
    // does not pass it means 0.
    readTotals?: (
        record: DocumentRecord,
        extra: { applied: number; refunded?: ReadRefunded }
    ) => DocumentTotalRow[]
    // Where the read view draws the readTotals rows: after Total and its Payments row and
    // before the kind's last row ('after', the default), or
    // after the kind's last row ('afterLast': a credit memo's Refunded and Unapplied credit,
    // after "Credit amount").
    readTotalsPlace?: 'after' | 'afterLast'
    // The link column of `books_refund_receipts` that names this kind (a sales receipt's
    // `sales_receipt`, a credit memo's `credit_memo`): the read view reads those refunds once
    // (useLinkedRefundReceipts) for its ReadSection and, as `refunded`, for readTotals.
    readLinkedRefunds?: 'sales_receipt' | 'credit_memo'
    // The applications of this kind that name the record (a bill's vendor credits, an
    // invoice's credit memos): the read view reads them for the rows its Payments block lists
    // with Remove, and words Remove's confirm with the kind's texts. A kind without it has no
    // credit rows.
    readApplications?: CreditApplicationKind
    // True makes the read view read the record's posted vendor refunds (useCreditRefunds):
    // the Refunded row and badge read their sum, the ReadFrame's Applied to block their rows.
    readRefunds?: boolean
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

// The invoice's badge (writtenOffBadge, write-off spec §3.4): Written off when its balance
// is 0 and posted write-offs took some of it; otherwise Paid / Partly paid.
const invoiceBadgeOf: ReadBalanceBadge = (status, balance, total, _refunded, writtenOff) =>
    writtenOffBadge(status, balance, total, writtenOff)

// The read view's rows between Payments and Balance due (apply credit spec §3.6, write-off
// spec §3.4): Credits applied (`applied`, the credit memos applied to the invoice from its
// stored record, invoiceCreditsApplied) and Written off (the stored `written_off`), each with
// a minus sign and only while it is above zero. None for a record of another kind.
function invoiceTotalsOf(record: DocumentRecord, { applied }: { applied: number }) {
    const fields = record.kindFields
    if (fields.kind !== 'invoice') return []
    const money = (cents: number) => `${MINUS}${formatMoney(cents, record.currency)}`
    const credits: DocumentTotalRow[] =
        applied > 0
            ? [
                  {
                      label: 'Credits applied',
                      amount: money(applied),
                      testId: 'invoice-total-credits-applied',
                  },
              ]
            : []
    const writtenOff: DocumentTotalRow[] =
        fields.written_off > 0
            ? [
                  {
                      label: 'Written off',
                      amount: money(fields.written_off),
                      testId: 'invoice-total-written-off',
                  },
              ]
            : []
    return [...credits, ...writtenOff]
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
    ReadSection: InvoiceSections,
    // The Apply credit notice with the payments line, and the apply dialog (apply credit
    // spec §3.1, §3.3).
    ReadFrame: InvoiceApplyFrame,
    lineSpecs: SALES_LINE_SPECS,
    balanceBadge: invoiceBadgeOf,
    // 'after' draws the rows after Payments and before Balance due (DocumentTotalsPanel).
    readTotals: invoiceTotalsOf,
    readTotalsPlace: 'after',
    // The credit memos applied to the invoice: the Payments block's credit rows.
    readApplications: CREDIT_MEMO_APPLICATION,
}

// The source row with the credit memo's own columns back at the top level, as
// invoiceRowOf.
function creditMemoRowOf(source: DocumentSource) {
    const fields = source.kindFields
    if (fields.kind !== 'credit_memo') {
        throw new Error(`a credit memo source has ${fields.kind} columns`)
    }
    return { ...source, ...fields }
}

// A credit memo always has a customer (it is required): the screen passes null only for a
// source saved without one, which a credit memo never is.
function creditMemoCustomerOf(party: DocumentPartyRow | null) {
    const customer = customerPartyOf(party)
    if (!customer) throw new Error('a credit memo copy has no customer')
    return customer
}

// The read view's rows after "Credit amount" (refund receipt spec §3.12, apply credit spec
// §3.5): Applied (the stored `applied`, the memo's applications to invoices, with a minus
// sign, while it is above zero), Refunded (the posted refunds that pay the memo out, with a
// minus sign, while one does) and Unapplied credit (the stored balance), while either is
// drawn. While the refunds read has not answered (`refunded` null) no Refunded row is drawn,
// so Unapplied credit shows only beside Applied. None for a record of another kind.
function creditMemoTotalsOf(
    record: DocumentRecord,
    { refunded = 0 }: { refunded?: ReadRefunded }
): DocumentTotalRow[] {
    const fields = record.kindFields
    if (fields.kind !== 'credit_memo') return []
    const money = (cents: number) => formatMoney(cents, record.currency)
    const appliedRows: DocumentTotalRow[] =
        fields.applied > 0
            ? [
                  {
                      label: 'Applied',
                      amount: `${MINUS}${money(fields.applied)}`,
                      testId: 'credit-memo-total-applied',
                  },
              ]
            : []
    const refundedRows: DocumentTotalRow[] =
        refunded !== null && refunded > 0
            ? [
                  {
                      label: 'Refunded',
                      amount: `${MINUS}${money(refunded)}`,
                      testId: 'credit-memo-total-refunded',
                  },
              ]
            : []
    const used = [...appliedRows, ...refundedRows]
    if (used.length === 0) return []
    return [
        ...used,
        {
            label: 'Unapplied credit',
            amount: money(fields.balance),
            testId: 'credit-memo-total-unapplied',
            isStrong: true,
        },
    ]
}

// The credit memo's badge (creditMemoBadge, apply credit spec §3.5): Partly applied,
// Applied or Refunded from its stored balance and `applied`; otherwise its status badge.
const creditMemoBadgeOf: ReadBalanceBadge = (
    status,
    balance,
    total,
    _refunded,
    _writtenOff,
    applied = 0
) => creditMemoBadge(status, balance, total, applied)

// A new credit memo's message starts empty (Q8): the "Default message to customer"
// setting the screen passes is not used. A copied customer, product or tax rate that is
// now inactive stays in the form, and Post refuses it with the shared inactive texts.
// The read view reads the refunds that pay it out: its Refunds section and the Refunded
// and Unapplied credit rows after "Credit amount". Its frame (CreditMemoReadFrame) holds the
// Apply to invoices notice, the Applied to block, the apply dialog and Remove's confirm; its
// badge and its Applied row read the stored `applied`.
export const CREDIT_MEMO_DOCUMENT: DocumentKind = {
    doc: CREDIT_MEMO_KIND,
    data: CREDIT_MEMO_DATA,
    columnsFrom: creditMemoColumnsFrom,
    emptyColumns: EMPTY_CREDIT_MEMO_COLUMNS,
    values: {
        new: ({ party, today, rates, defaultRateId }) =>
            newCreditMemoValues({
                today,
                rates,
                defaultRateId,
                customer: customerPartyOf(party),
            }),
        copy: (source, lines, today, party) =>
            copyCreditMemoValues(
                creditMemoRowOf(source),
                lines.filter(isSalesLine),
                today,
                creditMemoCustomerOf(party)
            ),
        correction: (source, lines) =>
            creditMemoCorrectionValues(creditMemoRowOf(source), lines.filter(isSalesLine)),
        fromSource: (source, lines, today, party) => {
            if (source.key !== 'invoice') {
                throw new Error(`a credit memo is not made from a ${source.key}`)
            }
            return creditMemoValuesFromInvoice(
                source.row,
                lines,
                today,
                creditMemoCustomerOf(party)
            )
        },
    },
    sourceLinkKeys: ['invoice'],
    // Only a posted invoice is credited (spec §3.2).
    sourceAllowed: source => source.key === 'invoice' && source.row.status === 'posted',
    sourceNotice: () => ({
        testId: `${CREDIT_MEMO_KIND.testId}-cannot-credit`,
        message: CREDIT_MEMO_KIND.messages.cannotCredit,
    }),
    ReadDetails: CreditMemoReadDetails,
    ReadBandRow: CreditMemoInvoiceLink,
    ReadSection: CreditMemoRefunds,
    ReadFrame: CreditMemoReadFrame,
    FormBandRow: CreditMemoLinkRow,
    lineSpecs: SALES_LINE_SPECS,
    balanceBadge: creditMemoBadgeOf,
    readTotals: creditMemoTotalsOf,
    readTotalsPlace: 'afterLast',
    readLinkedRefunds: 'credit_memo',
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
    ReadSection: SalesReceiptRefunds,
    lineSpecs: SALES_LINE_SPECS,
    readLinkedRefunds: 'sales_receipt',
}

// The source row with the refund's own columns back at the top level, as invoiceRowOf.
function refundReceiptRowOf(source: DocumentSource) {
    const fields = source.kindFields
    if (fields.kind !== 'refund_receipt') {
        throw new Error(`a refund receipt source has ${fields.kind} columns`)
    }
    return { ...source, ...fields }
}

// How the refund's Refund from is chosen, from its data source's start.
function refundFromStartOf(start: DocumentStart | undefined): CopyDeposit {
    if (!start) return NO_DEPOSIT_START
    if (start.kind !== 'refund_receipt') {
        throw new Error(`a refund receipt form has a ${start.kind} start`)
    }
    return start.refundFrom
}

// A new refund's message starts empty (Q8): the "Default message to customer" setting the
// screen passes is not used. A copied customer, product, tax rate or Refund from account
// that is now inactive is handled as on a sales receipt copy.
export const REFUND_RECEIPT_DOCUMENT: DocumentKind = {
    doc: REFUND_RECEIPT_KIND,
    data: REFUND_RECEIPT_DATA,
    columnsFrom: refundReceiptColumnsFrom,
    emptyColumns: EMPTY_REFUND_RECEIPT_COLUMNS,
    values: {
        new: ({ start, party, today, rates, defaultRateId }) =>
            newRefundReceiptValues({
                today,
                rates,
                defaultRateId,
                customer: customerPartyOf(party),
                refundFrom: refundFromStartOf(start),
            }),
        copy: (source, lines, today, party, start) =>
            copyRefundReceiptValues(
                refundReceiptRowOf(source),
                lines.filter(isSalesLine),
                today,
                customerPartyOf(party),
                refundFromStartOf(start)
            ),
        correction: (source, lines) =>
            refundReceiptCorrectionValues(refundReceiptRowOf(source), lines.filter(isSalesLine)),
        fromSource: (source, lines, today, _party, start) => {
            const refundFrom = refundFromStartOf(start)
            if (source.key === 'sales_receipt') {
                return refundValuesFromSalesReceipt(source.row, lines, today, refundFrom)
            }
            if (source.key === 'credit_memo') {
                return refundValuesFromCreditMemo(source.row, lines, today, refundFrom)
            }
            throw new Error(`a refund receipt is not made from a ${source.key}`)
        },
    },
    sourceLinkKeys: ['sales_receipt', 'credit_memo'],
    // A posted sales receipt is refunded (spec §3.2); a posted credit memo with unapplied
    // credit is paid out (spec §3.3). A draft or void source is neither.
    sourceAllowed: source => {
        if (source.row.status !== 'posted') return false
        if (source.key === 'sales_receipt') return true
        return source.key === 'credit_memo' && source.row.balance > 0
    },
    sourceNotice: key => ({
        testId: `${REFUND_RECEIPT_KIND.testId}-cannot-refund`,
        message:
            key === 'credit_memo'
                ? REFUND_RECEIPT_KIND.messages.cannotRefundMemo
                : REFUND_RECEIPT_KIND.messages.cannotRefundReceipt,
    }),
    ReadDetails: RefundReceiptReadDetails,
    ReadBandRow: RefundReceiptBandRows,
    FormBandRow: RefundReceiptLinkRow,
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

const PURCHASE_FORM_NOUNS = {
    bill: 'a bill',
    expense: 'an expense',
    vendor_credit: 'a vendor credit',
} as const

// A purchase document's start: the Purchase lines setting a new form starts from and whether
// the Account picker lists the `?vendor` vendor's default expense account. A form given no
// start (a unit test's) shows both tables, the setting's default, and lists no vendor account.
function purchaseStartOf(
    start: DocumentStart | undefined,
    key: keyof typeof PURCHASE_FORM_NOUNS
): {
    purchaseLines: PurchaseLines
    accountIsListed: boolean
} {
    if (!start) return { purchaseLines: 'both', accountIsListed: false }
    // Only purchase starts carry `purchaseLines`; the `in` test narrows the union for TS.
    if (start.kind !== key || !('purchaseLines' in start)) {
        throw new Error(`${PURCHASE_FORM_NOUNS[key]} form has a ${start.kind} start`)
    }
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
                ...purchaseStartOf(start, 'bill'),
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
    lineSpecs: PURCHASE_LINE_SPECS,
    // Mailing address, Terms and Due date, and the first account line's empty Account.
    partyFills: (vendor, accountIsListed, current) =>
        vendorBillFills(vendor, accountIsListed, {
            date: textOf(current.date),
            account_lines: rowsOf(current.account_lines),
        }),
    balanceBadge: paidBadge,
    // "Credits applied" above Balance due while vendor credits are applied to the bill: the
    // read view passes the credit its stored record holds as `applied` (billCreditsApplied),
    // and reads the bill's credit applications for its Payments block.
    readTotals: billReadTotals,
    readApplications: VENDOR_CREDIT_APPLICATION,
}

// The source row with the expense's own columns back at the top level, as invoiceRowOf.
function expenseRowOf(source: DocumentSource) {
    const fields = source.kindFields
    if (fields.kind !== 'expense') throw new Error(`an expense source has ${fields.kind} columns`)
    return { ...source, ...fields }
}

// The expense's start: the Purchase lines setting a new form starts from, whether the
// Account picker lists the `?vendor` vendor's default expense account, and the active
// Paid from accounts a copy may keep. A form given no start (a unit test's) shows both
// tables, the setting's default, lists no vendor account and keeps no Paid from.
function expenseStartOf(start: DocumentStart | undefined): {
    purchaseLines: PurchaseLines
    accountIsListed: boolean
    activePaidFromIds: ReadonlySet<string>
} {
    const purchase = purchaseStartOf(start, 'expense')
    const activePaidFromIds =
        start?.kind === 'expense' ? start.activePaidFromIds : new Set<string>()
    return { ...purchase, activePaidFromIds }
}

// Money paid from a bank or credit card account (spec §3.1): the party is an optional
// vendor, the lines are the bill's two tables, and it has no tax, message, email, PDF or
// party address. A copied vendor, account or product that is now inactive stays in the
// form, and Post refuses it with the purchase texts; a copied Paid from that is now
// inactive is left empty (copyExpenseValues).
export const EXPENSE_DOCUMENT: DocumentKind = {
    doc: EXPENSE_KIND,
    data: EXPENSE_DATA,
    columnsFrom: expenseColumnsFrom,
    emptyColumns: EMPTY_EXPENSE_COLUMNS,
    values: {
        // `?vendor` fills the first account line's Account with the vendor's default
        // expense account when the Account picker lists it (the start read it,
        // EXPENSE_DATA).
        new: ({ party, today, start }) => {
            const { purchaseLines, accountIsListed } = expenseStartOf(start)
            return newExpenseValues({
                today,
                purchaseLines,
                accountIsListed,
                vendor: vendorPartyOf(party),
            })
        },
        copy: (source, lines, today, _party, start) =>
            copyExpenseValues(
                expenseRowOf(source),
                lines.filter(isPurchaseLine),
                today,
                expenseStartOf(start).activePaidFromIds
            ),
        correction: (source, lines) =>
            expenseCorrectionValues(expenseRowOf(source), lines.filter(isPurchaseLine)),
    },
    ReadDetails: ExpenseReadDetails,
    ReadBandRow: ExpensePaymentRow,
    ReadLines: PurchaseReadLines,
    lineSpecs: PURCHASE_LINE_SPECS,
    // The first account line's empty Account; nothing in the band.
    partyFills: expenseVendorFills,
}

// The source row with the vendor credit's own columns back at the top level, as
// invoiceRowOf.
function vendorCreditRowOf(source: DocumentSource) {
    const fields = source.kindFields
    if (fields.kind !== 'vendor_credit') {
        throw new Error(`a vendor credit source has ${fields.kind} columns`)
    }
    return { ...source, ...fields }
}

// The read view's rows after Total, from the stored balance and the posted refunds' cents
// (vendorCreditReadTotals). While the refunds read has failed only Unapplied credit is
// drawn: the used credit cannot be split into Applied and Refunded. A record of another
// kind has no vendor credit balance, so it draws none.
function vendorCreditTotalsOf(
    record: DocumentRecord,
    { refunded = 0 }: { refunded?: ReadRefunded }
): DocumentTotalRow[] {
    const fields = record.kindFields
    if (fields.kind !== 'vendor_credit') return []
    const rows = vendorCreditReadTotals({ ...record, balance: fields.balance }, refunded ?? 0)
    if (refunded !== null) return rows
    return rows.filter(row => row.testId === 'vendor-credit-total-unapplied')
}

// The vendor credit's badge (vendorCreditBadge): Refunded when its balance is 0 and nothing
// of it is applied to a bill. While the refunds read has failed the split is not known: a
// credit with nothing left shows its status badge (Posted), one with a balance Partly
// applied or Posted.
const vendorCreditBadgeOf: ReadBalanceBadge = (status, balance, total, refunded) =>
    vendorCreditBadge(
        status,
        balance,
        total,
        refunded === null ? null : vendorCreditAppliedToBills({ total, balance }, refunded)
    )

// A credit a vendor gave (vendor credit spec §3.1): the party is a required vendor, the
// lines are the bill's two tables, and it has no tax, message, email, PDF or party address.
// A copied vendor, account or product that is now inactive stays in the form, and Post
// refuses it with the purchase texts. Its badge is Applied / Partly applied / Refunded, and
// the read view's rows after Total are Applied, Refunded and Unapplied credit; the read view
// reads its posted vendor refunds for them. Its read section holds the Apply to bills
// notice, the Applied to block (applications and refunds) and the apply dialog.
export const VENDOR_CREDIT_DOCUMENT: DocumentKind = {
    doc: VENDOR_CREDIT_KIND,
    data: VENDOR_CREDIT_DATA,
    columnsFrom: vendorCreditColumnsFrom,
    emptyColumns: EMPTY_VENDOR_CREDIT_COLUMNS,
    values: {
        // `?vendor` fills the first account line's Account with the vendor's default
        // expense account when the Account picker lists it (the start read it,
        // VENDOR_CREDIT_DATA).
        new: ({ party, today, start }) =>
            newVendorCreditValues({
                today,
                ...purchaseStartOf(start, 'vendor_credit'),
                vendor: vendorPartyOf(party),
            }),
        copy: (source, lines, today) =>
            copyVendorCreditValues(vendorCreditRowOf(source), lines.filter(isPurchaseLine), today),
        correction: (source, lines) =>
            vendorCreditCorrectionValues(vendorCreditRowOf(source), lines.filter(isPurchaseLine)),
    },
    ReadDetails: VendorCreditReadDetails,
    ReadLines: PurchaseReadLines,
    lineSpecs: PURCHASE_LINE_SPECS,
    // The first account line's empty Account; nothing in the band.
    partyFills: vendorCreditVendorFills,
    balanceBadge: vendorCreditBadgeOf,
    readTotals: vendorCreditTotalsOf,
    readRefunds: true,
    ReadFrame: VendorCreditReadFrame,
}
