import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { ScrollView, Text, View } from 'react-native'
import { useTableMinWidth } from '../../hooks/useTableMinWidth'
import { formatMoney } from '../../lib/money'
import {
    type AppliedDocumentRow,
    gridDocumentLabel,
    type OutstandingDocument,
    outstandingTexts,
} from '../../lib/outstanding-documents'
import {
    BILL_PAYMENT_APPLIED_COLUMNS,
    PAYMENT_CARDS_BELOW,
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
    columns: {
        document: { flex: number; minWidth: number }
        ref: { width: number }
        dueDate: { width: number }
        original: { width: number }
        applied: { width: number }
    }
}

// The grid's columns by document noun (spec §3.8): an invoice payment's "Applied to"
// (Invoice, Due date, Original amount, Applied), a bill payment's "Bills paid" (Bill,
// Vendor's bill no., Due date, Bill total, Paid).
const LAYOUTS: Record<OutstandingDocument['noun'], AppliedLayout> = {
    Invoice: {
        hasRef: false,
        columns: {
            document: PAYMENT_COLUMNS.invoice,
            ref: { width: 0 },
            dueDate: { width: PAYMENT_COLUMNS.dueDate },
            original: { width: PAYMENT_COLUMNS.original },
            applied: { width: PAYMENT_COLUMNS.payment },
        },
    },
    Bill: {
        hasRef: true,
        columns: {
            document: BILL_PAYMENT_APPLIED_COLUMNS.bill,
            ref: { width: BILL_PAYMENT_APPLIED_COLUMNS.ref },
            dueDate: { width: BILL_PAYMENT_APPLIED_COLUMNS.dueDate },
            original: { width: BILL_PAYMENT_APPLIED_COLUMNS.original },
            applied: { width: BILL_PAYMENT_APPLIED_COLUMNS.paid },
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

function AppliedGrid({
    doc,
    rows,
    currency,
    testIdPrefix,
    total,
    contentStyle,
}: AppliedListProps & { contentStyle: ReturnType<typeof useTableMinWidth>['contentStyle'] }) {
    const layout = appliedLayoutOf(doc)
    const texts = outstandingTexts(doc)
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
        <ScrollView horizontal contentContainerStyle={contentStyle}>
            <View testID={`${testIdPrefix}-applied`} style={{ flex: 1 }}>
                <View className="flex-row items-center gap-3 border-b border-border px-2 py-2">
                    <Text className={HEAD} style={col.document}>
                        {doc.noun}
                    </Text>
                    <HeaderRef isVisible={layout.hasRef} style={col.ref} />
                    <Text className={HEAD} style={col.dueDate}>
                        Due date
                    </Text>
                    <Text className={`${HEAD} text-right`} style={col.original}>
                        {texts.totalHeader}
                    </Text>
                    <Text className={`${HEAD} text-right`} style={col.applied}>
                        {texts.appliedLabel}
                    </Text>
                </View>
                {drawn}
                <GridTotal
                    doc={doc}
                    total={total}
                    currency={currency}
                    testIdPrefix={testIdPrefix}
                />
            </View>
        </ScrollView>
    )
}

/**
 * A payment read view's paid documents (receive-payment "Applied to", pay-bills §3.8 "Bills
 * paid"): a grid whose columns the descriptor's noun picks, or cards while the list's own
 * width is below PAYMENT_CARDS_BELOW; with `total`, a Total row under them.
 */
export function AppliedInvoices({ doc, rows, currency, testIdPrefix, total }: AppliedListProps) {
    // The rows sit in the page's scroller, not a scroller of their own, so the gutter the
    // hook measures stays 0 and only the content width is used.
    const { contentStyle } = useTableMinWidth(doc.appliedMinWidth)
    const { width, onLayout } = useContainerWidth()
    if (rows.length === 0) return null
    const isCards = width > 0 && width < PAYMENT_CARDS_BELOW
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
            contentStyle={contentStyle}
        />
    )
    return (
        <View className="gap-2" onLayout={onLayout}>
            <Text className="text-sm font-semibold text-foreground">{heading}</Text>
            {body}
        </View>
    )
}
