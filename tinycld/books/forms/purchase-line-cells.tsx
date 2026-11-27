import { eq, queryOnce } from '@tanstack/db'
import type { BuiltinFieldProps, TableCellContext } from '@tinycld/core/lib/forms/host-ui'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRef } from 'react'
import { useFormContext } from 'react-hook-form'
import { Platform, Text, View } from 'react-native'
import {
    type DocumentFormScope,
    NO_ORDER_LINKS,
    useDocumentFormScope,
} from '../components/documents/document-form-context'
import { ProductPicker } from '../components/products/ProductPicker'
import { SearchPicker, useSearchPicker } from '../components/SearchPicker'
import { useFormAccounts } from '../hooks/useFormAccounts'
import { textOf } from '../lib/form-values'
import { centsToText } from '../lib/money-text'
import { PURCHASE_ITEM_TYPES } from '../lib/product-picker-types'
import {
    PURCHASE_ACCOUNT_EMPTY_TEXT,
    type PurchaseAccountOption,
    purchaseAccountOptions,
} from '../lib/purchase-pickers'
import type { BooksProducts } from '../types'
import {
    cellLabel,
    cellTestId,
    currentRow,
    LineAmountCell,
    LineDescriptionCell,
    MoneyTextCell,
} from './document-line-cells'

/**
 * Whether a line's Product or Account picker is read only (spec §3.8): a bill's line from
 * a purchase order (it names an order line, `po_line`), or an order's line that a bill
 * names (DocumentFormScope.orderLinks). The server keeps their product or account.
 */
function isOrderLinkedLine(table: TableCellContext | undefined, scope: DocumentFormScope) {
    if (!table) return false
    const poLine = table.row.po_line
    if (typeof poLine === 'string' && poLine !== '') return true
    const links = scope.orderLinks ?? NO_ORDER_LINKS
    return links.lines[table.row.id] !== undefined
}

// A bill's line cells (spec §3.4): the Account cell of an account line, the Product or
// service cell and the Amount of a product line, and the typed Amount of an account line.
// Description, Qty and Rate are the sales lines' cells (document-line-cells.tsx). Core
// draws each one inside the table's cell (the error under it) and hands it the cell's
// value and the row's table context.

// The options whose label holds the typed term, any case, in chart order.
function matchingAccountOptions(
    options: readonly PurchaseAccountOption[],
    term: string
): PurchaseAccountOption[] {
    const needle = term.trim().toLowerCase()
    if (needle === '') return [...options]
    return options.filter(option => option.label.toLowerCase().includes(needle))
}

// On web, whether the focused element took the focus from the keyboard, or by script
// right after a key, as the browser's `:focus-visible` says; after a pointer press it did
// not.
function isKeyboardFocus(): boolean {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return false
    return document.activeElement?.matches(':focus-visible') ?? false
}

/**
 * Whether a line's first-cell picker opens as it takes the focus: only the first time, on
 * web, from the keyboard, for an empty cell of a line added in this form session (its id
 * is not among the table's starting rows, the form's default values). A line added from
 * the keys (Enter in the last line's Amount or Rate, ⌥↵, ⌥P) so opens its picker for
 * typing, and Escape closes the picker, not the form. A line added by a click on its add
 * button only focuses the picker (the next click opens it), as does a Tab into a stored
 * line or back into an added one.
 */
function useOpensWhenAdded(
    fieldKey: string,
    table: TableCellContext | undefined,
    isEmpty: boolean
) {
    const { formState } = useFormContext()
    const hasFocused = useRef(false)
    return () => {
        if (hasFocused.current) return false
        hasFocused.current = true
        if (!table || !isEmpty || !isKeyboardFocus()) return false
        const start = formState.defaultValues?.[fieldKey]
        const startRows: unknown[] = Array.isArray(start) ? start : []
        return !startRows.some(row => isRowWithId(row, table.row.id))
    }
}

function isRowWithId(row: unknown, id: string): boolean {
    return typeof row === 'object' && row !== null && 'id' in row && row.id === id
}

