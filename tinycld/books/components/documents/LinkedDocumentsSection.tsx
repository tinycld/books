import { Button, ButtonText } from '@tinycld/core/ui/button'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { Text, View, type ViewStyle } from 'react-native'
import type { StatusTone } from '../../lib/document-lifecycle'
import { formatMoney } from '../../lib/money'
import { formatDay } from '../../lib/register-range'
import type { SalesDocumentKind } from '../../lib/sales-document-kinds'
import { StatusBadge } from '../StatusBadge'
import { DocumentSourceLink } from './DocumentSourceLink'

// Header and rows share one column style, so the grid lines up: each of the four columns
// flexes with a least width, and nothing scrolls sideways.
export const LINKED_DOCUMENT_COLUMN = { flex: 1, minWidth: 95 } satisfies ViewStyle
const COLUMN_GAP = 16
const COLUMN_COUNT = 4
// The grid's own least width (4 × 95 + 3 × 16 = 428): a narrower section draws cards.
const GRID_MIN_WIDTH =
    COLUMN_COUNT * LINKED_DOCUMENT_COLUMN.minWidth + (COLUMN_COUNT - 1) * COLUMN_GAP
const ROW_STYLE = { gap: COLUMN_GAP, minHeight: 44 } satisfies ViewStyle

// One linked document: `number` is its link's text, `amount` its cents, shown with no sign
// (the section's heading says what they are), in `currency` or the section's when the row
// has none yet (a draft).
export type LinkedDocumentRow = {
    id: string
    number: string
    date: string
    amount: number
    currency: string
    status: { label: string; tone: StatusTone }
}

// The ids of a section's parts; each kind keeps its own spellings.
export type LinkedDocumentsIds = {
    section: string
    table: string
    cards: string
    error: string
    retry: string
    row: (id: string) => string
    link: (id: string) => string
}

// A failed read's notice and its Retry.
export type LinkedDocumentsError = { isError: boolean; message: string; onRetry: () => void }

// A draft has no number yet: its link reads "Draft".
export function linkedNumberOf(row: { status: string; number: string }): string {
    return row.status === 'draft' || !row.number ? 'Draft' : row.number
}

interface RowProps {
    row: LinkedDocumentRow
    ids: LinkedDocumentsIds
    kind: Pick<SalesDocumentKind, 'routeBase'>
    currency: string
}

function RowLink({ row, ids, kind }: Omit<RowProps, 'currency'>) {
    const linkId = ids.link(row.id)
    return <DocumentSourceLink label={row.number} kind={kind} id={row.id} testID={linkId} />
}

function GridRow({ row, ids, kind, currency }: RowProps) {
    const amount = formatMoney(row.amount, row.currency || currency)
    const day = formatDay(row.date)
    const rowId = ids.row(row.id)
    return (
        <View
            testID={rowId}
            className="flex-row items-center border-b border-border"
            style={ROW_STYLE}
        >
            <View className="min-w-0" style={LINKED_DOCUMENT_COLUMN}>
                <RowLink row={row} ids={ids} kind={kind} />
            </View>
            <Text
                numberOfLines={1}
                className="text-sm text-foreground"
                style={LINKED_DOCUMENT_COLUMN}
            >
                {day}
            </Text>
            <Text
                numberOfLines={1}
                className="text-sm tabular-nums text-right text-foreground"
                style={LINKED_DOCUMENT_COLUMN}
            >
                {amount}
            </Text>
            <View className="min-w-0 items-start" style={LINKED_DOCUMENT_COLUMN}>
                <StatusBadge label={row.status.label} tone={row.status.tone} />
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
            style={LINKED_DOCUMENT_COLUMN}
        >
            {label}
        </Text>
    )
}

function Card({ row, ids, kind, currency }: RowProps) {
    const amount = formatMoney(row.amount, row.currency || currency)
    const day = formatDay(row.date)
    const rowId = ids.row(row.id)
    return (
        <View testID={rowId} className="gap-1 border-b border-border py-2">
            <View className="flex-row items-center justify-between gap-3">
                <RowLink row={row} ids={ids} kind={kind} />
                <Text className="text-sm tabular-nums text-foreground">{amount}</Text>
            </View>
            <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs text-muted-foreground">{day}</Text>
                <StatusBadge label={row.status.label} tone={row.status.tone} />
            </View>
        </View>
    )
}

interface ListProps {
    rows: readonly LinkedDocumentRow[]
    ids: LinkedDocumentsIds
    kind: Pick<SalesDocumentKind, 'routeBase'>
    currency: string
}

function Grid({ rows, ids, kind, currency }: ListProps) {
    const items = rows.map(row => (
        <GridRow key={row.id} row={row} ids={ids} kind={kind} currency={currency} />
    ))
    return (
        <View testID={ids.table}>
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

function Cards({ rows, ids, kind, currency }: ListProps) {
    const items = rows.map(row => (
        <Card key={row.id} row={row} ids={ids} kind={kind} currency={currency} />
    ))
    return <View testID={ids.cards}>{items}</View>
}

function List({ isCards, ...props }: ListProps & { isCards: boolean }) {
    if (isCards) return <Cards {...props} />
    return <Grid {...props} />
}

function LoadError({ ids, error }: { ids: LinkedDocumentsIds; error: LinkedDocumentsError }) {
    return (
        <View
            testID={ids.error}
            accessibilityRole="alert"
            className="flex-row items-center gap-2 rounded-lg border border-danger-soft-foreground bg-danger-soft px-3 py-1"
        >
            <Text className="min-w-0 flex-1 text-sm text-danger">{error.message}</Text>
            <Button
                testID={ids.retry}
                variant="outline"
                size="sm"
                style={{ minHeight: 44 }}
                onPress={error.onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function SectionBody({
    error,
    ...props
}: ListProps & { isCards: boolean; error: LinkedDocumentsError }) {
    if (error.isError) return <LoadError ids={props.ids} error={error} />
    return <List {...props} />
}

interface LinkedDocumentsSectionProps {
    ids: LinkedDocumentsIds
    title: string
    rows: readonly LinkedDocumentRow[]
    // The kind the rows open.
    kind: Pick<SalesDocumentKind, 'routeBase'>
    // The record's currency, for a row whose own is not written yet (a draft).
    currency: string
    error: LinkedDocumentsError
}

/**
 * A read view's section of the documents that name the record (an invoice's Credit memos,
 * a sales receipt's Refund receipts, a credit memo's Refunds): its heading, then each row's
 * number (a link), date, amount and status. A grid while the section is at least the grid's
 * own least width (428 px), cards below it. Nothing while the read loads or when no row
 * names the record (most records have none, and a skeleton would flash on each); a failed
 * read shows its notice with Retry inside the section.
 */
export function LinkedDocumentsSection({
    ids,
    title,
    rows,
    kind,
    currency,
    error,
}: LinkedDocumentsSectionProps) {
    const { width, onLayout } = useContainerWidth()
    const isCards = width > 0 && width < GRID_MIN_WIDTH
    const isHidden = !error.isError && rows.length === 0
    if (isHidden) return null
    return (
        <View testID={ids.section} className="gap-2" onLayout={onLayout}>
            <Text className="text-sm font-semibold text-foreground">{title}</Text>
            <SectionBody
                rows={rows}
                ids={ids}
                kind={kind}
                currency={currency}
                isCards={isCards}
                error={error}
            />
        </View>
    )
}
