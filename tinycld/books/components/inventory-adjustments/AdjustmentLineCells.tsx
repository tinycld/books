import { NumberInput } from '@tinycld/core/ui/form'
import type { FieldErrors } from 'react-hook-form'
import { Platform, Text, type TextInputFocusEvent, View } from 'react-native'
import type { AdjustmentLineActions } from '../../hooks/useAdjustmentForm'
import type { AdjustmentLineStock } from '../../hooks/useAdjustmentLineStock'
import type { LineFocus } from '../../hooks/useLineFocus'
import {
    type AdjustmentLineValues,
    type AdjustmentValues,
    goesBelowZero,
    newFromChange,
    quantityOfText,
    quantityText,
    valueMode,
} from '../../lib/adjustment-values'
import { INVENTORY_TEXTS } from '../../lib/inventory-adjust-fixture'
import { INVENTORY_ITEM_PICKER_TEXTS, INVENTORY_ITEM_TYPES } from '../../lib/product-picker-types'
import { BinPicker } from '../bins/BinPicker'
import { MoneyTextField } from '../MoneyTextField'
import { ProductPicker } from '../products/ProductPicker'
import { RecordRowMenu } from '../RecordRowMenu'

const LINE_ID = 'inventory-adjustment-line'
const NO_ITEM_TEXT = '—'
const UNKNOWN_TEXT = '…'

// The test id of a line's cell: `inventory-adjustment-line-<cell>-<n>`.
export function lineCellId(cell: string, index: number): string {
    return `${LINE_ID}-${cell}-${index}`
}

export function lineRowId(index: number): string {
    return `${LINE_ID}-${index}`
}

/**
 * What a line shows, from its values and the stock of its item: the New quantity text
 * (`newQuantityTextOf`), the Value change's meaning
 * (`valueMode` of the Change), whether the Bin waits (no quantity change), the On hand text
 * and the total under it when they differ, whether the Change takes the bin or the item
 * total below zero,
 * and the line's messages.
 */
export function adjustmentLineView(
    line: AdjustmentLineValues,
    index: number,
    stock: AdjustmentLineStock,
    errors: FieldErrors<AdjustmentValues>
) {
    const parsed = quantityOfText(line.change)
    const change = parsed?.quantity ?? 0
    const isKnown = line.product !== '' && stock.isKnown(line.product)
    const onHand = stock.onHandOf(line.product, line.bin)
    const onHandText = onHandTextOf(line.product, isKnown, onHand.quantity)
    const totalText = isKnown && onHand.total !== onHand.quantity ? quantityText(onHand.total) : ''
    const lineErrors = errors.lines?.[index]
    return {
        number: index + 1,
        newQuantityText: newQuantityTextOf(line, isKnown, onHand.quantity, parsed),
        mode: valueMode(change),
        isBinDisabled: change === 0,
        isKnown,
        onHandText,
        totalText,
        // The bin or the item total: another bin can hold less than 0, so the total can go
        // below zero while the bin stays above it.
        isBelowZero:
            isKnown &&
            parsed !== null &&
            (goesBelowZero(onHand.quantity, change) || goesBelowZero(onHand.total, change)),
        error: lineErrors?.root?.message ?? '',
        itemError: lineErrors?.product?.message ?? '',
        binError: lineErrors?.bin?.message ?? '',
        newQuantityError: lineErrors?.newQuantity?.message ?? '',
        changeError: lineErrors?.change?.message ?? '',
        valueError: lineErrors?.value?.message ?? '',
    }
}

export type AdjustmentLineView = ReturnType<typeof adjustmentLineView>

// The New quantity the cell shows: its text when it has one; else, for a Change typed before
// the item's stock arrived (the change handler then left New quantity empty), On hand +
// Change once the stock is known. The form value stays empty: the save writes the Change.
function newQuantityTextOf(
    line: AdjustmentLineValues,
    isKnown: boolean,
    onHand: number,
    change: ReturnType<typeof quantityOfText>
): string {
    if (line.newQuantity !== '') return line.newQuantity
    if (!isKnown || change === null || line.change.trim() === '') return ''
    return quantityText(newFromChange(onHand, change.quantity))
}

