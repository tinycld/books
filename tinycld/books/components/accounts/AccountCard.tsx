import { Pressable, Text, View } from 'react-native'
import type { AccountRow } from '../../hooks/useAccountsQuery'
import type { AccountMenuHandlers } from '../../hooks/useAccountsScreen'
import type { VisibleRow } from '../../lib/account-tree'
import { formatMoney } from '../../lib/money'
import { AccountCaret } from './AccountCaret'
import {
    INDENT_STEP,
    InactiveLabel,
    NumberLabel,
    RollupLabel,
    RowCheckbox,
    RowMenu,
    spaceOpens,
} from './AccountRow'
import { accountDisplay } from './account-display'

interface AccountCardProps {
    row: VisibleRow<AccountRow>
    canToggle: boolean
    onToggle: (id: string) => void
    onOpen: (id: string) => void
    selectedId: string
    canWrite: boolean
    isWorking: boolean
    isSelected: (id: string) => boolean
    onSelect: (id: string) => void
    menu: AccountMenuHandlers
}

export function AccountCard({
    row,
    canToggle,
    onToggle,
    onOpen,
    selectedId,
    canWrite,
    isWorking,
    isSelected,
    onSelect,
    menu,
}: AccountCardProps) {
    const { account, depth } = row.node
    const { typeLabel, detailLabel } = accountDisplay(account.type, account.detail_type)
    const dim = account.inactive ? 'opacity-60' : ''
    const isOpenRow = selectedId !== '' && selectedId === account.id
    const bg = isOpenRow ? 'bg-accent' : 'bg-background'

    return (
        <Pressable
            testID={`account-card-${account.id}`}
            // Not a button: the checkbox, caret and menu inside it are buttons, and buttons cannot nest.
            role="row"
            accessibilityState={{ selected: isOpenRow }}
            onPress={() => onOpen(account.id)}
            {...spaceOpens(account.id, onOpen)}
            className={`flex-row items-center border-b border-border ${bg} px-4 ${dim}`}
            style={{ minHeight: 64 }}
        >
            <RowCheckbox
                isVisible={canWrite}
                id={account.id}
                name={account.name}
                isSelected={isSelected}
                onSelect={onSelect}
            />
            <View
                className="min-w-0 flex-1 flex-row items-center"
                style={{ paddingLeft: (depth - 1) * INDENT_STEP }}
            >
                <AccountCaret
                    id={account.id}
                    hasChildren={row.hasChildren && canToggle}
                    isCollapsed={row.isCollapsed}
                    onToggle={onToggle}
                />
                <View className="min-w-0 flex-1 gap-0.5 py-2">
                    <View className="flex-row items-center">
                        <NumberLabel number={account.number} />
                        <Text
                            numberOfLines={1}
                            className="shrink text-sm font-medium text-foreground"
                        >
                            {account.name}
                        </Text>
                        <InactiveLabel isVisible={account.inactive} />
                    </View>
                    <View className="flex-row items-center gap-2">
                        <View className="min-w-0 flex-1 flex-row items-center gap-1">
                            <Text
                                numberOfLines={1}
                                className="shrink-0 text-xs text-muted-foreground"
                            >
                                {typeLabel}
                            </Text>
                            <Text className="text-xs text-muted-foreground">·</Text>
                            <Text
                                numberOfLines={1}
                                className="shrink text-xs text-muted-foreground"
                            >
                                {detailLabel}
                            </Text>
                        </View>
                        <View className="items-end">
                            <Text className="text-right text-sm font-medium text-foreground">
                                {formatMoney(row.balance, account.currency)}
                            </Text>
                            <RollupLabel isVisible={row.showsRollup} />
                        </View>
                    </View>
                </View>
            </View>
            <RowMenu isVisible={canWrite} row={account} menu={menu} isDisabled={isWorking} />
        </Pressable>
    )
}
