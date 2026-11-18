import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { Text, View } from 'react-native'
import { formatMoney } from '../../lib/money'
import {
    type AppliedDocumentRow,
    gridDocumentLabel,
    type OutstandingDocument,
    outstandingTexts,
    totalTexts,
} from '../../lib/outstanding-documents'
import {
    BILL_PAYMENT_APPLIED_COLUMNS,
    type FlexColumn,
    PAYMENT_COLUMNS,
} from '../../lib/payment-columns'
import { formatDay } from '../../lib/register-range'
import { AppliedInvoiceCards } from './AppliedInvoiceCards'
import { AppliedDocumentLink } from './OutstandingGrid'

const HEAD = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const MONEY_CELL = 'text-right text-sm text-foreground tabular-nums'

type AppliedLayout = {
    // A Vendor's bill no. column (bills only).
    hasRef: boolean
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
// Vendor's bill no., Due date, Bill total, Paid). An invoice has no ref column: its `ref`
// style is never drawn.
const LAYOUTS: Record<OutstandingDocument['noun'], AppliedLayout> = {
    Invoice: {
        hasRef: false,
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
        columns: {
            document: BILL_PAYMENT_APPLIED_COLUMNS.bill,
            ref: BILL_PAYMENT_APPLIED_COLUMNS.ref,
            dueDate: BILL_PAYMENT_APPLIED_COLUMNS.dueDate,
            original: BILL_PAYMENT_APPLIED_COLUMNS.original,
            applied: BILL_PAYMENT_APPLIED_COLUMNS.paid,
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
    const due = formatDay(row.dueDate)
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
                    Due date
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
 * paid"): a grid whose columns the descriptor's noun picks, or cards while the list's own
 * width is below the grid's least width (`doc.appliedMinWidth`); with `total`, a Total row
 * under them.
 */
export function AppliedInvoices({ doc, rows, currency, testIdPrefix, total }: AppliedListProps) {
    const { width, onLayout } = useContainerWidth()
    if (rows.length === 0) return null
    const isCards = width > 0 && width < doc.appliedMinWidth
    const heading = outstandingTexts(doc).appliedHeading
    const body = isCards ? (
        <AppliedInvoiceCards
            doc={doc}
            rows={rows}
            currency={currency}
            testIdPrefix={testIdPrefix}
            total={total}
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
            <Text className="text-sm font-semibold text-foreground">{heading}</Text>
            {body}
        </View>
    )
}
