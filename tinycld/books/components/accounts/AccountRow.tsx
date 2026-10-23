import { Pressable, Text, View } from 'react-native'
import type { AccountRow as AccountData } from '../../hooks/useAccountsQuery'
import type { VisibleRow } from '../../lib/account-tree'
import { formatMoney } from '../../lib/money'
import { AccountCaret } from './AccountCaret'
import { accountDisplay } from './account-display'
import { GroupChip } from './GroupChip'

export const TYPE_COLUMN_WIDTH = 210
// Type gives up width before Balance does, so an inline panel never pushes Balance off screen.
export const TYPE_CELL_STYLE = { width: TYPE_COLUMN_WIDTH, flexShrink: 1, minWidth: 80 }
// Balance never shrinks: a clipped amount misleads, so the table scrolls sideways instead.
export const BALANCE_CELL_STYLE = { width: 112, minWidth: 104, flexShrink: 0 }
export const LEADING_CELL_WIDTH = 40
export const TRAILING_CELL_WIDTH = 44
export const INDENT_STEP = 20
// Name wins the free space; Detail type is the column that truncates. Header and rows share these.
export const NAME_CELL_STYLE = { flexGrow: 3, flexShrink: 1, flexBasis: 0, minWidth: 120 }
export const DETAIL_CELL_STYLE = { flexGrow: 2, flexShrink: 1, flexBasis: 0, minWidth: 72 }

interface AccountTableRowProps {
    row: VisibleRow<AccountData>
    canToggle: boolean
    onToggle: (id: string) => void
    onOpen: (id: string) => void
    selectedId: string
}

export function AccountTableRow({
    row,
    canToggle,
    onToggle,
    onOpen,
    selectedId,
}: AccountTableRowProps) {
    const { account, depth } = row.node
    const { typeLabel, detailLabel, group } = accountDisplay(account.type, account.detail_type)
    const dim = account.inactive ? 'opacity-60' : ''
    const isSelected = selectedId !== '' && selectedId === account.id
    const bg = isSelected ? 'bg-accent' : 'bg-background'

    return (
        <Pressable
            testID={`account-row-${account.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onOpen(account.id)}
            className={`flex-row items-center gap-3 border-b border-border ${bg} px-2 ${dim}`}
            style={{ minHeight: 44 }}
        >
            <View style={{ width: LEADING_CELL_WIDTH }} />
            <View className="min-w-0" style={NAME_CELL_STYLE}>
                <View
                    className="min-w-0 flex-row items-center"
                    style={{ paddingLeft: (depth - 1) * INDENT_STEP }}
                >
                    <AccountCaret
                        id={account.id}
                        hasChildren={row.hasChildren && canToggle}
                        isCollapsed={row.isCollapsed}
                        onToggle={onToggle}
                    />
                    <NumberLabel number={account.number} />
                    <Text numberOfLines={1} className="shrink text-sm text-foreground">
                        {account.name}
                    </Text>
                    <InactiveLabel isVisible={account.inactive} />
                </View>
            </View>
            <View style={TYPE_CELL_STYLE} className="min-w-0 flex-row items-center gap-2">
                <Text numberOfLines={1} className="shrink text-sm text-foreground">
                    {typeLabel}
                </Text>
                <ChipFor group={group} />
            </View>
            <View className="min-w-0" style={DETAIL_CELL_STYLE}>
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {detailLabel}
                </Text>
            </View>
            <View style={BALANCE_CELL_STYLE} className="items-end">
                <Text className="text-right text-sm font-medium text-foreground">
                    {formatMoney(row.balance, account.currency)}
                </Text>
                <RollupLabel isVisible={row.showsRollup} />
            </View>
            <View style={{ width: TRAILING_CELL_WIDTH }} />
        </Pressable>
    )
}

export function NumberLabel({ number }: { number: string }) {
    if (number === '') return null
    return <Text className="mr-2 text-sm text-muted-foreground">{number}</Text>
}

export function InactiveLabel({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className="ml-2 text-xs italic text-muted-foreground">Inactive</Text>
}

export function RollupLabel({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className="text-xs text-muted-foreground">incl. sub-accounts</Text>
}

function ChipFor({ group }: { group: ReturnType<typeof accountDisplay>['group'] }) {
    if (!group) return null
    return <GroupChip group={group} />
}
