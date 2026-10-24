import { Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native'
import type { AccountRow } from '../../hooks/useAccountsQuery'
import type { AccountMenuHandlers } from '../../hooks/useAccountsScreen'
import type { SortKey, SortState, VisibleRow } from '../../lib/account-tree'
import {
    AccountTableRow,
    BALANCE_CELL_STYLE,
    DETAIL_CELL_STYLE,
    LEADING_CELL_WIDTH,
    NAME_CELL_STYLE,
    TRAILING_CELL_WIDTH,
    TYPE_CELL_STYLE,
} from './AccountRow'

// Exactly the pane width above the sum of the column minimums, gaps and padding (so cells shrink); below it the table scrolls sideways.
const TABLE_CONTENT_STYLE = { width: '100%', minWidth: 540 } as const

interface AccountTreeProps {
    rows: VisibleRow<AccountRow>[]
    sort: SortState
    canToggle: boolean
    onSort: (key: SortKey) => void
    onToggle: (id: string) => void
    onOpen: (id: string) => void
    selectedId: string
    canWrite: boolean
    isWorking: boolean
    isSelected: (id: string) => boolean
    onSelect: (id: string) => void
    menu: AccountMenuHandlers
}

interface HeaderCellProps {
    label: string
    sortKey?: SortKey
    sort: SortState
    onSort: (key: SortKey) => void
    isRight?: boolean
    cellStyle: ViewStyle
    className?: string
}

function HeaderLabel({
    label,
    indicator,
    isRight,
}: {
    label: string
    indicator: string
    isRight: boolean
}) {
    const align = isRight ? 'justify-end' : ''
    return (
        <View className={`flex-row items-center gap-1 ${align}`}>
            <Text className="text-xs font-semibold uppercase text-muted-foreground">{label}</Text>
            <Text className="text-xs text-muted-foreground">{indicator}</Text>
        </View>
    )
}

function HeaderCell({
    label,
    sortKey,
    sort,
    onSort,
    cellStyle,
    className,
    isRight = false,
}: HeaderCellProps) {
    if (!sortKey) {
        return (
            <View role="columnheader" aria-sort="none" className={className} style={cellStyle}>
                <HeaderLabel label={label} indicator="" isRight={isRight} />
            </View>
        )
    }
    const isActive = sort.key === sortKey || (sort.key === null && sortKey === 'name')
    const indicator = isActive ? (sort.direction === 'asc' ? '↑' : '↓') : ''
    const ariaSort = isActive ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
    return (
        <View role="columnheader" aria-sort={ariaSort} className={className} style={cellStyle}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${label}`}
                accessibilityState={{ selected: isActive }}
                onPress={() => onSort(sortKey)}
                style={{ minHeight: 44, justifyContent: 'center' }}
            >
                <HeaderLabel label={label} indicator={indicator} isRight={isRight} />
            </Pressable>
        </View>
    )
}

function TableHeader({ sort, onSort }: Pick<AccountTreeProps, 'sort' | 'onSort'>) {
    return (
        <View
            className="flex-row items-center gap-3 border-b border-border bg-background px-2"
            style={{ minHeight: 44 }}
        >
            <View style={{ width: LEADING_CELL_WIDTH }} />
            <HeaderCell
                label="Name"
                sortKey="name"
                sort={sort}
                onSort={onSort}
                cellStyle={NAME_CELL_STYLE}
                className="min-w-0"
            />
            <HeaderCell
                label="Type"
                sortKey="type"
                sort={sort}
                onSort={onSort}
                cellStyle={TYPE_CELL_STYLE}
                className="min-w-0"
            />
            <HeaderCell
                label="Detail type"
                sort={sort}
                onSort={onSort}
                cellStyle={DETAIL_CELL_STYLE}
                className="min-w-0"
            />
            <HeaderCell
                label="Balance"
                sortKey="balance"
                sort={sort}
                onSort={onSort}
                cellStyle={BALANCE_CELL_STYLE}
                isRight
            />
            <View style={{ width: TRAILING_CELL_WIDTH }} />
        </View>
    )
}

export function AccountTree({
    rows,
    sort,
    canToggle,
    onSort,
    onToggle,
    onOpen,
    selectedId,
    canWrite,
    isWorking,
    isSelected,
    onSelect,
    menu,
}: AccountTreeProps) {
    const items = rows.map(row => (
        <AccountTableRow
            key={row.node.account.id}
            row={row}
            canToggle={canToggle}
            onToggle={onToggle}
            onOpen={onOpen}
            selectedId={selectedId}
            canWrite={canWrite}
            isWorking={isWorking}
            isSelected={isSelected}
            onSelect={onSelect}
            menu={menu}
        />
    ))
    return (
        <ScrollView horizontal className="flex-1" contentContainerStyle={TABLE_CONTENT_STYLE}>
            <ScrollView className="flex-1" stickyHeaderIndices={[0]}>
                <TableHeader sort={sort} onSort={onSort} />
                {items}
            </ScrollView>
        </ScrollView>
    )
}
