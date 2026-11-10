import { eq, queryOnce } from '@tanstack/db'
import type { BuiltinFieldProps, TableCellContext } from '@tinycld/core/lib/forms/host-ui'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { iosInputCenteringStyle } from '@tinycld/core/ui/form/ios-input-style'
import { Switch } from '@tinycld/core/ui/switch'
import { useState } from 'react'
import {
    Platform,
    TextInput as RNTextInput,
    Text,
    type TextInputContentSizeChangeEvent,
    type TextInputFocusEvent,
    View,
} from 'react-native'
import {
    useInvoiceFormScope,
    useInvoiceLinesView,
} from '../components/invoices/invoice-form-context'
import { ProductPicker } from '../components/products/ProductPicker'
import { lineFromProduct, percentTaxableDefault } from '../lib/invoice-fills'
import type { LineAmountView } from '../lib/invoice-tax'
import { moneyInputCents, moneyInputText } from '../lib/money-input'
import type { BooksProducts } from '../types'

// The `books:invoice` host's line cells. Core draws each one inside the table's cell
// (the error under it) and hands it the cell's value and the row's table context.

// The amount text's width, shared by the line Amount cells and the totals under them, so
// the figures line up.
export const AMOUNT_COLUMN_WIDTH = 112

const ITEM_TYPES: readonly BooksProducts['type'][] = ['service', 'non_inventory', 'bundle']
const PERCENT_TYPES: readonly BooksProducts['type'][] = ['service', 'non_inventory']

// Typed text keeps the keyboard's punctuation on native (a minus sign, a decimal point).
const NUMBER_KEYBOARD = Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'

const INPUT_CLASS =
    'min-h-11 min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground'

