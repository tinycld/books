import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native'
import { useFitsTable } from '../../../hooks/useFitsTable'
import {
    type PartyTransactionRow,
    partyFilterTestId,
    transactionTotalText,
} from '../../../lib/party-transactions'
import { formatDay } from '../../../lib/register-range'
import { ListBanner } from '../../ListBanner'
import { ListCards } from '../../ListCards'
import { ListFilterChip } from '../../ListFilterChips'
import { ListHeaderCell, ListHeaderRow, ListTable } from '../../ListTable'
import { StatusBadge } from '../../StatusBadge'

// Header and rows share these, so the columns line up; the flex columns grow above their
// minimums, and Status is fixed so Total and the badge sit at the right edge at every width.
const COLUMNS = {
    date: { flex: 1.1, minWidth: 100 },
    type: { flex: 1.2, minWidth: 110 },
    number: { flex: 1, minWidth: 90 },
    due: { flex: 1.1, minWidth: 100 },
    total: { flex: 1.1, minWidth: 104 },
    status: { width: 112 },
} satisfies Record<string, ViewStyle>

// A row's horizontal padding (`pl-4 pr-2`).
const ROW_PADDING = 24
const ROW_HEIGHT = 48
const CARD_HEIGHT = 88
// The table's own minimum (640 px): the columns at their minimums plus the row padding.
// Below it (plus the scrollbar gutter) the list draws cards.
const TABLE_MIN_WIDTH =
    COLUMNS.date.minWidth +
    COLUMNS.type.minWidth +
    COLUMNS.number.minWidth +
    COLUMNS.due.minWidth +
    COLUMNS.total.minWidth +
    COLUMNS.status.width +
    ROW_PADDING
const NO_DUE_DATE = '—'

type Row<Kind extends string> = PartyTransactionRow<Kind>
type Fits = ReturnType<typeof useFitsTable>

const keyOfRow = (row: Row<string>) => row.id
const cardHeightOf = () => CARD_HEIGHT
// The window does not grow while no source has more rows.
const noMoreRows = () => {}

// Only a document with a due date (an invoice, a bill) has one; '' reads as a dash.
function dueDateText(row: Row<string>) {
    if (row.dueDate === '') return NO_DUE_DATE
    return formatDay(row.dueDate)
}

// What the list needs of the party's kinds: the type label of each row.
interface KindTexts<Kind extends string> {
    typeLabels: Record<Kind, string>
}

// ── Chips ──

interface FilterChipsProps<Kind extends string> {
    filter: 'all' | Kind
    filters: readonly { key: 'all' | Kind; label: string }[]
    onSelect: (filter: 'all' | Kind) => void
    gutterClass: string
    testIdPrefix: string
}

function FilterChips<Kind extends string>({
    filter,
    filters,
    onSelect,
    gutterClass,
    testIdPrefix,
}: FilterChipsProps<Kind>) {
    const chips = filters.map(item => {
        const select = () => onSelect(item.key)
        return (
            <ListFilterChip
                key={item.key}
                label={item.label}
                isOn={item.key === filter}
                testID={partyFilterTestId(testIdPrefix, item.key)}
                onPress={select}
                size="compact"
            />
        )
    })
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View className={`flex-row items-center gap-2 py-3 ${gutterClass}`}>{chips}</View>
        </ScrollView>
    )
}

// ── Rows ──

interface RowProps<Kind extends string> extends KindTexts<Kind> {
    row: Row<Kind>
    currency: string
    onOpen: (row: Row<Kind>) => void
    testIdPrefix: string
}

function Cell({ style, text, align }: { style: ViewStyle; text: string; align?: 'right' }) {
    const alignClass = align === 'right' ? ' text-right' : ''
    return (
        <View className="min-w-0 pr-3" style={style}>
            <Text numberOfLines={1} className={`text-sm text-foreground${alignClass}`}>
                {text}
            </Text>
        </View>
    )
}

function TransactionTableRow<Kind extends string>({
    row,
    currency,
    onOpen,
    typeLabels,
    testIdPrefix,
}: RowProps<Kind>) {
    const open = () => onOpen(row)
    const total = transactionTotalText(row, currency)
    const date = formatDay(row.date)
    const due = dueDateText(row)
    return (
        <Pressable
            testID={`${testIdPrefix}-transaction-${row.id}`}
            accessibilityRole="link"
            onPress={open}
            className="flex-row items-center border-b border-border pl-4 pr-2"
            style={{ height: ROW_HEIGHT }}
        >
            <Cell style={COLUMNS.date} text={date} />
            <Cell style={COLUMNS.type} text={typeLabels[row.kind]} />
            <Cell style={COLUMNS.number} text={row.number} />
            <Cell style={COLUMNS.due} text={due} />
            <Cell style={COLUMNS.total} text={total} align="right" />
            <View style={COLUMNS.status} className="min-w-0 items-start">
                <StatusBadge label={row.status.label} tone={row.status.tone} />
            </View>
        </Pressable>
    )
}