type FormAccounts = ReturnType<typeof useFormAccounts>

// The trigger's text: the placeholder with no value; `…` while the chart loads; "Unknown
// account" when its read failed or the account no longer exists (the id is kept).
function accountTriggerLabel(
    id: string,
    chosen: PurchaseAccountOption | undefined,
    accounts: FormAccounts
): string {
    if (!id) return 'Choose an account'
    if (chosen) return chosen.label
    if (!accounts.isReady && !accounts.isError) return '…'
    return 'Unknown account'
}

/**
 * Account: a picker over the active accounts an account line may charge (expense, other
 * expense, cost of goods sold), in chart order, indented by depth, "<number> <name>"
 * (purchaseAccountOptions). A stored account the list no longer offers shows, marked
 * "(inactive)" when it is. The chart is the form's one accounts query (useFormAccounts):
 * while it loads the menu says so; a failed load shows Retry in the menu. A pick moves
 * focus to the line's next cell. Read only on a line a purchase order links
 * (isOrderLinkedLine).
 */
export function LineAccountCell({
    fieldKey,
    label,
    value,
    onChange,
    disabled: isFormDisabled,
    table,
}: BuiltinFieldProps) {
    const scope = useDocumentFormScope()
    const disabled = isFormDisabled || isOrderLinkedLine(table, scope)
    const id = textOf(value)
    const picker = useSearchPicker()
    const accounts = useFormAccounts()
    const all = purchaseAccountOptions(accounts.accounts, id)
    const options = matchingAccountOptions(all, picker.debouncedTerm)
    const chosen = all.find(option => option.id === id)
    const triggerLabel = accountTriggerLabel(id, chosen, accounts)
    const testID = cellTestId(fieldKey, table, 'account')
    const accessibilityLabel = `${cellLabel(label, table)}: ${id ? triggerLabel : 'none'}`
    const isLoading = picker.isOpen && !accounts.isReady && !accounts.isError
    const onPick = (next: string) => onChange(next)
    const onPicked = () => table?.focusNext()
    const opensOnFocus = useOpensWhenAdded(fieldKey, table, id === '')
    const onTriggerFocus = () => {
        table?.noteFocus()
        if (opensOnFocus()) picker.onOpenChange(true)
    }
    return (
        <SearchPicker
            picker={picker}
            title="Account"
            triggerLabel={triggerLabel}
            isPlaceholder={!id}
            triggerAccessibilityLabel={accessibilityLabel}
            triggerTestId={testID}
            disabled={disabled}
            searchPlaceholder="Search accounts"
            searchTestId={`${testID}-search`}
            options={options}
            optionTestIdPrefix={`${testID}-option`}
            value={id}
            onChange={onPick}
            isLoading={isLoading}
            loadFailed={accounts.isError}
            onRetry={accounts.retry}
            emptyText={PURCHASE_ACCOUNT_EMPTY_TEXT}
            triggerRef={table?.focusRef}
            onTriggerFocus={onTriggerFocus}
            onTriggerBlur={table?.noteBlur}
            onPicked={onPicked}
        />
    )
}

type PurchaseProduct = Pick<BooksProducts, 'id' | 'purchase_description' | 'cost'>

function isBlank(value: unknown): boolean {
    return textOf(value).trim() === ''
}

function hasQuantity(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
}

// The cells a product pick sets on a product line: the product, and its purchase
// description, its cost and a quantity of 1 only into a Description, Rate or Qty the user
// left empty (a sales pick sets the same quantity, lineFromProduct). The rate is plain
// money text with no grouping, as the sales pick writes it.
function purchasePickCells(product: PurchaseProduct, row: TableRow): Record<string, unknown> {
    const cells: Record<string, unknown> = { product: product.id }
    if (isBlank(row.description)) cells.description = product.purchase_description
    if (isBlank(row.rate)) cells.rate = centsToText(product.cost).replace(/,/g, '')
    if (!hasQuantity(row.quantity)) cells.quantity = 1
    return cells
}

