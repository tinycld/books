import { Button, ButtonText } from '@tinycld/core/ui/button'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { Text, View, type ViewStyle } from 'react-native'
import { type InvoiceCreditMemoRow, useInvoiceCreditMemos } from '../../hooks/useInvoiceCreditMemos'
import { formatMoney } from '../../lib/money'
import { creditMemoStatus } from '../../lib/party-transactions'
import { formatDay } from '../../lib/register-range'
import { CREDIT_MEMO_KIND } from '../../lib/sales-document-kinds'
import { StatusBadge } from '../StatusBadge'
import { DocumentSourceLink } from './DocumentSourceLink'
import type { DocumentReadBandRowProps } from './document-kinds'

// Header and rows share one column style, so the grid lines up: each of the four columns
// flexes with a least width, and nothing scrolls sideways.
export const CREDIT_MEMO_COLUMN = { flex: 1, minWidth: 95 } satisfies ViewStyle
const COLUMN_GAP = 16
const COLUMN_COUNT = 4
// The grid's own least width (4 × 95 + 3 × 16): a narrower section draws cards.
const GRID_MIN_WIDTH = COLUMN_COUNT * CREDIT_MEMO_COLUMN.minWidth + (COLUMN_COUNT - 1) * COLUMN_GAP
const ROW_STYLE = { gap: COLUMN_GAP, minHeight: 44 } satisfies ViewStyle

// A draft has no number yet: its link reads "Draft".
function memoLinkLabel(row: Pick<InvoiceCreditMemoRow, 'status' | 'number'>): string {
    return row.status === 'draft' || !row.number ? 'Draft' : row.number
}

interface MemoProps {
    row: InvoiceCreditMemoRow
    // The invoice's currency, for a memo whose own is not written yet (a draft).
    currency: string
}

function MemoLink({ row }: { row: InvoiceCreditMemoRow }) {
    return (
        <DocumentSourceLink
            label={memoLinkLabel(row)}
            kind={CREDIT_MEMO_KIND}
            id={row.id}
            testID={`invoice-credit-memos-open-${row.id}`}
        />
    )
}

function MemoGridRow({ row, currency }: MemoProps) {
    const badge = creditMemoStatus(row)
    const amount = formatMoney(row.total, row.currency || currency)
    return (
        <View
            testID={`invoice-credit-memo-${row.id}`}
            className="flex-row items-center border-b border-border"
            style={ROW_STYLE}
        >
            <View className="min-w-0" style={CREDIT_MEMO_COLUMN}>
                <MemoLink row={row} />
            </View>
            <Text numberOfLines={1} className="text-sm text-foreground" style={CREDIT_MEMO_COLUMN}>
                {formatDay(row.date)}
            </Text>
            <Text
                numberOfLines={1}
                className="text-sm tabular-nums text-right text-foreground"
                style={CREDIT_MEMO_COLUMN}
            >
                {amount}
            </Text>
            <View className="min-w-0 items-start" style={CREDIT_MEMO_COLUMN}>
                <StatusBadge label={badge.label} tone={badge.tone} />
            </View>
        </View>
    )
}

function HeaderCell({ label, align }: { label: string; align?: 'right' }) {
    const alignClass = align === 'right' ? ' text-right' : ''
    return (
        <Text
            numberOfLines={1}
            className={`text-xs font-medium text-muted-foreground${alignClass}`}
            style={CREDIT_MEMO_COLUMN}
        >
            {label}
        </Text>
    )
}

function MemoCard({ row, currency }: MemoProps) {
    const badge = creditMemoStatus(row)
    const amount = formatMoney(row.total, row.currency || currency)
    return (
        <View
            testID={`invoice-credit-memo-${row.id}`}
            className="gap-1 border-b border-border py-2"
        >
            <View className="flex-row items-center justify-between gap-3">
                <MemoLink row={row} />
                <Text className="text-sm tabular-nums text-foreground">{amount}</Text>
            </View>
            <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs text-muted-foreground">{formatDay(row.date)}</Text>
                <StatusBadge label={badge.label} tone={badge.tone} />
            </View>
        </View>
    )
}

interface ListProps {
    rows: readonly InvoiceCreditMemoRow[]
    currency: string
}

function MemoGrid({ rows, currency }: ListProps) {
    const items = rows.map(row => <MemoGridRow key={row.id} row={row} currency={currency} />)
    return (
        <View testID="invoice-credit-memos-table">
            <View className="flex-row items-center border-b border-border pb-1" style={ROW_STYLE}>
                <HeaderCell label="No." />
                <HeaderCell label="Date" />
                <HeaderCell label="Amount" align="right" />
                <HeaderCell label="Status" />
            </View>
            {items}
        </View>
    )
}

function MemoCards({ rows, currency }: ListProps) {
    const items = rows.map(row => <MemoCard key={row.id} row={row} currency={currency} />)
    return <View testID="invoice-credit-memos-cards">{items}</View>
}

function MemoList({ rows, currency, isCards }: ListProps & { isCards: boolean }) {
    if (isCards) return <MemoCards rows={rows} currency={currency} />
    return <MemoGrid rows={rows} currency={currency} />
}

function LoadError({ onRetry }: { onRetry: () => void }) {
    return (
        <View
            testID="invoice-credit-memos-error"
            accessibilityRole="alert"
            className="flex-row items-center gap-2 rounded-lg border border-danger-soft-foreground bg-danger-soft px-3 py-1"
        >
            <Text className="min-w-0 flex-1 text-sm text-danger">
                Books could not load the credit memos of this invoice.
            </Text>
            <Button
                testID="invoice-credit-memos-retry"
                variant="outline"
                size="sm"
                style={{ minHeight: 44 }}
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function SectionBody({
    memos,
    currency,
    isCards,
}: {
    memos: ReturnType<typeof useInvoiceCreditMemos>
    currency: string
    isCards: boolean
}) {
    if (memos.isError) return <LoadError onRetry={memos.retry} />
    return <MemoList rows={memos.rows} currency={currency} isCards={isCards} />
}

/**
 * The invoice read view's "Credit memos" section (spec §3.10, the kind's ReadSection),
 * after the Payments block: the credit memos that name the invoice and are not a replaced
 * original, each with its number (a link; "Draft" for a draft), date, amount and status.
 * A grid while the section is at least the grid's own least width, cards below it.
 * Nothing while the read loads or when no memo names the invoice (most invoices have
 * none, and a skeleton would flash on each); a failed read shows its notice with Retry
 * inside the section. The invoice's Balance due does not change (Q1).
 */
export function InvoiceCreditMemos({ record }: DocumentReadBandRowProps) {
    const memos = useInvoiceCreditMemos(record.id)
    const { width, onLayout } = useContainerWidth()
    const isCards = width > 0 && width < GRID_MIN_WIDTH
    const isEmpty = memos.rows.length === 0
    const isHidden = !memos.isError && (!memos.isReady || isEmpty)
    if (isHidden) return null
    return (
        <View testID="invoice-credit-memos" className="gap-2" onLayout={onLayout}>
            <Text className="text-sm font-semibold text-foreground">Credit memos</Text>
            <SectionBody memos={memos} currency={record.currency} isCards={isCards} />
        </View>
    )
}