function onHandTextOf(product: string, isKnown: boolean, quantity: number): string {
    if (product === '') return NO_ITEM_TEXT
    return isKnown ? quantityText(quantity) : UNKNOWN_TEXT
}

// The props every cell reads: the line, its index and view, the form's line actions, the
// line focus, and whether a write runs.
export interface LineCellProps {
    line: AdjustmentLineValues
    index: number
    view: AdjustmentLineView
    actions: AdjustmentLineActions
    lineFocus: LineFocus
    isDisabled: boolean
}

// What the table and the cards draw the lines from.
export interface AdjustmentLinesProps {
    // The field array's rows (`key` is react-hook-form's, `id` the line's).
    fields: readonly { key: string; id: string }[]
    lines: readonly AdjustmentLineValues[]
    errors: FieldErrors<AdjustmentValues>
    stock: AdjustmentLineStock
    actions: AdjustmentLineActions
    lineFocus: LineFocus
    hasBins: boolean
    isDisabled: boolean
}

// One line's cell props, or null for a field row whose values have not arrived yet.
export function lineCellPropsOf(props: AdjustmentLinesProps, index: number): LineCellProps | null {
    const line = props.lines[index]
    if (!line) return null
    return {
        line,
        index,
        view: adjustmentLineView(line, index, props.stock, props.errors),
        actions: props.actions,
        lineFocus: props.lineFocus,
        isDisabled: props.isDisabled,
    }
}

export function LineText({
    message,
    testID,
    tone,
}: {
    message: string
    testID: string
    tone: 'danger' | 'warning' | 'muted'
}) {
    if (message === '') return null
    const color = {
        danger: 'text-danger',
        warning: 'text-warning',
        muted: 'text-muted-foreground',
    }[tone]
    return (
        <Text testID={testID} className={`text-xs ${color}`}>
            {message}
        </Text>
    )
}

// The line's own message ("Line n: …", "Enter a quantity change…"), under the row or card.
export function LineError({ view, index }: { view: AdjustmentLineView; index: number }) {
    return <LineText message={view.error} testID={lineCellId('error', index)} tone="danger" />
}

/** Item: Books ProductPicker over the active Inventory items; its error under it. */
export function ItemCell({ line, index, view, actions, lineFocus, isDisabled }: LineCellProps) {
    const onChange = (id: string) => actions.setItem(index, id)
    return (
        <View className="min-w-0 gap-1">
            <ProductPicker
                value={line.product}
                onChange={onChange}
                disabled={isDisabled}
                label={`Line ${view.number} item`}
                testID={lineCellId('item', index)}
                types={INVENTORY_ITEM_TYPES}
                texts={INVENTORY_ITEM_PICKER_TEXTS}
                triggerRef={lineFocus.triggerRef(line.id)}
            />
            <LineText
                message={view.itemError}
                testID={lineCellId('item-error', index)}
                tone="danger"
            />
        </View>
    )
}

/**
 * Bin: the BinPicker, disabled while the line changes no quantity; it keeps its value then,
 * so an item's default bin is there when a Change is typed (the save sends No bin).
 */
export function BinCell({ line, index, view, actions, isDisabled }: LineCellProps) {
    const onChange = (id: string) => actions.setBin(index, id)
    return (
        <View className="min-w-0 gap-1">
            <BinPicker
                value={line.bin}
                onChange={onChange}
                testID={lineCellId('bin', index)}
                disabled={isDisabled || view.isBinDisabled}
                label={`Line ${view.number} bin`}
            />
            <LineText
                message={view.binError}
                testID={lineCellId('bin-error', index)}
                tone="danger"
            />
        </View>
    )
}

