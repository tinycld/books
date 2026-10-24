import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { Pressable, Text, View } from 'react-native'
import { formatMoney } from '../../lib/money'
import type { RegisterLine } from '../../lib/register'
import { formatDay } from '../../lib/register-range'

// Header and rows share these. Memo then Account take the free space; the amount columns never
// shrink, so a narrower window scrolls the table sideways instead of clipping a figure.
export const DATE_CELL_STYLE = { width: 100, flexShrink: 0 }
export const REF_CELL_STYLE = { width: 80, flexShrink: 0 }
export const TYPE_CELL_STYLE = { width: 150, flexShrink: 1, minWidth: 90 }
export const MEMO_CELL_STYLE = { flexGrow: 3, flexShrink: 1, flexBasis: 0, minWidth: 100 }
export const ACCOUNT_CELL_STYLE = { flexGrow: 2, flexShrink: 1, flexBasis: 0, minWidth: 90 }
export const AMOUNT_CELL_STYLE = { width: 104, flexShrink: 0 }
export const BALANCE_CELL_STYLE = { width: 116, flexShrink: 0 }
export const ROW_HEIGHT = 44

export const ROW_CLASS = 'flex-row items-center gap-2 border-b border-border px-4'

export function balanceText(balance: number | null, currency: string) {
    return balance === null ? 'Too large' : formatMoney(balance, currency)
}

function amountText(cents: number, currency: string) {
    return cents === 0 ? '' : formatMoney(cents, currency)
}

function VoidLabel({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className="ml-2 text-xs text-muted-foreground">Void</Text>
}

function OtherAccountName({ accountId }: { accountId: string | null }) {
    const [accountsCollection] = useStore('books_accounts')
    const { record } = useRecord(accountsCollection, accountId)
    return (
        <Text numberOfLines={1} className="text-sm text-foreground">
            {record?.name ?? ''}
        </Text>
    )
}

function AccountCell({ row }: { row: RegisterLine }) {
    if (row.isSplit) {
        return (
            <Text numberOfLines={1} className="text-sm text-foreground">
                -Split-
            </Text>
        )
    }
    return <OtherAccountName accountId={row.otherAccountId} />
}

interface RegisterRowProps {
    row: RegisterLine
    currency: string
    onOpenEntry: (entryId: string) => void
    isSelected: boolean
}

export function RegisterRow({ row, currency, onOpenEntry, isSelected }: RegisterRowProps) {
    const bg = isSelected ? 'bg-accent' : 'bg-background'
    const cellId = (column: string) => `register-cell-${column}-${row.id}`
    return (
        <Pressable
            testID={`register-row-${row.id}`}
            accessibilityRole="button"
            onPress={() => onOpenEntry(row.entryId)}
            className={`${ROW_CLASS} ${bg}`}
            style={{ minHeight: ROW_HEIGHT }}
        >
            <View testID={cellId('date')} style={DATE_CELL_STYLE}>
                <Text className="text-sm text-foreground">{formatDay(row.date)}</Text>
            </View>
            <View testID={cellId('ref')} style={REF_CELL_STYLE}>
                <Text numberOfLines={1} className="text-sm text-muted-foreground">
                    {row.number}
                </Text>
            </View>
            <View
                testID={cellId('type')}
                className="min-w-0 flex-row items-center"
                style={TYPE_CELL_STYLE}
            >
                <Text numberOfLines={1} className="shrink text-sm text-foreground">
                    {row.typeLabel}
                </Text>
                <VoidLabel isVisible={row.isVoid} />
            </View>
            <View testID={cellId('memo')} className="min-w-0" style={MEMO_CELL_STYLE}>
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {row.memo}
                </Text>
            </View>
            <View testID={cellId('account')} className="min-w-0" style={ACCOUNT_CELL_STYLE}>
                <AccountCell row={row} />
            </View>
            <View testID={cellId('debit')} className="items-end" style={AMOUNT_CELL_STYLE}>
                <Text className="text-right text-sm text-foreground">
                    {amountText(row.debit, currency)}
                </Text>
            </View>
            <View testID={cellId('credit')} className="items-end" style={AMOUNT_CELL_STYLE}>
                <Text className="text-right text-sm text-foreground">
                    {amountText(row.credit, currency)}
                </Text>
            </View>
            <View testID={cellId('balance')} className="items-end" style={BALANCE_CELL_STYLE}>
                <Text className="text-right text-sm font-medium text-foreground">
                    {balanceText(row.balance, currency)}
                </Text>
            </View>
        </Pressable>
    )
}
