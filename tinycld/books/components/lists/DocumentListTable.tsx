import type { ReactNode } from 'react'
import { type FocusEvent, Platform, Pressable, Text, View } from 'react-native'
import {
    columnLabel,
    type DocumentListRow,
    type DocumentListTab,
    LIST_COLUMNS,
    type ListColumnKey,
    type ListSort,
    type ListSortKey,
} from '../../lib/document-list'
import { cellText, columnStyle, isMutedCell, LIST_ROW_HEIGHT } from '../../lib/document-list-cells'
import { ariaSortOf } from '../../lib/document-list-menus'
import { areaOf } from '../../lib/list-areas'
import { PARTY_ROW_CLASS } from '../../lib/party-list'
import type { CategoryNames } from '../../lib/purchase-category'
import { ListHeaderCell, ListHeaderRow, ListSortHeaderCell, ListTable } from '../ListTable'
import { StatusBadge } from '../StatusBadge'

interface DocumentListTableProps {
    tab: DocumentListTab
    rows: readonly DocumentListRow[]
    currency: string
    // The account and product names the Category cell reads (`usePurchaseCategories`).
    categoryNames: CategoryNames
    // The table's own minimum width with the edge cells it draws (`tableMinWidthFor`).
    minWidth: number
    sort: ListSort
    // A press on a sortable header (the screen's `toggleSort`).
    onSort(key: ListSortKey): void
    onOpen(row: DocumentListRow): void
    onNearEnd(): void
    // The 44 px cells before and after a row's cells, and the header's (a tick box and a
    // row menu); none draws while they are not given. The header keeps an empty cell over
    // the rows' trail cells.
    renderLead?(row: DocumentListRow): ReactNode
    renderTrail?(row: DocumentListRow): ReactNode
    headerLead?: ReactNode
    // A ticked row draws `bg-accent`.
    isTicked?(id: string): boolean
    // The list keys' focused row ('' for none) draws the focus look (`rowBackground`,
    // `FocusBar`) and marks its open button `aria-current`; `scrollToIndex` keeps it in view.
    focusedId?: string
    scrollToIndex?: number
}

// On the web, the open button of a row, a card or a name row never holds DOM focus: the
// row focus is the store's. React-native-web presses a focused Pressable on plain Enter
// and Space and stops the key, so a button that kept the focus after a mouse press would
// take those keys from the list keys. `tabIndex={-1}` keeps the button out of the Tab
// order, but a mouse press still focuses it, so the button gives the focus up at once
// (`ROW_ON_FOCUS`). The tick box and the row menu stay Tab stops. Native is unchanged.
export const ROW_TAB_INDEX = Platform.OS === 'web' ? -1 : undefined

function dropFocus(event: FocusEvent) {
    const target = event.currentTarget
    if (typeof target !== 'number') target.blur()
}

export const ROW_ON_FOCUS = Platform.OS === 'web' ? dropFocus : undefined

// A ticked row draws `bg-accent`; the list keys' focused row a light `bg-muted/10` tint
// (muted text and badges stay legible on it) and the bar of `FocusBar`, so it does not
// read as ticked or open in either scheme.
export function rowBackground(isTicked: boolean, isFocused: boolean): string {
    if (isTicked) return 'bg-accent'
    if (isFocused) return 'bg-muted/10'
    return 'bg-background'
}

const FOCUS_BAR_STYLE = { pointerEvents: 'none' } as const

// The list keys' focused row: a 4 px primary bar at the row's left edge, over the row
// (presses go through it).
export function FocusBar({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View className="absolute bottom-0 left-0 top-0 w-1 bg-primary" style={FOCUS_BAR_STYLE} />
    )
}

const ROW_STYLE = { height: LIST_ROW_HEIGHT }
const EDGE_CELL_STYLE = { width: 44 }
// A row that starts with a 44 px cell has no left padding; a reader's row keeps its 16 px.
const LEAD_ROW_CLASS = 'flex-row items-center pr-2'

function rowClassOf(hasLead: boolean): string {
    return hasLead ? LEAD_ROW_CLASS : PARTY_ROW_CLASS
}

function EdgeCell({ children }: { children: ReactNode }) {
    if (children === undefined || children === null) return null
    return <View style={EDGE_CELL_STYLE}>{children}</View>
}