/**
 * On hand: the item's quantity in the chosen bin ("—" with no item, "…" while its stock
 * loads), with "of <total>" under it in the muted tone when the total differs. `isInline`
 * (a card) writes "On hand 12 of 40" on one line.
 */
export function OnHandCell({
    view,
    index,
    isInline,
}: {
    view: AdjustmentLineView
    index: number
    isInline: boolean
}) {
    const total = view.totalText === '' ? '' : `of ${view.totalText}`
    const lead = isInline ? 'On hand ' : ''
    const layout = isInline ? 'flex-row flex-wrap items-baseline gap-1' : 'items-end'
    return (
        <View className={`min-w-0 justify-center ${layout}`} style={{ minHeight: 44 }}>
            <Text
                testID={lineCellId('on-hand', index)}
                className="text-sm text-foreground tabular-nums"
            >
                {lead}
                {view.onHandText}
            </Text>
            <LineText message={total} testID={lineCellId('total', index)} tone="muted" />
        </View>
    )
}

// On web the focus event's target is the input element: its whole value is selected, so a
// typed number replaces it (spec §3.3). Selected here, not by `selectTextOnFocus`, which
// react-native-web applies late, so it eats the first keys typed after a Tab.
function selectAll(event: TextInputFocusEvent) {
    if (Platform.OS !== 'web') return
    const field: unknown = event.target
    if (typeof HTMLInputElement !== 'undefined' && field instanceof HTMLInputElement) {
        field.select()
    }
}

interface QuantityInputProps {
    value: string
    onChangeText: (text: string) => void
    testID: string
    accessibilityLabel: string
    error: string
    editable: boolean
    onSubmitEditing?: () => void
}

// The cell draws the input's error below it (LineText), and its gap stands in for the
// NumberInput's bottom margin.
const QUANTITY_WRAPPER = { className: 'gap-1' }

/**
 * A quantity: core NumberInput in text mode (the line keeps the text, which drives the
 * other cell), with no steppers, right aligned with tabular figures, its value selected on
 * focus, and Enter keeping the focus in the cell. The text keeps every decimal typed, so
 * the schema can refuse more than 2 with its own message.
 */
function QuantityInput({
    value,
    onChangeText,
    testID,
    accessibilityLabel,
    error,
    editable,
    onSubmitEditing,
}: QuantityInputProps) {
    return (
        <NumberInput
            value={value}
            onChangeText={onChangeText}
            error={error}
            hideError
            allowDecimal
            hideSteppers
            align="end"
            placeholder="0"
            testID={testID}
            accessibilityLabel={accessibilityLabel}
            disabled={!editable}
            onFocus={selectAll}
            onSubmitEditing={onSubmitEditing}
            keepFocusOnSubmit
            wrapperProps={QUANTITY_WRAPPER}
        />
    )
}

/**
 * New quantity: the view's text (`newQuantityTextOf`); typing it sets Change
 * (useAdjustmentForm). It waits until the item's On hand is known. "Quantity on hand goes
 * below zero." shows under it in the warning tone.
 */
export function NewQuantityCell({ index, view, actions, isDisabled }: LineCellProps) {
    const onChangeText = (text: string) => actions.setNewQuantity(index, text)
    const belowZero = view.isBelowZero ? INVENTORY_TEXTS.belowZero : ''
    return (
        <View className="min-w-0 gap-1">
            <QuantityInput
                value={view.newQuantityText}
                onChangeText={onChangeText}
                testID={lineCellId('new', index)}
                accessibilityLabel={`Line ${view.number} new quantity`}
                error={view.newQuantityError}
                editable={!isDisabled && view.isKnown}
            />
            <LineText
                message={view.newQuantityError}
                testID={lineCellId('new-error', index)}
                tone="danger"
            />
            <LineText message={belowZero} testID={lineCellId('below-zero', index)} tone="warning" />
        </View>
    )
}

