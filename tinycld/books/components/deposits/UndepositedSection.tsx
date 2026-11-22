import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { Text, View } from 'react-native'
import type { DepositForm } from '../../hooks/useDepositForm'
import {
    type DepositFormItem,
    depositFormItems,
    itemAmountText,
    itemsCountText,
    type UndepositedListState,
    undepositedListState,
} from '../../lib/deposit'
import {
    DEPOSIT_CARD_INSET,
    DEPOSIT_ROW_PADDING,
    depositItemsMinWidth,
} from '../../lib/deposit-columns'
import {
    DEPOSIT_FORM_DESCRIPTIONS,
    DEPOSIT_FORM_KEYS,
    DEPOSIT_SHORTCUT_GROUP,
} from '../../lib/deposit-shortcuts'
import { DEPOSIT_MESSAGES } from '../../lib/deposit-texts'
import { ListBanner } from '../ListBanner'
import { TotalLine } from '../payments/PaymentTotals'
import type { SelectBoxState } from '../SelectBox'
import { UndepositedCards } from './UndepositedCards'
import { type ItemListActions, UndepositedGrid } from './UndepositedGrid'

const SKELETON_ROWS = [0, 1, 2]

function ListSkeleton() {
    const bars = SKELETON_ROWS.map(index => (
        <View key={index} className="flex-row items-center gap-3 border-b border-border py-3">
            <View className="h-5 w-5 rounded bg-muted" />
            <View className="h-4 flex-1 rounded bg-muted" />
            <View className="h-4 w-24 rounded bg-muted" />
            <View className="h-4 w-24 rounded bg-muted" />
        </View>
    ))
    return (
        <View testID="deposit-items-loading" accessibilityLabel="Loading undeposited items">
            {bars}
        </View>
    )
}

interface ListBodyProps {
    listState: UndepositedListState
    rows: DepositFormItem[]
    isCards: boolean
    depositForm: DepositForm
    actions: ItemListActions
    onRetry: () => void
}

function ListBody({ listState, rows, isCards, depositForm, actions, onRetry }: ListBodyProps) {
    const tickAll: SelectBoxState = depositForm.tickAllState
    if (listState === 'loading') return <ListSkeleton />
    if (listState === 'error') {
        return (
            <View testID="deposit-items-error">
                <ListBanner
                    testIdPrefix="deposit"
                    message={DEPOSIT_MESSAGES.listLoadFailed}
                    onRetry={onRetry}
                    isFlush
                />
            </View>
        )
    }
    if (listState === 'empty') {
        return (
            <Text testID="deposit-items-empty" className="py-6 text-sm text-muted-foreground">
                {DEPOSIT_MESSAGES.noItems}
            </Text>
        )
    }
    if (isCards) return <UndepositedCards rows={rows} tickAll={tickAll} actions={actions} />
    return (
        <UndepositedGrid
            rows={rows}
            tickAll={tickAll}
            sort={depositForm.sort}
            onSort={depositForm.onSort}
            actions={actions}
        />
    )
}

interface SelectionLineProps {
    isVisible: boolean
    // The list draws cards, so the Selected value ends where a card's amount ends.
    isCards: boolean
    depositForm: DepositForm
    currency: string
    // Clear selection: disabled while a save runs, or while its key is not offered.
    isClearDisabled: boolean
    scopeOwner: ScopeOwner
}

const CLEAR_SHORTCUT = {
    keys: DEPOSIT_FORM_KEYS.clearSelection,
    scope: 'compose',
    allowInInputs: true,
    group: DEPOSIT_SHORTCUT_GROUP,
} as const

// The Selected value's right edge: the grid's Amount cell ends at the row padding, a
// card's amount at the card's padding and border.
const GRID_SELECTED = { marginLeft: 'auto', paddingRight: DEPOSIT_ROW_PADDING } as const
const CARD_SELECTED = { marginLeft: 'auto', paddingRight: DEPOSIT_CARD_INSET } as const

// "Clear selection" (⌥⌫, a ShortcutButton in the screen's scope) at the left; "Selected 2
// of 3 · $1,500.00" right-aligned under the Amount column. `marginLeft: 'auto'` keeps it at
// the right when the line wraps on a narrow screen.
function SelectionLine({
    isVisible,
    isCards,
    depositForm,
    currency,
    isClearDisabled,
    scopeOwner,
}: SelectionLineProps) {
    if (!isVisible) return null
    const amount = itemAmountText(depositForm.totals.itemsTotal, currency)
    const detail = `${depositForm.tickedCount} of ${depositForm.listedCount}`
    const selectedStyle = isCards ? CARD_SELECTED : GRID_SELECTED
    return (
        <View className="flex-row flex-wrap items-center gap-x-4">
            <ShortcutButton
                label={DEPOSIT_FORM_DESCRIPTIONS.clearSelection}
                shortcut={CLEAR_SHORTCUT}
                onPress={depositForm.onClear}
                variant="link"
                size="sm"
                className="min-h-11 px-0"
                isDisabled={isClearDisabled}
                testID="deposit-clear-selection"
                scopeOwner={scopeOwner}
            />
            <View style={selectedStyle}>
                <TotalLine
                    label="Selected"
                    amount={amount}
                    detail={detail}
                    isStrong={false}
                    testID="deposit-selected"
                />
            </View>
        </View>
    )
}

interface UndepositedSectionProps {
    depositForm: DepositForm
    // The list's read (useUndepositedItems).
    isLoading: boolean
    isError: boolean
    onRetry: () => void
    currency: string
    actions: ItemListActions
    isClearDisabled: boolean
    scopeOwner: ScopeOwner
}

/**
 * The Undeposited funds section (bank deposit spec §3.4): its heading and the count of the
 * listed items, then the branch `undepositedListState` names: the three-row skeleton, the
 * Books error banner with Retry, the empty text, or the list. The list is the grid at or
 * above its least width (`depositItemsMinWidth`, from the section's own width) and cards
 * below it. Under it, Clear selection and the Selected total.
 */
export function UndepositedSection({
    depositForm,
    isLoading,
    isError,
    onRetry,
    currency,
    actions,
    isClearDisabled,
    scopeOwner,
}: UndepositedSectionProps) {
    const { width, onLayout } = useContainerWidth()
    const isCards = width > 0 && width < depositItemsMinWidth
    const listed = depositForm.rows
    const listState = undepositedListState({ isLoading, isError, count: listed.length })
    const isList = listState === 'list'
    const count = isList ? itemsCountText(listed, currency) : ''
    const rows = depositFormItems(listed, currency)
    return (
        <View testID="deposit-undeposited" className="gap-2" onLayout={onLayout}>
            <View className="flex-row flex-wrap items-baseline justify-between gap-x-4">
                <Text className="text-sm font-semibold text-foreground">Undeposited funds</Text>
                <Text testID="deposit-items-count" className="text-xs text-muted-foreground">
                    {count}
                </Text>
            </View>
            <ListBody
                listState={listState}
                rows={rows}
                isCards={isCards}
                depositForm={depositForm}
                actions={actions}
                onRetry={onRetry}
            />
            <SelectionLine
                isVisible={isList}
                isCards={isCards}
                depositForm={depositForm}
                currency={currency}
                isClearDisabled={isClearDisabled}
                scopeOwner={scopeOwner}
            />
        </View>
    )
}
