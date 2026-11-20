import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import type { ReactNode } from 'react'
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
// The row menu's cell, after the row's padding: the 44 px trigger. The cells carry their
// own gap (`pr-3` inside each minimum), so the menu column adds no gap of its own.
const MENU_CELL_STYLE = { width: 44 }
// The table's own minimum (640 px): the columns at their minimums plus the row padding.
const BASE_TABLE_MIN_WIDTH =
    COLUMNS.date.minWidth +
    COLUMNS.type.minWidth +
    COLUMNS.number.minWidth +
    COLUMNS.due.minWidth +
    COLUMNS.total.minWidth +
    COLUMNS.status.width +
    ROW_PADDING
// With a row menu the table is 44 px wider (684 px). Below the minimum (plus the scrollbar
// gutter) the list draws cards, so the table never scrolls sideways.
function tableMinWidthOf(hasRowMenu: boolean): number {
    return hasRowMenu ? BASE_TABLE_MIN_WIDTH + MENU_CELL_STYLE.width : BASE_TABLE_MIN_WIDTH
}
const NO_DUE_DATE = '—'

type Fits = ReturnType<typeof useFitsTable>
// The row's own menu, drawn beside it; undefined where the list has none (the vendor tab).
type RowMenu<Row> = ((row: Row) => ReactNode) | undefined

const keyOfRow = (row: PartyTransactionRow<string>) => row.id
const cardHeightOf = () => CARD_HEIGHT
// The window does not grow while no source has more rows.
const noMoreRows = () => {}