/** Change: typing it sets New quantity. Enter adds a line after the last one while Value change is at cost. */
export function ChangeCell({ line, index, view, actions, isDisabled }: LineCellProps) {
    const onChangeText = (text: string) => actions.setChange(index, text)
    const onSubmitEditing = () => actions.submitChange(index)
    return (
        <View className="min-w-0 gap-1">
            <QuantityInput
                value={line.change}
                onChangeText={onChangeText}
                testID={lineCellId('change', index)}
                accessibilityLabel={`Line ${view.number} change`}
                error={view.changeError}
                editable={!isDisabled}
                onSubmitEditing={onSubmitEditing}
            />
            <LineText
                message={view.changeError}
                testID={lineCellId('change-error', index)}
                tone="danger"
            />
        </View>
    )
}

/**
 * Value change: Books MoneyTextField. A decrease shows "At cost" and takes no text; an
 * increase has the hint "Empty uses the last cost." while its text is empty; Enter in the
 * last line adds a line.
 */
export function ValueCell({ line, index, view, actions, isDisabled }: LineCellProps) {
    const isAtCost = view.mode === 'at-cost'
    const onChangeText = (text: string) => {
        if (!isAtCost) actions.setValue(index, text)
    }
    const onSubmitEditing = () => actions.submitValue(index)
    const onBlur = () => {}
    const shown = isAtCost ? INVENTORY_TEXTS.atCost : line.value
    // An empty Value change on an increase takes the last cost; a typed one (0.00 too) is the cost.
    const isEmptyCost = view.mode === 'cost' && line.value.trim() === ''
    const hint = isEmptyCost ? INVENTORY_TEXTS.lastCostHint : ''
    const signToggle = {
        testID: lineCellId('value-sign', index),
        accessibilityLabel: `Change sign for line ${view.number} value change`,
        isTabStop: false,
    }
    return (
        <View className="min-w-0 gap-1">
            <MoneyTextField
                value={shown}
                onChangeText={onChangeText}
                onBlur={onBlur}
                error={view.valueError}
                testID={lineCellId('value', index)}
                accessibilityLabel={`Line ${view.number} value change`}
                editable={!isDisabled && !isAtCost}
                signToggle={signToggle}
                selectsOnFocus
                keepsZero
                returnKeyType="next"
                onSubmitEditing={onSubmitEditing}
            />
            <LineText
                message={view.valueError}
                testID={lineCellId('value-error', index)}
                tone="danger"
            />
            <LineText message={hint} testID={lineCellId('value-hint', index)} tone="muted" />
        </View>
    )
}

type LineMenuItem = 'duplicate' | 'remove'

const MENU_ITEMS: readonly LineMenuItem[] = ['duplicate', 'remove']
const MENU_LABELS: Record<LineMenuItem, string> = { duplicate: 'Duplicate', remove: 'Remove' }
const MENU_WRITES: ReadonlySet<string> = new Set(MENU_ITEMS)
const MENU_DESTRUCTIVE: ReadonlySet<string> = new Set(['remove'])

/** The row menu: Duplicate (a copy after the line, with the focus on its Item) and Remove. */
export function LineMenu({ index, view, actions, isDisabled }: LineCellProps) {
    const testIds: Record<LineMenuItem, string> = {
        duplicate: lineCellId('menu-duplicate', index),
        remove: lineCellId('menu-remove', index),
    }
    const onSelect = (item: LineMenuItem) => {
        if (item === 'duplicate') actions.duplicate(index)
        else actions.remove(index)
    }
    return (
        <RecordRowMenu
            title={`Line ${view.number}`}
            triggerTestId={lineCellId('menu', index)}
            triggerLabel={`Line ${view.number} actions`}
            items={MENU_ITEMS}
            labels={MENU_LABELS}
            testIds={testIds}
            onSelect={onSelect}
            isWriting={isDisabled}
            writes={MENU_WRITES}
            destructive={MENU_DESTRUCTIVE}
        />
    )
}