function TableHeader({ testIdPrefix }: { testIdPrefix: string }) {
    return (
        <ListHeaderRow testID={`${testIdPrefix}-transactions-header`}>
            <ListHeaderCell label="Date" style={COLUMNS.date} />
            <ListHeaderCell label="Type" style={COLUMNS.type} />
            <ListHeaderCell label="No." style={COLUMNS.number} />
            <ListHeaderCell label="Due date" style={COLUMNS.due} />
            <ListHeaderCell label="Total" style={COLUMNS.total} align="right" />
            <ListHeaderCell label="Status" style={COLUMNS.status} />
        </ListHeaderRow>
    )
}

function TransactionCard<Kind extends string>({
    row,
    currency,
    height,
    onOpen,
    typeLabels,
    testIdPrefix,
}: RowProps<Kind> & { height: number }) {
    const open = () => onOpen(row)
    const total = transactionTotalText(row, currency)
    const typeAndNumber = `${typeLabels[row.kind]} ${row.number}`
    const date = formatDay(row.date)
    return (
        <Pressable
            testID={`${testIdPrefix}-transaction-${row.id}`}
            accessibilityRole="link"
            onPress={open}
            className="justify-center gap-1 border-b border-border px-4"
            style={{ height }}
        >
            <View className="flex-row items-center justify-between gap-3">
                <Text numberOfLines={1} className="shrink text-sm font-medium text-foreground">
                    {typeAndNumber}
                </Text>
                <Text className="text-sm font-medium text-foreground">{total}</Text>
            </View>
            <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs text-muted-foreground">{date}</Text>
                <StatusBadge label={row.status.label} tone={row.status.tone} />
            </View>
        </Pressable>
    )
}

interface TransactionsListProps<Kind extends string> extends KindTexts<Kind> {
    rows: Row<Kind>[]
    currency: string
    fits: Fits
    onOpen: (row: Row<Kind>) => void
    onNearEnd: () => void
    testIdPrefix: string
}

function TransactionsList<Kind extends string>({
    rows,
    currency,
    fits,
    onOpen,
    onNearEnd,
    typeLabels,
    testIdPrefix,
}: TransactionsListProps<Kind>) {
    const rowProps = { currency, onOpen, typeLabels, testIdPrefix }
    if (fits.showCards) {
        const renderCard = (row: Row<Kind>, height: number) => (
            <TransactionCard row={row} height={height} {...rowProps} />
        )
        return (
            <ListCards
                testID={`${testIdPrefix}-transactions-cards`}
                rows={rows}
                heightOf={cardHeightOf}
                keyOf={keyOfRow}
                renderCard={renderCard}
                onNearEnd={onNearEnd}
            />
        )
    }
    const renderRow = (row: Row<Kind>) => <TransactionTableRow row={row} {...rowProps} />
    const header = <TableHeader testIdPrefix={testIdPrefix} />
    return (
        <ListTable
            testID={`${testIdPrefix}-transactions-table`}
            minWidth={TABLE_MIN_WIDTH}
            rowHeight={ROW_HEIGHT}
            header={header}
            rows={rows}
            keyOf={keyOfRow}
            renderRow={renderRow}
            onNearEnd={onNearEnd}
            onGutter={fits.onGutter}
        />
    )
}

// ── Empty states ──

interface EmptyNewButtonProps {
    isVisible: boolean
    isDisabled: boolean
    onPress: () => void
    testIdPrefix: string
}

function EmptyNewButton({ isVisible, isDisabled, onPress, testIdPrefix }: EmptyNewButtonProps) {
    if (!isVisible) return null
    return (
        <Button
            testID={`${testIdPrefix}-transactions-empty-new`}
            size="sm"
            isDisabled={isDisabled}
            onPress={onPress}
            style={{ minHeight: 44 }}
        >
            <ButtonText>New transaction</ButtonText>
        </Button>
    )
}