function TrailSpacer({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <View style={EDGE_CELL_STYLE} />
}

function keyOfRow(row: DocumentListRow): string {
    return row.id
}

interface HeaderCellProps {
    tab: DocumentListTab
    testIdPrefix: string
    column: ListColumnKey
    sort: ListSort
    onSort(key: ListSortKey): void
}

// A column sorts when the tab offers its sort key; Type, the party, Category, Memo,
// Reference no. and Status never do.
function HeaderCell({ tab, testIdPrefix, column, sort, onSort }: HeaderCellProps) {
    const label = columnLabel(tab, column)
    const style = columnStyle(column, tab.area)
    const align = LIST_COLUMNS[column].align ?? 'left'
    const sortKey = LIST_COLUMNS[column].sortKey
    const testID = `${testIdPrefix}-header-${column}`
    if (sortKey !== undefined && tab.sortKeys.includes(sortKey)) {
        const press = () => onSort(sortKey)
        return (
            <ListSortHeaderCell
                testID={testID}
                label={label}
                style={style}
                align={align}
                sorted={ariaSortOf(sort, sortKey)}
                onPress={press}
            />
        )
    }
    return <ListHeaderCell testID={testID} label={label} style={style} align={align} />
}

interface RowCellProps {
    row: DocumentListRow
    column: ListColumnKey
    tab: DocumentListTab
    testIdPrefix: string
    currency: string
    categoryNames: CategoryNames
}

// A Category cell of several lines ("Split") draws muted; every other cell, and a
// category's name, in the foreground (`isMutedCell`).
function cellColorOf(row: DocumentListRow, column: ListColumnKey): string {
    return isMutedCell(row, column) ? 'text-muted-foreground' : 'text-foreground'
}

function RowCell({ row, column, tab, testIdPrefix, currency, categoryNames }: RowCellProps) {
    const style = columnStyle(column, tab.area)
    if (column === 'status') {
        return (
            <View className="min-w-0" style={style}>
                <StatusBadge
                    testID={`${testIdPrefix}-status-${row.id}`}
                    label={row.status.label}
                    tone={row.status.tone}
                />
            </View>
        )
    }
    const alignClass = LIST_COLUMNS[column].align === 'right' ? ' text-right' : ''
    const text = cellText(row, column, tab, currency, categoryNames)
    const color = cellColorOf(row, column)
    return (
        <View className="min-w-0 pr-3" style={style}>
            <Text numberOfLines={1} className={`text-sm ${color}${alignClass}`}>
                {text}
            </Text>
        </View>
    )
}

interface TableRowProps {
    row: DocumentListRow
    tab: DocumentListTab
    testIdPrefix: string
    currency: string
    categoryNames: CategoryNames
    onOpen(row: DocumentListRow): void
    renderLead?(row: DocumentListRow): ReactNode
    renderTrail?(row: DocumentListRow): ReactNode
    isTicked: boolean
    isFocused: boolean
}

// The lead cell, the button that opens the document (its cells) and the trail cell are
// siblings, so a press on a tick box or a row menu never opens the row.
function TableRow({
    row,
    tab,
    testIdPrefix,
    currency,
    categoryNames,
    onOpen,
    renderLead,
    renderTrail,
    isTicked,
    isFocused,
}: TableRowProps) {
    const press = () => onOpen(row)
    const lead = renderLead?.(row)
    const trail = renderTrail?.(row)
    const cells = tab.columns.map(column => (
        <RowCell
            key={column}
            row={row}
            column={column}
            tab={tab}
            testIdPrefix={testIdPrefix}
            currency={currency}
            categoryNames={categoryNames}
        />
    ))
    const rowClass = rowClassOf(renderLead !== undefined)
    const bg = rowBackground(isTicked, isFocused)
    const current = isFocused ? 'true' : undefined
    return (
        <View className={`${rowClass} border-b border-border ${bg}`} style={ROW_STYLE}>
            <EdgeCell>{lead}</EdgeCell>
            <Pressable
                testID={`${testIdPrefix}-row-${row.id}`}
                accessibilityRole="button"
                aria-current={current}
                tabIndex={ROW_TAB_INDEX}
                onFocus={ROW_ON_FOCUS}
                onPress={press}
                className="min-w-0 flex-1 flex-row items-center"
                style={ROW_STYLE}
            >
                {cells}
            </Pressable>
            <EdgeCell>{trail}</EdgeCell>
            <FocusBar isVisible={isFocused} />
        </View>
    )
}

/**
 * A document list as a table: one row per document, its columns flex with a minimum
 * (`columnStyle`, shared by the header and the rows). The screen draws cards below the
 * table's own minimum width, so the table never scrolls sideways. Test ids start with the
 * tab's area prefix.
 */
export function DocumentListTable({
    tab,
    rows,
    currency,
    categoryNames,
    minWidth,
    sort,
    onSort,
    onOpen,
    onNearEnd,
    renderLead,
    renderTrail,
    headerLead,
    isTicked,
    focusedId = '',
    scrollToIndex,
}: DocumentListTableProps) {
    const prefix = areaOf(tab).testIdPrefix
    const headerCells = tab.columns.map(column => (
        <HeaderCell
            key={column}
            tab={tab}
            testIdPrefix={prefix}
            column={column}
            sort={sort}
            onSort={onSort}
        />
    ))
    const header = (
        <ListHeaderRow testID={`${prefix}-header`} rowClass={rowClassOf(renderLead !== undefined)}>
            <EdgeCell>{headerLead}</EdgeCell>
            {headerCells}
            <TrailSpacer isVisible={renderTrail !== undefined} />
        </ListHeaderRow>
    )
    const renderRow = (row: DocumentListRow) => (
        <TableRow
            row={row}
            tab={tab}
            testIdPrefix={prefix}
            currency={currency}
            categoryNames={categoryNames}
            onOpen={onOpen}
            renderLead={renderLead}
            renderTrail={renderTrail}
            isTicked={isTicked?.(row.id) ?? false}
            isFocused={row.id === focusedId}
        />
    )
    return (
        <ListTable
            testID={`${prefix}-table`}
            minWidth={minWidth}
            rowHeight={LIST_ROW_HEIGHT}
            header={header}
            rows={rows}
            keyOf={keyOfRow}
            renderRow={renderRow}
            onNearEnd={onNearEnd}
            scrollToIndex={scrollToIndex}
        />
    )
}
