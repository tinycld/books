import { type ComponentRef, memo } from 'react'
import { type Pressable, ScrollView, Text, View } from 'react-native'
import { useFocusOnOpen } from '../../../hooks/useFocusOnOpen'
import { useRowWindow } from '../../../hooks/useRowWindow'
import type { ChoiceRow, SelectBoxState } from '../../../lib/bank-import-view'
import { ListHeaderCell } from '../../ListTable'
import { SelectBox } from '../../SelectBox'

const WIDE_ROW_HEIGHT = 52
const PHONE_ROW_HEIGHT = 64
const LIST_HEIGHT = 480
const SELECT_ALL_LABEL = 'Select all ready transactions'

// One style per column, shared by the header and every row so they line up.
const COLUMNS = {
    box: { width: 44, flexShrink: 0 },
    date: { width: 128, flexShrink: 0 },
    description: { flex: 1, minWidth: 0 },
    amount: { width: 160, flexShrink: 0 },
}

const AMOUNT_HEADER_STYLE = { ...COLUMNS.amount, paddingRight: 0 }
const WIDE_ROW_STYLE = { height: WIDE_ROW_HEIGHT }
const PHONE_ROW_STYLE = { height: PHONE_ROW_HEIGHT }
const LIST_STYLE = { height: LIST_HEIGHT }
const HEAD_STYLE = { minHeight: 44 }

function rowTone(row: ChoiceRow): string {
    return row.kind === 'already' ? 'text-muted-foreground' : 'text-foreground'
}

function amountTone(row: ChoiceRow): string {
    return row.kind === 'ready' ? 'text-foreground' : 'text-muted-foreground'
}

function MemoLine({ memo }: { memo: string }) {
    if (!memo) return null
    return (
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {memo}
        </Text>
    )
}

function DescriptionCell({ row }: { row: ChoiceRow }) {
    if (row.kind === 'error') {
        return (
            <Text className="text-sm text-danger" numberOfLines={2}>
                {row.message}
            </Text>
        )
    }
    const descriptionClass = `text-sm ${rowTone(row)}`
    return (
        <>
            <Text className={descriptionClass} numberOfLines={1}>
                {row.description}
            </Text>
            <MemoLine memo={row.memo} />
        </>
    )
}

type RowProps = {
    row: ChoiceRow
    isBusy: boolean
    position: number
    total: number
    onToggle: (line: number) => void
}

function RowBox({ row, isBusy, onToggle }: Pick<RowProps, 'row' | 'isBusy' | 'onToggle'>) {
    const state = row.isChosen ? 'checked' : 'empty'
    const isDisabled = row.kind !== 'ready' || isBusy
    const onPress = () => onToggle(row.line)
    return (
        <SelectBox
            testID={`bank-import-check-${row.line}`}
            label={`Import line ${row.line}`}
            state={state}
            isDisabled={isDisabled}
            onPress={onPress}
        />
    )
}

const WideChoiceRow = memo(function WideChoiceRow({
    row,
    isBusy,
    position,
    total,
    onToggle,
}: RowProps) {
    const dateClass = `pr-3 text-sm tabular-nums ${rowTone(row)}`
    const amountClass = `text-right text-sm tabular-nums ${amountTone(row)}`
    return (
        <View
            testID={`bank-import-line-${row.line}`}
            role="listitem"
            aria-posinset={position}
            aria-setsize={total}
            className="flex-row items-center border-b border-border pr-3"
            style={WIDE_ROW_STYLE}
        >
            <View style={COLUMNS.box}>
                <RowBox row={row} isBusy={isBusy} onToggle={onToggle} />
            </View>
            <Text className={dateClass} style={COLUMNS.date} numberOfLines={1}>
                {row.dateText}
            </Text>
            <View className="pr-3" style={COLUMNS.description}>
                <DescriptionCell row={row} />
            </View>
            <Text className={amountClass} style={COLUMNS.amount} numberOfLines={1}>
                {row.amountText}
            </Text>
        </View>
    )
})

function PhoneRowText({ row }: { row: ChoiceRow }) {
    if (row.kind === 'error') {
        return (
            <Text className="text-sm text-danger" numberOfLines={2}>
                {row.message}
            </Text>
        )
    }
    const detail = `${row.dateText} · Line ${row.line}`
    const descriptionClass = `text-sm ${rowTone(row)}`
    return (
        <>
            <Text className={descriptionClass} numberOfLines={1}>
                {row.description}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {detail}
            </Text>
        </>
    )
}