function ShowAllButton({ onPress, testIdPrefix }: { onPress: () => void; testIdPrefix: string }) {
    return (
        <Button
            testID={`${testIdPrefix}-transactions-show-all`}
            variant="outline"
            size="sm"
            onPress={onPress}
            style={{ minHeight: 44 }}
        >
            <ButtonText>Show all</ButtonText>
        </Button>
    )
}

export interface PartyTransactionsListProps<Kind extends string> extends KindTexts<Kind> {
    rows: Row<Kind>[]
    filter: 'all' | Kind
    // The chips, in strip order; the first is All.
    filters: readonly { key: 'all' | Kind; label: string }[]
    onFilter: (filter: 'all' | Kind) => void
    isLoading: boolean
    // A failed read shows the banner; Retry recovers the failed reads.
    recovery: { isError: boolean; retry: () => void }
    // Whether a source may have rows past the window; near the end `onMore` grows it.
    hasMore: boolean
    onMore: () => void
    currency: string
    // Where a row opens (its document, pushed over the page).
    hrefOf: (row: Row<Kind>) => string
    texts: { empty: string; noMatch: (filter: Kind) => string }
    canWrite: boolean
    // The empty state's New transaction: opens the header's menu.
    onNew: () => void
    isNewDisabled: boolean
    gutterClass: string
    testIdPrefix: string
}

type BodyProps<Kind extends string> = PartyTransactionsListProps<Kind> & {
    fits: Fits
    onOpen: (row: Row<Kind>) => void
}

function TransactionsBody<Kind extends string>(props: BodyProps<Kind>) {
    const { rows, filter, recovery, isLoading, gutterClass, testIdPrefix } = props
    if (recovery.isError) {
        return (
            <View className={`pt-2 ${gutterClass}`}>
                <ListBanner
                    testIdPrefix={`${testIdPrefix}-transactions`}
                    message="Transactions could not load."
                    onRetry={recovery.retry}
                    isFlush
                />
            </View>
        )
    }
    if (isLoading) {
        return (
            <View testID={`${testIdPrefix}-transactions-loading`} className="flex-1">
                <LoadingState />
            </View>
        )
    }
    if (rows.length === 0 && filter !== 'all') {
        const showAll = () => props.onFilter('all')
        const noMatchText = props.texts.noMatch(filter)
        return (
            <View className="items-center gap-4 p-8">
                <Text
                    testID={`${testIdPrefix}-transactions-no-match`}
                    className="text-base font-medium text-foreground"
                >
                    {noMatchText}
                </Text>
                <ShowAllButton onPress={showAll} testIdPrefix={testIdPrefix} />
            </View>
        )
    }
    if (rows.length === 0) {
        return (
            <View testID={`${testIdPrefix}-transactions-empty`} className="items-center gap-4 p-8">
                <Text className="text-base font-medium text-foreground">{props.texts.empty}</Text>
                <EmptyNewButton
                    isVisible={props.canWrite}
                    isDisabled={props.isNewDisabled}
                    onPress={props.onNew}
                    testIdPrefix={testIdPrefix}
                />
            </View>
        )
    }
    const onNearEnd = props.hasMore ? props.onMore : noMoreRows
    return (
        <TransactionsList
            rows={rows}
            currency={props.currency}
            fits={props.fits}
            onOpen={props.onOpen}
            onNearEnd={onNearEnd}
            typeLabels={props.typeLabels}
            testIdPrefix={testIdPrefix}
        />
    )
}

/**
 * A party page's Transactions tab body: the party's documents, newest first, with type
 * chips. A row opens its document (`hrefOf`), pushed over the page, so Back returns to the
 * page as it was. The list measures its own width: below the table's minimum (or on a
 * phone) it draws cards, so the table never scrolls sideways. The empty state's New
 * transaction opens the header's menu (`onNew`), so one menu serves both buttons.
 */
export function PartyTransactionsList<Kind extends string>(
    props: PartyTransactionsListProps<Kind>
) {
    const { filter, filters, onFilter, hrefOf, gutterClass, testIdPrefix } = props
    const fits = useFitsTable(TABLE_MIN_WIDTH)
    const orgHref = useOrgHref()
    const open = (row: Row<Kind>) => router.push(orgHref(hrefOf(row)))
    return (
        <View testID={`${testIdPrefix}-transactions`} className="flex-1" onLayout={fits.onLayout}>
            <FilterChips
                filter={filter}
                filters={filters}
                onSelect={onFilter}
                gutterClass={gutterClass}
                testIdPrefix={testIdPrefix}
            />
            <TransactionsBody {...props} fits={fits} onOpen={open} />
        </View>
    )
}
