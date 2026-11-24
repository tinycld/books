import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { Text } from 'react-native'
import { HostQuantityInput } from '../components/forms/HostQuantityInput'
import { SearchPicker, useSearchPicker } from '../components/SearchPicker'
import { useFormAccounts } from '../hooks/useFormAccounts'
import { textOf } from '../lib/form-values'
import { assetAccountOptions, assetAccountPlaceholder } from '../lib/inventory-account-options'
import { NO_PREFERRED_VENDOR, preferredVendorLabel } from '../lib/preferred-vendor'
import { quantityOnHandText } from '../lib/quantity-input'
import { HostSelect } from './account-fields'
import { DayField, useVendorOptions } from './document-fields'

// The `books:product` host components of an Inventory item (hosts.ts). The core cell
// draws each one's label and error.

// The account the item's stock is worth in. A stored account that is not offered (it
// became inactive, or changed type) shows its name in the trigger; an untouched field is
// not dirty, so the save leaves it out of the patch.
export function AssetAccountField({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
}: BuiltinFieldProps) {
    const { accounts } = useFormAccounts()
    const { options, triggerLabel } = assetAccountOptions(accounts, textOf(value))
    return (
        <HostSelect
            fieldKey={fieldKey}
            label={label}
            value={value}
            onChange={onChange}
            disabled={disabled}
            options={options}
            placeholder={assetAccountPlaceholder(triggerLabel)}
        />
    )
}

// The chosen vendor by id, with its load error (useRecord has none): the trigger names
// it, an inactive one too, whether or not the picker's options hold it.
function useChosenVendor(id: string) {
    const [vendorsCollection] = useStore('books_vendors')
    return useLiveQuery({
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
        vendor: chosen.data,
        isLoading: chosen.isLoading,
        isError: chosen.isError,
    })
    return (
        <SearchPicker
            picker={picker}
            title={label}
            triggerLabel={trigger.label}
            isPlaceholder={!id}
            triggerSuffix={trigger.suffix}
            triggerAccessibilityLabel={`${label}: ${id ? trigger.label : 'none'}`}
            triggerTestId={`form-input-${fieldKey}`}
            disabled={disabled}
            searchPlaceholder="Search vendors"
            searchTestId={`form-input-${fieldKey}-search`}
            options={options.options}
            optionTestIdPrefix={`form-input-${fieldKey}-option`}
            value={id}
            onChange={onChange}
            noneOption={{ label: NO_PREFERRED_VENDOR, testID: `form-input-${fieldKey}-none` }}
            isLoading={options.isLoading}
            loadFailed={options.loadFailed}
            onRetry={options.retry}
            emptyText={options.emptyText}
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
// an input, and the form never writes it.
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
