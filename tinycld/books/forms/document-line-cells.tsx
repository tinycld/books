import { eq, queryOnce } from '@tanstack/db'
import type { BuiltinFieldProps, TableCellContext } from '@tinycld/core/lib/forms/host-ui'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { iosInputCenteringStyle } from '@tinycld/core/ui/form/ios-input-style'
import { TABLE_INPUT_TEXT_INSET } from '@tinycld/core/ui/forms/fields/table-layout'
import { Switch } from '@tinycld/core/ui/switch'
import { newRecordId } from 'pbtsdb/core'
import { type ReactNode, useState } from 'react'
import { useFormContext, useFormState } from 'react-hook-form'
import {
    Platform,
    TextInput as RNTextInput,
    Text,
    type TextInputContentSizeChangeEvent,
    type TextInputFocusEvent,
    View,
    type ViewStyle,
} from 'react-native'
import {
    useDocumentFormScope,
    useDocumentLinesView,
} from '../components/documents/document-form-context'
import { ProductPicker } from '../components/products/ProductPicker'
import { useBundleLines } from '../hooks/useBundleLines'
import { useSelectAllOnFocus } from '../hooks/useSelectAllOnFocus'
import {
    type BundleItemFill,
    bundleLines,
    lineFromProduct,
    percentTaxableDefault,
} from '../lib/document-fills'
import { DOCUMENT_FOOTER_ROW, DOCUMENT_FOOTER_SPANS } from '../lib/document-footer-layout'
import type { LineAmountView } from '../lib/document-tax'
import { moneyInputCents, moneyInputText } from '../lib/money-input'
import type { BooksProducts } from '../types'

// A sales document host's line cells. Core draws each one inside the table's cell (the
// error under it) and hands it the cell's value and the row's table context.

// The amount text's width, shared by the line Amount cells and the totals under them, so
// the figures line up.
export const AMOUNT_COLUMN_WIDTH = 112

// Inset like an input's text, so the amount lines up with the prices above it, the
// column's header, and the totals under it (DocumentTotalsPanel).
export const AMOUNT_TEXT_STYLE = {
    minWidth: AMOUNT_COLUMN_WIDTH,
    paddingRight: TABLE_INPUT_TEXT_INSET,
}

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

// The line quantity a bundle's item quantities are multiplied by: the line's own when it
// is a quantity, else 1 (a new line has none yet).
function lineQuantityOf(row: TableRow): number {
    const quantity = row.quantity
    return typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0 ? quantity : 1
}

function isTableRow(value: unknown): value is TableRow {
    return typeof value === 'object' && value !== null && 'id' in value
}

// The row `id` as the form holds it now: a pick's reads are awaited, and the row can be
// moved or removed meanwhile, so its index from the pick's render is not used after them.
function currentRow(rows: unknown, id: string): TableRow | undefined {
    if (!Array.isArray(rows)) return undefined
    const list: unknown[] = rows
    return list.filter(isTableRow).find(row => row.id === id)
}

// The message a bundle pick leaves under the product cell (null clears it).
type NoteBundle = (message: string | null) => void

/**
 * A bundle picked on an Item line: the line shows the bundle while its items load (no
 * rate or description of an earlier pick, so its Amount is "—"), then the table replaces
 * it with one Item line per active item and a Subtotal line, and focus goes to the first
 * new line's Qty. A bundle with no active items, or a read that fails, leaves the line
 * with no product and says why under the cell. That message is a load result, not a
 * validation rule: it is the cell's own state, so a re-validation of the lines does not
 * replace it. Nothing is written when the row was removed during the read, or has had
 * another product picked since.
 */
function useBundlePick(fieldKey: string, noteBundle: NoteBundle) {
    const loadBundleLines = useBundleLines()
    const { getValues } = useFormContext()
    const { customer, currency, kind } = useDocumentFormScope()
    const isExempt = customer?.tax_exempt ?? false
    return async (table: TableCellContext, bundleId: string) => {
        const rowId = table.row.id
        table.onRowChange({ product: bundleId, rate: '', description: '' })
        const rowOfThisPick = () => {
            const row = currentRow(getValues(fieldKey), rowId)
            return row?.product === bundleId ? row : undefined
        }
        const refuse = (message: string) => {
            if (!rowOfThisPick()) return
            table.onRowChange({ product: '' })
            noteBundle(message)
        }
        let items: BundleItemFill[]
        try {
            items = await loadBundleLines(bundleId)
        } catch (error) {
            log.warn(`books.${kind.key}`, 'bundle pick could not read the bundle items', {
                bundle: bundleId,
                error: String(error),
            })
            refuse(kind.messages.bundleLoadFailed)
            return
        }
        const row = rowOfThisPick()
        if (!row) return
        const rows = bundleLines({
            items,
            lineQuantity: lineQuantityOf(row),
            isExempt,
            currency,
            newId: newRecordId,
        })
        const first = rows[0]
        if (!first) {
            refuse(kind.messages.bundleEmpty)
            return
        }
        table.replaceRow(rows, { rowId: first.id, columnKey: 'quantity' })
    }
}