const PhoneChoiceRow = memo(function PhoneChoiceRow({
    row,
    isBusy,
    position,
    total,
    onToggle,
}: RowProps) {
    const amountSize = row.kind === 'already' ? 'text-xs' : 'text-sm'
    const amountClass = `text-right tabular-nums ${amountSize} ${amountTone(row)}`
    return (
        <View
            testID={`bank-import-line-${row.line}`}
            role="listitem"
            aria-posinset={position}
            aria-setsize={total}
            className="flex-row items-center gap-1 border-b border-border pr-3"
            style={PHONE_ROW_STYLE}
        >
            <RowBox row={row} isBusy={isBusy} onToggle={onToggle} />
            <View className="min-w-0 flex-1">
                <PhoneRowText row={row} />
            </View>
            <Text className={amountClass} numberOfLines={1}>
                {row.amountText}
            </Text>
        </View>
    )
})

interface ListHeadProps {
    isWide: boolean
    isBusy: boolean
    selectState: SelectBoxState
    onToggleAll: () => void
}

// On a wide web screen the select-all box has focus when the Choose step opens (this list
// mounts with the step), so A, Space and ⌘↵ work at once.
function ListHead({ isWide, isBusy, selectState, onToggleAll }: ListHeadProps) {
    const focus = useFocusOnOpen<ComponentRef<typeof Pressable>>(isWide)
    const box = (
        <SelectBox
            ref={focus.ref}
            testID="bank-import-select-all"
            label={SELECT_ALL_LABEL}
            state={selectState}
            isDisabled={isBusy}
            onPress={onToggleAll}
        />
    )
    if (!isWide) {
        return (
            <View className="flex-row items-center border-b border-border" style={HEAD_STYLE}>
                {box}
                <Text className="text-sm font-medium text-foreground">Select all</Text>
            </View>
        )
    }
    return (
        <View className="flex-row items-center border-b border-border pr-3" style={HEAD_STYLE}>
            <View style={COLUMNS.box}>{box}</View>
            <ListHeaderCell label="Date" style={COLUMNS.date} />
            <ListHeaderCell label="Description" style={COLUMNS.description} />
            <ListHeaderCell label="Amount" style={AMOUNT_HEADER_STYLE} align="right" />
        </View>
    )
}

interface BankImportRowListProps {
    rows: ChoiceRow[]
    isWide: boolean
    isBusy: boolean
    selectState: SelectBoxState
    onToggle: (line: number) => void
    onToggleAll: () => void
}

// Fixed row heights and a window of mounted rows, so a file of 10,000 rows scrolls.
export function BankImportRowList({
    rows,
    isWide,
    isBusy,
    selectState,
    onToggle,
    onToggleAll,
}: BankImportRowListProps) {
    const rowHeight = isWide ? WIDE_ROW_HEIGHT : PHONE_ROW_HEIGHT
    const total = rows.length
    const visible = useRowWindow({ total, rowHeight, viewHeight: LIST_HEIGHT })
    const Row = isWide ? WideChoiceRow : PhoneChoiceRow
    const items = rows
        .slice(visible.first, visible.last)
        .map((row, i) => (
            <Row
                key={row.line}
                row={row}
                isBusy={isBusy}
                position={visible.first + i + 1}
                total={total}
                onToggle={onToggle}
            />
        ))
    const listLabel = total === 1 ? '1 transaction' : `${total} transactions`
    const topSpace = { height: visible.topSpace }
    const bottomSpace = { height: visible.bottomSpace }
    return (
        <View className="rounded-lg border border-border">
            <ListHead
                isWide={isWide}
                isBusy={isBusy}
                selectState={selectState}
                onToggleAll={onToggleAll}
            />
            <ScrollView
                testID="bank-import-list"
                style={LIST_STYLE}
                accessibilityRole="list"
                accessibilityLabel={listLabel}
                nestedScrollEnabled
                scrollEventThrottle={16}
                onScroll={visible.onScroll}
            >
                <View style={topSpace} />
                {items}
                <View style={bottomSpace} />
            </ScrollView>
        </View>
    )
}