function textOf(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function cellTestId(fieldKey: string, table: TableCellContext | undefined, column: string) {
    return `form-table-${fieldKey}-${table?.row.id ?? 'none'}-${column}`
}

function cellLabel(label: string, table: TableCellContext | undefined) {
    return `${label}, line ${(table?.rowIndex ?? 0) + 1}`
}

// The cells a product pick sets: an Item line takes the product's description, price,
// a quantity of 1 and its taxable flag; a Percent line takes the description and the
// taxable default of the line above.
function pickedCells(
    product: Pick<BooksProducts, 'id' | 'sales_description' | 'price' | 'taxable'>,
    table: TableCellContext,
    isExempt: boolean,
    currency: string
): Record<string, unknown> {
    const cells = lineFromProduct(product, isExempt, currency)
    if (table.rowKind !== 'percent') return cells
    return {
        product: cells.product,
        description: cells.description,
        taxable: percentTaxableDefault(table.rowsAbove) && !isExempt,
    }
}

function useProductPick(props: BuiltinFieldProps) {
    const [productsCollection] = useStore('books_products')
    const { customer, currency } = useInvoiceFormScope()
    const isExempt = customer?.tax_exempt ?? false
    const { table, onChange } = props
    return async (id: string) => {
        if (!table) {
            onChange(id)
            return
        }
        try {
            const product = await queryOnce(q =>
                q
                    .from({ p: productsCollection })
                    .where(({ p }) => eq(p.id, id))
                    .findOne()
            )
            if (!product) throw new Error(`product ${id} not found`)
            // A bundle sets the product only; the server refuses it at save until the
            // bundle expands into its lines (checkpoint 4).
            if (product.type === 'bundle') onChange(id)
            else table.onRowChange(pickedCells(product, table, isExempt, currency))
        } catch (error) {
            // The id is still the pick; the row's other cells stay as they were.
            log.warn('books.invoice', 'line product pick could not read the product', {
                product: id,
                error: String(error),
            })
            onChange(id)
        }
        table.focusNext()
    }
}

/**
 * Product or service: active Service, Non-inventory and Bundle products on an Item line,
 * Service and Non-inventory on a Percent line. A pick fills the line's other cells.
 */
export function LineProductCell(props: BuiltinFieldProps) {
    const { fieldKey, label, value, disabled, table } = props
    const pick = useProductPick(props)
    const types = table?.rowKind === 'percent' ? PERCENT_TYPES : ITEM_TYPES
    const onPick = (id: string) => {
        void pick(id)
    }
    return (
        <ProductPicker
            value={textOf(value)}
            onChange={onPick}
            disabled={disabled}
            label={cellLabel(label, table)}
            testID={cellTestId(fieldKey, table, 'product')}
            types={types}
            triggerRef={table?.focusRef}
            onFocus={table?.noteFocus}
            onBlur={table?.noteBlur}
        />
    )
}

const LINE_HEIGHT = 20
const VERTICAL_PADDING = 20
const MAX_LINES = 3

function clampHeight(contentHeight: number) {
    const lines = Math.min(MAX_LINES, Math.max(1, Math.ceil(contentHeight / LINE_HEIGHT)))
    return lines * LINE_HEIGHT + VERTICAL_PADDING
}

// On web, the blurred textarea itself scrolls back to its first line. The node stays, so
// focus that a closing dialog or the window gives back still finds it.
function scrollWebInputToTop(event: TextInputFocusEvent) {
    if (Platform.OS !== 'web') return
    const node: unknown = event.target
    if (typeof HTMLElement !== 'undefined' && node instanceof HTMLElement) node.scrollTop = 0
}

/**
 * Which input the description cell draws. A multiline input keeps its scroll offset
 * after it loses focus (the caret scrolled it to the end). On native, React Native has no
 * call that scrolls a text input back, so the cell draws a new input, which opens at its
 * first line, each time focus leaves it; on web the blur scrolls the same textarea back
 * instead, because a removed node cannot take focus back. On both, the cell draws a new
 * input when its text is set from elsewhere (a product pick) while it does not have focus.
 * A focused cell keeps its input, and scrolls as the user types.
 */
function useDescriptionMount(text: string, table: TableCellContext | undefined) {
    const [isFocused, setIsFocused] = useState(false)
    const [mount, setMount] = useState({ count: 0, text })
    if (!isFocused && mount.text !== text) setMount({ count: mount.count + 1, text })
    const onFocus = () => {
        setIsFocused(true)
        table?.noteFocus()
    }
    const onBlur = (event: TextInputFocusEvent) => {
        setIsFocused(false)
        scrollWebInputToTop(event)
        // The text typed while focused is the mount's text now, so it does not count as
        // a text set from elsewhere.
        const count = Platform.OS === 'web' ? mount.count : mount.count + 1
        setMount({ count, text })
        table?.noteBlur()
    }
    return { key: `mount-${mount.count}`, onFocus, onBlur }
}

// Description: one line high, growing with its text to at most 3 lines.
export function LineDescriptionCell({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
    table,
}: BuiltinFieldProps) {
    const text = textOf(value)
    const [height, setHeight] = useState(clampHeight(LINE_HEIGHT))
    const mount = useDescriptionMount(text, table)
    const onContentSizeChange = (event: TextInputContentSizeChangeEvent) =>
        setHeight(clampHeight(event.nativeEvent.contentSize.height))
    return (
        <RNTextInput
            key={mount.key}
            ref={table?.focusRef}
            testID={cellTestId(fieldKey, table, 'description')}
            accessibilityLabel={cellLabel(label, table)}
            value={text}
            onChangeText={onChange}
            onFocus={mount.onFocus}
            onBlur={mount.onBlur}
            editable={!disabled}
            multiline
            onContentSizeChange={onContentSizeChange}
            className={INPUT_CLASS}
            style={{ height, lineHeight: LINE_HEIGHT }}
        />
    )
}

// The quantity typed in a cell: blank is null, a typed number is that number (a comma
// thousands separator is allowed), anything else null; `invoiceSchema` names what is
// wrong with it.
function quantityOf(text: string): number | null {
    const plain = text.trim().replace(/,/g, '')
    if (plain === '') return null
    const quantity = Number(plain)
    return Number.isFinite(quantity) ? quantity : null
}

function quantityText(value: number | null): string {
    return value === null ? '' : String(value)
}

/**
 * Qty: a compact numeric input with no stepper, right-aligned. The value stays a number
 * (blank is null), so the schema and the totals read it as a number. While the user
 * types, the cell keeps the typed text ("1." on the way to "1.5"); once the value moves
 * from elsewhere (a product pick sets 1) or the cell loses focus, it shows the number.
 */
export function LineQuantityCell({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
    table,
}: BuiltinFieldProps) {
    // The text being typed: local to this one input while it has the focus.
    const [draft, setDraft] = useState<string | null>(null)
    const current = typeof value === 'number' && Number.isFinite(value) ? value : null
    const isDraftShown = draft !== null && quantityOf(draft) === current
    const text = isDraftShown ? draft : quantityText(current)
    const onChangeText = (next: string) => {
        setDraft(next)
        onChange(quantityOf(next))
    }
    const onBlur = () => {
        setDraft(null)
        table?.noteBlur()
    }
    const onSubmitEditing = () => table?.submitEditing()
    return (
        <RNTextInput
            ref={table?.focusRef}
            testID={cellTestId(fieldKey, table, 'quantity')}
            accessibilityLabel={cellLabel(label, table)}
            value={text}
            onChangeText={onChangeText}
            onFocus={table?.noteFocus}
            onBlur={onBlur}
            onSubmitEditing={onSubmitEditing}
            editable={!disabled}
            inputMode="decimal"
            keyboardType={NUMBER_KEYBOARD}
            autoCapitalize="none"
            autoCorrect={false}
            className={`${INPUT_CLASS} text-right tabular-nums`}
            style={iosInputCenteringStyle(16)}
        />
    )
}

// Rate: the typed money text is the value (cents are computed at write); a rate that
// parses is reformatted on blur ("450" → "450.00"). Enter on the last line adds a line.
export function LineRateCell({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
    table,
}: BuiltinFieldProps) {
    const { currency } = useInvoiceFormScope()
    const text = textOf(value)
    const onBlur = () => {
        table?.noteBlur()
        const cents = moneyInputCents(text, currency)
        if (cents !== null && text.trim() !== '') onChange(moneyInputText(cents) || '0.00')
    }
    const onSubmitEditing = () => table?.submitEditing()
    return (
        <RNTextInput
            ref={table?.focusRef}
            testID={cellTestId(fieldKey, table, 'rate')}
            accessibilityLabel={cellLabel(label, table)}
            value={text}
            onChangeText={onChange}
            onFocus={table?.noteFocus}
            onBlur={onBlur}
            onSubmitEditing={onSubmitEditing}
            editable={!disabled}
            inputMode="decimal"
            keyboardType={NUMBER_KEYBOARD}
            autoCapitalize="none"
            autoCorrect={false}
            className={`${INPUT_CLASS} text-right`}
            style={iosInputCenteringStyle(16)}
        />
    )
}

// Percent: the typed percent text (ppm is computed at write), with a "%" drawn over the
// input's right edge.
export function LinePercentCell({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
    table,
}: BuiltinFieldProps) {
    const muted = useThemeColor('muted-foreground')
    const onSubmitEditing = () => table?.submitEditing()
    return (
        <View className="relative justify-center">
            <RNTextInput
                ref={table?.focusRef}
                testID={cellTestId(fieldKey, table, 'percent')}
                accessibilityLabel={cellLabel(label, table)}
                value={textOf(value)}
                onChangeText={onChange}
                onFocus={table?.noteFocus}
                onBlur={table?.noteBlur}
                onSubmitEditing={onSubmitEditing}
                editable={!disabled}
                inputMode="decimal"
                keyboardType={NUMBER_KEYBOARD}
                autoCapitalize="none"
                autoCorrect={false}
                className={`${INPUT_CLASS} pr-8 text-right`}
                style={iosInputCenteringStyle(16)}
            />
            <Text
                pointerEvents="none"
                style={{ color: muted }}
                className="absolute right-3 text-base"
            >
                %
            </Text>
        </View>
    )
}

const NO_VIEW: LineAmountView = { kind: 'none' }

// Amount: read only, this row's entry of the amounts the form computes once per change
// (`lineAmountViews`); "—" while the line's cells do not parse. A Subtotal line draws its
// label at the left and the sum at the right.
export function LineAmountCell({ fieldKey, table }: BuiltinFieldProps) {
    const { amounts } = useInvoiceLinesView()
    const view = amounts[table?.rowIndex ?? -1] ?? NO_VIEW
    const testID = cellTestId(fieldKey, table, 'amount')
    if (view.kind === 'none') return <View testID={testID} />
    const amount = (
        <Text
            className="py-2.5 text-right text-base text-foreground tabular-nums"
            style={{ minWidth: AMOUNT_COLUMN_WIDTH }}
        >
            {view.text}
        </Text>
    )
    if (view.kind === 'amount') return <View testID={testID}>{amount}</View>
    return (
        <View testID={testID} className="flex-row items-center justify-between gap-2">
            <Text className="text-base font-semibold text-foreground">Subtotal</Text>
            {amount}
        </View>
    )
}

// The Tax column's own label (lib/invoice-lines.ts), drawn on a card.
const TAXABLE_LABEL = 'Tax'

function TaxableLabel({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className="text-sm font-semibold text-foreground">{TAXABLE_LABEL}</Text>
}

/**
 * Tax: the line's taxable switch. On the wide grid the column header names it; on a
 * phone card, where core draws no label for a switch column, the cell draws "Tax" beside
 * the switch itself.
 */
export function LineTaxableCell({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
    table,
}: BuiltinFieldProps) {
    const { isCards } = useInvoiceLinesView()
    const onValueChange = (next: boolean) => onChange(next)
    const layout = isCards ? 'justify-between gap-2' : ''
    return (
        <View
            testID={cellTestId(fieldKey, table, 'taxable')}
            className={`min-h-11 flex-row items-center ${layout}`}
        >
            <TaxableLabel isVisible={isCards} />
            <Switch
                ref={table?.focusRef}
                value={value === true}
                onValueChange={onValueChange}
                disabled={disabled}
                onFocus={table?.noteFocus}
                onBlur={table?.noteBlur}
                accessibilityLabel={cellLabel(label, table)}
            />
        </View>
    )
}
