import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { Text, View } from 'react-native'
import { HostQuantityInput } from '../components/forms/HostQuantityInput'
import { SearchPicker, useSearchPicker } from '../components/SearchPicker'
import { useFormAccounts } from '../hooks/useFormAccounts'
import { textOf } from '../lib/form-values'
import {
    assetAccountOptions,
    assetAccountPlaceholder,
    cogsAccountOptions,
    cogsAccountPlaceholder,
} from '../lib/inventory-account-options'
import { NO_PREFERRED_VENDOR, preferredVendorLabel } from '../lib/preferred-vendor'
import { ASSET_ACCOUNT_FIXED } from '../lib/product-messages'
import { quantityOnHandText } from '../lib/quantity-input'
import { HostSelect } from './account-fields'
import { DayField, useVendorOptions, vendorPickerProps } from './document-fields'

// The `books:product` host components of an Inventory item (hosts.ts). The core cell
// draws each one's label and error.

// The server refuses a change of the asset account once a stock move names the item
// (server/product_stock.go). A new item (no recordId) has none.
function useItemHasStockMoves(productId: string | undefined) {
    const [movesCollection] = useStore('books_stock_moves')
    const { data } = useLiveQuery({
        query: q =>
            productId
                ? q
                      .from({ m: movesCollection })
                      .where(({ m }) => eq(m.product, productId))
                      .select(({ m }) => ({ id: m.id }))
                      .findOne()
                : null,
        queryKey: ['books.products.has-stock-moves', productId ?? ''],
    })
    return productId !== undefined && data !== undefined
}

function FixedNote({ isVisible, fieldKey }: { isVisible: boolean; fieldKey: string }) {
    if (!isVisible) return null
    return (
        <Text testID={`form-note-${fieldKey}`} className="mt-1 text-xs text-muted-foreground">
            {ASSET_ACCOUNT_FIXED}
        </Text>
    )
}

// The account the item's stock is worth in. A stored account that is not offered (it
// became inactive, or changed type) shows its name in the trigger; an untouched field is
// not dirty, so the save leaves it out of the patch. Once the item has stock moves the
// account is fixed, and the note under it says why.
export function AssetAccountField(props: BuiltinFieldProps) {
    const isFixed = useItemHasStockMoves(props.recordId)
    return (
        <View>
            <InventoryAccountSelect
                {...props}
                disabled={props.disabled || isFixed}
                optionsFor={assetAccountOptions}
                placeholderFor={assetAccountPlaceholder}
            />
            <FixedNote isVisible={isFixed} fieldKey={props.fieldKey} />
        </View>
    )
}

// The expense account of an Inventory item (productHostFor names this component in place
// of ExpenseAccountField): only the Cost of goods sold accounts, the one type the server
// takes for it.
export function CogsAccountField(props: BuiltinFieldProps) {
    return (
        <InventoryAccountSelect
            {...props}
            optionsFor={cogsAccountOptions}
            placeholderFor={cogsAccountPlaceholder}
        />
    )
}

type InventoryAccountSelectProps = BuiltinFieldProps & {
    optionsFor: typeof assetAccountOptions
    placeholderFor: (triggerLabel: string) => string
}

function InventoryAccountSelect({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
    optionsFor,
    placeholderFor,
}: InventoryAccountSelectProps) {
    const { accounts } = useFormAccounts()
    const { options, triggerLabel } = optionsFor(accounts, textOf(value))
    return (
        <HostSelect
            fieldKey={fieldKey}
            label={label}
            value={value}
            onChange={onChange}
            disabled={disabled}
            options={options}
            placeholder={placeholderFor(triggerLabel)}
        />
    )
}

// The chosen vendor by id, with its load error (useRecord has none): the trigger names
// it, an inactive one too, whether or not the picker's options hold it.
function useChosenVendor(id: string) {
    const [vendorsCollection] = useStore('books_vendors')
    const query = useLiveQuery({
        query: q =>
            id
                ? q
                      .from({ v: vendorsCollection })
                      .where(({ v }) => eq(v.id, id))
                      .select(({ v }) => ({
                          id: v.id,
                          display_name: v.display_name,
                          inactive: v.inactive,
                      }))
                      .findOne()
                : null,
        queryKey: ['books.products.preferred-vendor', id],
    })
    // A failed live query does not recover on a reload: clean it up and load it again.
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [vendorsCollection],
            onError: err => log.error('books.products.preferred-vendor', err),
        })
    }
    return { vendor: query.data, isLoading: query.isLoading, isError: query.isError, retry }
}

/**
 * Preferred vendor: a picker over the active vendors by name, with "No preferred
 * vendor" first. A stored vendor that is now inactive shows by name with "(inactive)".
 */
export function PreferredVendorField({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
}: BuiltinFieldProps) {
    const id = textOf(value)
    const picker = useSearchPicker()
    const options = useVendorOptions(picker.debouncedTerm, picker.isOpen, id)
    const chosen = useChosenVendor(id)
    const trigger = preferredVendorLabel(id, {
        vendor: chosen.vendor,
        isLoading: chosen.isLoading,
        isError: chosen.isError,
    })
    const shared = vendorPickerProps({
        picker,
        fieldKey,
        label,
        id,
        triggerLabel: trigger.label,
        disabled,
        options,
    })
    // The picker's failed state and Retry cover both reads: the options and the chosen vendor.
    const retryBoth = () => {
        options.retry()
        chosen.retry()
    }
    return (
        <SearchPicker
            {...shared}
            triggerSuffix={trigger.suffix}
            onChange={onChange}
            noneOption={{ label: NO_PREFERRED_VENDOR, testID: `form-input-${fieldKey}-none` }}
            loadFailed={options.loadFailed || chosen.isError}
            onRetry={retryBoth}
        />
    )
}

// Reorder point and Opening quantity: a number with at most 2 decimals.
export function QuantityField({ fieldKey, label, value, onChange, disabled }: BuiltinFieldProps) {
    return (
        <HostQuantityInput
            fieldKey={fieldKey}
            label={label}
            value={value}
            onChange={onChange}
            disabled={disabled}
        />
    )
}

// Quantity on hand: Books counts it from the posted transactions, so it is text, never
// an input, and the form never writes it. The engine gives it the stored item's value,
// which follows the item while the form is open (tests/e2e/inventory.spec.ts, "shows its
// stock live").
export function QuantityOnHandField({ fieldKey, value }: BuiltinFieldProps) {
    return (
        <Text testID={`form-input-${fieldKey}`} className="py-2 text-base text-foreground">
            {quantityOnHandText(value)}
        </Text>
    )
}

// The date the opening quantity and value are as of.
export function OpeningDateField(props: BuiltinFieldProps) {
    return <DayField {...props} />
}