/**
 * A product picked on a product line fills the line (purchasePickCells), then moves focus
 * to the line's next cell (Description). The picker's own query holds the products it
 * offers, so the pick reads its product from the store in the press handler, and the
 * focus moves on the frame after the pick. A product the store no longer holds is read
 * from the server; that pick fills the line and leaves the focus where the user put it
 * meanwhile. A read that fails keeps the picked id and leaves the other cells.
 */
function usePurchaseProductPick({ fieldKey, onChange, table }: BuiltinFieldProps) {
    const [productsCollection] = useStore('books_products')
    const { kind } = useDocumentFormScope()
    const { getValues } = useFormContext()
    return async (id: string) => {
        if (!table) {
            onChange(id)
            return
        }
        const rowId = table.row.id
        const rowNow = () => currentRow(getValues(fieldKey), rowId)
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
            const row = rowNow()
            if (!row) return
            table.onRowChange(purchasePickCells(product, row))
        } catch (error) {
            log.warn(`books.${kind.key}`, 'line product pick could not read the product', {
                product: id,
                error: String(error),
            })
            if (!rowNow()) return
            table.onRowChange({ product: id })
        }
        if (held) table.focusNext()
    }
}

/**
 * Product or service on a product line: active Service and Non-inventory products with
 * "I purchase this" on (ProductPicker, purpose 'purchases'). A pick fills an empty
 * Description with the purchase description and an empty Rate with the cost, then moves
 * focus to Description. Read only on a line a purchase order links (isOrderLinkedLine).
 */
export function LinePurchaseProductCell(props: BuiltinFieldProps) {
    const { fieldKey, label, value, table } = props
    const pick = usePurchaseProductPick(props)
    const onPick = (id: string) => {
        void pick(id)
    }
    const id = textOf(value)
    const opensOnFocus = useOpensWhenAdded(fieldKey, table, id === '')
    // The kind says whether its line names the Vendor part no. (a purchase order's, spec Q17).
    const scope = useDocumentFormScope()
    const showsPartNo = scope.kind.showsVendorPartNo
    const disabled = props.disabled || isOrderLinkedLine(table, scope)
    return (
        <ProductPicker
            showsPartNo={showsPartNo}
            purpose="purchases"
            types={PURCHASE_ITEM_TYPES}
            value={id}
            onChange={onPick}
            disabled={disabled}
            label={cellLabel(label, table)}
            testID={cellTestId(fieldKey, table, 'product')}
            triggerRef={table?.focusRef}
            onFocus={table?.noteFocus}
            onBlur={table?.noteBlur}
            opensOnFocus={opensOnFocus}
        />
    )
}

function LinkedLineText({ text }: { text: string | undefined }) {
    if (!text) return null
    return <Text className="mt-1 text-xs text-muted-foreground">{text}</Text>
}

/**
 * Description of a purchase line: the lines' Description cell (LineDescriptionCell), and
 * under it, on a purchase order's line that a bill names, what its posted bills received
 * ("Received 4 of 10") or billed ("Billed $120.00 of $300.00"; OrderFormLinks.lines).
 */
export function LinePurchaseDescriptionCell(props: BuiltinFieldProps) {
    const { orderLinks } = useDocumentFormScope()
    const rowId = props.table?.row.id ?? ''
    const text = (orderLinks ?? NO_ORDER_LINKS).lines[rowId]
    return (
        <View>
            <LineDescriptionCell {...props} />
            <LinkedLineText text={text} />
        </View>
    )
}

// Amount of an account line: typed money text, which may be negative (a credit on the
// bill); the bill's schema refuses 0. Enter on the last line adds an account line.
export function LineTypedAmountCell(props: BuiltinFieldProps) {
    return <MoneyTextCell {...props} column="amount" />
}

// Amount of a product line: read only, Qty × Rate as the form computes it once per change
// (`lineAmountViews`, the sales lines' Amount cell); the server writes it.
export function LineItemAmountCell(props: BuiltinFieldProps) {
    return <LineAmountCell {...props} />
}
