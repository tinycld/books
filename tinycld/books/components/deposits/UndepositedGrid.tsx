import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ArrowDown, ArrowUp } from 'lucide-react-native'
import { type GestureResponderEvent, Pressable, Text, View } from 'react-native'
import type { DepositFormItem, ItemSortColumn, SortDirection } from '../../lib/deposit'
import { DEPOSIT_CELL_GAP, DEPOSIT_ITEM_COLUMNS } from '../../lib/deposit-columns'
import { SelectBox, type SelectBoxState } from '../SelectBox'

const TAP = { minHeight: 44 }
const LINK_TAP = { minHeight: 44, maxWidth: '100%' } as const
const HEAD = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const MONEY_CELL = 'text-right text-sm tabular-nums'
const ERROR_INDENT = { paddingLeft: DEPOSIT_ITEM_COLUMNS.tick.width + DEPOSIT_CELL_GAP }
const ARROW_SIZE = 12

// What a row and a card do on a press: tick the row, or open its Transaction link.
export interface ItemListActions {
    onToggle: (line: string) => void
    onOpenLink: (href: string) => void
    onTickAll: () => void
    // A save runs: the ticks wait for it.
    isDisabled: boolean
}

export function RowError({ message, testID }: { message: string; testID: string }) {
    if (message === '') return null
    return (
        <Text testID={testID} role="alert" className="text-xs text-danger">
            {message}
        </Text>
    )
}

export function MutedLine({ text }: { text: string }) {
    if (text === '') return null
    return (
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {text}
        </Text>
    )
}

// The Transaction link: a press target only (the row's one Tab stop is its tick box). It
// stops its press, so the row under it does not tick too.
export function ItemLink({
    text,
    href,
    testID,
    onOpen,
}: {
    text: string
    href: string
    testID: string
    onOpen: (href: string) => void
}) {
    const handlePress = (event: GestureResponderEvent) => {
        event.stopPropagation()
        onOpen(href)
    }
    return (
        <Pressable
            testID={testID}
            accessibilityRole="link"
            tabIndex={-1}
            onPress={handlePress}
            className="justify-center self-start"
            style={LINK_TAP}
        >
            <Text className="text-sm text-primary underline" numberOfLines={1}>
                {text}
            </Text>
        </Pressable>
    )
}

function SortArrow({ isVisible, direction }: { isVisible: boolean; direction: SortDirection }) {
    const muted = useThemeColor('muted-foreground')
    if (!isVisible) return null
    const Arrow = direction === 'desc' ? ArrowDown : ArrowUp
    return <Arrow size={ARROW_SIZE} color={muted} />
}

interface SortHeaderProps {
    label: string
    column: ItemSortColumn
    style: object
    sort: { column: ItemSortColumn; direction: SortDirection }
    onSort: (column: ItemSortColumn) => void
    testID: string
}

