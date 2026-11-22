import { useWindowHeight } from '@tinycld/core/components/workspace/useBreakpoint'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ArrowDown, ArrowUp } from 'lucide-react-native'
import { type LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native'
import { useListAnchor } from '../../hooks/useListAnchor'
import { useRowWindow } from '../../hooks/useRowWindow'
import { useTableMinWidth } from '../../hooks/useTableMinWidth'
import { balanceText } from '../../lib/money'
import type { RegisterLine, RegisterOrder } from '../../lib/register'
import { REGISTER_TABLE_MIN_WIDTH } from '../../lib/register-layout'
import {
    ACCOUNT_CELL_STYLE,
    AMOUNT_CELL_STYLE,
    BALANCE_CELL_STYLE,
    DATE_CELL_STYLE,
    MEMO_CELL_STYLE,
    REF_CELL_STYLE,
    RegisterRow,
    ROW_CLASS,
    ROW_HEIGHT,
    STATUS_CELL_STYLE,
    TYPE_CELL_STYLE,
} from './RegisterRow'

// The table never scrolls sideways: the register draws it only where the list holds
// REGISTER_TABLE_MIN_WIDTH plus the rows scroller's gutter, and cards below that.

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
    // The entry the table keeps in view and in focus when it mounts (the register store's anchor).
    anchorEntryId: string | null
    onGutter: (gutter: number) => void
}

export function anchorIndexOf(items: TableItem[], anchorEntryId: string | null) {
    if (anchorEntryId === null) return -1
    return items.findIndex(item => item.kind === 'row' && item.row.entryId === anchorEntryId)
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
        <View testID="register-heading-date" style={DATE_CELL_STYLE}>
            <Pressable
                testID="register-sort-date"
                accessibilityRole="button"
                accessibilityLabel="Sort by date"
                onPress={onToggleOrder}
                className="flex-row items-center gap-1"
                style={{ minHeight: ROW_HEIGHT }}
            >
                <HeadingText label="Date" />
                <Icon size={12} color={color} />
            </Pressable>
        </View>
    )
}

function HeadingRow({ order, onToggleOrder }: Pick<RegisterTableProps, 'order' | 'onToggleOrder'>) {
    return (
        <View
            className={`${ROW_CLASS} bg-background web:overflow-y-hidden web:[scrollbar-gutter:stable]`}
        >
            <DateHeading order={order} onToggleOrder={onToggleOrder} />
            <View testID="register-heading-ref" style={REF_CELL_STYLE}>
                <HeadingText label="Ref no." />
            </View>
            <View testID="register-heading-type" style={TYPE_CELL_STYLE}>
                <HeadingText label="Type" />
            </View>
            <View testID="register-heading-memo" style={MEMO_CELL_STYLE}>
                <HeadingText label="Memo" />
            </View>
            <View testID="register-heading-account" style={ACCOUNT_CELL_STYLE}>
                <HeadingText label="Account" />
            </View>
            <View testID="register-heading-status" style={STATUS_CELL_STYLE}>
                <HeadingText label="Status" />
            </View>
            <View testID="register-heading-debit" className="items-end" style={AMOUNT_CELL_STYLE}>
                <HeadingText label="Debit" />
            </View>
            <View testID="register-heading-credit" className="items-end" style={AMOUNT_CELL_STYLE}>
                <HeadingText label="Credit" />
            </View>
            <View
                testID="register-heading-balance"
                className="items-end"
                style={BALANCE_CELL_STYLE}
            >
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

function ItemRow({
    item,
    props,
    itemRef,
}: {
    item: TableItem
    props: RegisterTableProps
    itemRef: ReturnType<typeof useListAnchor>['itemRef']
}) {
    if (item.kind === 'opening') {
        return <OpeningRow balance={props.openingBalance} currency={props.currency} />
    }
    return (
        <RegisterRow
            row={item.row}
            currency={props.currency}
            onOpenEntry={props.onOpenEntry}
            isSelected={item.row.entryId === props.selectedEntryId}
            itemRef={itemRef}
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
    const { rowsScrollRef, onRowsLayout } = useTableMinWidth(
        REGISTER_TABLE_MIN_WIDTH,
        props.onGutter
    )
    const anchor = useListAnchor({
        scrollRef: rowsScrollRef,
        index: anchorIndexOf(items, props.anchorEntryId),
        rowHeight: ROW_HEIGHT,
    })
    const onLayout = (event: LayoutChangeEvent) => {
        onRowsLayout()
        anchor.onViewLayout(event)
    }
    const visible = items.slice(rowWindow.first, rowWindow.last).map((item, offset) => {
        const itemRef = rowWindow.first + offset === anchor.mountIndex ? anchor.itemRef : undefined
        return (
            <ItemRow
                key={item.kind === 'opening' ? 'opening' : item.row.id}
                item={item}
                props={props}
                itemRef={itemRef}
            />
        )
    })
    return (
        <ScrollView
            ref={rowsScrollRef}
            testID="register-rows"
            className="flex-1 web:[scrollbar-gutter:stable]"
            onLayout={onLayout}
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
        <View testID="register-table" className="flex-1">
            <HeadingRow order={props.order} onToggleOrder={props.onToggleOrder} />
            <WindowedRows props={props} />
        </View>
    )
}