/**
 * A product picked on a line: the line's cells are filled from the product, then focus
 * moves to the line's next cell (Description), so that cell shows the filled text from
 * its first line. A bundle on an Item line expands (useBundlePick).
 *
 * The picker's own query holds the products it offers, so the pick reads its product
 * from the store in the press handler, and the focus moves on the frame after the pick.
 * A focus move after a wait would take the focus from where the user went meanwhile (the
 * Message box) and put the next keys in Description. So a product the store no longer
 * holds, read from the server, fills the line and leaves the focus where it is.
 */
function useProductPick(props: BuiltinFieldProps, noteBundle: NoteBundle) {
    const [productsCollection] = useStore('books_products')
    const { customer, currency, kind } = useDocumentFormScope()
    const { getValues } = useFormContext()
    const { fieldKey, table, onChange } = props
    const pickBundle = useBundlePick(fieldKey, noteBundle)
    const isExempt = customer?.tax_exempt ?? false
    return async (id: string) => {
        if (!table) {
            onChange(id)
            return
        }
        // A new pick replaces the last pick's bundle message.
        noteBundle(null)
        const rowId = table.row.id
        const isRowThere = () => currentRow(getValues(fieldKey), rowId) !== undefined
        const held = productsCollection.get(id)
        try {
            const product =
                held ??
                (await queryOnce({
                    query: q =>
                        q
                            .from({ p: productsCollection })
                            .where(({ p }) => eq(p.id, id))
                            .findOne(),
                }))
            if (!product) throw new Error(`product ${id} not found`)
            if (product.type === 'bundle' && table.rowKind === 'item') {
                await pickBundle(table, id)
                return
            }
            if (!isRowThere()) return
            table.onRowChange(pickedCells(product, table, isExempt, currency))
        } catch (error) {
            // The id is still the pick; the row's other cells stay as they were.
            log.warn(`books.${kind.key}`, 'line product pick could not read the product', {
                product: id,
                error: String(error),
            })
            if (!isRowThere()) return
            table.onRowChange({ product: id })
        }
        if (held) table.focusNext()
    }
}

function BundleMessage({ message }: { message: string | null }) {
    if (!message) return null
    return <Text className="mt-1 text-xs text-danger">{message}</Text>
}

/**
 * Product or service: active Service, Non-inventory and Bundle products on an Item line,
 * Service and Non-inventory on a Percent line. A pick fills the line's other cells and
 * moves focus to the line's next cell; a bundle expands into its items (useBundlePick).
 */
export function LineProductCell(props: BuiltinFieldProps) {
    const { fieldKey, label, value, disabled, table } = props
    const [bundleMessage, setBundleMessage] = useState<string | null>(null)
    const pick = useProductPick(props, setBundleMessage)
    const types = table?.rowKind === 'percent' ? PERCENT_TYPES : ITEM_TYPES
    const onPick = (id: string) => {
        void pick(id)
    }
    return (
        <View>
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
            <BundleMessage message={bundleMessage} />
        </View>
    )
}

const LINE_HEIGHT = 20
const VERTICAL_PADDING = 20
const MAX_LINES = 3

// react-native-web reports the textarea's scrollHeight: its padding included, and never
// less than the box's inner height (the box less its 2 px of border). So on web the text
// takes whole lines of what is left, rounded down: the border's 2 px keep a box one line
// taller than its text from measuring as that taller box. Native reports the text alone,
// in fractional px, so it rounds up.
const IS_WEB = Platform.OS === 'web'