// Only a document with a due date (an invoice, a bill) has one; '' reads as a dash.
function dueDateText(row: PartyTransactionRow<string>) {
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

interface RowProps<Kind extends string, Row extends PartyTransactionRow<Kind>>
    extends KindTexts<Kind> {
    row: Row
    currency: string
    onOpen: (row: Row) => void
    rowMenu: RowMenu<Row>
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

// The 44 px cell of a row menu; nothing (and no column) where the list has no menu.
function MenuCell({ isVisible, children }: { isVisible: boolean; children: ReactNode }) {
    if (!isVisible) return null
    return <View style={MENU_CELL_STYLE}>{children}</View>
}

// The press target (the row's cells) and the menu cell are siblings, so a press on the
// menu never opens the row.
function TransactionTableRow<Kind extends string, Row extends PartyTransactionRow<Kind>>({
    row,
    currency,
    onOpen,
    rowMenu,
    typeLabels,
    testIdPrefix,
}: RowProps<Kind, Row>) {
    const open = () => onOpen(row)
    const total = transactionTotalText(row, currency)
    const date = formatDay(row.date)
    const due = dueDateText(row)
    const menu = rowMenu?.(row)
    return (
        <View
            className="flex-row items-center border-b border-border"
            style={{ height: ROW_HEIGHT }}
        >
            <Pressable
                testID={`${testIdPrefix}-transaction-${row.id}`}
                accessibilityRole="link"
                onPress={open}
                className="min-w-0 flex-1 flex-row items-center pl-4 pr-2"
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
            <MenuCell isVisible={rowMenu !== undefined}>{menu}</MenuCell>
        </View>
    )
}

function TableHeader({ testIdPrefix, hasRowMenu }: { testIdPrefix: string; hasRowMenu: boolean }) {
    return (
        <ListHeaderRow testID={`${testIdPrefix}-transactions-header`}>
            <ListHeaderCell label="Date" style={COLUMNS.date} />
            <ListHeaderCell label="Type" style={COLUMNS.type} />
            <ListHeaderCell label="No." style={COLUMNS.number} />
            <ListHeaderCell label="Due date" style={COLUMNS.due} />
            <ListHeaderCell label="Total" style={COLUMNS.total} align="right" />
            <ListHeaderCell label="Status" style={COLUMNS.status} />
            <MenuCell isVisible={hasRowMenu}>{null}</MenuCell>
        </ListHeaderRow>
    )
}

// The card's menu sits at its top right, beside the press target.
function TransactionCard<Kind extends string, Row extends PartyTransactionRow<Kind>>({
    row,
    currency,
    height,
    onOpen,
    rowMenu,
    typeLabels,
    testIdPrefix,
}: RowProps<Kind, Row> & { height: number }) {
    const open = () => onOpen(row)
    const total = transactionTotalText(row, currency)
    const typeAndNumber = `${typeLabels[row.kind]} ${row.number}`
    const date = formatDay(row.date)
    const menu = rowMenu?.(row)
    const pressClass = rowMenu === undefined ? 'px-4' : 'pl-4'
    return (
        <View className="flex-row items-start border-b border-border" style={{ height }}>
            <Pressable
                testID={`${testIdPrefix}-transaction-${row.id}`}
                accessibilityRole="link"
                onPress={open}
                className={`min-w-0 flex-1 justify-center gap-1 ${pressClass}`}
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
            <MenuCell isVisible={rowMenu !== undefined}>{menu}</MenuCell>
        </View>
    )
}

interface TransactionsListProps<Kind extends string, Row extends PartyTransactionRow<Kind>>
    extends KindTexts<Kind> {
    rows: Row[]
    currency: string
    fits: Fits
    minWidth: number
    onOpen: (row: Row) => void
    rowMenu: RowMenu<Row>
    onNearEnd: () => void
    testIdPrefix: string
}

function TransactionsList<Kind extends string, Row extends PartyTransactionRow<Kind>>({
    rows,
    currency,
    fits,
    minWidth,
    onOpen,
    rowMenu,
    onNearEnd,
    typeLabels,
    testIdPrefix,
}: TransactionsListProps<Kind, Row>) {
    const rowProps = { currency, onOpen, rowMenu, typeLabels, testIdPrefix }
    if (fits.showCards) {
        const renderCard = (row: Row, height: number) => (
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
    const renderRow = (row: Row) => <TransactionTableRow row={row} {...rowProps} />
    const header = <TableHeader testIdPrefix={testIdPrefix} hasRowMenu={rowMenu !== undefined} />
    return (
        <ListTable
            testID={`${testIdPrefix}-transactions-table`}
            minWidth={minWidth}
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

export interface PartyTransactionsListProps<
    Kind extends string,
    Row extends PartyTransactionRow<Kind> = PartyTransactionRow<Kind>,
> extends KindTexts<Kind> {
    rows: Row[]
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
    hrefOf: (row: Row) => string
    texts: { empty: string; noMatch: (filter: Kind) => string }
    canWrite: boolean
    // The empty state's New transaction: opens the header's menu.
    onNew: () => void
    isNewDisabled: boolean
    gutterClass: string
    testIdPrefix: string
    // A menu at the end of each row (a 44 px column) or at a card's top right; without it
    // no column is added.
    rowMenu?: (row: Row) => ReactNode
}

type BodyProps<
    Kind extends string,
    Row extends PartyTransactionRow<Kind>,
> = PartyTransactionsListProps<Kind, Row> & {
    fits: Fits
    minWidth: number
    onOpen: (row: Row) => void
}

function TransactionsBody<Kind extends string, Row extends PartyTransactionRow<Kind>>(
    props: BodyProps<Kind, Row>
) {
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
        <TransactionsList<Kind, Row>
            rows={rows}
            currency={props.currency}
            fits={props.fits}
            minWidth={props.minWidth}
            onOpen={props.onOpen}
            rowMenu={props.rowMenu}
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
 * phone) it draws cards, so the table never scrolls sideways; a `rowMenu` adds its 44 px
 * column to that minimum. The empty state's New transaction opens the header's menu
 * (`onNew`), so one menu serves both buttons.
 */
export function PartyTransactionsList<
    Kind extends string,
    Row extends PartyTransactionRow<Kind> = PartyTransactionRow<Kind>,
>(props: PartyTransactionsListProps<Kind, Row>) {
    const { filter, filters, onFilter, hrefOf, gutterClass, testIdPrefix } = props
    const minWidth = tableMinWidthOf(props.rowMenu !== undefined)
    const fits = useFitsTable(minWidth)
    const orgHref = useOrgHref()
    const open = (row: Row) => router.push(orgHref(hrefOf(row)))
    return (
        <View testID={`${testIdPrefix}-transactions`} className="flex-1" onLayout={fits.onLayout}>
            <FilterChips
                filter={filter}
                filters={filters}
                onSelect={onFilter}
                gutterClass={gutterClass}
                testIdPrefix={testIdPrefix}
            />
            <TransactionsBody<Kind, Row> {...props} fits={fits} minWidth={minWidth} onOpen={open} />
        </View>
    )
}
