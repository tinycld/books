import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { Text, View } from 'react-native'
import { formatMoney } from '../../lib/money'
import {
    type AppliedDocumentRow,
    gridDocumentLabel,
    type OutstandingDocument,
    outstandingTexts,
    refText,
    totalTexts,
} from '../../lib/outstanding-documents'
import {
    BILL_PAYMENT_APPLIED_COLUMNS,
    type FlexColumn,
    PAYMENT_COLUMNS,
    REFUND_COLUMNS,
} from '../../lib/payment-columns'
import { type AppliedDateField, AppliedInvoiceCards, appliedDayOf } from './AppliedInvoiceCards'
import { AppliedDocumentLink, RefLine } from './OutstandingGrid'

const HEAD = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const MONEY_CELL = 'text-right text-sm text-foreground tabular-nums'

type AppliedLayout = {
    // A Vendor's bill no. column (bills only).
    hasRef: boolean
    // The vendor's document no. muted under the link (vendor credits only, as the
    // refund form's grid draws it).
    hasRefUnderLink: boolean
    // Which day the date column shows.
    dateField: AppliedDateField
    // Every column grows with the grid from its least width.
    columns: {
        document: FlexColumn
        ref: FlexColumn
        dueDate: FlexColumn
        original: FlexColumn
        applied: FlexColumn
    }
}

// The grid's columns by document noun (spec §3.8): an invoice payment's "Applied to"
// (Invoice, Due date, Original amount, Applied), a bill payment's "Bills paid" (Bill,
// Vendor's bill no., Due date, Bill total, Paid), a vendor refund's "Vendor credits
// refunded" (Vendor credit, Credit date, Credit total, Refunded). Only a bill has a ref
// column: the others' `ref` style is never drawn. A vendor credit's no. shows under its
// link, as in the refund form's grid.
const LAYOUTS: Record<OutstandingDocument['noun'], AppliedLayout> = {
    Invoice: {
        hasRef: false,
        hasRefUnderLink: false,
        dateField: 'dueDate',
        columns: {
            document: PAYMENT_COLUMNS.invoice,
            ref: PAYMENT_COLUMNS.invoice,
            dueDate: PAYMENT_COLUMNS.dueDate,
            original: PAYMENT_COLUMNS.original,
            applied: PAYMENT_COLUMNS.payment,
        },
    },
    Bill: {
        hasRef: true,
        hasRefUnderLink: false,
        dateField: 'dueDate',
        columns: {
            document: BILL_PAYMENT_APPLIED_COLUMNS.bill,
            ref: BILL_PAYMENT_APPLIED_COLUMNS.ref,
            dueDate: BILL_PAYMENT_APPLIED_COLUMNS.dueDate,
            original: BILL_PAYMENT_APPLIED_COLUMNS.original,
            applied: BILL_PAYMENT_APPLIED_COLUMNS.paid,
        },
    },
    'Vendor credit': {
        hasRef: false,
        hasRefUnderLink: true,
        dateField: 'date',
        columns: {
            document: REFUND_COLUMNS.credit,
            ref: REFUND_COLUMNS.credit,
            dueDate: REFUND_COLUMNS.creditDate,
            original: REFUND_COLUMNS.total,
            applied: REFUND_COLUMNS.refund,
        },
    },
    // A credit memo list (the apply dialog's from an invoice) has no applied grid of its
    // own; it takes the vendor credit's credit columns, with no ref under the link.
    'Credit memo': {
        hasRef: false,
        hasRefUnderLink: false,
        dateField: 'date',
        columns: {
            document: REFUND_COLUMNS.credit,
            ref: REFUND_COLUMNS.credit,
            dueDate: REFUND_COLUMNS.creditDate,
            original: REFUND_COLUMNS.total,
            applied: REFUND_COLUMNS.refund,
        },
    },
}

function appliedLayoutOf(doc: OutstandingDocument): AppliedLayout {
    return LAYOUTS[doc.noun]
}

export interface AppliedListProps {
    // Which documents the rows are: texts, links, widths.
    doc: OutstandingDocument
    rows: readonly AppliedDocumentRow[]
    currency: string
    // `<prefix>-applied`, `<prefix>-applied-<document id>`, `<prefix>-read-link-<id>`,
    // `<prefix>-applied-total`.
    testIdPrefix: string
    // The Total row's amount; null draws none.
    total: number | null
    // The heading over the list; the descriptor's applied heading when absent.
    heading?: string
}

function RefCell({ isVisible, text, style }: { isVisible: boolean; text: string; style: object }) {
    if (!isVisible) return null
    return (
        <Text className="text-sm text-foreground" style={style} numberOfLines={1}>
            {text}
        </Text>
    )
}

