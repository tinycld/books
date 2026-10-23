import { Pressable, Text, View } from 'react-native'
import type { AccountRow } from '../../hooks/useAccountsQuery'
import type { VisibleRow } from '../../lib/account-tree'
import { formatMoney } from '../../lib/money'
import { AccountCaret } from './AccountCaret'
import { INDENT_STEP, InactiveLabel, NumberLabel, RollupLabel } from './AccountRow'
import { accountDisplay } from './account-display'

interface AccountCardProps {
    row: VisibleRow<AccountRow>
    canToggle: boolean
    onToggle: (id: string) => void
    onOpen: (id: string) => void
}

export function AccountCard({ row, canToggle, onToggle, onOpen }: AccountCardProps) {
    const { account, depth } = row.node
    const { typeLabel, detailLabel } = accountDisplay(account.type, account.detail_type)
    const dim = account.inactive ? 'opacity-60' : ''

    return (
        <Pressable
            testID={`account-card-${account.id}`}
            accessibilityRole="button"
            onPress={() => onOpen(account.id)}
            className={`flex-row items-center border-b border-border bg-background px-4 ${dim}`}
            style={{ minHeight: 64 }}
        >
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
                    <View className="flex-row items-center gap-1">
                        <Text numberOfLines={1} className="shrink-0 text-xs text-muted-foreground">
                            {typeLabel}
                        </Text>
                        <Text className="text-xs text-muted-foreground">·</Text>
                        <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">
                            {detailLabel}
                        </Text>
                    </View>
                </View>
            </View>
            <View className="items-end pl-2">
                <Text className="text-right text-sm font-medium text-foreground">
                    {formatMoney(row.balance, account.currency)}
                </Text>
                <RollupLabel isVisible={row.showsRollup} />
            </View>
        </Pressable>
    )
}
