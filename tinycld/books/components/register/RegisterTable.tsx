import { useWindowHeight } from '@tinycld/core/components/workspace/useBreakpoint'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ArrowDown, ArrowUp } from 'lucide-react-native'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRowWindow } from '../../hooks/useRowWindow'
import type { RegisterLine, RegisterOrder } from '../../lib/register'
import {
    ACCOUNT_CELL_STYLE,
    AMOUNT_CELL_STYLE,
    BALANCE_CELL_STYLE,
    balanceText,
    DATE_CELL_STYLE,
    MEMO_CELL_STYLE,
    REF_CELL_STYLE,
    RegisterRow,
    ROW_CLASS,
    ROW_HEIGHT,
    TYPE_CELL_STYLE,
} from './RegisterRow'

// Below this width the table scrolls sideways; no column collapses to blank.
const TABLE_MIN_WIDTH = 900

// The `web:` utilities reserve the vertical scrollbar's width in the heading row too, so the
// headings stay over their columns when the scrollbar takes layout space. Native gets nothing.

interface RegisterTableProps {
    rows: RegisterLine[]
    showOpeningRow: boolean
    openingBalance: number | null
    currency: string
    order: RegisterOrder
    onToggleOrder: () => void
    onOpenEntry: (entryId: string) => void
    selectedEntryId: string | null
}

export type TableItem = { kind: 'opening' } | { kind: 'row'; row: RegisterLine }

// The opening row is chronologically first: last when newest is on top.
export function tableItems(rows: RegisterLine[], showOpeningRow: boolean, order: RegisterOrder) {
    const items: TableItem[] = rows.map(row => ({ kind: 'row', row }))
    if (!showOpeningRow) return items
    if (order === 'newest') items.push({ kind: 'opening' })
    else items.unshift({ kind: 'opening' })
    return items
}

function HeadingText({ label }: { label: string }) {
    return <Text className="text-xs font-semibold uppercase text-muted-foreground">{label}</Text>
}

function DateHeading({
    order,
    onToggleOrder,
}: Pick<RegisterTableProps, 'order' | 'onToggleOrder'>) {
    const color = useThemeColor('foreground')
    const Icon = order === 'newest' ? ArrowDown : ArrowUp
    return (
        <Pressable
            testID="register-sort-date"
            accessibilityRole="button"
            accessibilityLabel="Sort by date"
            onPress={onToggleOrder}
            className="flex-row items-center gap-1"
            style={[DATE_CELL_STYLE, { minHeight: ROW_HEIGHT }]}
        >
            <HeadingText label="Date" />
            <Icon size={12} color={color} />
        </Pressable>
    )
}

function HeadingRow({ order, onToggleOrder }: Pick<RegisterTableProps, 'order' | 'onToggleOrder'>) {
    return (
        <View
            className={`${ROW_CLASS} bg-background web:overflow-y-hidden web:[scrollbar-gutter:stable]`}
        >
            <DateHeading order={order} onToggleOrder={onToggleOrder} />
            <View style={REF_CELL_STYLE}>
                <HeadingText label="Ref no." />
            </View>
            <View style={TYPE_CELL_STYLE}>
                <HeadingText label="Type" />
            </View>
            <View style={MEMO_CELL_STYLE}>
                <HeadingText label="Memo" />
            </View>
            <View style={ACCOUNT_CELL_STYLE}>
                <HeadingText label="Account" />
            </View>
            <View className="items-end" style={AMOUNT_CELL_STYLE}>
                <HeadingText label="Debit" />
            </View>
            <View className="items-end" style={AMOUNT_CELL_STYLE}>
                <HeadingText label="Credit" />
            </View>
            <View className="items-end" style={BALANCE_CELL_STYLE}>
                <HeadingText label="Balance" />
            </View>
        </View>
    )
}

function OpeningRow({ balance, currency }: { balance: number | null; currency: string }) {
    return (
        <View
            testID="register-opening-row"
            className={`${ROW_CLASS} bg-background`}
            style={{ height: ROW_HEIGHT }}
        >
            <View className="min-w-0 flex-1">
                <Text className="text-sm italic text-muted-foreground">Opening balance</Text>
            </View>
            <View className="items-end" style={BALANCE_CELL_STYLE}>
                <Text className="text-right text-sm font-medium text-foreground">
                    {balanceText(balance, currency)}
                </Text>
            </View>
        </View>
    )
}

function ItemRow({ item, props }: { item: TableItem; props: RegisterTableProps }) {
    if (item.kind === 'opening') {
        return <OpeningRow balance={props.openingBalance} currency={props.currency} />
    }
    return (
        <RegisterRow
            row={item.row}
            currency={props.currency}
            onOpenEntry={props.onOpenEntry}
            isSelected={item.row.entryId === props.selectedEntryId}
        />
    )
}

function WindowedRows({ props }: { props: RegisterTableProps }) {
    const items = tableItems(props.rows, props.showOpeningRow, props.order)
    const windowHeight = useWindowHeight()
    const rowWindow = useRowWindow({
        total: items.length,
        rowHeight: ROW_HEIGHT,
        viewHeight: windowHeight,
    })
    const visible = items
        .slice(rowWindow.first, rowWindow.last)
        .map(item => (
            <ItemRow
                key={item.kind === 'opening' ? 'opening' : item.row.id}
                item={item}
                props={props}
            />
        ))
    return (
        <ScrollView
            className="flex-1 web:[scrollbar-gutter:stable]"
            onScroll={rowWindow.onScroll}
            scrollEventThrottle={16}
        >
            <View style={{ height: rowWindow.topSpace }} />
            {visible}
            <View style={{ height: rowWindow.bottomSpace }} />
        </ScrollView>
    )
}

export function RegisterTable(props: RegisterTableProps) {
    return (
        <ScrollView
            horizontal
            testID="register-table"
            className="flex-1"
            contentContainerStyle={{ width: '100%', minWidth: TABLE_MIN_WIDTH }}
        >
            <View className="flex-1">
                <HeadingRow order={props.order} onToggleOrder={props.onToggleOrder} />
                <WindowedRows props={props} />
            </View>
        </ScrollView>
    )
}
