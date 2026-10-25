import { Text, View } from 'react-native'
import { AmountCell, MemoCell } from './AmountCell'
import { AccountPick, type LineActions, LineMenu } from './EntryLineRow'

interface EntryEditableLineCardProps {
    index: number
    lineCount: number
    currency: string
    options: { value: string; label: string }[]
    actions: LineActions
}

export function EntryEditableLineCard({
    index,
    lineCount,
    currency,
    options,
    actions,
}: EntryEditableLineCardProps) {
    return (
        <View
            testID={`entry-line-${index}`}
            className="gap-2 rounded-md border border-border bg-background p-3"
        >
            <View className="flex-row items-start gap-2">
                <View className="min-w-0 flex-1">
                    <AccountPick index={index} options={options} actions={actions} />
                </View>
                <LineMenu index={index} lineCount={lineCount} actions={actions} />
            </View>
            <View className="flex-row gap-2">
                <View className="min-w-0 flex-1">
                    <Text className="text-xs text-muted-foreground">Debit</Text>
                    <AmountCell side="debit" index={index} currency={currency} actions={actions} />
                </View>
                <View className="min-w-0 flex-1">
                    <Text className="text-xs text-muted-foreground">Credit</Text>
                    <AmountCell side="credit" index={index} currency={currency} actions={actions} />
                </View>
            </View>
            <MemoCell index={index} actions={actions} />
        </View>
    )
}
