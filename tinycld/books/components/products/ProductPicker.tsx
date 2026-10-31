import { and, eq, inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { PRODUCT_PICKER_LIMIT, productPickerOptions } from '../../lib/product-list'
import { SearchPicker, useSearchPicker } from '../SearchPicker'

interface ProductPickerProps {
    value: string
    onChange: (id: string) => void
    disabled: boolean
    // The accessible name of the trigger, such as the table cell's column and row.
    label: string
    testID: string
}

// Active Service and Non-inventory products, the only ones a bundle may hold. pbtsdb
// pushes only `like` to PocketBase, never `ilike`, so the name and SKU search runs on
// the client (`productPickerOptions`), and the server limit applies only while not
// searching: a limit pushed during a search would cut matches before the filter sees
// them.
function usePickerProducts(isOpen: boolean, isSearching: boolean) {
    const [productsCollection] = useStore('books_products')
    const { data } = useLiveQuery({
        query: q => {
            if (!isOpen) return null
            const base = q
                .from({ p: productsCollection })
                .where(({ p }) =>
                    and(inArray(p.type, ['service', 'non_inventory']), eq(p.inactive, false))
                )
                .orderBy(({ p }) => p.name)
            return isSearching ? base : base.limit(PRODUCT_PICKER_LIMIT)
        },
        queryKey: ['books.products.picker', isOpen, isSearching],
    })
    return { products: data ?? [], productsCollection }
}

/**
 * The bundle item product picker: a searchable menu of active Service and
 * Non-inventory products, 50 at a time, searched by name or SKU. The trigger names the
 * chosen product, with "(inactive)" when it was made inactive after it was chosen.
 */
export function ProductPicker({ value, onChange, disabled, label, testID }: ProductPickerProps) {
    const picker = useSearchPicker()
    const isSearching = picker.debouncedTerm.trim() !== ''
    const { products, productsCollection } = usePickerProducts(picker.isOpen, isSearching)
    const { record } = useRecord(productsCollection, value)
    const options = productPickerOptions(products, picker.debouncedTerm).map(p => ({
        id: p.id,
        label: p.name,
    }))
    // A chosen product whose row is still loading shows an empty trigger, not the
    // placeholder, so an existing bundle's rows do not flash "Choose …" as they open.
    const chosenName = record?.name ?? ''
    const triggerLabel = value ? chosenName : 'Choose a product or service'
    const triggerSuffix = record?.inactive ? '(inactive)' : undefined
    const accessibilityLabel = `${label}: ${value ? chosenName : 'none'}`
    return (
        <SearchPicker
            picker={picker}
            title="Product or service"
            triggerLabel={triggerLabel}
            isPlaceholder={!value}
            triggerSuffix={triggerSuffix}
            triggerAccessibilityLabel={accessibilityLabel}
            triggerTestId={testID}
            disabled={disabled}
            searchPlaceholder="Search products and services"
            searchTestId={`${testID}-search`}
            options={options}
            optionTestIdPrefix={`${testID}-option`}
            value={value}
            onChange={onChange}
        />
    )
}
