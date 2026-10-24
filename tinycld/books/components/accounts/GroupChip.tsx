import { Text, View } from 'react-native'
import type { AccountGroup } from '../../lib/account-types'

const GROUP_LABELS: Record<AccountGroup, string> = {
    asset: 'Asset',
    liability: 'Liability',
    equity: 'Equity',
    income: 'Income',
    expense: 'Expense',
}

export function GroupChip({ group }: { group: AccountGroup }) {
    return (
        <View className="rounded-full bg-secondary px-2 py-0.5">
            <Text className="text-xs font-medium text-secondary-foreground">
                {GROUP_LABELS[group]}
            </Text>
        </View>
    )
}