function AppliedRow({
    doc,
    row,
    currency,
    testIdPrefix,
}: Omit<AppliedListProps, 'rows' | 'total'> & { row: AppliedDocumentRow }) {
    const layout = appliedLayoutOf(doc)
    const col = layout.columns
    const label = gridDocumentLabel(doc, row)
    const refUnderLink = layout.hasRefUnderLink ? refText(row.ref) : ''
    const due = appliedDayOf(layout.dateField, row)
    const original = formatMoney(row.total, currency)
    const applied = formatMoney(row.amount, currency)
    return (
        <View
            testID={`${testIdPrefix}-applied-${row.documentId}`}
            className="flex-row items-center gap-3 border-b border-border px-2"
        >
            <View style={col.document}>
                <AppliedDocumentLink
                    doc={doc}
                    documentId={row.documentId}
                    label={label}
                    testID={`${testIdPrefix}-read-link-${row.documentId}`}
                />
                <RefLine text={refUnderLink} />
            </View>
            <RefCell isVisible={layout.hasRef} text={row.ref} style={col.ref} />
            <Text className="text-sm text-foreground" style={col.dueDate}>
                {due}
            </Text>
            <Text className={MONEY_CELL} style={col.original}>
                {original}
            </Text>
            <Text className={MONEY_CELL} style={col.applied}>
                {applied}
            </Text>
        </View>
    )
}

function RefSpacer({ isVisible, style }: { isVisible: boolean; style: object }) {
    if (!isVisible) return null
    return <View style={style} />
}

function HeaderRef({ isVisible, style }: { isVisible: boolean; style: object }) {
    if (!isVisible) return null
    return (
        <Text className={HEAD} style={style}>
            Vendor's bill no.
        </Text>
    )
}

function GridTotal({
    doc,
    total,
    currency,
    testIdPrefix,
}: {
    doc: OutstandingDocument
    total: number | null
    currency: string
    testIdPrefix: string
}) {
    if (total === null) return null
    const layout = appliedLayoutOf(doc)
    const col = layout.columns
    const amount = formatMoney(total, currency)
    return (
        <View
            testID={`${testIdPrefix}-applied-total`}
            className="flex-row items-center gap-3 px-2 py-2"
        >
            <Text className="text-sm font-semibold text-foreground" style={col.document}>
                Total
            </Text>
            <RefSpacer isVisible={layout.hasRef} style={col.ref} />
            <View style={col.dueDate} />
            <View style={col.original} />
            <Text className={`${MONEY_CELL} font-semibold`} style={col.applied}>
                {amount}
            </Text>
        </View>
    )
}

// The columns fill the list and never scroll sideways: the list shows this grid only while
// it is at least `doc.appliedMinWidth` wide.
function AppliedGrid({ doc, rows, currency, testIdPrefix, total }: AppliedListProps) {
    const layout = appliedLayoutOf(doc)
    const texts = outstandingTexts(doc)
    const totalHeader = totalTexts(doc).header
    const col = layout.columns
    const drawn = rows.map(row => (
        <AppliedRow
            key={row.id}
            doc={doc}
            row={row}
            currency={currency}
            testIdPrefix={testIdPrefix}
        />
    ))
    return (
        <View testID={`${testIdPrefix}-applied`}>
            <View className="flex-row items-center gap-3 border-b border-border px-2 py-2">
                <Text className={HEAD} style={col.document}>
                    {doc.noun}
                </Text>
                <HeaderRef isVisible={layout.hasRef} style={col.ref} />
                <Text className={HEAD} style={col.dueDate}>
                    {doc.dateHeader}
                </Text>
                <Text className={`${HEAD} text-right`} style={col.original}>
                    {totalHeader}
                </Text>
                <Text className={`${HEAD} text-right`} style={col.applied}>
                    {texts.appliedLabel}
                </Text>
            </View>
            {drawn}
            <GridTotal doc={doc} total={total} currency={currency} testIdPrefix={testIdPrefix} />
        </View>
    )
}

/**
 * A payment read view's paid documents (receive-payment "Applied to", pay-bills §3.8 "Bills
 * paid", vendor refund "Vendor credits refunded"): a grid whose columns the descriptor's
 * noun picks, or cards while the list's own width is below the grid's least width
 * (`doc.appliedMinWidth`); with `total`, a Total row under them.
 */
export function AppliedInvoices({
    doc,
    rows,
    currency,
    testIdPrefix,
    total,
    heading,
}: AppliedListProps) {
    const { width, onLayout } = useContainerWidth()
    if (rows.length === 0) return null
    const isCards = width > 0 && width < doc.appliedMinWidth
    const title = heading ?? outstandingTexts(doc).appliedHeading
    const dateField = appliedLayoutOf(doc).dateField
    const body = isCards ? (
        <AppliedInvoiceCards
            doc={doc}
            rows={rows}
            currency={currency}
            testIdPrefix={testIdPrefix}
            total={total}
            dateField={dateField}
        />
    ) : (
        <AppliedGrid
            doc={doc}
            rows={rows}
            currency={currency}
            testIdPrefix={testIdPrefix}
            total={total}
        />
    )
    return (
        <View className="gap-2" onLayout={onLayout}>
            <Text className="text-sm font-semibold text-foreground">{title}</Text>
            {body}
        </View>
    )
}