function clampHeight(contentHeight: number) {
    const textLines = IS_WEB
        ? Math.floor((contentHeight - VERTICAL_PADDING) / LINE_HEIGHT)
        : Math.ceil(contentHeight / LINE_HEIGHT)
    const lines = Math.min(MAX_LINES, Math.max(1, textLines))
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
// thousands separator is allowed), anything else null; `documentSchema` names what is
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
 * Each focus (Tab, or a pick that moves the focus here) selects the whole value, so
 * typing replaces it; Rate and Percent do the same.
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
    const selectAll = useSelectAllOnFocus(text)
    const onFocus = (event: TextInputFocusEvent) => {
        selectAll.onFocus(event)
        table?.noteFocus()
    }
    const onChangeText = (next: string) => {
        selectAll.onTyped()
        setDraft(next)
        onChange(quantityOf(next))
    }
    const onBlur = () => {
        selectAll.onBlur()
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
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyPress={selectAll.onKeyPress}
            onSubmitEditing={onSubmitEditing}
            editable={!disabled}
            selectTextOnFocus={selectAll.selectTextOnFocus}
            inputMode="decimal"
            keyboardType={NUMBER_KEYBOARD}
            autoCapitalize="none"
            autoCorrect={false}
            className={`${INPUT_CLASS} text-right tabular-nums`}
            style={iosInputCenteringStyle(16)}
        />
    )
}

// A rate that parses, written in the money format ("1250" → "1,250.00"); other text as is.
function groupedRateText(text: string, currency: string): string {
    const cents = moneyInputCents(text, currency)
    if (cents === null || text.trim() === '') return text
    return moneyInputText(cents) || '0.00'
}

// Whether the Rate cell has the focus, and whether the user has typed since it took it.
type RateFocus = 'blurred' | 'selected' | 'typing'

// The selection the Rate cell holds on native between a focus and the first key.
function rateSelection(focus: RateFocus, shown: string) {
    if (Platform.OS === 'web' || focus !== 'selected') return undefined
    return { start: 0, end: shown.length }
}

/**
 * Rate: the typed money text is the value (cents are computed at write). While the cell
 * is not focused it shows a rate that parses in the money format, whatever text a pick
 * or the user left ("1250.00" shows "1,250.00"); a blur also stores that text. Enter on
 * the last line adds a line.
 *
 * A focus selects the whole value, so typing replaces it. A focus swaps the drawn text
 * ("1,250.00" → "1250.00"): on web the cell selects again after that render
 * (useSelectAllOnFocus); on native setting the text can drop the selection the focus
 * made, so the cell holds the whole text selected until the user types or leaves.
 */
export function LineRateCell({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
    table,
}: BuiltinFieldProps) {
    const { currency } = useDocumentFormScope()
    const [focus, setFocus] = useState<RateFocus>('blurred')
    const text = textOf(value)
    const grouped = groupedRateText(text, currency)
    const shown = focus === 'blurred' ? grouped : text
    const selection = rateSelection(focus, shown)
    const selectAll = useSelectAllOnFocus(shown)
    const onFocus = (event: TextInputFocusEvent) => {
        selectAll.onFocus(event)
        setFocus('selected')
        table?.noteFocus()
    }
    const onBlur = () => {
        selectAll.onBlur()
        setFocus('blurred')
        table?.noteBlur()
        if (grouped !== text) onChange(grouped)
    }
    const onChangeText = (next: string) => {
        selectAll.onTyped()
        setFocus('typing')
        onChange(next)
    }
    const onSubmitEditing = () => table?.submitEditing()
    return (
        <RNTextInput
            ref={table?.focusRef}
            testID={cellTestId(fieldKey, table, 'rate')}
            accessibilityLabel={cellLabel(label, table)}
            value={shown}
            selection={selection}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyPress={selectAll.onKeyPress}
            onSubmitEditing={onSubmitEditing}
            editable={!disabled}
            selectTextOnFocus={selectAll.selectTextOnFocus}
            inputMode="decimal"
            keyboardType={NUMBER_KEYBOARD}
            autoCapitalize="none"
            autoCorrect={false}
            className={`${INPUT_CLASS} text-right`}
            style={iosInputCenteringStyle(16)}
        />
    )
}

function TargetError({ isVisible }: { isVisible: boolean }) {
    const { kind } = useDocumentFormScope()
    if (!isVisible) return null
    return <Text className="mt-1 text-xs text-danger">{kind.messages.percentTarget}</Text>
}

/**
 * Whether the percent cell shows "A percent line applies to the item or subtotal right
 * above it" itself. The form computes it on every change (`lineAmountViews`), so it shows
 * as soon as the line above stops being an Item or a Subtotal. Once a save has run the
 * schema, core draws the same issue as the cell's field error, so the cell then stays
 * silent and the message shows once.
 */
