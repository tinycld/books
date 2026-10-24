import { Text, View } from 'react-native'
import { amountText } from '../../lib/money'
import type { EntryLinesProps } from './EntryLineTable'

type EntryLineCardProps = {
    line: EntryLinesProps['lines'][number]
    index: number
    accountNames: EntryLinesProps['accountNames']
    currency: string
}

function SideMarker({ isVisible, label }: { isVisible: boolean; label: string }) {
    if (!isVisible) return null
    return <Text className="text-xs text-muted-foreground">{label}</Text>
}

function MemoLine({ memo }: { memo: string }) {
    if (memo === '') return null
    return (
        <Text numberOfLines={2} className="text-xs text-muted-foreground">
            {memo}
        </Text>
    )
}

export function EntryLineCard({ line, index, accountNames, currency }: EntryLineCardProps) {
    return (
        <View
            testID={`entry-line-${index}`}
            className="gap-0.5 border-b border-border px-4 py-2"
            style={{ minHeight: 44 }}
        >
            <View className="flex-row items-center justify-between gap-3">
                <Text
                    testID={`entry-line-account-${index}`}
                    numberOfLines={2}
                    className="min-w-0 flex-1 text-sm text-foreground"
                >
                    {accountNames.get(line.account) ?? ''}
                </Text>
                <View className="shrink-0 flex-row items-baseline gap-1">
                    <Text
                        testID={`entry-line-debit-${index}`}
                        className="text-sm font-medium text-foreground"
                    >
                        {amountText(line.debit, currency)}
                    </Text>
                    <Text
                        testID={`entry-line-credit-${index}`}
                        className="text-sm font-medium text-foreground"
                    >
                        {amountText(line.credit, currency)}
                    </Text>
                    <SideMarker isVisible={line.debit !== 0} label="Dr" />
                    <SideMarker isVisible={line.credit !== 0} label="Cr" />
                </View>
            </View>
            <MemoLine memo={line.memo} />
        </View>
    )
}
