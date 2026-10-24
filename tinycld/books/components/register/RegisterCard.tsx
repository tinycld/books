import { Pressable, Text, View } from 'react-native'
import { formatMoney } from '../../lib/money'
import { balanceTone, type RegisterLine } from '../../lib/register'
import { formatDay } from '../../lib/register-range'
import { balanceText, useAccountName } from './RegisterRow'

export const CARD_HEIGHT = 96

interface RegisterCardProps {
    row: RegisterLine
    currency: string
    onOpenEntry: (entryId: string) => void
    isSelected: boolean
}

export function RegisterCard({ row, currency, onOpenEntry, isSelected }: RegisterCardProps) {
    const bg = isSelected ? 'bg-accent' : 'bg-background'
    const isDebit = row.debit !== 0
    const accountName = useAccountName(row.otherAccountId)
    const detailLine = [
        row.isSplit ? '-Split-' : accountName,
        row.typeLabel,
        row.isVoid ? 'Void' : '',
    ]
        .filter(Boolean)
        .join(' · ')
    return (
        <Pressable
            testID={`register-card-${row.id}`}
            accessibilityRole="button"
            onPress={() => onOpenEntry(row.entryId)}
            className={`flex-row gap-3 overflow-hidden border-b border-border px-4 py-2 ${bg}`}
            style={{ height: CARD_HEIGHT }}
        >
            <View className="min-w-0 flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                    <Text className="text-xs text-muted-foreground">{formatDay(row.date)}</Text>
                    <Text
                        testID={`register-ref-${row.id}`}
                        numberOfLines={1}
                        className="shrink text-xs text-muted-foreground"
                    >
                        {row.number}
                    </Text>
                </View>
                <Text numberOfLines={2} className="text-sm font-medium text-foreground">
                    {row.memo}
                </Text>
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {detailLine}
                </Text>
            </View>
            <View className="shrink-0 items-end gap-0.5">
                <Text className="text-right text-sm font-medium text-foreground">
                    {formatMoney(isDebit ? row.debit : row.credit, currency)}
                </Text>
                <Text className="text-right text-xs text-muted-foreground">
                    {isDebit ? 'Debit' : 'Credit'}
                </Text>
                <Text className={`text-right text-xs ${balanceTone(row.balance)}`}>
                    {balanceText(row.balance, currency)}
                </Text>
            </View>
        </Pressable>
    )
}