function useShowsTargetError(fieldKey: string, table: TableCellContext | undefined) {
    const { amounts } = useDocumentLinesView()
    const rowIndex = table?.rowIndex ?? -1
    const path = `${fieldKey}.${rowIndex}.percent`
    const { getFieldState } = useFormContext()
    const formState = useFormState({ name: path })
    const hasFieldError = getFieldState(path, formState).error !== undefined
    return amounts[rowIndex]?.kind === 'no-target' && !hasFieldError
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
    const showsTargetError = useShowsTargetError(fieldKey, table)
    const onSubmitEditing = () => table?.submitEditing()
    return (
        <View>
            <PercentInput
                fieldKey={fieldKey}
                label={label}
                value={value}
                onChange={onChange}
                disabled={disabled}
                table={table}
                muted={muted}
                onSubmitEditing={onSubmitEditing}
            />
            <TargetError isVisible={showsTargetError} />
        </View>
    )
}

function PercentInput({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
    table,
    muted,
    onSubmitEditing,
}: Pick<BuiltinFieldProps, 'fieldKey' | 'label' | 'value' | 'onChange' | 'disabled' | 'table'> & {
    muted: string
    onSubmitEditing: () => void
}) {
    const text = textOf(value)
    const selectAll = useSelectAllOnFocus(text)
    const onFocus = (event: TextInputFocusEvent) => {
        selectAll.onFocus(event)
        table?.noteFocus()
    }
    const onBlur = () => {
        selectAll.onBlur()
        table?.noteBlur()
    }
    const onChangeText = (next: string) => {
        selectAll.onTyped()
        onChange(next)
    }
    return (
        <View className="relative justify-center">
            <RNTextInput
                ref={table?.focusRef}
                testID={cellTestId(fieldKey, table, 'percent')}
                accessibilityLabel={cellLabel(label, table)}
                value={text}
                onChangeText={onChangeText}
                onFocus={onFocus}
                onBlur={onBlur}
                onKeyPress={selectAll.onKeyPress}
                onSubmitEditing={onSubmitEditing}
                editable={!disabled}
                selectTextOnFocus={selectAll.selectTextOnFocus}
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

const SUBTOTAL_LABEL = <Text className="text-base font-semibold text-foreground">Subtotal</Text>

/**
 * A Subtotal line on the wide grid: its one cell runs across every slot, so it lays the
 * slots out again (the footer's spans, document-footer-layout.ts) and draws the label and
 * the sum in the span that ends where the Amount slot ends, so the sum lines up under
 * the line amounts at every width.
 */
function GridSubtotal({ testID, amount }: { testID: string; amount: ReactNode }) {
    const { left, totals, right } = DOCUMENT_FOOTER_SPANS
    return (
        <View testID={testID} style={SUBTOTAL_GRID_ROW}>
            <View style={left} />
            <View style={totals} className="flex-row items-center justify-end gap-2">
                {SUBTOTAL_LABEL}
                {amount}
            </View>
            <View style={right} />
        </View>
    )
}

const SUBTOTAL_GRID_ROW: ViewStyle = { flexDirection: 'row', gap: DOCUMENT_FOOTER_ROW.gap }

// Amount: read only, this row's entry of the amounts the form computes once per change
// (`lineAmountViews`); "—" while the line's cells do not parse. A Subtotal line draws its
// label beside the sum, under the Amount column on the wide grid (GridSubtotal) and
// across the card on a phone.
export function LineAmountCell({ fieldKey, table }: BuiltinFieldProps) {
    const { amounts, isCards } = useDocumentLinesView()
    const view = amounts[table?.rowIndex ?? -1] ?? NO_VIEW
    const testID = cellTestId(fieldKey, table, 'amount')
    if (view.kind === 'none' || view.kind === 'no-target') return <View testID={testID} />
    const amount = (
        <Text
            className="py-2.5 text-right text-base text-foreground tabular-nums"
            style={AMOUNT_TEXT_STYLE}
        >
            {view.text}
        </Text>
    )
    if (view.kind === 'amount') return <View testID={testID}>{amount}</View>
    if (!isCards) return <GridSubtotal testID={testID} amount={amount} />
    return (
        <View testID={testID} className="flex-row items-center justify-between gap-2">
            {SUBTOTAL_LABEL}
            {amount}
        </View>
    )
}

// The Tax column's own label (lib/document-line-columns.ts), drawn on a card.
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
    const { isCards } = useDocumentLinesView()
    const onValueChange = (next: boolean) => onChange(next)
    // A grid cell centers the switch under core's centered toggle header.
    const layout = isCards ? 'justify-between gap-2' : 'justify-center'
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
