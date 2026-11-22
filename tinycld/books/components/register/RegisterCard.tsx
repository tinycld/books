import type { Ref } from 'react'
import { Pressable, Text, View, type ViewInstance } from 'react-native'
import { balanceText, balanceTone, formatMoney } from '../../lib/money'
import { lineStatusTone } from '../../lib/reconcile-status'
import type { RegisterLine } from '../../lib/register'
import { formatDay } from '../../lib/register-range'
import { useAccountName } from './RegisterRow'

export const CARD_HEIGHT = 96

// The Status word after the Ref no., in the tones of the table's Status cell.
function StatusWord({ row }: { row: RegisterLine }) {
    if (row.reconcileWord === '') return null
    const tone = lineStatusTone(row.reconcileWord)
    return (
        <Text
            testID={`register-cell-status-${row.id}`}
            numberOfLines={1}
            className={`shrink-0 text-xs ${tone}`}
        >
            {row.reconcileWord}
        </Text>
    )
}

interface RegisterCardProps {
    row: RegisterLine
    currency: string
    onOpenEntry: (entryId: string) => void
    isSelected: boolean
    itemRef?: Ref<ViewInstance>
}

export function RegisterCard({
    row,
    currency,
    onOpenEntry,
    isSelected,
    itemRef,
}: RegisterCardProps) {
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
    const onPress = () => onOpenEntry(row.entryId)
    return (
        <Pressable
            ref={itemRef}
            testID={`register-card-${row.id}`}
            accessibilityRole="button"
            onPress={onPress}
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
                    <StatusWord row={row} />
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