// A header that sorts by its column; pressed again it reverses. An arrow marks the sorted
// one. A press target only: no Tab stop (lesson 29).
function SortHeader({ label, column, style, sort, onSort, testID }: SortHeaderProps) {
    const handlePress = () => onSort(column)
    const isSorted = sort.column === column
    return (
        <Pressable
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${label}`}
            tabIndex={-1}
            onPress={handlePress}
            className="flex-row items-center gap-1"
            style={[style, TAP]}
        >
            <Text className={HEAD}>{label}</Text>
            <SortArrow isVisible={isSorted} direction={sort.direction} />
        </Pressable>
    )
}

interface GridHeaderProps {
    tickAll: SelectBoxState
    sort: SortHeaderProps['sort']
    onSort: SortHeaderProps['onSort']
    actions: ItemListActions
}

function GridHeader({ tickAll, sort, onSort, actions }: GridHeaderProps) {
    const col = DEPOSIT_ITEM_COLUMNS
    return (
        <View className="flex-row items-center gap-3 border-b border-border px-2 py-1">
            <View style={col.tick}>
                <SelectBox
                    state={tickAll}
                    label="Select all items"
                    testID="deposit-tick-all"
                    isDisabled={actions.isDisabled}
                    onPress={actions.onTickAll}
                    tabIndex={-1}
                />
            </View>
            <SortHeader
                label="Received from"
                column="party"
                style={col.party}
                sort={sort}
                onSort={onSort}
                testID="deposit-sort-party"
            />
            <Text className={HEAD} style={col.transaction}>
                Transaction
            </Text>
            <SortHeader
                label="Date"
                column="date"
                style={col.date}
                sort={sort}
                onSort={onSort}
                testID="deposit-sort-date"
            />
            <Text className={HEAD} style={col.payment}>
                Payment
            </Text>
            <Text className={`${HEAD} text-right`} style={col.amount}>
                Amount
            </Text>
        </View>
    )
}

function GridRow({ row, actions }: { row: DepositFormItem; actions: ItemListActions }) {
    const col = DEPOSIT_ITEM_COLUMNS
    const tint = row.isTicked ? 'bg-accent' : ''
    const state: SelectBoxState = row.isTicked ? 'checked' : 'empty'
    const toggle = () => actions.onToggle(row.line)
    return (
        <Pressable
            testID={`deposit-item-${row.line}`}
            onPress={toggle}
            disabled={actions.isDisabled}
            tabIndex={-1}
            className={`border-b border-border px-2 py-1 ${tint}`}
        >
            <View className="flex-row items-start gap-3">
                <View style={col.tick}>
                    <SelectBox
                        state={state}
                        label={`Deposit ${row.label}`}
                        testID={`deposit-item-tick-${row.line}`}
                        isDisabled={actions.isDisabled}
                        onPress={toggle}
                    />
                </View>
                <View className="justify-center" style={[col.party, TAP]}>
                    <Text className="text-sm text-foreground" numberOfLines={1}>
                        {row.party}
                    </Text>
                </View>
                <View style={col.transaction}>
                    <ItemLink
                        text={row.label}
                        href={row.href}
                        testID={`deposit-item-link-${row.line}`}
                        onOpen={actions.onOpenLink}
                    />
                    <MutedLine text={row.account} />
                </View>
                <View className="justify-center" style={[col.date, TAP]}>
                    <Text className="text-sm text-foreground" numberOfLines={1}>
                        {row.date}
                    </Text>
                </View>
                <View className="justify-center" style={[col.payment, TAP]}>
                    <Text className="text-sm text-foreground" numberOfLines={1}>
                        {row.payment}
                    </Text>
                </View>
                <View className="justify-center" style={[col.amount, TAP]}>
                    <Text className={`${MONEY_CELL} ${row.tone}`}>{row.amount}</Text>
                </View>
            </View>
            <View style={ERROR_INDENT}>
                <RowError message={row.error} testID={`deposit-item-error-${row.line}`} />
            </View>
        </Pressable>
    )
}

interface UndepositedGridProps {
    rows: DepositFormItem[]
    tickAll: SelectBoxState
    sort: SortHeaderProps['sort']
    onSort: SortHeaderProps['onSort']
    actions: ItemListActions
}

/**
 * The items grid (bank deposit spec §3.4), at or above its least width: the header tick
 * box and the sort headers over one row per item; the whole row is its tick's press
 * target, and its tick box is its one Tab stop. Header and rows read one column constant
 * (lib/deposit-columns.ts), and nothing scrolls sideways.
 */
export function UndepositedGrid({ rows, tickAll, sort, onSort, actions }: UndepositedGridProps) {
    const drawn = rows.map(row => <GridRow key={row.line} row={row} actions={actions} />)
    return (
        <View testID="deposit-items-grid">
            <GridHeader tickAll={tickAll} sort={sort} onSort={onSort} actions={actions} />
            {drawn}
        </View>
    )
}
