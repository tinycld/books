import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
    columnLabel,
    type DocumentListRow,
    type DocumentListTab,
    LIST_COLUMNS,
    type ListColumnKey,
    type ListSort,
    type ListSortKey,
    tableMinWidth,
} from '../../lib/document-list'
import { cellText, columnStyle, LIST_ROW_HEIGHT } from '../../lib/document-list-cells'
import { ariaSortOf } from '../../lib/document-list-menus'
import { PARTY_ROW_CLASS } from '../../lib/party-list'
import { ListHeaderCell, ListHeaderRow, ListSortHeaderCell, ListTable } from '../ListTable'
import { StatusBadge } from '../StatusBadge'

interface DocumentListTableProps {
    tab: DocumentListTab
    rows: readonly DocumentListRow[]
    currency: string
    canWrite: boolean
    sort: ListSort
    // A press on a sortable header (the screen's `toggleSort`).
    onSort(key: ListSortKey): void
    onOpen(row: DocumentListRow): void
    onNearEnd(): void
    // The 44 px cells before and after a row's cells, and the header's (a tick box and a
    // row menu); none draws while they are not given.
    renderLead?(row: DocumentListRow): ReactNode
    renderTrail?(row: DocumentListRow): ReactNode
    headerLead?: ReactNode
    headerTrail?: ReactNode
}

const ROW_STYLE = { height: LIST_ROW_HEIGHT }
const EDGE_CELL_STYLE = { width: 44 }

function EdgeCell({ children }: { children: ReactNode }) {
    if (children === undefined || children === null) return null
    return <View style={EDGE_CELL_STYLE}>{children}</View>
}

function keyOfRow(row: DocumentListRow): string {
    return row.id
}

interface HeaderCellProps {
    tab: DocumentListTab
    column: ListColumnKey
    sort: ListSort
    onSort(key: ListSortKey): void
}

// A column sorts when the tab offers its sort key; Type, Customer, Memo, Reference no.
// and Status never do.
function HeaderCell({ tab, column, sort, onSort }: HeaderCellProps) {
    const label = columnLabel(tab, column)
    const style = columnStyle(column)
    const align = LIST_COLUMNS[column].align ?? 'left'
    const sortKey = LIST_COLUMNS[column].sortKey
    if (sortKey !== undefined && tab.sortKeys.includes(sortKey)) {
        const press = () => onSort(sortKey)
        return (
            <ListSortHeaderCell
                testID={`sales-header-${column}`}
                label={label}
                style={style}
                align={align}
                sorted={ariaSortOf(sort, sortKey)}
                onPress={press}
            />
        )
    }
    return (
        <ListHeaderCell
            testID={`sales-header-${column}`}
            label={label}
            style={style}
            align={align}
        />
    )
}

interface RowCellProps {
    row: DocumentListRow
    column: ListColumnKey
    tab: DocumentListTab
    currency: string
}

function RowCell({ row, column, tab, currency }: RowCellProps) {
    const style = columnStyle(column)
    if (column === 'status') {
        return (
            <View className="min-w-0" style={style}>
                <StatusBadge
                    testID={`sales-status-${row.id}`}
                    label={row.status.label}
                    tone={row.status.tone}
                />
            </View>
        )
    }
    const alignClass = LIST_COLUMNS[column].align === 'right' ? ' text-right' : ''
    const text = cellText(row, column, tab, currency)
    return (
        <View className="min-w-0 pr-3" style={style}>
            <Text numberOfLines={1} className={`text-sm text-foreground${alignClass}`}>
                {text}
            </Text>
        </View>
    )
}

interface TableRowProps {
    row: DocumentListRow
    tab: DocumentListTab
    currency: string
    onOpen(row: DocumentListRow): void
    renderLead?(row: DocumentListRow): ReactNode
    renderTrail?(row: DocumentListRow): ReactNode
}

// The lead cell, the button that opens the document (its cells) and the trail cell are
// siblings, so a press on a tick box or a row menu never opens the row.
function TableRow({ row, tab, currency, onOpen, renderLead, renderTrail }: TableRowProps) {
    const press = () => onOpen(row)
    const lead = renderLead?.(row)
    const trail = renderTrail?.(row)
    const cells = tab.columns.map(column => (
        <RowCell key={column} row={row} column={column} tab={tab} currency={currency} />
    ))
    return (
        <View
            className={`${PARTY_ROW_CLASS} border-b border-border bg-background`}
            style={ROW_STYLE}
        >
            <EdgeCell>{lead}</EdgeCell>
            <Pressable
                testID={`sales-row-${row.id}`}
                accessibilityRole="button"
                onPress={press}
                className="min-w-0 flex-1 flex-row items-center"
                style={ROW_STYLE}
            >
                {cells}
            </Pressable>
            <EdgeCell>{trail}</EdgeCell>
        </View>
    )
}

/**
 * A Sales list as a table: one row per document, its columns flex with a minimum
 * (`columnStyle`, shared by the header and the rows). The screen draws cards below the
 * table's own minimum width, so the table never scrolls sideways.
 */
export function DocumentListTable({
    tab,
    rows,
    currency,
    canWrite,
    sort,
    onSort,
    onOpen,
    onNearEnd,
    renderLead,
    renderTrail,
    headerLead,
    headerTrail,
}: DocumentListTableProps) {
    const headerCells = tab.columns.map(column => (
        <HeaderCell key={column} tab={tab} column={column} sort={sort} onSort={onSort} />
    ))
    const header = (
        <ListHeaderRow testID="sales-header">
            <EdgeCell>{headerLead}</EdgeCell>
            {headerCells}
            <EdgeCell>{headerTrail}</EdgeCell>
        </ListHeaderRow>
    )
    const renderRow = (row: DocumentListRow) => (
        <TableRow
            row={row}
            tab={tab}
            currency={currency}
            onOpen={onOpen}
            renderLead={renderLead}
            renderTrail={renderTrail}
        />
    )
    const minWidth = tableMinWidth(tab.columns, canWrite)
    return (
        <ListTable
            testID="sales-table"
            minWidth={minWidth}
            rowHeight={LIST_ROW_HEIGHT}
            header={header}
            rows={rows}
            keyOf={keyOfRow}
            renderRow={renderRow}
            onNearEnd={onNearEnd}
        />
    )
}
