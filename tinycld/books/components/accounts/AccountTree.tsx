import { Pressable, ScrollView, Text, View } from 'react-native'
import type { AccountRow } from '../../hooks/useAccountsQuery'
import type { SortKey, SortState, VisibleRow } from '../../lib/account-tree'
import {
    AccountTableRow,
    BALANCE_COLUMN_WIDTH,
    DETAIL_CELL_STYLE,
    LEADING_CELL_WIDTH,
    NAME_CELL_STYLE,
    TRAILING_CELL_WIDTH,
    TYPE_COLUMN_WIDTH,
} from './AccountRow'

interface AccountTreeProps {
    rows: VisibleRow<AccountRow>[]
    sort: SortState
    canToggle: boolean
    onSort: (key: SortKey) => void
    onToggle: (id: string) => void
    onOpen: (id: string) => void
}

interface HeaderCellProps {
    label: string
    sortKey?: SortKey
    sort: SortState
    onSort: (key: SortKey) => void
    isRight?: boolean
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

function HeaderCell({ label, sortKey, sort, onSort, isRight = false }: HeaderCellProps) {
    if (!sortKey) return <HeaderLabel label={label} indicator="" isRight={isRight} />
    const isActive = sort.key === sortKey || (sort.key === null && sortKey === 'name')
    const indicator = isActive ? (sort.direction === 'asc' ? '↑' : '↓') : ''
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${label}`}
            onPress={() => onSort(sortKey)}
            style={{ minHeight: 36, justifyContent: 'center' }}
        >
            <HeaderLabel label={label} indicator={indicator} isRight={isRight} />
        </Pressable>
    )
}

function TableHeader({ sort, onSort }: Pick<AccountTreeProps, 'sort' | 'onSort'>) {
    return (
        <View
            className="flex-row items-center gap-3 border-b border-border bg-background px-2"
            style={{ minHeight: 36 }}
        >
            <View style={{ width: LEADING_CELL_WIDTH }} />
            <View className="min-w-0" style={NAME_CELL_STYLE}>
                <HeaderCell label="Name" sortKey="name" sort={sort} onSort={onSort} />
            </View>
            <View style={{ width: TYPE_COLUMN_WIDTH }}>
                <HeaderCell label="Type" sortKey="type" sort={sort} onSort={onSort} />
            </View>
            <View className="min-w-0" style={DETAIL_CELL_STYLE}>
                <HeaderCell label="Detail type" sort={sort} onSort={onSort} />
            </View>
            <View style={{ width: BALANCE_COLUMN_WIDTH }}>
                <HeaderCell label="Balance" sortKey="balance" sort={sort} onSort={onSort} isRight />
            </View>
            <View style={{ width: TRAILING_CELL_WIDTH }} />
        </View>
    )
}

export function AccountTree({ rows, sort, canToggle, onSort, onToggle, onOpen }: AccountTreeProps) {
    const items = rows.map(row => (
        <AccountTableRow
            key={row.node.account.id}
            row={row}
            canToggle={canToggle}
            onToggle={onToggle}
            onOpen={onOpen}
        />
    ))
    return (
        <ScrollView className="flex-1" stickyHeaderIndices={[0]}>
            <TableHeader sort={sort} onSort={onSort} />
            {items}
        </ScrollView>
    )
}
